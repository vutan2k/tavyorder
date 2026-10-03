#!/usr/bin/env node
import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/tan/tavy-korea/.env' });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'tavyorder.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'tavyorder',
  storageBucket: 'tavyorder.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '307372781687',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:307372781687:web:356e2963e0cf23b018d672'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function syncToFirestore() {
  console.log('🔐 Đang xác thực Firebase Auth Admin...');
  const adminEmail = process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn';
  const adminPass = process.env.FIREBASE_ADMIN_PASSWORD || 'admin123';
  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  console.log('✅ Xác thực Admin thành công!');

  const payloadPath = '/tmp/firestore_sync_payload.json';
  if (!fs.existsSync(payloadPath)) {
    console.error('❌ Không tìm thấy payload tại:', payloadPath);
    process.exit(1);
  }

  const products = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  console.log(`📤 Chuẩn bị ghi ${products.length} sản phẩm lên Firestore 'products'...`);

  const CHUNK_SIZE = 50;
  for (let i = 0; i < products.length; i += CHUNK_SIZE) {
    const chunk = products.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const prod of chunk) {
      const docId = prod.goodsNo || prod.firestoreId;
      if (!docId) continue;
      const cleanProd = { ...prod };
      delete cleanProd.firestoreId;
      const docRef = doc(db, 'products', docId);
      batch.set(docRef, cleanProd, { merge: true });
    }

    await batch.commit();
    console.log(`   ✨ Đã ghi thành công đợt ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(products.length / CHUNK_SIZE)} (${chunk.length} sản phẩm)`);
  }

  console.log('🎉 ĐỒNG BỘ FIRESTORE THÀNH CÔNG RỰC RỠ!');
  process.exit(0);
}

syncToFirestore().catch(err => {
  console.error('❌ Lỗi đồng bộ Firestore:', err);
  process.exit(1);
});
