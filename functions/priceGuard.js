// Gate 2 server-side: kiểm tra giá live khi đơn được tạo.
// Client có thể bỏ qua bước verify, nhưng đơn sẽ bị đánh dấu pending_price_check
// và không thể xử lý cho tới khi admin xác nhận.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

const TOLERANCE = 0.01;
const TIMEOUT_MS = 150000;

function normItems(order) {
  return (order.items || []).map((it) => ({
    goodsNo: String(it.goodsNo || it.id || ''),
    name: it.name || '',
    qty: Number(it.qty) || 1,
    cartWon: Number(it.foreignPrice || it.price || 0),
  }));
}

async function tgNotify(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML' }),
    });
  } catch (e) {
    console.warn('telegram notify failed', e.message);
  }
}

exports.priceGuard = onDocumentCreated(
  { document: 'orders/{orderId}', region: 'asia-northeast3', timeoutSeconds: 300, memory: '256MiB' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const order = snap.data() || {};
    const db = admin.firestore();

    if (order.priceVerified === true) return;

    const cfgSnap = await db.doc('system_config/priceApi').get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : null;
    if (!cfg?.baseUrl) {
      await snap.ref.set({ priceCheck: 'config_missing', priceVerified: false }, { merge: true });
      return;
    }

    const headers = { 'content-type': 'application/json', 'x-api-key': cfg.apiKey || '' };
    const items = normItems(order);
    if (!items.length) {
      await snap.ref.set({ priceCheck: 'empty', priceVerified: false }, { merge: true });
      return;
    }

    let manifest = [];
    try {
      const mr = await fetch(`${cfg.baseUrl}/manifest`, { headers });
      const mj = await mr.json();
      manifest = mj.items || [];
    } catch (e) {
      await snap.ref.set({ priceCheck: 'manifest_unreachable', priceVerified: false }, { merge: true });
      await tgNotify(`⚠️ <b>Không đọc được manifest giá</b>\nĐơn ${event.params.orderId}: ${e.message}`);
      return;
    }

    const byId = new Map(manifest.map((x) => [String(x.firestoreId), x]));
    const payload = [];
    const missing = [];
    for (const it of items) {
      const entry = byId.get(it.goodsNo);
      if (!entry || entry.source === 'none') {
        missing.push(it.name || it.goodsNo);
        continue;
      }
      payload.push(entry.source === 'oy'
        ? { source: 'oy', goodsNo: entry.goodsNo }
        : { source: 'mall', url: entry.url });
    }

    if (missing.length) {
      await snap.ref.set({
        priceVerified: false,
        priceCheck: 'unmapped_items',
        priceIssues: missing.map((n) => ({ reason: 'unmapped', name: n })),
        status: 'pending_price_check',
        adminNote: 'Có sản phẩm chưa có nguồn giá để xác nhận.',
      }, { merge: true });
      await tgNotify(`⚠️ <b>Đơn ${event.params.orderId} thiếu nguồn giá</b>\n${missing.join(', ')}`);
      return;
    }

    let results = [];
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const vr = await fetch(`${cfg.baseUrl}/verify`, {
        method: 'POST', headers, body: JSON.stringify({ items: payload }), signal: controller.signal,
      });
      clearTimeout(timer);
      const vj = await vr.json();
      results = vj.results || [];
    } catch (e) {
      await snap.ref.set({ priceCheck: 'verify_unreachable', priceVerified: false }, { merge: true });
      await tgNotify(`⚠️ <b>Không gọi được price API</b>\nĐơn ${event.params.orderId}: ${e.message}`);
      return;
    }

    const issues = [];
    results.forEach((r, i) => {
      const it = items.filter((x) => byId.has(x.goodsNo))[i] || items[i] || {};
      if (!r?.ok) {
        issues.push({ name: it.name, reason: r?.soldOut ? 'sold_out' : 'price_unavailable' });
        return;
      }
      const live = Number(r.salePrice ?? r.priceKrw ?? 0);
      if (live > 0 && it.cartWon > 0 && Math.abs(live - it.cartWon) / it.cartWon > TOLERANCE) {
        issues.push({ name: it.name, reason: 'price_changed', cartWon: it.cartWon, liveWon: live });
      }
    });

    if (issues.length) {
      await snap.ref.set({
        priceVerified: false,
        priceCheck: 'failed',
        priceIssues: issues,
        status: 'pending_price_check',
        adminNote: 'Giá live không khớp hoặc không lấy được. Cần admin xác nhận trước khi xử lý.',
      }, { merge: true });
      const lines = issues.map((x) => `• ${x.name}: ${x.reason}${x.liveWon ? ` (${x.cartWon} → ${x.liveWon}원)` : ''}`);
      await tgNotify(`🚫 <b>Đơn ${event.params.orderId} bị giữ do giá</b>\n${lines.join('\n')}`);
      return;
    }

    await snap.ref.set({
      priceVerified: true,
      priceCheck: 'ok',
      priceVerifiedAt: new Date().toISOString(),
    }, { merge: true });
  }
);
