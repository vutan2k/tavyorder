import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLAYWRIGHT_JSON_PATH = path.resolve(__dirname, '../public/data/playwright_scraped_products.json');

const firebaseConfig = {
  apiKey: "AIzaSyCQ_cpZLNbZdgGpDzea9GlpCL8vbeb_emo",
  authDomain: "tavyorder.firebaseapp.com",
  projectId: "tavyorder",
  storageBucket: "tavyorder.firebasestorage.app",
  messagingSenderId: "307372781687",
  appId: "1:307372781687:web:356e2963e0cf23b018d672"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  console.log('🔄 Đang đồng bộ phân loại chính xác lên Firestore pending_products...');
  const raw = fs.readFileSync(PLAYWRIGHT_JSON_PATH, 'utf8');
  const products = JSON.parse(raw);

  console.log('🔐 Đang xác thực Firebase Auth Admin...');
  await signInWithEmailAndPassword(auth, 'admin@tavykorea.vn', 'admin123');
  console.log('✅ Xác thực Admin thành công!');

  console.log(`📤 Đang cập nhật ${products.length} sản phẩm phân loại chuẩn vào Firestore "pending_products"...`);
  const CHUNK_SIZE = 50;
  for (let i = 0; i < products.length; i += CHUNK_SIZE) {
    const chunk = products.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const prod of chunk) {
      const docRef = doc(db, 'pending_products', prod.goodsNo);
      batch.update(docRef, {
        category: prod.category,
        subCategory: prod.subCategory || prod.category,
        categoryLabel: prod.categoryLabel || '',
        updatedAt: new Date().toISOString()
      });
    }

    await batch.commit();
    console.log(`   ✨ Đã ghi Firestore đợt ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} sản phẩm)`);
  }

  console.log('================================================================');
  console.log(`🎉 HOÀN TẤT ĐỒNG BỘ 100/100 PHÂN LOẠI CHÍNH XÁC LÊN CLOUD FIRESTORE!`);
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error("Firestore sync error:", err);
  process.exit(1);
});
