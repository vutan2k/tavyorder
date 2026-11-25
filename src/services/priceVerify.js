// Gate 2 — verify giá toàn bộ giỏ trước khi tạo đơn.
// Không cache, không fallback: fail hoặc lệch giá → chặn đặt hàng.
import { getManifestEntry, postVerify } from './livePrice';

const TOLERANCE = 0.10; // 10% — đủ rộng cho chênh lệch phân loại, đủ chặt để bắt đổi giá thật

export default async function verifyCart(cart) {
  const items = Array.isArray(cart) ? cart : [];
  if (!items.length) return { ok: false, issues: [{ reason: 'empty_cart' }] };

  const payload = [];
  const meta = [];

  for (const it of items) {
    const entry = await getManifestEntry(it);
    const cartWon = Number(it.foreignPrice || it.price || 0);
    if (!entry || entry.source === 'none' || (!entry.goodsNo && !entry.url)) {
      return {
        ok: false,
        issues: [{ name: it.name, reason: 'unmapped', message: 'Sản phẩm chưa có nguồn giá để xác nhận.' }],
      };
    }
    payload.push(entry.source === 'oy' ? { source: 'oy', goodsNo: entry.goodsNo } : { source: 'mall', url: entry.url });
    meta.push({ item: it, cartWon });
  }

  // Vercel function giới hạn 60s; OY cào tuần tự 9s/SKU → chia lô 4 SKU/lần gọi.
  const CHUNK = 4;
  const results = [];
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK);
    try {
      const res = await postVerify(slice);
      (res?.results || []).forEach((r) => results.push(r));
    } catch (e) {
      slice.forEach(() => results.push({ ok: false, error: 'verify_failed' }));
    }
  }

  const issues = [];
  results.forEach((r, i) => {
    const { item, cartWon } = meta[i] || {};
    if (!r?.ok) {
      const reason = r?.soldOut || r?.error === 'sold_out' ? 'sold_out' : 'price_unavailable';
      issues.push({
        name: item?.name,
        reason,
        message: reason === 'sold_out' ? 'Đã hết hàng tại Hàn.' : 'Không lấy được giá hiện tại.',
      });
      return;
    }
    const liveWon = Number(r.salePrice ?? r.priceKrw ?? 0);
    // Giá live là giá cấp sản phẩm; giỏ có thể đang chọn phân loại khác.
    // Chấp nhận nếu khớp bất kỳ mốc giá hợp lệ nào của sản phẩm (giá giỏ, giá gốc, các phân loại).
    const refs = [cartWon];
    const pushRef = (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) refs.push(n); };
    pushRef(item?.productWon);
    if (Array.isArray(item?.optionPrices)) item.optionPrices.forEach(pushRef);
    if (Array.isArray(item?.productOptions)) item.productOptions.forEach((o) => pushRef(o?.price_krw ?? o?.price ?? o?.sale_price));
    if (Array.isArray(item?.options)) item.options.forEach((o) => pushRef(o?.price_krw ?? o?.price ?? o?.sale_price));
    if (item?.selectedOption) pushRef(item.selectedOption.price_krw ?? item.selectedOption.price ?? item.selectedOption.sale_price);
    const matchedRef = refs.find((v) => v > 0 && Math.abs(liveWon - v) / v <= TOLERANCE);
    if (liveWon > 0 && cartWon > 0 && !matchedRef) {
      issues.push({
        name: item?.name,
        reason: 'price_changed',
        cartWon,
        liveWon,
        message: `Giá đã thay đổi: ${cartWon.toLocaleString('ko-KR')}원 → ${liveWon.toLocaleString('ko-KR')}원.`,
      });
    }
  });

  return { ok: issues.length === 0, issues };
}
