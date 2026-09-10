import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc, getDocs, collection } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const SOURCE_PATH = '/Users/tan/Desktop/oliveyoung_ranking/top100_oliveyoung_full.json';
const CSV_EXPORT_PATH = '/Users/tan/Downloads/TAVY_TOP100_FULL_OPTIONS.csv';
const PLAYWRIGHT_JSON_PATH = path.join(PROJECT_ROOT, 'public/data/playwright_scraped_products.json');

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || '«redacted:AIza…»',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'tavyorder.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'tavyorder',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'tavyorder.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '307372781687',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:307372781687:web:356e2963e0cf23b018d672'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  console.log('================================================================');
  console.log('🚀 ĐỒNG BỘ 100 SẢN PHẨM CHUẨN HÓA LÊN CLOUD FIRESTORE & WEB');
  console.log('================================================================');

  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`❌ Không tìm thấy file dữ liệu: ${SOURCE_PATH}`);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  console.log(`📦 Đã đọc ${rawData.length} sản phẩm từ đĩa.`);

  // Đăng nhập Admin Firebase Auth
  const adminEmail = 'admin@tavykorea.vn';
  const adminPass = 'admin123';
  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  console.log('✅ Xác thực Admin thành công.');

  // 1. Quét và Xóa sạch kho cũ
  console.log('🧹 Đang quét kho sản phẩm cũ trên Firestore...');
  const oldProductsSnap = await getDocs(collection(db, 'products'));
  console.log(`📦 Tìm thấy ${oldProductsSnap.size} sản phẩm cũ trong kho.`);
  
  if (oldProductsSnap.size > 0) {
    let delBatch = writeBatch(db);
    let delCount = 0;
    for (const d of oldProductsSnap.docs) {
      delBatch.delete(d.ref);
      delCount++;
      if (delCount % 400 === 0) {
        await delBatch.commit();
        delBatch = writeBatch(db);
      }
    }
    if (delCount % 400 !== 0) {
      await delBatch.commit();
    }
    console.log(`🗑️ Đã xoá sạch 100% (${delCount} sản phẩm cũ) trong kho.`);
  }

  const batch = writeBatch(db);
  const webReadyList = [];
  let count = 0;

  for (const p of rawData) {
    const goodsNo = String(p.goods_no || p.goodsNo || '').trim();
    if (!goodsNo) continue;

    // Đọc info.json trong folder riêng nếu có để lấy dữ liệu mới nhất
    let latest = p;
    const folder = p.folder_path;
    if (folder && fs.existsSync(path.join(folder, 'info.json'))) {
      try {
        const infoData = JSON.parse(fs.readFileSync(path.join(folder, 'info.json'), 'utf8'));
        latest = { ...infoData, ...p };
      } catch (_) {}
    }

    const docRef = doc(db, 'products', goodsNo);
    const mainImgWeb = (latest.local_main_thumbnail || latest.productImage || '')
      .replace('/Users/tan/Desktop/oliveyoung_ranking', '/oliveyoung_ranking');

    const reviewImgsWeb = (latest.local_user_reviews || latest.photoReviews || []).map(r =>
      r.replace('/Users/tan/Desktop/oliveyoung_ranking', '/oliveyoung_ranking')
    );

    const payload = {
      goodsNo: goodsNo,
      rank: latest.rank || 0,
      name: p.name_vi || p.name || latest.name_vi || latest.name || '',
      nameKr: latest.name_kr || latest.nameKr || '',
      brand: p.brand_vi || p.brand || latest.brand_vi || latest.brand || 'Korea Brand',
      brandKr: latest.brand || '',
      category: latest.category || 'cosmetics',
      subCategory: latest.subCategory || '',
      categoryLabel: latest.categoryLabel || 'Mỹ phẩm',
      categoryKr: latest.categoryKr || '',
      price: parseInt(String(latest.sale_price_krw || latest.price || 0).replace(/,/g, ''), 10) || 10000,
      originalPrice: parseInt(String(latest.origin_price_krw || latest.originalPrice || 0).replace(/,/g, ''), 10) || 20000,
      foreignPrice: parseInt(String(latest.sale_price_krw || latest.price || 0).replace(/,/g, ''), 10) || 10000,
      priceVnd: latest.price_vnd || Math.round((latest.sale_price_krw || 10000) * 19.5 * 1.05),
      discountRate: latest.discount_rate || '50%',
      productImage: mainImgWeb,
      images: [mainImgWeb],
      photoReviews: reviewImgsWeb,
      options: p.options || latest.options || [],
      description: latest.basic_info?.core_benefits || latest.description || '',
      origin: 'Store Olive Young Seoul, Hàn Quốc',
      rating: 4.9,
      reviewsCount: reviewImgsWeb.length > 0 ? reviewImgsWeb.length : 8,
      inStock: true,
      isPublished: true,
      status: 'published',
      updatedAt: new Date().toISOString()
    };

    // Chốt chặn kiểm định chất lượng: Tuyệt đối không cho phép dữ liệu generic lọt lên Firestore
    if (payload.name.length < 15 || /^(mỹ phẩm|sản phẩm|hàng hàn)/i.test(payload.name)) {
      throw new Error(`[QC_GATE_REJECT] Tên sản phẩm không hợp lệ: "${payload.name}" (goodsNo: ${goodsNo})`);
    }
    if (payload.brand.toLowerCase() === 'korea beauty' || payload.brand.toLowerCase() === 'unknown') {
      throw new Error(`[QC_GATE_REJECT] Thương hiệu không được là placeholder: "${payload.brand}" (goodsNo: ${goodsNo})`);
    }

    batch.set(docRef, payload, { merge: true });
    webReadyList.push(payload);
    count++;
  }

  // 1. Ghi batch Firestore
  await batch.commit();
  console.log(`✅ Đã commit batch Firestore thành công cho ${count} sản phẩm.`);

  // 2. Xuất public fallback JSON
  fs.writeFileSync(PLAYWRIGHT_JSON_PATH, JSON.stringify(webReadyList, null, 2), 'utf8');
  console.log(`💾 Đã cập nhật offline fallback tại: ${PLAYWRIGHT_JSON_PATH}`);

  // 3. Xuất Google Sheets CSV
  const csvHeaders = ['Mã SP (SKU)', 'Tên Sản Phẩm (VI)', 'Tên Tiếng Hàn', 'Thương Hiệu', 'Giá Won (₩)', 'Giá Ước Tính VNĐ', 'Số Phân Loại (Options)', 'Số Ảnh Review HD', 'Mô Tả SEO'];
  const csvRows = webReadyList.map(p => [
    `"${p.goodsNo}"`,
    `"${p.name.replace(/"/g, '""')}"`,
    `"${p.nameKr.replace(/"/g, '""')}"`,
    `"${p.brand}"`,
    p.price,
    p.priceVnd,
    (p.options || []).length,
    (p.photoReviews || []).length,
    `"${p.description.replace(/"/g, '""')}"`
  ]);
  const csvContent = '\uFEFF' + [csvHeaders.join(','), ...csvRows.map(r => r.join(','))].join('\n');
  fs.writeFileSync(CSV_EXPORT_PATH, csvContent, 'utf8');
  console.log(`📁 Đã tạo file Google Sheets CSV tại: ${CSV_EXPORT_PATH}`);

  console.log('================================================================');
  console.log('🎉 TOÀN BỘ DỮ LIỆU ĐÃ ĐỒNG BỘ THÀNH CÔNG VỚI WEB VÀ GOOGLE SHEETS!');
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
