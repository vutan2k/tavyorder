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
const CHECKPOINT_PATH = '/tmp/stealth_crawler_checkpoint.json';
const CHROME_PATH = '/Users/tan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const TELEGRAM_BOT_TOKEN = process.env.VITE_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.VITE_TELEGRAM_CHAT_ID || '8575761420';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateVnd(krw, krwRate, feePercent) {
  const raw = krw * krwRate * (1 + feePercent / 100);
  return Math.round(raw / 1000) * 1000;
}

async function notifyTelegram(msg) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: msg,
        parse_mode: 'HTML'
      })
    });
  } catch (err) {
    console.error('Lỗi gửi Telegram:', err.message);
  }
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
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  const status = res ? res.status() : 200;

  if (status === 403 || status === 429) {
    throw new Error(`Bị chặn WAF/Bot HTTP ${status} tại SKU ${gid}`);
  }

  // Nhịp stealth: cuộn từ từ mô phỏng người đọc
  await sleep(2500);
  await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'smooth' }));
  await sleep(2500);
  await page.evaluate(() => window.scrollTo({ top: 2200, behavior: 'smooth' }));
  await sleep(3000);

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

    // 1. Bóc ảnh review từ Shadow DOM
    const reviewWidget = document.querySelector('oy-review-review-in-product');
    const allShadowImgs = reviewWidget ? getAllImagesInNode(reviewWidget.shadowRoot || reviewWidget) : [];
    const directReviewImgs = Array.from(document.querySelectorAll('img[src*="gdasEditor"]')).map(i => i.src);
    const combinedReview = [...allShadowImgs, ...directReviewImgs];
    const gdasOnly = Array.from(new Set(
      combinedReview
        .filter(s => s && s.includes('gdasEditor'))
        .map(s => s.split('?')[0])
    ));

    // 2. Metas
    const metas = Array.from(document.querySelectorAll('meta')).reduce((acc, m) => {
      const prop = m.getAttribute('property') || m.getAttribute('name');
      if (prop) acc[prop] = m.getAttribute('content');
      return acc;
    }, {});

    const bodyText = document.body.innerText || '';
    const isSoldOut = bodyText.includes('일시품절') || bodyText.includes('품절된 상품입니다') || !!document.querySelector('.btn_soldout');

    return {
      salePrice: metas['eg:salePrice'] ? parseInt(metas['eg:salePrice']) : null,
      originalPrice: metas['eg:originalPrice'] ? parseInt(metas['eg:originalPrice']) : null,
      photoReviews: gdasOnly,
      isSoldOut
    };
  }, gid);
}

