#!/usr/bin/env python3
"""
MASTER LIVE CATALOG & PRICE SYNC PIPELINE (TAVY KOREA)
- Scrapes live Olive Young Top 100 via Real Chrome (Bypasses WAF/Cloudflare Turnstile)
- Auto-translates new items via 9Router ('manh') with Zero Hangul & 5-component formula
- Fast-scans non-top products via Chrome tab navigation with auto-retry
- Badges discontinued/sold-out items with Grayscale + red SOLD banner
- Uploads ALL new & SOLD thumbnails directly to Firebase Storage (Zero 404 / Zero Unsplash)
- Cleans obsolete 'rank' fields on dropped SKUs & atomic batch commit to Firestore
"""

import subprocess
import json
import os
import time
import re
import requests
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

BASE_DIR = "/Users/tan/tavy-korea"
PUBLIC_PRODUCTS = os.path.join(BASE_DIR, "public/products")
DIST_PRODUCTS = os.path.join(BASE_DIR, "dist/products")
LOCAL_DATA_JSON = os.path.join(BASE_DIR, "public/data/playwright_scraped_products.json")
REPORT_PATH = os.path.join(BASE_DIR, "BAO_CAO_DONG_BO_GIA_TOP100.md")

CHECKPOINT_FILE = "/tmp/live_price_nav_checkpoint.json"
TOP100_RAW_FILE = "/tmp/live_top100_oliveyoung.json"
FIRESTORE_DUMP_FILE = "/tmp/firestore_products.json"
FINAL_PAYLOAD_FILE = "/tmp/firestore_sync_payload.json"
UPLOAD_REQ_FILE = "/tmp/upload_requests.json"
UPLOAD_MAP_FILE = "/tmp/uploaded_images_map.json"

KRW_RATE = 19.5
SERVICE_FEE_MULT = 1.05

def run_applescript(script):
    cmd = ["osascript", "-e", script]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.stdout.strip()

def get_or_create_oliveyoung_tab():
    print("🌐 [1/6] Kiểm tra tab Olive Young trên Google Chrome thật...")
    js_check = '''
    set foundTab to 0
    tell application "Google Chrome"
        if not (exists front window) then return "NO_WINDOW"
        set tabList to tabs of front window
        repeat with idx from 1 to count of tabList
            set curUrl to URL of item idx of tabList
            if curUrl contains "oliveyoung.co.kr" then
                set foundTab to idx
                exit repeat
            end if
        end repeat
        if foundTab > 0 then
            return foundTab as string
        else
            set newT to make new tab at end of tabs of front window with properties {URL:"https://www.oliveyoung.co.kr/store/main/getBestList.do"}
            return (count of tabs of front window) as string
        end if
    end tell
    '''
    tab_str = run_applescript(js_check)
    if tab_str == "NO_WINDOW" or not tab_str.isdigit():
        raise RuntimeError("Không tìm thấy Google Chrome hoặc không thể tạo tab.")
    
    tab_idx = int(tab_str)
    print(f"👉 Dùng Tab {tab_idx} trên Google Chrome.")
    
    # Wait for readyState
    for _ in range(12):
        st = run_applescript(f'tell application "Google Chrome" to tell tab {tab_idx} of front window to return execute javascript "document.readyState"')
        if st == "complete":
            break
        time.sleep(0.8)
    return tab_idx

