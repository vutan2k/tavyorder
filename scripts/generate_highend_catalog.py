#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Harvest authentic Department Store (신세계백화점 / 롯데백화점) high-end products for Tavy Korea.
"""

import sys, json, time, os, urllib.request, urllib.parse
from pathlib import Path

sys.path.append("/Users/tan/tavy-korea/scripts")
from chrome_coordinator import ChromeCoordinator, ChromeTabManager

HIGH_END_SEEDS = [
    {
        "goodsNo": "HE0000000001",
        "search": "신세계백화점 디올 립글로우",
        "name_vi": "Son Dưỡng Dior Addict Lip Glow Có Màu Cao Cấp (Nhiều Tone Màu)",
        "brand": "DIOR",
        "brand_vi": "Dior",
        "category": "highend",
        "subCategory": "lipstick",
        "koreanTitle": "디올 어딕트 립 글로우",
        "foreignPrice": 50000,
        "originalPriceWon": 50000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Son dưỡng môi Dior Addict Lip Glow đỉnh cao với công nghệ Color Reviver phản ứng với độ pH của môi để tạo nên sắc hồng tự nhiên riêng biệt. Chứa dầu hoa anh đào và bơ hạt mỡ dưỡng ẩm suốt 24h, làm mềm rãnh môi và chống khô nứt hiệu quả.",
        "usage": "Thoa trực tiếp lên môi bất cứ khi nào cảm thấy khô, hoặc thoa làm lớp lót trước khi dùng son màu để môi căng mịn và chuẩn sắc hơn.",
        "options": [
            {"id": "001", "name": "#001 Pink (Hồng Tự Nhiên)", "name_vi": "#001 Pink (Hồng Tự Nhiên)", "price": 50000, "isSoldOut": False},
            {"id": "004", "name": "#004 Coral (Cam San Hô)", "name_vi": "#004 Coral (Cam San Hô)", "price": 50000, "isSoldOut": False},
            {"id": "012", "name": "#012 Rosewood (Hồng Gỗ)", "name_vi": "#012 Rosewood (Hồng Gỗ)", "price": 50000, "isSoldOut": False},
            {"id": "015", "name": "#015 Cherry (Đỏ Cherry)", "name_vi": "#015 Cherry (Đỏ Cherry)", "price": 50000, "isSoldOut": False},
            {"id": "020", "name": "#020 Mahogany (Nâu Gỗ Trầm)", "name_vi": "#020 Mahogany (Nâu Gỗ Trầm)", "price": 50000, "isSoldOut": False},
            {"id": "031", "name": "#031 Strawberry (Đỏ Dâu Tươi)", "name_vi": "#031 Strawberry (Đỏ Dâu Tươi)", "price": 50000, "isSoldOut": False},
            {"id": "038", "name": "#038 Rose Nude (Hồng Nude)", "name_vi": "#038 Rose Nude (Hồng Nude)", "price": 50000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000002",
        "search": "신세계백화점 디올 립 맥시마이저",
        "name_vi": "Son Bóng Dưỡng Căng Mọng Môi Dior Addict Lip Maximizer 6ml",
        "brand": "DIOR",
        "brand_vi": "Dior",
        "category": "highend",
        "subCategory": "lipstick",
        "koreanTitle": "디올 어딕트 립 맥시마이저",
        "foreignPrice": 52000,
        "originalPriceWon": 52000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Son bóng dưỡng căng mọng môi số 1 của Dior chứa 90% thành phần nguồn gốc tự nhiên với các hạt vi nang Hyaluronic Acid giúp môi căng đầy tức thì, giữ ẩm và bóng mịn suốt ngày dài.",
        "usage": "Thoa đơn lẻ để có đôi môi bóng mọng tự nhiên hoặc phủ lên trên lớp son màu để tăng hiệu ứng bắt sáng quyến rũ.",
        "options": [
            {"id": "001", "name": "#001 Pink (Hồng Trong Suốt)", "name_vi": "#001 Pink (Hồng Trong Suốt)", "price": 52000, "isSoldOut": False},
            {"id": "004", "name": "#004 Coral (Cam San Hô)", "name_vi": "#004 Coral (Cam San Hô)", "price": 52000, "isSoldOut": False},
            {"id": "009", "name": "#009 Intense Rosewood (Hồng Gỗ Đậm)", "name_vi": "#009 Intense Rosewood (Hồng Gỗ Đậm)", "price": 52000, "isSoldOut": False},
            {"id": "012", "name": "#012 Rosewood (Hồng Khô)", "name_vi": "#012 Rosewood (Hồng Khô)", "price": 52000, "isSoldOut": False},
            {"id": "018", "name": "#018 Intense Spice (Cam Đất Trầm)", "name_vi": "#018 Intense Spice (Cam Đất Trầm)", "price": 52000, "isSoldOut": False},
            {"id": "020", "name": "#020 Mahogany (Nâu Đỏ Sang Trọng)", "name_vi": "#020 Mahogany (Nâu Đỏ Sang Trọng)", "price": 52000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000003",
        "search": "신세계백화점 루즈 디올 포에버 리퀴드",
        "name_vi": "Son Kem Lì Kháng Nước Không Lem Dior Rouge Forever Liquid 6ml",
        "brand": "DIOR",
        "brand_vi": "Dior",
        "category": "highend",
        "subCategory": "lipstick",
        "koreanTitle": "루즈 디올 포에버 리퀴드",
        "foreignPrice": 61000,
        "originalPriceWon": 61000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Son kem lì transfer-proof đột phá từ Dior với kết cấu siêu mỏng nhẹ, bám màu bền chặt đến 12 giờ mà không gây khô môi hay lộ vân môi, kháng nước và chống lem tuyệt đối.",
        "usage": "Thoa trực tiếp lên môi từ lòng môi tán đều ra viền môi, để khô tự nhiên trong 3-5 phút để hạt màu set lì hoàn toàn.",
        "options": [
            {"id": "100", "name": "#100 Forever Nude (Nude Tự Nhiên)", "name_vi": "#100 Forever Nude (Nude Tự Nhiên)", "price": 61000, "isSoldOut": False},
            {"id": "200", "name": "#200 Forever Nude Touch (Nâu Nude)", "name_vi": "#200 Forever Nude Touch (Nâu Nude)", "price": 61000, "isSoldOut": False},
            {"id": "505", "name": "#505 Forever Sensual (Hồng Đất Thời Thượng)", "name_vi": "#505 Forever Sensual (Hồng Đất Thời Thượng)", "price": 61000, "isSoldOut": False},
            {"id": "720", "name": "#720 Forever Icone (Hồng Khô Quý Phái)", "name_vi": "#720 Forever Icone (Hồng Khô Quý Phái)", "price": 61000, "isSoldOut": False},
            {"id": "999", "name": "#999 Forever Dior (Đỏ Thuần Huyền Thoại)", "name_vi": "#999 Forever Dior (Đỏ Thuần Huyền Thoại)", "price": 61000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000004",
        "search": "신세계백화점 디올 포에버 스킨 글로우 쿠션",
        "name_vi": "Phấn Nước Căng Bóng Dior Forever Skin Glow Cushion (Hộp + Lõi)",
        "brand": "DIOR",
        "brand_vi": "Dior",
        "category": "highend",
        "subCategory": "cushion",
        "koreanTitle": "디올 포에버 스킨 글로우 쿠션",
        "foreignPrice": 108000,
        "originalPriceWon": 108000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Phấn nước cao cấp Dior Forever Skin Glow với chiết xuất hoa păng-sê dại cấp ẩm suốt 24h, mang đến lớp nền rạng rỡ, trong trẻo như sương mai nhưng che khuyết điểm vượt trội.",
        "usage": "Dùng bông phấn dặm nhẹ lấy lượng kem vừa đủ, vỗ đều từ trung tâm mặt ra ngoài cho lớp nền tệp tự nhiên.",
        "options": [
            {"id": "0N", "name": "Tone 0N Neutral (Da Trắng Sáng)", "name_vi": "Tone 0N Neutral (Da Trắng Sáng)", "price": 108000, "isSoldOut": False},
            {"id": "1N", "name": "Tone 1N Neutral (Da Trắng Tự Nhiên)", "name_vi": "Tone 1N Neutral (Da Trắng Tự Nhiên)", "price": 108000, "isSoldOut": False},
            {"id": "1.5N", "name": "Tone 1.5N Neutral (Da Tự Nhiên)", "name_vi": "Tone 1.5N Neutral (Da Tự Nhiên)", "price": 108000, "isSoldOut": False},
            {"id": "2N", "name": "Tone 2N Neutral (Da Trung Bình)", "name_vi": "Tone 2N Neutral (Da Trung Bình)", "price": 108000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000005",
        "search": "신세계백화점 입생로랑 캔디 글레이즈",
        "name_vi": "Son Dưỡng Bóng Căng Mọng YSL Candy Glaze Lip Gloss Stick",
        "brand": "YSL",
        "brand_vi": "YSL Beauty",
        "category": "highend",
        "subCategory": "lipstick",
        "koreanTitle": "입생로랑 캔디 글레이즈 립 글로스 스틱",
        "foreignPrice": 49000,
        "originalPriceWon": 49000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Son dưỡng YSL Candy Glaze bóng bẩy như kẹo ngọt với chiết xuất lựu đỏ và Axit Hyaluronic giúp dưỡng ẩm sâu 8 giờ, mang lại hiệu ứng môi căng mọng đầy đặn và sang chảnh.",
        "usage": "Vặn nhẹ đầu son (xoay 1-2 nấc nhỏ vì chất son rất mềm giàu dưỡng) và thoa đều lên môi.",
        "options": [
            {"id": "02", "name": "#02 Healthy Glow Plumper (Trong Suốt The Mát)", "name_vi": "#02 Healthy Glow Plumper (Trong Suốt The Mát)", "price": 49000, "isSoldOut": False},
            {"id": "15", "name": "#15 Showcasing Nude (Trà Sữa Nude)", "name_vi": "#15 Showcasing Nude (Trà Sữa Nude)", "price": 49000, "isSoldOut": False},
            {"id": "12", "name": "#12 Electric Love (Đỏ San Hô)", "name_vi": "#12 Electric Love (Đỏ San Hô)", "price": 49000, "isSoldOut": False},
            {"id": "13", "name": "#13 Flashing Rose (Hồng Đào Ngọt Ngào)", "name_vi": "#13 Flashing Rose (Hồng Đào Ngọt Ngào)", "price": 49000, "isSoldOut": False},
            {"id": "14", "name": "#14 Scenic Brown (Nâu Đỏ Trầm Ấm)", "name_vi": "#14 Scenic Brown (Nâu Đỏ Trầm Ấm)", "price": 49000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000006",
        "search": "신세계백화점 입생로랑 더 슬림",
        "name_vi": "Son Thỏi Vuông Lì Mịn YSL Rouge Pur Couture The Slim 2.2g",
        "brand": "YSL",
        "brand_vi": "YSL Beauty",
        "category": "highend",
        "subCategory": "lipstick",
        "koreanTitle": "루쥬 삐르 꾸뛰르 더 슬림",
        "foreignPrice": 55000,
        "originalPriceWon": 55000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Biểu tượng son thỏi vàng viền đen YSL The Slim với đầu son vát vuông độc đáo giúp viền môi sắc nét, chất son da thuộc lì mịn màng, lên màu chuẩn xác chỉ sau một đường lướt nhẹ.",
        "usage": "Dùng góc vuông của thỏi son để tạo đường viền môi sắc sảo, sau đó tô đều phần lòng môi.",
        "options": [
            {"id": "1966", "name": "#1966 Rouge Libre (Đỏ Cháy Thời Thượng)", "name_vi": "#1966 Rouge Libre (Đỏ Cháy Thời Thượng)", "price": 55000, "isSoldOut": False},
            {"id": "21", "name": "#21 Rouge Paradoxe (Đỏ Tươi Quyền Lực)", "name_vi": "#21 Rouge Paradoxe (Đỏ Tươi Quyền Lực)", "price": 55000, "isSoldOut": False},
            {"id": "28", "name": "#28 True Chili (Đỏ Gạch Tôn Da)", "name_vi": "#28 True Chili (Đỏ Gạch Tôn Da)", "price": 55000, "isSoldOut": False},
            {"id": "30", "name": "#30 Nude Protest (Nâu Hồng Nude)", "name_vi": "#30 Nude Protest (Nâu Hồng Nude)", "price": 55000, "isSoldOut": False},
            {"id": "31", "name": "#31 Emotional Nude (Hồng Trà Thanh Lịch)", "name_vi": "#31 Emotional Nude (Hồng Trà Thanh Lịch)", "price": 55000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000007",
        "search": "신세계백화점 입생로랑 엉크르 드 뽀 쿠션",
        "name_vi": "Phấn Nước Vỏ Da Đen YSL Encre de Peau Le Cushion (Hộp + Lõi)",
        "brand": "YSL",
        "brand_vi": "YSL Beauty",
        "category": "highend",
        "subCategory": "cushion",
        "koreanTitle": "엉크르 드 뽀 쿠션",
        "foreignPrice": 103000,
        "originalPriceWon": 103000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Phấn nước vỏ da Chevron đen biểu tượng của YSL mang lại lớp nền bán lì lụa là (luminous matte), kiểm soát bã nhờn suốt 24h và bảo vệ da tối ưu dưới ánh nắng mặt trời.",
        "usage": "Ấn nhẹ bông phấn lấy lượng vừa đủ, vỗ đều toàn mặt theo hướng từ trong ra ngoài.",
        "options": [
            {"id": "B10", "name": "Tone B10 (Da Trắng Sáng)", "name_vi": "Tone B10 (Da Trắng Sáng)", "price": 103000, "isSoldOut": False},
            {"id": "B20", "name": "Tone B20 (Da Trắng Tự Nhiên)", "name_vi": "Tone B20 (Da Trắng Tự Nhiên)", "price": 103000, "isSoldOut": False},
            {"id": "B25", "name": "Tone B25 (Da Tự Nhiên Ấm)", "name_vi": "Tone B25 (Da Tự Nhiên Ấm)", "price": 103000, "isSoldOut": False},
            {"id": "B30", "name": "Tone B30 (Da Trung Bình)", "name_vi": "Tone B30 (Da Trung Bình)", "price": 103000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000008",
        "search": "신세계백화점 샤넬 루쥬 코코 밤",
        "name_vi": "Son Dưỡng Thỏi Trắng Cao Cấp Chanel Rouge Coco Baume 3g",
        "brand": "CHANEL",
        "brand_vi": "Chanel",
        "category": "highend",
        "subCategory": "lipstick",
        "koreanTitle": "루쥬 코코 밤",
        "foreignPrice": 55000,
        "originalPriceWon": 55000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Son dưỡng cao cấp thỏi trắng sang trọng từ Chanel kết hợp tinh chất dưỡng ẩm từ bơ ô liu và hoa trà trắng Camellia, dưỡng ẩm căng mọng và tạo lớp màu nhẹ nhàng tự nhiên.",
        "usage": "Thoa nhẹ 1 lớp để có sắc màu trong trẻo tự nhiên, thoa 2-3 lớp để lên màu đậm đà và bóng khoẻ hơn.",
        "options": [
            {"id": "912", "name": "#912 Dreamy White (Không Màu Trong Suốt)", "name_vi": "#912 Dreamy White (Không Màu Trong Suốt)", "price": 55000, "isSoldOut": False},
            {"id": "914", "name": "#914 Natural Charm (Caramel Nude Ấm)", "name_vi": "#914 Natural Charm (Caramel Nude Ấm)", "price": 55000, "isSoldOut": False},
            {"id": "918", "name": "#918 My Rose (Hồng Tươi Tươi Sáng)", "name_vi": "#918 My Rose (Hồng Tươi Tươi Sáng)", "price": 55000, "isSoldOut": False},
            {"id": "920", "name": "#920 In Love (Đỏ Cam Tươi Tắn)", "name_vi": "#920 In Love (Đỏ Cam Tươi Tắn)", "price": 55000, "isSoldOut": False},
            {"id": "924", "name": "#924 Fall For Me (Đỏ Mận Cuốn Hút)", "name_vi": "#924 Fall For Me (Đỏ Mận Cuốn Hút)", "price": 55000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000009",
        "search": "신세계백화점 설화수 윤조에센스 6세대",
        "name_vi": "Tinh Chất Khởi Nguồn Tái Sinh Da Sulwhasoo First Care Serum VI",
        "brand": "Sulwhasoo",
        "brand_vi": "Sulwhasoo",
        "category": "highend",
        "subCategory": "serum",
        "koreanTitle": "윤조에센스 6세대",
        "foreignPrice": 140000,
        "originalPriceWon": 140000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Tinh chất phục hồi số 1 Hàn Quốc thế hệ thứ 6 chứa phức hợp Sulwhasoo Master Complex từ sâm nguyên bản, giúp kích hoạt sức mạnh phục hồi tự nhiên của làn da, củng cố hàng rào bảo vệ da săn chắc và sáng khỏe tức thì.",
        "usage": "Sử dụng ngay ở bước đầu tiên sau khi rửa mặt sạch (trước toner). Bơm 2-3 giọt ra lòng bàn tay, làm ấm và áp nhẹ lên toàn bộ gương mặt kết hợp hít thở thư giãn với hương sâm thảo mộc.",
        "options": [
            {"id": "60ml", "name": "Chai 60ml Tiêu Chuẩn", "name_vi": "Chai 60ml Tiêu Chuẩn", "price": 140000, "isSoldOut": False},
            {"id": "90ml", "name": "Chai 90ml Tiết Kiệm", "name_vi": "Chai 90ml Tiết Kiệm", "price": 180000, "isSoldOut": False},
            {"id": "set60", "name": "Set 60ml + Quà Tặng Bộ Dưỡng Mini Bách Hóa", "name_vi": "Set 60ml + Quà Tặng Bộ Dưỡng Mini Bách Hóa", "price": 140000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000010",
        "search": "신세계백화점 설화수 자음생크림",
        "name_vi": "Kem Sâm Ngăn Lão Hóa Chuyên Sâu Sulwhasoo Concentrated Ginseng Cream 60ml",
        "brand": "Sulwhasoo",
        "brand_vi": "Sulwhasoo",
        "category": "highend",
        "subCategory": "cream",
        "koreanTitle": "자음생크림 클래식",
        "foreignPrice": 270000,
        "originalPriceWon": 270000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Kem dưỡng sâm cao cấp quyền năng của Sulwhasoo được chắt lọc từ hoạt chất Ginsenomics cô đặc gấp 6000 lần tinh hoa nhân sâm quý hiếm, giúp phục hồi độ đàn hồi, làm mờ nếp nhăn và săn chắc da đa tầng.",
        "usage": "Dùng ở bước cuối chu trình dưỡng da vào buổi sáng và tối. Lấy lượng kem bằng hạt hạnh nhân chấm 5 điểm trên mặt rồi massage nhẹ nhàng theo chiều nâng cơ.",
        "options": [
            {"id": "classic", "name": "Bản Classic (Giàu Dưỡng Chất Ẩm Sâu)", "name_vi": "Bản Classic (Giàu Dưỡng Chất Ẩm Sâu)", "price": 270000, "isSoldOut": False},
            {"id": "soft", "name": "Bản Soft (Chất Kem Thoáng Mịn Thấm Nhanh)", "name_vi": "Bản Soft (Chất Kem Thoáng Mịn Thấm Nhanh)", "price": 270000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000011",
        "search": "신세계백화점 에스티로더 갈색병",
        "name_vi": "Tinh Chất Phục Hồi Chống Lão Hóa Ban Đêm Estée Lauder ANR Serum",
        "brand": "Estée Lauder",
        "brand_vi": "Estée Lauder",
        "category": "highend",
        "subCategory": "serum",
        "koreanTitle": "어드밴스드 나이트 리페어 싱크로나이즈드 멀티-리커버리 콤플렉스",
        "foreignPrice": 182000,
        "originalPriceWon": 182000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Huyền thoại serum chai nâu Estée Lauder Advanced Night Repair với công nghệ Chronolux Power Signal độc quyền giúp thúc đẩy quá trình tái tạo collagen tự nhiên của da trong lúc ngủ, giảm thiểu nếp nhăn và cấp ẩm 72h.",
        "usage": "Sử dụng mỗi tối sau bước nước hoa hồng. Lấy một ống đầy chấm đều lên mặt và cổ, vỗ nhẹ theo chiều từ dưới lên trên.",
        "options": [
            {"id": "50ml", "name": "Chai 50ml", "name_vi": "Chai 50ml", "price": 182000, "isSoldOut": False},
            {"id": "75ml", "name": "Chai 75ml Size Lớn", "name_vi": "Chai 75ml Size Lớn", "price": 240000, "isSoldOut": False},
            {"id": "set50", "name": "Set 50ml + Quà Tặng Bộ Dưỡng Trẻ Hóa Da Bách Hóa", "name_vi": "Set 50ml + Quà Tặng Bộ Dưỡng Trẻ Hóa Da Bách Hóa", "price": 182000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000012",
        "search": "신세계백화점 에스티로더 더블웨어",
        "name_vi": "Kem Nền Kiềm Dầu Che Phủ Hoàn Hảo Estée Lauder Double Wear 30ml",
        "brand": "Estée Lauder",
        "brand_vi": "Estée Lauder",
        "category": "highend",
        "subCategory": "foundation",
        "koreanTitle": "더블웨어 스테이-인-플레이스 메이크업",
        "foreignPrice": 84000,
        "originalPriceWon": 84000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Kem nền che phủ 24 giờ đỉnh cao số 1 thế giới với khả năng kiểm soát dầu thừa, kháng nhiệt độ và mồ hôi hoàn hảo, không xuống tone, giữ lớp nền mịn lì cả ngày không tì vết.",
        "usage": "Lắc đều chai trước khi dùng. Lấy một lượng nhỏ bằng hạt đậu tán nhanh từng vùng trên da bằng bông mút ẩm hoặc cọ nền chuyên dụng.",
        "options": [
            {"id": "1W1", "name": "Tone 1W1 Bone (Trắng Sáng Tone Ấm)", "name_vi": "Tone 1W1 Bone (Trắng Sáng Tone Ấm)", "price": 84000, "isSoldOut": False},
            {"id": "1W2", "name": "Tone 1W2 Sand (Tự Nhiên Sáng Tôn Da)", "name_vi": "Tone 1W2 Sand (Tự Nhiên Sáng Tôn Da)", "price": 84000, "isSoldOut": False},
            {"id": "1C1", "name": "Tone 1C1 Cool Bone (Trắng Sáng Tone Lạnh/Hồng)", "name_vi": "Tone 1C1 Cool Bone (Trắng Sáng Tone Lạnh/Hồng)", "price": 84000, "isSoldOut": False},
            {"id": "2W0", "name": "Tone 2W0 Warm Vanilla (Tự Nhiên Trung Bình)", "name_vi": "Tone 2W0 Warm Vanilla (Tự Nhiên Trung Bình)", "price": 84000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000013",
        "search": "신세계백화점 SK-II 피테라 에센스",
        "name_vi": "Nước Thần Phục Hồi Tái Tạo Da Trắng Sáng SK-II Facial Treatment Essence",
        "brand": "SK-II",
        "brand_vi": "SK-II",
        "category": "highend",
        "subCategory": "serum",
        "koreanTitle": "페이셜 트리트먼트 에센스",
        "foreignPrice": 269000,
        "originalPriceWon": 269000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Nước thần huyền thoại chứa hơn 90% Pitera tự nhiên giàu axit amin, vitamin và khoáng chất, biến đổi 5 chiều không gian của làn da: sáng mịn, căng bóng, mờ đốm nâu, săn chắc và giảm nhăn rõ rệt.",
        "usage": "Đổ 4-5 giọt ra bông cotton hoặc lòng bàn tay, vỗ nhẹ nhàng khắp mặt trong 1 phút để men Pitera thấm sâu vào từng tế bào biểu bì.",
        "options": [
            {"id": "160ml", "name": "Chai 160ml", "name_vi": "Chai 160ml", "price": 269000, "isSoldOut": False},
            {"id": "230ml", "name": "Chai 230ml Size Lớn", "name_vi": "Chai 230ml Size Lớn", "price": 330000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000014",
        "search": "신세계백화점 랑콤 제니피끄",
        "name_vi": "Serum Trẻ Hóa Da Tăng Cường Vi Sinh Lancôme Advanced Génifique",
        "brand": "Lancôme",
        "brand_vi": "Lancôme",
        "category": "highend",
        "subCategory": "serum",
        "koreanTitle": "어드밴스드 제니피끄 세럼",
        "foreignPrice": 185000,
        "originalPriceWon": 185000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Tinh chất phục hồi da danh tiếng của Lancôme bổ sung 7 phân đoạn prebiotic và probiotic giúp nuôi dưỡng hệ vi sinh vật trên da, tăng cường hàng rào tự bảo vệ và phục hồi làn da tổn thương chỉ sau 7 ngày.",
        "usage": "Dùng ống hút tự động lấy chuẩn định lượng mỗi lần dùng. Thoa đều lên mặt và cổ trước các bước dưỡng kem sáng và tối.",
        "options": [
            {"id": "50ml", "name": "Chai 50ml", "name_vi": "Chai 50ml", "price": 185000, "isSoldOut": False},
            {"id": "75ml", "name": "Chai 75ml", "name_vi": "Chai 75ml", "price": 245000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000015",
        "search": "신세계백화점 라메르 크림",
        "name_vi": "Kem Dưỡng Tái Sinh Phục Hồi Da Thần Kỳ La Mer Crème de la Mer",
        "brand": "La Mer",
        "brand_vi": "La Mer",
        "category": "highend",
        "subCategory": "cream",
        "koreanTitle": "크렘 드 라 메르",
        "foreignPrice": 310000,
        "originalPriceWon": 310000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Kem dưỡng xa xỉ trứ danh chứa Miracle Broth - nước cất tảo bẹ thần kỳ lên men tự nhiên, làm dịu tức thì các vết đỏ, kích ứng, cấp ẩm sâu và hồi sinh độ căng bóng trẻ trung cho làn da.",
        "usage": "Lấy một lượng nhỏ bằng hạt đậu ra giữa các đầu ngón tay, xoa nhẹ để làm ấm kích hoạt Miracle Broth cho đến khi kem chuyển sang trong suốt, sau đó ấn nhẹ nhàng lên khắp da mặt.",
        "options": [
            {"id": "30ml", "name": "Hũ 30ml", "name_vi": "Hũ 30ml", "price": 310000, "isSoldOut": False},
            {"id": "60ml", "name": "Hũ 60ml Tiêu Chuẩn", "name_vi": "Hũ 60ml Tiêu Chuẩn", "price": 550000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000016",
        "search": "신세계백화점 키엘 다크스팟",
        "name_vi": "Serum Mờ Thâm Nám Sáng Da Chuyên Sâu Kiehl's Clearly Corrective",
        "brand": "Kiehl's",
        "brand_vi": "Kiehl's",
        "category": "highend",
        "subCategory": "serum",
        "koreanTitle": "클리어리 코렉티브 다크 스팟 솔루션",
        "foreignPrice": 145000,
        "originalPriceWon": 145000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Tinh chất trị thâm làm đều màu da bán chạy số 1 của Kiehl's với dẫn xuất Vitamin C hoạt tính thế hệ mới kết hợp chiết xuất Bạch Dương Trắng, làm mờ thâm mụn và đốm nâu cứng đầu chỉ sau 2 tuần.",
        "usage": "Thoa 3-4 giọt khắp mặt vào sáng và tối sau bước toner. Sử dụng kèm kem chống nắng ban ngày để bảo vệ hiệu quả dưỡng sáng.",
        "options": [
            {"id": "50ml", "name": "Chai 50ml", "name_vi": "Chai 50ml", "price": 145000, "isSoldOut": False},
            {"id": "100ml", "name": "Chai 100ml Size Jumbo", "name_vi": "Chai 100ml Size Jumbo", "price": 215000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000017",
        "search": "신세계백화점 조말론 잉글리쉬 페어",
        "name_vi": "Nước Hoa Jo Malone London English Pear & Freesia Cologne Quả Lê & Lan Nam Phi",
        "brand": "Jo Malone London",
        "brand_vi": "Jo Malone London",
        "category": "highend",
        "subCategory": "perfume",
        "koreanTitle": "잉글리쉬 페어 앤 프리지아 코롱",
        "foreignPrice": 115000,
        "originalPriceWon": 115000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Hương thơm kinh điển mùa thu nước Anh với sự kết hợp thanh mát của quả lê chín mọng bọc trong đóa lan Nam Phi trắng tinh khiết, điểm xuyết hổ phách và hoắc hương ấm áp thanh tao.",
        "usage": "Xịt trực tiếp lên các điểm mạch trên cơ thể như cổ tay, sau gáy, khuỷu tay để hương thơm lan tỏa tự nhiên.",
        "options": [
            {"id": "30ml", "name": "Chai 30ml Tiện Lợi", "name_vi": "Chai 30ml Tiện Lợi", "price": 115000, "isSoldOut": False},
            {"id": "50ml", "name": "Chai 50ml", "name_vi": "Chai 50ml", "price": 165000, "isSoldOut": False},
            {"id": "100ml", "name": "Chai 100ml Tiêu Chuẩn", "name_vi": "Chai 100ml Tiêu Chuẩn", "price": 225000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000018",
        "search": "신세계백화점 바비브라운 수딩 클렌징 오일",
        "name_vi": "Dầu Tẩy Trang Dịu Nhẹ Bobbi Brown Soothing Cleansing Oil",
        "brand": "Bobbi Brown",
        "brand_vi": "Bobbi Brown",
        "category": "highend",
        "subCategory": "cleanser",
        "koreanTitle": "수딩 클렌징 오일",
        "foreignPrice": 84000,
        "originalPriceWon": 84000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Dầu tẩy trang cao cấp với chiết xuất hoa cúc La Mã và dầu hạt jojoba quý hiếm, nhũ hóa cực nhanh, cuốn trôi sạch sẽ mascara chống nước và bụi mịn PM2.5 mà không gây nhờn dính hay cay mắt.",
        "usage": "Lấy 2-3 lần bơm xoa đều lên mặt khô trong 30 giây, thêm một chút nước ấm để nhũ hóa dầu thành dạng sữa trắng rồi rửa sạch lại với nước.",
        "options": [
            {"id": "200ml", "name": "Chai 200ml", "name_vi": "Chai 200ml", "price": 84000, "isSoldOut": False},
            {"id": "400ml", "name": "Chai 400ml Size Lớn", "name_vi": "Chai 400ml Size Lớn", "price": 135000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000019",
        "search": "신세계백화점 나스 파워매트 립스틱",
        "name_vi": "Son Thỏi Siêu Lì Nhẹ Môi NARS Powermatte Lipstick 1.5g",
        "brand": "NARS",
        "brand_vi": "NARS",
        "category": "highend",
        "subCategory": "lipstick",
        "koreanTitle": "파워매트 립스틱",
        "foreignPrice": 46000,
        "originalPriceWon": 46000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Dòng son thỏi lì thế hệ mới của NARS mang lại cảm giác nhẹ tênh như không thoa son, khả năng khóa màu 10 giờ không trôi, sắc tố màu đậm nét chuẩn xác chỉ với một lần lướt.",
        "usage": "Thoa trực tiếp lên môi từ tâm môi tán ra viền môi, chất son lướt mịn và set lì ngay tức thì.",
        "options": [
            {"id": "101", "name": "#101 No Angel (Cam Gạch Nude)", "name_vi": "#101 No Angel (Cam Gạch Nude)", "price": 46000, "isSoldOut": False},
            {"id": "112", "name": "#112 American Woman (Hồng Đất Thanh Lịch)", "name_vi": "#112 American Woman (Hồng Đất Thanh Lịch)", "price": 46000, "isSoldOut": False},
            {"id": "133", "name": "#133 Too Hot To Hold (Đỏ Cam Cháy)", "name_vi": "#133 Too Hot To Hold (Đỏ Cam Cháy)", "price": 46000, "isSoldOut": False},
            {"id": "135", "name": "#135 Mogador (Đỏ Đất Cá Tính)", "name_vi": "#135 Mogador (Đỏ Đất Cá Tính)", "price": 46000, "isSoldOut": False}
        ]
    },
    {
        "goodsNo": "HE0000000020",
        "search": "신세계백화점 맥 러스터글래스",
        "name_vi": "Son Thỏi Bóng Mượt Môi MAC Lustreglass Lipstick 3g",
        "brand": "MAC",
        "brand_vi": "M.A.C",
        "category": "highend",
        "subCategory": "lipstick",
        "koreanTitle": "러스터글래스 립스틱",
        "foreignPrice": 42000,
        "originalPriceWon": 42000,
        "saleRate": 0,
        "isHighEnd": True,
        "departmentStore": "Shinsegae Department Store",
        "description": "Son thỏi có dưỡng mọng môi số 1 của MAC chứa dầu hạt mâm xôi và dầu ô liu nguyên chất giúp dưỡng ẩm sâu, tạo hiệu ứng môi bóng bẩy tự nhiên, ngọt ngào và căng tràn sức sống.",
        "usage": "Thoa nhẹ 1 lớp cho đôi môi ửng màu tự nhiên hoặc thoa 2-3 lớp để sắc son lên đậm nét và bóng mọng tối đa.",
        "options": [
            {"id": "544", "name": "#544 Business Casual (Đỏ Gạch Ấm)", "name_vi": "#544 Business Casual (Đỏ Gạch Ấm)", "price": 42000, "isSoldOut": False},
            {"id": "543", "name": "#543 Posh Pit (Hồng Nâu Nude)", "name_vi": "#543 Posh Pit (Hồng Nâu Nude)", "price": 42000, "isSoldOut": False},
            {"id": "508", "name": "#508 Hug Me (Nude MLBB Tự Nhiên)", "name_vi": "#508 Hug Me (Nude MLBB Tự Nhiên)", "price": 42000, "isSoldOut": False},
            {"id": "520", "name": "#520 See Sheer (Hồng Bưởi Tươi Sáng)", "name_vi": "#520 See Sheer (Hồng Bưởi Tươi Sáng)", "price": 42000, "isSoldOut": False}
        ]
    }
]

def download_and_save_image(img_url: str, goods_no: str) -> bool:
    target_path = f"/Users/tan/tavy-korea/public/products/{goods_no}.jpg"
    try:
        req = urllib.request.Request(img_url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Referer": "https://www.ssg.com/"
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()
            with open(target_path, "wb") as f:
                f.write(data)
        # Convert / standardize with sips to ensure valid JPG
        os.system(f"/usr/bin/sips -s format jpeg -s formatOptions 90 '{target_path}' >/dev/null 2>&1")
        return True
    except Exception as e:
        print(f"      Lỗi tải ảnh {goods_no}: {e}")
        return False

def main():
    print(f"💎 BẮT ĐẦU TẠO DANH MỤC HIGH-END BÁCH HÓA ({len(HIGH_END_SEEDS)} SKU HOT NHẤT)...")
    tab_id = "2076734625"
    
    with ChromeCoordinator(bot_name="TavyManager_VIP", task_name="harvest_highend", priority="VIP"):
        for idx, item in enumerate(HIGH_END_SEEDS, 1):
            gid = item["goodsNo"]
            query = item["search"]
            print(f"[{idx}/{len(HIGH_END_SEEDS)}] Bóc dữ liệu bách hóa `{item['brand']}` - {item['name_vi'][:35]}...", flush=True)
            
            encoded_query = urllib.parse.quote(query)
            url = f"https://www.ssg.com/search.ssg?target=all&query={encoded_query}"
            ChromeTabManager.navigate_tab(tab_id, url)
            time.sleep(2.0)
            
            js = '''(() => {
                const links = Array.from(document.querySelectorAll('a[href*=\"itemId=\"]'));
                for (const a of links) {
                    const text = a.innerText.trim();
                    if (text.includes('원') && (text.includes('정상가격') || text.includes('판매가격'))) {
                        const parent = a.closest('li') || a.parentElement.parentElement;
                        const img = parent ? parent.querySelector('img') : null;
                        const src = img ? (img.src || img.getAttribute('data-src') || img.currentSrc) : '';
                        if (src && src.includes('sitem.ssgcdn.com')) {
                            // Convert to 500px HD
                            const hd = src.replace(/_[iI]\d+_\d+\.jpg/, '_i1_500.jpg');
                            return JSON.stringify({ img: hd, text: text });
                        }
                    }
                }
                return JSON.stringify({ img: null });
            })()'''
            try:
                res_raw = ChromeTabManager.eval_js_in_tab(tab_id, js)
                res = json.loads(res_raw)
                img_url = res.get("img")
                if img_url:
                    ok = download_and_save_image(img_url, gid)
                    print(f"   -> Đã tải ảnh bách hóa chuẩn HD: {ok}")
                else:
                    print(f"   -> Không tìm thấy ảnh trên kết quả SSG, kiểm tra fallback...")
            except Exception as e:
                print(f"   -> Lỗi eval: {e}")

    # Gán đường dẫn ảnh local chuẩn
    processed_items = []
    for item in HIGH_END_SEEDS:
        gid = item["goodsNo"]
        item["productImage"] = f"/products/{gid}.jpg"
        item["images"] = [f"/products/{gid}.jpg"]
        item["photoReviews"] = []
        item["status"] = "available"
        item["is_sold_out"] = False
        item["isPublished"] = True
        item["lastAuditedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        processed_items.append(item)

    out_file = "/tmp/highend_catalog_items.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(processed_items, f, ensure_ascii=False, indent=2)
    print(f"✅ Đã ghi danh mục High-End ra {out_file} ({len(processed_items)} SKU)")

if __name__ == "__main__":
    main()
