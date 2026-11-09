import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, writeBatch, getDoc } from 'firebase/firestore';
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

const AUDITED_PATH = '/Users/tan/Desktop/theasd_auto_bot/tavy_catalog_audited_variants.json';
const PLAYWRIGHT_PATH = '/Users/tan/tavy-korea/public/data/playwright_scraped_products.json';
const ALL_CATALOG_PATH = '/Users/tan/tavy-korea/public/data/all_products_catalog.json';
const NEW_ITEMS_PATH = '/tmp/new_10_highend_items.json';

function calculateVnd(krw, krwRate, feePercent) {
  const raw = krw * krwRate * (1 + feePercent / 100);
  return Math.round(raw / 1000) * 1000;
}

async function run() {
  console.log('🚀 Bắt đầu tích hợp 10 sản phẩm High-End mới vào hệ thống...');
  
  await signInWithEmailAndPassword(auth, process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn', process.env.FIREBASE_ADMIN_PASSWORD || 'admin123');
  console.log('✓ Đã đăng nhập Firebase Admin.');

  // Đọc rates
  const ratesSnap = await getDoc(doc(db, 'system_config', 'rates'));
  const ratesData = ratesSnap.data() || {};
  const krwRate = ratesData?.KRW?.rate || 19.5;
  const serviceFee = ratesData?.serviceFeePercent ?? 30;
  console.log(`📊 Tỷ giá live: 1 KRW = ${krwRate} VND | Phí dịch vụ: ${serviceFee}%`);

  const existingCatalog = JSON.parse(fs.readFileSync(ALL_CATALOG_PATH, 'utf8'));
  const newItemsRaw = JSON.parse(fs.readFileSync(NEW_ITEMS_PATH, 'utf8'));

  console.log(`📦 Catalog hiện có: ${existingCatalog.length} SKU | High-End mới: ${newItemsRaw.length} SKU`);

  const formattedNewItems = newItemsRaw.map(item => {
    const minWon = item.foreignPrice || item.originalPriceWon || 50000;
    const minVnd = calculateVnd(minWon, krwRate, serviceFee);

    const formattedOptions = (item.options || []).map((opt, oIdx) => {
      const optWon = opt.price || minWon;
      return {
        id: opt.id || String(oIdx + 1),
        name: opt.name,
        name_vi: opt.name_vi || opt.name,
        name_kr: opt.name_kr || item.koreanTitle || opt.name,
        price_krw: optWon,
        price_vnd: calculateVnd(optWon, krwRate, serviceFee),
        isSoldOut: Boolean(opt.isSoldOut),
        imageUrl: `/products/${item.goodsNo}.jpg`
      };
    });

    return {
      id: item.goodsNo,
      goodsNo: item.goodsNo,
      firestoreId: item.goodsNo,
      name: item.name_vi,
      name_vi: item.name_vi,
      nameKr: item.koreanTitle,
      name_kr: item.koreanTitle,
      brand: item.brand,
      brand_vi: item.brand_vi,
      brand_kr: item.brand,
      category: 'highend',
      category_vi: 'Hàng Hiệu Bách Hóa',
      subCategory: item.subCategory || 'perfume',
      departmentStore: item.departmentStore || 'Shinsegae Department Store',
      isHighEnd: true,
      foreignPrice: minWon,
      price: minWon,
      originPrice: minWon,
      originalPrice: minWon,
      originalPriceWon: minWon,
      priceVnd: minVnd,
      originalPriceVnd: minVnd,
      appliedKrwRate: krwRate,
      appliedServiceFeePercent: serviceFee,
      discountRate: 0,
      saleRate: 0,
      productImage: `/products/${item.goodsNo}.jpg`,
      thumbnailUrl: `/products/${item.goodsNo}.jpg`,
      images: [`/products/${item.goodsNo}.jpg`],
      photoReviews: [],
      options: formattedOptions,
      optionsCount: formattedOptions.length,
      hasOptions: formattedOptions.length > 0,
      description: item.description,
      usage: item.usage,
      status: 'available',
      isAvailable: true,
      isSoldOut: false,
      is_sold_out: false,
      isDiscontinued: false,
      isPublished: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastAuditedAt: new Date().toISOString()
    };
  });

  const existingMap = new Map();
  existingCatalog.forEach(p => existingMap.set(p.goodsNo || p.id, p));

  formattedNewItems.forEach(item => {
    existingMap.set(item.goodsNo, item);
  });

  const mergedCatalog = Array.from(existingMap.values());
  console.log(`📦 Tổng sản phẩm sau khi hợp nhất: ${mergedCatalog.length} SKU`);

  // Lưu ra các file JSON
  if (fs.existsSync(AUDITED_PATH)) {
    fs.writeFileSync(AUDITED_PATH, JSON.stringify(mergedCatalog, null, 2), 'utf8');
  }
  fs.writeFileSync(PLAYWRIGHT_PATH, JSON.stringify(mergedCatalog, null, 2), 'utf8');
  fs.writeFileSync(ALL_CATALOG_PATH, JSON.stringify(mergedCatalog, null, 2), 'utf8');
  console.log('✓ Đã lưu thành công các file catalog JSON trên ổ cứng.');

  // Đẩy 10 sản phẩm High-End mới lên Firestore
  let batch = writeBatch(db);
  let batchCount = 0;

  for (const item of formattedNewItems) {
    const docRef = doc(db, 'products', item.goodsNo);
    batch.set(docRef, item, { merge: true });
    batchCount++;
  }

  await batch.commit();
  console.log(`✅ Đã commit ${batchCount} sản phẩm High-End mới lên Firestore thành công!`);
  process.exit(0);
}

run().catch(e => {
  console.error('Lỗi tích hợp:', e);
  process.exit(1);
});
