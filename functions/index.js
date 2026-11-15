// Firebase Cloud Function: proxy Jina AI Reader + PayOS Webhook Auto Confirmation
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// Khởi tạo PayOS SDK với biến môi trường
const { PayOS } = require('@payos/node');

let payOSInstance = null;
function getPayOS() {
  const clientId = process.env.PAYOS_CLIENT_ID || '';
  const apiKey = process.env.PAYOS_API_KEY || '';
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY || '';

  if (!clientId || !apiKey || !checksumKey || clientId.includes('dummy') || clientId.includes('your_')) {
    return null;
  }
  if (!payOSInstance) {
    payOSInstance = new PayOS({ clientId, apiKey, checksumKey });
  }
  return payOSInstance;
}

const ALLOWED_ORIGINS = new Set([
  'https://tavyorder.web.app',
  'https://tavyorder.firebaseapp.com',
  'https://oderho.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

const ALLOWED_JINA_HOSTS = [
  'oliveyoung.co.kr',
  'naver.com',
  'coupang.com',
  'hwahae.co.kr',
  'glowpick.com',
  'wconcept.co.kr',
  'musinsa.com',
  'kurly.com',
  'shinsegaemall.com',
  'ssg.com'
];

function applyCors(req, res) {
  const origin = req.headers?.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', 'https://tavyorder.web.app');
  }
  res.set('Vary', 'Origin');
}

exports.scrapeJina = onRequest({ cors: false }, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
    return res.status(204).send('');
  }
  try {
    const url = (req.query.url || (req.body && req.body.url) || '').toString().trim();
    if (!url || !/^https?:\/\//.test(url)) {
      return res.status(400).json({ error: 'URL không hợp lệ' });
    }
    let parsedHost = '';
    try {
      parsedHost = new URL(url).hostname.toLowerCase();
    } catch {
      return res.status(400).json({ error: 'URL không hợp lệ' });
    }
    const isAllowedDomain = ALLOWED_JINA_HOSTS.some(
      domain => parsedHost === domain || parsedHost.endsWith(`.${domain}`)
    );
    if (!isAllowedDomain) {
      return res.status(403).json({ error: 'Domain không nằm trong danh sách cho phép của Tavy Korea' });
    }

    const jinaUrl = `https://r.jina.ai/${url}`;
    const jinaKey = process.env.JINA_API_KEY || '';
    const headers = { 'Accept': 'text/markdown' };
    if (jinaKey) headers['Authorization'] = `Bearer ${jinaKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const r = await fetch(jinaUrl, { headers, signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok) return res.status(r.status).json({ error: `Jina lỗi ${r.status}` });
      const text = await r.text();
      if (!text || text.length < 200) return res.status(502).json({ error: 'Jina trả nội dung rỗng hoặc bị chặn' });
      return res.json({ success: true, content: text });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Lỗi proxy Jina' });
  }
});

/**
 * Endpoint 1: Tạo Payment Link PayOS VietQR Động (Lấy số tiền chuẩn từ Firestore, chống giả mạo amount)
 */
exports.createPayOSPaymentLink = onRequest({ cors: false }, async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
    return res.status(204).send('');
  }

  try {
    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Thiếu orderId' });
    }

    // Đọc đơn hàng trực tiếp từ Firestore để lấy số tiền chuẩn (Chặn đứng lỗ hổng truyền amount=2000 từ Client)
    const orderDocRef = db.collection('orders').doc(String(orderId));
    const orderSnap = await orderDocRef.get();
    if (!orderSnap.exists) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng trên hệ thống' });
    }
    const orderData = orderSnap.data() || {};
    const authoritativeAmount = Math.round(Number(
      orderData.quote?.depositNeededVnd ||
      orderData.quote?.totalVnd ||
      orderData.totalVnd ||
      orderData.totalAmount ||
      0
    ));
    if (!Number.isFinite(authoritativeAmount) || authoritativeAmount < 2000) {
      return res.status(400).json({ success: false, error: 'Tổng tiền đơn hàng trên hệ thống không hợp lệ' });
    }

    const payOS = getPayOS();
    // Nếu chưa cấu hình PayOS keys, báo hiệu frontend chuyển sang chế độ VietQR dự phòng
    if (!payOS) {
      return res.json({
        success: false,
        isConfigured: false,
        fallback: true,
        message: 'Chưa cấu hình khóa kết nối PayOS, sử dụng VietQR MB Bank'
      });
    }

    // Sinh orderCode nguyên dương duy nhất (12 chữ số < MAX_SAFE_INTEGER) để tránh lỗi trùng orderCode khi tạo lại link
    const orderCode = Number(String(Date.now()).slice(-9) + String(Math.floor(100 + Math.random() * 900)));

    const body = {
      orderCode: orderCode,
      amount: authoritativeAmount,
      description: `Coc ${String(orderId).slice(0, 15)}`,
      returnUrl: `https://tavyorder.web.app/payment/${orderId}`,
      cancelUrl: `https://tavyorder.web.app/payment/${orderId}`,
    };

    const paymentLinkData = await payOS.paymentRequests.create(body);

    // Lưu orderCode vào đơn hàng trong Firestore để webhook đối chiếu chính xác
    try {
      await orderDocRef.set({
        orderCode: orderCode,
        payosPaymentLinkId: paymentLinkData.paymentLinkId || '',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (saveErr) {
      console.warn('Lỗi lưu orderCode vào order:', saveErr.message);
    }

    return res.json({ success: true, isConfigured: true, data: paymentLinkData, orderCode, amount: authoritativeAmount });
  } catch (err) {
    console.error('Lỗi tạo PayOS Payment Link:', err);
    return res.status(200).json({
      success: false,
      fallback: true,
      error: err.message || 'Lỗi kết nối cổng PayOS'
    });
  }
});

/**
 * Endpoint 2: PayOS Webhook - Tự động đối soát chữ ký HMAC & số tiền thực nhận với totalVnd trong Firestore
 */
exports.payosWebhook = onRequest({ cors: false }, async (req, res) => {
  applyCors(req, res);
  try {
    const webhookData = req.body;
    if (!webhookData) {
      return res.status(400).json({ success: false, message: 'Dữ liệu webhook rỗng' });
    }

    const payOS = getPayOS();
    if (!payOS) {
      console.error('❌ [PayOS Webhook] Từ chối xử lý do thiếu cấu hình PAYOS_CHECKSUM_KEY');
      return res.status(503).json({ success: false, message: 'PayOS chưa được cấu hình' });
    }

    // Verify HMAC Signature chữ ký từ PayOS (Bắt buộc)
    let verifiedData;
    try {
      verifiedData = await payOS.webhooks.verify(webhookData);
    } catch (err) {
      console.error('❌ Chữ ký PayOS Webhook không hợp lệ:', err);
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    if (verifiedData && verifiedData.orderCode) {
      const orderCodeNum = Number(verifiedData.orderCode);
      const searchId = `ORD-${orderCodeNum}`;
      const paidAmount = Number(verifiedData.amount) || 0;

      console.log(`⚡ [PayOS Webhook] Nhận xác nhận thanh toán cho orderCode: ${orderCodeNum}, số tiền: ${paidAmount} đ`);

      // Tìm kiếm đơn hàng trong Firestore DB theo orderCode hoặc Document ID
      let orderDocRef = null;
      let orderSnap = null;

      let querySnap = await db.collection('orders').where('orderCode', '==', orderCodeNum).limit(1).get();
      if (!querySnap.empty) {
        orderDocRef = querySnap.docs[0].ref;
        orderSnap = querySnap.docs[0];
      } else {
        const directRef = db.collection('orders').doc(searchId);
        const directSnap = await directRef.get();
        if (directSnap.exists) {
          orderDocRef = directRef;
          orderSnap = directSnap;
        }
      }

      if (orderSnap && orderSnap.exists) {
        const orderData = orderSnap.data() || {};
        const expectedAmount = Math.round(Number(
          orderData.quote?.depositNeededVnd ||
          orderData.quote?.totalVnd ||
          orderData.totalVnd ||
          orderData.totalAmount ||
          0
        ));

        // Bắt buộc đối chiếu số tiền thanh toán thực tế với số tiền đơn hàng trong Firestore
        if (expectedAmount <= 0 || paidAmount < expectedAmount) {
          console.error(`🚨 [PayOS Fraud Blocked] Đơn ${orderSnap.id} yêu cầu ${expectedAmount}đ nhưng chỉ nhận ${paidAmount}đ!`);
          await orderDocRef.update({
            paymentStatus: 'underpaid_flagged',
            paidAmountVnd: paidAmount,
            payosTransactionRef: verifiedData.reference || '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          return res.status(200).json({
            success: false,
            message: `Số tiền thanh toán (${paidAmount}đ) nhỏ hơn tổng đơn (${expectedAmount}đ)`
          });
        }

        await orderDocRef.update({
          status: 'deposit_paid', // Tự động đổi trạng thái sang "Đã cọc 100%"
          paymentStatus: 'paid',   // Đã thanh toán đủ
          paidAmountVnd: paidAmount,
          paidAt: new Date().toISOString(),
          payosTransactionRef: verifiedData.reference || '',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`✅ [PayOS Webhook] Đã cập nhật đơn hàng ${orderSnap.id} sang 'Đã cọc 100%' thành công!`);
        return res.json({ success: true, message: 'Đã xác nhận đơn hàng thành công' });
      } else {
        console.warn(`⚠️ [PayOS Webhook] Không tìm thấy đơn hàng với orderCode ${orderCodeNum} trong Database`);
      }
    }

    return res.json({ success: true, message: 'Webhook đã ghi nhận' });
  } catch (err) {
    console.error('❌ Lỗi xử lý PayOS Webhook:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

