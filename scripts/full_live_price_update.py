#!/usr/bin/env python3
import os
import sys
import json
import time
import re
import subprocess

FIRESTORE_DATA_FILE = "/tmp/firestore_products.json"
CHECKPOINT_FILE = "/tmp/live_price_scan_checkpoint.json"
OUTPUT_REPORT_FILE = "/Users/tan/tavy-korea/BAO_CAO_CAP_NHAT_GIA_LIVE.md"
OUTPUT_PAYLOAD_FILE = "/tmp/updated_products_payload.json"

KRW_RATE = 19.5
SERVICE_FEE_MULT = 1.05

def get_tab_index():
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

def nav_tab(tab_num, url):
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

def parse_price(box, origin_el, sale_el):
    orig = None
    sale = None
    disc = "0%"

    if origin_el:
        m = re.search(r"(\d{1,3}(?:[.,]\d{3})+|\d+)\s*원", origin_el)
        if m:
            orig = int(re.sub(r"[.,]", "", m.group(1)))

    if sale_el:
        m = re.search(r"(\d{1,3}(?:[.,]\d{3})+|\d+)\s*원", sale_el)
        if m:
            sale = int(re.sub(r"[.,]", "", m.group(1)))

    if box:
        dm = re.search(r"(\d{1,2})%", box)
        if dm:
            disc = f"{dm.group(1)}%"

    if sale and not orig:
        orig = sale
    elif orig and not sale:
        sale = orig

    if orig and sale and disc == "0%" and orig > sale:
        disc = f"{round((1 - sale / orig) * 100)}%"

    return orig, sale, disc

