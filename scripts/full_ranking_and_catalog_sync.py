#!/usr/bin/env python3
import os
import sys
import json
import time
import re
import urllib.request
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

BASE_DIR = "/Users/tan/tavy-korea"
DIST_PRODUCTS = os.path.join(BASE_DIR, "dist", "products")
PUBLIC_PRODUCTS = os.path.join(BASE_DIR, "public", "products")
PLAYWRIGHT_JSON = os.path.join(BASE_DIR, "public", "data", "playwright_scraped_products.json")
NINE_ROUTER_KEY_FILE = "/Users/tan/.hermes/9router_key.txt"
NINE_ROUTER_URL = "http://127.0.0.1:20128/v1/chat/completions"

os.makedirs(DIST_PRODUCTS, exist_ok=True)
os.makedirs(PUBLIC_PRODUCTS, exist_ok=True)

def get_9router_key():
    if os.path.exists(NINE_ROUTER_KEY_FILE):
        return open(NINE_ROUTER_KEY_FILE).read().strip()
    return ""

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

def nav_chrome(tab_num, url):
    script = f'''
    tell application "Google Chrome"
        tell front window
            tell tab {tab_num}
                set URL to "{url}"
            end tell
        end tell
    end tell
    '''
    subprocess.run(["osascript", "-e", script])

def apply_sold_overlay(image_path):
    """Tô xám ảnh đại diện và chèn chữ SOLD nổi bật ở trung tâm"""
    try:
        orig = Image.open(image_path)
        # Convert to grayscale then RGB
        gray = orig.convert("L").convert("RGB")
        # Dim slightly for contrast
        enhancer = ImageEnhance.Brightness(gray)
        dimmed = enhancer.enhance(0.75)
        
        w, h = dimmed.size
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        
        # Red horizontal banner in middle
        banner_h = max(int(h * 0.22), 60)
        y1 = (h - banner_h) // 2
        y2 = y1 + banner_h
        draw.rectangle([0, y1, w, y2], fill=(220, 38, 38, 225))
        
        # Text font
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
        
        # White bold text
        draw.text((tx, ty), text, fill=(255, 255, 255, 255), font=font)
        
        final_img = Image.alpha_composite(dimmed.convert("RGBA"), overlay).convert("RGB")
        final_img.save(image_path, quality=92)
        print(f"   🎨 [SOLD OVERLAY] Đã tô xám và chèn chữ SOLD vào {os.path.basename(image_path)}")
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

def translate_batch_ai(items):
    key = get_9router_key()
    if not key:
        print("⚠️ Không có 9Router key, dùng fallback tên gốc")
        return {item["goodsNo"]: {"brand": item.get("brandKr", "Olive Young"), "name": item.get("nameKr", "")} for item in items}
    
    prompt = f"""Bạn là chuyên gia dịch thuật mỹ phẩm thương mại điện tử chuyên nghiệp.
Hãy chuẩn hóa danh sách sản phẩm Hàn Quốc sau đây sang Tiếng Việt.
QUY TẮC BẮT BUỘC:
1. Loại bỏ các tiền tố/hậu tố khuyến mãi: [10월 올영픽], [단독], [기획], [NEW], [한정], [1+1], [스윙스마켓], [최예나PICK]...
2. Thương hiệu (brand): Chuyển 100% sang tên Latin chính hãng quốc tế (Laneige, Mediheal, Dr.G, Banila Co, Clio, Fwee, Round Lab, Bring Green, Anua...). Tuyệt đối không để chữ Hàn.
3. Tên tiếng Việt (name): Theo công thức 5 thành phần: [Loại Sản Phẩm] + [Đặc Tính / Công Dụng] + [Thương Hiệu] + [Tên Dòng] + [Quy Cách / Quà Tặng]. TUYỆT ĐỐI KHÔNG CHỨA BẤT KỲ KÝ TỰ HANGUL NÀO.
4. Trả về ĐÚNG JSON array dạng:
[
  {{"goodsNo": "...", "brand": "Tên Latin", "name": "Tên tiếng Việt chuẩn e-commerce"}}
]
Chỉ trả về JSON thuần, không markdown.

Danh sách cần dịch:
{json.dumps([{"goodsNo": x["goodsNo"], "brandKr": x.get("brandKr", ""), "nameKr": x.get("nameKr", "")} for x in items], ensure_ascii=False)}
"""
    req = urllib.request.Request(NINE_ROUTER_URL, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}"
    }, data=json.dumps({
        "model": "manh",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2
    }).encode("utf-8"))
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
        
        # Check SSE stream or json
        content = ""
        if "data: " in raw:
            for l in raw.split("\n"):
                if l.startswith("data: ") and l.strip() != "data: [DONE]":
                    try:
                        c = json.loads(l[6:])
                        content += c["choices"][0].get("delta", {}).get("content", "")
                    except:
                        pass
        else:
            c = json.loads(raw)
            content = c["choices"][0]["message"]["content"]
            
        clean_json = content.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(clean_json)
        return {x["goodsNo"]: x for x in parsed if "goodsNo" in x}
    except Exception as e:
        print(f"⚠️ Lỗi dịch batch AI: {e}")
        return {item["goodsNo"]: {"brand": item.get("brandKr", "Olive Young"), "name": item.get("nameKr", "")} for item in items}

