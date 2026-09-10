import os
import json
import re
from dedup_engine import calculate_file_hash, check_image_has_face

class ProductQCValidationError(Exception):
    pass

def verify_single_product(prod_data, folder_path):
    """
    Thanh tra kiểm định chất lượng 1 sản phẩm:
    Trả về (True, report_dict) nếu PASS.
    Bắn Exception nếu FAIL.
    """
    errors = []
    
    # 1. Kiểm tra SKU và Tên
    goods_no = prod_data.get('goods_no') or prod_data.get('goodsNo')
    if not goods_no:
        errors.append("Thiếu mã goods_no (SKU)")
    
    name_vi = prod_data.get('name_vi') or prod_data.get('name')
    if not name_vi or len(str(name_vi).strip()) < 5:
        errors.append("Tên sản phẩm tiếng Việt quá ngắn hoặc bị trống")
        
    # 2. Kiểm tra Giá tiền KRW & VND
    price_krw = prod_data.get('sale_price_krw') or prod_data.get('price')
    try:
        clean_price = int(str(price_krw).replace(',', '').replace('.', '').replace('원', '').strip())
        if clean_price <= 0:
            errors.append(f"Giá KRW không hợp lệ: {clean_price}")
    except Exception:
        errors.append(f"Không thể parse giá KRW: {price_krw}")
        
    price_vnd = prod_data.get('price_vnd') or prod_data.get('priceVnd')
    if not price_vnd or price_vnd <= 0:
        errors.append("Giá VND phải lớn hơn 0")

    # 3. Kiểm tra Ảnh đại diện chính
    main_thumb = prod_data.get('local_main_thumbnail')
    if not main_thumb or not os.path.exists(main_thumb):
        for ext in ['png', 'jpg', 'webp', 'jpeg']:
            cand = os.path.join(folder_path, f'main_thumbnail.{ext}')
            if os.path.exists(cand):
                main_thumb = cand
                prod_data['local_main_thumbnail'] = cand
                break
                
    if not main_thumb or not os.path.exists(main_thumb):
        errors.append(f"Không tìm thấy ảnh đại diện chính trong {folder_path}")
    
    main_thumb_hash = calculate_file_hash(main_thumb) if main_thumb and os.path.exists(main_thumb) else None
    
    # 4. Kiểm tra Lưới 8 ảnh review thực tế và Chống trùng lặp
    reviews = prod_data.get('local_user_reviews') or []
    if len(reviews) < 8:
        errors.append(f"Số lượng ảnh review thực tế chưa đủ 8 ảnh (hiện có {len(reviews)})")

    # Kiểm tra không trùng lặp ảnh giữa các review và với ảnh chính
    seen_hashes = set()
    if main_thumb_hash:
        seen_hashes.add(main_thumb_hash)
        
    for idx, rf in enumerate(reviews):
        if not os.path.exists(rf):
            errors.append(f"File ảnh review #{idx+1} không tồn tại: {rf}")
            continue
        
        # Kiểm tra dung lượng ảnh
        if os.path.getsize(rf) < 8000:
            errors.append(f"File ảnh review #{idx+1} quá nhỏ (<8KB): {rf}")
            
        f_hash = calculate_file_hash(rf)
        if f_hash in seen_hashes:
            errors.append(f"Phát hiện ảnh review #{idx+1} bị trùng nội dung với ảnh khác (Hash: {f_hash})")
        seen_hashes.add(f_hash)

        # Kiểm tra mặt người qua Apple Vision
        if check_image_has_face(rf):
            errors.append(f"Ảnh review #{idx+1} có mặt người, vi phạm tiêu chuẩn: {rf}")

    # 5. Kiểm tra phân loại options
    options = prod_data.get('options')
    if options is None or not isinstance(options, list):
        errors.append("Trường options không hợp lệ (phải là list)")
    else:
        opt_names = set()
        for idx, opt in enumerate(options):
            opt_name = opt.get('name_vi') or opt.get('name_kr') or opt.get('nameVi')
            if not opt_name:
                errors.append(f"Option #{idx+1} bị thiếu tên")
            if opt_name in opt_names:
                # Tự động phân biệt nếu có phân loại trùng tên
                disambiguated = f"{opt_name} (Loại {idx+1})"
                opt['name_vi'] = disambiguated
                opt_name = disambiguated
            opt_names.add(opt_name)

    # 6. Kiểm tra Tiếng Hàn trong mô tả
    desc = prod_data.get('basic_info', {}).get('core_benefits') or prod_data.get('description') or ''
    if re.search(r'[\uac00-\ud7a3]', desc):
        errors.append(f"Mô tả sản phẩm vẫn còn dính chữ tiếng Hàn: {desc[:60]}...")

    if errors:
        raise ProductQCValidationError("\n".join(errors))
        
    return True, {
        "goods_no": goods_no,
        "name_vi": name_vi,
        "options_count": len(options),
        "review_images_count": len(reviews),
        "status": "QC_PASSED_100%"
    }