def main():
    tab_idx = get_tab_index()
    if tab_idx == 0:
        print("❌ Không tìm thấy tab Olive Young trong Chrome!")
        sys.exit(1)
    print(f"✅ Đã tìm thấy Tab Olive Young tại vị trí {tab_idx} trong Chrome.")

    with open(FIRESTORE_DATA_FILE) as f:
        prods = json.load(f)

    # Load ranking file if available
    ranking_map = {}
    if os.path.exists("/tmp/ranking_raw.json"):
        with open("/tmp/ranking_raw.json") as f:
            for item in json.load(f):
                if item.get("goodsNo"):
                    ranking_map[item["goodsNo"]] = item
        print(f"📊 Đã nạp {len(ranking_map)} sản phẩm từ Top Ranking Olive Young.")

    # Load checkpoint
    scanned_results = {}
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE) as f:
                scanned_results = json.load(f)
            print(f"🔄 Đã nạp checkpoint trước đó: {len(scanned_results)} sản phẩm.")
        except:
            scanned_results = {}

    total = len(prods)
    print(f"🚀 Bắt đầu quét live cho {total} sản phẩm qua điều hướng Chrome thật...")

    poll_js = """(() => {
        const title = document.title;
        const isChallenge = title.includes("기다려") || title.includes("Chờ");
        if (isChallenge) return JSON.stringify({ ready: false, isChallenge: true });

        const isDiscontinued = document.body.innerText.includes("존재하지 않는") || 
                               document.body.innerText.includes("판매가 중단") || 
                               document.body.innerText.includes("판매종료");

        const box = document.querySelector("[class*='price-box'], .goods_price, [class*='price']");
        if (box || isDiscontinued) {
            const originEl = document.querySelector("s, strike, [class*=price-before], .price-before");
            const saleEl = document.querySelector("span[class*=price], strong[class*=price], .price-2");
            const isSoldOut = isDiscontinued || 
                              document.body.innerText.includes("btnSoldout") || 
                              document.body.innerText.includes("일시품절");

            // Check options
            let options = [];
            const optBtn = document.querySelector("[class*='OptionSelector_btn-option']");
            if (optBtn) {
                // If options already rendered
                const items = document.querySelectorAll("[class*='OptionSelector_option-item__']");
                if (items.length > 0) {
                    options = Array.from(items).map(el => ({
                        name: el.querySelector("[class*='option-item-tit']")?.innerText?.trim(),
                        price: el.querySelector("[class*='option-item-price']")?.innerText?.trim(),
                        discount: el.querySelector("[class*='option-item-discount']")?.innerText?.trim(),
                        soldout: el.className.includes("soldout") || el.innerText.includes("품절")
                    }));
                }
            }

            return JSON.stringify({
                ready: true,
                title,
                box: box ? box.innerText.trim() : null,
                origin: originEl ? originEl.innerText.trim() : null,
                sale: saleEl ? saleEl.innerText.trim() : null,
                isDiscontinued,
                isSoldOut,
                options
            });
        }
        return JSON.stringify({ ready: false });
    })()"""

    click_opt_js = """(() => {
        const btn = document.querySelector("[class*='OptionSelector_btn-option']");
        if (btn) {
            btn.click();
            return true;
        }
        return false;
    })()"""

    extract_opts_js = """(() => {
        const items = document.querySelectorAll("[class*='OptionSelector_option-item__']");
        return JSON.stringify(Array.from(items).map(el => ({
            name: el.querySelector("[class*='option-item-tit']")?.innerText?.trim(),
            price: el.querySelector("[class*='option-item-price']")?.innerText?.trim(),
            discount: el.querySelector("[class*='option-item-discount']")?.innerText?.trim(),
            soldout: el.className.includes("soldout") || el.innerText.includes("품절")
        })));
    })()"""

    for idx, p in enumerate(prods):
        gid = p.get("goodsNo")
        if not gid:
            continue

        # Skip if already scanned and valid
        if gid in scanned_results and scanned_results[gid].get("sale"):
            continue

        url = f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={gid}"
        nav_tab(tab_idx, url)

        res_data = None
        for attempt in range(12):
            time.sleep(0.5)
            raw = run_chrome_js(tab_idx, poll_js)
            if raw and raw != "missing value" and raw != "null":
                try:
                    parsed = json.loads(raw)
                    if parsed.get("ready"):
                        res_data = parsed
                        break
                    elif parsed.get("isChallenge"):
                        # Turnstile resolution wait
                        time.sleep(2.0)
                except:
                    pass

        if not res_data:
            print(f"[{idx+1}/{total}] ⚠️ {gid}: Không đọc được dữ liệu sau 6s, lưu fallback...")
            res_data = {"goodsNo": gid, "error": "timeout"}
        else:
            # Check if product has options and needs click
            if p.get("options") and len(p["options"]) > 0 and len(res_data.get("options", [])) == 0:
                has_btn = run_chrome_js(tab_idx, click_opt_js)
                if has_btn == "true":
                    time.sleep(0.5)
                    opts_raw = run_chrome_js(tab_idx, extract_opts_js)
                    if opts_raw and opts_raw != "missing value":
                        try:
                            res_data["options"] = json.loads(opts_raw)
                        except:
                            pass

            orig, sale, disc = parse_price(res_data.get("box"), res_data.get("origin"), res_data.get("sale"))
            res_data["goodsNo"] = gid
            res_data["parsedOrigin"] = orig
            res_data["parsedSale"] = sale
            res_data["parsedDisc"] = disc

            orig_str = f"{orig:,}" if orig else "None"
            sale_str = f"{sale:,}" if sale else "None"
            opts_count = len(res_data.get("options", []))
            print(f"[{idx+1}/{total}] ✅ {gid} | Giá: {sale_str} KRW (Gốc: {orig_str}, {disc}) | Opts: {opts_count}")

        scanned_results[gid] = res_data

        # Save checkpoint periodically
        if (idx + 1) % 5 == 0 or (idx + 1) == total:
            with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
                json.dump(scanned_results, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 Quét hoàn tất 100%! Tổng sản phẩm đã quét: {len(scanned_results)}")

    # BUILD FINAL PAYLOAD AND REPORT
    changes = []
    sold_out_list = []
    discontinued_list = []
    final_payload = []

    for p in prods:
        gid = p.get("goodsNo")
        if not gid:
            continue

        item_copy = dict(p)
        scanned = scanned_results.get(gid)

        old_sale = p.get("price") or p.get("foreignPrice") or 0
        old_orig = p.get("originalPrice") or old_sale
        old_vnd = p.get("priceVnd") or 0
        old_disc = p.get("discountRate") or "0%"

        if scanned and not scanned.get("error"):
            sale_krw = scanned.get("parsedSale")
            orig_krw = scanned.get("parsedOrigin") or sale_krw
            disc_rate = scanned.get("parsedDisc") or "0%"
            is_discontinued = scanned.get("isDiscontinued", False)
            is_sold_out = scanned.get("isSoldOut", False)

            if is_discontinued:
                discontinued_list.append(gid)
                item_copy["is_sold_out"] = True
                item_copy["status"] = "out_of_stock"
                item_copy["isPublished"] = False
            elif is_sold_out:
                sold_out_list.append(gid)
                item_copy["is_sold_out"] = True
                item_copy["status"] = "out_of_stock"
            else:
                item_copy["is_sold_out"] = False
                item_copy["status"] = "published"
                item_copy["isPublished"] = True

            if sale_krw and sale_krw > 0:
                new_vnd = round(sale_krw * KRW_RATE * SERVICE_FEE_MULT)
                item_copy["foreignPrice"] = sale_krw
                item_copy["price"] = sale_krw
                item_copy["originalPrice"] = orig_krw
                item_copy["discountRate"] = disc_rate
                item_copy["priceVnd"] = new_vnd

                # Process options
                live_opts = scanned.get("options") or []
                existing_opts = item_copy.get("options") or []

                if existing_opts and isinstance(existing_opts, list):
                    updated_opts = []
                    for opt in existing_opts:
                        opt_c = dict(opt)
                        opt_krw = opt_c.get("price_krw")

                        # Try to match with live option by name
                        matched_live = None
                        opt_kr_name = opt_c.get("name_kr", "")
                        for lo in live_opts:
                            if lo.get("name") and opt_kr_name and (lo["name"] in opt_kr_name or opt_kr_name in lo["name"]):
                                matched_live = lo
                                break

                        if matched_live and matched_live.get("price"):
                            m_price = re.search(r"(\d{1,3}(?:[.,]\d{3})+|\d+)\s*원", matched_live["price"])
                            if m_price:
                                live_opt_krw = int(re.sub(r"[.,]", "", m_price.group(1)))
                                opt_c["price_krw"] = live_opt_krw
                                opt_c["price_vnd"] = round(live_opt_krw * KRW_RATE * SERVICE_FEE_MULT)
                                if matched_live.get("discount"):
                                    opt_c["discount_rate"] = matched_live["discount"]
                                if matched_live.get("soldout"):
                                    opt_c["is_sold_out"] = True
                                    opt_c["status"] = "out_of_stock"
                                else:
                                    opt_c["is_sold_out"] = False
                                    opt_c["status"] = "available"
                        else:
                            # Proportional / base tracking
                            if opt_krw == old_sale:
                                opt_c["price_krw"] = sale_krw
                                opt_c["price_vnd"] = new_vnd
                                opt_c["discount_rate"] = disc_rate
                            elif opt_krw:
                                opt_c["price_vnd"] = round(opt_krw * KRW_RATE * SERVICE_FEE_MULT)

                        updated_opts.append(opt_c)
                    item_copy["options"] = updated_opts

                if old_sale != sale_krw or old_vnd != new_vnd or old_disc != disc_rate:
                    changes.append({
                        "goodsNo": gid,
                        "name": p.get("name"),
                        "old_krw": old_sale,
                        "new_krw": sale_krw,
                        "old_vnd": old_vnd,
                        "new_vnd": new_vnd,
                        "old_disc": old_disc,
                        "new_disc": disc_rate,
                        "diff_vnd": new_vnd - old_vnd
                    })

        # Update ranking if in ranking map
        if gid in ranking_map:
            item_copy["rank"] = ranking_map[gid]["rank"]

        item_copy["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        final_payload.append(item_copy)

    with open(OUTPUT_PAYLOAD_FILE, "w", encoding="utf-8") as f:
        json.dump(final_payload, f, ensure_ascii=False, indent=2)
    print(f"💾 Đã lưu payload đồng bộ tại: {OUTPUT_PAYLOAD_FILE}")

    # Generate Markdown Report
    report_lines = [
        f"# BÁO CÁO CẬP NHẬT GIÁ LIVE OLIVE YOUNG — {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        f"- **Tổng sản phẩm quét**: {total}",
        f"- **Quét thành công**: {len([s for s in scanned_results.values() if s.get('parsedSale')])}",
        f"- **Sản phẩm có biến động giá / % sale**: {len(changes)}",
        f"- **Sản phẩm hết hàng (Sold out)**: {len(sold_out_list)}",
        f"- **Sản phẩm ngừng bán (Discontinued)**: {len(discontinued_list)}",
        "",
        "## Chi Tiết Các Sản Phẩm Biến Động Giá",
        "",
        "| SKU | Tên Sản Phẩm | Giá Cũ (KRW) | Giá Mới (KRW) | Giá Cũ (VNĐ) | Giá Mới (VNĐ) | % Giảm Cũ | % Giảm Mới | Chênh Lệch VNĐ |",
        "|---|---|---|---|---|---|---|---|---|"
    ]

    for c in changes:
        diff_str = f"+{c['diff_vnd']:,}" if c['diff_vnd'] > 0 else f"{c['diff_vnd']:,}"
        report_lines.append(f"| {c['goodsNo']} | {c['name'][:35]}... | {c['old_krw']:,} | {c['new_krw']:,} | {c['old_vnd']:,} | {c['new_vnd']:,} | {c['old_disc']} | {c['new_disc']} | {diff_str} |")

    if sold_out_list:
        report_lines.extend(["", "## Sản Phẩm Hết Hàng (Sold Out)", ""])
        for gid in sold_out_list:
            report_lines.append(f"- SKU: `{gid}`")

    if discontinued_list:
        report_lines.extend(["", "## Sản Phẩm Ngừng Bán (Discontinued)", ""])
        for gid in discontinued_list:
            report_lines.append(f"- SKU: `{gid}`")

    with open(OUTPUT_REPORT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))
    print(f"📝 Đã tạo báo cáo chi tiết tại: {OUTPUT_REPORT_FILE}")

if __name__ == "__main__":
    main()
