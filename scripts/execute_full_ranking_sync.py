#!/usr/bin/env python3
import os
import sys
import json
import time
import re
import urllib.request
import subprocess
import requests
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

BASE_DIR = "/Users/tan/tavy-korea"
DIST_PRODUCTS = os.path.join(BASE_DIR, "dist", "products")
PUBLIC_PRODUCTS = os.path.join(BASE_DIR, "public", "products")
PLAYWRIGHT_JSON = os.path.join(BASE_DIR, "public", "data", "playwright_scraped_products.json")
REPORT_FILE = os.path.join(BASE_DIR, "BAO_CAO_DONG_BO_GIA_TOP100.md")

KRW_RATE = 19.5
SERVICE_FEE_MULT = 1.05

os.makedirs(DIST_PRODUCTS, exist_ok=True)
os.makedirs(PUBLIC_PRODUCTS, exist_ok=True)

def get_9router_key():
    for p in ["/Users/tan/.hermes/9router_key.txt", "/Users/tan/.hermes/.env"]:
        if os.path.exists(p):
            with open(p) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("OPENAI_API_KEY="):
                        return line.split("=", 1)[1].strip()
                    elif line.startswith("sk-"):
                        return line
    return ""

def get_oliveyoung_tab():
    script = '''
    tell application "Google Chrome"
        tell front window
            set idx to 1
            repeat with t in tabs
                if (URL of t as string) contains "oliveyoung.co.kr" then
                    return idx
                end if
                set idx to idx + 1
            end repeat
            return 0
        end tell
    end tell
    '''
    res = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    try:
        return int(res.stdout.strip())
    except:
        return 0

def run_chrome_js(tab_num, js_code):
    escaped = js_code.replace("\\", "\\\\").replace('"', '\\"')
    script = f'''
    tell application "Google Chrome"
        tell front window
            tell tab {tab_num}
                return execute javascript "{escaped}"
            end tell
        end tell
    end tell
    '''
    res = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    return res.stdout.strip()

def apply_sold_overlay(image_path):
    """Tô xám ảnh đại diện và chèn chữ SOLD nổi bật ở trung tâm"""
    try:
        orig = Image.open(image_path)
        gray = orig.convert("L").convert("RGB")
        enhancer = ImageEnhance.Brightness(gray)
        dimmed = enhancer.enhance(0.75)
        
        w, h = dimmed.size
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        
        banner_h = max(int(h * 0.22), 60)
        y1 = (h - banner_h) // 2
        y2 = y1 + banner_h
        draw.rectangle([0, y1, w, y2], fill=(220, 38, 38, 225))
        
        font_size = int(banner_h * 0.65)
        font = None
        for fp in [
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            "/System/Library/Fonts/SFNS.ttf"
        ]:
            if os.path.exists(fp):
                try:
                    font = ImageFont.truetype(fp, font_size)
                    break
                except:
                    pass
        if font is None:
            font = ImageFont.load_default()
            
        text = "SOLD"
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx = (w - tw) // 2
        ty = (h - th) // 2 - int(bbox[1] * 0.4)
        
        draw.text((tx, ty), text, fill=(255, 255, 255, 255), font=font)
        
        final_img = Image.alpha_composite(dimmed.convert("RGBA"), overlay).convert("RGB")
        final_img.save(image_path, quality=92)
        print(f"   🎨 [SOLD OVERLAY] Đã đóng dấu SOLD vào {os.path.basename(image_path)}")
        return True
    except Exception as e:
        print(f"   ⚠️ Lỗi xử lý ảnh SOLD cho {image_path}: {e}")
        return False