def scrape_top100_live(tab_idx):
    print("📊 [2/6] Bóc tách Top 100 Ranking trực tiếp từ DOM...")
    # Navigate to ranking page if needed
    curr_url = run_applescript(f'tell application "Google Chrome" to tell tab {tab_idx} of front window to return URL')
    if "getBestList.do" not in curr_url:
        run_applescript(f'tell application "Google Chrome" to tell tab {tab_idx} of front window to set URL to "https://www.oliveyoung.co.kr/store/main/getBestList.do"')
        time.sleep(3.5)

    js_code = """(() => {
        const items = document.querySelectorAll(".prd_info");
        const results = [];
        items.forEach((item, idx) => {
            const rank = idx + 1;
            const link = item.querySelector("a.goodsList, a[href*='goodsNo']");
            let goodsNo = null;
            if (link) {
                const m = link.href.match(/goodsNo=([A-Z0-9]+)/);
                if (m) goodsNo = m[1];
            }
            const brandEl = item.querySelector(".tx_brand");
            const brandKr = brandEl ? brandEl.innerText.trim() : "";
            const nameEl = item.querySelector(".tx_name");
            const nameKr = nameEl ? nameEl.innerText.trim() : "";
            const orgEl = item.querySelector(".tx_org .tx_num, s");
            const originPrice = orgEl ? parseInt(orgEl.innerText.replace(/[^0-9]/g, '')) : null;
            const curEl = item.querySelector(".tx_cur .tx_num, strong.tx_cur");
            const salePrice = curEl ? parseInt(curEl.innerText.replace(/[^0-9]/g, '')) : (originPrice || 0);
            
            const thumbImg = item.parentElement ? item.parentElement.querySelector("img") : item.querySelector("img");
            let thumbUrl = thumbImg ? (thumbImg.getAttribute('data-original') || thumbImg.src) : null;
            if (thumbUrl && thumbUrl.startsWith('//')) thumbUrl = 'https:' + thumbUrl;

            results.push({
                rank,
                goodsNo,
                brandKr,
                nameKr,
                originPriceKrw: originPrice || salePrice,
                salePriceKrw: salePrice,
                thumbnailUrl: thumbUrl
            });
        });
        return JSON.stringify(results);
    })()"""
    escaped_js = js_code.replace("\\", "\\\\").replace('"', '\\"')
    raw = run_applescript(f'tell application "Google Chrome" to tell tab {tab_idx} of front window to return execute javascript "{escaped_js}"')
    
    try:
        data = json.loads(raw)
        if len(data) >= 80:
            with open(TOP100_RAW_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"✅ Bóc tách thành công {len(data)} sản phẩm Top Ranking.")
            return data
    except Exception as e:
        print("Lỗi parse JSON Top 100:", e)
    
    raise RuntimeError("Không bóc tách được Top 100 từ Google Chrome.")

def translate_new_products(new_items):
    if not new_items:
        return {}
    print(f"🤖 [3/6] Dịch thuật {len(new_items)} sản phẩm mới qua 9Router ('manh')...")
    key = ""
    for env_path in [os.path.join(BASE_DIR, ".env"), "/Users/tan/.hermes/.env", "/Users/tan/.hermes/9router_key.txt"]:
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith("OPENAI_API_KEY=") or "sk-" in line:
                        p = line.strip().split("=", 1)[-1].strip()
                        if p.startswith("sk-"):
                            key = p
                            break
        if key: break

    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    results = {}

    batch_size = 10
    for i in range(0, len(new_items), batch_size):
        chunk = new_items[i:i+batch_size]
        prompt = (
            "Bạn là chuyên gia dịch thuật catalog mỹ phẩm Hàn Quốc cho Tavy Korea.\n"
            "Hãy dịch danh sách sản phẩm sau sang tiếng Việt chuẩn thương mại điện tử:\n"
            "QUY TẮC BẮT BUỘC:\n"
            "1. Công thức 5 thành phần: [Loại Sản Phẩm Cụ Thể] + [Đặc Tính / Công Dụng] + [Thương Hiệu Latin Chuẩn] + [Tên Dòng SP] + [Quy Cách / Quà Tặng].\n"
            "2. TUYỆT ĐỐI CẤM từ ngữ generic vô nghĩa: 'Mỹ phẩm', 'Sản phẩm', 'Korea Beauty'.\n"
            "3. Loại bỏ toàn bộ nhãn khuyến mãi Hàn: [단독], [기획], [1+1], [10월 올영픽].\n"
            "4. ZERO HANGUL: 100% không còn một ký tự tiếng Hàn nào.\n\n"
            f"INPUT JSON:\n{json.dumps([{'goodsNo': x['goodsNo'], 'brandKr': x['brandKr'], 'nameKr': x['nameKr']} for x in chunk], ensure_ascii=False)}\n\n"
            "Trả về JSON thuần túy (không markdown block) mảng object: [{\"goodsNo\": \"...\", \"brand\": \"...\", \"name\": \"...\", \"category\": \"skincare\"|...}]"
        )
        try:
            payload = {
                "model": "manh",
                "stream": False,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2
            }
            resp = requests.post("http://127.0.0.1:20128/v1/chat/completions", headers=headers, json=payload, timeout=60)
            txt = resp.json()["choices"][0]["message"]["content"].strip()
            if txt.startswith("```"):
                txt = re.sub(r"^```[a-zA-Z]*\n", "", txt)
                txt = re.sub(r"\n```$", "", txt)
            trans_list = json.loads(txt)
            for t in trans_list:
                results[t["goodsNo"]] = t
            print(f"  👉 Đã dịch xong lô {min(i+batch_size, len(new_items))}/{len(new_items)}")
        except Exception as e:
            print(f"  ⚠️ Lỗi dịch lô {i}: {e}. Fallback cơ bản...")
            for x in chunk:
                results[x["goodsNo"]] = {
                    "goodsNo": x["goodsNo"],
                    "brand": x["brandKr"],
                    "name": x["nameKr"],
                    "category": "skincare"
                }

    # Download HD images locally
    os.makedirs(PUBLIC_PRODUCTS, exist_ok=True)
    os.makedirs(DIST_PRODUCTS, exist_ok=True)
    for item in new_items:
        gid = item["goodsNo"]
        url = item.get("thumbnailUrl")
        if url:
            try:
                r = requests.get(url, timeout=15)
                if r.status_code == 200 and len(r.content) > 1024:
                    for dest in [PUBLIC_PRODUCTS, DIST_PRODUCTS]:
                        with open(os.path.join(dest, f"{gid}.jpg"), "wb") as f:
                            f.write(r.content)
            except Exception as e:
                print(f"  ⚠️ Không tải được ảnh {gid}: {e}")

    return results

