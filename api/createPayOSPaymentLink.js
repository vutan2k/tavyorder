import { PayOS } from '@payos/node';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || '',
  authDomain: 'tavyorder.firebaseapp.com',
  projectId: 'tavyorder',
};

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function ensureServerAdminAuth() {
  if (auth.currentUser) return;
  const adminEmail = process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn';
  const adminPass = process.env.FIREBASE_ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD || '';
  if (adminPass) {
    await signInWithEmailAndPassword(auth, adminEmail, adminPass).catch(() => {});
  }
}

function getPayOS() {
  const clientId = process.env.PAYOS_CLIENT_ID || '';
  const apiKey = process.env.PAYOS_API_KEY || '';
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY || '';
  if (!clientId || !apiKey || !checksumKey) return null;
  return new PayOS({ clientId, apiKey, checksumKey });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { orderId } = req.body || req.query || {};
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Thiếu orderId' });
    }

    await ensureServerAdminAuth();
    const orderDocRef = doc(db, 'orders', String(orderId));
    const orderSnap = await getDoc(orderDocRef);
    if (!orderSnap.exists()) {
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

    const payos = getPayOS();
    if (!payos) {
      return res.status(200).json({
        success: false,
        isConfigured: false,
        fallback: true,
        message: 'Chưa cấu hình khóa kết nối PayOS, sử dụng VietQR MB Bank'
      });
    }

    const orderCode = Number(String(Date.now()).slice(-9) + String(Math.floor(100 + Math.random() * 900)));

    const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : '') || 'https://tavyorder.web.app';
    const cleanPhone = String(orderData.customerPhone || orderId || '').replace(/\D/g, '').slice(-10);
    const description = cleanPhone ? `TAVY ${cleanPhone}` : `TAVY ${String(orderId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 15)}`;

    const body = {
      orderCode: orderCode,
      amount: authoritativeAmount,
      description: description.slice(0, 25),
      returnUrl: `${origin}/payment/${orderId}`,
      cancelUrl: `${origin}/payment/${orderId}`,
    };

    const paymentLinkData = await payos.paymentRequests.create(body);

    try {
      await setDoc(orderDocRef, {
        orderCode: orderCode,
        payosPaymentLinkId: paymentLinkData.paymentLinkId || '',
      }, { merge: true });
    } catch (saveErr) {
      console.warn('Lỗi lưu orderCode vào Firestore:', saveErr.message);
    }

    return res.status(200).json({ success: true, isConfigured: true, data: paymentLinkData, orderCode, amount: authoritativeAmount });
  } catch (err) {
    console.error('Lỗi tạo PayOS Payment Link:', err);
    return res.status(200).json({ success: false, fallback: true, error: err.message });
  }
}
