// Gate 2 — verify giá toàn bộ giỏ trước khi tạo đơn.
// Không cache, không fallback: fail hoặc lệch giá → chặn đặt hàng.
import { getManifestEntry, postVerify } from './livePrice';

const TOLERANCE = 0.01; // 1%

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

  let res;
  try {
    res = await postVerify(payload);
  } catch (e) {
    return { ok: false, issues: [{ reason: 'verify_failed', message: `Không xác nhận được giá (${e.message || 'network'}).` }] };
  }

  const issues = [];
  const results = res?.results || [];
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
    if (liveWon > 0 && cartWon > 0 && Math.abs(liveWon - cartWon) / cartWon > TOLERANCE) {
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
