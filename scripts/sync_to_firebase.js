import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyCQ_cpZLNbZdgGpDzea9GlpCL8vbeb_emo',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'tavyorder.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'tavyorder',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'tavyorder.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '307372781687',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:307372781687:web:356e2963e0cf23b018d672'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const data = JSON.parse(fs.readFileSync('./public/data/playwright_scraped_products.json', 'utf8'));

(async () => {
  try {
    // Authenticate as admin to satisfy Firestore security rules
    const adminEmail = process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn';
    const adminPass = process.env.VITE_ADMIN_PASSWORD || 'admin123';
    console.log(`🔐 Đang xác thực tài khoản Admin (${adminEmail})...`);
    await signInWithEmailAndPassword(auth, adminEmail, adminPass);
    console.log('✅ Xác thực Firebase Auth Admin thành công!');

    let pendingCount = 0;
    let liveCount = 0;

    for (const product of data) {
      const docId = String(product.goodsNo || product.id || `PW_${Date.now()}`);
      
      // Đảm bảo Goodal Vita C Serum và các serum/kem/mặt nạ luôn là cosmetics
      const isGoodalOrSkincare = docId === 'A000000263562' || /serum|mặt nạ|toner|ampoule/i.test(product.name || '');
      const cleanCategory = isGoodalOrSkincare ? 'cosmetics' : String(product.category || 'cosmetics');
      const cleanSubCat = docId === 'A000000263562' ? 'serum' : String(product.subCategory || '');
      const cleanLabel = docId === 'A000000263562' ? 'Serum & Tinh Chất' : String(product.categoryLabel || '');

      const basePayload = {
        goodsNo: String(docId),
        name: String(product.name || product.nameKr || ''),
        nameKr: String(product.nameKr || product.name || ''),
        brand: String(product.brand || 'Korea Brand'),
        brandKr: String(product.brandKr || product.brand || ''),
        category: cleanCategory,
        subCategory: cleanSubCat,
        categoryLabel: cleanLabel,
        categoryKr: String(product.categoryKr || ''),
        foreignPrice: Number(product.foreignPrice) || 0,
        price: Number(product.price || product.foreignPrice) || 0,
        originalPrice: Number(product.originalPrice) || 0,
        productImage: String(product.productImage || product.mainImg || ''),
        images: Array.isArray(product.images || product.albumImgs) ? (product.images || product.albumImgs).map(String) : [String(product.productImage || '')],
        photoReviews: Array.isArray(product.photoReviews) ? product.photoReviews.map(String) : [],
        description: String(product.description || ''),
        origin: String(product.origin || 'Store Olive Young Korea'),
        rating: Number.isFinite(Number(product.rating)) ? Number(product.rating) : 4.9,
        reviewsCount: Number.isFinite(Number(product.reviewsCount)) ? Number(product.reviewsCount) : 120,
        productUrl: String(product.productUrl || ''),
        inStock: true,
        source: String(product.source || 'OLIVEYOUNG_RANKING_OFFICIAL'),
        scrapedAt: product.scrapedAt || new Date().toISOString()
      };

      // 1. Lưu vào pending_products (Kho Hàng Chờ Duyệt)
      const pendingDocRef = doc(db, 'pending_products', docId);
      await setDoc(pendingDocRef, {
        ...basePayload,
        status: 'pending',
        isPublished: false
      }, { merge: true });
      pendingCount++;

      // 2. Với Top 5 Olive Young, đồng thời xuất bản vào products (Kho Live) để lên ngay website
      const top5Ids = ['A000000223414', 'A000000262413', 'A000000219609', 'A000000263562', 'A000000261423'];
      if (top5Ids.includes(docId)) {
        const liveDocRef = doc(db, 'products', docId);
        await setDoc(liveDocRef, {
          ...basePayload,
          status: 'published',
          isPublished: true
        }, { merge: true });
        liveCount++;
      }
    }

    console.log(`🎉 Đã đồng bộ ${pendingCount} sản phẩm vào pending_products (Kho Chờ Duyệt)`);
    console.log(`🚀 Đã xuất bản đủ ${liveCount} sản phẩm Top Olive Young vào products (Kho Bán Live)`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi đồng bộ Firestore:', err);
    process.exit(1);
  }
})();
