import re

# Từ điển thương hiệu K-Beauty chuẩn hóa sang dạng Latin
BRAND_LATIN_MAP = {
    "메디힐": "Mediheal",
    "어노브": "Unove",
    "에스트라": "Aestura",
    "라로슈포제": "La Roche-Posay",
    "토리든": "Torriden",
    "아누아": "Anua",
    "달바": "d'Alba",
    "클리오": "Clio",
    "정샘물": "Jungsaemmool",
    "마녀공장": "Manyo Factory",
    "바이오던스": "Biodance",
    "셀리맥스": "Celimax",
    "릴리바이레드": "Lilybyred",
    "구달": "Goodal",
    "웰라쥬": "Wellage",
    "라운드랩": "Round Lab",
    "넘버즈인": "Numbuzin",
    "파티온": "Fation",
    "스킨푸드": "Skinfood",
    "에스네이처": "S.Nature",
    "비디비치": "Vidi Vici",
    "헤라": "Hera",
    "페리페라": "Peripera",
    "에스쁘아": "Espoir",
    "롬앤": "Romand",
    "아이소이": "isoi",
    "닥터지": "Dr.G",
    "일리윤": "Illiyoon",
    "피지오겔": "Physiogel",
    "이니스프리": "Innisfree",
    "코스알엑스": "COSRX"
}

# Từ điển loại sản phẩm tiếng Hàn sang tiếng Việt chuẩn
PRODUCT_TYPE_MAP = [
    (["마스크팩", "시트마스크", "mask pack"], "Mặt Nạ Giấy"),
    (["토너패드", "패드", "toner pad", "pad"], "Bông Dưỡng Da Toner Pad"),
    (["트리트먼트", "헤어팩", "헤어 마스크", "treatment", "hair mask"], "Mặt Nạ Ủ Tóc Phục Hồi Hư Tổn"),
    (["세럼", "앰플", "에센스", "serum", "ampoule", "essence"], "Tinh Chất Serum"),
    (["선크림", "선스틱", "선케어", "sunscreen", "sun cream"], "Kem Chống Nắng"),
    (["수분크림", "보습크림", "크림", "cream"], "Kem Dưỡng Ẩm Phục Hồi"),
    (["클렌징", "폼클렌징", "cleanser", "cleansing"], "Sữa Rửa Mặt Làm Sạch Sâu"),
    (["쿠션", "cushion"], "Phấn Nước Cushion"),
    (["립", "틴트", "lip", "tint"], "Son Kem Lì"),
    (["샴푸", "shampoo"], "Dầu Gội Chăm Sóc Tóc")
]

# Cơ sở tri thức thành phần hoạt chất K-Beauty và công dụng chuẩn
INGREDIENT_KNOWLEDGE_BASE = [
    {
        "keywords": ["마데카소사이드", "madecassoside", "cica", "시카", "rau má", "rau ma"],
        "ingredient": "tinh chất rau má Madecassoside đậm đặc kết hợp phức hợp Cica làm dịu",
        "benefit": "làm dịu nốt mụn sưng đỏ, làm mờ vết thâm sau mụn và phục hồi hàng rào màng tế bào da bị tổn thương"
    },
    {
        "keywords": ["티트리", "tea tree", "tràm trà", "tram tra"],
        "ingredient": "chiết xuất tràm trà Teatree tự nhiên giàu hoạt chất kháng khuẩn",
        "benefit": "kiểm soát dầu thừa, gom cồi mụn nhanh chóng và mang lại cảm giác thanh mát, dịu nhẹ cho da mụn"
    },
    {
        "keywords": ["콜라겐", "collagen"],
        "ingredient": "Collagen peptide thủy phân phân tử siêu nhỏ",
        "benefit": "tăng cường độ đàn hồi cốt lõi, làm mờ rãnh nhăn nông và hỗ trợ nâng cơ giúp làn da săn chắc mịn màng"
    },
    {
        "keywords": ["히알루론", "hyaluronic", "수분", "cấp ẩm", "cấp nước", "dưỡng ẩm", "ha"],
        "ingredient": "phức hợp Hyaluronic Acid đa tầng kết hợp Ceramide khóa ẩm",
        "benefit": "cấp nước sâu tận hạ bì, giải cứu làn da thiếu ẩm khô ráp và duy trì bề mặt da căng mọng suốt cả ngày"
    },
    {
        "keywords": ["비타민", "vitamin c", "잡티", "mờ thâm", "dưỡng trắng", "vita c", "vita"],
        "ingredient": "dẫn xuất Vitamin C tươi cùng Niacinamide dưỡng sáng",
        "benefit": "ức chế melanin, làm mờ thâm nám tàn nhang và nuôi dưỡng làn da đều màu sáng mịn tự nhiên"
    },
    {
        "keywords": ["pdrn", "로제", "pep", "tế bào gốc"],
        "ingredient": "tinh chất Rose PDRN chiết xuất thực vật cùng phức hợp peptide",
        "benefit": "thu nhỏ lỗ chân lông, cải thiện bề mặt da thô ráp và mang lại hiệu ứng căng bóng rạng rỡ"
    },
    {
        "keywords": ["세라마이드", "ceramide", "장벽", "phục hồi", "barrier"],
        "ingredient": "Ceramide tinh khiết củng cố cấu trúc lipid sinh học",
        "benefit": "hàn gắn hàng rào bảo vệ da suy yếu, ngăn ngừa mất nước và bảo vệ da tối ưu trước tác nhân môi trường"
    },
    {
        "keywords": ["트리트먼트", "헤어", "hair", "dưỡng tóc", "hair mask", "damage", "damage repair"],
        "ingredient": "30.000ppm phức hợp đạm Keratin và 36 loại acid amin thiết yếu",
        "benefit": "phục hồi biểu bì tóc hư tổn nặng do uốn nhuộm nhiệt, lấp đầy lõi tóc và mang lại độ bóng mượt bồng bềnh tức thì"
    },
    {
        "keywords": ["쿠션", "cushion", "phấn nước", "che phủ", "tone"],
        "ingredient": "hạt phấn siêu mịn phủ khoáng chất cùng dưỡng chất cấp ẩm dịu nhẹ",
        "benefit": "tạo lớp nền che phủ hoàn hảo các khuyết điểm, kiềm dầu bền màu suốt 24 giờ mà vẫn giữ nét căng bóng tự nhiên"
    },
    {
        "keywords": ["클렌징", "cleanser", "rửa mặt", "tẩy trang", "cleansing"],
        "ingredient": "chiết xuất dầu thực vật lên men kết hợp các acid béo dịu nhẹ",
        "benefit": "cuốn trôi sạch sâu bụi mịn và cặn trang điểm cứng đầu mà không gây khô căng, duy trì độ pH lý tưởng cho da"
    }
]

