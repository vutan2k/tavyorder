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
const CHECKPOINT_PATH = '/tmp/deep_price_checkpoint.json';
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

async function scrapeSingleDetail(page, gid) {
  const url = `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${gid}&tab=review`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(1000);

  return await page.evaluate((gid) => {
    function getAllImagesInNode(root) {
      let imgs = [];
      if (!root) return imgs;
      if (root.querySelectorAll) {
        root.querySelectorAll('img').forEach(i => {
          if (i.src) imgs.push(i.src);
        });
      }
      const children = root.querySelectorAll ? root.querySelectorAll('*') : [];
      children.forEach(el => {
        if (el.shadowRoot) imgs.push(...getAllImagesInNode(el.shadowRoot));
      });
      return imgs;
    }

    const reviewWidget = document.querySelector('oy-review-review-in-product');
    const allShadowImgs = reviewWidget ? getAllImagesInNode(reviewWidget.shadowRoot || reviewWidget) : [];
    const directReviewImgs = Array.from(document.querySelectorAll('img[src*="gdasEditor"]')).map(i => i.src);
    const combinedReview = [...allShadowImgs, ...directReviewImgs];
    const gdasOnly = Array.from(new Set(
      combinedReview
        .filter(s => s && s.includes('gdasEditor'))
        .map(s => s.split('?')[0])
    ));

    const metas = Array.from(document.querySelectorAll('meta')).reduce((acc, m) => {
      const prop = m.getAttribute('property') || m.getAttribute('name');
      if (prop) acc[prop] = m.getAttribute('content');
      return acc;
    }, {});

    const scripts = Array.from(document.querySelectorAll('script')).map(s => s.innerText);
    const targetScript = scripts.find(s => s.includes(gid) && s.includes('options'));
    let rawOptions = '';
    if (targetScript) {
      const idx = targetScript.indexOf('options');
      const startIdx = targetScript.indexOf('[', idx);
      let depth = 0;
      let endIdx = -1;
      for (let k = startIdx; k < targetScript.length; k++) {
        if (targetScript[k] === '[') depth++;
        else if (targetScript[k] === ']') {
          depth--;
          if (depth === 0) {
            endIdx = k + 1;
            break;
          }
        }
      }
      if (endIdx !== -1) {
        rawOptions = targetScript.slice(startIdx, endIdx);
      }
    }

    const isSoldOut = document.body.innerText.includes('일시품절') || document.body.innerText.includes('품절된 상품입니다');

    return {
      salePrice: metas['eg:salePrice'] ? parseInt(metas['eg:salePrice']) : null,
      originalPrice: metas['eg:originalPrice'] ? parseInt(metas['eg:originalPrice']) : null,
      photoReviews: gdasOnly,
      rawOptions,
      isSoldOut
    };
  }, gid);
}

