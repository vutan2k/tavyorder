#!/usr/bin/env python3
"""
TAVY KOREA - HIGH-SPEED 1-11 SALE PRICE SCANNER & SYNC PIPELINE
- Scrapes Live Top 100 Ranking from Olive Young via Chrome
- Scrapes all remaining non-top products (198 SKUs) using Chrome tab navigation
- Bypasses Cloudflare Turnstile natively via existing real Chrome session
- Calculates exact VND pricing: round(KRW * 19.5 * 1.05 / 1000) * 1000
- Detects all price fluctuations (Drops, Increases, Sold Out, Discontinued)
- Syncs clean payload to Firebase Firestore via atomic batch writes
"""

import subprocess
import json
import time
import re
import os

BASE_DIR = "/Users/tan/tavy-korea"
CHECKPOINT_FILE = "/tmp/checkpoint_sale_1_11.json"
FIRESTORE_DUMP_FILE = "/tmp/firestore_products.json"
FINAL_PAYLOAD_FILE = "/tmp/firestore_sync_payload.json"
LOCAL_DATA_JSON = os.path.join(BASE_DIR, "public/data/playwright_scraped_products.json")
REPORT_MD_PATH = os.path.join(BASE_DIR, "BAO_CAO_SALE_1_11.md")

KRW_RATE = 19.5
SERVICE_FEE_MULT = 1.05

def run_applescript(script):
    cmd = ["osascript", "-e", script]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.stdout.strip()

def calc_vnd(krw):
    if not krw or krw <= 0:
        return 0
    return int(round((krw * KRW_RATE * SERVICE_FEE_MULT) / 1000.0) * 1000)

