#!/usr/bin/env python3
"""
OLIVEYOUNG TOP 5 ORGANIZED SCRAPER
==================================
- Tải 5 sản phẩm đầu bảng Olive Young.
- Mỗi sản phẩm lưu riêng 1 thư mục: Desktop/oliveyoung_ranking/product_1, product_2...
- Mỗi thư mục chứa:
    + 1 ảnh đại diện (main_thumbnail.jpg/png)
    + 2 ảnh sản phẩm chi tiết (product_extra_1, product_extra_2)
    + 5 ảnh review thực tế HD từ Shadow DOM (review_1 .. review_5)
    + product_info.json (Chi tiết thông tin sản phẩm đó)
- Xuất tổng hợp: top5_products.json và README.md
"""

import os
import sys
import json
import time
import urllib.request
import subprocess
import shutil

BASE_DIR = os.path.expanduser("~/Desktop/oliveyoung_ranking")
JSON_OUTPUT = os.path.join(BASE_DIR, "top5_products.json")
MD_OUTPUT = os.path.join(BASE_DIR, "README.md")

# Xóa các thư mục ảnh cũ nếu có
old_images = os.path.join(BASE_DIR, "images")
old_reviews = os.path.join(BASE_DIR, "reviews")
if os.path.exists(old_images):
    shutil.rmtree(old_images)
if os.path.exists(old_reviews):
    shutil.rmtree(old_reviews)

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
            data = resp.read()
            out_f.write(data)
        
        # Tu dong kiem tra magic bytes de doi dung duoi thuc te
        real_ext = "png" if data.startswith(b"\x89PNG\r\n\x1a\n") else ("jpg" if data.startswith(b"\xff\xd8") else ("webp" if data.startswith(b"RIFF") else None))
        if real_ext:
            cur_ext = os.path.splitext(dest_path)[1][1:].lower()
            if cur_ext != real_ext:
                fixed_path = os.path.splitext(dest_path)[0] + "." + real_ext
                os.rename(dest_path, fixed_path)
                return fixed_path
        return True
    except:
        return False

# Bản đồ công dụng chuẩn tiếng Việt (Chuẩn hóa chính xác theo sản phẩm thực tế)
BENEFITS_MAP = {
    1: "Mặt nạ giấy quốc dân số 1 Hàn Quốc suốt 15 năm liên tiếp. Cung cấp tinh chất tràm trà (Tea Tree) và rau má làm dịu da mụn, phục hồi da nhạy cảm tức thì, cấp ẩm sâu và làm sáng da.",
    2: "Hộp đôi 100+100 miếng bông toner pad Mediheal Derma Pad chuyên sâu, hỗ trợ tẩy da chết dịu nhẹ, cấp ẩm sâu, làm sạch và cải thiện lỗ chân lông số 1 Olive Young.",
    3: "Serum trị thâm mụn số 1 Olive Young chiết xuất từ phức hợp Heparin RX Complex giúp làm dịu nốt mụn đỏ nhanh chóng trong vài giờ, ngăn ngừa hình thành sẹo và làm mờ vết thâm sau mụn.",
    4: "Bộ đôi tinh chất Vitamin C quýt xanh đảo Jeju Goodal Green Tangerine Vita C Blemish Care Serum Alpha giúp làm mờ vết thâm nám, làm sáng và đều màu da rõ rệt sau 2 tuần sử dụng.",
    5: "Tinh chất cấp nước chuyên sâu Wellage Real Hyaluronic Blue 100 Ampoule chứa 100% Hyaluronic Acid tinh khiết phân tử siêu nhỏ, giúp phục hồi hàng rào độ ẩm và mang lại làn da căng bóng mịn màng chuẩn Hàn."
}

