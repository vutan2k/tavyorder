import { LOCATION_DATA } from '../data/vietnamAddressData.js';

export const ALL_63_VIETNAM_PROVINCES = [
  { code: 1, name: 'Thành phố Hà Nội' },
  { code: 79, name: 'Thành phố Hồ Chí Minh' },
  { code: 48, name: 'Thành phố Đà Nẵng' },
  { code: 31, name: 'Thành phố Hải Phòng' },
  { code: 46, name: 'Thành phố Huế' },
  { code: 92, name: 'Thành phố Cần Thơ' },
  { code: 74, name: 'Tỉnh Bình Dương' },
  { code: 75, name: 'Tỉnh Đồng Nai' },
  { code: 77, name: 'Tỉnh Bà Rịa - Vũng Tàu' },
  { code: 2, name: 'Tỉnh Hà Giang' },
  { code: 4, name: 'Tỉnh Cao Bằng' },
  { code: 6, name: 'Tỉnh Bắc Kạn' },
  { code: 8, name: 'Tỉnh Tuyên Quang' },
  { code: 10, name: 'Tỉnh Lào Cai' },
  { code: 11, name: 'Tỉnh Điện Biên' },
  { code: 12, name: 'Tỉnh Lai Châu' },
  { code: 14, name: 'Tỉnh Sơn La' },
  { code: 15, name: 'Tỉnh Yên Bái' },
  { code: 17, name: 'Tỉnh Hoà Bình' },
  { code: 19, name: 'Tỉnh Thái Nguyên' },
  { code: 20, name: 'Tỉnh Lạng Sơn' },
  { code: 22, name: 'Tỉnh Quảng Ninh' },
  { code: 24, name: 'Tỉnh Bắc Giang' },
  { code: 25, name: 'Tỉnh Phú Thọ' },
  { code: 26, name: 'Tỉnh Vĩnh Phúc' },
  { code: 27, name: 'Tỉnh Bắc Ninh' },
  { code: 30, name: 'Tỉnh Hải Dương' },
  { code: 33, name: 'Tỉnh Hưng Yên' },
  { code: 34, name: 'Tỉnh Thái Bình' },
  { code: 35, name: 'Tỉnh Hà Nam' },
  { code: 36, name: 'Tỉnh Nam Định' },
  { code: 37, name: 'Tỉnh Ninh Bình' },
  { code: 38, name: 'Tỉnh Thanh Hóa' },
  { code: 40, name: 'Tỉnh Nghệ An' },
  { code: 42, name: 'Tỉnh Hà Tĩnh' },
  { code: 44, name: 'Tỉnh Quảng Bình' },
  { code: 45, name: 'Tỉnh Quảng Trị' },
  { code: 49, name: 'Tỉnh Quảng Nam' },
  { code: 51, name: 'Tỉnh Quảng Ngãi' },
  { code: 52, name: 'Tỉnh Bình Định' },
  { code: 54, name: 'Tỉnh Phú Yên' },
  { code: 56, name: 'Tỉnh Khánh Hòa' },
  { code: 58, name: 'Tỉnh Ninh Thuận' },
  { code: 60, name: 'Tỉnh Bình Thuận' },
  { code: 62, name: 'Tỉnh Kon Tum' },
  { code: 64, name: 'Tỉnh Gia Lai' },
  { code: 66, name: 'Tỉnh Đắk Lắk' },
  { code: 67, name: 'Tỉnh Đắk Nông' },
  { code: 68, name: 'Tỉnh Lâm Đồng' },
  { code: 70, name: 'Tỉnh Bình Phước' },
  { code: 72, name: 'Tỉnh Tây Ninh' },
  { code: 80, name: 'Tỉnh Long An' },
  { code: 82, name: 'Tỉnh Tiền Giang' },
  { code: 83, name: 'Tỉnh Bến Tre' },
  { code: 84, name: 'Tỉnh Trà Vinh' },
  { code: 86, name: 'Tỉnh Vĩnh Long' },
  { code: 87, name: 'Tỉnh Đồng Tháp' },
  { code: 89, name: 'Tỉnh An Giang' },
  { code: 91, name: 'Tỉnh Kiên Giang' },
  { code: 93, name: 'Tỉnh Hậu Giang' },
  { code: 94, name: 'Tỉnh Sóc Trăng' },
  { code: 95, name: 'Tỉnh Bạc Liêu' },
  { code: 96, name: 'Tỉnh Cà Mau' }
];

