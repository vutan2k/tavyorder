#!/usr/bin/env node
/**
 * fix_live_product_images.js
 * 
 * Khắc phục triệt để lỗi ảnh không hiển thị trên web:
 * 1. Upload 8 ảnh sản phẩm ngừng bán (đã tô xám + dập chữ SOLD) lên Firebase Storage.
 * 2. Cập nhật productImage của tất cả sản phẩm đang bán về URL CDN thật (image.oliveyoung.co.kr hoặc Firebase Storage).
 * 3. Đồng bộ lại Firestore và file fallback playwright_scraped_products.json.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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
const storage = getStorage(app);

const SOLD_GOODS = [
  'A000000206850', 'A000000232098', 'A000000253617',
  'A000000262413', 'A000000262436', 'A000000263035',
  'A000000264301', 'A000000264302'
];

const LOCAL_PRODUCTS_DIR = '/Users/tan/tavy-korea/public/products';
const FALLBACK_CATALOG = '/Users/tan/tavy-korea/public/data/playwright_scraped_products.json';

async function main() {
  console.log('🔐 Đang đăng nhập Firebase Admin...');
  await signInWithEmailAndPassword(auth, 'admin@tavykorea.vn', 'admin123');
  console.log('✅ Đăng nhập Admin thành công!');

  // 1. Upload 8 ảnh SOLD lên Firebase Storage
  console.log('📤 Đang tải 8 ảnh SOLD lên Firebase Storage...');
  const soldUrls = {};
  for (const gid of SOLD_GOODS) {
    let filePath = null;
    let contentType = 'image/jpeg';
    for (const ext of ['jpg', 'png', 'jpeg']) {
      const p = path.join(LOCAL_PRODUCTS_DIR, `${gid}.${ext}`);
      if (fs.existsSync(p)) {
        filePath = p;
        contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
        break;
      }
    }

    if (filePath) {
      const ext = path.extname(filePath).slice(1);
      const storageRef = ref(storage, `products/${gid}/main_thumbnail_sold.${ext}`);
      const buffer = fs.readFileSync(filePath);
      await uploadBytes(storageRef, buffer, { contentType });
      const dlUrl = await getDownloadURL(storageRef);
      soldUrls[gid] = dlUrl;
      console.log(`   ✨ Đã upload ảnh SOLD [${gid}]: ${dlUrl}`);
    } else {
      console.warn(`   ⚠️ Không tìm thấy file ảnh local cho [${gid}]`);
    }
  }

  // 2. Đọc toàn bộ sản phẩm trên Firestore
  console.log('📥 Đang lấy danh sách sản phẩm từ Firestore...');
  const snapshot = await getDocs(collection(db, 'products'));
  const allProds = snapshot.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
  console.log(`📦 Tổng cộng: ${allProds.length} sản phẩm trên Firestore.`);

  let fixCount = 0;
  const CHUNK_SIZE = 400;
  let batch = writeBatch(db);
  let batchOps = 0;

  for (const prod of allProds) {
    const gid = prod.goodsNo || prod.firestoreId;
    let newImg = prod.productImage || '';
    let shouldUpdate = false;

    // Nếu là sản phẩm SOLD
    if (SOLD_GOODS.includes(gid) && soldUrls[gid]) {
      newImg = soldUrls[gid];
      shouldUpdate = true;
    } 
    // Nếu productImage bị trỏ vào tavyorder.web.app/products (chưa deploy)
    else if (!newImg || newImg.includes('tavyorder.web.app/products') || newImg.includes('unsplash.com')) {
      // Tìm URL thật trong mảng images
      const imagesArr = Array.isArray(prod.images) ? prod.images : [];
      const realCdn = imagesArr.find(u => 
        u && (u.includes('image.oliveyoung.co.kr') || u.includes('firebasestorage.googleapis.com'))
      );

      if (realCdn) {
        newImg = realCdn;
        shouldUpdate = true;
      } else if (imagesArr.length > 0 && imagesArr[0].startsWith('http')) {
        newImg = imagesArr[0];
        shouldUpdate = true;
      }
    }

    if (shouldUpdate && newImg && newImg !== prod.productImage) {
      prod.productImage = newImg;
      const docRef = doc(db, 'products', gid);
      batch.update(docRef, { productImage: newImg });
      batchOps++;
      fixCount++;

      if (batchOps >= CHUNK_SIZE) {
        await batch.commit();
        batch = writeBatch(db);
        batchOps = 0;
      }
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  console.log(`🎉 Đã sửa và cập nhật thành công ${fixCount} sản phẩm trên Cloud Firestore!`);

  // 3. Cập nhật file fallback playwright_scraped_products.json
  if (fs.existsSync(FALLBACK_CATALOG)) {
    const catalog = JSON.parse(fs.readFileSync(FALLBACK_CATALOG, 'utf8'));
    let catFix = 0;
    for (const p of catalog) {
      const gid = p.goodsNo;
      if (SOLD_GOODS.includes(gid) && soldUrls[gid]) {
        p.productImage = soldUrls[gid];
        catFix++;
      } else if (!p.productImage || p.productImage.includes('tavyorder.web.app/products') || p.productImage.includes('unsplash.com')) {
        const imagesArr = Array.isArray(p.images) ? p.images : [];
        const realCdn = imagesArr.find(u => 
          u && (u.includes('image.oliveyoung.co.kr') || u.includes('firebasestorage.googleapis.com'))
        );
        if (realCdn) {
          p.productImage = realCdn;
          catFix++;
        }
      }
    }
    fs.writeFileSync(FALLBACK_CATALOG, JSON.stringify(catalog, null, 2), 'utf8');
    console.log(`💾 Đã cập nhật ${catFix} ảnh thật vào file fallback: ${FALLBACK_CATALOG}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
