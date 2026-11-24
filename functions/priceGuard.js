// Gate 2 server-side: kiểm tra giá live cho đơn hàng.
// - priceGuard: trigger khi có đơn mới.
// - priceSweep: HTTP quét đơn pending chưa verify, gọi từ Mac mỗi 2 phút.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const TOLERANCE = 0.01;
const TIMEOUT_MS = 150000;

function db() {
  return admin.firestore();
}

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

/** Verify một đơn và ghi kết quả vào document. */
async function verifyOrder(orderId) {
  const ref = db().doc(`orders/${orderId}`);
  const snap = await ref.get();
  if (!snap.exists) return { verified: false, check: 'missing' };
  const order = snap.data() || {};
  if (order.priceVerified === true) return { verified: true, check: 'ok' };

  const cfgSnap = await db().doc('system_config/priceApi').get();
  const cfg = cfgSnap.exists ? cfgSnap.data() : null;
  if (!cfg?.baseUrl) {
    await ref.set({ priceCheck: 'config_missing', priceVerified: false }, { merge: true });
    return { verified: false, check: 'config_missing' };
  }

  const headers = { 'content-type': 'application/json', 'x-api-key': cfg.apiKey || '' };
  const items = normItems(order);
  if (!items.length) {
    await ref.set({ priceCheck: 'empty', priceVerified: false }, { merge: true });
    return { verified: false, check: 'empty' };
  }

  let manifest = [];
  try {
    const mr = await fetch(`${cfg.baseUrl}/manifest`, { headers });
    const mj = await mr.json();
    manifest = mj.items || [];
  } catch (e) {
    await ref.set({ priceCheck: 'manifest_unreachable', priceVerified: false }, { merge: true });
    await tgNotify(`⚠️ <b>Không đọc được manifest giá</b>\nĐơn ${orderId}: ${e.message}`);
    return { verified: false, check: 'manifest_unreachable' };
  }

  const byId = new Map(manifest.map((x) => [String(x.firestoreId), x]));
  const payload = [];
  const missing = [];
  const checked = [];
  for (const it of items) {
    const entry = byId.get(it.goodsNo);
    if (!entry || entry.source === 'none') {
      missing.push(it.name || it.goodsNo);
      continue;
    }
    payload.push(entry.source === 'oy'
      ? { source: 'oy', goodsNo: entry.goodsNo }
      : { source: 'mall', url: entry.url });
    checked.push(it);
  }

  if (missing.length) {
    await ref.set({
      priceVerified: false,
      priceCheck: 'unmapped_items',
      priceIssues: missing.map((n) => ({ reason: 'unmapped', name: n })),
      status: 'pending_price_check',
      adminNote: 'Có sản phẩm chưa có nguồn giá để xác nhận.',
    }, { merge: true });
    await tgNotify(`⚠️ <b>Đơn ${orderId} thiếu nguồn giá</b>\n${missing.join(', ')}`);
    return { verified: false, check: 'unmapped_items' };
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
    await ref.set({ priceCheck: 'verify_unreachable', priceVerified: false }, { merge: true });
    await tgNotify(`⚠️ <b>Không gọi được price API</b>\nĐơn ${orderId}: ${e.message}`);
    return { verified: false, check: 'verify_unreachable' };
  }

  const issues = [];
  results.forEach((r, i) => {
    const it = checked[i] || {};
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
    await ref.set({
      priceVerified: false,
      priceCheck: 'failed',
      priceIssues: issues,
      status: 'pending_price_check',
      adminNote: 'Giá live không khớp hoặc không lấy được. Cần admin xác nhận trước khi xử lý.',
    }, { merge: true });
    const lines = issues.map((x) => `• ${x.name}: ${x.reason}${x.liveWon ? ` (${x.cartWon} → ${x.liveWon}원)` : ''}`);
    await tgNotify(`🚫 <b>Đơn ${orderId} bị giữ do giá</b>\n${lines.join('\n')}`);
    return { verified: false, check: 'failed', issues };
  }

  await ref.set({
    priceVerified: true,
    priceCheck: 'ok',
    priceVerifiedAt: new Date().toISOString(),
  }, { merge: true });
  return { verified: true, check: 'ok' };
}

exports.priceGuard = onDocumentCreated(
  { document: 'orders/{orderId}', region: 'us-central1', timeoutSeconds: 300, memory: '256MiB' },
  async (event) => {
    await verifyOrder(event.params.orderId);
  }
);

exports.priceSweep = onRequest(
  { region: 'us-central1', timeoutSeconds: 540, memory: '256MiB' },
  async (req, res) => {
    const key = process.env.SWEEP_KEY || '';
    if (!key || req.get('x-sweep-key') !== key) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const q = await db().collection('orders')
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    const todo = q.docs.filter((d) => {
      const o = d.data() || {};
      return o.priceVerified !== true && o.priceCheck !== 'failed' && o.priceCheck !== 'unmapped_items';
    }).slice(0, 10);
    const out = [];
    for (const d of todo) {
      out.push({ id: d.id, ...(await verifyOrder(d.id)) });
    }
    res.json({ ok: true, scanned: q.size, checked: out.length, results: out });
  }
);
