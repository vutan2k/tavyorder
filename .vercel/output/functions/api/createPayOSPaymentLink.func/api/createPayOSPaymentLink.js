import { PayOS } from '@payos/node';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { orderId, amount } = req.body || req.query || {};
    if (!orderId || !amount) {
      return res.status(400).json({ success: false, error: 'Thiếu orderId hoặc amount' });
    }

    const numericPart = parseInt((orderId || '').replace(/\D/g, ''), 10) || Math.floor(Date.now() / 1000);
    const orderCode = Number(numericPart);

    const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : '') || 'https://tavyorder.web.app';
    const cleanPhone = (orderId || '').replace(/\D/g, '').slice(-10);
    const description = cleanPhone ? `TAVY ${cleanPhone}` : `TAVY ${orderId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15)}`;

    const body = {
      orderCode: orderCode,
      amount: Number(amount),
      description: description.slice(0, 25),
      returnUrl: `${origin}/payment/${orderId}`,
      cancelUrl: `${origin}/payment/${orderId}`,
    };

    const paymentLinkData = await payos.paymentRequests.create(body);

    try {
      await setDoc(doc(db, 'orders', orderId), {
        orderCode: orderCode,
        payosPaymentLinkId: paymentLinkData.paymentLinkId || '',
      }, { merge: true });
    } catch (saveErr) {
      console.warn('Lỗi lưu orderCode vào Firestore:', saveErr.message);
    }

    return res.status(200).json({ success: true, isConfigured: true, data: paymentLinkData, orderCode });
  } catch (err) {
    console.error('Lỗi tạo PayOS Payment Link:', err);
    return res.status(200).json({ success: false, fallback: true, error: err.message });
  }
}
