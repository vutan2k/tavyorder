/**
 * Category Classifier & Registry for TAVY Korea E-Commerce
 * Provides exact, granular categories matching Korean cosmetics and supplements.
 */

export const CATEGORY_GROUPS = [
  {
    group: '💄 Trang Điểm (Makeup)',
    items: [
      { id: 'eyeshadow', label: 'Phấn Mắt / Bảng Phấn Mắt', shortLabel: 'Phấn Mắt', kr: '아이섀도/팔레트' },
      { id: 'lipstick', label: 'Son Môi / Son Tint / Dưỡng', shortLabel: 'Son Môi', kr: '립/틴트/립스틱' },
      { id: 'cushion', label: 'Phấn Nước / Cushion', shortLabel: 'Cushion', kr: '쿠션/팩트' },
      { id: 'foundation', label: 'Kem Nền / Foundation / BB', shortLabel: 'Kem Nền', kr: '파운데이션/비비' },
      { id: 'blush', label: 'Phấn Má Hồng (Blusher)', shortLabel: 'Má Hồng', kr: '블러셔/치크' },
      { id: 'mascara', label: 'Mascara Chuốt Mi', shortLabel: 'Mascara', kr: '마스카라' },
      { id: 'eyeliner', label: 'Kẻ Mắt (Eyeliner)', shortLabel: 'Kẻ Mắt', kr: '아이라이너' },
      { id: 'eyebrow', label: 'Chì / Kẻ Chân Mày', shortLabel: 'Kẻ Mày', kr: '아이브로우' },
      { id: 'powder', label: 'Phấn Phủ / Bột Kiềm Dầu', shortLabel: 'Phấn Phủ', kr: '파우더/팩트' },
      { id: 'concealer', label: 'Kem Che Khuyết Điểm', shortLabel: 'Che Khuyết Điểm', kr: '컨실러' },
      { id: 'makeup', label: 'Trang Điểm Khác', shortLabel: 'Trang Điểm', kr: '메이크업 기타' }
    ]
  },
  {
    group: '✨ Chăm Sóc Da (Skincare)',
    items: [
      { id: 'suncare', label: 'Kem Chống Nắng', shortLabel: 'Chống Nắng', kr: '선케어/선크림' },
      { id: 'toner_pad', label: 'Bông Toner Pad', shortLabel: 'Toner Pad', kr: '토너패드' },
      { id: 'toner', label: 'Nước Hoa Hồng / Toner', shortLabel: 'Toner', kr: '토너/스킨' },
      { id: 'serum', label: 'Serum & Tinh Chất Phục Hồi', shortLabel: 'Serum', kr: '에센스/세럼/앰플' },
      { id: 'cream', label: 'Kem Dưỡng Da / Cấp Ẩm', shortLabel: 'Kem Dưỡng', kr: '크림/로션' },
      { id: 'mask', label: 'Mặt Nạ Giấy / Mặt Nạ Ngủ', shortLabel: 'Mặt Nạ', kr: '마스크팩/팩' },
      { id: 'cleanser', label: 'Sữa Rửa Mặt / Gel Rửa Mặt', shortLabel: 'Sữa Rửa Mặt', kr: '클렌징폼/클렌저' },
      { id: 'makeup_remover', label: 'Nước / Dầu Tẩy Trang', shortLabel: 'Tẩy Trang', kr: '클렌징오일/워터' },
      { id: 'exfoliator', label: 'Tẩy Tế Bào Chết', shortLabel: 'Tẩy Da Chết', kr: '필링/스크럽' },
      { id: 'mist', label: 'Xịt Khoáng Cấp Ẩm', shortLabel: 'Xịt Khoáng', kr: '미스트' },
      { id: 'skincare', label: 'Chăm Sóc Da Khác', shortLabel: 'Chăm Sóc Da', kr: '스킨케어 기타' }
    ]
  },
  {
    group: '🌿 Chăm Sóc Tóc & Toàn Thân',
    items: [
      { id: 'haircare', label: 'Chăm Sóc Tóc / Dầu Gội / Xả', shortLabel: 'Chăm Sóc Tóc', kr: '헤어케어/샴푸' },
      { id: 'bodycare', label: 'Sữa Tắm & Dưỡng Thể Body', shortLabel: 'Chăm Sóc Body', kr: '바디케어/바디워시' },
      { id: 'perfume', label: 'Nước Hoa / Xịt Thơm Body', shortLabel: 'Nước Hoa', kr: '향수/바디미스트' }
    ]
  },
  {
    group: '🩺 Sức Khỏe & Dinh Dưỡng Hàn',
    items: [
      { id: 'ginseng', label: 'Sâm Nấm Hàn Quốc', shortLabel: 'Sâm Nấm', kr: '홍삼/인삼/영지' },
      { id: 'supplements', label: 'Thực Phẩm Chức Năng / Vitamin', shortLabel: 'TPCN / Vitamin', kr: '건강기능식품/비타민' }
    ]
  },
  {
    group: '📦 Khác',
    items: [
      { id: 'cosmetics', label: 'Mỹ Phẩm Chung', shortLabel: 'Mỹ Phẩm', kr: '화장품' },
      { id: 'other', label: 'Khác', shortLabel: 'Khác', kr: '기타' }
    ]
  }
];

