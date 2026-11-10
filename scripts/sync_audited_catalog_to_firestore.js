import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/tan/tavy-korea/.env' });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: 'tavyorder.firebaseapp.com',
  projectId: 'tavyorder',
  storageBucket: 'tavyorder.firebasestorage.app',
  messagingSenderId: '307372781687',
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TELEGRAM_BOT_TOKEN = '8887086946:AAGQ6xm1KA4fH9Ibd1In0tkLUnH7etKWbzA';
const TELEGRAM_CHAT_ID = '8575761420';
const AUDITED_CATALOG_PATH = '/Users/tan/Desktop/theasd_auto_bot/tavy_catalog_audited_variants.json';

async function sendTelegramAlert(htmlText) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const data = await res.json();
    return data.ok;
  } catch (err) {
    console.error('Failed to send Telegram alert:', err.message);
    return false;
  }
}

function calculateDynamicVnd(won, krwRate, feePercent) {
  if (!won || won <= 0) return 0;
  const numWon = Number(won);
  const rate = Number(krwRate) || 20;
  const mult = 1 + (Number(feePercent) || 5) / 100.0;
  return Math.round((numWon * rate * mult) / 1000.0) * 1000;
}

async function syncCatalog() {
  console.log('🚀 Bắt đầu đồng bộ catalog & phân loại tiếng Việt vào Firestore...');
  const adminEmail = process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn';
  const adminPass = process.env.FIREBASE_ADMIN_PASSWORD || 'admin123';
  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  console.log('✓ Đã đăng nhập Firebase Admin.');

  // 1. Fetch live rates from Firestore
  const ratesSnap = await getDoc(doc(db, 'system_config', 'rates'));
  let krwRate = 20;
  let serviceFeePercent = 5;

  if (ratesSnap.exists()) {
    const rData = ratesSnap.data();
    krwRate = rData.KRW?.rate || rData.krwRate || 20;
    if (rData.serviceFeePercent !== undefined) {
      serviceFeePercent = Number(rData.serviceFeePercent);
    }
    console.log(`✓ Tỷ giá đọc từ Web Admin Firestore: 1 KRW = ${krwRate}đ | Phí dịch vụ: ${serviceFeePercent}%`);
  } else {
    console.warn('⚠️ Không tìm thấy doc system_config/rates, dùng giá trị mặc định.');
  }

  // 2. Load audited catalog
  if (!fs.existsSync(AUDITED_CATALOG_PATH)) {
    throw new Error(`File catalog không tồn tại: ${AUDITED_CATALOG_PATH}`);
  }
  const catalog = JSON.parse(fs.readFileSync(AUDITED_CATALOG_PATH, 'utf8'));
  console.log(`📦 Nạp ${catalog.length} SKU từ catalog đối soát.`);

  let batch = writeBatch(db);
  let opCount = 0;
  let totalCommitted = 0;
  let soldOutCount = 0;
  let discontinuedCount = 0;
  let totalOptionsCount = 0;

  for (const item of catalog) {
    const docId = item.goodsNo || item.id;
    if (!docId) continue;

    // Recalculate price with dynamic rates from Admin
    const saleKrw = item.salePrice || 0;
    const origKrw = item.originalPrice || saleKrw;
    const saleVnd = calculateDynamicVnd(saleKrw, krwRate, serviceFeePercent);
    const origVnd = calculateDynamicVnd(origKrw, krwRate, serviceFeePercent);

    if (item.isDiscontinued) discontinuedCount++;
    if (item.isSoldOut && !item.isDiscontinued) soldOutCount++;

    // Recalculate option prices
    const updatedOptions = (item.options || []).map(opt => {
      const optKrw = opt.price_krw || saleKrw;
      return {
        ...opt,
        price_vnd: calculateDynamicVnd(optKrw, krwRate, serviceFeePercent)
      };
    });
    totalOptionsCount += updatedOptions.length;

    const updatePayload = {
      ...item,
      salePrice: saleKrw,
      originalPrice: origKrw,
      priceVnd: saleVnd,
      originalPriceVnd: origVnd,
      options: updatedOptions,
      appliedKrwRate: krwRate,
      appliedServiceFeePercent: serviceFeePercent,
      lastAuditedAt: new Date().toISOString()
    };

    const docRef = doc(db, 'products', docId);
    batch.set(docRef, updatePayload, { merge: true });
    opCount++;
    totalCommitted++;

    if (opCount >= 100) {
      await batch.commit();
      console.log(`  -> Đã lưu batch ${totalCommitted}/${catalog.length} SKU...`);
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  console.log(`\n✅ ĐỒNG BỘ THÀNH CÔNG ${totalCommitted} SẢN PHẨM LÊN FIRESTORE!`);
  console.log(`- Sản phẩm ngừng bán hẳn: ${discontinuedCount} SKU`);
  console.log(`- Sản phẩm cháy hàng (일시품절): ${soldOutCount} SKU`);
  console.log(`- Tổng phân loại con (variants): ${totalOptionsCount} options`);

  // 3. Send Telegram Notification (Rút gọn tối đa chuẩn telemetry)
  const alertHtml = `⚡ <b>[Tavy Web] Sync OY:</b> ${totalCommitted} SKU (${totalCommitted - discontinuedCount - soldOutCount} bán, ${soldOutCount} hết, ${discontinuedCount} ngưng) | Tỷ giá: ${krwRate}đ (+${serviceFeePercent}%)`;

  await sendTelegramAlert(alertHtml);
  console.log('✓ Đã gửi báo cáo tổng kết qua Telegram Bot!');
  process.exit(0);
}

syncCatalog().catch(err => {
  console.error('Lỗi fatal sync catalog:', err);
  process.exit(1);
});
