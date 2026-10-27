#!/usr/bin/env python3
import subprocess
import json
import time
import re
import os

CHECKPOINT_FILE = "/tmp/live_price_nav_checkpoint.json"

tab_num = 7
fs_prods = json.load(open("/tmp/firestore_products.json"))
live_top100 = json.load(open("/tmp/live_top100_oliveyoung.json"))
top_gids = set(x["goodsNo"] for x in live_top100 if x.get("goodsNo"))
non_top_gids = [p.get("goodsNo") or p.get("firestoreId") for p in fs_prods if (p.get("goodsNo") or p.get("firestoreId")) not in top_gids]

checkpoint = {}
if os.path.exists(CHECKPOINT_FILE):
    try:
        checkpoint = json.load(open(CHECKPOINT_FILE))
    except:
        pass

def parse_price(box, origin_el, sale_el):
    orig = None
    sale = None
    disc = "0%"

    if origin_el:
        clean_org = origin_el.replace(".", "").replace(",", "")
        m = re.search(r"(\d+)\s*원", clean_org)
        if m:
            orig = int(m.group(1))

    if sale_el:
        clean_sale = sale_el.replace(".", "").replace(",", "")
        m = re.search(r"(\d+)\s*원", clean_sale)
        if m:
            sale = int(m.group(1))

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
        const isSoldOut = isDiscontinued || 
                          document.body.innerText.includes("btnSoldout") || 
                          document.body.innerText.includes("일시품절");
        return JSON.stringify({
            ready: true,
            title,
            box: box ? box.innerText.trim() : null,
            origin: originEl ? originEl.innerText.trim() : null,
            sale: saleEl ? saleEl.innerText.trim() : null,
            isDiscontinued,
            isSoldOut
        });
    }
    return JSON.stringify({ ready: false });
})()"""

escaped_poll = poll_js.replace("\\", "\\\\").replace('"', '\\"')

total = len(non_top_gids)
print(f"🚀 Bắt đầu quét live bằng điều hướng tab Chrome cho {total} sản phẩm thường/rớt top...")

for idx, g in enumerate(non_top_gids, start=1):
    if g in checkpoint and checkpoint[g].get("ready"):
        continue

    url = f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={g}"
    script_nav = f'''
    tell application "Google Chrome"
        tell front window
            tell tab {tab_num}
                set URL to "{url}"
            end tell
        end tell
    end tell
    '''
    subprocess.run(["osascript", "-e", script_nav])

    res_data = None
    for attempt in range(12):
        time.sleep(0.4)
        script_poll = f'''
        tell application "Google Chrome"
            tell front window
                tell tab {tab_num}
                    return execute javascript "{escaped_poll}"
                end tell
            end tell
        end tell
        '''
        raw = subprocess.run(["osascript", "-e", script_poll], capture_output=True, text=True).stdout.strip()
        if raw and raw != "missing value" and raw != "null":
            try:
                parsed = json.loads(raw)
                if parsed.get("ready"):
                    res_data = parsed
                    break
                elif parsed.get("isChallenge"):
                    time.sleep(1.0)
            except:
                pass

    if not res_data:
        res_data = {"ready": False, "goodsNo": g, "error": "timeout"}
        print(f"[{idx}/{total}] ⚠️ {g}: Timeout!")
    else:
        orig, sale, disc = parse_price(res_data.get("box"), res_data.get("origin"), res_data.get("sale"))
        res_data["goodsNo"] = g
        res_data["parsedOrigin"] = orig
        res_data["parsedSale"] = sale
        res_data["parsedDisc"] = disc
        
        status_str = "SOLD" if res_data.get("isDiscontinued") else ("HẾT HÀNG" if res_data.get("isSoldOut") else f"₩{sale:,}" if sale else "K RÕ")
        title_str = res_data.get("title", "")[:35]
        print(f"[{idx}/{total}] ✅ {g} [{status_str}]: {title_str}")

    checkpoint[g] = res_data
    if idx % 5 == 0 or idx == total:
        with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
            json.dump(checkpoint, f, ensure_ascii=False, indent=2)

print(f"\n🎉 Quét hoàn tất 100%! Tổng sản phẩm đã quét: {len(checkpoint)}")