// Flat dictionary for quick lookups
export const CATEGORY_DICT = {};
CATEGORY_GROUPS.forEach(g => {
  g.items.forEach(item => {
    CATEGORY_DICT[item.id] = item;
  });
});

export const getCategoryLabel = (catId, useShort = false) => {
  if (!catId) return 'Khác';
  const item = CATEGORY_DICT[catId];
  if (item) {
    return useShort ? item.shortLabel : item.label;
  }
  return catId;
};

/**
 * Smart Category Detector matching product name in Vietnamese and Korean
 */
export const detectPreciseCategory = (name = '', nameKr = '', currentCategory = '') => {
  const text = `${name || ''} ${nameKr || ''}`.toLowerCase();

  // 1. Tóc & Thiết bị tạo kiểu tóc
  if (/máy tạo kiểu tóc|dầu gội|dầu xả|ủ tóc|dưỡng tóc|hair|shampoo|conditioner|treatment|헤어|샴푸|트리트먼트|고데기/i.test(text)) {
    return 'haircare';
  }

  // 2. Sâm Nấm Hàn Quốc
  if (/hồng sâm|sâm củ|cao hồng sâm|nước hồng sâm|linh chi|đông trùng|ginseng|lingzhi|홍삼|인삼|영지/i.test(text)) {
    return 'ginseng';
  }

  // 3. Thực phẩm chức năng & Bổ sung (Protein, Shake, Vitamin, Men vi sinh)
  if (/viên uống|thực phẩm chức năng|supplement|men vi sinh|probiotic|omega|protein|단백질|shake|pouch|유산균|영양제|비타민c|비타민d|오메가/i.test(text) &&
      !/serum|cream|mask|toner|pad|kem|thoa|bôi|ampoule|tinh chất/i.test(text)) {
    return 'supplements';
  }

  // 4. Phấn Mắt / Bảng Mắt (Ưu tiên cao nhất trong trang điểm mắt)
  if (/phấn mắt|bảng mắt|bảng phấn mắt|eye palette|eyeshadow|eye shadow|shadow|single shadow|아이섀도|아이 팔레트|섀도우|팔레트/i.test(text)) {
    return 'eyeshadow';
  }

  // 5. Kẻ mắt & Mascara & Chân mày
  if (/mascara|chuốt mi|dài mi|마스카라/i.test(text)) return 'mascara';
  if (/kẻ mắt|eyeliner|bút kẻ mắt|gel kẻ mắt|아이라이너/i.test(text)) return 'eyeliner';
  if (/chân mày|kẻ mày|chì mày|eyebrow|brow|아이브로우|브로우/i.test(text)) return 'eyebrow';

  // 6. Son môi / Son tint
  if (/son môi|son tint|son kem|son bóng|son dưỡng|thỏi son|lipstick|lip tint|lip balm|lip gloss|liptint|립스틱|틴트|립밤|립글로스/i.test(text) ||
      (/\b(립|lip)\b/i.test(text) && !/eye|hair|body/i.test(text))) {
    return 'lipstick';
  }

  // 7. Má hồng
  if (/má hồng|phấn má|blush|blusher|cheek|블러셔|치크/i.test(text)) {
    return 'blush';
  }

  // 8. Phấn nước / Cushion
  if (/cushion|phấn nước|phấn tươi|쿠션|팩트/i.test(text) && !/má hồng/i.test(text)) {
    return 'cushion';
  }

  // 9. Kem nền / Foundation / BB
  if (/kem nền|foundation|bb cream|cc cream|cover cream|nâng tông che khuyết|파운데이션|비비크림|씨씨크림/i.test(text)) {
    return 'foundation';
  }

  // 10. Phấn phủ / Kiềm dầu
  if (/phấn phủ|bột phủ|kiềm dầu|powder|no-sebum|nosebum|파우더/i.test(text)) {
    return 'powder';
  }

  // 11. Che khuyết điểm & Kem lót
  if (/che khuyết điểm|concealer|kem lót|lotion che khuyết điểm|컨실러|프라이머/i.test(text)) {
    return 'concealer';
  }

  // 12. Tẩy trang (Nước / Dầu / Sáp / Sữa tẩy trang)
  if (/tẩy trang|nước tẩy trang|dầu tẩy trang|sáp tẩy trang|sữa tẩy trang|cleansing oil|cleansing water|cleansing balm|micellar|클렌징오일|클렌징워터|클렌징밤/i.test(text)) {
    return 'makeup_remover';
  }

  // 13. Sữa rửa mặt / Gel rửa mặt
  if (/sữa rửa mặt|gel rửa mặt|bọt rửa mặt|cleansing foam|foam cleanser|pack to foam|클렌징폼|폼클렌징/i.test(text) ||
      (/rửa mặt/i.test(text) && !/mặt nạ/i.test(text))) {
    return 'cleanser';
  }

  // 14. Bông Toner Pad
  if (/toner pad|bông toner|miếng pad|pad tẩy|토너패드|패드/i.test(text)) {
    return 'toner_pad';
  }

  // 15. Kem chống nắng
  if (/chống nắng|kem chống nắng|sunscreen|sun cream|suncream|sun stick|sun serum|선크림|선스틱|선세럼|선쿠션|선케어/i.test(text)) {
    return 'suncare';
  }

  // 16. Mặt nạ
  if (/mặt nạ|mask|sheet mask|sleeping mask|đắp mặt|마스크팩|마스크|시트마스크|팩/i.test(text)) {
    return 'mask';
  }

  // 17. Nước hoa hồng / Toner (Kiểm tra trước Nước hoa để không nhầm "nước hoa hồng")
  if (/nước hoa hồng|toner|nước cân bằng|skin|토너|스킨/i.test(text)) {
    return 'toner';
  }

  // 18. Nước hoa & Xịt thơm
  if (/nước hoa|xịt thơm|perfume|fragrance|body mist|향수/i.test(text)) {
    return 'perfume';
  }

  // 19. Tẩy tế bào chết
  if (/tẩy tế bào chết|tẩy da chết|peeling|scrub|tẩy da|필링|스크럽/i.test(text)) {
    return 'exfoliator';
  }

  // 20. Xịt khoáng & Xịt khóa nền
  if (/xịt khoáng|khóa nền|setting fixer|fixer|facial mist|mist|미스트|픽서/i.test(text)) {
    return 'mist';
  }

  // 21. Sữa tắm & Dưỡng thể Body & Cá nhân
  if (/sữa tắm|dưỡng thể|body wash|body lotion|body cream|sữa dưỡng thể|toàn thân|vệ sinh phụ nữ|đánh răng|kem đánh răng|feminine|toothpaste|바디워시|바디로션|바디|치약|청결제/i.test(text)) {
    return 'bodycare';
  }

  // 22. Dụng cụ trang điểm (cọ, mi giả)
  if (/cọ trang điểm|lông mi giả|mi giả|dụng cụ|brush|eyelash|속눈썹|브러시/i.test(text)) {
    return 'makeup_tools';
  }

  // 23. Serum / Tinh chất / Ampoule
  if (/serum|tinh chất|ampoule|essence|세럼|앰플|에센스/i.test(text)) {
    return 'serum';
  }

  // 24. Kem dưỡng da / Cấp ẩm
  if (/kem dưỡng|cấp ẩm|dưỡng ẩm|cream|lotion|emulsion|moisturizer|kem bôi|크림|수분크림|보습크림|로션/i.test(text)) {
    return 'cream';
  }

  // Nếu có category cũ hợp lệ
  if (currentCategory && currentCategory !== 'cosmetics' && currentCategory !== 'other' && currentCategory !== 'makeup') {
    return currentCategory;
  }

  return 'cosmetics';
};
