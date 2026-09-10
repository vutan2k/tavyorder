#!/usr/bin/env python3
import os
import json
import time
import subprocess
import urllib.request

PROD_DIR = "/Users/tan/Desktop/oliveyoung_ranking/top_1_메디힐_A000000223414"
os.makedirs(PROD_DIR, exist_ok=True)

OPTION_TRANSLATIONS = {
    "마데카소사이드": "Madecassoside Phục Hồi & Mờ Thâm Mụn (10+1 Miếng)",
    "로제 PDRN": "Rose PDRN Thu Nhỏ Lỗ Chân Lông & Căng Bóng Da (10 Miếng)",
    "콜라겐": "Collagen Tái Tạo Độ Đàn Hồi & Săn Chắc (10 Miếng)",
    "티트리": "Tràm Trà Teatree Làm Dịu & Cấp Ẩm Mụn (10+1 Miếng)",
    "히알루론산": "Hyaluronic Acid Cấp Nước Đa Tầng Căng Mọng (10 Miếng)",
    "비타민씨": "Vitamin C Toning Dưỡng Sáng & Mờ Thâm Nám (10 Miếng)",
    "세라마이드": "Ceramide Củng Cố Hàng Rào Bảo Vệ Da (10 Miếng)"
}

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
    res = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    return res.stdout.strip()

