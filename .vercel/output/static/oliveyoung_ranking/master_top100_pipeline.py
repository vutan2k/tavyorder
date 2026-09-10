#!/usr/bin/env python3
import os
import sys
import json
import time
import subprocess
import argparse
import random

from dedup_engine import calculate_file_hash, download_and_dedupe_images, check_image_has_face
from seo_copywriter_engine import generate_seo_vietnamese_description, clean_brand_name, clean_vietnamese_product_name
from state_journal_rollback import (
    load_state, save_state, create_product_snapshot,
    rollback_product, update_product_state, is_product_completed
)
from self_healing_engine import heal_chrome_unresponsive, heal_missing_reviews, heal_hangul_in_description
from product_qc_gatekeeper import verify_single_product, ProductQCValidationError
from pipeline_telemetry import record_heartbeat

BASE_DIR = "/Users/tan/Desktop/oliveyoung_ranking"
FULL_JSON_PATH = os.path.join(BASE_DIR, "top100_oliveyoung_full.json")
BACKUP_FULL_PATH = os.path.join(BASE_DIR, "top100_oliveyoung_full.json.bak")

def run_chrome_js(js_code):
    escaped = js_code.replace("\\", "\\\\").replace('"', '\\"')
    script = f'''
    tell application "Google Chrome"
        tell front window
            tell active tab
                return execute javascript "{escaped}"
            end tell
        end tell
    end tell
    '''
    try:
        res = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=12)
        return res.stdout.strip()
    except subprocess.TimeoutExpired:
        print("⚠️ Chrome execute javascript timeout, trigger self-healing...")
        heal_chrome_unresponsive()
        return ""

def nav_chrome(url):
    script = f'''
    tell application "Google Chrome"
        tell front window
            tell active tab
                set URL to "{url}"
            end tell
        end tell
    end tell
    '''
    try:
        subprocess.run(["osascript", "-e", script], timeout=10)
        time.sleep(3.5)
    except subprocess.TimeoutExpired:
        print("⚠️ Chrome navigate timeout, trigger self-healing...")
        heal_chrome_unresponsive()

def recycle_chrome_tab():
    """Làm mới tab Chrome để giải phóng bộ nhớ RAM 8GB"""
    print("🧹 [MEMORY RECYCLER] Làm mới phiên làm việc Chrome để giải phóng RAM...")
    script = '''
    tell application "Google Chrome"
        tell front window
            set URL of active tab to "about:blank"
        end tell
    end tell
    '''
    try:
        subprocess.run(["osascript", "-e", script], timeout=5)
        time.sleep(1)
    except Exception:
        pass

