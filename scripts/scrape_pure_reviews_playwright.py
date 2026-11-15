#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TAVY KOREA: PURE GDAS REVIEW HARVESTER (PLAYWRIGHT ENGINE)
- Scrapes strictly from Olive Young's Shadow DOM widget (<oy-review-review-in-product>).
- Filters 100% genuine user review photos ('gdasEditor'), stripping '?RS=...' for full HD.
- Bypasses Cloudflare Turnstile blocks by using clean headless Chrome instance on local Seoul IP.
- Checkpoints progressively to /tmp/pure_reviews_checkpoint.json after every SKU.
"""

import os
import sys
import json
import time
import asyncio
import argparse
from pathlib import Path
from playwright.async_api import async_playwright

AUDITED_CATALOG_PATH = "/Users/tan/Desktop/theasd_auto_bot/tavy_catalog_audited_variants.json"
PLAYWRIGHT_CATALOG_PATH = "/Users/tan/tavy-korea/public/data/playwright_scraped_products.json"
ALL_CATALOG_PATH = "/Users/tan/tavy-korea/public/data/all_products_catalog.json"
CHECKPOINT_PATH = "/tmp/pure_reviews_checkpoint.json"
CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

JS_EXTRACT_REVIEWS = """(() => {
    function getAllImagesInNode(root) {
        let imgs = [];
        if (!root) return imgs;
        if (root.querySelectorAll) {
            root.querySelectorAll('img').forEach(i => {
                if (i.src) imgs.push(i.src);
            });
        }
        const children = root.querySelectorAll ? root.querySelectorAll('*') : [];
        children.forEach(el => {
            if (el.shadowRoot) imgs.push(...getAllImagesInNode(el.shadowRoot));
        });
        return imgs;
    }
    
    const reviewWidget = document.querySelector('oy-review-review-in-product');
    const allShadowImgs = reviewWidget ? getAllImagesInNode(reviewWidget.shadowRoot || reviewWidget) : [];
    const gdasOnly = allShadowImgs
        .filter(s => s && s.includes('gdasEditor'))
        .map(s => s.split('?')[0]);
        
    return [...new Set(gdasOnly)];
})()"""

async def scrape_reviews(limit: int = 100, ranked_only: bool = False):
    print("🚀 BẮT ĐẦU CÀO REVIEW GDAS NGƯỜI THẬT TỪ OLIVE YOUNG (PLAYWRIGHT)...", flush=True)

    with open(ALL_CATALOG_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    # 1. Tải checkpoint
    checkpoint = {}
    if os.path.exists(CHECKPOINT_PATH):
        try:
            with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
                checkpoint = json.load(f)
            print(f"📦 Đã tìm thấy checkpoint với {len(checkpoint)} SKU.", flush=True)
        except Exception:
            checkpoint = {}

    # 2. Lọc danh sách SKU cần cào
    # Chỉ cào các SKU của Olive Young (goodsNo bắt đầu bằng 'A'), không phải high-end
    ranked_missing = []
    unranked_missing = []

    for p in catalog:
        gid = p.get("goodsNo") or p.get("id")
        if not gid or not str(gid).startswith("A") or p.get("isHighEnd"):
            continue
        
        # Nếu đã có review hợp lệ trong catalog thì bỏ qua
        cur_reviews = p.get("photoReviews", [])
        if cur_reviews and any("gdasEditor" in r for r in cur_reviews):
            continue

        # Nếu đã có trong checkpoint với review > 0 thì bỏ qua
        if gid in checkpoint and len(checkpoint[gid]) > 0:
            continue

        if p.get("rank"):
            ranked_missing.append(p)
        else:
            unranked_missing.append(p)

    ranked_missing.sort(key=lambda x: int(x.get("rank") or 9999))
    print(f"🎯 SKU Top 100 thiếu review: {len(ranked_missing)} | SKU thường thiếu review: {len(unranked_missing)}", flush=True)

    target_items = ranked_missing
    if not ranked_only:
        target_items = ranked_missing + unranked_missing

    if limit > 0:
        target_items = target_items[:limit]

    print(f"📋 Mục tiêu đợt này: {len(target_items)} SKU", flush=True)
    if not target_items:
        print("✅ Tất cả SKU mục tiêu đã có review trong checkpoint/catalog!")
        return

    success_count = 0
    zero_count = 0
    err_count = 0

    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch(
        headless=True,
        executable_path=CHROME_BIN,
        args=["--no-sandbox", "--disable-dev-shm-usage"]
    )

    context = await browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        viewport={"width": 1280, "height": 800}
    )
    page = await context.new_page()

    op_count = 0
    for idx, item in enumerate(target_items, 1):
        gid = item.get("goodsNo") or item.get("id")
        rank = item.get("rank", "Thường")
        name = (item.get("name_vi") or item.get("name", ""))[:30]

        print(f"[{idx}/{len(target_items)}] (#{rank}) `{gid}` - {name}...", end=" ", flush=True)
        url = f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={gid}&tab=review"

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            await page.wait_for_timeout(1800)
            await page.evaluate("window.scrollTo(0, 2200)")
            await page.wait_for_timeout(1200)

            imgs = await page.evaluate(JS_EXTRACT_REVIEWS)
            if not imgs:
                # Scroll thêm lần nữa nếu chưa mount
                await page.evaluate("window.scrollTo(0, 3600)")
                await page.wait_for_timeout(1200)
                imgs = await page.evaluate(JS_EXTRACT_REVIEWS)

            pure_gdas = [url.split("?")[0] for url in imgs if "gdasEditor" in url]
            pure_gdas = list(dict.fromkeys(pure_gdas))[:10]  # Giữ tối đa 10 ảnh thật

            checkpoint[gid] = pure_gdas
            with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
                json.dump(checkpoint, f, ensure_ascii=False, indent=2)

            if pure_gdas:
                success_count += 1
                print(f"✓ {len(pure_gdas)} ảnh GDAS", flush=True)
            else:
                zero_count += 1
                print(f"- 0 ảnh review OY", flush=True)

        except Exception as e:
            err_count += 1
            checkpoint[gid] = []
            with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
                json.dump(checkpoint, f, ensure_ascii=False, indent=2)
            print(f"⚠️ Lỗi: {str(e)[:50]}", flush=True)

        op_count += 1
        # Tái tạo context mỗi 15 SKU để giữ RAM < 200MB trên máy 8GB RAM
        if op_count >= 15:
            await context.close()
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800}
            )
            page = await context.new_page()
            op_count = 0

    await browser.close()
    await playwright.stop()

    print(f"\n📊 KẾT QUẢ ĐỢT CÀO: Thành công {success_count} SKU có ảnh | {zero_count} SKU không có review | {err_count} lỗi", flush=True)

def apply_checkpoint_to_catalogs():
    print("🔄 ĐANG ĐỒNG BỘ CHECKPOINT VÀO 3 FILE CATALOG...", flush=True)
    if not os.path.exists(CHECKPOINT_PATH):
        print("❌ Không tìm thấy checkpoint!")
        return

    with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
        checkpoint = json.load(f)

    with open(ALL_CATALOG_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    updated_count = 0
    total_with_reviews = 0

    for p in catalog:
        gid = p.get("goodsNo") or p.get("id")
        
        # Nếu có trong checkpoint và checkpoint có ảnh mới
        if gid in checkpoint and len(checkpoint[gid]) > 0:
            if not p.get("photoReviews") or len(p["photoReviews"]) == 0:
                p["photoReviews"] = checkpoint[gid]
                p["lastAuditedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                updated_count += 1
            else:
                p["photoReviews"] = checkpoint[gid]
        else:
            # Lọc sạch dữ liệu hiện có: chỉ giữ gdasEditor
            cur = p.get("photoReviews", [])
            p["photoReviews"] = [r.split("?")[0] for r in cur if r and "gdasEditor" in r]

        if p.get("photoReviews") and len(p["photoReviews"]) > 0:
            total_with_reviews += 1

    for path in [AUDITED_CATALOG_PATH, PLAYWRIGHT_CATALOG_PATH, ALL_CATALOG_PATH]:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(catalog, f, ensure_ascii=False, indent=2)
        print(f"✓ Đã lưu {path}")

    print(f"✅ Hoàn tất đồng bộ! SKU được cập nhật thêm review: {updated_count} | Tổng SKU có review sạch: {total_with_reviews}/{len(catalog)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=50, help="Số lượng SKU cào tối đa")
    parser.add_argument("--ranked-only", action="store_true", help="Chỉ cào Top 100")
    parser.add_argument("--apply-only", action="store_true", help="Chỉ áp dụng checkpoint vào catalog")
    args = parser.parse_args()

    if args.apply_only:
        apply_checkpoint_to_catalogs()
    else:
        asyncio.run(scrape_reviews(limit=args.limit, ranked_only=args.ranked_only))
        apply_checkpoint_to_catalogs()
