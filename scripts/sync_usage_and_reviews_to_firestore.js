import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';
import fs from 'fs';
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

const CATALOG_PATH = '/Users/tan/Desktop/theasd_auto_bot/tavy_catalog_audited_variants.json';

async function run() {
  console.log('🚀 Đang đẩy dữ liệu Usage & PhotoReviews lên Firestore...');

  const adminEmail = process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn';
  const adminPass = process.env.FIREBASE_ADMIN_PASSWORD || 'admin123';
  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  console.log('✓ Đã đăng nhập Firebase Admin.');

  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  console.log(`📦 Tổng sản phẩm cần update Firestore: ${catalog.length}`);

  let batch = writeBatch(db);
  let count = 0;
  let totalCommitted = 0;

  for (const p of catalog) {
    const gid = p.goodsNo || p.id;
    if (!gid) continue;

    const docRef = doc(db, 'products', gid);
    batch.set(docRef, {
      usage: p.usage || '',
      photoReviews: Array.isArray(p.photoReviews) ? p.photoReviews : [],
      lastAuditedAt: p.lastAuditedAt || new Date().toISOString()
    }, { merge: true });

    count++;
    totalCommitted++;

    if (count >= 100) {
      await batch.commit();
      console.log(`  -> Đã commit ${totalCommitted}/${catalog.length} SKU...`);
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  console.log(`✅ HOÀN TẤT ĐỒNG BỘ ${totalCommitted} SẢN PHẨM LÊN FIRESTORE!`);
  process.exit(0);
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