def clean_brand_name(brand_kr):
    """Chuyển thương hiệu tiếng Hàn sang Latin chuẩn"""
    if not brand_kr:
        return "Thương hiệu Hàn Quốc"
    for kr, lat in BRAND_LATIN_MAP.items():
        if kr in brand_kr:
            return lat
    # Xóa ký tự tiếng Hàn nếu có
    latin_only = re.sub(r'[\uac00-\ud7a3]+', '', brand_kr).strip()
    return latin_only if latin_only else brand_kr

def clean_vietnamese_product_name(raw_name, brand_kr, category_label="Mỹ phẩm"):
    """
    Chuẩn hóa tên sản phẩm tiếng Việt sạch 100% không tiếng Hàn:
    [Loại sản phẩm] + [Tên dòng Latin/Dung tích] + [Thương hiệu Latin]
    """
    brand_latin = clean_brand_name(brand_kr)
    text = raw_name.lower()

    # Xác định loại sản phẩm
    matched_type = category_label
    for keywords, v_type in PRODUCT_TYPE_MAP:
        if any(k in text for k in keywords):
            matched_type = v_type
            break

    # Trích xuất dung tích / quy cách (ví dụ 320ml, 100+100, 10+1, 50ml)
    vol_match = re.search(r'(\d+[\+\d]*\s*(?:ml|g|매|miếng|ea|set|mieng))', raw_name, re.IGNORECASE)
    vol_str = ""
    if vol_match:
        vol_clean = vol_match.group(1).replace("매", " Miếng").replace("ea", " Món")
        vol_str = f"({vol_clean.strip()})"

    # Trích xuất từ khóa tiếng Anh nếu có (như Deep Damage Repair, Derma Pad, Nosca9...)
    eng_matches = re.findall(r'[A-Za-z0-9\+\-]+(?:\s+[A-Za-z0-9\+\-]+)*', raw_name)
    eng_words = [w for w in eng_matches if len(w) > 2 and w.lower() not in [brand_latin.lower(), "ml", "ea"]]
    eng_sub = " ".join(eng_words[:3]) if eng_words else ""

    final_name = f"{matched_type} {brand_latin} {eng_sub} {vol_str}".strip()
    final_name = re.sub(r'\s+', ' ', final_name)
    final_name = re.sub(r'[\uac00-\ud7a3]+', '', final_name).strip()
    return final_name

def generate_seo_vietnamese_description(product_name_vi, raw_name_kr, brand_name, category_label="Mỹ phẩm"):
    """
    Tạo ra một đoạn văn xuôi duy nhất (Single Paragraph), chuẩn SEO bán lẻ:
    - Nêu rõ thành phần nổi bật
    - Nêu rõ công dụng da liễu
    - 100% tiếng Việt tự nhiên, cấm tuyệt đối chữ Hàn
    - Độ dài từ 55 - 95 từ, súc tích và đắt giá
    """
    clean_brand = clean_brand_name(brand_name)
    combined_text = f"{product_name_vi} {raw_name_kr}".lower()
    
    # Tìm hoạt chất phù hợp nhất
    matched_kb = None
    for kb in INGREDIENT_KNOWLEDGE_BASE:
        if any(kw in combined_text for kw in kb["keywords"]):
            matched_kb = kb
            break
            
    if not matched_kb:
        matched_kb = {
            "ingredient": "phức hợp dưỡng chất tự nhiên cô đặc cùng các vitamin thiết yếu",
            "benefit": "nuôi dưỡng làn da khỏe mạnh, cân bằng độ ẩm tối ưu và phục hồi vẻ rạng rỡ tươi trẻ"
        }
        
    ingredient = matched_kb["ingredient"]
    benefit = matched_kb["benefit"]
    
    # Cấu trúc 1 đoạn văn thẳng mạch lạc, chuẩn SEO
    paragraph = (
        f"{product_name_vi} từ thương hiệu {clean_brand} là giải pháp chăm sóc chuyên sâu "
        f"nổi bật với bảng thành phần giàu {ingredient}. Sản phẩm thẩm thấu nhanh vào từng tầng tế bào giúp {benefit}, "
        f"đồng thời ngăn ngừa tình trạng kích ứng và cải thiện kết cấu rõ rệt sau mỗi lần sử dụng. "
        f"Công thức lành tính, phù hợp cho người dùng sử dụng đều đặn mỗi ngày."
    )
    
    # Loại bỏ triệt để ký tự tiếng Hàn nếu có lọt vào
    paragraph = re.sub(r'[\uac00-\ud7a3]+', '', paragraph)
    # Loại bỏ khoảng trắng thừa
    paragraph = re.sub(r'\s+', ' ', paragraph).strip()
    
    return paragraph