export const COMMON_SUB_DIVISIONS = {
  79: [
    { code: 760, name: 'Thành phố Thủ Đức' },
    { code: 769, name: 'Quận 1' },
    { code: 770, name: 'Quận 3' },
    { code: 771, name: 'Quận 4' },
    { code: 772, name: 'Quận 5' },
    { code: 773, name: 'Quận 6' },
    { code: 774, name: 'Quận 7' },
    { code: 775, name: 'Quận 8' },
    { code: 776, name: 'Quận 10' },
    { code: 777, name: 'Quận 11' },
    { code: 778, name: 'Quận 12' },
    { code: 764, name: 'Quận Gò Vấp' },
    { code: 765, name: 'Quận Bình Thạnh' },
    { code: 766, name: 'Quận Tân Bình' },
    { code: 767, name: 'Quận Tân Phú' },
    { code: 768, name: 'Quận Phú Nhuận' },
    { code: 761, name: 'Quận Bình Tân' },
    { code: 783, name: 'Huyện Củ Chi' },
    { code: 784, name: 'Huyện Hóc Môn' },
    { code: 785, name: 'Huyện Bình Chánh' },
    { code: 786, name: 'Huyện Nhà Bè' },
    { code: 787, name: 'Huyện Cần Giờ' }
  ],
  1: [
    { code: 1, name: 'Quận Ba Đình' },
    { code: 2, name: 'Quận Hoàn Kiếm' },
    { code: 3, name: 'Quận Tây Hồ' },
    { code: 4, name: 'Quận Long Biên' },
    { code: 5, name: 'Quận Cầu Giấy' },
    { code: 6, name: 'Quận Đống Đa' },
    { code: 7, name: 'Quận Hai Bà Trưng' },
    { code: 8, name: 'Quận Hoàng Mai' },
    { code: 9, name: 'Quận Thanh Xuân' },
    { code: 16, name: 'Huyện Sóc Sơn' },
    { code: 17, name: 'Huyện Đông Anh' },
    { code: 18, name: 'Huyện Gia Lâm' },
    { code: 19, name: 'Quận Nam Từ Liêm' },
    { code: 20, name: 'Huyện Thanh Trì' },
    { code: 21, name: 'Quận Bắc Từ Liêm' },
    { code: 268, name: 'Quận Hà Đông' },
    { code: 269, name: 'Thị xã Sơn Tây' }
  ],
  48: [
    { code: 490, name: 'Quận Hải Châu' },
    { code: 491, name: 'Quận Thanh Khê' },
    { code: 492, name: 'Quận Sơn Trà' },
    { code: 493, name: 'Quận Ngũ Hành Sơn' },
    { code: 494, name: 'Quận Liên Chiểu' },
    { code: 495, name: 'Quận Cẩm Lệ' },
    { code: 497, name: 'Huyện Hòa Vang' }
  ],
  46: [
    { code: 474, name: 'Quận Thuận Hóa' },
    { code: 475, name: 'Quận Phú Xuân' },
    { code: 476, name: 'Thị xã Phong Điền' },
    { code: 479, name: 'Thị xã Hương Thủy' },
    { code: 480, name: 'Thị xã Hương Trà' }
  ]
};

/**
 * Fetch All Provinces from Open API v2 (with 2025/2026 merger updates & offline fallback)
 */
export async function fetchVietnamProvinces() {
  try {
    const res = await fetch('https://provinces.open-api.vn/api/v2/p/', {
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map(p => ({ code: p.code, name: p.name }));
      }
    }
  } catch (err) {
    console.warn('Vietnam Open API v2 offline fallback for provinces.', err);
  }
  return ALL_63_VIETNAM_PROVINCES;
}

/**
 * Fetch 2nd Level Units (Wards/Subdivisions) for a Province from Open API v2
 */
export async function fetchVietnamSubDivisions(provinceCode) {
  if (!provinceCode) return [];
  const numCode = Number(provinceCode);
  const localCache = COMMON_SUB_DIVISIONS[provinceCode] || COMMON_SUB_DIVISIONS[numCode];

  try {
    const res = await fetch(`https://provinces.open-api.vn/api/v2/p/${provinceCode}?depth=2`, {
      signal: AbortSignal.timeout(1500)
    });
    if (res.ok) {
      const data = await res.json();
      const subs = data.wards || data.districts;
      if (Array.isArray(subs) && subs.length > 0) {
        return subs.map(d => ({ code: d.code, name: d.name }));
      }
    }
  } catch (err) {
    // Graceful fallback to local cached list
  }

  if (localCache) {
    return localCache;
  }

  // LOCATION_DATA fallback search
  try {
    const provInfo = ALL_63_VIETNAM_PROVINCES.find(p => String(p.code) === String(provinceCode));
    const provName = provInfo ? provInfo.name : '';

    if (LOCATION_DATA && LOCATION_DATA.VN && Array.isArray(LOCATION_DATA.VN.provinces)) {
      const locProv = LOCATION_DATA.VN.provinces.find(lp => {
        if (String(lp.code) === String(provinceCode)) return true;
        if (provName && (lp.name.includes(provName.replace(/^(Thành phố|Tỉnh)\s+/i, '')) || provName.includes(lp.name.replace(/^TP\.\s+/i, '')))) return true;
        return false;
      });

      if (locProv && Array.isArray(locProv.districts)) {
        return locProv.districts.map((d, index) => ({
          code: d.code || `${provinceCode}-${index + 1}`,
          name: d.name
        }));
      }
    }
  } catch (e) {
    console.warn('LOCATION_DATA sub-divisions fallback parse error:', e);
  }

  return [
    { code: 'sub-1', name: 'Khu vực Trung tâm / Thành phố' },
    { code: 'sub-2', name: 'Khu vực Ngoại thành / Huyện' }
  ];
}
