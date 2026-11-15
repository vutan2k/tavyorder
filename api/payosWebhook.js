import { PayOS } from '@payos/node';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';

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
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // PayOS ping kiểm tra URL có sống không
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'TAVY PayOS Webhook is active' });
  }

  try {
    const webhookData = req.body;
    if (!webhookData) {
      return res.status(400).json({ success: false, message: 'Dữ liệu webhook rỗng' });
    }

    const payos = getPayOS();
    if (!payos) {
      console.error('❌ [PayOS Webhook] Từ chối xử lý do thiếu cấu hình PAYOS_CHECKSUM_KEY');
      return res.status(503).json({ success: false, message: 'PayOS chưa được cấu hình' });
    }

    // Xác thực chữ ký HMAC từ PayOS
    let verifiedData;
    try {
      verifiedData = await payos.webhooks.verify(webhookData);
    } catch (err) {
      console.warn('⚠️ Lỗi hoặc ping thử nghiệm PayOS Webhook:', err.message);
      return res.status(200).json({ success: true, message: 'Webhook test received' });
    }

    if (verifiedData && verifiedData.orderCode) {
      await ensureServerAdminAuth();
      const orderCodeNum = Number(verifiedData.orderCode);
      const paidAmount = Number(verifiedData.amount) || 0;

      console.log(`⚡ [PayOS Webhook] Nhận thanh toán: ${paidAmount} đ cho đơn code ${orderCodeNum}`);

      let targetDocRef = null;
      let snap = null;

      // 1. Tìm theo orderCode lưu trong Firestore
      const q = query(collection(db, 'orders'), where('orderCode', '==', orderCodeNum));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        targetDocRef = qSnap.docs[0].ref;
        snap = qSnap.docs[0];
      }

      // 2. Tìm theo ORD prefix cũ (backward compatibility)
      if (!snap || !snap.exists()) {
        const legacyRef = doc(db, 'orders', `ORD-${orderCodeNum}`);
        const legacySnap = await getDoc(legacyRef);
        if (legacySnap.exists()) {
          targetDocRef = legacyRef;
          snap = legacySnap;
        }
      }

      if (snap && snap.exists()) {
        const orderData = snap.data() || {};
        const expectedAmount = Math.round(Number(
          orderData.quote?.depositNeededVnd ||
          orderData.quote?.totalVnd ||
          orderData.totalVnd ||
          orderData.totalAmount ||
          0
        ));

        // Bắt buộc đối chiếu số tiền thanh toán thực tế với số tiền đơn hàng trong Firestore
        if (expectedAmount <= 0 || paidAmount < expectedAmount) {
          console.error(`🚨 [PayOS Fraud Blocked] Đơn ${snap.id} yêu cầu ${expectedAmount}đ nhưng chỉ nhận ${paidAmount}đ!`);
          await updateDoc(targetDocRef, {
            paymentStatus: 'underpaid_flagged',
            paidAmountVnd: paidAmount,
            payosTransactionRef: verifiedData.reference || '',
            updatedAt: serverTimestamp(),
          });
          return res.status(200).json({
            success: false,
            message: `Số tiền thanh toán (${paidAmount}đ) nhỏ hơn tổng đơn (${expectedAmount}đ)`
          });
        }

        await updateDoc(targetDocRef, {
          status: 'deposit_paid',
          paymentStatus: 'paid',
          paidAmountVnd: paidAmount,
          paidAt: new Date().toISOString(),
          payosTransactionRef: verifiedData.reference || '',
          updatedAt: serverTimestamp(),
        });
        console.log(`✅ [PayOS Webhook] Đã tự động cập nhật đơn hàng ${snap.id} sang Đã Cọc 100%!`);
        return res.status(200).json({ success: true, message: 'Đã xác nhận đơn hàng thành công' });
      } else {
        console.warn(`⚠️ [PayOS Webhook] Không tìm thấy đơn hàng tương ứng trong Firestore`);
      }
    }

    return res.status(200).json({ success: true, message: 'Webhook đã ghi nhận' });
  } catch (err) {
    console.error('❌ Lỗi xử lý Webhook:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
