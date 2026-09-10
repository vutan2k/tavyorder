#!/usr/bin/env python3
"""
OLIVEYOUNG ULTRA SCRAPER TOOL (TAVY-KOREA)
=========================================
Tool tự động quét sản phẩm Olive Young chuẩn 100%:
- Bypass WAF / Anti-bot qua Chrome kết nối tự động.
- Trích xuất thông tin Ranking, Giá gốc, Giá sale, Link sản phẩm.
- Tự động mở Deep Shadow DOM của Web Component (<oy-review-unified-photo-review-modal>).
- Tải về: 1 Ảnh đại diện + 2 Ảnh sản phẩm chi tiết + 5 Ảnh Review thực tế người dùng HD.
"""

import os
import sys
import json
import time
import urllib.request
import subprocess

BASE_DIR = os.path.expanduser("~/Desktop/oliveyoung_ranking")
IMAGES_DIR = os.path.join(BASE_DIR, "images")
REVIEWS_DIR = os.path.join(BASE_DIR, "reviews")
JSON_OUTPUT = os.path.join(BASE_DIR, "top10_oliveyoung.json")
MD_OUTPUT = os.path.join(BASE_DIR, "README.md")

os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(REVIEWS_DIR, exist_ok=True)

def run_chrome_js(js_code):
    escaped_js = js_code.replace('\\', '\\\\').replace('"', '\\"')
    apple_script = f'''
    tell application "Google Chrome"
        tell front window
            tell active tab
                execute javascript "{escaped_js}"
            end tell
        end tell
    end tell
    '''
    cmd = ["osascript", "-e", apple_script]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.stdout.strip()

def navigate_chrome(url):
    apple_script = f'''
    tell application "Google Chrome"
        tell front window
            tell active tab
                set URL to "{url}"
            end tell
        end tell
    end tell
    '''
    subprocess.run(["osascript", "-e", apple_script])
    time.sleep(5)

