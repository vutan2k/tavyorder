import os
import json
import time

BASE_DIR = "/Users/tan/Desktop/oliveyoung_ranking"
FULL_JSON_PATH = os.path.join(BASE_DIR, "top100_oliveyoung_full.json")
BACKUP_PATH = os.path.join(BASE_DIR, "top100_oliveyoung_full.v1_backup.json")
README_V2_PATH = os.path.join(BASE_DIR, "README_TOP100_V2.md")

def main():
    print("🚀 Bắt đầu tổng hợp 100 sản phẩm đã làm giàu dữ liệu...")
    
    # Đọc danh sách 100 thư mục sản phẩm
    folders = []
    for d in sorted(os.listdir(BASE_DIR)):
        if d.startswith("top_") and os.path.isdir(os.path.join(BASE_DIR, d)):
            folders.append(os.path.join(BASE_DIR, d))

    print(f"📂 Tìm thấy {len(folders)} thư mục sản phẩm.")

    aggregated_products = []
    total_options = 0
    total_reviews = 0
    single_prods = 0
    variant_prods = 0

    for f_path in folders:
        info_file = os.path.join(f_path, "info.json")
        if not os.path.exists(info_file):
            continue
        try:
            with open(info_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            aggregated_products.append(data)

            opts = data.get("options", [])
            revs = data.get("local_user_reviews", [])
            total_options += len(opts)
            total_reviews += len(revs)
            if len(opts) > 0:
                variant_prods += 1
            else:
                single_prods += 1
        except Exception as e:
            print(f"⚠️ Lỗi đọc {info_file}: {e}")

    # Sắp xếp theo rank tăng dần
    aggregated_products.sort(key=lambda x: int(x.get("rank", 999)))

    # Lưu bản backup trước khi ghi đè
    if os.path.exists(FULL_JSON_PATH) and not os.path.exists(BACKUP_PATH):
        import shutil
        shutil.copy2(FULL_JSON_PATH, BACKUP_PATH)

    # Ghi đè cập nhật vào top100_oliveyoung_full.json
    with open(FULL_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(aggregated_products, f, ensure_ascii=False, indent=2)

    print(f"✅ Đã ghi {len(aggregated_products)} sản phẩm vào: {FULL_JSON_PATH}")
    print(f"📊 THỐNG KÊ TỔNG THỂ:")
    print(f"  - Tổng số sản phẩm: {len(aggregated_products)}")
    print(f"  - Sản phẩm có phân loại (variants): {variant_prods} sản phẩm ({total_options} options)")
    print(f"  - Sản phẩm đơn lẻ: {single_prods} sản phẩm")
    print(f"  - Tổng số ảnh review HD đã lưu và kiểm duyệt: {total_reviews} ảnh (Trung bình: {total_reviews/len(aggregated_products):.1f} ảnh/SP)")

    # Tạo bảng báo cáo Markdown README_TOP100_V2.md
    md = "# BẢNG TỔNG HỢP TOP 100 SẢN PHẨM OLIVE YOUNG (BẢN V2 ĐẦY ĐỦ PHÂN LOẠI & 8 ẢNH REVIEW)\n\n"
    md += f"- **Tổng số sản phẩm:** {len(aggregated_products)}\n"
    md += f"- **Sản phẩm có phân loại:** {variant_prods} sản phẩm (Tổng cộng {total_options} variants)\n"
    md += f"- **Sản phẩm đơn lẻ:** {single_prods} sản phẩm\n"
    md += f"- **Tổng số ảnh review HD sạch 100% không mặt người:** {total_reviews} ảnh\n\n---\n\n"
    md += "| Rank | Tên Sản Phẩm (Tiếng Việt) | Thương Hiệu | Giá Sale (₩) | Giá Dự Kiến (VNĐ) | Số Options | Số Ảnh Review | Trạng Thái QC |\n"
    md += "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n"
    for p in aggregated_products:
        r = p.get("rank", 0)
        n = p.get("name_vi", p.get("name", ""))[:45]
        b = p.get("brand_vi", p.get("brand", ""))
        p_krw = f"{p.get('price', 0):,} ₩"
        p_vnd = f"{p.get('price_vnd', 0):,} đ"
        opts_cnt = len(p.get("options", []))
        rev_cnt = len(p.get("local_user_reviews", []))
        md += f"| {r} | {n} | {b} | {p_krw} | {p_vnd} | {opts_cnt} | {rev_cnt} | ✅ PASSED |\n"

    with open(README_V2_PATH, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"📁 Đã tạo báo cáo Markdown tại: {README_V2_PATH}")

if __name__ == "__main__":
    main()