def parse_price_text(price_text):
    if not price_text:
        return None, None, "0%"
    # Remove whitespace
    # Find all patterns of digits with dots or commas followed by 원
    matches = re.findall(r"(\d{1,3}(?:[.,]\d{3})+)\s*원", price_text)
    if len(matches) >= 2:
        origin = int(re.sub(r"[.,]", "", matches[0]))
        sale = int(re.sub(r"[.,]", "", matches[1]))
    elif len(matches) == 1:
        sale = int(re.sub(r"[.,]", "", matches[0]))
        origin = sale
    else:
        # Fallback single number
        single = re.search(r"(\d+)\s*원", price_text)
        if single:
            sale = int(single.group(1))
            origin = sale
        else:
            return None, None, "0%"
            
    pct_m = re.search(r"(\d{1,2})%", price_text)
    pct = f"{pct_m.group(1)}%" if pct_m else (f"{round((1 - sale/origin)*100)}%" if origin > sale else "0%")
    return origin, sale, pct

def main():
    print("=" * 60)
    print("🚀 BẮT ĐẦU ĐỒNG BỘ TOP RANKING & TOÀN BỘ SẢN PHẨM OLIVE YOUNG")
    print("=" * 60)
    
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
    
    # Check tab 3 in Chrome
    test_title = run_chrome_js(3, "document.title")
    print(f"🔍 Trạng thái Tab 3 Chrome: '{test_title}'")
    if not test_title:
        print("❌ Không tìm thấy Tab 3 trong Chrome!")
        sys.exit(1)
        
    # ─────────────────────────────────────────────────────────────
    # PHA 1: QUÉT TOÀN BỘ 104 SẢN PHẨM THƯỜNG / RỚT TOP
    # ─────────────────────────────────────────────────────────────
    not_in_top = [p for gid, p in fs_map.items() if gid not in live_map]
    print(f"\n🔍 [PHA 1] Quét trạng thái & giá live của {len(not_in_top)} sản phẩm thường/rớt top...")
    
    goods_to_check = [p.get("goodsNo") or p.get("firestoreId") for p in not_in_top]
    scan_results = {}
    
    batch_size = 10
    for b_idx in range(0, len(goods_to_check), batch_size):
        chunk = goods_to_check[b_idx:b_idx+batch_size]
        print(f"-> Quét lô {b_idx//batch_size + 1}/{(len(goods_to_check)+batch_size-1)//batch_size} ({len(chunk)} SP)...")
        
        js_code = f"""(() => {{
            window.__scanResult = null;
            const list = {json.dumps(chunk)};
            const delay = (ms) => new Promise(res => setTimeout(res, ms));
            (async () => {{
                const results = [];
                for (const g of list) {{
                    try {{
                        const r = await fetch("/store/goods/getGoodsDetail.do?goodsNo=" + g);
                        const html = await r.text();
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, "text/html");
                        const priceWrap = doc.querySelector(".price, .price_wrap, .goods_price, [class*=\\\"price\\\"]");
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
                                          
                        results.push({{
                            goodsNo: g,
                            title: doc.title,
                            priceText: priceText,
                            isChallenge: isChallenge,
                            isDiscontinued: isDiscontinued,
                            isSoldOut: isSoldOut
                        }});
                    }} catch (err) {{
                        results.push({{ goodsNo: g, error: err.message }});
                    }}
                    await delay(1200);
                }}
                window.__scanResult = JSON.stringify(results);
            }})();
        }})()"""
        
        run_chrome_js(3, js_code)
        
        # Poll completion
        raw_res = ""
        for _ in range(30):
            time.sleep(1.0)
            poll = run_chrome_js(3, "window.__scanResult")
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
                    
                    status_str = "NGỪNG BÁN (SOLD)" if item.get("isDiscontinued") else ("HẾT HÀNG" if item.get("isSoldOut") else f"₩{sale}")
                    print(f"   [{status_str}] {g}: {item.get('title', '')[:35]}")
            except Exception as e:
                print(f"Lỗi parse kết quả lô: {e}")
        else:
            print("⚠️ Lô bị timeout!")
            
    print(f"✅ Đã quét xong {len(scan_results)} sản phẩm thường!")
    
    # ─────────────────────────────────────────────────────────────
    # PHA 2: DỊCH THUẬT & TẢI ẢNH CHO 58 SẢN PHẨM MỚI TRONG TOP 100
    # ─────────────────────────────────────────────────────────────
    new_in_top = [item for gid, item in live_map.items() if gid not in fs_map]
    print(f"\n✨ [PHA 2] Chuẩn hóa & Nạp {len(new_in_top)} sản phẩm MỚI trong Top 100...")
    
    ai_translations = {}
    for i in range(0, len(new_in_top), 15):
        chunk = new_in_top[i:i+15]
        print(f"-> Dịch batch AI {i//15 + 1}/{(len(new_in_top)+14)//15} ({len(chunk)} SP)...")
        trans = translate_batch_ai(chunk)
        ai_translations.update(trans)
        time.sleep(1.5)
        
    print(f"✅ Đã dịch xong {len(ai_translations)} sản phẩm bằng 9Router AI!")
    
    # Tải ảnh HD cho các sản phẩm mới
    print("-> Tải ảnh đại diện HD cho các sản phẩm mới...")
    for item in new_in_top:
        g = item["goodsNo"]
        thumb_url = item.get("thumbnailUrl")
        dest_dist = os.path.join(DIST_PRODUCTS, f"{g}.jpg")
        dest_public = os.path.join(PUBLIC_PRODUCTS, f"{g}.jpg")
        
        if not os.path.exists(dest_dist):
            download_image(thumb_url, dest_dist)
        if not os.path.exists(dest_public):
            download_image(thumb_url, dest_public)
            
    # ─────────────────────────────────────────────────────────────
    # PHA 3: TÔ XÁM VÀ CHÈN CHỮ "SOLD" CHO SẢN PHẨM NGỪNG BÁN
    # ─────────────────────────────────────────────────────────────
    print(f"\n🎨 [PHA 3] Xử lý đóng dấu 'SOLD' & Tô xám cho sản phẩm ngừng bán...")
    sold_count = 0
    for gid, res in scan_results.items():
        if res.get("isDiscontinued") or res.get("isSoldOut"):
            # Tìm ảnh đại diện
            for ext in ["png", "jpg", "jpeg", "webp"]:
                dist_img = os.path.join(DIST_PRODUCTS, f"{gid}.{ext}")
                public_img = os.path.join(PUBLIC_PRODUCTS, f"{gid}.{ext}")
                if os.path.exists(dist_img):
                    apply_sold_overlay(dist_img)
                    sold_count += 1
                if os.path.exists(public_img):
                    apply_sold_overlay(public_img)
                    
    print(f"✅ Đã xử lý tô xám và chèn chữ SOLD cho {sold_count} ảnh sản phẩm ngừng bán!")
    
    # ─────────────────────────────────────────────────────────────
    # PHA 4: TỔNG HỢP DỮ LIỆU ĐỂ GHI VÀO FIRESTORE & WEB CATALOG
    # ─────────────────────────────────────────────────────────────
    print(f"\n💾 [PHA 4] Tổng hợp dữ liệu cập nhật...")
    KRW_RATE = 19.5
    SERVICE_FEE_MULT = 1.05
    
    updated_catalog = []
    firestore_updates = []
    
    # 1. Thêm/Cập nhật Top 100
    for item in live_top100:
        gid = item["goodsNo"]
        rank = item["rank"]
        sale_krw = item["foreignPrice"]
        orig_krw = item["originalPrice"]
        discount = f"{round((1 - sale_krw / orig_krw) * 100)}%" if orig_krw > sale_krw else "0%"
        price_vnd = round(sale_krw * KRW_RATE * SERVICE_FEE_MULT)
        
        existing = fs_map.get(gid)
        if existing:
            # Update existing
            entry = dict(existing)
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
            # New product
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
            continue # Already in top 100
            
        res = scan_results.get(gid)
        entry = dict(existing)
        
        # Unset rank since it dropped out of Top 100
        if "rank" in entry:
            del entry["rank"]
            
        if res:
            if res.get("isDiscontinued") or res.get("isSoldOut"):
                # Mark as sold out / out of stock
                entry["is_sold_out"] = True
                entry["status"] = "out_of_stock"
                entry["isPublished"] = False
            else:
                # Still sold! Update price if we got live price
                if res.get("salePrice"):
                    sale_krw = res["salePrice"]
                    orig_krw = res.get("originPrice") or sale_krw
                    entry["foreignPrice"] = sale_krw
                    entry["price"] = sale_krw
                    entry["originalPrice"] = orig_krw
                    entry["discountRate"] = res.get("discountRate", "0%")
                    entry["priceVnd"] = round(sale_krw * KRW_RATE * SERVICE_FEE_MULT)
                entry["is_sold_out"] = False
                entry["status"] = "published"
                entry["isPublished"] = True
        else:
            # Fallback keep as is
            pass
            
        entry["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        updated_catalog.append(entry)
        firestore_updates.append(entry)
        
    # Save to local playwright_scraped_products.json
    with open(PLAYWRIGHT_JSON, "w", encoding="utf-8") as f:
        json.dump(updated_catalog, f, ensure_ascii=False, indent=2)
    print(f"📁 Đã lưu catalog offline gồm {len(updated_catalog)} sản phẩm vào {PLAYWRIGHT_JSON}")
    
    # Save update payload to temporary json for node sync script
    sync_payload_path = "/tmp/firestore_sync_payload.json"
    with open(sync_payload_path, "w", encoding="utf-8") as f:
        json.dump(firestore_updates, f, ensure_ascii=False, indent=2)
    print(f"📁 Đã tạo payload đồng bộ Firestore tại {sync_payload_path} ({len(firestore_updates)} sản phẩm).")

if __name__ == "__main__":
    main()
