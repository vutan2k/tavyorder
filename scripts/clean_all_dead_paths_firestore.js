#!/usr/bin/env node
/**
 * clean_all_dead_paths_firestore.js
 * Dọn sạch triệt để toàn bộ đường dẫn cục bộ /oliveyoung_ranking/ trên Firestore.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const env = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
const envGet = (k, d) => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1]?.trim() || d;

const firebaseConfig = {
  apiKey: envGet('VITE_FIREBASE_API_KEY'),
  authDomain: envGet('VITE_FIREBASE_AUTH_DOMAIN', 'tavyorder.firebaseapp.com'),
  projectId: envGet('VITE_FIREBASE_PROJECT_ID', 'tavyorder'),
  storageBucket: envGet('VITE_FIREBASE_STORAGE_BUCKET', 'tavyorder.firebasestorage.app'),
  messagingSenderId: envGet('VITE_FIREBASE_MESSAGING_SENDER_ID', '307372781687'),
  appId: envGet('VITE_FIREBASE_APP_ID')
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  console.log('🔐 Đang đăng nhập Firebase Admin...');
  const adminEmail = envGet('VITE_ADMIN_EMAIL', 'admin@tavykorea.vn');
  const adminPass = process.env.FIREBASE_ADMIN_PASSWORD || 'admin123';
  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  console.log('✅ Đăng nhập Admin thành công:', adminEmail);

  console.log('📦 Đang quét toàn bộ danh mục sản phẩm trên Firestore...');
  const snap = await getDocs(collection(db, 'products'));
  console.log(`Tìm thấy ${snap.size} sản phẩm.`);

  const batch = writeBatch(db);
  let updatedCount = 0;

  snap.forEach(docSnap => {
    const p = docSnap.data();
    const id = docSnap.id;
    let changed = false;

    const fallbackImg = p.productImage || (p.goodsNo ? `/products/${p.goodsNo}.jpg` : '');

    // 1. Dọn options
    let newOptions = p.options;
    if (Array.isArray(p.options) && p.options.length > 0) {
      newOptions = p.options.map(opt => {
        if (opt.image_url && (opt.image_url.includes('oliveyoung_ranking') || opt.image_url.startsWith('file://'))) {
          changed = true;
          return { ...opt, image_url: fallbackImg };
        }
        return opt;
      });
    }

    // 2. Dọn photoReviews
    let newPhotoReviews = p.photoReviews;
    if (Array.isArray(p.photoReviews)) {
      const filtered = p.photoReviews.filter(r => !r || (!r.includes('oliveyoung_ranking') && !r.startsWith('file://')));
      if (filtered.length !== p.photoReviews.length) {
        changed = true;
        newPhotoReviews = filtered;
      }
    }

    // 3. Dọn images
    let newImages = p.images;
    if (Array.isArray(p.images)) {
      const filtered = p.images.filter(img => !img || (!img.includes('oliveyoung_ranking') && !img.startsWith('file://')));
      if (filtered.length !== p.images.length) {
        changed = true;
        newImages = filtered;
      }
    }

    if (changed) {
      const docRef = doc(db, 'products', id);
      batch.update(docRef, {
        options: newOptions,
        photoReviews: newPhotoReviews,
        images: newImages,
        updatedAt: new Date().toISOString()
      });
      updatedCount++;
      console.log(`[CẦN CẬP NHẬT] ${id} - ${p.name || p.name_vi}`);
    }
  });

  if (updatedCount > 0) {
    console.log(`\n🚀 Đang ghi ${updatedCount} bản cập nhật vào Firestore...`);
    await batch.commit();
    console.log(`✅ ĐÃ HOÀN TẤT CẬP NHẬT ${updatedCount} SẢN PHẨM TRÊN FIRESTORE!`);
  } else {
    console.log('✨ Toàn bộ sản phẩm đã sạch sẽ, không có tài liệu nào cần cập nhật.');
  }
}

main().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