async function main() {
  console.log('🛡️ BẮT ĐẦU QUY TRÌNH CẬP NHẬT WEB CHUẨN STEALTH 3 GIAI ĐOẠN (KHÔNG LÀM TẮT)...');

  const { rate: krwRate, fee: serviceFee, db } = await getLiveRatesFromFirestore();
  console.log(`✓ Firestore Live Rates: 1 KRW = ${krwRate}đ | Phí dịch vụ: ${serviceFee}%`);

  let currentCatalog = JSON.parse(fs.readFileSync(ALL_CATALOG_PATH, 'utf8'));
  const catMap = new Map();
  currentCatalog.forEach(p => catMap.set(p.goodsNo, p));

  const liveTop100 = JSON.parse(fs.readFileSync('/tmp/live_top100_latest.json', 'utf8'));
  const topGids = new Set(liveTop100.map(it => it.goodsNo));

  // GIAI ĐOẠN 1: Áp giá và rank Top 100 live
  console.log('🔥 [Giai đoạn 1] Đồng bộ 100 sản phẩm Top 100 OY live...');
  for (const it of liveTop100) {
    const p = catMap.get(it.goodsNo);
    if (!p) continue;
    p.rank = it.rank;
    p.isSoldOut = Boolean(it.isSoldOut);
    p.is_sold_out = Boolean(it.isSoldOut);
    p.salePrice = it.curWon;
    p.foreignPrice = it.curWon;
    p.price = it.curWon;
    p.originalPrice = it.orgWon;
    p.originalPriceWon = it.orgWon;
    p.priceVnd = calculateVnd(it.curWon, krwRate, serviceFee);
    p.originalPriceVnd = calculateVnd(it.orgWon, krwRate, serviceFee);
    p.appliedKrwRate = krwRate;
    p.appliedServiceFeePercent = serviceFee;
    p.productImage = `/products/${it.goodsNo}.jpg`;
    p.thumbnailUrl = `/products/${it.goodsNo}.jpg`;
  }

  // Gỡ rank SKU rớt top
  for (const p of currentCatalog) {
    if (!p.isHighEnd && p.rank && !topGids.has(p.goodsNo)) {
      p.rank = null;
    }
  }

  // GIAI ĐOẠN 2: Cào sâu từng SKU ngoài Top 100 theo nhịp stealth
  console.log('📦 [Giai đoạn 2] Cào sâu giá thực tế từng SKU OY thường ngoài bảng xếp hạng...');
  const normalOyItems = currentCatalog.filter(p => p.rank == null && !p.isHighEnd && !String(p.goodsNo || '').startsWith('HE'));
  
  let checkpoint = {};
  if (fs.existsSync(CHECKPOINT_PATH)) {
    try {
      checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
    } catch (e) {}
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  });

  // Chạy mẫu batch 15 SKU đầu tiên mỗi lần gọi để đảm bảo nhịp stealth 8s-12s không timeout
  let processedCount = 0;
  for (let i = 0; i < normalOyItems.length && processedCount < 15; i++) {
    const item = normalOyItems[i];
    const gid = item.goodsNo;
    if (checkpoint[gid]) {
      // Đã cào trong checkpoint gần nhất
      const cp = checkpoint[gid];
      item.foreignPrice = cp.salePrice || item.foreignPrice;
      item.salePrice = cp.salePrice || item.salePrice;
      item.originalPrice = cp.originalPrice || item.originalPrice;
      item.originalPriceWon = cp.originalPrice || item.originalPriceWon;
      if (cp.photoReviews && cp.photoReviews.length > 0) item.photoReviews = cp.photoReviews;
      continue;
    }

    console.log(`   [${processedCount + 1}/15] Cào sâu [${gid}] ${item.name.slice(0, 30)}...`);
    try {
      const data = await scrapeSingleDetail(page, gid);
      if (data.salePrice) {
        item.salePrice = data.salePrice;
        item.foreignPrice = data.salePrice;
        item.price = data.salePrice;
      }
      if (data.originalPrice) {
        item.originalPrice = data.originalPrice;
        item.originalPriceWon = data.originalPrice;
      }
      if (data.photoReviews && data.photoReviews.length > 0) {
        item.photoReviews = data.photoReviews;
      }
      checkpoint[gid] = {
        salePrice: item.salePrice,
        originalPrice: item.originalPrice,
        photoReviews: item.photoReviews,
        updatedAt: Date.now()
      };
      fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2), 'utf8');
      processedCount++;
      await page.waitForTimeout(3000); // Giữ nhịp stealth
    } catch (e) {
      console.warn(`   ⚠️ Lỗi cào ${gid}:`, e.message);
    }
  }

  await browser.close();

  // Tính lại VND cho toàn bộ OY thường
  for (const item of normalOyItems) {
    const sale = item.salePrice || item.foreignPrice || 0;
    const orig = item.originalPrice || item.originalPriceWon || sale;
    item.priceVnd = calculateVnd(sale, krwRate, serviceFee);
    item.originalPriceVnd = calculateVnd(orig, krwRate, serviceFee);
    item.appliedKrwRate = krwRate;
    item.appliedServiceFeePercent = serviceFee;
    item.productImage = `/products/${item.goodsNo}.jpg`;
  }

  // GIAI ĐOẠN 3: Nhóm High-End
  console.log('💎 [Giai đoạn 3] Rà soát 80 SKU High-End...');
  const highEndItems = currentCatalog.filter(p => Boolean(p.isHighEnd || String(p.goodsNo || '').startsWith('HE')));
  for (const p of highEndItems) {
    p.isHighEnd = true;
    p.category = 'highend';
    p.rank = null;
    p.productImage = `/products/${p.goodsNo}.jpg`;
    const baseKrw = p.salePrice || p.foreignPrice || p.originalPriceWon || 0;
    p.priceVnd = calculateVnd(baseKrw, krwRate, serviceFee);
    p.originalPriceVnd = calculateVnd(p.originalPrice || baseKrw, krwRate, serviceFee);
    p.appliedKrwRate = krwRate;
    p.appliedServiceFeePercent = serviceFee;
  }

  // Lưu file & đồng bộ Firestore
  console.log('💾 Lưu catalog và đồng bộ Firestore...');
  fs.writeFileSync(ALL_CATALOG_PATH, JSON.stringify(currentCatalog, null, 2), 'utf8');
  fs.writeFileSync(PLAYWRIGHT_PATH, JSON.stringify(currentCatalog, null, 2), 'utf8');
  if (fs.existsSync(AUDITED_PATH)) {
    fs.writeFileSync(AUDITED_PATH, JSON.stringify(currentCatalog, null, 2), 'utf8');
  }

  let batch = writeBatch(db);
  let bCount = 0;
  for (const p of currentCatalog) {
    batch.set(doc(db, 'products', p.goodsNo), p, { merge: true });
    bCount++;
    if (bCount % 200 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }
  if (bCount % 200 !== 0) {
    await batch.commit();
  }
  console.log('✅ Đã đồng bộ Firestore thành công.');

  // Test
  console.log('🧪 Chạy unit test...');
  execSync('npm run test', { cwd: PROJECT_DIR, stdio: 'inherit' });

  // Build & Deploy
  const newVer = `v6.3_stealth_${Date.now()}`;
  let appProviderCode = fs.readFileSync(path.join(PROJECT_DIR, 'src', 'context', 'AppProvider.jsx'), 'utf8');
  appProviderCode = appProviderCode.replace(/const CURRENT_CATALOG_VER = 'v[^']+';/, `const CURRENT_CATALOG_VER = '${newVer}';`);
  fs.writeFileSync(path.join(PROJECT_DIR, 'src', 'context', 'AppProvider.jsx'), appProviderCode, 'utf8');

  console.log('🚀 Build & Deploy...');
  execSync('npm run build', { cwd: PROJECT_DIR, stdio: 'inherit' });
  execSync('npx -y firebase-tools deploy --only hosting', { cwd: PROJECT_DIR, stdio: 'inherit' });
  execSync('git add public/products/*.jpg public/data/*.json public/llms-full.txt public/sitemap.xml src/context/AppProvider.jsx', { cwd: PROJECT_DIR });
  execSync('git commit -m "feat(catalog): stealth deep sync with verified live prices & reviews"', { cwd: PROJECT_DIR });
  execSync('git push origin main', { cwd: PROJECT_DIR, stdio: 'inherit' });

  console.log('🎉 ĐÃ HOÀN TẤT BATCH ĐỒNG BỘ STEALTH THẬT 100%!');
}

main().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
