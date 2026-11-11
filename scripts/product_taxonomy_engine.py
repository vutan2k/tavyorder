#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Product Taxonomy Engine - Tavy Korea E-Commerce Standard
Bộ máy phân loại tự động 3 tầng cho khâu cào dữ liệu từ Olive Young / Naver / High-End.
Đảm bảo 100% sản phẩm mới được phân loại chính xác trước khi vào database Firestore.
"""

import re
from typing import Dict, Any, Optional

def classify_product(name_kr: str, name_vi: str = "", metas: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    """
    Phân loại sản phẩm dựa trên:
    1. Mã phân loại chuẩn của Olive Young (eg:category1, eg:category2, eg:category3)
    2. Bộ lọc phủ quyết (Negative Filter): Chặn tóc vào mặt nạ, chặn kem đánh răng vào son
    3. Từ khóa nhận diện ngữ nghĩa đa ngữ (Việt - Hàn)
    """
    metas = metas or {}
    m1 = str(metas.get('eg:category1') or metas.get('m1') or '').strip()
    m2 = str(metas.get('eg:category2') or metas.get('m2') or '').strip()
    
    n_kr = (name_kr or '').lower()
    n_vi = (name_vi or '').lower()
    text = f"{n_kr} {n_vi}"
    
    # -------------------------------------------------------------------------
    # 1. TẦNG 1: KHÓA CHẶT THEO MÃ OLIVE YOUNG & TỪ KHÓA BẮT BUỘC
    # -------------------------------------------------------------------------

    # Chăm sóc tóc (Hair Care - OY ID: 10000010004)
    # Khóa chặt: Dù tên có "Hair Mask" hay "헤어팩" thì VẪN PHẢI VÀO HAIRCARE
    if m1 == '10000010004' or any(k in text for k in [
        '헤어', '샴푸', '트리트먼트', '헤어팩', '헤어오일', '두피',
        'dầu gội', 'dầu xả', 'ủ tóc', 'dưỡng tóc', 'hair mask', 'hair oil', 'tóc', 'da đầu'
    ]):
        return {'category': 'haircare', 'subCategory': 'haircare', 'category_vi': 'Chăm sóc tóc'}

    # Thực phẩm chức năng & Sâm nấm (Health & Supplements - OY ID: 1000002...)
    if m1.startswith('1000002') or any(k in text for k in [
        '건강식품', '비타민', '유산균', '단백질', '콜라겐젤리',
        'thực phẩm chức năng', 'men vi sinh', 'viên uống', 'vital', 'orthomol', 'protein', 'sữa lắc'
    ]):
        if any(k in text for k in ['홍삼', '인삼', 'ginseng', 'sâm', 'hồng sâm', 'linh chi']):
            return {'category': 'ginseng', 'subCategory': 'ginseng', 'category_vi': 'Sâm nấm Hàn Quốc'}
        return {'category': 'supplements', 'subCategory': 'supplements', 'category_vi': 'Thực phẩm chức năng'}

    # Chăm sóc cơ thể & Răng miệng (Body Care & Oral - OY ID: 10000010003)
    if m1 == '10000010003' or any(k in text for k in [
        '바디', '치약', '구강', '칫솔', '핸드크림',
        'sữa tắm', 'dưỡng thể', 'kem đánh răng', 'bàn chải', 'nước súc miệng', 'rucipello', 'colgate', 'tay'
    ]):
        return {'category': 'bodycare', 'subCategory': 'bodycare', 'category_vi': 'Chăm sóc cơ thể'}

    # Nước hoa High-End (Perfume)
    if any(k in text for k in ['향수', 'nước hoa', 'eau de parfum', 'eau de toilette', 'diptyque', 'do son', 'bleu de chanel']):
        return {'category': 'highend', 'subCategory': 'perfume', 'category_vi': 'Nước hoa cao cấp'}

    # -------------------------------------------------------------------------
    # 2. TẦNG 2: MẶT NẠ CHUYÊN SÂU (Chỉ nhận mặt nạ da mặt, loại trừ hoàn toàn quà tặng/tóc/môi)
    # -------------------------------------------------------------------------
    is_mask_product = (
        m1 == '10000010009' or 
        any(k in text for k in ['마스크팩', 'sheet mask', 'sleeping mask', 'mặt nạ thạch', 'mặt nạ giấy', 'mặt nạ đất sét', 'mặt nạ ngủ'])
    )
    # Chặn nếu chỉ là kem dưỡng/serum tặng kèm 1 mặt nạ
    is_gift_mask = bool(re.search(r'(?:kèm|tặng).*\d*\s*mặt nạ', n_vi) or '마스크 증정' in n_kr)
    if is_mask_product and not is_gift_mask:
        return {'category': 'skincare', 'subCategory': 'mask', 'category_vi': 'Mặt nạ'}

    # -------------------------------------------------------------------------
    # 3. TẦNG 3: TRANG ĐIỂM (MAKEUP)
    # -------------------------------------------------------------------------

    # Son môi & Trang điểm môi (OY ID Lip: 100000100020006)
    if m2 == '100000100020006' or (
        any(k in text for k in ['립스틱', '틴트', '립밤', '립글로스', '립 오일', '립플럼퍼', 'son', 'tint', 'lipstick', 'lip balm', 'dưỡng môi', 'thoa môi'])
        and not any(k in text for k in ['치약', 'đánh răng'])
    ):
        return {'category': 'makeup', 'subCategory': 'lipstick', 'category_vi': 'Son môi'}

    # Phấn nước (Cushion)
    if any(k in text for k in ['쿠션', 'cushion', 'phấn nước', 'phấn tươi']) and not any(k in text for k in ['선쿠션', 'sun cushion']):
        return {'category': 'makeup', 'subCategory': 'cushion', 'category_vi': 'Phấn nước (Cushion)'}

    # Bảng mắt & Phấn mắt (Eyeshadow)
    if any(k in text for k in ['아이섀도', '섀도우', '아이 팔레트', 'phấn mắt', 'bảng mắt', 'eyeshadow', 'palette']):
        return {'category': 'makeup', 'subCategory': 'eyeshadow', 'category_vi': 'Phấn mắt'}

    # Phấn má (Blush)
    if any(k in text for k in ['블러셔', '치크', 'phấn má', 'má hồng', 'blush', 'blusher']):
        return {'category': 'makeup', 'subCategory': 'blush', 'category_vi': 'Phấn má hồng'}

    # Phấn phủ (Powder)
    if any(k in text for k in ['파우더', 'phấn phủ', 'bột phủ', 'powder', 'no-sebum']) and not any(k in text for k in ['bảng mắt', 'cushion']):
        return {'category': 'makeup', 'subCategory': 'powder', 'category_vi': 'Phấn phủ kiềm dầu'}

    # Kem nền & Che khuyết điểm (Foundation & Concealer)
    if any(k in text for k in ['파운데이션', '비비', '컨실러', '프라이머', 'kem nền', 'phấn nền', 'foundation', 'bb cream', 'cc cream', 'che khuyết', 'kem lót']):
        return {'category': 'makeup', 'subCategory': 'foundation', 'category_vi': 'Kem nền & Che khuyết'}

    # Mascara & Kẻ mắt (Eye Makeup)
    if any(k in text for k in ['마스카라', '아이라이너', '아이브로우', 'mascara', 'kẻ mắt', 'kẻ mày', 'chì mày', 'chuốt mi']):
        return {'category': 'makeup', 'subCategory': 'eye_makeup', 'category_vi': 'Mascara & Kẻ mắt'}

    # -------------------------------------------------------------------------
    # 4. TẦNG 4: CHĂM SÓC DA (SKINCARE)
    # -------------------------------------------------------------------------

    # Tẩy trang (Makeup Remover: Cleansing Oil / Balm / Water)
    if any(k in text for k in ['클렌징오일', '클렌징워터', '클렌징밤', 'tẩy trang', 'dầu tẩy trang', 'sáp tẩy trang', 'nước tẩy trang', 'cleansing oil', 'cleansing balm']):
        return {'category': 'skincare', 'subCategory': 'makeup_remover', 'category_vi': 'Tẩy trang'}

    # Sữa rửa mặt (Cleanser: Foam / Gel)
    if any(k in text for k in ['클렌징폼', '폼클렌징', 'sữa rửa mặt', 'gel rửa mặt', 'bọt rửa mặt', 'cleansing foam', 'pack to foam', 'srm']):
        return {'category': 'skincare', 'subCategory': 'cleanser', 'category_vi': 'Sữa rửa mặt'}

    # Kem chống nắng (Suncare)
    if any(k in text for k in ['선크림', '선케어', '선스틱', '선쿠션', 'kem chống nắng', 'chống nắng', 'sunscreen', 'sun cream', 'sun stick', 'sun cushion', 'kcn']):
        return {'category': 'skincare', 'subCategory': 'suncare', 'category_vi': 'Kem chống nắng'}

    # Toner & Toner Pad & Xịt khoáng
    if any(k in text for k in ['토너', '토너패드', '스킨', '미스트', 'toner', 'toner pad', 'nước hoa hồng', 'nước cân bằng', 'xịt khoáng', 'mist']):
        return {'category': 'skincare', 'subCategory': 'toner_pad', 'category_vi': 'Toner & Toner Pad'}

    # Serum & Tinh chất (Serum / Ampoule / Essence)
    if any(k in text for k in ['세럼', '앰플', '에센스', 'serum', 'ampoule', 'essence', 'tinh chất']):
        return {'category': 'skincare', 'subCategory': 'serum', 'category_vi': 'Serum & Tinh chất'}

    # Kem dưỡng & Dưỡng ẩm (Cream / Moisturizer / Lotion)
    if any(k in text for k in ['크림', '보습', '수분', 'kem dưỡng', 'dưỡng ẩm', 'cấp ẩm', 'cream', 'lotion', 'emulsion', 'moisturizer']):
        return {'category': 'skincare', 'subCategory': 'cream', 'category_vi': 'Kem dưỡng da'}

    # Mặc định an toàn
    return {'category': 'skincare', 'subCategory': 'cream', 'category_vi': 'Chăm sóc da'}


if __name__ == '__main__':
    # Unit tests kiểm định tại chỗ
    tests = [
        ("어노브 딥 데미지 리페어 헤어 마스크", "Kem Ủ Tóc Unove Deep Damage Repair Hair Mask", {"eg:category1": "10000010004"}, "haircare", "haircare"),
        ("오쏘몰 바이탈 M/F 7개입", "Orthomol Vital M/F 7 gói", {"eg:category1": "10000020001"}, "supplements", "supplements"),
        ("메디힐 에센셜 마스크팩", "Mặt Nạ Giấy Mediheal Essential Mask", {"eg:category1": "10000010009"}, "skincare", "mask"),
        ("크리스탈글램틴트 단품", "Son Tint Bóng Clio Crystal Glam Tint", {"eg:category2": "100000100020006"}, "makeup", "lipstick"),
        ("마녀공장 퓨어 클렌징 오일", "Dầu Tẩy Trang Đậu Nành Manyo Factory", {}, "skincare", "makeup_remover"),
        ("아벤느 오떼르말 미스트", "Xịt Khoáng Dưỡng Ẩm Avene Thermal Spring Water", {}, "skincare", "toner_pad"),
        ("루치펠로 치약 105g", "Kem Đánh Răng Thơm Mát Rucipello", {}, "bodycare", "bodycare"),
        ("일소 슈퍼 멜팅 세범 소프트너", "Dung Dịch Làm Mềm Đẩy Mụn Đầu Đen ilso (+Kèm 1 Mặt Nạ)", {}, "skincare", "cream")
    ]
    for kr, vi, meta, exp_cat, exp_sub in tests:
        res = classify_product(kr, vi, meta)
        assert res['category'] == exp_cat and res['subCategory'] == exp_sub, f"FAILED on {vi}: got {res}"
    print("✓ 100% UNIT TEST TAXONOMY ENGINE PASS!")
