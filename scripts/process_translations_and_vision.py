#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Process translations via tanlam and Vision QC for the 41 scraped items.
"""

import os
import json
import time
import urllib.request
from pathlib import Path

ROUTER_URL = "http://127.0.0.1:20128/v1/chat/completions"
SCRAPED_FILE = "/tmp/scraped_missing_top100.json"
ENRICHED_FILE = "/tmp/enriched_translated_missing_top100.json"

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

def main():
    with open(SCRAPED_FILE, "r", encoding="utf-8") as f:
        scraped = json.load(f)

    items = list(scraped.values())
    print(f"Bắt đầu dịch thuật & chuẩn hóa {len(items)} sản phẩm qua tanlam...")

    batch_size = 14
    translated_map = {}

    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        payload = []
        for it in batch:
            payload.append({
                "goodsNo": it["goodsNo"],
                "brandKr": it["brandKr"],
                "nameKr": it["nameKr"],
                "optionsKr": [o["nameKr"] for o in it.get("options", [])]
            })

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
        print(f"Đang dịch batch {i // batch_size + 1}/{(len(items) + batch_size - 1) // batch_size}...")
        raw = call_tanlam(prompt)
        cleaned = raw.strip()
        if cleaned.startswith("```json"): cleaned = cleaned[7:]
        if cleaned.startswith("```"): cleaned = cleaned[3:]
        if cleaned.endswith("```"): cleaned = cleaned[:-3]
        
        parsed = json.loads(cleaned.strip())
        for p in parsed:
            translated_map[p["goodsNo"]] = p

    print(f"✓ tanlam đã dịch xong {len(translated_map)} sản phẩm.")

    # Vision QC test on samples
    print("👁️ Khởi chạy Vision QC bằng tanlam trên các mẫu ảnh đại diện...")
    sample_gids = [items[0]["goodsNo"], items[10]["goodsNo"], items[20]["goodsNo"]]
    for gid in sample_gids:
        it = scraped[gid]
        img_url = it.get("thumbnailUrl")
        if img_url:
            v_payload = {
                "model": "tanlam",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Mô tả siêu ngắn gọn sản phẩm trong ảnh này bằng tiếng Việt (1 câu):"},
                            {"type": "image_url", "image_url": {"url": img_url}}
                        ]
                    }
                ],
                "max_tokens": 100,
                "stream": False
            }
            v_req = urllib.request.Request(
                ROUTER_URL,
                data=json.dumps(v_payload).encode("utf-8"),
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"},
                method="POST"
            )
            try:
                with urllib.request.urlopen(v_req, timeout=30) as v_resp:
                    v_res = json.loads(v_resp.read().decode("utf-8"))
                    desc = v_res["choices"][0]["message"]["content"].strip()
                    print(f"   [Vision QC #{it['rank']} {gid}]: {desc}")
            except Exception as e:
                print(f"   [Vision QC #{it['rank']} {gid}] Error: {e}")

    # Merge translations into enriched items
    enriched = []
    for it in items:
        gid = it["goodsNo"]
        t = translated_map.get(gid, {})
        
        opts_vi = t.get("options_vi", [])
        final_opts = []
        for idx, o in enumerate(it.get("options", [])):
            name_vi = opts_vi[idx] if idx < len(opts_vi) else o["nameKr"]
            # Clean hangul from name_vi if any left
            final_opts.append({
                "id": o.get("id", idx + 1),
                "name": name_vi,
                "name_vi": name_vi,
                "name_kr": o["nameKr"],
                "price_krw": o.get("priceKrw") or it["salePriceKrw"],
                "isSoldOut": o.get("isSoldOut", False),
                "imageUrl": o.get("imageUrl") or it.get("thumbnailUrl")
            })

        enriched.append({
            "goodsNo": gid,
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
            "thumbnailUrl": it["thumbnailUrl"],
            "images": it.get("images", [it["thumbnailUrl"]]),
            "options": final_opts,
            "isSoldOut": it.get("isSoldOut", False),
            "isPublished": True,
            "status": "available"
        })

    with open(ENRICHED_FILE, "w", encoding="utf-8") as f:
        json.dump(enriched, f, ensure_ascii=False, indent=2)

    print(f"✅ Đã lưu {len(enriched)} sản phẩm hoàn thiện vào {ENRICHED_FILE}!")

if __name__ == "__main__":
    main()
