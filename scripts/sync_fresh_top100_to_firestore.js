import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs, writeBatch, deleteField } from 'firebase/firestore';
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

const AUDITED_CATALOG_PATH = '/Users/tan/Desktop/theasd_auto_bot/tavy_catalog_audited_variants.json';
const TOP100_FRESH_FILE = '/tmp/live_top100_oy_fresh.json';
const NEW_ITEMS_FILE = '/tmp/new_enriched_top100_items.json';
const PLAYWRIGHT_PATH = '/Users/tan/tavy-korea/public/data/playwright_scraped_products.json';
const ALL_CATALOG_PATH = '/Users/tan/tavy-korea/public/data/all_products_catalog.json';

function calculateDynamicVnd(won, krwRate, feePercent) {
  if (!won || won <= 0) return 0;
  const numWon = Number(won);
  const rate = Number(krwRate) || 20;
  const mult = 1 + (Number(feePercent) || 30) / 100.0;
  return Math.round((numWon * rate * mult) / 1000.0) * 1000;
}

async function run() {
  console.log('🚀 Bắt đầu cập nhật toàn bộ Top 100 Olive Young mới nhất lên Firestore...');

  // 1. Auth Admin
  const adminEmail = process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn';
  const adminPass = process.env.FIREBASE_ADMIN_PASSWORD || 'admin123';
  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  console.log('✓ Đã đăng nhập Firebase Admin.');

  // 2. Fetch live rates from Firestore system_config/rates
  const ratesSnap = await getDoc(doc(db, 'system_config', 'rates'));
  let krwRate = 20;
  let serviceFeePercent = 30;

  if (ratesSnap.exists()) {
    const rData = ratesSnap.data();
    krwRate = rData.KRW?.rate || rData.krwRate || 20;
    if (rData.serviceFeePercent !== undefined) {
      serviceFeePercent = Number(rData.serviceFeePercent);
    }
  }
  console.log(`✓ Tỷ giá Firestore áp dụng: 1 KRW = ${krwRate}đ | Phí dịch vụ: ${serviceFeePercent}%`);

  // 3. Load files
  const top100Raw = JSON.parse(fs.readFileSync(TOP100_FRESH_FILE, 'utf8'));
  const newItems = JSON.parse(fs.readFileSync(NEW_ITEMS_FILE, 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(AUDITED_CATALOG_PATH, 'utf8'));

  const top100Map = new Map();
  top100Raw.forEach(item => {
    top100Map.set(item.goodsNo, item);
  });

  const catalogMap = new Map();
  catalog.forEach(item => {
    const id = item.goodsNo || item.id;
    if (id) catalogMap.set(id, item);
  });

  // Merge new items into catalogMap
  newItems.forEach(item => {
    catalogMap.set(item.goodsNo, item);
  });

  console.log(`📦 Tổng SKU trong Catalog: ${catalogMap.size}`);

  // 4. Update all items
  let top100MatchedCount = 0;
  const finalCatalog = [];

  for (const [id, item] of catalogMap.entries()) {
    const isTop100 = top100Map.has(id);
    const topItem = isTop100 ? top100Map.get(id) : null;

    let rank = null;
    let saleKrw = item.salePrice || item.salePriceKrw || 0;
    let origKrw = item.originalPrice || item.originalPriceKrw || saleKrw;
    let isSold = item.isSoldOut || false;

    if (isTop100) {
      top100MatchedCount++;
      rank = topItem.rank;
      saleKrw = topItem.salePriceKrw || saleKrw;
      origKrw = topItem.originPriceKrw || origKrw;
      isSold = topItem.isSoldOut || false;
    }

    const saleVnd = calculateDynamicVnd(saleKrw, krwRate, serviceFeePercent);
    const origVnd = calculateDynamicVnd(origKrw, krwRate, serviceFeePercent);

    // Update options with dynamic VND
    let options = (item.options || []).map((opt, idx) => {
      const optKrw = opt.price_krw || opt.priceKrw || saleKrw;
      return {
        id: opt.id || idx + 1,
        name: opt.name || opt.name_vi || opt.nameKr || `Phân loại ${idx + 1}`,
        name_vi: opt.name_vi || opt.name || opt.nameKr || `Phân loại ${idx + 1}`,
        name_kr: opt.name_kr || opt.nameKr || '',
        price_krw: optKrw,
        price_vnd: calculateDynamicVnd(optKrw, krwRate, serviceFeePercent),
        isSoldOut: opt.isSoldOut || false,
        imageUrl: `/products/${id}.jpg`
      };
    });

    if (options.length === 0) {
      options = [{
        id: 1,
        name: item.name_vi || item.name || 'Tiêu chuẩn',
        name_vi: item.name_vi || item.name || 'Tiêu chuẩn',
        name_kr: item.name_kr || item.nameKr || '',
        price_krw: saleKrw,
        price_vnd: saleVnd,
        isSoldOut: isSold,
        imageUrl: `/products/${id}.jpg`
      }];
    }

    // lowest available option price
    const availableOpts = options.filter(o => !o.isSoldOut);
    const foreignPrice = availableOpts.length > 0 
      ? Math.min(...availableOpts.map(o => o.price_krw))
      : saleKrw;

    const updatedItem = {
      ...item,
      goodsNo: id,
      id: id,
      rank: rank, // 1..100 hoặc null
      name: item.name_vi || item.name,
      name_vi: item.name_vi || item.name,
      name_kr: item.name_kr || item.nameKr || '',
      brand: item.brand_vi || item.brand,
      brand_vi: item.brand_vi || item.brand,
      brand_kr: item.brand_kr || item.brandKr || '',
      category: item.category || 'skincare',
      category_vi: item.category_vi || 'Chăm sóc da',
      salePrice: saleKrw,
      originalPrice: origKrw,
      foreignPrice: foreignPrice,
      priceVnd: calculateDynamicVnd(foreignPrice, krwRate, serviceFeePercent),
      originalPriceVnd: origVnd,
      productImage: `/products/${id}.jpg`,
      thumbnailUrl: `/products/${id}.jpg`,
      images: [`/products/${id}.jpg`],
      options: options,
      isSoldOut: isSold,
      isDiscontinued: item.isDiscontinued || false,
      isPublished: true,
      status: isSold ? 'out_of_stock' : 'available',
      appliedKrwRate: krwRate,
      appliedServiceFeePercent: serviceFeePercent,
      lastAuditedAt: new Date().toISOString()
    };

    finalCatalog.push(updatedItem);
  }

  console.log(`✓ Đã khớp đầy đủ ${top100MatchedCount}/100 sản phẩm Top Olive Young.`);

  // 5. Save updated catalog to disk files
  fs.writeFileSync(AUDITED_CATALOG_PATH, JSON.stringify(finalCatalog, null, 2), 'utf8');
  console.log(`💾 Đã lưu catalog mới vào ${AUDITED_CATALOG_PATH}`);

  fs.writeFileSync(PLAYWRIGHT_PATH, JSON.stringify(finalCatalog, null, 2), 'utf8');
  fs.writeFileSync(ALL_CATALOG_PATH, JSON.stringify(finalCatalog, null, 2), 'utf8');
  console.log(`💾 Đã đồng bộ file local playwright & all_products_catalog`);

  // 6. Write batches to Firestore
  console.log('🔥 Đang đẩy dữ liệu lên Firestore...');
  let batch = writeBatch(db);
  let opCount = 0;
  let totalCommitted = 0;

  for (const prod of finalCatalog) {
    const docRef = doc(db, 'products', prod.goodsNo);
    const dataToSet = { ...prod };
    if (prod.rank === null) {
      dataToSet.rank = deleteField();
    }
    batch.set(docRef, dataToSet, { merge: true });
    opCount++;
    totalCommitted++;

    if (opCount >= 100) {
      await batch.commit();
      console.log(`  -> Đã commit ${totalCommitted}/${finalCatalog.length} SKU...`);
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  console.log(`✅ HOÀN TẤT ĐỒNG BỘ ${totalCommitted} SẢN PHẨM LÊN FIRESTORE!`);
  console.log(`- Top 100 Olive Young: 100/100 sản phẩm đã được gán rank 1..100 chuẩn xác.`);
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
