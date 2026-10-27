#!/usr/bin/env node
/**
 * TAVY KOREA — Daily 20:00 (8:00 PM) Telegram Bot Notification Worker
 *
 * Tự động chạy lúc 20:00 mỗi tối (hoặc chạy thủ công qua `--once`):
 * 1. Đọc dữ liệu truy cập thực tế từ Firestore `site_analytics/overview` (Tổng lượt truy cập hôm nay, so với hôm qua, tuần này, tháng này, toàn thời gian).
 * 2. Đọc danh sách toàn bộ sản phẩm đang bán trên web từ Firestore `products` và đối chiếu với giá nguồn Hàn Quốc (Olive Young).
 * 3. Chế độ an toàn (Alert-Only): Không tự động đè giá đang bán trên web; ghi nhận đề xuất `pendingPriceUpdate` vào Firestore để Admin bấm nút cập nhật trên Web Admin.
 * 4. Gửi báo cáo tổng hợp chi tiết vào Bot Telegram của A. Tân (Chat ID: 8575761420).
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, getDocs, collection, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import {
  DEFAULT_TELEGRAM_CONFIG,
  normalizeBotToken,
  extractTrafficSummary,
  analyzeProductPriceVolatility,
  formatDaily8PmTelegramReport
} from '../src/services/telegramNotificationService.js';
import { getCurrentTimeKeys } from '../src/services/analyticsTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Cấu hình kết nối Cloud Firestore TAVY KOREA
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyCQ_cpZLNbZdgGpDzea9GlpCL8vbeb_emo',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'tavyorder.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'tavyorder',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'tavyorder.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '307372781687',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:307372781687:web:356e2963e0cf23b018d672'
};

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/**
 * Đọc cấu hình Telegram từ Firestore `system_config/telegram_bot` hoặc biến môi trường
 */
async function loadBotConfig() {
  let dbCfg = {};
  try {
    const snap = await getDoc(doc(db, 'system_config', 'telegram_bot'));
    if (snap.exists()) {
      dbCfg = snap.data() || {};
    }
  } catch (err) {
    console.warn('⚠️ Không đọc được system_config/telegram_bot, dùng cấu hình mặc định:', err.message);
  }

  return {
    ...DEFAULT_TELEGRAM_CONFIG,
    ...dbCfg,
    botToken: normalizeBotToken(process.env.TELEGRAM_BOT_TOKEN || dbCfg.botToken || DEFAULT_TELEGRAM_CONFIG.botToken),
    chatId: process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_HOME_CHANNEL || dbCfg.chatId || DEFAULT_TELEGRAM_CONFIG.chatId
  };
}

/**
 * Đọc tỷ giá KRW và phí dịch vụ từ Firestore `system_config/rates`
 */
async function loadSystemRates() {
  try {
    const snap = await getDoc(doc(db, 'system_config', 'rates'));
    if (snap.exists()) {
      const data = snap.data() || {};
      return {
        KRW: { rate: Number(data.KRW?.rate || data.krwRate) || 19.5 },
        serviceFeePercent: Number(data.serviceFeePercent !== undefined ? data.serviceFeePercent : 5)
      };
    }
  } catch (err) {
    console.warn('⚠️ Lỗi đọc tỷ giá Firestore:', err.message);
  }
  return {
    KRW: { rate: 19.5 },
    serviceFeePercent: 5
  };
}

/**
 * Đọc dữ liệu giá nguồn mới nhất từ bản quét local (nếu có) để đối chiếu chính xác
 */
function loadLatestLocalSourcePrices() {
  const map = {};
  const candidates = [
    path.resolve(__dirname, '../public/data/playwright_scraped_products.json'),
    '/tmp/live_top100_oliveyoung.json'
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      try {
        const arr = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (Array.isArray(arr)) {
          arr.forEach((item) => {
            const gNo = item.goodsNo || item.id;
            const saleWon = Number(item.foreignPrice || item.sale_price_krw || item.price) || 0;
            const origWon = Number(item.originalPrice || item.origin_price_krw || saleWon) || saleWon;
            if (gNo && saleWon > 0) {
              map[gNo] = {
                foreignPrice: saleWon,
                originalPrice: origWon
              };
            }
          });
        }
      } catch {
        // Ignore parse errors
      }
    }
  }
  return map;
}

/**
 * Gửi tin nhắn HTML tới Telegram Bot API
 */
async function sendTelegramHtml(botToken, chatId, htmlText) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.description || `Telegram HTTP ${res.status}`);
  }
  return data.result;
}

/**
 * Chạy phiên tổng hợp và gửi báo cáo 20:00
 */
