/**
 * Vercel Serverless API Endpoint: /api/telegramDailyReport
 * Tự động tổng hợp Lượt truy cập hôm nay + Đối chiếu biến động giá sản phẩm trên web và gửi về Bot Telegram lúc 20:00 tối.
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection } from 'firebase/firestore';
import {
  DEFAULT_TELEGRAM_CONFIG,
  normalizeBotToken,
  extractTrafficSummary,
  analyzeProductPriceVolatility,
  formatDaily8PmTelegramReport
} from '../src/services/telegramNotificationService.js';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyCQ_cpZLNbZdgGpDzea9GlpCL8vbeb_emo',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'tavyorder.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'tavyorder',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'tavyorder.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '307372781687',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:307372781687:web:356e2963e0cf23b018d672'
};

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const now = new Date();

    // 1. Đọc cấu hình Telegram
    let botCfg = { ...DEFAULT_TELEGRAM_CONFIG };
    try {
      const cfgSnap = await getDoc(doc(db, 'system_config', 'telegram_bot'));
      if (cfgSnap.exists()) {
        botCfg = { ...botCfg, ...cfgSnap.data() };
      }
    } catch {
      // Fallback default
    }

    const botToken = normalizeBotToken(req.body?.botToken || process.env.TELEGRAM_BOT_TOKEN || botCfg.botToken || DEFAULT_TELEGRAM_CONFIG.botToken);
    const chatId = req.body?.chatId || process.env.TELEGRAM_CHAT_ID || botCfg.chatId || DEFAULT_TELEGRAM_CONFIG.chatId;

    // 2. Đọc tỷ giá
    let rates = { KRW: { rate: 19.5 }, serviceFeePercent: 5 };
    try {
      const rateSnap = await getDoc(doc(db, 'system_config', 'rates'));
      if (rateSnap.exists()) {
        const rData = rateSnap.data() || {};
        rates = {
          KRW: { rate: Number(rData.KRW?.rate || rData.krwRate) || 19.5 },
          serviceFeePercent: Number(rData.serviceFeePercent !== undefined ? rData.serviceFeePercent : 5)
        };
      }
    } catch {
      // Fallback default
    }

    // 3. Đọc thống kê lượt truy cập hôm nay
    let analyticsData = {};
    try {
      const statsSnap = await getDoc(doc(db, 'site_analytics', 'overview'));
      if (statsSnap.exists()) {
        analyticsData = statsSnap.data() || {};
      }
    } catch {
      // Fallback empty
    }
    const trafficSummary = extractTrafficSummary(analyticsData, now);

    // 4. Đọc toàn bộ sản phẩm trên web và kiểm tra biến động giá
    const products = [];
    try {
      const prodSnap = await getDocs(collection(db, 'products'));
      prodSnap.forEach((d) => products.push({ goodsNo: d.id, ...d.data() }));
    } catch {
      // Fallback empty
    }

    const priceReport = analyzeProductPriceVolatility(products, { rates });

    // 5. Định dạng và gửi báo cáo tới Telegram
    const messageHtml = formatDaily8PmTelegramReport({
      traffic: trafficSummary,
      priceReport,
      rates,
      now
    });

    const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageHtml,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const tgData = await tgResponse.json();
    if (!tgResponse.ok || !tgData.ok) {
      return res.status(400).json({
        success: false,
        error: tgData.description || 'Lỗi gửi tin nhắn tới Telegram API'
      });
    }

    return res.status(200).json({
      success: true,
      messageId: tgData.result?.message_id,
      chatId,
      todayVisits: trafficSummary.todayVisits,
      totalProducts: priceReport.totalProducts,
      discrepancyCount: priceReport.discrepancyCount,
      sentAt: now.toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
}
