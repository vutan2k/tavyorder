#!/usr/bin/env node
/**
 * TAVY KOREA — Playwright Auto Price Sync Bot & Scheduler Daemon v20.0
 * 
 * Tự động quét & đồng bộ giá bán trực tiếp (Sale Price & Original Price) từ Olive Young Hàn Quốc
 * cho toàn bộ kho sản phẩm, tính toán lại giá VND, lưu vết priceHistory và phát hiện biến động giá.
 * 
 * Cách dùng:
 * 1. Chạy 1 lần:
 *    node scripts/auto_price_sync_bot.js --once
 * 
 * 2. Chạy với giao diện trình duyệt trực quan:
 *    HEADLESS=false node scripts/auto_price_sync_bot.js --once
 * 
 * 3. Chạy theo chu kỳ nền (Daemon scheduler):
 *    node scripts/auto_price_sync_bot.js --interval=60
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection, updateDoc, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  VERIFIED_OLIVEYOUNG_PRICES,
  getOliveYoungVerifiedPrice,
  calculateVndPrice,
  syncProductPriceWithOliveYoung,
  syncAllProductsWithOliveYoung
} from '../src/services/oliveYoungPriceSyncService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Config
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "tavyorder.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "tavyorder",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "tavyorder.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "307372781687",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:307372781687:web:356e2963e0cf23b018d672"
};

let app = null;
let auth = null;
let db = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.warn('⚠️ Firebase init warning:', e.message);
}

// Arguments & Env
const args = process.argv.slice(2);
const isOnce = args.includes('--once') || process.env.RUN_ONCE === 'true';
const isHeadless = process.env.HEADLESS !== 'false' && !args.includes('--headful');
const intervalArg = args.find(a => a.startsWith('--interval=') || a.startsWith('--schedule='));
const intervalMins = intervalArg ? parseInt(intervalArg.split('=')[1].replace(/[^0-9]/g, ''), 10) || 60 : 60;

const KRW_RATE = parseFloat(process.env.VITE_KRW_RATE || '19.5');
const SERVICE_FEE = parseFloat(process.env.VITE_SERVICE_FEE || '5.0');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Scrape Live Price directly from Olive Young via Playwright
 */
async function scrapeLivePriceWithPlaywright(page, goodsNo) {
  const url = `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${goodsNo}`;
  try {
    console.log(`🌐 [Playwright Browser] Đang kiểm tra giá trực tiếp: ${goodsNo}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(1000);

    const priceData = await page.evaluate(() => {
      let salePrice = 0;
      let origPrice = 0;

      const saleEl = document.querySelector('span.price-2 strong, span.tx_cur .tx_num, [class*="GoodsDetailInfo_price__"], .price-2, strong.price');
      const origEl = document.querySelector('span.price-1 strike, span.tx_org .tx_num, [class*="GoodsDetailInfo_price-before__"]');

      if (saleEl) {
        const num = (saleEl.textContent || '').replace(/[^0-9]/g, '');
        if (num) salePrice = parseInt(num, 10);
      }
      if (origEl) {
        const num = (origEl.textContent || '').replace(/[^0-9]/g, '');
        if (num) origPrice = parseInt(num, 10);
      }
      if (!origPrice && salePrice) origPrice = salePrice;

      const isOutOfStock = !!document.querySelector('.soldout, .btn_soldout, [class*="soldout"]');

      return { salePrice, origPrice, isOutOfStock };
    });

    return {
      success: priceData.salePrice > 0,
      foreignPrice: priceData.salePrice,
      originalPrice: priceData.origPrice,
      isOutOfStock: priceData.isOutOfStock
    };
  } catch (err) {
    console.warn(`⚠️ [Playwright Error] Không thể cào giá live cho ${goodsNo}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Lấy danh sách sản phẩm cần đồng bộ
 */
async function fetchTargetProducts() {
  let products = [];

  // 1. Thử đọc từ Firestore DB
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'products'));
      snap.forEach(docSnap => {
        products.push({ goodsNo: docSnap.id, ...docSnap.data() });
      });
      if (products.length > 0) {
        console.log(`📦 [Firestore DB] Đã nạp ${products.length} sản phẩm từ collection 'products'`);
        return products;
      }
    } catch (e) {
      console.warn('⚠️ Không thể đọc products từ Firestore:', e.message);
    }
  }

  // 2. Fallback: Đọc từ verified catalog database
  const catalogList = Object.values(VERIFIED_OLIVEYOUNG_PRICES).map(p => ({
    ...p,
    price: p.foreignPrice,
    isPublished: true
  }));

  console.log(`📦 [Catalog Fallback] Đã nạp ${catalogList.length} sản phẩm từ Verified Catalog DB`);
  return catalogList;
}

/**
 * Chạy 1 phiên quét và đồng bộ giá toàn bộ kho hàng
 */
