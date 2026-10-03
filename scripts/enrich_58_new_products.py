#!/usr/bin/env python3
"""
enrich_58_new_products.py
Thu thập chuyên sâu cho toàn bộ sản phẩm mới trong Top 100 Olive Young:
1. Phân loại hàng (Options / Variants: name_kr, price_krw, discount, image_url, is_sold_out)
2. Album ảnh sản phẩm HD (Gallery Images)
3. Ảnh đánh giá thực tế của khách hàng (GDAS Photo Reviews)
4. Dịch phân loại sang tiếng Việt (name_vi, subtitle_vi đạt chuẩn Zero Hangul)
5. Đồng bộ Firestore & file fallback playwright_scraped_products.json
"""

import os
import sys
import json
import time
import re
import urllib.request
import subprocess

BASE_DIR = "/Users/tan/tavy-korea"
CATALOG_PATH = os.path.join(BASE_DIR, "public/data/playwright_scraped_products.json")
NINE_ROUTER_KEY_PATH = "/Users/tan/.hermes/9router_key.txt"

def get_9router_key():
    if os.path.exists(NINE_ROUTER_KEY_PATH):
        with open(NINE_ROUTER_KEY_PATH) as f:
            return f.read().strip()
    return ""

def run_chrome_js(js_code):
    escaped = js_code.replace("\\", "\\\\").replace('"', '\\"')
    script = f'''
    tell application "Google Chrome"
        tell front window
            tell active tab
                return execute javascript "{escaped}"
            end tell
        end tell
    end tell
    '''
    res = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    return res.stdout.strip()

def navigate_chrome(url):
    script = f'''
    tell application "Google Chrome"
        tell front window
            tell active tab
                set URL to "{url}"
            end tell
        end tell
    end tell
    '''
    subprocess.run(["osascript", "-e", script], capture_output=True, text=True)

def open_scraper_tab(url):
    script = f'''
    tell application "Google Chrome"
        tell front window
            make new tab with properties {{URL:"{url}"}}
        end tell
    end tell
    '''
    subprocess.run(["osascript", "-e", script], capture_output=True, text=True)

def close_scraper_tab():
    script = '''
    tell application "Google Chrome"
        tell front window
            close active tab
        end tell
    end tell
    '''
    subprocess.run(["osascript", "-e", script], capture_output=True, text=True)

def clean_hangul(text):
    return re.sub(r'[\uac00-\ud7a3]', '', text).strip()