def download_image(url, dest_path):
    try:
        clean_url = url.split("?")[0]
        req = urllib.request.Request(clean_url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
        with urllib.request.urlopen(req, timeout=15) as resp, open(dest_path, 'wb') as f:
            data = resp.read()
            f.write(data)
        return True
    except Exception as e:
        print(f"Lỗi tải {url}: {e}")
        return False

def main():
    print("🚀 Đang bóc tách dữ liệu từ tab Chrome hiện tại...")
    
    # 1. Đảm bảo dropdown Option được mở
    ensure_open_js = '''
    (() => {
        let items = document.querySelectorAll("[class*=\\"OptionSelector_option-item__\\"]");
        if (items.length === 0) {
            const btn = document.querySelector("[class*=\\"OptionSelector_btn-option\\"]");
            if (btn) {
                btn.click();
                return "CLICKED_TO_OPEN";
            }
        }
        return "ALREADY_OPEN";
    })()
    '''
    run_chrome_js(ensure_open_js)
    time.sleep(1.2)

    # 2. Bóc tách danh sách Options
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
                price_str: price ? price.innerText.trim() : "10.000원",
                discount_str: discount ? discount.innerText.trim() : "50%",
                is_sold_out: isSoldOut,
                image_url: img ? img.src.split("?")[0] : ""
            };
        }));
    })()
    '''
    raw_opts = run_chrome_js(extract_opts_js)
    parsed_opts = json.loads(raw_opts)
    print(f"✅ Bóc tách được {len(parsed_opts)} options:")

    krw_rate = 19.5
    service_fee = 0.05
    options_formatted = []

    for item in parsed_opts:
        name_kr = item["name_kr"]
        # Chuẩn hóa giá tiền
        clean_price_str = item["price_str"].replace("원", "").replace(".", "").replace(",", "").strip()
        price_krw = int(clean_price_str) if clean_price_str.isdigit() else 10000
        price_vnd = round(price_krw * krw_rate * (1 + service_fee))
        
        # Dịch tên tiếng Việt chuyên môn
        name_vi = name_kr
        for key, trans in OPTION_TRANSLATIONS.items():
            if key in name_kr:
                name_vi = trans
                break

        opt_obj = {
            "id": f"opt_mediheal_{item['index']}",
            "name_vi": name_vi,
            "name_kr": name_kr,
            "price_krw": price_krw,
            "price_vnd": price_vnd,
            "discount_rate": item["discount_str"] if item["discount_str"] else "50%",
            "image_url": item["image_url"],
            "is_sold_out": item["is_sold_out"],
            "status": "out_of_stock" if item["is_sold_out"] else "available"
        }
        options_formatted.append(opt_obj)
        print(f"  [{item['index']}] {name_vi} | {price_krw:,} KRW (~{price_vnd:,} VNĐ) | Sale {opt_obj['discount_rate']} | Hết hàng: {item['is_sold_out']}")

    # 3. Bóc tách ảnh Review HD từ Shadow DOM
    print("\n📸 Bóc tách ảnh Review HD từ Shadow DOM...")
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
    
    # Lọc các link duy nhất không trùng lặp
    unique_reviews = []
    seen = set()
    for u in review_urls:
        base = u.split("?")[0]
        if base not in seen:
            seen.add(base)
            unique_reviews.append(base)

    print(f"🔍 Tìm thấy {len(unique_reviews)} link ảnh review hợp lệ")

    saved_review_paths = []
    for i, u in enumerate(unique_reviews[:8]):
        dest_file = os.path.join(PROD_DIR, f"review_user_{i+1}.png")
        if download_image(u, dest_file):
            saved_review_paths.append(dest_file)
            size_kb = round(os.path.getsize(dest_file) / 1024)
            print(f"  -> Đã lưu ảnh review #{i+1}: {dest_file} ({size_kb} KB)")

    # 4. Ảnh đại diện chính
    main_thumb_url = "https://image.oliveyoung.co.kr/cfimages/cf-goods/uploads/images/thumbnails/400/10/0000/0022/A000000223414124ko.png?l=ko"
    main_thumb_local = os.path.join(PROD_DIR, "main_thumbnail.png")
    if not os.path.exists(main_thumb_local):
        download_image(main_thumb_url, main_thumb_local)

    # 5. Tổng hợp file info.json cấu trúc mới
    product_data = {
        "goods_no": "A000000223414",
        "rank": 1,
        "name_vi": "Mặt Nạ Giấy Dịu Da Mụn & Phục Hồi Mediheal Essential Sheet Mask 10+1 Miếng (7 Loại)",
        "name_kr": "[15년 연속 1위/7일 한정판매] 메디힐 에센셜 마스크팩 10+1매 기획 7종 골라담기",
        "brand": "메디힐",
        "brand_vi": "Mediheal",
        "category": "cosmetics",
        "subCategory": "mask",
        "categoryLabel": "Mặt Nạ Giấy",
        "categoryKr": "마스크팩",
        "origin_price_krw": "20,000",
        "sale_price_krw": "10,000",
        "discount_rate": "50%",
        "product_status": "active",
        "in_stock": True,
        "is_published": True,
        "product_images": {
            "main_image": main_thumb_local,
            "main_image_url": main_thumb_url,
            "review_images_count": len(saved_review_paths),
            "review_images": saved_review_paths
        },
        "basic_info": {
            "origin": "Nội địa Hàn Quốc (Olive Young Seoul)",
            "packaging": "Hộp 10+1 miếng (hoặc 10 miếng tùy phân loại)",
            "skin_type": "Mọi loại da, da mụn nhạy cảm, da thiếu nước, da cần phục hồi",
            "core_benefits": "Cung cấp hàm lượng tinh chất cô đặc tương đương 1 chai ampoule chuyên sâu. Chất liệu mask sợi tre sinh học ôm sát gương mặt, thẩm thấu nhanh trong 15 phút, không nhờn rít, trả lại làn da mịn màng ngậm nước.",
            "usage": "1. Làm sạch da mặt với sữa rửa mặt và toner.\n2. Lấy mask đắp ôm khít toàn mặt trong 15-20 phút.\n3. Tháo mặt nạ và dùng đầu ngón tay vỗ nhẹ cho tinh chất thẩm thấu hết vào da."
        },
        "options": options_formatted,
        "local_main_thumbnail": main_thumb_local,
        "local_user_reviews": saved_review_paths,
        "product_url": "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000223414&tab=review",
        "folder_path": PROD_DIR,
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    info_json_path = os.path.join(PROD_DIR, "info.json")
    with open(info_json_path, "w", encoding="utf-8") as f:
        json.dump(product_data, f, ensure_ascii=False, indent=2)

    print(f"\n=======================================================")
    print(f"🎉 HOÀN TẤT! Dữ liệu đã lưu tại: {info_json_path}")
    print(f"👉 Số lượng phân loại (options): {len(options_formatted)}")
    print(f"👉 Số lượng ảnh review HD: {len(saved_review_paths)}")
    print(f"=======================================================")

if __name__ == "__main__":
    main()