export async function runDaily8PmTelegramReport() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔔 TAVY KOREA — BÁO CÁO TELEGRAM 20:00 HẰNG NGÀY [${new Date().toLocaleString('vi-VN')}]`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Đăng nhập Admin Firebase để có quyền ghi trạng thái cảnh báo (nếu có)
  let isAdminAuthenticated = false;
  try {
    const adminEmail = process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn';
    const adminPass = process.env.FIREBASE_ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD || 'admin123';
    await signInWithEmailAndPassword(auth, adminEmail, adminPass);
    isAdminAuthenticated = true;
  } catch {
    // Tiếp tục chạy ở chế độ đọc public
  }

  const botConfig = await loadBotConfig();
  const rates = await loadSystemRates();
  const now = new Date();
  const { dayKey } = getCurrentTimeKeys(now);

  // 1. Lấy dữ liệu lượng truy cập hôm nay từ `site_analytics/overview`
  let analyticsData = {};
  try {
    const statsSnap = await getDoc(doc(db, 'site_analytics', 'overview'));
    if (statsSnap.exists()) {
      analyticsData = statsSnap.data() || {};
    }
  } catch (err) {
    console.warn('⚠️ Lỗi đọc site_analytics/overview:', err.message);
  }
  const trafficSummary = extractTrafficSummary(analyticsData, now);
  console.log(`📊 [Lượt Truy Cập] Hôm nay (${dayKey}): ${trafficSummary.todayVisits} lượt | Tuần này: ${trafficSummary.weekVisits} | Tổng: ${trafficSummary.allTimeVisits}`);

  // 2. Lấy toàn bộ sản phẩm đang bán trên web từ `products`
  let webProducts = [];
  try {
    const prodSnap = await getDocs(collection(db, 'products'));
    prodSnap.forEach((docSnap) => {
      webProducts.push({ goodsNo: docSnap.id, ...docSnap.data() });
    });
    console.log(`📦 [Kho Sản Phẩm Web] Đã tải ${webProducts.length} SKU đang bán từ Firestore.`);
  } catch (err) {
    console.warn('⚠️ Lỗi đọc collection products:', err.message);
  }

  // 3. Đối chiếu biến động giá so với nguồn Hàn Quốc
  const liveSourceMap = loadLatestLocalSourcePrices();
  const priceReport = analyzeProductPriceVolatility(webProducts, {
    rates,
    liveSourcePricesMap: liveSourceMap
  });

  console.log(
    `🏷️ [Đối Chiếu Giá] Tổng: ${priceReport.totalProducts} SKU | Khớp 100%: ${priceReport.matchedCount} SKU | Biến động: ${priceReport.discrepancyCount} SKU (🔻 Giảm: ${priceReport.priceDropsCount}, 🔺 Tăng: ${priceReport.priceIncreasesCount})`
  );

  // Nếu có sản phẩm chênh lệch giá và đã xác thực Admin, lưu trường `pendingPriceUpdate` lên Firestore (Chế độ Alert-Only: giữ nguyên giá đang bán để Admin bấm nút cập nhật)
  if (isAdminAuthenticated && priceReport.discrepancies.length > 0) {
    try {
      const batch = writeBatch(db);
      for (const prod of priceReport.annotatedProducts) {
        if (prod.pendingPriceUpdate?.hasDiscrepancy && prod.goodsNo) {
          batch.set(
            doc(db, 'products', prod.goodsNo),
            {
              pendingPriceUpdate: prod.pendingPriceUpdate,
              priceChangeAlert: prod.priceChangeAlert
            },
            { merge: true }
          );
        }
      }
      await batch.commit();
      console.log(`💾 [Firestore Sync] Đã lưu trạng thái chờ duyệt giá cho ${priceReport.discrepancies.length} SKU trên Web Admin.`);
    } catch {
      // Ignore if unauthenticated write
    }
  }

  // 4. Định dạng và gửi báo cáo tới Bot Telegram
  const messageHtml = formatDaily8PmTelegramReport({
    traffic: trafficSummary,
    priceReport,
    rates,
    now
  });

  const tgResult = await sendTelegramHtml(botConfig.botToken, botConfig.chatId, messageHtml);
  console.log(`✅ [Telegram Sent] Đã gửi báo cáo thành công tới Chat ID ${botConfig.chatId} (Message ID: ${tgResult.message_id})`);

  // 5. Lưu dấu thời gian gửi và đồng bộ cấu hình bot mới vào Firestore `system_config/telegram_bot`
  if (isAdminAuthenticated) {
    try {
      await setDoc(
        doc(db, 'system_config', 'telegram_bot'),
        {
          botToken: botConfig.botToken,
          botUsername: '@Antiappsbot',
          botName: 'Antiga',
          chatId: botConfig.chatId,
          lastSentAt: now.toISOString(),
          lastDailyReportDate: dayKey,
          lastStatus: 'sent_ok',
          lastMessageId: tgResult.message_id,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch {
      // Ignore write error if not authenticated as admin
    }
  }

  return {
    success: true,
    messageId: tgResult.message_id,
    trafficSummary,
    priceReport
  };
}

// Chạy trực tiếp từ CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  runDaily8PmTelegramReport()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Lỗi gửi báo cáo Telegram 20:00:', err.message);
      process.exit(1);
    });
}
