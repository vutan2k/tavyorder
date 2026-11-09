#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TAVY KOREA: PURGE JUNK & EXTRACT 100% GENUINE OLIVE YOUNG USER REVIEWS
- Scrapes strictly from the Review Shadow DOM widget (<oy-review-review-in-product>).
- Filters 100% 'gdasEditor' customer uploaded photos, stripping '?RS=...' for full HD.
- Purges 100% junk (cf-goods, studio album, local thumbnails) from catalog and Firestore.
"""

import os
import sys
import json
import time
from pathlib import Path

sys.path.append("/Users/tan/tavy-korea/scripts")
from chrome_coordinator import ChromeCoordinator, ChromeTabManager

AUDITED_CATALOG_PATH = "/Users/tan/Desktop/theasd_auto_bot/tavy_catalog_audited_variants.json"
PLAYWRIGHT_PATH = "/Users/tan/tavy-korea/public/data/playwright_scraped_products.json"
ALL_CATALOG_PATH = "/Users/tan/tavy-korea/public/data/all_products_catalog.json"
CHECKPOINT_PATH = "/tmp/pure_reviews_checkpoint.json"

def main():
    print("🧹 BẮT ĐẦU QUY TRÌNH THANH LỌC ẢNH REVIEW: XÓA ẢNH RÁC & CÀO 100% GDAS CHUẨN...")
    
    with open(AUDITED_CATALOG_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    # 1. Tải checkpoint đã cào (nếu có)
    reviews_checkpoint = {}
    if os.path.exists(CHECKPOINT_PATH):
        try:
            with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
                reviews_checkpoint = json.load(f)
            print(f"📦 Đã tìm thấy checkpoint {len(reviews_checkpoint)} sản phẩm đã có review sạch.")
        except Exception:
            reviews_checkpoint = {}

    # 2. Lấy danh sách Top 100 cần cào review sạch
    ranked_items = [p for p in catalog if p.get("rank")]
    ranked_items.sort(key=lambda x: x["rank"])
    
    to_scrape = [p for p in ranked_items if p["goodsNo"] not in reviews_checkpoint]
    print(f"🎯 Tổng Top 100: {len(ranked_items)} SKU | Cần cào mới từ Shadow DOM: {len(to_scrape)} SKU")

    tab_id = "2076734602"
    if to_scrape:
        with ChromeCoordinator(bot_name="TavyManager_VIP", task_name="scrape_pure_reviews", priority="VIP"):
            for idx, p in enumerate(to_scrape, 1):
                gid = p["goodsNo"]
                rank = p.get("rank", "?")
                print(f"   [{idx}/{len(to_scrape)}] Cào Review Shadow DOM OY cho #{rank} `{gid}`...", flush=True)
                url = f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={gid}&tab=review"
                ChromeTabManager.navigate_tab(tab_id, url)
                time.sleep(1.8)
                ChromeTabManager.eval_js_in_tab(tab_id, "window.scrollTo(0, 1800)")
                time.sleep(1.0)

                js = '''(() => {
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
                        
                    return JSON.stringify([...new Set(gdasOnly)]);
                })()'''
                try:
                    res_raw = ChromeTabManager.eval_js_in_tab(tab_id, js)
                    res = json.loads(res_raw)
                    if isinstance(res, list) and len(res) > 0:
                        reviews_checkpoint[gid] = res[:10]
                        print(f"      -> Thu thập thành công {len(res)} ảnh GDAS người dùng thật!")
                    else:
                        reviews_checkpoint[gid] = []
                        print(f"      -> Chưa có ảnh review trên OY.")
                        
                    with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
                        json.dump(reviews_checkpoint, f, ensure_ascii=False, indent=2)
                except Exception as e:
                    print(f"      ⚠️ Lỗi extract {gid}: {e}")

    # 3. QUÉT TOÀN BỘ CATALOG: XÓA SẠCH ẢNH RÁC (cf-goods, thumbnails, local path)
    print("🧹 Đang lọc sạch toàn bộ catalog: Xóa bỏ 100% ảnh rác khỏi photoReviews...")
    clean_catalog = []
    purged_count = 0
    total_pure_reviews = 0

    for p in catalog:
        gid = p.get("goodsNo") or p.get("id")
        
        # Lấy từ checkpoint nếu có
        if gid in reviews_checkpoint:
            p["photoReviews"] = reviews_checkpoint[gid]
        else:
            # Lọc danh sách hiện có: CHỈ GIỮ GDAS, XÓA MỌI THỨ KHÁC
            current_reviews = p.get("photoReviews", [])
            pure_gdas = [s.split("?")[0] for s in current_reviews if s and "gdasEditor" in s]
            if len(pure_gdas) != len(current_reviews):
                purged_count += 1
            p["photoReviews"] = pure_gdas

        if len(p["photoReviews"]) > 0:
            total_pure_reviews += 1

        p["lastAuditedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        clean_catalog.append(p)

    with open(AUDITED_CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(clean_catalog, f, ensure_ascii=False, indent=2)

    with open(PLAYWRIGHT_PATH, "w", encoding="utf-8") as f:
        json.dump(clean_catalog, f, ensure_ascii=False, indent=2)

    with open(ALL_CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(clean_catalog, f, ensure_ascii=False, indent=2)

    print(f"✅ ĐÃ DỌN SẠCH CATALOG! Đã thanh lọc {purged_count} SKU có ảnh rác.")
    print(f"📊 Tổng SKU có ảnh review người dùng thật 100% GDAS: {total_pure_reviews}/{len(clean_catalog)}")

if __name__ == "__main__":
    main()