def download_hd_image(url, dest_path):
    if not url or not url.startswith("http"):
        return False
    try:
        clean_url = url.split("?")[0] if "?" in url else url
        req = urllib.request.Request(clean_url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
        with urllib.request.urlopen(req, timeout=12) as resp, open(dest_path, 'wb') as out_f:
            out_f.write(resp.read())
        return True
    except:
        return False

def main():
    print("=== BAT DAU QUET OLIVE YOUNG AUTO-SCRAPER ===")
    ranking_url = "https://www.oliveyoung.co.kr/store/main/getBestList.do"
    navigate_chrome(ranking_url)

    # 1. Lay danh sach Top 10 san pham
    get_list_js = """
    (() => {
        const items = Array.from(document.querySelectorAll(".prd_info")).slice(0, 10);
        return JSON.stringify(items.map((el, idx) => {
            const linkEl = el.querySelector("a.prd_thumb, a.goodsList, a");
            const nameEl = el.querySelector(".tx_name");
            const brandEl = el.querySelector(".tx_brand");
            const originPriceEl = el.querySelector(".tx_org .tx_num");
            const salePriceEl = el.querySelector(".tx_cur .tx_num");
            const imgEl = el.parentElement.querySelector("img");
            return {
                rank: idx + 1,
                name: nameEl ? nameEl.innerText.trim() : "",
                brand: brandEl ? brandEl.innerText.trim() : "",
                origin_price_krw: originPriceEl ? originPriceEl.innerText.trim() : "",
                sale_price_krw: salePriceEl ? salePriceEl.innerText.trim() : "",
                product_url: linkEl ? linkEl.href : "",
                thumbnail_url: imgEl ? (imgEl.getAttribute("data-original") || imgEl.src) : ""
            };
        }));
    })()
    """
    raw_list = run_chrome_js(get_list_js)
    products = json.loads(raw_list)
    print(f"-> Da lay danh sach {len(products)} san pham ban chay.")

    # Script quet anh Deep Shadow DOM
    extract_shadow_js = """
    (() => {
        function getAllShadowImages(root) {
            let imgs = [];
            if (!root) return imgs;
            root.querySelectorAll("img").forEach(i => {
                const s = i.src || i.getAttribute("data-original") || "";
                if (s.includes("gdasEditor")) imgs.push(s);
            });
            root.querySelectorAll("*").forEach(el => {
                if (el.shadowRoot) imgs = imgs.concat(getAllShadowImages(el.shadowRoot));
            });
            return imgs;
        }
        return JSON.stringify(Array.from(new Set(getAllShadowImages(document))));
    })()
    """

    trigger_modal_js = """
    (() => {
        window.scrollTo(0, 800);
        const all = Array.from(document.querySelectorAll("*"));
        const deobogi = all.find(e => e.innerText && e.innerText.trim() === "더보기" && e.children.length === 0);
        if (deobogi) {
            deobogi.click();
            if (deobogi.parentElement) deobogi.parentElement.click();
            return "CLICKED";
        }
        const iconMore = document.querySelector("[class*='icon-more'], [class*='ReviewArea_thumb']");
        if (iconMore) {
            iconMore.click();
            return "CLICKED_ICON";
        }
        return "NONE";
    })()
    """

    for idx, p in enumerate(products):
        print(f"\n[{idx+1}/10] Dang xu ly: {p['name'][:30]}...")
        # 1. Tai anh dai dien
        thumb_ext = "png" if ".png" in p['thumbnail_url'] else "jpg"
        thumb_path = os.path.join(IMAGES_DIR, f"rank_{p['rank']}_{thumb_ext}.{thumb_ext}")
        download_hd_image(p['thumbnail_url'], thumb_path)
        p['local_thumbnail_path'] = thumb_path

        # 2. Vao trang chi tiet
        p_url = p['product_url']
        if "tab=review" not in p_url:
            p_url += "&tab=review"
        navigate_chrome(p_url)

        # 3. Lay 2 anh san pham chi tiet
        get_extra_prd_js = """
        (() => {
            const imgs = Array.from(document.querySelectorAll("img"))
                .map(i => i.src || i.getAttribute("data-original"))
                .filter(s => s && s.includes("cf-goods/uploads/images/thumbnails") && !s.includes("Logo"));
            return JSON.stringify(Array.from(new Set(imgs)));
        })()
        """
        extra_cands = json.loads(run_chrome_js(get_extra_prd_js) or "[]")
        extra_prds = [u for u in extra_cands if u.split('?')[0] != p['thumbnail_url'].split('?')[0]][:2]
        
        saved_extra = []
        for ep_idx, u in enumerate(extra_prds):
            ext = "png" if ".png" in u else "jpg"
            path = os.path.join(IMAGES_DIR, f"rank_{p['rank']}_prd_{ep_idx+2}.{ext}")
            if download_hd_image(u, path):
                saved_extra.append(path)
        p['extra_product_image_paths'] = saved_extra

        # 4. Kich hoat Modal & Lay 5 anh Review HD tu Shadow DOM
        run_chrome_js(trigger_modal_js)
        time.sleep(3)
        shadow_urls = json.loads(run_chrome_js(extract_shadow_js) or "[]")
        
        clean_reviews = []
        seen = set()
        for u in shadow_urls:
            base = u.split("?")[0]
            if base not in seen:
                seen.add(base)
                clean_reviews.append(base)

        saved_revs = []
        for r_idx, u in enumerate(clean_reviews[:5]):
            path = os.path.join(REVIEWS_DIR, f"rank_{p['rank']}_rev_{r_idx+1}.jpg")
            if download_hd_image(u, path):
                saved_revs.append(path)
        p['local_review_image_paths'] = saved_revs
        print(f"-> Da luu: 1 thumb + {len(saved_extra)} anh sp + {len(saved_revs)} anh review HD.")

    # Luu JSON
    with open(JSON_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)

    print("\nHOAN TAT 100%! Du lieu da duoc luu vao:", JSON_OUTPUT)

if __name__ == "__main__":
    main()