async function runPriceSyncSession() {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(70));
  console.log(`🤖 TAVY KOREA PLAYWRIGHT AUTO-PRICE SYNC BOT [${new Date().toLocaleString('vi-VN')}]`);
  console.log('='.repeat(70));

  if (auth && firebaseConfig.apiKey) {
    try {
      await signInWithEmailAndPassword(auth, 'admin@tavykorea.vn', (process.env.FIREBASE_ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD || ''));
      console.log('🔑 [Firebase Auth] Đăng nhập Admin thành công (admin@tavykorea.vn)');
    } catch (e) {
      console.warn('⚠️ [Firebase Auth] Đăng nhập thất bại:', e.message);
    }
  }

  const targetProducts = await fetchTargetProducts();
  if (targetProducts.length === 0) {
    console.log('⚠️ Kho hàng trống, không có sản phẩm nào để đồng bộ giá.');
    return;
  }

  let browser = null;
  let page = null;

  try {
    browser = await chromium.launch({
      headless: isHeadless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
    page = await context.newPage();
  } catch (err) {
    console.warn('⚠️ Không thể khởi động Playwright browser, chuyển sang chế độ Fast Engine Fallback:', err.message);
  }

  const changes = [];
  const updatedProducts = [];
  let priceDrops = 0;
  let priceIncreases = 0;

  for (let i = 0; i < targetProducts.length; i++) {
    const prod = targetProducts[i];
    const goodsNo = prod.goodsNo || prod.id;
    const oldWon = Number(prod.foreignPrice || prod.price) || 0;

    let liveScrapeRes = null;
    if (page && goodsNo && goodsNo.startsWith('A')) {
      // Chỉ live scrape cho các mã hợp lệ của Olive Young
      liveScrapeRes = await scrapeLivePriceWithPlaywright(page, goodsNo);
      await delay(1200); // Throttling bảo vệ
    }

    const options = {
      krwRate: KRW_RATE,
      serviceFeePercent: SERVICE_FEE,
      scrapedWon: liveScrapeRes?.success ? liveScrapeRes.foreignPrice : undefined,
      scrapedOriginalWon: liveScrapeRes?.success ? liveScrapeRes.originalPrice : undefined
    };

    const synced = syncProductPriceWithOliveYoung(prod, options);
    const newWon = synced.foreignPrice;
    updatedProducts.push(synced);

    if (oldWon !== newWon && oldWon > 0) {
      const diffWon = newWon - oldWon;
      const changePct = Math.round((diffWon / oldWon) * 1000) / 10;
      if (changePct < 0) priceDrops++;
      else if (changePct > 0) priceIncreases++;

      changes.push({
        goodsNo,
        name: synced.name,
        brand: synced.brand,
        oldWon,
        newWon,
        oldPriceVnd: prod.priceVnd || calculateVndPrice(oldWon, KRW_RATE, SERVICE_FEE),
        newPriceVnd: synced.priceVnd,
        changePct,
        type: changePct < 0 ? 'drop' : 'increase'
      });

      console.log(`⚡ [Phát Hiện Biến Động] ${synced.brand} - ${synced.name}`);
      console.log(`   Giá cũ: ${oldWon.toLocaleString()} ₩  ➔  Giá mới: ${newWon.toLocaleString()} ₩ (${changePct > 0 ? '+' : ''}${changePct}%)`);
      console.log(`   Giá VND về VN: ${synced.priceVnd.toLocaleString('vi-VN')} đ`);

      // Cập nhật Firestore nếu kết nối được
      if (db && goodsNo) {
        try {
          const docRef = doc(db, 'products', goodsNo);
          await setDoc(docRef, synced, { merge: true });
          console.log(`   ✅ Đã cập nhật Firestore [products/${goodsNo}]`);
        } catch (e) {
          console.warn(`   ⚠️ Lỗi ghi Firestore [${goodsNo}]:`, e.message);
        }
      }
    } else {
      console.log(`✓ [Khớp Giá 100%] [${synced.brand || 'Korea'}] ${synced.name.slice(0, 45)}... : ${newWon.toLocaleString()} ₩`);
    }
  }

  if (browser) {
    await browser.close().catch(() => {});
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);

  // Xuất báo cáo tổng kết
  console.log('\n' + '='.repeat(70));
  console.log('📊 BÁO CÁO TỔNG KẾT BIẾN ĐỘNG GIÁ TỰ ĐỘNG');
  console.log('='.repeat(70));
  console.log(`- Tổng sản phẩm đã quét: ${targetProducts.length}`);
  console.log(`- Sản phẩm giảm giá (Sale / Price Drops): ${priceDrops}`);
  console.log(`- Sản phẩm tăng giá (Price Increases): ${priceIncreases}`);
  console.log(`- Tổng biến động giá: ${changes.length}`);
  console.log(`- Thời gian hoàn tất: ${durationSec} giây`);
  console.log('='.repeat(70) + '\n');

  // Lưu file JSON báo cáo
  try {
    const reportDir = path.join(__dirname, '../dist/data');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, 'price_sync_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalScanned: targetProducts.length,
      priceDrops,
      priceIncreases,
      changes,
      durationSec
    }, null, 2));
    console.log(`💾 Đã lưu báo cáo biến động giá tại: ${reportPath}`);
  } catch (e) {
    console.warn('⚠️ Lỗi lưu file report:', e.message);
  }
}

/**
 * Main Controller
 */
async function main() {
  if (isOnce) {
    await runPriceSyncSession();
    process.exit(0);
  }

  console.log(`🔄 [Auto-Scheduler Active] Bot sẽ chạy tự động mỗi ${intervalMins} phút.`);
  await runPriceSyncSession();

  setInterval(async () => {
    try {
      await runPriceSyncSession();
    } catch (e) {
      console.error('❌ Lỗi phiên quét định kỳ:', e);
    }
  }, intervalMins * 60 * 1000);
}

main().catch(err => {
  console.error('❌ Fatal error in Price Sync Bot:', err);
  process.exit(1);
});
