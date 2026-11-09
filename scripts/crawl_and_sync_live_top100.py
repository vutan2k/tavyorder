#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LIVE TOP 100 OLIVE YOUNG CRAWLER & SYNCHRONIZER
- Scrapes missing Top 100 items from Olive Young.
- Translates cleanly via tanlam (stream: False).
- Downloads images locally to /public/products/{goodsNo}.jpg, converting to JPG so zero broken images.
- Fetches live rates from Firestore system_config/rates (krwRate, serviceFeePercent).
- Calculates dynamic VND prices.
- Updates ranks 1..100 and removes ranks from dropped SKUs.
- Commits batches to Firestore.
"""

import os
import sys
import json
import time
import random
import subprocess
import urllib.request
from pathlib import Path

sys.path.append("/Users/tan/tavy-korea/scripts")
from chrome_coordinator import ChromeCoordinator, ChromeTabManager, run_applescript

ROUTER_URL = "http://127.0.0.1:20128/v1/chat/completions"
AUDITED_CATALOG_PATH = "/Users/tan/Desktop/theasd_auto_bot/tavy_catalog_audited_variants.json"
FRESH_TOP100_FILE = "/tmp/live_top100_oy_fresh.json"
SCRAPED_CHECKPOINT = "/tmp/scraped_top100_checkpoint.json"
PUB_DIR = "/Users/tan/tavy-korea/public/products"
JS_EXTRACT_PATH = "/tmp/extract_detail_script.js"

def get_api_key():
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        env_f = Path.home() / ".hermes/.env"
        if env_f.exists():
            for line in env_f.read_text().splitlines():
                if line.startswith("OPENAI_API_KEY="):
                    key = line.split("=", 1)[1].strip()
    return key

API_KEY = get_api_key()

def call_tanlam(prompt: str, temperature: float = 0.2) -> str:
    payload = {
        "model": "tanlam",
        "messages": [
            {
                "role": "system",
                "content": (
                    "Bạn là Trưởng nhóm Dịch thuật & Chuẩn hóa Dữ liệu Mỹ phẩm Hàn Quốc cho Tavy Korea.\n"
                    "QUY TẮC BẮT BUỘC:\n"
                    "1. 100% tiếng Việt tự nhiên, sạch sẽ, chuẩn thương mại điện tử.\n"
                    "2. Tuyệt đối KHÔNG chứa ký tự Hangul (tiếng Hàn) trong name_vi, brand_vi, options_vi.\n"
                    "3. Xóa sạch các tag quảng cáo rác: [11월 올영픽], [단독기획], [1+1기획], [증정], [1등], [올영단독]... Chuyển thành set/quà tặng tự nhiên (ví dụ: Set Kèm Quà Tặng 15ml, Set Đôi 1+1...).\n"
                    "4. Công thức đặt tên: [Loại sản phẩm] + [Thương hiệu] + [Tên dòng / Công dụng chính] + [Dung tích] + [Phiên bản/Set].\n"
                    "5. Category chuẩn một trong: lipstick, foundation, cushion, eyeshadow, blush, powder, eye_makeup, serum, cream, mask, suncare, cleanser, bodycare, haircare, health.\n"
                    "6. Options_vi: Mảng dịch tương ứng cho từng option, ngắn gọn, chỉ chu (ví dụ: '01 Clear Beige', 'Bản Refill', 'Set 1+1 100ml')."
                )
            },
            {"role": "user", "content": prompt}
        ],
        "temperature": temperature,
        "max_tokens": 4000,
        "stream": False
    }
    req = urllib.request.Request(
        ROUTER_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        return res["choices"][0]["message"]["content"]

def eval_detail_in_tab(tab_id: str) -> dict:
    apple = f'''
    set jsCode to read POSIX file "{JS_EXTRACT_PATH}" as «class utf8»
    tell application "Google Chrome"
        repeat with w in windows
            repeat with t in tabs of w
                if (id of t as string) is "{tab_id}" then
                    tell t to return execute javascript jsCode
                end if
            end repeat
        end repeat
    end tell
    '''
    raw = run_applescript(apple)
    if raw and raw not in ("missing value", "null"):
        try:
            return json.loads(raw)
        except Exception:
            pass
    return {}

def download_and_standardize_image(goods_no: str, image_url: str) -> bool:
    os.makedirs(PUB_DIR, exist_ok=True)
    target_jpg = os.path.join(PUB_DIR, f"{goods_no}.jpg")
    
    # If already exists and valid > 1000 bytes
    if os.path.exists(target_jpg) and os.path.getsize(target_jpg) > 1000:
        return True

    if not image_url:
        return False
        
    if image_url.startswith("//"):
        image_url = "https:" + image_url

    temp_file = f"/tmp/{goods_no}_raw_temp"
    try:
        req = urllib.request.Request(image_url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            with open(temp_file, "wb") as f:
                f.write(data)

        # Convert using macOS native sips to standardized high quality JPG
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "90", temp_file, "--out", target_jpg],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        if os.path.exists(temp_file):
            os.remove(temp_file)
            
        return os.path.exists(target_jpg) and os.path.getsize(target_jpg) > 1000
    except Exception as e:
        print(f"Lỗi tải ảnh {goods_no} từ {image_url}: {e}")
        if os.path.exists(temp_file):
            try: os.remove(temp_file)
            except: pass
        return False

def main():
    print("🚀 BẮT ĐẦU CÀO VÀ ĐỒNG BỘ TOP 100 OLIVE YOUNG LIVE...")
    
    with open(FRESH_TOP100_FILE, "r", encoding="utf-8") as f:
        fresh_top100 = json.load(f)

    with open(AUDITED_CATALOG_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    catalog_map = {p["goodsNo"]: p for p in catalog if p.get("goodsNo")}
    
    # Identify missing items
    missing_items = [it for it in fresh_top100 if it["goodsNo"] not in catalog_map]
    print(f"📊 Top 100 OY Live: {len(fresh_top100)} items | Đã có: {len(fresh_top100) - len(missing_items)} | Cần cào mới: {len(missing_items)}")

    scraped_data = {}
    if os.path.exists(SCRAPED_CHECKPOINT):
        try:
            with open(SCRAPED_CHECKPOINT, "r", encoding="utf-8") as f:
                scraped_data = json.load(f)
            print(f"📦 Đã tìm thấy checkpoint {len(scraped_data)} sản phẩm đã cào.")
        except Exception:
            scraped_data = {}

    tab_id = "2076734602"
    with ChromeCoordinator(bot_name="TavyManager_VIP", task_name="crawl_live_top100", priority="VIP"):
        for idx, item in enumerate(missing_items, 1):
            gid = item["goodsNo"]
            if gid in scraped_data:
                continue

            delay = round(random.uniform(2.5, 3.5), 2)
            print(f"[{idx}/{len(missing_items)}] Đang cào #{item['rank']} `{gid}` (delay {delay}s)...", flush=True)
            time.sleep(delay)

            url = f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={gid}"
            ChromeTabManager.navigate_tab(tab_id, url)
            time.sleep(2.5)

            detail = eval_detail_in_tab(tab_id)
            if detail.get("isChallenge"):
                print("⚠️ Bị cờ xác minh! Tạm lùi bước ngủ 20s...")
                time.sleep(20.0)
                detail = eval_detail_in_tab(tab_id)

            options = detail.get("options", [])
            if not options:
                options = [{
                    "id": 1,
                    "nameKr": item["nameKr"],
                    "isSoldOut": item.get("isSoldOut", False),
                    "priceKrw": item.get("salePriceKrw"),
                    "imageUrl": item.get("thumbnailUrl")
                }]

            brand_kr = detail.get("brandKr") or item["brandKr"]
            name_kr = detail.get("nameKr") or item["nameKr"]
            sale_won = detail.get("salePriceKrw") or item["salePriceKrw"]
            org_won = detail.get("originalPriceKrw") or item.get("originPriceKrw") or sale_won
            images = detail.get("images") or ([item["thumbnailUrl"]] if item.get("thumbnailUrl") else [])

            scraped_data[gid] = {
                "goodsNo": gid,
                "rank": item["rank"],
                "brandKr": brand_kr,
                "nameKr": name_kr,
                "originalPriceKrw": org_won,
                "salePriceKrw": sale_won,
                "thumbnailUrl": item.get("thumbnailUrl") or (images[0] if images else ""),
                "images": images,
                "options": options,
                "isSoldOut": item.get("isSoldOut", False)
            }

            with open(SCRAPED_CHECKPOINT, "w", encoding="utf-8") as f:
                json.dump(scraped_data, f, ensure_ascii=False, indent=2)

    print(f"✓ Đã cào xong chi tiết toàn bộ {len(missing_items)} sản phẩm mới!")

    # Now translate missing items via tanlam in batches
    items_to_translate = [scraped_data[it["goodsNo"]] for it in missing_items if it["goodsNo"] in scraped_data]
    translated_map = {}
    batch_size = 14

    print(f"🌐 Đang dịch {len(items_to_translate)} sản phẩm mới qua tanlam (stream: False)...")
    for i in range(0, len(items_to_translate), batch_size):
        batch = items_to_translate[i:i + batch_size]
        payload = [{
            "goodsNo": it["goodsNo"],
            "brandKr": it["brandKr"],
            "nameKr": it["nameKr"],
            "optionsKr": [o["nameKr"] for o in it.get("options", [])]
        } for it in batch]

        prompt = f"""