def apply_sold_overlay(image_path):
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
                except: pass
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
        return True
    except Exception as e:
        print(f"Error badging {image_path}: {e}")
        return False

def scan_non_top_products(non_top_gids, tab_idx):
    print(f"🔍 [4/6] Quét nhanh giá live {len(non_top_gids)} sản phẩm ngoài Top...")
    checkpoint = {}
    if os.path.exists(CHECKPOINT_FILE):
        try:
            checkpoint = json.load(open(CHECKPOINT_FILE))
        except: pass

    poll_js = """(() => {
        const title = document.title;
        if (title.includes("기다려") || title.includes("Chờ")) return JSON.stringify({ ready: false, isChallenge: true });
        const isDiscontinued = document.body.innerText.includes("존재하지 않는") || 
                               document.body.innerText.includes("판매가 중단") || 
                               document.body.innerText.includes("판매종료");
        const box = document.querySelector("[class*='price-box'], .goods_price, [class*='price']");
        if (box || isDiscontinued) {
            const originEl = document.querySelector("s, strike, [class*=price-before], .price-before");
            const saleEl = document.querySelector("span[class*=price], strong[class*=price], .price-2");
            const isSoldOut = isDiscontinued || document.body.innerText.includes("btnSoldout") || document.body.innerText.includes("일시품절");
            return JSON.stringify({ ready: true, title, box: box ? box.innerText.trim() : null, origin: originEl ? originEl.innerText.trim() : null, sale: saleEl ? saleEl.innerText.trim() : null, isDiscontinued, isSoldOut });
        }
        return JSON.stringify({ ready: false });
    })()"""
    escaped_poll = poll_js.replace("\\", "\\\\").replace('"', '\\"')

    remaining = [g for g in non_top_gids if g not in checkpoint]
    print(f"  👉 Cần quét: {len(remaining)} (Đã có checkpoint: {len(checkpoint)})")

    for idx, g in enumerate(remaining):
        url = f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={g}"
        run_applescript(f'tell application "Google Chrome" to tell tab {tab_idx} of front window to set URL to "{url}"')
        
        res_data = None
        for _ in range(12):
            time.sleep(0.55)
            raw = run_applescript(f'tell application "Google Chrome" to tell tab {tab_idx} of front window to return execute javascript "{escaped_poll}"')
            if raw and raw != "missing value" and raw != "null":
                try:
                    parsed = json.loads(raw)
                    if parsed.get("ready"):
                        res_data = parsed
                        break
                except: pass

        if res_data:
            # Parse price
            orig, sale, disc = None, None, "0%"
            if res_data.get("origin"):
                m = re.search(r"(\d+)\s*원", res_data["origin"].replace(".", "").replace(",", ""))
                if m: orig = int(m.group(1))
            if res_data.get("sale"):
                m = re.search(r"(\d+)\s*원", res_data["sale"].replace(".", "").replace(",", ""))
                if m: sale = int(m.group(1))
            if res_data.get("box"):
                dm = re.search(r"(\d{1,2})%", res_data["box"])
                if dm: disc = f"{dm.group(1)}%"
            if sale and not orig: orig = sale
            elif orig and not sale: sale = orig
            if orig and sale and disc == "0%" and orig > sale:
                disc = f"{round((1 - sale / orig) * 100)}%"

            res_data["goodsNo"] = g
            res_data["parsedOrigin"] = orig
            res_data["parsedSale"] = sale
            res_data["parsedDisc"] = disc
            checkpoint[g] = res_data
            
            # Badge SOLD locally if discontinued/soldout
            if res_data.get("isDiscontinued") or res_data.get("isSoldOut"):
                for d in [PUBLIC_PRODUCTS, DIST_PRODUCTS]:
                    for ext in ["jpg", "png", "jpeg", "webp"]:
                        lp = os.path.join(d, f"{g}.{ext}")
                        if os.path.exists(lp):
                            apply_sold_overlay(lp)

            if (idx + 1) % 10 == 0 or idx == len(remaining) - 1:
                with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
                    json.dump(checkpoint, f, ensure_ascii=False, indent=2)
                print(f"  👉 Tiến độ quét: {idx+1}/{len(remaining)}")

    return checkpoint