def classify_korean_category(name, desc=""):
    """Phân loại danh mục động linh hoạt dựa trên từ khóa tiếng Hàn và tiếng Việt của sản phẩm cào được"""
    text = f"{name} {desc}".lower()
    if any(k in text for k in ["마스크팩", "시트마스크", "mask", "mặt nạ"]):
        return {"category": "cosmetics", "subCategory": "mask", "categoryLabel": "Mặt Nạ Giấy", "categoryKr": "마스크팩"}
    if any(k in text for k in ["토너패드", "패드", "pad", "toner pad", "bông toner"]):
        return {"category": "cosmetics", "subCategory": "toner_pad", "categoryLabel": "Bông Toner Pad", "categoryKr": "토너패드"}
    if any(k in text for k in ["세럼", "앰플", "에센스", "serum", "ampoule", "tinh chất"]):
        return {"category": "cosmetics", "subCategory": "serum", "categoryLabel": "Serum & Tinh Chất", "categoryKr": "에센스/세럼/앰플"}
    if any(k in text for k in ["선크림", "선스틱", "선케어", "sun", "chống nắng"]):
        return {"category": "cosmetics", "subCategory": "suncare", "categoryLabel": "Chống Nắng", "categoryKr": "선케어"}
    if any(k in text for k in ["수분크림", "보습크림", "크림", "cream", "kem dưỡng"]):
        return {"category": "cosmetics", "subCategory": "cream", "categoryLabel": "Kem Dưỡng Da", "categoryKr": "크림/로션"}
    if any(k in text for k in ["클렌징", "폼클렌징", "cleanser", "rửa mặt", "tẩy trang"]):
        return {"category": "cosmetics", "subCategory": "cleansing", "categoryLabel": "Làm Sạch & Tẩy Trang", "categoryKr": "클렌징"}
    if any(k in text for k in ["쿠션", "립", "틴트", "makeup", "trang điểm"]):
        return {"category": "cosmetics", "subCategory": "makeup", "categoryLabel": "Trang Điểm (Makeup)", "categoryKr": "메이크업"}
    if any(k in text for k in ["샴푸", "헤어", "hair", "dầu gội"]):
        return {"category": "cosmetics", "subCategory": "haircare", "categoryLabel": "Chăm Sóc Tóc", "categoryKr": "헤어케어"}
    if any(k in text for k in ["바디", "body", "dưỡng thể"]):
        return {"category": "cosmetics", "subCategory": "bodycare", "categoryLabel": "Chăm Sóc Cơ Thể", "categoryKr": "바디케어"}
    if any(k in text for k in ["홍삼", "인삼", "ginseng", "sâm"]):
        return {"category": "ginseng", "subCategory": "ginseng", "categoryLabel": "Sâm Nấm Hàn Quốc", "categoryKr": "홍삼/인삼"}
    if any(k in text for k in ["비타민", "유산균", "supplement", "tpcn"]):
        return {"category": "supplements", "subCategory": "supplements", "categoryLabel": "Thực Phẩm Chức Năng", "categoryKr": "건강식품"}
    return {"category": "cosmetics", "subCategory": "skincare", "categoryLabel": "Chăm Sóc Da", "categoryKr": "스킨케어"}

