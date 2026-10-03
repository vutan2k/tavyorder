#!/usr/bin/env node
/**
 * migrate_and_sync_catalog.js
 * 1. Upload local images in ~/Desktop/oliveyoung_ranking to Firebase Storage
 * 2. Update Firestore `products` collection with permanent Firebase Storage URLs
 * 3. Keep Firestore fields rich & ready for AI Automation.
 */

import { readdirSync, existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
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
const storage = getStorage(app);
const db = getFirestore(app);
const auth = getAuth(app);

const SRC_DIR = join(homedir(), 'Desktop', 'oliveyoung_ranking');

function getContentType(filename) {
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

async function uploadFileToStorage(localPath, storagePath) {
  const fileBuffer = readFileSync(localPath);
  const fileRef = ref(storage, storagePath);
  const contentType = getContentType(localPath);
  await uploadBytes(fileRef, fileBuffer, { contentType });
  return await getDownloadURL(fileRef);
}

async function runMigration() {
  console.log('🚀 BẮT ĐẦU QUY TRÌNH ĐẨY ẢNH & ĐỒNG BỘ CATALOG LÊN CLOUD...');

  const adminEmail = process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn';
  const adminPass = process.env.FIREBASE_ADMIN_PASSWORD || 'admin123';
  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  console.log('🔐 Đã xác thực Firebase Admin:', adminEmail);

  const snap = await getDocs(collection(db, 'products'));
  console.log(`📦 Tìm thấy ${snap.size} sản phẩm trên Firestore.`);

  const localFolders = existsSync(SRC_DIR) ? readdirSync(SRC_DIR) : [];
  console.log(`📂 Có ${localFolders.length} thư mục sản phẩm tại ${SRC_DIR}`);

  // Build lookup map by goodsNo
  // Folder format: top_13_롱테이크_A000000168243
  const folderByGoodsNo = {};
  for (const f of localFolders) {
    const parts = f.split('_');
    const goodsNo = parts[parts.length - 1];
    if (goodsNo && (goodsNo.startsWith('A') || goodsNo.startsWith('B') || goodsNo.startsWith('PW'))) {
      folderByGoodsNo[goodsNo] = f;
    }
  }

  let updatedProducts = 0;
  let totalUploadedFiles = 0;

  for (const docSnap of snap.docs) {
    const pId = docSnap.id;
    const data = docSnap.data();
    const goodsNo = data.goodsNo || pId;
    const folderName = folderByGoodsNo[goodsNo];

    let hasChanges = false;
    const updates = {};

    // 1. Kiểm tra ảnh chính
    let currentMain = data.productImage || '';
    if (currentMain.includes('/oliveyoung_ranking/') || (!currentMain.startsWith('http') && folderName)) {
      const folderPath = join(SRC_DIR, folderName);
      if (existsSync(folderPath)) {
        const files = readdirSync(folderPath);
        const mainFile = files.find(f => f.startsWith('main_thumbnail') || f.startsWith('main_image'));
        if (mainFile) {
          console.log(`[${goodsNo}] 📤 Đang upload main thumbnail từ ${folderName}/${mainFile}...`);
          const storagePath = `products/${goodsNo}/${mainFile}`;
          const cloudUrl = await uploadFileToStorage(join(folderPath, mainFile), storagePath);
          updates.productImage = cloudUrl;
          hasChanges = true;
          totalUploadedFiles++;
        }
      }
    }

    // 2. Kiểm tra mảng images
    if (Array.isArray(data.images) && folderName) {
      const folderPath = join(SRC_DIR, folderName);
      if (existsSync(folderPath)) {
        const newImages = [];
        let imgChanged = false;
        for (const imgUrl of data.images) {
          if (typeof imgUrl === 'string' && imgUrl.includes('/oliveyoung_ranking/')) {
            const fileName = imgUrl.split('/').pop();
            const filePath = join(folderPath, fileName);
            if (existsSync(filePath)) {
              const storagePath = `products/${goodsNo}/${fileName}`;
              const cloudUrl = await uploadFileToStorage(filePath, storagePath);
              newImages.push(cloudUrl);
              imgChanged = true;
              totalUploadedFiles++;
            } else if (updates.productImage) {
              newImages.push(updates.productImage);
              imgChanged = true;
            }
          } else {
            newImages.push(imgUrl);
          }
        }
        if (imgChanged) {
          updates.images = newImages;
          hasChanges = true;
        }
      }
    }

    // 3. Kiểm tra mảng photoReviews
    if (Array.isArray(data.photoReviews) && folderName) {
      const folderPath = join(SRC_DIR, folderName);
      if (existsSync(folderPath)) {
        const newReviews = [];
        let revChanged = false;
        for (const revUrl of data.photoReviews) {
          if (typeof revUrl === 'string' && revUrl.includes('/oliveyoung_ranking/')) {
            const fileName = revUrl.split('/').pop();
            const filePath = join(folderPath, fileName);
            if (existsSync(filePath)) {
              const storagePath = `products/${goodsNo}/reviews/${fileName}`;
              const cloudUrl = await uploadFileToStorage(filePath, storagePath);
              newReviews.push(cloudUrl);
              revChanged = true;
              totalUploadedFiles++;
            }
          } else {
            newReviews.push(revUrl);
          }
        }
        if (revChanged) {
          updates.photoReviews = newReviews;
          hasChanges = true;
        }
      }
    }

    // Ghi cập nhật Firestore
    if (hasChanges) {
      updates.updatedAt = new Date().toISOString();
      updates.storageProvider = 'firebase_storage';
      await updateDoc(doc(db, 'products', pId), updates);
      updatedProducts++;
      console.log(`✅ [${goodsNo}] Đã cập nhật xong dữ liệu & link ảnh CDN.`);
    }
  }

  console.log('----------------------------------------------------');
  console.log(`🎉 HOÀN TẤT ĐỒNG BỘ:`);
  console.log(`- Tổng số file ảnh đã đẩy lên Firebase Storage: ${totalUploadedFiles}`);
  console.log(`- Tổng số sản phẩm Firestore được cập nhật link CDN: ${updatedProducts}`);
  process.exit(0);
}

runMigration().catch(err => {
  console.error('❌ Lỗi tiến trình:', err);
  process.exit(1);
});
