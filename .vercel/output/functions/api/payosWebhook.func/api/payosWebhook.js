import { PayOS } from '@payos/node';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyCQ_cpZLNbZdgGpDzea9GlpCL8vbeb_emo',
  authDomain: 'tavyorder.firebaseapp.com',
  projectId: 'tavyorder',
};

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID || 'bbc74f56-8123-458f-b415-02dbfbf266de',
  apiKey: process.env.PAYOS_API_KEY || '3bb063b7-9e11-4dd0-9255-f63b4e8cf30b',
  checksumKey: process.env.PAYOS_CHECKSUM_KEY || '2f514fd651f39f09040df22086c1823e31dedcb479cf601003d05110b6e7b189',
});

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

    // Xác thực chữ ký HMAC từ PayOS
    let verifiedData;
    try {
      verifiedData = await payos.webhooks.verify(webhookData);
    } catch (err) {
      console.warn('⚠️ Lỗi hoặc ping thử nghiệm PayOS Webhook:', err.message);
      // Khi PayOS ping thử nghiệm xác thực URL (confirm webhook), trả về 200 để xác nhận URL hoạt động
      return res.status(200).json({ success: true, message: 'Webhook test received' });
    }

    if (verifiedData && (verifiedData.orderCode || verifiedData.amount)) {
      const orderCodeNum = Number(verifiedData.orderCode);
      const strCode = String(orderCodeNum);
      const phoneCandidate = strCode.startsWith('0') ? strCode : ('0' + strCode);

      console.log(`⚡ [PayOS Webhook] Nhận thanh toán: ${verifiedData.amount} đ cho đơn code ${orderCodeNum} (SĐT: ${phoneCandidate})`);

      // 1. Tìm đơn theo SĐT chuẩn hoặc chuỗi số
      let targetDocRef = doc(db, 'orders', phoneCandidate);
      let snap = await getDoc(targetDocRef);

      if (!snap.exists()) {
        targetDocRef = doc(db, 'orders', strCode);
        snap = await getDoc(targetDocRef);
      }

      // 2. Tìm theo ORD prefix cũ (backward compatibility)
      if (!snap.exists()) {
        targetDocRef = doc(db, 'orders', `ORD-${orderCodeNum}`);
        snap = await getDoc(targetDocRef);
      }

      // 3. Tìm theo orderCode nếu ID không khớp
      if (!snap.exists() && orderCodeNum) {
        const q = query(collection(db, 'orders'), where('orderCode', '==', orderCodeNum));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          targetDocRef = qSnap.docs[0].ref;
          snap = qSnap.docs[0];
        }
      }

      // 4. Tìm theo customerPhone
      if (!snap.exists() && phoneCandidate) {
        const qPhone = query(collection(db, 'orders'), where('customerPhone', '==', phoneCandidate));
        const qPhoneSnap = await getDocs(qPhone);
        if (!qPhoneSnap.empty) {
          targetDocRef = qPhoneSnap.docs[0].ref;
          snap = qPhoneSnap.docs[0];
        }
      }

      // 5. Tìm theo totalVnd / exactPaymentAmount
      if (!snap.exists() && verifiedData.amount) {
        const qAmount = query(
          collection(db, 'orders'),
          where('totalVnd', '==', Number(verifiedData.amount)),
          where('paymentStatus', '==', 'unpaid')
        );
        const qAmountSnap = await getDocs(qAmount);
        if (!qAmountSnap.empty) {
          targetDocRef = qAmountSnap.docs[0].ref;
          snap = qAmountSnap.docs[0];
        }
      }

      if (snap.exists()) {
        await updateDoc(targetDocRef, {
          status: 'deposit_paid',
          paymentStatus: 'paid',
          paidAmountVnd: verifiedData.amount,
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
