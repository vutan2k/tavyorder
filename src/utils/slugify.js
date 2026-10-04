/**
 * SEO Slug Generator & Parser for TAVY Korea E-Commerce
 * Converts product titles to search-engine friendly Vietnamese slugs.
 */

export function removeVietnameseTones(str) {
  if (!str || typeof str !== 'string') return '';
  let res = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  res = res.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  res = res.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  res = res.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  res = res.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  res = res.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  res = res.replace(/đ/g, 'd');
  res = res.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'a');
  res = res.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'e');
  res = res.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'i');
  res = res.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'o');
  res = res.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'u');
  res = res.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'y');
  res = res.replace(/Đ/g, 'd');
  return res.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function generateProductSlug(product) {
  if (!product) return '';
  const id = product.goodsNo || product.id || '';
  const rawName = product.name || product.title || product.nameKr || id;
  const cleanName = removeVietnameseTones(rawName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleanName) return id ? String(id).toLowerCase() : 'san-pham';
  return id ? `${cleanName}-${String(id).toLowerCase()}` : cleanName;
}

export function extractGoodsNoFromSlug(slug) {
  if (!slug || typeof slug !== 'string') return '';
  const trimmed = slug.trim();
  // Trường hợp slug chỉ chứa ID đơn thuần
  if (/^[a-z0-9_]+$/i.test(trimmed) && trimmed.toLowerCase().startsWith('a') && trimmed.length >= 8) {
    return trimmed.toUpperCase();
  }
  // Trường hợp slug dạng tieu-de-san-pham-A000000123456
  const match = trimmed.match(/-([a-z0-9_]+)$/i);
  if (match) {
    return match[1].toUpperCase();
  }
  return trimmed;
}

export function getProductUrl(product) {
  if (!product) return '/';
  const slug = generateProductSlug(product);
  return `/san-pham/${slug}`;
}
