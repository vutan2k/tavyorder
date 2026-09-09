import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  cleanKoreanTitle,
  extractBrandFromTitleOrDom,
  classifyCosmeticsCategory,
  cleanHighResImageUrl
} from '../src/services/oliveYoungScraperCore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const SOURCE_JSON_PATH = '/Users/tan/Desktop/oliveyoung_ranking/top100_oliveyoung_full.json';
const CSV_EXPORT_PATH = '/Users/tan/Downloads/TAVY_TOP100_GOOGLE_SHEETS.csv';
const PLAYWRIGHT_JSON_PATH = path.join(PROJECT_ROOT, 'public/data/playwright_scraped_products.json');

// Firebase Config
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

// Metadata định danh chuẩn tiếng Việt cho Top 5
const TOP_5_METADATA = {
  'A000000223414': {
    name: 'Mặt Nạ Giấy Dịu Da Mụn Mediheal Essential Sheet Mask 10+1 Miếng',
    webp: '/products/top_oliveyoung/top_1_메디힐/main_thumbnail.webp',
    details: [
      '/products/top_oliveyoung/top_1_메디힐/product_detail_1.webp',
      '/products/top_oliveyoung/top_1_메디힐/product_detail_2.webp'
    ],
    reviews: [
      '/products/top_oliveyoung/top_1_메디힐/review_user_1.webp',
      '/products/top_oliveyoung/top_1_메디힐/review_user_2.webp',
      '/products/top_oliveyoung/top_1_메디힐/review_user_3.webp',
      '/products/top_oliveyoung/top_1_메디힐/review_user_4.webp',
      '/products/top_oliveyoung/top_1_메디힐/review_user_5.webp'
    ]
  },
  'A000000262413': {
    name: 'Hộp Đôi Bông Dưỡng Da Mediheal Derma Toner Pad 100+100 Miếng (7 Loại)',
    webp: '/products/top_oliveyoung/top_2_메디힐/main_thumbnail.webp',
    details: [
      '/products/top_oliveyoung/top_2_메디힐/product_detail_1.webp',
      '/products/top_oliveyoung/top_2_메디힐/product_detail_2.webp'
    ],
    reviews: [
      '/products/top_oliveyoung/top_2_메디힐/review_user_1.webp',
      '/products/top_oliveyoung/top_2_메디힐/review_user_2.webp',
      '/products/top_oliveyoung/top_2_메디힐/review_user_3.webp',
      '/products/top_oliveyoung/top_2_메디힐/review_user_4.webp',
      '/products/top_oliveyoung/top_2_메디힐/review_user_5.webp'
    ]
  },
  'A000000219609': {
    name: 'Serum Giảm Mụn Mờ Thâm Fation Nosca9 Trouble Serum 50ml (+Lõi 40ml + Kem 10ml)',
    webp: '/products/top_oliveyoung/top_3_파티온/main_thumbnail.webp',
    details: [
      '/products/top_oliveyoung/top_3_파티온/product_detail_1.webp',
      '/products/top_oliveyoung/top_3_파티온/product_detail_2.webp'
    ],
    reviews: [
      '/products/top_oliveyoung/top_3_파티온/review_user_1.webp',
      '/products/top_oliveyoung/top_3_파티온/review_user_2.webp',
      '/products/top_oliveyoung/top_3_파티온/review_user_3.webp',
      '/products/top_oliveyoung/top_3_파티온/review_user_4.webp',
      '/products/top_oliveyoung/top_3_파티온/review_user_5.webp'
    ]
  },
  'A000000263562': {
    name: 'Bộ Đôi Serum Vitamin C Mờ Thâm Goodal Green Tangerine Vita C Serum 50+50ml',
    webp: '/products/top_oliveyoung/top_4_구달/main_thumbnail.webp',
    details: [
      '/products/top_oliveyoung/top_4_구달/product_detail_1.webp',
      '/products/top_oliveyoung/top_4_구달/product_detail_2.webp'
    ],
    reviews: [
      '/products/top_oliveyoung/top_4_구달/review_user_1.webp',
      '/products/top_oliveyoung/top_4_구달/review_user_2.webp',
      '/products/top_oliveyoung/top_4_구달/review_user_3.webp',
      '/products/top_oliveyoung/top_4_구달/review_user_4.webp',
      '/products/top_oliveyoung/top_4_구달/review_user_5.webp'
    ]
  },
  'A000000261423': {
    name: 'Tinh Chất Cấp Nước Hyaluronic Acid Wellage Real Hyaluronic Blue 100 Ampoule 100ml (+Lõi 60ml + Kem 30ml)',
    webp: '/products/top_oliveyoung/top_5_웰라쥬/main_thumbnail.webp',
    details: [
      '/products/top_oliveyoung/top_5_웰라쥬/product_detail_1.webp',
      '/products/top_oliveyoung/top_5_웰라쥬/product_detail_2.webp'
    ],
    reviews: [
      '/products/top_oliveyoung/top_5_웰라쥬/review_user_1.webp',
      '/products/top_oliveyoung/top_5_웰라쥬/review_user_2.webp',
      '/products/top_oliveyoung/top_5_웰라쥬/review_user_3.webp',
      '/products/top_oliveyoung/top_5_웰라쥬/review_user_4.webp',
      '/products/top_oliveyoung/top_5_웰라쥬/review_user_5.webp'
    ]
  }
};