def translate_options_with_ai(options_kr, brand, product_name):
    if not options_kr:
        return []
    api_key = get_9router_key()
    if not api_key:
        print("⚠️ Không có 9Router API key!")
        for opt in options_kr:
            opt["name_vi"] = clean_hangul(opt.get("name_kr", "")) or "Phân loại tiêu chuẩn"
            opt["subtitle_vi"] = "Chính hãng Olive Young Hàn Quốc"
        return options_kr

    prompt = f"""Bạn là chuyên gia thương mại điện tử mỹ phẩm Hàn Quốc cho Tavy Korea.
Sản phẩm: {product_name} (Thương hiệu: {brand})
Hãy dịch danh sách các phân loại hàng (options) tiếng Hàn sau sang tiếng Việt chuẩn thương mại điện tử.

QUY TẮC BẮT BUỘC:
1. 100% TUYỆT ĐỐI KHÔNG ĐƯỢC CHỨA BẤT KỲ KÝ TỰ TIẾNG HÀN (Hangul) NÀO.
2. 'name_vi': Tên phân loại tiếng Việt rõ ràng, chuyên nghiệp (VD: Tone 21C Sáng Hồng + Túi Duffle, Set 10+1 Miếng Tràm Trà, Tuýp 100ml...).
3. 'subtitle_vi': Công dụng hoặc đặc tính ngắn gọn súc tích không tiếng Hàn (VD: Cho da sáng hồng tự nhiên, Dịu mụn & Giảm đỏ, Phục hồi cấp ẩm sâu...).

Danh sách phân loại tiếng Hàn cần dịch:
{json.dumps([{"id": o.get("id"), "name_kr": o.get("name_kr")} for o in options_kr], ensure_ascii=False)}

Trả về DUY NHẤT một mảng JSON thuần túy (không bọc code block markdown):
[
  {{"id": "...", "name_vi": "...", "subtitle_vi": "..."}}
]"""

    req_data = {
        "model": "manh",
        "messages": [
            {"role": "system", "content": "You are a professional e-commerce product translator. Return ONLY valid JSON."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "stream": False
    }

    try:
        req = urllib.request.Request(
            "http://127.0.0.1:20128/v1/chat/completions",
            data=json.dumps(req_data).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"].strip()
            content = re.sub(r"^```json\s*", "", content)
            content = re.sub(r"^```\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
            translated = json.loads(content)
            
            trans_map = {t["id"]: t for t in translated if "id" in t}
            for opt in options_kr:
                oid = opt.get("id")
                if oid in trans_map:
                    raw_nvi = trans_map[oid].get("name_vi", opt.get("name_vi", ""))
                    raw_sub = trans_map[oid].get("subtitle_vi", "")
                    opt["name_vi"] = clean_hangul(raw_nvi) or "Phân loại tiêu chuẩn"
                    opt["subtitle_vi"] = clean_hangul(raw_sub) or "Chính hãng Olive Young Hàn Quốc"
                else:
                    opt["name_vi"] = clean_hangul(opt.get("name_kr", "")) or "Phân loại tiêu chuẩn"
                    opt["subtitle_vi"] = "Chính hãng Olive Young Hàn Quốc"
    except Exception as e:
        print(f"⚠️ Lỗi dịch options qua 9Router: {e}")
        for opt in options_kr:
            opt["name_vi"] = clean_hangul(opt.get("name_kr", "")) or "Phân loại tiêu chuẩn"
            opt["subtitle_vi"] = "Chính hãng Olive Young Hàn Quốc"

    return options_kr

def extract_single_product_details(goods_no):
    """Trích xuất options, gallery images, review photos qua tab Chrome hiện tại"""
    # 1. Cuộn trang xuống để lazy-load ảnh
    run_chrome_js("window.scrollTo({ top: 1200, behavior: 'smooth' });")
    time.sleep(0.4)

    # 2. Đảm bảo mở dropdown option nếu có
    open_opt_js = '''(() => {
        const box = document.querySelector("[class*=\\"OptionSelector_option-info\\"]");
        if (box && !box.className.includes("is-actived")) {
            const btn = box.querySelector("button");
            if (btn) btn.click();
            return "CLICKED";
        }
        return "ALREADY_OR_NO_BTN";
    })()'''
    run_chrome_js(open_opt_js)
    time.sleep(0.6)

    # 3. Cuộn tiếp xuống phần review để load ảnh review GDAS
    run_chrome_js("""(() => {
        window.scrollTo({ top: 3200, behavior: 'smooth' });
        const btns = Array.from(document.querySelectorAll('button, a, span')).filter(b => {
            const t = (b.innerText || '').trim();
            return t.includes('리뷰') || t.includes('포토');
        });
        btns.forEach(b => { try { b.click(); } catch(e){} });
    })()""")
    time.sleep(0.8)
    run_chrome_js("window.scrollTo({ top: 0, behavior: 'smooth' });")
    time.sleep(0.3)

    # 4. Bóc tách toàn diện
    extract_js = '''(() => {
        const upgradeUrl = (u) => (u || "").replace(/\\?RS=\\d+x\\d+.*$/, "").replace(/\\?.*$/, "");
        const cleanUrl = (s) => s.startsWith("//") ? "https:" + s : (s.startsWith("/") ? "https://www.oliveyoung.co.kr" + s : s);
        const isJunk = (s) => /\\/display\\/|\\/event\\/|\\/banner\\/|\\/static\\/|\\/item\\/|logo|icon|avatar|star_|btn_|badge|tag_|flag_/i.test(s);

        const allImgs = Array.from(document.querySelectorAll("img")).map(i => cleanUrl(upgradeUrl(i.getAttribute("data-original") || i.getAttribute("data-src") || i.src || "")));
        
        // Gallery images
        const galleryImgs = Array.from(new Set(allImgs.filter(s => s && s.includes("oliveyoung") && (s.includes("thumbnails") || s.includes("goods")) && !isJunk(s))));

        // Options
        const optItems = Array.from(document.querySelectorAll("li[class*=\\"OptionSelector_option-item\\"]"));
        const options = optItems.map((it, idx) => {
            const tit = it.querySelector("span[class*=\\"OptionSelector_option-item-tit\\"]");
            const price = it.querySelector("span[class*=\\"OptionSelector_option-item-price\\"]");
            const disc = it.querySelector("em[class*=\\"OptionSelector_option-item-discount\\"]");
            const img = it.querySelector("img");
            const isSold = it.className.includes("soldout") || (it.innerText || "").includes("품절");
            
            const rawPrice = price ? price.innerText.trim().replace(/[^0-9]/g, "") : "";
            const priceKrw = rawPrice ? parseInt(rawPrice, 10) : 0;
            const discRate = disc ? disc.innerText.trim() : "0%";
            
            return {
                id: `opt_${idx + 1}`,
                name_kr: tit ? tit.innerText.trim() : "",
                price_krw: priceKrw,
                discount_rate: discRate,
                image_url: img ? cleanUrl(upgradeUrl(img.src || "")) : "",
                is_sold_out: isSold
            };
        }).filter(o => o.name_kr);

        // Review images
        const reviewImgs = Array.from(new Set(allImgs.filter(s => s && s.includes("oliveyoung") && (s.includes("gdas") || s.includes("review")))));

        return JSON.stringify({
            galleryImgs: galleryImgs.slice(0, 10),
            options: options,
            reviewImgs: reviewImgs.slice(0, 12)
        });
    })()'''
    
    raw = run_chrome_js(extract_js)
    try:
        return json.loads(raw)
    except Exception as e:
        print(f"Lỗi parse JSON: {e}, raw: {raw[:200]}")
        return {"galleryImgs": [], "options": [], "reviewImgs": []}

def commit_batch_to_files_and_firestore(catalog):
    with open(CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    payload_path = "/tmp/firestore_sync_payload.json"
    with open(payload_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    subprocess.run(["node", "/Users/tan/tavy-korea/scripts/commit_catalog_to_firestore.js"], check=False)

def main():
    with open(CATALOG_PATH) as f:
        catalog = json.load(f)

    # Lọc ra các sản phẩm trong Top 100 chưa được enrich
    targets = [p for p in catalog if p.get("rank") is not None and not p.get("is_enriched")]
    print(f"🎯 Tìm thấy {len(targets)} sản phẩm Top 100 cần thu thập:")

    batch_limit = int(sys.argv[1]) if len(sys.argv) > 1 else len(targets)
    targets_to_run = targets[:batch_limit]

    if not targets_to_run:
        print("✅ Tất cả sản phẩm Top 100 đã được bóc tách hoàn chỉnh!")
        return

    first_url = f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={targets_to_run[0]['goodsNo']}"
    print(f"🌐 Mở tab scraper Chrome: {first_url}")
    open_scraper_tab(first_url)
    time.sleep(7)

    krw_rate = 19.5
    service_fee = 0.05

    for idx, p in enumerate(targets_to_run):
        goods_no = p["goodsNo"]
        url = f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={goods_no}"
        print(f"\n[{idx+1}/{len(targets_to_run)}] 📦 Bóc tách SKU #{p.get('rank')}: {goods_no} - {p.get('name')[:35]}...")
        
        if idx > 0:
            navigate_chrome(url)
            time.sleep(4.5)

        title = run_chrome_js("document.title")
        if "기다려" in title or "Chờ" in title:
            print("⏳ Phát hiện Cloudflare challenge, đợi 8s...")
            time.sleep(8)

        details = extract_single_product_details(goods_no)
        raw_options = details.get("options", [])
        gallery_imgs = details.get("galleryImgs", [])
        review_imgs = details.get("reviewImgs", [])

        print(f"   🖼️ Gallery: {len(gallery_imgs)} ảnh | 📸 Reviews: {len(review_imgs)} ảnh | 🔘 Options: {len(raw_options)} phân loại")

        for opt in raw_options:
            if not opt.get("price_krw") or opt["price_krw"] == 0:
                opt["price_krw"] = p.get("foreignPrice", 0)
            p_krw = opt["price_krw"]
            opt["price_vnd"] = round(p_krw * krw_rate * (1 + service_fee))
            opt["original_price_krw"] = p.get("originalPrice", p_krw)

        if raw_options:
            print(f"   🤖 Dịch {len(raw_options)} phân loại qua 9Router...")
            translated_options = translate_options_with_ai(raw_options, p.get("brand", "Olive Young"), p.get("name", ""))
        else:
            translated_options = []

        # Cập nhật sản phẩm
        if gallery_imgs:
            p["images"] = gallery_imgs
        if review_imgs:
            p["photoReviews"] = review_imgs
        p["options"] = translated_options
        p["is_enriched"] = True

        # Mỗi 15 sản phẩm thì lưu và đồng bộ 1 lần
        if (idx + 1) % 15 == 0 or (idx + 1) == len(targets_to_run):
            print(f"\n💾 Lưu checkpoint và đồng bộ Firestore đợt {idx + 1}/{len(targets_to_run)}...")
            commit_batch_to_files_and_firestore(catalog)

    close_scraper_tab()
    print("\n🎉 HOÀN THÀNH BÓC TÁCH TOÀN BỘ SẢN PHẨM!")

if __name__ == "__main__":
    main()