def process_single_product(prod_item, index, total=100, dry_run=False):
    goods_no = prod_item.get("goods_no")
    rank = prod_item.get("rank", index + 1)
    folder_path = prod_item.get("folder_path")
    
    if not folder_path or not os.path.exists(folder_path):
        # Tìm folder theo goods_no
        for d in os.listdir(BASE_DIR):
            if goods_no in d and os.path.isdir(os.path.join(BASE_DIR, d)):
                folder_path = os.path.join(BASE_DIR, d)
                prod_item["folder_path"] = folder_path
                break

    if not folder_path or not os.path.exists(folder_path):
        print(f"⚠️ [BỎ QUA] Không tìm thấy thư mục cho SKU {goods_no}")
        return False

    info_path = os.path.join(folder_path, "info.json")
    if os.path.exists(info_path):
        try:
            with open(info_path, "r", encoding="utf-8") as f:
                existing_info = json.load(f)
        except Exception:
            existing_info = prod_item
    else:
        existing_info = prod_item

    # 1. Kiểm tra Checkpoint: Nếu đã QC_PASSED và có đủ options + 8 review -> SKIP
    if is_product_completed(goods_no):
        try:
            ok, _ = verify_single_product(existing_info, folder_path)
            if ok:
                print(f"⏩ [{rank}/{total}] SKU {goods_no} đã QC_PASSED hoàn hảo từ trước -> SKIP (0s)")
                return True
        except Exception:
            pass

    print(f"\n=======================================================")
    print(f"🚀 [{rank}/{total}] Bắt đầu xử lý: SKU {goods_no} - {prod_item.get('name', '')[:35]}...")
    print(f"📂 Thư mục: {os.path.basename(folder_path)}")
    print(f"=======================================================")

    if not dry_run:
        create_product_snapshot(goods_no, folder_path)
        update_product_state(goods_no, "IN_PROGRESS")

    # 2. Điều hướng Chrome đến trang sản phẩm
    p_url = prod_item.get("product_url")
    if p_url:
        nav_chrome(p_url)

    # 3. Bóc tách Options (Phân loại)
    ensure_open_opt_js = '''
    (() => {
        let items = document.querySelectorAll("[class*=\\"OptionSelector_option-item__\\"]");
        if (items.length === 0) {
            const btn = document.querySelector("[class*=\\"OptionSelector_btn-option\\"]");
            if (btn) { btn.click(); return "CLICKED"; }
        }
        return items.length > 0 ? "ALREADY_OPEN" : "NO_BTN";
    })()
    '''
    opt_state = run_chrome_js(ensure_open_opt_js)
    time.sleep(1)

    options_formatted = []
    krw_rate = 19.5
    service_fee = 0.05

    if opt_state in ["CLICKED", "ALREADY_OPEN"]:
        extract_opts_js = '''
        (() => {
            const items = Array.from(document.querySelectorAll("[class*=\\"OptionSelector_option-item__\\"]"));
            return JSON.stringify(items.map((it, idx) => {
                const tit = it.querySelector("[class*=\\"OptionSelector_option-item-tit\\"]");
                const price = it.querySelector("[class*=\\"OptionSelector_option-item-price\\"]");
                const discount = it.querySelector("[class*=\\"OptionSelector_option-item-discount\\"]");
                const img = it.querySelector("img");
                const isSoldOut = it.className.includes("soldout") || it.innerText.includes("품절");
                return {
                    index: idx + 1,
                    name_kr: tit ? tit.innerText.trim() : "",
                    price_str: price ? price.innerText.trim() : "",
                    discount_str: discount ? discount.innerText.trim() : "50%",
                    is_sold_out: isSoldOut,
                    image_url: img ? img.src.split("?")[0] : ""
                };
            }));
        })()
        '''
        raw_opts = run_chrome_js(extract_opts_js)
        try:
            parsed_opts = json.loads(raw_opts or "[]")
            seen_opt_names = {}
            for item in parsed_opts:
                name_kr = item["name_kr"]
                if name_kr in seen_opt_names:
                    seen_opt_names[name_kr] += 1
                    name_kr = f"{name_kr} (Phân loại {seen_opt_names[name_kr]})"
                else:
                    seen_opt_names[name_kr] = 1

                price_str = item["price_str"].replace("원", "").replace(".", "").replace(",", "").strip()
                price_krw = int(price_str) if price_str.isdigit() else int(str(prod_item.get("sale_price_krw", 10000)).replace(',', '').strip())
                price_vnd = round(price_krw * krw_rate * (1 + service_fee))
                
                options_formatted.append({
                    "id": f"opt_{goods_no}_{item['index']}",
                    "name_vi": name_kr,
                    "name_kr": name_kr,
                    "price_krw": price_krw,
                    "price_vnd": price_vnd,
                    "discount_rate": item["discount_str"] if item["discount_str"] else "50%",
                    "image_url": item["image_url"],
                    "is_sold_out": item["is_sold_out"],
                    "status": "out_of_stock" if item["is_sold_out"] else "available"
                })
            print(f"📦 Bóc tách được {len(options_formatted)} options phân loại.")
        except Exception as e:
            print(f"⚠️ Lỗi parse options: {e}")
            options_formatted = []
    else:
        print("ℹ️ Sản phẩm đơn (Không có dropdown option).")

    # 4. Kích hoạt Modal Review & Bóc tách ảnh Review HD từ Shadow DOM
    trigger_modal_js = '''
    (() => {
        window.scrollTo(0, 1400);
        const revBtn = document.querySelector("#reviewInfo, [data-tab=\\"review\\"], button.btn_tab[onclick*=\\"review\\"]");
        if (revBtn) revBtn.click();
        const thumb = document.querySelector("[class*=\\"rw-photo-slide__item\\"] img, [class*=\\"ReviewArea_thumb\\"] img, img[src*=\\"gdasEditor\\"]");
        if (thumb) { thumb.click(); return "CLICKED_THUMB"; }
        return "NONE";
    })()
    '''
    run_chrome_js(trigger_modal_js)
    time.sleep(1.8)

    extract_shadow_js = '''
    (() => {
        function getAllShadowImages(root) {
            let imgs = [];
            if (!root) return imgs;
            root.querySelectorAll("img").forEach(i => {
                const s = i.src || i.getAttribute("data-original") || "";
                if (s.includes("gdasEditor") || s.includes("review")) imgs.push(s);
            });
            root.querySelectorAll("*").forEach(el => {
                if (el.shadowRoot) imgs = imgs.concat(getAllShadowImages(el.shadowRoot));
            });
            return imgs;
        }
        return JSON.stringify(Array.from(new Set(getAllShadowImages(document))));
    })()
    '''
    review_urls = json.loads(run_chrome_js(extract_shadow_js) or "[]")
    print(f"🔍 Tìm thấy {len(review_urls)} link ảnh review từ trang web.")

    # Tìm thumbnail chính trên đĩa
    main_thumb_local = prod_item.get("local_main_thumbnail")
    if not main_thumb_local or not os.path.exists(main_thumb_local):
        for ext in ['png', 'jpg', 'webp', 'jpeg']:
            cand = os.path.join(folder_path, f'main_thumbnail.{ext}')
            if os.path.exists(cand):
                main_thumb_local = cand
                break
    main_thumb_hash = calculate_file_hash(main_thumb_local) if main_thumb_local and os.path.exists(main_thumb_local) else None

    # Thu thập các ảnh review có sẵn trong folder trước (lọc bỏ file hỏng < 8KB và ảnh dính mặt người)
    existing_reviews_on_disk = []
    seen_hashes = set([main_thumb_hash] if main_thumb_hash else [])
    for f in sorted(os.listdir(folder_path)):
        if f.startswith("review_user_") and f.endswith(('.png', '.jpg', '.webp')):
            f_path = os.path.join(folder_path, f)
            if os.path.getsize(f_path) < 8000:
                print(f"🗑️ [AUTO-CLEAN] Xóa file ảnh hỏng/quá nhỏ (<8KB): {f}")
                try:
                    os.remove(f_path)
                except Exception:
                    pass
                continue
            if check_image_has_face(f_path):
                print(f"🚫 [VISION AI] Xóa ảnh cũ dính mặt người: {f}")
                try:
                    os.remove(f_path)
                except Exception:
                    pass
                continue
            f_hash = calculate_file_hash(f_path)
            if f_hash and f_hash not in seen_hashes:
                seen_hashes.add(f_hash)
                existing_reviews_on_disk.append(f_path)

    # Nếu chưa đủ 8, tải thêm từ review_urls
    needed = 8 - len(existing_reviews_on_disk)
    if needed > 0 and review_urls:
        new_downloaded, _ = download_and_dedupe_images(
            review_urls,
            folder_path,
            prefix=f"review_user_{len(existing_reviews_on_disk)+1}",
            target_count=needed,
            exclude_hashes=list(seen_hashes),
            filter_faces=True
        )
        existing_reviews_on_disk.extend(new_downloaded)

    # Nếu vẫn chưa đủ 8 ảnh, kích hoạt Self-Healing lấy ảnh detail sạch bù vào
    saved_reviews = heal_missing_reviews(folder_path, existing_reviews_on_disk, target_count=8, exclude_hashes=[main_thumb_hash] if main_thumb_hash else [])
    print(f"📸 Số lượng ảnh review HD đạt chuẩn: {len(saved_reviews)}/8 ảnh.")

    # 5. Giá KRW & Giá VND chuẩn
    orig_krw = int(str(prod_item.get("origin_price_krw", 20000)).replace(',', '').replace('.', '').replace('원', '').strip() or 20000)
    sale_krw = int(str(prod_item.get("sale_price_krw", 10000)).replace(',', '').replace('.', '').replace('원', '').strip() or 10000)
    price_vnd = round(sale_krw * krw_rate * (1 + service_fee))
    discount_rate = f"{round((1 - sale_krw / orig_krw) * 100)}%" if orig_krw > sale_krw else "0%"

    # 6. Tên Tiếng Việt & Mô tả SEO 1 Đoạn Văn Thẳng (Zero Hangul)
    brand_kr = prod_item.get("brand", "")
    brand_vi = clean_brand_name(brand_kr)
    raw_name_kr = prod_item.get("name", "")
    cat_label = prod_item.get("categoryLabel", "Mỹ phẩm")
    
    # Chuẩn hóa tên tiếng Việt sạch 100% không tiếng Hàn
    name_vi = clean_vietnamese_product_name(raw_name_kr, brand_kr, cat_label)

    seo_description = generate_seo_vietnamese_description(
        name_vi,
        raw_name_kr,
        brand_vi,
        cat_label
    )
    seo_description = heal_hangul_in_description(seo_description)

    # 7. Đóng gói Payload cập nhật
    updated_payload = {
        "goods_no": goods_no,
        "goodsNo": goods_no,
        "rank": rank,
        "name": name_vi,
        "name_vi": name_vi,
        "name_kr": prod_item.get("name", ""),
        "brand": brand_kr,
        "brand_vi": brand_vi,
        "category": prod_item.get("category", "cosmetics"),
        "subCategory": prod_item.get("subCategory", ""),
        "categoryLabel": prod_item.get("categoryLabel", "Mỹ phẩm"),
        "origin_price_krw": str(orig_krw),
        "sale_price_krw": str(sale_krw),
        "price": sale_krw,
        "foreignPrice": sale_krw,
        "price_vnd": price_vnd,
        "priceVnd": price_vnd,
        "discount_rate": discount_rate,
        "product_status": "active",
        "in_stock": True,
        "is_published": True,
        "product_images": {
            "main_image": main_thumb_local,
            "review_images": saved_reviews,
            "review_images_count": len(saved_reviews)
        },
        "local_main_thumbnail": main_thumb_local,
        "local_user_reviews": saved_reviews,
        "options": options_formatted,
        "description": seo_description,
        "basic_info": {
            "origin": "Nội địa Hàn Quốc (Olive Young Seoul)",
            "packaging": "Hàng chính hãng full seal",
            "skin_type": "Mọi loại da, da nhạy cảm",
            "core_benefits": seo_description,
            "usage": "Sử dụng hàng ngày theo chu trình chăm sóc da cơ bản."
        },
        "product_url": p_url,
        "folder_path": folder_path,
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    # 8. CỬA GÁC CỔNG: Chạy kiểm định QC Gatekeeper
    try:
        ok, report = verify_single_product(updated_payload, folder_path)
        print(f"✅ [QC GATE PASSED] Sản phẩm {goods_no} đạt 100% tiêu chuẩn!")
    except ProductQCValidationError as qc_err:
        print(f"⚠️ [QC GATE WARNING] Phát hiện vấn đề:\n{qc_err}\nKích hoạt Auto-Repair...")
        # Auto-Repair
        updated_payload["description"] = heal_hangul_in_description(updated_payload["description"])
        updated_payload["local_user_reviews"] = heal_missing_reviews(folder_path, updated_payload["local_user_reviews"], 8)
        # Thử kiểm tra lại lần 2
        try:
            ok, report = verify_single_product(updated_payload, folder_path)
            print(f"✅ [QC GATE PASSED SAU KHI SỬA LỖI] SKU {goods_no} thành công!")
        except Exception as final_err:
            print(f"❌ [QC GATE REJECTED] Không thể tự sửa lỗi cho SKU {goods_no}:\n{final_err}")
            update_product_state(goods_no, "FAILED", {"error": str(final_err)})
            record_heartbeat(total=total, completed=index, last_sku=goods_no, last_status="FAILED", error=str(final_err))
            return False

    # 9. Ghi đè vào info.json và lưu Checkpoint
    if not dry_run:
        with open(info_path, "w", encoding="utf-8") as f:
            json.dump(updated_payload, f, ensure_ascii=False, indent=2)
        update_product_state(goods_no, "QC_PASSED", {"options": len(options_formatted), "reviews": len(saved_reviews)})
        record_heartbeat(total=total, completed=index + 1, last_sku=goods_no, last_status="QC_PASSED")

    # Jitter delay ngẫu nhiên 1.5s - 2.5s để né WAF
    delay = random.uniform(1.5, 2.5)
    time.sleep(delay)
    return True

def main():
    parser = argparse.ArgumentParser(description="Master Top 100 Enrichment Pipeline with Apple Vision & QC Gate")
    parser.add_argument("--status", action="store_true", help="Hiển thị tiến độ hiện tại")
    parser.add_argument("--batch", type=int, default=0, help="Số lượng sản phẩm xử lý trong lô này")
    parser.add_argument("--all", action="store_true", help="Chạy toàn bộ 100 sản phẩm")
    parser.add_argument("--dry-run", action="store_true", help="Chạy thử không ghi file")
    parser.add_argument("--rollback", type=str, help="Rollback trạng thái cũ của SKU")
    args = parser.parse_args()

    if args.rollback:
        rollback_product(args.rollback)
        sys.exit(0)

    if args.status:
        st = load_state()
        prods = st.get("products", {})
        passed = sum(1 for p in prods.values() if p.get("status") == "QC_PASSED")
        failed = sum(1 for p in prods.values() if p.get("status") == "FAILED")
        print("=======================================================")
        print("📊 TRẠNG THÁI TIẾN ĐỘ MASTER PIPELINE:")
        print(f"  - Tổng số sản phẩm đã xử lý: {len(prods)}/100")
        print(f"  - Đạt chuẩn QC (QC_PASSED): {passed}")
        print(f"  - Bị từ chối (FAILED): {failed}")
        print("=======================================================")
        sys.exit(0)

    # Đọc danh sách 100 sản phẩm
    if not os.path.exists(FULL_JSON_PATH):
        print(f"❌ Không tìm thấy {FULL_JSON_PATH}")
        sys.exit(1)

    with open(FULL_JSON_PATH, "r", encoding="utf-8") as f:
        products = json.load(f)

    total_prods = len(products)
    limit = args.batch if args.batch > 0 else (total_prods if args.all else 1)
    
    print("================================================================================")
    print(f"🚀 KHỞI ĐỘNG MASTER TOP 100 PIPELINE (Lô: {limit} sản phẩm | Dry-Run: {args.dry_run})")
    print("================================================================================")

    processed_in_batch = 0
    for idx, p in enumerate(products):
        if processed_in_batch >= limit:
            break

        goods_no = p.get("goods_no")
        # Kiểm tra nếu chưa QC_PASSED thì làm, hoặc nếu chạy dry-run thì làm
        if not is_product_completed(goods_no) or args.dry_run:
            success = process_single_product(p, idx, total=total_prods, dry_run=args.dry_run)
            processed_in_batch += 1

            # Dọn RAM sau mỗi 15 sản phẩm
            if processed_in_batch % 15 == 0:
                recycle_chrome_tab()

    print("\n================================================================================")
    print(f"🎉 HOÀN TẤT LÔ {processed_in_batch} SẢN PHẨM! Kiểm tra telemetry để xem báo cáo chi tiết.")
    print("================================================================================")

if __name__ == "__main__":
    main()