async function runCronTick() {
  console.log(`[${new Date().toISOString()}] Bắt đầu tick quét giá & kho 24/7 (nhịp stealth 8s-12s)...`);

  const { rate: krwRate, fee: serviceFee, db } = await getLiveRatesFromFirestore();
  let currentCatalog = JSON.parse(fs.readFileSync(ALL_CATALOG_PATH, 'utf8'));
  const catMap = new Map();
  currentCatalog.forEach(p => catMap.set(p.goodsNo, p));

  let checkpoint = { nextIdx: 0, lastScraped: {} };
  if (fs.existsSync(CHECKPOINT_PATH)) {
    try {
      checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
    } catch (e) {}
  }

  let browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  let page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  });

  const changedSkus = [];
  const normalOyItems = currentCatalog.filter(p => !p.isHighEnd && !String(p.goodsNo || '').startsWith('HE'));
  const BATCH_SIZE = 12; // 12 SKU * 10s = ~2 phút/tick, cực kỳ an toàn
  const startIdx = checkpoint.nextIdx % normalOyItems.length;
  const targetBatch = normalOyItems.slice(startIdx, startIdx + BATCH_SIZE);

  console.log(`Quét batch ${targetBatch.length} SKU (từ chỉ mục ${startIdx}/${normalOyItems.length})...`);

  for (const item of targetBatch) {
    const gid = item.goodsNo;
    try {
      let data;
      try {
        data = await scrapeSingleDetail(page, gid);
      } catch (firstErr) {
        // Nếu dính lỗi crash/đóng page hoặc browser, hồi sinh page và thử lại 1 lần
        if (firstErr.message && (firstErr.message.includes('Target page') || firstErr.message.includes('closed') || firstErr.message.includes('Target closed'))) {
          console.warn(`⚠️ Page/Browser bị crash tại SKU ${gid}, đang khởi tạo lại page...`);
          try { await page.close().catch(() => {}); } catch(e){}
          try {
            page = await browser.newPage({
              userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
            });
          } catch(e) {
            try { await browser.close().catch(() => {}); } catch(eb){}
            browser = await chromium.launch({
              headless: true,
              executablePath: CHROME_PATH,
              args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            page = await browser.newPage({
              userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
            });
          }
          await sleep(2000);
          data = await scrapeSingleDetail(page, gid);
        } else {
          throw firstErr;
        }
      }
      let changed = false;

      if (data.salePrice && data.salePrice !== item.foreignPrice) {
        console.log(`⚡ [GIÁ ĐỔI] [${gid}] ${item.foreignPrice} -> ${data.salePrice} KRW`);
        item.foreignPrice = data.salePrice;
        item.salePrice = data.salePrice;
        item.price = data.salePrice;
        changed = true;
      }

      if (data.originalPrice && data.originalPrice !== item.originalPriceWon) {
        item.originalPrice = data.originalPrice;
        item.originalPriceWon = data.originalPrice;
        changed = true;
      }

      if (data.isSoldOut !== item.isSoldOut) {
        console.log(`⚠️ [TỒN KHO ĐỔI] [${gid}] Hết hàng: ${data.isSoldOut}`);
        item.isSoldOut = data.isSoldOut;
        item.is_sold_out = data.isSoldOut;
        changed = true;
      }

      if (data.photoReviews && data.photoReviews.length > (item.photoReviews || []).length) {
        item.photoReviews = data.photoReviews;
        changed = true;
      }

      if (changed) {
        changedSkus.push(gid);
        item.priceVnd = calculateVnd(item.foreignPrice, krwRate, serviceFee);
        item.originalPriceVnd = calculateVnd(item.originalPriceWon, krwRate, serviceFee);
      }

      await sleep(2000); // Khoảng nghỉ giữa các SKU
    } catch (err) {
      console.error(`❌ Lỗi tại SKU ${gid}:`, err.message);
      // Chỉ báo động Telegram khi thực sự bị chặn WAF/Bot HTTP 403, 429
      if (err.message && (err.message.includes('403') || err.message.includes('429') || err.message.includes('WAF'))) {
        await notifyTelegram(`🚨 <b>[CẢNH BÁO TAVY WEB CRAWLER]</b>\nBị chặn WAF/Bot tại SKU: <code>${gid}</code> (${item.name.slice(0, 30)})\nLỗi: <code>${err.message}</code>`);
      }
    }
  }

  await browser.close();

  // Cập nhật vị trí checkpoint tiếp theo
  checkpoint.nextIdx = (startIdx + targetBatch.length) % normalOyItems.length;
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2), 'utf8');

  // Nếu có thay đổi giá hoặc kho thì mới đồng bộ Firestore và deploy
  if (changedSkus.length > 0) {
    console.log(`Phát hiện ${changedSkus.length} SKU thay đổi, đồng bộ Firestore & Deploy...`);
    fs.writeFileSync(ALL_CATALOG_PATH, JSON.stringify(currentCatalog, null, 2), 'utf8');
    fs.writeFileSync(PLAYWRIGHT_PATH, JSON.stringify(currentCatalog, null, 2), 'utf8');

    let batch = writeBatch(db);
    for (const gid of changedSkus) {
      const p = catMap.get(gid);
      if (p) batch.set(doc(db, 'products', gid), p, { merge: true });
    }
    await batch.commit();

    // Build và deploy
    execSync('npm run build', { cwd: PROJECT_DIR, stdio: 'inherit' });
    execSync('npx -y firebase-tools deploy --only hosting', { cwd: PROJECT_DIR, stdio: 'inherit' });
    execSync('git add public/data/*.json src/context/AppProvider.jsx', { cwd: PROJECT_DIR });
    execSync(`git commit -m "chore(crawler): auto sync ${changedSkus.length} updated SKUs"`, { cwd: PROJECT_DIR });
    execSync('git push origin main', { cwd: PROJECT_DIR, stdio: 'inherit' });

    // Chỉ cảnh báo khi có lỗi, không spam thành công thường xuyên
    // await notifyTelegram(`✅ <b>[TAVY KOREA CRAWLER 24/7]</b>\nĐã cập nhật tự động ${changedSkus.length} SKU có biến động giá/kho/review.\nDeploy live thành công!`);
  } else {
    console.log('✓ Batch này không có biến động giá/kho. [SILENT]');
  }
}

runCronTick().catch(e => {
  console.error('Fatal cron error:', e);
});