async function main() {
  console.log('================================================================');
  console.log('🚀 BẮT ĐẦU NẠP 100 SẢN PHẨM TOP OLIVE YOUNG VÀO TAVY KOREA');
  console.log('================================================================');

  if (!fs.existsSync(SOURCE_JSON_PATH)) {
    console.error(`❌ Không tìm thấy file dữ liệu: ${SOURCE_JSON_PATH}`);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(SOURCE_JSON_PATH, 'utf8'));
  console.log(`📦 Đã đọc ${rawData.length} bản ghi thô từ file top100_oliveyoung_full.json`);

  const processedList = [];
  const seenGoodsNo = new Set();
  const krwRate = 19.5;
  const serviceFee = 5;

  for (const item of rawData) {
    const goodsNo = String(item.goods_no || item.id || '').trim();
    if (!goodsNo || seenGoodsNo.has(goodsNo)) continue;
    seenGoodsNo.add(goodsNo);

    const brandInfo = extractBrandFromTitleOrDom(item.name || '', item.brand || '');
    const catInfo = classifyCosmeticsCategory(item.name || '', item.benefits_vietnamese || '');
    const cleanKrTitle = cleanKoreanTitle(item.name || '');

    const salePrice = parseInt(String(item.sale_price_krw || '0').replace(/,/g, ''), 10) || 25000;
    const origPrice = parseInt(String(item.origin_price_krw || '0').replace(/,/g, ''), 10) || salePrice;

    let finalName = '';
    let finalImage = cleanHighResImageUrl(item.thumbnail_url || '');
    let detailImages = [];
    let reviewImages = [];

    if (TOP_5_METADATA[goodsNo]) {
      finalName = TOP_5_METADATA[goodsNo].name;
      finalImage = TOP_5_METADATA[goodsNo].webp;
      detailImages = TOP_5_METADATA[goodsNo].details || [];
      reviewImages = TOP_5_METADATA[goodsNo].reviews || [];
    } else {
      finalName = `${brandInfo.brand} - ${cleanKrTitle}`;
      const localThumb = (item.local_main_thumbnail && fs.existsSync(item.local_main_thumbnail))
        ? item.local_main_thumbnail.replace('/Users/tan/Desktop/oliveyoung_ranking', '/oliveyoung_ranking')
        : '';
      finalImage = localThumb || cleanHighResImageUrl(item.thumbnail_url || '');
      detailImages = (item.local_product_details || []).map(p =>
        p.replace('/Users/tan/Desktop/oliveyoung_ranking', '/oliveyoung_ranking')
      );
      reviewImages = (item.local_user_reviews || []).map(p =>
        p.replace('/Users/tan/Desktop/oliveyoung_ranking', '/oliveyoung_ranking')
      );
    }

    const description = item.benefits_vietnamese || `Sản phẩm ${brandInfo.brand} chính hãng nội địa Hàn Quốc, thuộc Top 100 Bán chạy nhất Olive Young. Mã SP: ${goodsNo}.`;

    // Tổng hợp danh sách ảnh sản phẩm (HD): ảnh đại diện + các góc chụp chi tiết
    const allProductImages = Array.from(new Set([finalImage, ...detailImages])).filter(Boolean);

    const category = item.category || catInfo.category;
    const subCategory = item.subCategory || catInfo.subCategory;
    const categoryLabel = item.categoryLabel || catInfo.categoryLabel;
    const categoryKr = item.categoryKr || catInfo.categoryKr;

    const productPayload = {
      goodsNo: goodsNo,
      rank: item.rank || 0,
      name: finalName,
      nameKr: item.name || '',
      brand: brandInfo.brand,
      brandKr: brandInfo.brandKr,
      category: category,
      subCategory: subCategory,
      categoryLabel: categoryLabel,
      categoryKr: categoryKr,
      foreignPrice: salePrice,
      price: salePrice,
      originalPrice: origPrice,
      productImage: finalImage,
      images: allProductImages,
      photoReviews: reviewImages,
      description: description,
      origin: 'Store Olive Young Seoul, Hàn Quốc',
      rating: 4.9,
      reviewsCount: reviewImages.length > 0 ? reviewImages.length : 5,
      productUrl: item.product_url || `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${goodsNo}`,
      inStock: true,
      status: 'pending',
      isPublished: false,
      source: 'OLIVEYOUNG_RANKING_TOP100',
      scrapedAt: new Date().toISOString()
    };

    processedList.push(productPayload);
    if (processedList.length === 100) break;
  }

  console.log(`✅ Đã chuẩn hóa thành công ${processedList.length} sản phẩm duy nhất.`);

  // 1. Xuất file CSV định dạng chuẩn Google Sheets
  console.log('📊 Đang xuất file Google Sheets CSV...');
  const csvHeaders = ['Mã SP (SKU)', 'Tên Sản Phẩm', 'Tên Tiếng Hàn', 'Thương Hiệu', 'Ngành Hàng', 'Phân Loại Chi Tiết', 'Giá Won (₩)', 'Giá Ước Tính VNĐ', 'Link Ảnh Đại Diện', 'Ảnh Chi Tiết', 'Ảnh Review Khách Hàng', 'Link Sản Phẩm', 'Mô Tả / Công Dụng'];
  const csvRows = processedList.map(p => {
    const vnd = Math.round(p.foreignPrice * krwRate * (1 + serviceFee / 100));
    return [
      `"${p.goodsNo}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.nameKr.replace(/"/g, '""')}"`,
      `"${p.brand}"`,
      `"${p.categoryLabel}"`,
      `"${p.subCategory}"`,
      p.foreignPrice,
      vnd,
      `"${p.productImage}"`,
      `"${(p.images || []).join(';')}"`,
      `"${(p.photoReviews || []).join(';')}"`,
      `"${p.productUrl}"`,
      `"${p.description.replace(/"/g, '""')}"`
    ];
  });

  const csvContent = '\uFEFF' + [csvHeaders.join(','), ...csvRows.map(r => r.join(','))].join('\n');
  fs.writeFileSync(CSV_EXPORT_PATH, csvContent, 'utf-8');
  console.log(`📁 Đã tạo file Google Sheets CSV tại: ${CSV_EXPORT_PATH}`);

  // 2. Cập nhật vào public/data/playwright_scraped_products.json để offline fallback
  fs.writeFileSync(PLAYWRIGHT_JSON_PATH, JSON.stringify(processedList, null, 2), 'utf-8');
  console.log(`💾 Đã cập nhật ${processedList.length} sản phẩm vào ${PLAYWRIGHT_JSON_PATH}`);

  // 3. Đồng bộ lên Firestore collection 'pending_products'
  console.log('🔐 Đang xác thực Firebase Auth Admin...');
  const adminEmail = process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn';
  const adminPass = process.env.VITE_ADMIN_PASSWORD || 'admin123';
  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  console.log('✅ Xác thực Admin thành công!');

  console.log(`📤 Đang nạp ${processedList.length} sản phẩm vào Firestore "pending_products"...`);

  // Ghi Firestore theo từng chunk 50 items (hạn mức batch tối đa là 500)
  const CHUNK_SIZE = 50;
  for (let i = 0; i < processedList.length; i += CHUNK_SIZE) {
    const chunk = processedList.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const prod of chunk) {
      const docRef = doc(db, 'pending_products', prod.goodsNo);
      batch.set(docRef, prod, { merge: true });
    }

    await batch.commit();
    console.log(`   ✨ Đã ghi thành công đợt ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} sản phẩm)`);
  }

  console.log('================================================================');
  console.log(`🎉 HOÀN TẤT: ĐÃ NẠP ĐỦ 100 SẢN PHẨM VÀO KHO HÀNG CHỜ DUYỆT!`);
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Lỗi thực thi:', err);
  process.exit(1);
});