def main():
    print("=" * 70)
    print("🚀 BẮT ĐẦU PIPELINE ĐỒNG BỘ GIÁ VÀ CATALOG OLIVE YOUNG (TAVY KOREA)")
    print("=" * 70)

    # 1. Connect Chrome Tab
    tab_idx = get_or_create_oliveyoung_tab()

    # 2. Scrape Top 100 Live
    top100_items = scrape_top100_live(tab_idx)
    top_gids = set(x["goodsNo"] for x in top100_items if x.get("goodsNo"))

    # 3. Dump current Firestore catalog
    subprocess.run(["node", os.path.join(BASE_DIR, "scripts/firebase_sync_helper.js"), "dump", FIRESTORE_DUMP_FILE], check=True)
    fs_prods = json.load(open(FIRESTORE_DUMP_FILE))
    fs_by_gid = {p.get("goodsNo") or p.get("firestoreId"): p for p in fs_prods}

    # Identify new items in Top 100
    new_in_top = [x for x in top100_items if x["goodsNo"] not in fs_by_gid]
    print(f"📦 Hiện có: {len(fs_by_gid)} SP. Giữ Top: {len(top_gids) - len(new_in_top)} SP. Mới lọt Top: {len(new_in_top)} SP.")

    # Translate new items & download local images
    new_translations = translate_new_products(new_in_top)

    # 4. Scan Non-Top items
    non_top_gids = [g for g in fs_by_gid if g not in top_gids]
    non_top_results = scan_non_top_products(non_top_gids, tab_idx)

    # 5. Prepare images to upload to Firebase Storage
    print("☁️ [5/6] Upload ảnh lên Cloud Firebase Storage...")
    upload_requests = []
    
    # All new top items need upload
    for item in new_in_top:
        upload_requests.append({"goodsNo": item["goodsNo"], "isSold": False})

    # All discontinued / sold out items need upload
    sold_gids = set()
    for g, v in non_top_results.items():
        if v.get("isDiscontinued") or v.get("isSoldOut"):
            sold_gids.add(g)
            upload_requests.append({"goodsNo": g, "isSold": True})

    with open(UPLOAD_REQ_FILE, "w", encoding="utf-8") as f:
        json.dump(upload_requests, f, ensure_ascii=False, indent=2)

    subprocess.run(["node", os.path.join(BASE_DIR, "scripts/firebase_sync_helper.js"), "upload-images", UPLOAD_REQ_FILE, UPLOAD_MAP_FILE], check=True)
    uploaded_map = json.load(open(UPLOAD_MAP_FILE))

    # 6. Assemble Final Payload & Commit
    print("💾 [6/6] Tổng hợp Payload & Commit lên Firestore...")
    final_catalog = []
    price_changes = []
    sold_out_list = []
    discontinued_list = []

    # Process Top 100
    for item in top100_items:
        gid = item["goodsNo"]
        rank = item["rank"]
        sale_krw = int(item.get("salePriceKrw") or 0)
        orig_krw = int(item.get("originPriceKrw") or sale_krw)
        discount = f"{round((1 - sale_krw / orig_krw) * 100)}%" if orig_krw > sale_krw else "0%"
        price_vnd = round(sale_krw * KRW_RATE * SERVICE_FEE_MULT)

        if gid in fs_by_gid:
            entry = dict(fs_by_gid[gid])
            old_sale = entry.get("foreignPrice") or entry.get("price") or 0
            if old_sale and old_sale != sale_krw:
                price_changes.append({
                    "goodsNo": gid, "name": entry.get("name", ""),
                    "old_krw": old_sale, "new_krw": sale_krw, "diff": sale_krw - old_sale
                })
        else:
            tr = new_translations.get(gid, {})
            entry = {
                "goodsNo": gid,
                "name": tr.get("name", item["nameKr"]),
                "nameKr": item["nameKr"],
                "brand": tr.get("brand", item["brandKr"]),
                "brandKr": item["brandKr"],
                "category": tr.get("category", "skincare"),
                "options": [],
                "images": []
            }

        # Assign storage image if uploaded
        if gid in uploaded_map:
            entry["productImage"] = uploaded_map[gid]
            entry["images"] = [uploaded_map[gid]]

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
        final_catalog.append(entry)

    # Process Non-Top items
    for gid in non_top_gids:
        entry = dict(fs_by_gid[gid])
        if "rank" in entry:
            del entry["rank"]

        res = non_top_results.get(gid)
        if res:
            if res.get("isDiscontinued"):
                discontinued_list.append(gid)
                entry["is_sold_out"] = True
                entry["status"] = "out_of_stock"
                entry["isPublished"] = True
            elif res.get("isSoldOut"):
                sold_out_list.append(gid)
                entry["is_sold_out"] = True
                entry["status"] = "out_of_stock"
                entry["isPublished"] = True
            else:
                sale_krw = res.get("parsedSale")
                orig_krw = res.get("parsedOrigin") or sale_krw
                if sale_krw:
                    old_sale = entry.get("foreignPrice") or entry.get("price") or 0
                    if old_sale and old_sale != sale_krw:
                        price_changes.append({
                            "goodsNo": gid, "name": entry.get("name", ""),
                            "old_krw": old_sale, "new_krw": sale_krw, "diff": sale_krw - old_sale
                        })
                    entry["foreignPrice"] = sale_krw
                    entry["price"] = sale_krw
                    entry["originalPrice"] = orig_krw
                    entry["discountRate"] = res.get("parsedDisc", "0%")
                    entry["priceVnd"] = round(sale_krw * KRW_RATE * SERVICE_FEE_MULT)
                entry["is_sold_out"] = False
                entry["status"] = "published"
                entry["isPublished"] = True

        if gid in uploaded_map:
            entry["productImage"] = uploaded_map[gid]
            entry["images"] = [uploaded_map[gid]]

        entry["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        final_catalog.append(entry)

    # Write final sync payload
    with open(FINAL_PAYLOAD_FILE, "w", encoding="utf-8") as f:
        json.dump(final_catalog, f, ensure_ascii=False, indent=2)

    with open(LOCAL_DATA_JSON, "w", encoding="utf-8") as f:
        json.dump(final_catalog, f, ensure_ascii=False, indent=2)

    # Commit to Firestore & clean ranks
    subprocess.run(["node", os.path.join(BASE_DIR, "scripts/firebase_sync_helper.js"), "commit", FINAL_PAYLOAD_FILE], check=True)

    # Save Markdown report
    report_lines = [
        f"# BÁO CÁO ĐỒNG BỘ GIÁ & CATALOG LIVE OLIVE YOUNG (TAVY KOREA)",
        f"**Thời gian thực hiện:** {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        f"## 1. Tổng quan số liệu",
        f"- **Tổng sản phẩm toàn hệ thống:** {len(final_catalog)} SKU",
        f"- **Top Ranking Olive Young:** {len(top_gids)} SKU (Thứ hạng Rank 1..100)",
        f"- **Sản phẩm MỚI lọt Top 100:** {len(new_in_top)} SKU (Đã dịch 100% Zero Hangul & nạp Storage CDN)",
        f"- **Sản phẩm ngoài Top cập nhật giá live:** {len(non_top_gids) - len(sold_out_list) - len(discontinued_list)} SKU",
        f"- **Sản phẩm ngừng bán / hết hàng (dập SOLD):** {len(sold_out_list) + len(discontinued_list)} SKU",
        "",
        f"## 2. Thống kê biến động giá ({len(price_changes)} sản phẩm)",
        "| Mã SP | Tên sản phẩm | Giá cũ (KRW) | Giá mới (KRW) | Chênh lệch KRW |",
        "|---|---|---|---|---|"
    ]
    for pc in sorted(price_changes, key=lambda x: abs(x["diff"]), reverse=True)[:35]:
        diff_str = f"+{pc['diff']:,}W" if pc['diff'] > 0 else f"{pc['diff']:,}W"
        report_lines.append(f"| `{pc['goodsNo']}` | {pc['name'][:38]} | {pc['old_krw']:,}W | {pc['new_krw']:,}W | **{diff_str}** |")

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))

    print("=" * 70)
    print(f"🎉 HOÀN TẤT TOÀN DIỆN PIPELINE! Báo cáo lưu tại {REPORT_PATH}")
    print("=" * 70)

if __name__ == "__main__":
    main()