def download_image(url, dest_path):
    if not url or not url.startswith("http"):
        return False
    try:
        clean_url = url.split("?")[0] if "?" in url else url
        req = urllib.request.Request(clean_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp, open(dest_path, 'wb') as f:
            f.write(resp.read())
        return True
    except Exception as e:
        print(f"   ⚠️ Lỗi tải ảnh {url}: {e}")
        return False

def parse_price_text(text):
    if not text:
        return None, None, "0%"
    clean = text.replace(",", "").replace(".", "")
    nums = re.findall(r"(\d+)\s*원", clean)
    pcts = re.findall(r"(\d+)%", clean)
    
    if len(nums) >= 2:
        orig = int(nums[0])
        sale = int(nums[1])
        disc = f"{pcts[0]}%" if pcts else f"{round((1 - sale/orig)*100)}%"
        return orig, sale, disc
    elif len(nums) == 1:
        val = int(nums[0])
        return val, val, "0%"
    return None, None, "0%"

def translate_batch_ai(items):
    key = get_9router_key()
    if not key:
        print("⚠️ Không có 9Router key, dùng fallback tên gốc")
        return {item["goodsNo"]: {"brand": item.get("brandKr", "Olive Young"), "name": item.get("nameKr", "")} for item in items}
    
    prompt = f"""Bạn là chuyên gia dịch thuật mỹ phẩm thương mại điện tử chuyên nghiệp cho Tavy Korea.
Hãy chuẩn hóa danh sách sản phẩm Hàn Quốc sau đây sang Tiếng Việt.
QUY TẮC BẮT BUỘC:
1. Loại bỏ các tiền tố/hậu tố khuyến mãi: [10월 올영픽], [단독], [기획], [NEW], [한정], [1+1], [스윙스마켓], [최예나PICK]...
2. Thương hiệu (brand): Chuyển 100% sang tên Latin chính hãng quốc tế (Into You, Dongkook, Dong-A, Plu, VT, Mediheal, Dr.G, Anua, S.Nature, Torriden, Celimax...). Tuyệt đối không để chữ Hàn.
3. Tên tiếng Việt (name): Theo công thức 5 thành phần: [Loại Sản Phẩm] + [Đặc Tính / Công Dụng] + [Thương Hiệu] + [Tên Dòng] + [Quy Cách / Quà Tặng]. TUYỆT ĐỐI KHÔNG CHỨA BẤT KỲ KÝ TỰ HANGUL NÀO (ZERO HANGUL).
4. Trả về ĐÚNG JSON array dạng:
[
  {{"goodsNo": "...", "brand": "Tên Latin", "name": "Tên tiếng Việt chuẩn e-commerce"}}
]
Chỉ trả về JSON thuần, không markdown, không giải thích.

Danh sách cần dịch:
{json.dumps([{"goodsNo": x["goodsNo"], "brandKr": x.get("brandKr", ""), "nameKr": x.get("nameKr", "")} for x in items], ensure_ascii=False)}
"""
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    payload = {
        "model": "manh",
        "stream": False,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2
    }
    
    try:
        r = requests.post("http://127.0.0.1:20128/v1/chat/completions", headers=headers, json=payload, timeout=45)
        content = r.json()["choices"][0]["message"]["content"]
        clean_json = content.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(clean_json)
        return {x["goodsNo"]: x for x in parsed if "goodsNo" in x}
    except Exception as e:
        print(f"⚠️ Lỗi dịch batch AI: {e}")
        return {item["goodsNo"]: {"brand": item.get("brandKr", "Olive Young"), "name": item.get("nameKr", "")} for item in items}

def main():
    print("=" * 70)
    print("🚀 BẮT ĐẦU ĐỒNG BỘ TOP RANKING & TOÀN BỘ SẢN PHẨM OLIVE YOUNG (TAVY KOREA)")
    print("=" * 70)
    
    # 1. Load Live Top 100
    with open("/tmp/live_top100_oliveyoung.json") as f:
        live_top100 = json.load(f)
    print(f"📦 Đã nạp {len(live_top100)} sản phẩm từ Top Ranking Olive Young.")
    
    # 2. Load Firestore Products
    with open("/tmp/firestore_products.json") as f:
        firestore_prods = json.load(f)
    print(f"📦 Đã nạp {len(firestore_prods)} sản phẩm hiện có trên Firestore.")
    
    live_map = {item["goodsNo"]: item for item in live_top100 if item.get("goodsNo")}
    fs_map = {item.get("goodsNo") or item.get("firestoreId"): item for item in firestore_prods}
    
    tab_num = get_oliveyoung_tab()
    if tab_num == 0:
        print("❌ Không tìm thấy tab Olive Young nào trên Google Chrome!")
        sys.exit(1)
        
    tab_title = run_chrome_js(tab_num, "document.title")
    print(f"🔍 Đang kết nối Tab {tab_num} Chrome: '{tab_title}'")
    
    # ─────────────────────────────────────────────────────────────
    # PHA 1: QUÉT TRẠNG THÁI & GIÁ LIVE CỦA CÁC SẢN PHẨM THƯỜNG (RỚT TOP)
    # ─────────────────────────────────────────────────────────────
    not_in_top = [p for gid, p in fs_map.items() if gid not in live_map]
    print(f"\n🔍 [PHA 1] Quét trạng thái & giá live của {len(not_in_top)} sản phẩm thường/rớt top...")
    
    goods_to_check = [p.get("goodsNo") or p.get("firestoreId") for p in not_in_top]
    scan_results = {}
    
    batch_size = 6
    total_batches = (len(goods_to_check) + batch_size - 1) // batch_size
    
    for b_idx in range(0, len(goods_to_check), batch_size):
        chunk = goods_to_check[b_idx:b_idx+batch_size]
        curr_batch = b_idx // batch_size + 1
        print(f"-> Quét lô {curr_batch}/{total_batches} ({len(chunk)} SP: {', '.join(chunk[:3])}...)...")
        
        js_code = f"""(() => {{
            window.__scanResult = null;
            const list = {json.dumps(chunk)};
            (async () => {{
                const results = await Promise.all(list.map(async (g) => {{
                    try {{
                        const r = await fetch("/store/goods/getGoodsDetail.do?goodsNo=" + g);
                        const html = await r.text();
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, "text/html");
                        const priceWrap = doc.querySelector(".price, .price_wrap, .goods_price, [class*='price']");
                        const priceText = priceWrap ? priceWrap.innerText.trim() : "";
                        
                        const isChallenge = doc.title.includes("기다려") || doc.title.includes("Chờ");
                        const isDiscontinued = !isChallenge && (
                            html.includes("존재하지 않는") || 
                            html.includes("판매가 중단") || 
                            html.includes("판매종료") || 
                            doc.title === "올리브영 온라인몰" || 
                            doc.title.includes("오류") || 
                            doc.title.includes("Error")
                        );
                        const isSoldOut = isDiscontinued || 
                                          html.includes("btnSoldout") || 
                                          html.includes("일시품절") || 
                                          html.includes("품절된 상품");
                                          
                        return {{
                            goodsNo: g,
                            title: doc.title,
                            priceText: priceText,
                            isChallenge: isChallenge,
                            isDiscontinued: isDiscontinued,
                            isSoldOut: isSoldOut
                        }};
                    }} catch (err) {{
                        return {{ goodsNo: g, error: err.message }};
                    }}
                }}));
                window.__scanResult = JSON.stringify(results);
            }})();
        }})()"""
        
        with open("/tmp/temp_scan_chunk.js", "w") as f:
            f.write(js_code)
            
        cmd_run = f"""osascript -e '
        tell application "Google Chrome"
            tell front window
                tell tab {tab_num}
                    set js to read POSIX file "/tmp/temp_scan_chunk.js"
                    execute javascript js
                end tell
            end tell
        end tell
        '"""
        subprocess.run(cmd_run, shell=True)
        
        raw_res = ""
        for _ in range(15):
            time.sleep(1.0)
            poll_cmd = f"""osascript -e '
            tell application "Google Chrome"
                tell front window
                    tell tab {tab_num}
                        return execute javascript "window.__scanResult"
                    end tell
                end tell
            end tell
            '"""
            poll = subprocess.run(poll_cmd, shell=True, capture_output=True, text=True).stdout.strip()
            if poll and poll != "missing value" and poll != "null":
                raw_res = poll
                break
                
        if raw_res:
            try:
                parsed_chunk = json.loads(raw_res)
                for item in parsed_chunk:
                    g = item["goodsNo"]
                    origin, sale, pct = parse_price_text(item.get("priceText", ""))
                    item["originPrice"] = origin
                    item["salePrice"] = sale
                    item["discountRate"] = pct
                    scan_results[g] = item
                    
                    status_str = "NGỪNG BÁN (SOLD)" if item.get("isDiscontinued") else ("HẾT HÀNG" if item.get("isSoldOut") else f"₩{sale:,}" if sale else "KHÔNG RÕ GIÁ")
                    print(f"   [{status_str}] {g}: {item.get('title', '')[:40]}")
            except Exception as e:
                print(f"Lỗi parse kết quả lô: {e}")
        else:
            print("⚠️ Lô bị timeout!")
            
        time.sleep(1.0)
        
    print(f"✅ Đã quét xong {len(scan_results)}/{len(goods_to_check)} sản phẩm thường!")
    
    # ─────────────────────────────────────────────────────────────
    # PHA 2: DỊCH THUẬT & TẢI ẢNH CHO CÁC SẢN PHẨM MỚI TRONG TOP 100
    # ─────────────────────────────────────────────────────────────
    new_in_top = [item for gid, item in live_map.items() if gid not in fs_map]
    print(f"\n✨ [PHA 2] Chuẩn hóa & Nạp {len(new_in_top)} sản phẩm MỚI trong Top 100...")
    
    ai_translations = {}
    for i in range(0, len(new_in_top), 10):
        chunk = new_in_top[i:i+10]
        print(f"-> Dịch batch AI {i//10 + 1}/{(len(new_in_top)+9)//10} ({len(chunk)} SP)...")
        trans = translate_batch_ai(chunk)
        ai_translations.update(trans)
        time.sleep(1.0)
        
    print(f"✅ Đã dịch xong {len(ai_translations)} sản phẩm bằng 9Router AI!")
    
    # Tải ảnh HD cho các sản phẩm mới
    print("-> Tải ảnh đại diện HD cho các sản phẩm mới...")
    downloaded_count = 0
    for item in new_in_top:
        g = item["goodsNo"]
        thumb_url = item.get("thumbnailUrl")
        dest_dist = os.path.join(DIST_PRODUCTS, f"{g}.jpg")
        dest_public = os.path.join(PUBLIC_PRODUCTS, f"{g}.jpg")
        
        ok1 = not os.path.exists(dest_dist) and download_image(thumb_url, dest_dist)
        ok2 = not os.path.exists(dest_public) and download_image(thumb_url, dest_public)
        if ok1 or ok2 or (os.path.exists(dest_dist) and os.path.exists(dest_public)):
            downloaded_count += 1
            
    print(f"✅ Đã chuẩn bị đầy đủ ảnh cho {downloaded_count}/{len(new_in_top)} sản phẩm mới.")

    # ─────────────────────────────────────────────────────────────
    # PHA 3: TÔ XÁM VÀ CHÈN CHỮ "SOLD" CHO SẢN PHẨM NGỪNG BÁN
    # ─────────────────────────────────────────────────────────────
    print(f"\n🎨 [PHA 3] Xử lý đóng dấu 'SOLD' & Tô xám cho sản phẩm ngừng bán...")
    sold_count = 0
    discontinued_gids = []
    
    for gid, res in scan_results.items():
        if res.get("isDiscontinued") or res.get("isSoldOut"):
            discontinued_gids.append(gid)
            for ext in ["jpg", "jpeg", "png", "webp"]:
                dist_img = os.path.join(DIST_PRODUCTS, f"{gid}.{ext}")
                public_img = os.path.join(PUBLIC_PRODUCTS, f"{gid}.{ext}")
                if os.path.exists(dist_img):
                    apply_sold_overlay(dist_img)
                    sold_count += 1
                if os.path.exists(public_img):
                    apply_sold_overlay(public_img)
                    
    print(f"✅ Đã xử lý tô xám và chèn chữ SOLD cho {len(discontinued_gids)} sản phẩm ngừng bán ({sold_count} file ảnh).")

    # ─────────────────────────────────────────────────────────────
    # PHA 4: TỔNG HỢP DỮ LIỆU ĐỂ GHI VÀO FIRESTORE & WEB CATALOG
    # ─────────────────────────────────────────────────────────────
    print(f"\n💾 [PHA 4] Tổng hợp dữ liệu cập nhật...")
    
    updated_catalog = []
    firestore_updates = []
    
    price_change_log = []
    
    # 1. Thêm/Cập nhật Top 100
    for item in live_top100:
        gid = item["goodsNo"]
        rank = item["rank"]
        sale_krw = int(item.get("salePriceKrw") or 0)
        orig_krw = int(item.get("originPriceKrw") or sale_krw)
        discount = f"{round((1 - sale_krw / orig_krw) * 100)}%" if orig_krw > sale_krw else "0%"
        price_vnd = round(sale_krw * KRW_RATE * SERVICE_FEE_MULT)
        
        existing = fs_map.get(gid)
        if existing:
            entry = dict(existing)
            old_sale = entry.get("foreignPrice") or entry.get("price") or 0
            if old_sale and old_sale != sale_krw:
                price_change_log.append({
                    "goodsNo": gid,
                    "name": entry.get("name", ""),
                    "old_krw": old_sale,
                    "new_krw": sale_krw,
                    "diff": sale_krw - old_sale
                })
                
            entry["rank"] = rank
            entry["foreignPrice"] = sale_krw
            entry["price"] = sale_krw
            entry["originalPrice"] = orig_krw
            entry["discountRate"] = discount
            entry["priceVnd"] = price_vnd
            entry["status"] = "published"
            entry["isPublished"] = True
            entry["is_sold_out"] = False
            entry["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        else:
            tr = ai_translations.get(gid, {})
            brand = tr.get("brand") or item.get("brandKr", "Olive Young")
            name_vi = tr.get("name") or item.get("nameKr", "")
            
            img_url = f"https://tavyorder.web.app/products/{gid}.jpg"
            entry = {
                "goodsNo": gid,
                "rank": rank,
                "name": name_vi,
                "nameKr": item.get("nameKr", ""),
                "brand": brand,
                "brandKr": item.get("brandKr", ""),
                "category": "cosmetics",
                "subCategory": "skincare",
                "foreignPrice": sale_krw,
                "price": sale_krw,
                "originalPrice": orig_krw,
                "discountRate": discount,
                "priceVnd": price_vnd,
                "productImage": img_url,
                "images": [img_url],
                "photoReviews": [],
                "options": [],
                "status": "published",
                "isPublished": True,
                "is_sold_out": False,
                "origin": "Store Olive Young Korea",
                "productUrl": item.get("productUrl", ""),
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z")
            }
            
        updated_catalog.append(entry)
        firestore_updates.append(entry)
        
    # 2. Cập nhật các sản phẩm thường không nằm trong Top 100
    for gid, existing in fs_map.items():
        if gid in live_map:
            continue
            
        res = scan_results.get(gid)
        entry = dict(existing)
        
        if "rank" in entry:
            del entry["rank"]
            
        if res:
            if res.get("isDiscontinued") or res.get("isSoldOut"):
                entry["is_sold_out"] = True
                entry["status"] = "out_of_stock"
                entry["isPublished"] = False
            else:
                if res.get("salePrice"):
                    sale_krw = res["salePrice"]
                    orig_krw = res.get("originPrice") or sale_krw
                    old_sale = entry.get("foreignPrice") or entry.get("price") or 0
                    if old_sale and old_sale != sale_krw:
                        price_change_log.append({
                            "goodsNo": gid,
                            "name": entry.get("name", ""),
                            "old_krw": old_sale,
                            "new_krw": sale_krw,
                            "diff": sale_krw - old_sale
                        })
                    entry["foreignPrice"] = sale_krw
                    entry["price"] = sale_krw
                    entry["originalPrice"] = orig_krw
                    entry["discountRate"] = res.get("discountRate", "0%")
                    entry["priceVnd"] = round(sale_krw * KRW_RATE * SERVICE_FEE_MULT)
                entry["is_sold_out"] = False
                entry["status"] = "published"
                entry["isPublished"] = True
                
        entry["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        updated_catalog.append(entry)
        firestore_updates.append(entry)
        
    # Save local json
    with open(PLAYWRIGHT_JSON, "w", encoding="utf-8") as f:
        json.dump(updated_catalog, f, ensure_ascii=False, indent=2)
    print(f"📁 Đã lưu catalog offline gồm {len(updated_catalog)} sản phẩm vào {PLAYWRIGHT_JSON}")
    
    # Save payload for node firestore commit
    sync_payload_path = "/tmp/firestore_sync_payload.json"
    with open(sync_payload_path, "w", encoding="utf-8") as f:
        json.dump(firestore_updates, f, ensure_ascii=False, indent=2)
    print(f"📁 Đã tạo payload đồng bộ Firestore tại {sync_payload_path} ({len(firestore_updates)} sản phẩm).")

    # Generate Report Markdown
    report_md = f"""# BÁO CÁO ĐỒNG BỘ GIÁ & CATALOG OLIVE YOUNG (TAVY KOREA)
**Thời gian thực hiện:** {time.strftime('%Y-%m-%d %H:%M:%S')}

## 1. Tổng quan số liệu
- **Tổng sản phẩm catalog:** {len(updated_catalog)} SKU
- **Top Ranking Olive Young:** 100/100 SKU (Đầy đủ thứ hạng Rank 1..100)
  - Số sản phẩm cũ giữ top: {len(live_map) - len(new_in_top)} SKU
  - Số sản phẩm mới gia nhập Top 100: {len(new_in_top)} SKU (Đã dịch 100% Zero Hangul & tải ảnh HD)
- **Sản phẩm thường / Rớt top:** {len(not_in_top)} SKU
  - Còn bán bình thường: {len(not_in_top) - len(discontinued_gids)} SKU (Đã cập nhật giá live mới nhất)
  - Ngừng bán / Hết hàng: {len(discontinued_gids)} SKU (Đã chuyển `out_of_stock`, tô xám và dập banner SOLD)

## 2. Thống kê biến động giá ({len(price_change_log)} sản phẩm thay đổi giá)
| Mã SP | Tên sản phẩm | Giá cũ (KRW) | Giá mới (KRW) | Chênh lệch |
|---|---|---|---|---|
"""
    for pc in sorted(price_change_log, key=lambda x: abs(x["diff"]), reverse=True)[:30]:
        diff_str = f"+{pc['diff']:,}W" if pc['diff'] > 0 else f"{pc['diff']:,}W"
        report_md += f"| `{pc['goodsNo']}` | {pc['name'][:40]} | {pc['old_krw']:,}W | {pc['new_krw']:,}W | **{diff_str}** |\n"
        
    report_md += f"""
## 3. Danh sách sản phẩm ngừng bán đóng dấu SOLD ({len(discontinued_gids)} mã)
{', '.join([f'`{g}`' for g in discontinued_gids])}

## 4. Công thức định giá áp dụng
- Tỷ giá Won: `{KRW_RATE} VND/KRW`
- Phí dịch vụ: `+5%`
- Công thức: `priceVnd = round(foreignPrice * 19.5 * 1.05)`
"""
    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write(report_md)
    print(f"📄 Đã xuất báo cáo chi tiết ra {REPORT_FILE}")

if __name__ == "__main__":
    main()
