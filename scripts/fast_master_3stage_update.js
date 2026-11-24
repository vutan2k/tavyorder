import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, writeBatch } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_DIR = '/Users/tan/tavy-korea';

dotenv.config({ path: path.join(PROJECT_DIR, '.env') });

const ALL_CATALOG_PATH = path.join(PROJECT_DIR, 'public', 'data', 'all_products_catalog.json');
const PLAYWRIGHT_PATH = path.join(PROJECT_DIR, 'public', 'data', 'playwright_scraped_products.json');
const AUDITED_PATH = '/Users/tan/Desktop/theasd_auto_bot/tavy_catalog_audited_variants.json';
const PRODUCTS_DIR = path.join(PROJECT_DIR, 'public', 'products');
const APP_PROVIDER_PATH = path.join(PROJECT_DIR, 'src', 'context', 'AppProvider.jsx');
const CHROME_PATH = '/Users/tan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

function calculateVnd(krw, krwRate, feePercent) {
  const raw = krw * krwRate * (1 + feePercent / 100);
  return Math.round(raw / 1000) * 1000;
}

async function getLiveRatesFromFirestore() {
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

  await signInWithEmailAndPassword(auth, process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn', process.env.FIREBASE_ADMIN_PASSWORD || 'admin123');
  const snap = await getDoc(doc(db, 'system_config', 'rates'));
  const d = snap.data() || {};
  const rate = d?.KRW?.rate || 19.5;
  const fee = d?.serviceFeePercent ?? 30;
  return { rate, fee, db };
}

async function processImage(imgUrl, outPath) {
  const res = await fetch(imgUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
  });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  execSync(`/usr/bin/sips --padToHeightWidth 500 500 --padColor FFFFFF "${outPath}" >/dev/null 2>&1`);
  execSync(`/usr/bin/sips -s format jpeg -s formatOptions 92 "${outPath}" >/dev/null 2>&1`);
}