def scrape_top100_ranking(tab_num=5):
    print(f"📊 [1/5] Quét trực tiếp Top 100 Ranking Olive Young từ Tab {tab_num}...")
    run_applescript(f'tell application "Google Chrome" to tell tab {tab_num} of front window to set URL to "https://www.oliveyoung.co.kr/store/main/getBestList.do"')
    
    # Wait for page ready
    for _ in range(15):
        time.sleep(0.4)
        ready_state = run_applescript(f'tell application "Google Chrome" to tell tab {tab_num} of front window to return execute javascript "document.readyState"')
        cnt = run_applescript(f'tell application "Google Chrome" to tell tab {tab_num} of front window to return execute javascript "document.querySelectorAll(\'.prd_info\').length"')
        if ready_state in ("interactive", "complete") and cnt.isdigit() and int(cnt) >= 80:
            break

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

            results.push({
                rank,
                goodsNo,
                brandKr,
                nameKr,
                originPriceKrw: originPrice || salePrice,
                salePriceKrw: salePrice
            });
        });
        return JSON.stringify(results);
    })()"""

    escaped_js = js_code.replace('\\', '\\\\').replace('"', '\\"')
    raw = run_applescript(f'tell application "Google Chrome" to tell tab {tab_num} of front window to return execute javascript "{escaped_js}"')
    data = json.loads(raw)
    print(f"✅ Đã bóc tách thành công {len(data)} sản phẩm Top Ranking.")
    return data

def make_poll_js(goods_no):
    return f"""(() => {{
        if (!window.location.href.includes("{goods_no}")) return JSON.stringify({{ ready: false, waitingForUrl: true }});
        if (document.readyState === "loading") return JSON.stringify({{ ready: false, loading: true }});

        const title = document.title;
        if (title.includes("기다려") || title.includes("Chờ")) return JSON.stringify({{ ready: false, isChallenge: true }});
        
        const isDiscontinued = document.body.innerText.includes("존재하지 않는") || 
                               document.body.innerText.includes("판매가 중단") || 
                               document.body.innerText.includes("판매종료");

        const origEl = document.querySelector("[data-qa-name='text-product-original-price'], s[class*='price-before'], .tx_org .tx_num");
        const saleEl = document.querySelector("[data-qa-name='text-product-discount-price'], [class*='GoodsDetailInfo_price__'], .price-2 strong, .tx_cur .tx_num, strong.price");
        const rateEl = document.querySelector("[class*='GoodsDetailInfo_rate__'], em.rate, .discount");
        const isSoldOut = isDiscontinued || 
                          document.body.innerText.includes("일시품절") || 
                          !!document.querySelector(".soldout, .btn_soldout, [class*='soldout']");

        if (saleEl || origEl || isDiscontinued) {{
            let origNum = origEl ? parseInt(origEl.innerText.replace(/[^0-9]/g, '')) : null;
            let saleNum = saleEl ? parseInt(saleEl.innerText.replace(/[^0-9]/g, '')) : null;
            let disc = rateEl ? rateEl.innerText.trim() : "0%";
            if (saleNum && !origNum) origNum = saleNum;
            if (!saleNum && origNum) saleNum = origNum;
            if (origNum && saleNum && disc === "0%" && origNum > saleNum) {{
                disc = Math.round((1 - saleNum / origNum) * 100) + "%";
            }}
            return JSON.stringify({{
                ready: true,
                goodsNo: "{goods_no}",
                title,
                origin: origNum,
                sale: saleNum,
                disc,
                isDiscontinued,
                isSoldOut
            }});
        }}
        return JSON.stringify({{ ready: false }});
    }})()"""

def scan_non_top_sequential(non_top_gids, tab_num=5):
    print(f"⚡ [2/5] Bắt đầu rà soát {len(non_top_gids)} sản phẩm ngoài Top trên Tab {tab_num}...")
    checkpoint = {}
    if os.path.exists(CHECKPOINT_FILE):
        try:
            raw_cp = json.load(open(CHECKPOINT_FILE))
            checkpoint = {k: v for k, v in raw_cp.items() if v.get("ready")}
            print(f"  👉 Đã nạp checkpoint hợp lệ trước đó: {len(checkpoint)} sản phẩm.")
        except:
            pass

    remaining = [g for g in non_top_gids if g not in checkpoint]
    print(f"  👉 Cần quét tiếp: {len(remaining)}/{len(non_top_gids)} sản phẩm.")

    total_all = len(non_top_gids)

    for idx, gid in enumerate(remaining, 1):
        url = f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={gid}"
        run_applescript(f'tell application "Google Chrome" to tell tab {tab_num} of front window to set URL to "{url}"')

        poll_js = make_poll_js(gid)
        escaped_poll = poll_js.replace('\\', '\\\\').replace('"', '\\"')

        res = None
        for attempt in range(25):
            time.sleep(0.35)
            raw = run_applescript(f'tell application "Google Chrome" to tell tab {tab_num} of front window to return execute javascript "{escaped_poll}"')
            if raw and raw not in ("missing value", "null"):
                try:
                    p = json.loads(raw)
                    if p.get("ready"):
                        res = p
                        break
                except:
                    pass

        # Retry once if timeout
        if not res:
            run_applescript(f'tell application "Google Chrome" to tell tab {tab_num} of front window to set URL to "{url}"')
            for attempt in range(20):
                time.sleep(0.4)
                raw = run_applescript(f'tell application "Google Chrome" to tell tab {tab_num} of front window to return execute javascript "{escaped_poll}"')
                if raw and raw not in ("missing value", "null"):
                    try:
                        p = json.loads(raw)
                        if p.get("ready"):
                            res = p
                            break
                    except:
                        pass

        if not res:
            res = {"goodsNo": gid, "ready": False, "error": "timeout"}
            status_str = "⚠️ TIMEOUT"
            title_str = ""
        else:
            status_str = "SOLD" if res.get("isDiscontinued") else ("HẾT HÀNG" if res.get("isSoldOut") else f"₩{res.get('sale', 0):,}" if res.get('sale') else "LỖI")
            title_str = (res.get("title") or "")[:35]

        checkpoint[gid] = res
        curr_done = len(checkpoint)
        print(f"  [{curr_done}/{total_all}] ✅ {gid} [{status_str}]: {title_str}", flush=True)

        if idx % 5 == 0 or idx == len(remaining):
            with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
                json.dump(checkpoint, f, ensure_ascii=False, indent=2)

    return checkpoint

def main():
    start_time = time.time()
    print("=" * 70)
    print("🚀 BẮT ĐẦU QUÉT & ĐỒNG BỘ GIÁ SALE 1-11 TAVY KOREA")
    print("=" * 70)

    # 1. Dump latest Firestore products
    print("📥 Nạp dữ liệu sản phẩm hiện tại từ Firestore...")
    subprocess.run(["node", os.path.join(BASE_DIR, "scripts/firebase_sync_helper.js"), "dump", FIRESTORE_DUMP_FILE], check=True)
    fs_prods = json.load(open(FIRESTORE_DUMP_FILE))
    fs_by_gid = {p.get("goodsNo") or p.get("firestoreId"): p for p in fs_prods}
    print(f"📦 Tổng sản phẩm đang có trên Web Tavy: {len(fs_by_gid)} SKU.")

    # 2. Scrape Top 100 Live
    top100_items = scrape_top100_ranking(tab_num=5)
    top_map = {x["goodsNo"]: x for x in top100_items if x.get("goodsNo")}
    top_gids = set(top_map.keys())

    overlap = [g for g in fs_by_gid if g in top_gids]
    non_top_gids = [g for g in fs_by_gid if g not in top_gids]
    print(f"  - Sản phẩm trên web nằm trong Top 100: {len(overlap)} SKU")
    print(f"  - Sản phẩm trên web ngoài Top 100 cần soi trang chi tiết: {len(non_top_gids)} SKU")

    # 3. Scan Non-Top products sequentially on tab 5
    non_top_results = scan_non_top_sequential(non_top_gids, tab_num=5)

    # 4. Compare prices and assemble payload
    print("\n🔍 [3/5] Phân tích biến động giá toàn bộ kho sản phẩm...")
    final_payload = []
    price_drops = []
    price_increases = []
    unchanged = []
    sold_out_list = []
    discontinued_list = []
    errors = []

    for gid, existing in fs_by_gid.items():
        entry = dict(existing)
        old_won = existing.get("foreignPrice") or existing.get("salePrice") or 0
        old_vnd = existing.get("priceVnd") or existing.get("price") or calc_vnd(old_won)

        new_won = old_won
        new_orig_won = existing.get("originalPrice") or old_won
        new_disc = existing.get("discountRate", "0%")
        is_sold_out = False
        is_discontinued = False

        if gid in top_map:
            # Item is in live Top 100
            t_item = top_map[gid]
            entry["rank"] = t_item["rank"]
            new_won = int(t_item["salePriceKrw"])
            new_orig_won = int(t_item["originPriceKrw"])
            if new_orig_won > new_won:
                new_disc = f"{round((1 - new_won / new_orig_won) * 100)}%"
            else:
                new_disc = "0%"
        else:
            # Item is outside Top 100
            if "rank" in entry:
                del entry["rank"]  # Remove obsolete rank
            
            res = non_top_results.get(gid)
            if res and res.get("ready"):
                if res.get("isDiscontinued"):
                    is_discontinued = True
                    is_sold_out = True
                elif res.get("isSoldOut"):
                    is_sold_out = True
                else:
                    if res.get("sale"):
                        new_won = int(res["sale"])
                    if res.get("origin"):
                        new_orig_won = int(res["origin"])
                    else:
                        new_orig_won = new_won
                    new_disc = res.get("disc", "0%")
            else:
                errors.append(gid)

        # Calculate new VND
        new_vnd = calc_vnd(new_won)
        diff_won = new_won - old_won
        diff_vnd = new_vnd - old_vnd

        # Track change
        change_info = {
            "goodsNo": gid,
            "name": entry.get("name", ""),
            "brand": entry.get("brand", ""),
            "old_won": old_won,
            "new_won": new_won,
            "diff_won": diff_won,
            "old_vnd": old_vnd,
            "new_vnd": new_vnd,
            "diff_vnd": diff_vnd,
            "disc": new_disc
        }

        if is_discontinued:
            discontinued_list.append(change_info)
            entry["is_sold_out"] = True
            entry["status"] = "out_of_stock"
        elif is_sold_out:
            sold_out_list.append(change_info)
            entry["is_sold_out"] = True
            entry["status"] = "out_of_stock"
        else:
            entry["is_sold_out"] = False
            entry["status"] = "published"
            if diff_won < 0:
                pct = round((abs(diff_won) / old_won) * 100, 1) if old_won > 0 else 0
                change_info["pct"] = pct
                price_drops.append(change_info)
            elif diff_won > 0:
                pct = round((diff_won / old_won) * 100, 1) if old_won > 0 else 0
                change_info["pct"] = pct
                price_increases.append(change_info)
            else:
                unchanged.append(change_info)

        # Update entry fields
        entry["foreignPrice"] = new_won
        entry["salePrice"] = new_won
        entry["originalPrice"] = new_orig_won
        entry["originPrice"] = new_orig_won
        entry["priceVnd"] = new_vnd
        entry["price"] = new_vnd
        entry["originalPriceVnd"] = calc_vnd(new_orig_won)
        entry["discountRate"] = new_disc
        entry["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z")

        # Set priceChangeAlert
        if diff_won != 0:
            entry["priceChangeAlert"] = {
                "hasChanged": True,
                "changeType": "drop" if diff_won < 0 else "increase",
                "oldForeignPrice": old_won,
                "newForeignPrice": new_won,
                "diffWon": diff_won,
                "oldPriceVnd": old_vnd,
                "newPriceVnd": new_vnd,
                "changePercent": round((diff_won / old_won) * 100, 1) if old_won > 0 else 0,
                "lastChecked": time.strftime("%Y-%m-%dT%H:%M:%S.000Z")
            }

        final_payload.append(entry)

    # Save payloads
    with open(FINAL_PAYLOAD_FILE, "w", encoding="utf-8") as f:
        json.dump(final_payload, f, ensure_ascii=False, indent=2)

    with open(LOCAL_DATA_JSON, "w", encoding="utf-8") as f:
        json.dump(final_payload, f, ensure_ascii=False, indent=2)

    print(f"\n📈 KẾT QUẢ PHÂN TÍCH:")
    print(f"  - Giảm giá (Sale 1-11 / Price Drops): {len(price_drops)} SKU")
    print(f"  - Tăng giá / Về giá gốc: {len(price_increases)} SKU")
    print(f"  - Giữ nguyên giá: {len(unchanged)} SKU")
    print(f"  - Hết hàng / Tạm ngừng bán: {len(sold_out_list) + len(discontinued_list)} SKU")
    if errors:
        print(f"  - Lỗi quét timeout: {len(errors)} SKU")

    # 5. Commit to Firestore
    print("\n💾 [4/5] Ghi dữ liệu đồng bộ lên Firestore (tavyorder)...")
    subprocess.run(["node", os.path.join(BASE_DIR, "scripts/firebase_sync_helper.js"), "commit", FINAL_PAYLOAD_FILE], check=True)

    # 6. Generate Report MD
    print("\n📝 [5/5] Xuất báo cáo chi tiết ra file markdown...")
    report_lines = [
        f"# BÁO CÁO BIẾN ĐỘNG GIÁ SALE 1-11 (TAVY KOREA)",
        f"**Thời gian quét:** {time.strftime('%Y-%m-%d %H:%M:%S')} KST",
        f"**Tỷ giá áp dụng:** 1 KRW = {KRW_RATE} VND | Phí dịch vụ: 5%",
        "",
        "## 1. Tổng quan số liệu",
        f"- **Tổng sản phẩm trên web đã rà soát:** {len(final_payload)} SKU",
        f"- **Sản phẩm GIẢM GIÁ (Sale đợt 1-11):** {len(price_drops)} SKU",
        f"- **Sản phẩm TĂNG GIÁ (Về giá gốc / hết sale cũ):** {len(price_increases)} SKU",
        f"- **Sản phẩm KHÔNG ĐỔI GIÁ:** {len(unchanged)} SKU",
        f"- **Sản phẩm HẾT HÀNG / TẠM DỪNG BÁN:** {len(sold_out_list) + len(discontinued_list)} SKU",
        f"- **Thời gian quét & xử lý:** {int(time.time() - start_time)} giây",
        "",
        f"## 2. Top sản phẩm GIẢM GIÁ sâu nhất đợt 1-11 ({len(price_drops)} SKU)",
        "| Mã SP | Tên sản phẩm | Giá cũ (KRW) | Giá mới (KRW) | Giá cũ (VND) | Giá mới (VND) | Giảm |",
        "|---|---|---|---|---|---|---|"
    ]

    for p in sorted(price_drops, key=lambda x: x.get("pct", 0), reverse=True):
        report_lines.append(f"| `{p['goodsNo']}` | {p['name'][:35]} | {p['old_won']:,}₩ | **{p['new_won']:,}₩** | {p['old_vnd']:,}đ | **{p['new_vnd']:,}đ** | **-{p.get('pct', 0)}%** |")

    if price_increases:
        report_lines.extend([
            "",
            f"## 3. Danh sách sản phẩm TĂNG GIÁ ({len(price_increases)} SKU)",
            "| Mã SP | Tên sản phẩm | Giá cũ (KRW) | Giá mới (KRW) | Giá cũ (VND) | Giá mới (VND) | Tăng |",
            "|---|---|---|---|---|---|---|"
        ])
        for p in sorted(price_increases, key=lambda x: x.get("pct", 0), reverse=True):
            report_lines.append(f"| `{p['goodsNo']}` | {p['name'][:35]} | {p['old_won']:,}₩ | **{p['new_won']:,}₩** | {p['old_vnd']:,}đ | **{p['new_vnd']:,}đ** | **+{p.get('pct', 0)}%** |")

    if sold_out_list or discontinued_list:
        report_lines.extend([
            "",
            f"## 4. Danh sách sản phẩm HẾT HÀNG / NGỪNG BÁN ({len(sold_out_list) + len(discontinued_list)} SKU)",
            "| Mã SP | Tên sản phẩm | Trạng thái |",
            "|---|---|---|"
        ])
        for p in discontinued_list:
            report_lines.append(f"| `{p['goodsNo']}` | {p['name'][:40]} | **NGỪNG BÁN (Discontinued)** |")
        for p in sold_out_list:
            report_lines.append(f"| `{p['goodsNo']}` | {p['name'][:40]} | **HẾT HÀNG (Sold Out)** |")

    with open(REPORT_MD_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))

    duration = int(time.time() - start_time)
    print("=" * 70)
    print(f"🎉 HOÀN THÀNH QUÉT VÀ SYNC 100% TRONG {duration} GIÂY!")
    print(f"📄 Báo cáo chi tiết: {REPORT_MD_PATH}")
    print("=" * 70)

if __name__ == "__main__":
    main()