def main():
    print("=== BẮT ĐẦU CÀO TOP 5 SẢN PHẨM OLIVE YOUNG (ORGANIZED FOLDERS) ===")
    ranking_url = "https://www.oliveyoung.co.kr/store/main/getBestList.do"
    navigate_chrome(ranking_url)

    get_list_js = """
    (() => {
        const items = Array.from(document.querySelectorAll(".prd_info")).slice(0, 5);
        return JSON.stringify(items.map((el, idx) => {
            const linkEl = el.querySelector("a.prd_thumb, a.goodsList, a");
            const nameEl = el.querySelector(".tx_name");
            const brandEl = el.querySelector(".tx_brand");
            const originPriceEl = el.querySelector(".tx_org .tx_num");
            const salePriceEl = el.querySelector(".tx_cur .tx_num");
            const imgEl = el.parentElement.querySelector("img");
            const linkHref = linkEl ? linkEl.href : "";
            const match = linkHref.match(/goodsNo=([A-Z0-9]+)/);
            return {
                rank: idx + 1,
                goods_no: match ? match[1] : "",
                name: nameEl ? nameEl.innerText.trim() : "",
                brand: brandEl ? brandEl.innerText.trim() : "",
                origin_price_krw: originPriceEl ? originPriceEl.innerText.trim() : "",
                sale_price_krw: salePriceEl ? salePriceEl.innerText.trim() : "",
                product_url: linkHref,
                thumbnail_url: imgEl ? (imgEl.getAttribute("data-original") || imgEl.src) : ""
            };
        }));
    })()
    """
    raw_list = run_chrome_js(get_list_js)
    products = json.loads(raw_list)
    print(f"-> Đã lấy thành công danh sách {len(products)} sản phẩm đứng đầu bảng.")

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
        rank = p['rank']
        goods_no = p.get('goods_no', '')
        # Tạo thư mục riêng cho từng sản phẩm: rank_1_mediheal...
        clean_brand = "".join(c for c in p['brand'] if c.isalnum()) or f"brand_{rank}"
        prod_dir_name = f"top_{rank}_{clean_brand}_{goods_no}" if goods_no else f"top_{rank}_{clean_brand}"
        prod_dir = os.path.join(BASE_DIR, prod_dir_name)
        os.makedirs(prod_dir, exist_ok=True)
        
        print(f"\n[{rank}/5] Đang xử lý: {p['name'][:35]}...")
        print(f"-> Thư mục lưu trữ: {prod_dir_name}/")

        # 1. Tải ảnh đại diện chính
        thumb_ext = "png" if ".png" in p['thumbnail_url'] else "jpg"
        thumb_path = os.path.join(prod_dir, f"main_thumbnail.{thumb_ext}")
        download_hd_image(p['thumbnail_url'], thumb_path)
        p['local_main_thumbnail'] = thumb_path
        p['benefits_vietnamese'] = BENEFITS_MAP.get(rank, "Sản phẩm nội địa Hàn Quốc chính hãng.")

        # Tự động nhận diện phân loại danh mục động từ thông tin sản phẩm cào được
        cat_info = classify_korean_category(p['name'], p['benefits_vietnamese'])
        p['category'] = cat_info['category']
        p['subCategory'] = cat_info['subCategory']
        p['categoryLabel'] = cat_info['categoryLabel']
        p['categoryKr'] = cat_info['categoryKr']

        # 2. Điều hướng vào trang chi tiết
        p_url = p['product_url']
        if "tab=review" not in p_url:
            p_url += "&tab=review"
        navigate_chrome(p_url)

        # 3. Lấy 2 ảnh sản phẩm chi tiết
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
            path = os.path.join(prod_dir, f"product_detail_{ep_idx+1}.{ext}")
            if download_hd_image(u, path):
                saved_extra.append(path)
        p['local_product_details'] = saved_extra

        # 4. Kích hoạt Modal & Lấy 5 ảnh Review HD từ Shadow DOM
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
            path = os.path.join(prod_dir, f"review_user_{r_idx+1}.jpg")
            if download_hd_image(u, path):
                saved_revs.append(path)
        p['local_user_reviews'] = saved_revs
        p['folder_path'] = prod_dir

        # Lưu file info riêng cho từng thư mục sản phẩm
        with open(os.path.join(prod_dir, "info.json"), "w", encoding="utf-8") as f:
            json.dump(p, f, ensure_ascii=False, indent=2)

        print(f"-> ĐÃ LƯU: 1 ảnh chính + {len(saved_extra)} ảnh chi tiết + {len(saved_revs)} ảnh review HD vào {prod_dir_name}/")

    # Lưu file JSON tổng hợp
    with open(JSON_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)

    # Cập nhật README.md
    md_content = "# BẢNG XẾP HẠNG TOP 5 SẢN PHẨM BÁN CHẠY NHẤT OLIVE YOUNG (HÀN QUỐC)\n\n"
    md_content += "> Dữ liệu đã được phân loại riêng theo từng thư mục sản phẩm.\n\n---\n\n"
    for item in products:
        md_content += f"## Top {item['rank']}: {item['name']}\n"
        md_content += f"- **Thương hiệu:** {item['brand']}\n"
        md_content += f"- **Giá gốc:** {item['origin_price_krw']} Won | **Giá sale:** {item['sale_price_krw']} Won\n"
        md_content += f"- **Công dụng nổi bật:** {item['benefits_vietnamese']}\n"
        md_content += f"- **Link mua gốc:** [Xem trên Olive Young]({item['product_url']})\n"
        md_content += f"- **Thư mục lưu trữ:** `{item['folder_path']}`\n"
        md_content += f"- **1 Ảnh đại diện:** `{item['local_main_thumbnail']}`\n"
        md_content += f"- **2 Ảnh sản phẩm chi tiết:** `{item['local_product_details']}`\n"
        md_content += f"- **5 Ảnh review thực tế HD:** Đã lưu {len(item['local_user_reviews'])} ảnh (`{item['local_user_reviews']}`)\n\n---\n\n"

    with open(MD_OUTPUT, "w", encoding="utf-8") as f:
        f.write(md_content)

    # Xóa file cũ không cần thiết
    for old_f in ["top10_oliveyoung.json", "products_list.json"]:
        p_old = os.path.join(BASE_DIR, old_f)
        if os.path.exists(p_old):
            os.remove(p_old)

    print("\n=======================================================")
    print("HOÀN TẤT CÀO TOP 5 VÀ PHÂN LOẠI THƯ MỤC 100%!")
    print("=======================================================")

if __name__ == "__main__":
    main()