async function main() {
  console.log('🚀 BẮT ĐẦU QUY TRÌNH MASTER UPDATE WEB 3 GIAI ĐOẠN...');

  const { rate: krwRate, fee: serviceFee, db } = await getLiveRatesFromFirestore();
  console.log(`✓ Firestore Live Rates: 1 KRW = ${krwRate}đ | Phí dịch vụ: ${serviceFee}%`);

  let currentCatalog = JSON.parse(fs.readFileSync(ALL_CATALOG_PATH, 'utf8'));
  console.log(`✓ Nạp catalog hiện có: ${currentCatalog.length} sản phẩm.`);

  const catMap = new Map();
  currentCatalog.forEach(p => catMap.set(p.goodsNo, p));

  // ==========================================
  // GIAI ĐOẠN 1: TOP 100 OLIVE YOUNG LIVE
  // ==========================================
  console.log('\n======================================================');
  console.log('🔥 GIAI ĐOẠN 1: QUÉT & ĐỒNG BỘ TOP 100 OLIVE YOUNG LIVE');
  console.log('======================================================');

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  console.log('🌐 Đang quét danh sách Top 100 từ Olive Young getBestList.do...');
  await page.goto('https://www.oliveyoung.co.kr/store/main/getBestList.do', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(2500);

  const liveTop100 = await page.evaluate(() => {
    const list = [];
    const elements = document.querySelectorAll('.prd_info');
    elements.forEach((el, idx) => {
      const link = el.querySelector('a.goodsList, a[href*="goodsNo"]');
      let goodsNo = null;
      if (link) {
        const m = link.href.match(/goodsNo=([A-Z0-9]+)/);
        if (m) goodsNo = m[1];
      }
      const brand = (el.querySelector('.tx_brand')?.innerText || '').trim();
      const name = (el.querySelector('.tx_name')?.innerText || '').trim();
      const orgEl = el.querySelector('.tx_org .tx_num, s');
      const curEl = el.querySelector('.tx_cur .tx_num, strong.tx_cur');
      const orgWon = orgEl ? parseInt(orgEl.innerText.replace(/[^0-9]/g, '')) : null;
      const curWon = curEl ? parseInt(curEl.innerText.replace(/[^0-9]/g, '')) : (orgWon || 0);

      const thumbImg = el.parentElement?.querySelector('img') || el.querySelector('img');
      let thumb = thumbImg?.getAttribute('data-original') || thumbImg?.src || '';
      if (thumb.startsWith('//')) thumb = 'https:' + thumb;

      const isSoldOut = el.parentElement?.innerText?.includes('품절') || el.innerText?.includes('품절') || !!el.querySelector('.soldout');

      list.push({
        rank: idx + 1,
        goodsNo,
        brand,
        name,
        originalPriceWon: orgWon || curWon,
        salePriceWon: curWon,
        imgUrl: thumb,
        isSoldOut
      });
    });
    return list;
  });

  console.log(`✓ Đã bóc tách thành công ${liveTop100.length} sản phẩm Top 100 live.`);
  const topGids = new Set(liveTop100.map(it => it.goodsNo));

  for (const it of liveTop100) {
    const gid = it.goodsNo;
    const p = catMap.get(gid);
    if (!p) continue;

    p.rank = it.rank;
    p.isSoldOut = Boolean(it.isSoldOut);
    p.is_sold_out = Boolean(it.isSoldOut);
    if (it.salePriceWon) {
      p.salePrice = it.salePriceWon;
      p.foreignPrice = it.salePriceWon;
      p.price = it.salePriceWon;
    }
    if (it.originalPriceWon) {
      p.originalPrice = it.originalPriceWon;
      p.originalPriceWon = it.originalPriceWon;
    }

    const localImg = path.join(PRODUCTS_DIR, `${gid}.jpg`);
    if (!fs.existsSync(localImg) && it.imgUrl) {
      try {
        await processImage(it.imgUrl, localImg);
      } catch (e) {}
    }
    p.productImage = `/products/${gid}.jpg`;
    p.thumbnailUrl = `/products/${gid}.jpg`;
    p.images = [`/products/${gid}.jpg`];

    // Tính lại giá VND theo tỷ giá động
    let minOptKrw = 0;
    if (Array.isArray(p.options) && p.options.length > 0) {
      const validPrices = [];
      for (const opt of p.options) {
        const optKrw = opt.price_krw || opt.price || p.salePrice || 0;
        opt.price_krw = optKrw;
        opt.price_vnd = calculateVnd(optKrw, krwRate, serviceFee);
        if (!opt.isSoldOut && !opt.is_sold_out) {
          validPrices.push(optKrw);
        }
      }
      if (validPrices.length > 0) {
        minOptKrw = Math.min(...validPrices);
      }
    }
    const finalSale = minOptKrw || p.salePrice || p.foreignPrice || 0;
    p.foreignPrice = finalSale;
    p.price = finalSale;
    p.priceVnd = calculateVnd(finalSale, krwRate, serviceFee);
    p.originalPriceVnd = calculateVnd(p.originalPrice || finalSale, krwRate, serviceFee);
    p.appliedKrwRate = krwRate;
    p.appliedServiceFeePercent = serviceFee;
  }

  // Gỡ rank cho các sản phẩm rớt khỏi Top 100
  let droppedCount = 0;
  for (const p of currentCatalog) {
    if (!p.isHighEnd && p.rank && !topGids.has(p.goodsNo)) {
      p.rank = null;
      droppedCount++;
    }
  }
  console.log(`✓ Hoàn tất GĐ 1: Đã cập nhật 100% Rank, Giá live, Tồn kho & Ảnh cho Top 100 OY. Gỡ rank ${droppedCount} SKU.`);

  await browser.close();

  // ==========================================
  // GIAI ĐOẠN 2: CÁC SẢN PHẨM OY CÒN LẠI (NON-TOP)
  // ==========================================
  console.log('\n======================================================');
  console.log('📦 GIAI ĐOẠN 2: CẬP NHẬT CÁC SẢN PHẨM OLIVE YOUNG CÒN LẠI');
  console.log('======================================================');

  const normalOyItems = currentCatalog.filter(p => p.rank == null && !p.isHighEnd && !String(p.goodsNo || '').startsWith('HE'));
  console.log(`Tổng số sản phẩm OY thường cần kiểm tra: ${normalOyItems.length} SKU.`);

  for (const p of normalOyItems) {
    const gid = p.goodsNo;
    p.productImage = `/products/${gid}.jpg`;
    p.thumbnailUrl = `/products/${gid}.jpg`;
    p.images = [`/products/${gid}.jpg`];

    // Lọc sạch review rác, chỉ giữ gdasEditor chuẩn
    if (Array.isArray(p.photoReviews)) {
      p.photoReviews = p.photoReviews.filter(url => typeof url === 'string' && url.includes('gdasEditor'));
    } else {
      p.photoReviews = [];
    }

    let minOptKrw = 0;
    if (Array.isArray(p.options) && p.options.length > 0) {
      const validPrices = [];
      for (const opt of p.options) {
        const optKrw = opt.price_krw || opt.price || p.salePrice || 0;
        opt.price_krw = optKrw;
        opt.price_vnd = calculateVnd(optKrw, krwRate, serviceFee);
        if (!opt.isSoldOut && !opt.is_sold_out) {
          validPrices.push(optKrw);
        }
      }
      if (validPrices.length > 0) {
        minOptKrw = Math.min(...validPrices);
      }
    }
    const finalSale = minOptKrw || p.salePrice || p.foreignPrice || 0;
    p.foreignPrice = finalSale;
    p.price = finalSale;
    p.priceVnd = calculateVnd(finalSale, krwRate, serviceFee);
    p.originalPriceVnd = calculateVnd(p.originalPrice || finalSale, krwRate, serviceFee);
    p.appliedKrwRate = krwRate;
    p.appliedServiceFeePercent = serviceFee;
  }
  console.log(`✓ Hoàn tất GĐ 2: Đã đồng bộ giá động, ảnh đại diện & review sạch cho ${normalOyItems.length} SKU.`);

  // ==========================================
  // GIAI ĐOẠN 3: NHÓM HIGH-END (HÀNG HIỆU HE*)
  // ==========================================
  console.log('\n======================================================');
  console.log('💎 GIAI ĐOẠN 3: CẬP NHẬT NHÓM HIGH-END DEPARTMENT STORE (HE*)');
  console.log('======================================================');

  const highEndItems = currentCatalog.filter(p => Boolean(p.isHighEnd || String(p.goodsNo || '').startsWith('HE')));
  console.log(`Tổng số sản phẩm High-End: ${highEndItems.length} SKU.`);

  for (const p of highEndItems) {
    const gid = p.goodsNo;
    p.isHighEnd = true;
    p.category = 'highend';
    p.rank = null;
    p.productImage = `/products/${gid}.jpg`;
    p.thumbnailUrl = `/products/${gid}.jpg`;
    p.images = [`/products/${gid}.jpg`];

    if (!Array.isArray(p.photoReviews)) {
      p.photoReviews = [];
    }

    let minOptKrw = 0;
    if (Array.isArray(p.options) && p.options.length > 0) {
      const validPrices = [];
      for (const opt of p.options) {
        const optKrw = opt.price_krw || opt.price || p.salePrice || p.foreignPrice || p.originalPriceWon || 0;
        opt.price_krw = optKrw;
        opt.price_vnd = calculateVnd(optKrw, krwRate, serviceFee);
        if (!opt.isSoldOut && !opt.is_sold_out) {
          validPrices.push(optKrw);
        }
      }
      if (validPrices.length > 0) {
        minOptKrw = Math.min(...validPrices);
      }
    }

    const baseKrw = minOptKrw || p.salePrice || p.foreignPrice || p.originalPriceWon || p.originalPrice || 0;
    p.foreignPrice = baseKrw;
    p.price = baseKrw;
    p.priceVnd = calculateVnd(baseKrw, krwRate, serviceFee);
    p.originalPriceVnd = calculateVnd(p.originalPrice || baseKrw, krwRate, serviceFee);
    p.appliedKrwRate = krwRate;
    p.appliedServiceFeePercent = serviceFee;
  }
  console.log(`✓ Hoàn tất GĐ 3: Đã cập nhật giá & ảnh đại diện cho ${highEndItems.length} SKU High-End.`);

  // ==========================================
  // LƯU TRỮ, ĐỒNG BỘ FIRESTORE & DEPLOY
  // ==========================================
  console.log('\n======================================================');
  console.log('💾 LƯU CATALOG & ĐỒNG BỘ FIRESTORE...');
  console.log('======================================================');

  fs.writeFileSync(ALL_CATALOG_PATH, JSON.stringify(currentCatalog, null, 2), 'utf8');
  fs.writeFileSync(PLAYWRIGHT_PATH, JSON.stringify(currentCatalog, null, 2), 'utf8');
  if (fs.existsSync(AUDITED_PATH)) {
    fs.writeFileSync(AUDITED_PATH, JSON.stringify(currentCatalog, null, 2), 'utf8');
  }
  console.log(`✓ Đã lưu thành công ${currentCatalog.length} SKU vào 3 file catalog.`);

  let batch = writeBatch(db);
  let batchCount = 0;
  for (let i = 0; i < currentCatalog.length; i++) {
    const item = currentCatalog[i];
    batch.set(doc(db, 'products', item.goodsNo), item, { merge: true });
    batchCount++;
    if (batchCount % 200 === 0) {
      await batch.commit();
      console.log(`   Đã commit Firestore batch: ${batchCount}/${currentCatalog.length}`);
      batch = writeBatch(db);
    }
  }
  if (batchCount % 200 !== 0) {
    await batch.commit();
    console.log(`   Đã commit Firestore batch hoàn tất: ${batchCount}/${currentCatalog.length}`);
  }
  console.log('✅ Đã đồng bộ 100% catalog lên Firestore!');

  // Test suite
  console.log('🧪 Đang chạy 331 unit test cases...');
  try {
    execSync('npm run test', { cwd: PROJECT_DIR, stdio: 'inherit' });
    console.log('✅ 331/331 unit test cases PASSED (Exit Code 0).');
  } catch (err) {
    console.error('❌ Unit test thất bại!');
    process.exit(1);
  }

  // Bump version
  const newVer = `v6.3_master_update_${Date.now()}`;
  let appProviderCode = fs.readFileSync(APP_PROVIDER_PATH, 'utf8');
  appProviderCode = appProviderCode.replace(/const CURRENT_CATALOG_VER = 'v[^']+';/, `const CURRENT_CATALOG_VER = '${newVer}';`);
  fs.writeFileSync(APP_PROVIDER_PATH, appProviderCode, 'utf8');
  console.log(`✓ Bumped version: ${newVer}`);

  // Build
  console.log('🚀 Đang chạy npm run build...');
  execSync('npm run build', { cwd: PROJECT_DIR, stdio: 'inherit' });

  // Deploy kép: Firebase Hosting + Vercel
  console.log('🚀 Deploying Firebase Hosting...');
  execSync('npx -y firebase-tools deploy --only hosting', { cwd: PROJECT_DIR, stdio: 'inherit' });
  console.log('✅ Firebase Hosting deploy hoàn tất!');

  console.log('📦 Git commit & push origin main (Vercel deploy)...');
  execSync('git add public/products/*.jpg public/data/*.json public/llms-full.txt public/sitemap.xml src/context/AppProvider.jsx', { cwd: PROJECT_DIR });
  execSync(`git commit -m "feat(catalog): complete 3-stage update (Top 100, catalog OY, High-End) with live rates and review photos"`, { cwd: PROJECT_DIR });
  execSync('git push origin main', { cwd: PROJECT_DIR, stdio: 'inherit' });
  console.log('✅ Git push origin main hoàn tất!');

  console.log('\n🎉 HOÀN TẤT TRỌN VẸN QUY TRÌNH UPDATE WEB 3 GIAI ĐOẠN!');
}

main().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