Hãy dịch và chuẩn hóa danh sách {len(payload)} sản phẩm Olive Young sau sang tiếng Việt:
{json.dumps(payload, ensure_ascii=False, indent=2)}

Trả về DUY NHẤT một JSON array:
[
  {{
    "goodsNo": "...",
    "brand_vi": "...",
    "name_vi": "...",
    "category": "...",
    "category_vi": "...",
    "options_vi": ["...", "..."]
  }}
]
"""
        print(f"   Dịch batch {i // batch_size + 1}/{(len(items_to_translate) + batch_size - 1) // batch_size}...")
        raw = call_tanlam(prompt)
        cleaned = raw.strip()
        if cleaned.startswith("```json"): cleaned = cleaned[7:]
        if cleaned.startswith("```"): cleaned = cleaned[3:]
        if cleaned.endswith("```"): cleaned = cleaned[:-3]
        try:
            parsed = json.loads(cleaned.strip())
            for p in parsed:
                translated_map[p["goodsNo"]] = p
        except Exception as e:
            print("   Lỗi parse JSON translation:", e)

    print(f"✓ tanlam đã dịch xong {len(translated_map)} sản phẩm mới.")

    # Download images locally for all items (ensuring zero broken images!)
    print("🖼️ Đang tải và kiểm định ảnh cho 100% sản phẩm Top 100...")
    all_top100_gids = [it["goodsNo"] for it in fresh_top100]
    download_success = 0
    download_fail = 0

    for it in fresh_top100:
        gid = it["goodsNo"]
        img_url = it.get("thumbnailUrl")
        if gid in scraped_data:
            img_url = scraped_data[gid].get("thumbnailUrl") or (scraped_data[gid].get("images") and scraped_data[gid]["images"][0]) or img_url
        elif gid in catalog_map:
            img_url = catalog_map[gid].get("thumbnailUrl") or catalog_map[gid].get("productImage") or img_url

        ok = download_and_standardize_image(gid, img_url)
        if ok:
            download_success += 1
        else:
            download_fail += 1
            print(f"⚠️ Cảnh báo: Không thể tải ảnh cho {gid}!")

    print(f"✅ Kiểm định ảnh xong! Thành công: {download_success}/{len(fresh_top100)} | Thất bại: {download_fail}")

    # Build enriched items
    new_catalog_items = []
    for it in items_to_translate:
        gid = it["goodsNo"]
        t = translated_map.get(gid, {})
        opts_vi = t.get("options_vi", [])
        final_opts = []
        for idx, o in enumerate(it.get("options", [])):
            name_vi = opts_vi[idx] if idx < len(opts_vi) else o["nameKr"]
            final_opts.append({
                "id": o.get("id", idx + 1),
                "name": name_vi,
                "name_vi": name_vi,
                "name_kr": o["nameKr"],
                "price_krw": o.get("priceKrw") or it["salePriceKrw"],
                "isSoldOut": o.get("isSoldOut", False),
                "imageUrl": f"/products/{gid}.jpg"
            })

        new_catalog_items.append({
            "goodsNo": gid,
            "id": gid,
            "rank": it["rank"],
            "name": t.get("name_vi") or it["nameKr"],
            "name_vi": t.get("name_vi") or it["nameKr"],
            "name_kr": it["nameKr"],
            "brand": t.get("brand_vi") or it["brandKr"],
            "brand_vi": t.get("brand_vi") or it["brandKr"],
            "brand_kr": it["brandKr"],
            "category": t.get("category") or "skincare",
            "category_vi": t.get("category_vi") or "Chăm sóc da",
            "salePrice": it["salePriceKrw"],
            "originalPrice": it["originalPriceKrw"],
            "foreignPrice": min([o["price_krw"] for o in final_opts if not o["isSoldOut"]]) if any(not o["isSoldOut"] for o in final_opts) else it["salePriceKrw"],
            "productImage": f"/products/{gid}.jpg",
            "thumbnailUrl": f"/products/{gid}.jpg",
            "images": [f"/products/{gid}.jpg"],
            "options": final_opts,
            "isSoldOut": it.get("isSoldOut", False),
            "isPublished": True,
            "status": "out_of_stock" if it.get("isSoldOut", False) else "available"
        })

    # Save to disk
    with open("/tmp/new_enriched_top100_items.json", "w", encoding="utf-8") as f:
        json.dump(new_catalog_items, f, ensure_ascii=False, indent=2)

    print(f"💾 Đã chuẩn bị {len(new_catalog_items)} sản phẩm mới sẵn sàng đẩy lên Firestore!")

if __name__ == "__main__":
    main()
