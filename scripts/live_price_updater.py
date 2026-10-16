#!/usr/bin/env python3
import os
import sys
import json
import time
import re
import subprocess

FIRESTORE_DATA_FILE = "/tmp/firestore_products.json"
OUTPUT_REPORT_FILE = "/Users/tan/tavy-korea/BAO_CAO_CAP_NHAT_GIA_LIVE.md"
OUTPUT_PAYLOAD_FILE = "/tmp/updated_products_payload.json"

KRW_RATE = 19.5
SERVICE_FEE_MULT = 1.05

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

    print(f"📦 Đang chuẩn bị quét giá cho {len(prods)} sản phẩm...")
    
    # Check ranking file
    ranking_map = {}
    if os.path.exists("/tmp/ranking_raw.json"):
        with open("/tmp/ranking_raw.json") as f:
            for item in json.load(f):
                if item.get("goodsNo"):
                    ranking_map[item["goodsNo"]] = item
        print(f"📊 Đã nạp {len(ranking_map)} sản phẩm từ Top Ranking Olive Young.")

    results = {}
    batch_size = 10
    total_batches = (len(prods) + batch_size - 1) // batch_size

    for b_idx in range(total_batches):
        chunk = prods[b_idx * batch_size : (b_idx + 1) * batch_size]
        chunk_skus = [p["goodsNo"] for p in chunk if p.get("goodsNo")]
        print(f"⚡ Đang quét lô {b_idx + 1}/{total_batches} ({len(chunk_skus)} SKU: {chunk_skus[0]} -> {chunk_skus[-1]})...")

        # Set JS runner
        js_runner = f"""(() => {{
            window.__currentChunkResult = null;
            const skus = {json.dumps(chunk_skus)};
            const delay = ms => new Promise(r => setTimeout(r, ms));
            (async () => {{
                const res = [];
                for (const g of skus) {{
                    try {{
                        const r = await fetch("/store/goods/getGoodsDetail.do?goodsNo=" + g);
                        const html = await r.text();
                        const doc = new DOMParser().parseFromString(html, "text/html");
                        const title = doc.querySelector(".prd_name, [class*=GoodsDetailInfo_goods-name], h1, title")?.innerText?.trim() || doc.title;
                        const originEl = doc.querySelector("s, strike, [class*=price-before], .price-before");
                        const saleEl = doc.querySelector("span[class*=price], strong[class*=price], .price-2");
                        const boxEl = doc.querySelector("[class*=price-box], .price_box, .price, .goods_price");
                        const isDiscontinued = html.includes("존재하지 않는") || html.includes("판매가 중단") || html.includes("판매종료");
                        const isSoldOut = isDiscontinued || html.includes("btnSoldout") || html.includes("일시품절") || html.includes("품절된 상품");
                        res.push({{
                            goodsNo: g,
                            title: title,
                            origin: originEl ? originEl.innerText.trim() : null,
                            sale: saleEl ? saleEl.innerText.trim() : null,
                            box: boxEl ? boxEl.innerText.trim() : null,
                            isDiscontinued: isDiscontinued,
                            isSoldOut: isSoldOut,
                            htmlLen: html.length
                        }});
                    }} catch(e) {{
                        res.push({{ goodsNo: g, error: e.message }});
                    }}
                    await delay(1200);
                }}
                window.__currentChunkResult = JSON.stringify(res);
            }})();
        }})()"""

        run_chrome_js(tab_idx, js_runner)

        # Poll
        raw_res = None
        for _ in range(45):
            time.sleep(1.0)
            poll = run_chrome_js(tab_idx, "window.__currentChunkResult")
            if poll and poll != "missing value" and poll != "null":
                raw_res = poll
                break

        if not raw_res:
            print(f"⚠️ Hết thời gian chờ cho lô {b_idx + 1}, thử lại hoặc bỏ qua...")
            continue

        try:
            chunk_data = json.loads(raw_res)
            for item in chunk_data:
                results[item["goodsNo"]] = item
        except Exception as e:
            print(f"❌ Lỗi parse kết quả lô {b_idx + 1}: {e}")

        # Checkpoint save
        with open("/tmp/live_scanned_checkpoint.json", "w") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"🎉 Hoàn thành quét live cho {len(results)}/{len(prods)} sản phẩm!")

    # Merge and compare
    changes = []
    discontinued_list = []
    sold_out_list = []
    updated_products = []

    for p in prods:
        gid = p.get("goodsNo")
        if not gid:
            continue
        scanned = results.get(gid)
        prod_copy = dict(p)

        old_sale = p.get("price") or p.get("foreignPrice") or 0
        old_orig = p.get("originalPrice") or old_sale
        old_vnd = p.get("priceVnd") or 0
        old_disc = p.get("discountRate") or "0%"

        if scanned and not scanned.get("error"):
            orig_krw, sale_krw, disc_rate = parse_price(scanned.get("box"), scanned.get("origin"), scanned.get("sale"))
            is_discontinued = scanned.get("isDiscontinued", False)
            is_sold_out = scanned.get("isSoldOut", False)

            if is_discontinued:
                discontinued_list.append(gid)
                prod_copy["is_sold_out"] = True
                prod_copy["status"] = "out_of_stock"
                prod_copy["isPublished"] = False
            elif is_sold_out:
                sold_out_list.append(gid)
                prod_copy["is_sold_out"] = True
                prod_copy["status"] = "out_of_stock"
            else:
                prod_copy["is_sold_out"] = False
                prod_copy["status"] = "published"
                prod_copy["isPublished"] = True

            if sale_krw and sale_krw > 0:
                new_vnd = round(sale_krw * KRW_RATE * SERVICE_FEE_MULT)
                prod_copy["foreignPrice"] = sale_krw
                prod_copy["price"] = sale_krw
                prod_copy["originalPrice"] = orig_krw or sale_krw
                prod_copy["discountRate"] = disc_rate
                prod_copy["priceVnd"] = new_vnd

                # Update options if present
                if prod_copy.get("options") and isinstance(prod_copy["options"], list):
                    updated_opts = []
                    for opt in prod_copy["options"]:
                        opt_copy = dict(opt)
                        opt_krw = opt_copy.get("price_krw")
                        # If option price tracked base product price, update it
                        if opt_krw == old_sale:
                            opt_copy["price_krw"] = sale_krw
                            opt_copy["price_vnd"] = new_vnd
                            opt_copy["discount_rate"] = disc_rate
                        else:
                            # Recalculate VND for option based on its KRW
                            if opt_krw:
                                opt_copy["price_vnd"] = round(opt_krw * KRW_RATE * SERVICE_FEE_MULT)
                        updated_opts.append(opt_copy)
                    prod_copy["options"] = updated_opts

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

        # Update ranking if available
        if gid in ranking_map:
            prod_copy["rank"] = ranking_map[gid]["rank"]

        prod_copy["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        updated_products.append(prod_copy)

    # Save payload for Firestore sync
    with open(OUTPUT_PAYLOAD_FILE, "w") as f:
        json.dump(updated_products, f, ensure_ascii=False, indent=2)
    print(f"💾 Đã lưu payload đồng bộ vào: {OUTPUT_PAYLOAD_FILE}")

    # Write report
    report_lines = [
        f"# BÁO CÁO CẬP NHẬT GIÁ LIVE OLIVE YOUNG — {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        f"- **Tổng số sản phẩm quét**: {len(prods)}",
        f"- **Số sản phẩm thành công**: {len(results)}",
        f"- **Số sản phẩm thay đổi giá / % giảm giá**: {len(changes)}",
        f"- **Số sản phẩm hết hàng (Sold out)**: {len(sold_out_list)}",
        f"- **Số sản phẩm ngừng kinh doanh (Discontinued)**: {len(discontinued_list)}",
        "",
        "## Danh Sách Sản Phẩm Biến Động Giá",
        "",
        "| SKU | Tên Sản Phẩm | Giá Cũ (KRW) | Giá Mới (KRW) | Giá Cũ (VNĐ) | Giá Mới (VNĐ) | % Giảm Cũ | % Giảm Mới | Chênh Lệch VNĐ |",
        "|---|---|---|---|---|---|---|---|---|"
    ]

    for c in changes:
        diff_str = f"+{c['diff_vnd']:,}" if c['diff_vnd'] > 0 else f"{c['diff_vnd']:,}"
        report_lines.append(f"| {c['goodsNo']} | {c['name'][:35]}... | {c['old_krw']:,} | {c['new_krw']:,} | {c['old_vnd']:,} | {c['new_vnd']:,} | {c['old_disc']} | {c['new_disc']} | {diff_str} |")

    if sold_out_list:
        report_lines.extend([
            "",
            "## Sản Phẩm Hết Hàng (Sold Out)",
            ""
        ])
        for gid in sold_out_list:
            report_lines.append(f"- SKU: `{gid}`")

    if discontinued_list:
        report_lines.extend([
            "",
            "## Sản Phẩm Ngừng Bán (Discontinued)",
            ""
        ])
        for gid in discontinued_list:
            report_lines.append(f"- SKU: `{gid}`")

    with open(OUTPUT_REPORT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))

    print(f"📝 Đã tạo báo cáo chi tiết tại: {OUTPUT_REPORT_FILE}")

if __name__ == "__main__":
    main()
