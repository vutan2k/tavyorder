/**
 * TAVY KOREA — Telegram Bot Notification & Daily 8:00 PM Report Service
 *
 * Chức năng chính:
 * 1. Quản lý cấu hình Bot Telegram (Token, Chat ID, lịch 20:00 mỗi tối, chế độ Alert-Only).
 * 2. Tổng hợp số liệu truy cập thật từ Firestore `site_analytics/overview` (Hôm nay, Hôm qua, Tuần này, Tháng này, Toàn thời gian).
 * 3. Đối chiếu giá sản phẩm đang bán trên web với giá nguồn Hàn Quốc (Olive Young / Live Source) ở chế độ Cảnh Báo (Alert-Only),
 *    lưu thông tin đề xuất `pendingPriceUpdate` để Admin xem xét và bấm nút cập nhật trên Web Admin.
 * 4. Định dạng báo cáo HTML chuẩn Telegram và gửi tin nhắn thật tới Telegram Bot API.
 */

import { db } from '../firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getCurrentTimeKeys } from './analyticsTracker.js';
import {
  VERIFIED_OLIVEYOUNG_PRICES,
  getOliveYoungVerifiedPrice,
  calculateVndPrice
} from './oliveYoungPriceSyncService.js';

const LEGACY_HERMES_BOT_TOKEN = '8897305128:AAGqb7cQhpFx3AVcGyX0pZqooZLetdgXENU';

// Cấu hình mặc định kết nối tới Bot Telegram riêng của TAVY KOREA (@Antiappsbot - Antiga)
export const DEFAULT_TELEGRAM_CONFIG = {
  enabled: true,
  botToken: '8887086946:AAGQ6xm1KA4fH9Ibd1In0tkLUnH7etKWbzA',
  botUsername: '@Antiappsbot',
  botName: 'Antiga',
  chatId: '8575761420',
  chatName: 'Tan Vu (Owner)',
  scheduleTime: '20:00', // 8h tối mỗi ngày
  timezone: 'Asia/Ho_Chi_Minh',
  includeTrafficReport: true,
  includePriceVolatilityReport: true,
  autoApplyPriceChanges: false, // Mặc định false: Chỉ gửi cảnh báo về Telegram + hiện nút cập nhật trên Web Admin
  lastSentAt: null,
  lastDailyReportDate: null,
  lastStatus: 'ready'
};

export function normalizeBotToken(token) {
  const trimmed = String(token || '').trim();
  if (!trimmed || trimmed === LEGACY_HERMES_BOT_TOKEN) {
    return DEFAULT_TELEGRAM_CONFIG.botToken;
  }
  return trimmed;
}

const STORAGE_KEY = 'tavy_telegram_bot_config';
const memoryFallback = new Map();

const safeLocalGet = (key) => {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    return memoryFallback.get(key) || null;
  } catch {
    return memoryFallback.get(key) || null;
  }
};

const safeLocalSet = (key, val) => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, val);
    memoryFallback.set(key, val);
  } catch {
    memoryFallback.set(key, val);
  }
};

/**
 * Đọc cấu hình Telegram từ localStorage / bộ nhớ đệm
 */
export function getLocalTelegramConfig() {
  try {
    const raw = safeLocalGet(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TELEGRAM_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_TELEGRAM_CONFIG,
      ...parsed,
      botToken: normalizeBotToken(parsed.botToken),
      chatId: parsed.chatId || DEFAULT_TELEGRAM_CONFIG.chatId
    };
  } catch {
    return { ...DEFAULT_TELEGRAM_CONFIG };
  }
}

/**
 * Lưu cấu hình Telegram vào localStorage & Firestore `system_config/telegram_bot`
 */
export async function saveTelegramConfig(newConfig = {}, options = {}) {
  const merged = {
    ...getLocalTelegramConfig(),
    ...newConfig,
    botToken: normalizeBotToken(newConfig.botToken ?? getLocalTelegramConfig().botToken),
    updatedAtIso: new Date().toISOString()
  };

  safeLocalSet(STORAGE_KEY, JSON.stringify(merged));

  if (options.syncCloud !== false && db && db.type) {
    try {
      const ref = doc(db, 'system_config', 'telegram_bot');
      await setDoc(
        ref,
        {
          ...merged,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('[TelegramService] Lưu Firestore system_config/telegram_bot warning:', err.message);
    }
  }

  return merged;
}

/**
 * Tải cấu hình Telegram mới nhất từ Firestore (fallback về Local)
 */
export async function fetchTelegramConfigFromDB() {
  const localCfg = getLocalTelegramConfig();
  if (!db || !db.type) return localCfg;

  try {
    const ref = doc(db, 'system_config', 'telegram_bot');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() || {};
      const merged = {
        ...DEFAULT_TELEGRAM_CONFIG,
        ...localCfg,
        ...data,
        botToken: normalizeBotToken(data.botToken || localCfg.botToken),
        chatId: data.chatId || localCfg.chatId || DEFAULT_TELEGRAM_CONFIG.chatId
      };
      safeLocalSet(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.debug('[TelegramService] Đọc Firestore config fallback:', err.message);
  }
  return localCfg;
}

/**
 * Escape ký tự HTML an toàn cho Telegram parse_mode='HTML'
 */
export function escapeTelegramHtml(text = '') {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Lấy dữ liệu thống kê lượt truy cập từ object `site_analytics/overview`
 */
export function extractTrafficSummary(analyticsData = {}, now = new Date()) {
  const { dayKey, weekKey, monthKey, yearKey } = getCurrentTimeKeys(now);

  // Tính ngày hôm qua để đối chiếu tăng trưởng
  const yesterdayDate = new Date(now.getTime() - 86400000);
  const { dayKey: yesterdayKey } = getCurrentTimeKeys(yesterdayDate);

  const todayVisits = Number(analyticsData?.days?.[dayKey] ?? analyticsData?.[`days.${dayKey}`] ?? analyticsData?.today) || 0;
  const yesterdayVisits = Number(analyticsData?.days?.[yesterdayKey] ?? analyticsData?.[`days.${yesterdayKey}`] ?? analyticsData?.yesterday) || 0;
  const weekVisits = Number(analyticsData?.weeks?.[weekKey] ?? analyticsData?.[`weeks.${weekKey}`] ?? analyticsData?.thisWeek) || 0;
  const monthVisits = Number(analyticsData?.months?.[monthKey] ?? analyticsData?.[`months.${monthKey}`] ?? analyticsData?.thisMonth) || 0;
  const yearVisits = Number(analyticsData?.years?.[yearKey] ?? analyticsData?.[`years.${yearKey}`] ?? analyticsData?.thisYear) || 0;
  const allTimeVisits = Number(analyticsData?.allTime) || 0;

  let vsYesterdayDiff = todayVisits - yesterdayVisits;
  let vsYesterdayPct = 0;
  if (yesterdayVisits > 0) {
    vsYesterdayPct = Math.round(((todayVisits - yesterdayVisits) / yesterdayVisits) * 1000) / 10;
  } else if (todayVisits > 0) {
    vsYesterdayPct = 100;
  }

  return {
    dayKey,
    yesterdayKey,
    weekKey,
    monthKey,
    todayVisits,
    yesterdayVisits,
    weekVisits,
    monthVisits,
    yearVisits,
    allTimeVisits,
    vsYesterdayDiff,
    vsYesterdayPct,
    diffVsYesterday: vsYesterdayDiff,
    diffPercentVsYesterday: vsYesterdayPct
  };
}

/**
 * Tải trực tiếp số liệu truy cập thật từ Cloud Firestore `site_analytics/overview`
 */
export async function fetchLiveTrafficSummary(now = new Date()) {
  if (db && db.type) {
    try {
      const statsRef = doc(db, 'site_analytics', 'overview');
      const snap = await getDoc(statsRef);
      if (snap.exists()) {
        return extractTrafficSummary(snap.data() || {}, now);
      }
    } catch (err) {
      console.warn('[TelegramService] Lỗi đọc site_analytics/overview:', err.message);
    }
  }
  return extractTrafficSummary({}, now);
}

/**
 * Phân tích & đối chiếu biến động giá của tất cả sản phẩm so với giá đang bán trên web.
 * Chế độ mặc định: ALERT-ONLY (Chỉ phát hiện chênh lệch và tạo `pendingPriceUpdate`, KHÔNG tự ý đè giá web).
 *
 * @param {Array} products Danh sách sản phẩm đang bán trên web
 * @param {Object} options { krwRate, serviceFeePercent, liveSourcePricesMap }
 */
export function analyzeProductPriceVolatility(products = [], options = {}) {
  if (!Array.isArray(products)) {
    return {
      totalProducts: 0,
      matchedCount: 0,
      discrepancyCount: 0,
      priceDropsCount: 0,
      priceIncreasesCount: 0,
      discrepancies: [],
      annotatedProducts: []
    };
  }

  const krwRate = Number(options.krwRate || options.rates?.KRW?.rate) || 19.5;
  const serviceFee = Number(options.serviceFeePercent ?? options.rates?.serviceFeePercent) || 5;
  const liveMap = options.liveSourcePricesMap || {};

  const discrepancies = [];
  let matchedCount = 0;
  let priceDropsCount = 0;
  let priceIncreasesCount = 0;

  const annotatedProducts = products.map((prod) => {
    if (!prod || typeof prod !== 'object') return prod;
    const goodsNo = String(prod.goodsNo || prod.id || '').trim();
    const webWon = Number(prod.foreignPrice || prod.price) || 0;
    const webVnd = Number(prod.priceVnd) || calculateVndPrice(webWon, krwRate, serviceFee);

    // Tìm giá nguồn Hàn Quốc mới nhất để so sánh:
    // 1. Từ liveSourcePricesMap (nếu vừa quét trực tiếp từ Olive Young)
    // 2. Từ trường pendingPriceUpdate.newForeignPrice hoặc latestSourcePrice / scrapedForeignPrice trên sản phẩm
    // 3. Từ bảng VERIFIED_OLIVEYOUNG_PRICES
    // 4. Từ cảnh báo priceChangeAlert hiện hành (nếu chưa được Admin bấm xác nhận)
    const liveEntry = liveMap[goodsNo];
    const verifiedEntry = getOliveYoungVerifiedPrice(goodsNo) || VERIFIED_OLIVEYOUNG_PRICES[goodsNo];

    let sourceWon = webWon;
    let sourceOriginalWon = Number(prod.originalPrice) || webWon;
    let sourceLabel = 'Olive Young Korea';

    if (liveEntry && Number(liveEntry.foreignPrice || liveEntry.salePrice) > 0) {
      sourceWon = Number(liveEntry.foreignPrice || liveEntry.salePrice);
      sourceOriginalWon = Number(liveEntry.originalPrice || liveEntry.origPrice) || sourceWon;
      sourceLabel = 'Olive Young Live';
    } else if (prod.pendingPriceUpdate && Number(prod.pendingPriceUpdate.newForeignPrice) > 0 && Number(prod.pendingPriceUpdate.newForeignPrice) !== webWon) {
      sourceWon = Number(prod.pendingPriceUpdate.newForeignPrice);
      sourceOriginalWon = Number(prod.pendingPriceUpdate.newOriginalPrice) || sourceOriginalWon;
      sourceLabel = prod.pendingPriceUpdate.source || 'Olive Young Live';
    } else if (Number(prod.latestSourcePrice) > 0 && Number(prod.latestSourcePrice) !== webWon) {
      sourceWon = Number(prod.latestSourcePrice);
      sourceLabel = 'Olive Young Live';
    } else if (verifiedEntry && Number(verifiedEntry.foreignPrice) > 0) {
      sourceWon = Number(verifiedEntry.foreignPrice);
      sourceOriginalWon = Number(verifiedEntry.originalPrice) || sourceWon;
      sourceLabel = 'Olive Young Verified';
    }

    const sourceVnd = calculateVndPrice(sourceWon, krwRate, serviceFee);

    // Kiểm tra chênh lệch giữa giá Nguồn Hàn Quốc và giá Đang Bán Trên Web
    if (webWon > 0 && sourceWon > 0 && sourceWon !== webWon) {
      const diffWon = sourceWon - webWon;
      const diffVnd = sourceVnd - webVnd;
      const changePercent = Math.round((diffWon / webWon) * 1000) / 10;
      const changeType = diffWon < 0 ? 'drop' : 'increase';

      if (changeType === 'drop') priceDropsCount++;
      else priceIncreasesCount++;

      const discrepancyItem = {
        goodsNo,
        name: prod.name || verifiedEntry?.name || 'Sản phẩm Hàn Quốc',
        brand: prod.brand || verifiedEntry?.brand || 'Korea',
        productImage: prod.productImage || (Array.isArray(prod.images) && prod.images[0]) || '',
        productUrl: prod.productUrl || `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${goodsNo}`,
        webForeignPrice: webWon,
        sourceForeignPrice: sourceWon,
        sourceOriginalPrice: sourceOriginalWon,
        webPriceVnd: webVnd,
        sourcePriceVnd: sourceVnd,
        diffWon,
        diffVnd,
        changePercent,
        changeType,
        sourceLabel,
        detectedAt: new Date().toISOString()
      };

      discrepancies.push(discrepancyItem);

      // Gắn thông tin đề xuất cập nhật giá để hiển thị nút "Cập nhật giá" trên Web Admin
      return {
        ...prod,
        pendingPriceUpdate: {
          hasDiscrepancy: true,
          oldForeignPrice: webWon,
          newForeignPrice: sourceWon,
          oldWon: webWon,
          newWon: sourceWon,
          newOriginalPrice: sourceOriginalWon,
          oldPriceVnd: webVnd,
          newPriceVnd: sourceVnd,
          diffWon,
          diffVnd,
          changePercent,
          changeType,
          source: sourceLabel,
          detectedAt: discrepancyItem.detectedAt
        },
        priceChangeAlert: {
          hasChanged: true,
          changePercent,
          changeType,
          lastChecked: discrepancyItem.detectedAt,
          badgeText: changeType === 'drop' ? `Giá nguồn giảm ${Math.abs(changePercent)}%` : `Giá nguồn tăng +${changePercent}%`,
          diffWon,
          diffVnd,
          pendingNewWon: sourceWon,
          pendingNewVnd: sourceVnd
        }
      };
    }

    // Trường hợp sản phẩm đã có lịch sử biến động giá trong ngày (đã ghi nhận trong priceChangeAlert)
    if (prod.priceChangeAlert?.hasChanged && Math.abs(Number(prod.priceChangeAlert.changePercent) || 0) >= 1) {
      const latestHist = Array.isArray(prod.priceHistory) && prod.priceHistory.length > 0 ? prod.priceHistory[0] : null;
      const oldW = Number(latestHist?.oldForeignPrice || prod.priceChangeAlert.oldForeignPrice) || webWon;
      const newW = Number(prod.priceChangeAlert.pendingNewWon || latestHist?.newForeignPrice) || webWon;

      if (oldW > 0 && newW > 0 && oldW !== newW) {
        const diffW = newW - oldW;
        const oldV = calculateVndPrice(oldW, krwRate, serviceFee);
        const newV = calculateVndPrice(newW, krwRate, serviceFee);
        const pct = Number(prod.priceChangeAlert.changePercent) || Math.round((diffW / oldW) * 1000) / 10;
        const cType = pct < 0 ? 'drop' : 'increase';

        if (cType === 'drop') priceDropsCount++;
        else priceIncreasesCount++;

        discrepancies.push({
          goodsNo,
          name: prod.name || 'Sản phẩm Hàn Quốc',
          brand: prod.brand || 'Korea',
          productImage: prod.productImage || (Array.isArray(prod.images) && prod.images[0]) || '',
          productUrl: prod.productUrl || `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${goodsNo}`,
          webForeignPrice: oldW,
          sourceForeignPrice: newW,
          sourceOriginalPrice: Number(prod.originalPrice) || newW,
          webPriceVnd: oldV,
          sourcePriceVnd: newV,
          diffWon: diffW,
          diffVnd: newV - oldV,
          changePercent: pct,
          changeType: cType,
          sourceLabel: 'Biến động trong ngày',
          detectedAt: prod.priceChangeAlert.lastChecked || new Date().toISOString()
        });
        return prod;
      }
    }

    matchedCount++;
    return {
      ...prod,
      pendingPriceUpdate: null
    };
  });

  // Sắp xếp biến động lớn nhất lên đầu
  discrepancies.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  return {
    totalProducts: products.length,
    matchedCount,
    discrepancyCount: discrepancies.length,
    priceDropsCount,
    priceIncreasesCount,
    discrepancies,
    annotatedProducts,
    krwRate,
    serviceFee,
    checkedAt: new Date().toISOString()
  };
}

/**
 * Tạo nội dung tin nhắn Báo cáo 20:00 (8h tối) gửi về Bot Telegram (Định dạng HTML)
 */
export function formatDaily8PmTelegramReport({
  traffic,
  priceReport,
  rates,
  now = new Date(),
  adminUrl = 'https://tavyorder.web.app/admin/products'
} = {}) {
  const timeStr = now.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const krwRate = Number(priceReport?.krwRate || rates?.KRW?.rate) || 19.5;
  const serviceFee = Number(priceReport?.serviceFee ?? rates?.serviceFeePercent) || 5;

  const lines = [
    `🔔 <b>BÁO CÁO VẬN HÀNH TAVY KOREA — 20:00 TỐI</b>`,
    `🕒 Thời gian: <code>${escapeTelegramHtml(timeStr)}</code>`,
    `━━━━━━━━━━━━━━━━━━━━━━`
  ];

  // PHẦN 1: BÁO CÁO TỔNG LƯỢNG TRUY CẬP NGÀY HÔM NAY
  if (traffic) {
    const diffSign = traffic.vsYesterdayDiff >= 0 ? '+' : '';
    const pctSign = traffic.vsYesterdayPct >= 0 ? '+' : '';
    const trendIcon = traffic.vsYesterdayDiff >= 0 ? '📈' : '📉';

    lines.push(
      `📊 <b>1. TỔNG LƯỢT TRUY CẬP WEBSITE HÔM NAY</b>`,
      `• <b>Hôm nay (${traffic.dayKey}):</b> <b>${traffic.todayVisits.toLocaleString('vi-VN')} lượt</b>`,
      `• So với hôm qua (${traffic.yesterdayVisits.toLocaleString('vi-VN')}): ${trendIcon} <b>${diffSign}${traffic.vsYesterdayDiff.toLocaleString('vi-VN')} lượt (${pctSign}${traffic.vsYesterdayPct}%)</b>`,
      `• Tuần này (${traffic.weekKey}): <b>${traffic.weekVisits.toLocaleString('vi-VN')} lượt</b>`,
      `• Tháng này (${traffic.monthKey}): <b>${traffic.monthVisits.toLocaleString('vi-VN')} lượt</b>`,
      `• Tổng tích lũy toàn hệ thống: <b>${traffic.allTimeVisits.toLocaleString('vi-VN')} lượt</b>`,
      `━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  // PHẦN 2: BÁO CÁO BIẾN ĐỘNG GIÁ TẤT CẢ SẢN PHẨM SO VỚI TRÊN WEB
  if (priceReport) {
    lines.push(
      `🏷️ <b>2. BIẾN ĐỘNG GIÁ SẢN PHẨM SO VỚI TRÊN WEB</b>`,
      `• Tổng sản phẩm đang bán trên web: <b>${priceReport.totalProducts} SKU</b>`,
      `• Khớp giá 100% với nguồn Hàn: <b>${priceReport.matchedCount} SKU</b>`,
      `• Phát hiện biến động giá: <b>${priceReport.discrepancyCount} SKU</b> (🔻 Giảm: <b>${priceReport.priceDropsCount}</b> | 🔺 Tăng: <b>${priceReport.priceIncreasesCount}</b>)`,
      `• Tỷ giá áp dụng: <code>1 KRW = ${krwRate} VNĐ</code> (Phí +${serviceFee}%)`
    );

    if (priceReport.discrepancies && priceReport.discrepancies.length > 0) {
      lines.push(``, `⚡ <b>CHI TIẾT SẢN PHẨM CÓ BIẾN ĐỘNG GIÁ:</b>`);

      const maxItems = 15;
      const topList = priceReport.discrepancies.slice(0, maxItems);

      topList.forEach((item, idx) => {
        const icon = item.changeType === 'drop' ? '🔻' : '🔺';
        const sign = item.changePercent > 0 ? '+' : '';
        const diffVndSign = item.diffVnd > 0 ? '+' : '';
        const shortName = item.name.length > 48 ? item.name.slice(0, 45) + '...' : item.name;

        lines.push(
          `${idx + 1}. ${icon} <b>[${escapeTelegramHtml(item.brand)}]</b> ${escapeTelegramHtml(shortName)}`,
          `   • Mã SKU: <code>${escapeTelegramHtml(item.goodsNo)}</code>`,
          `   • Giá Web hiện tại: <code>${item.webForeignPrice.toLocaleString('vi-VN')}₩</code> (${item.webPriceVnd.toLocaleString('vi-VN')}đ)`,
          `   • Giá Nguồn mới: <b>${item.sourceForeignPrice.toLocaleString('vi-VN')}₩</b> (<b>${item.sourcePriceVnd.toLocaleString('vi-VN')}đ</b>) [<b>${sign}${item.changePercent}%</b> | ${diffVndSign}${item.diffVnd.toLocaleString('vi-VN')}đ]`
        );
      });

      if (priceReport.discrepancies.length > maxItems) {
        lines.push(
          ``,
          `<i>... và còn ${priceReport.discrepancies.length - maxItems} sản phẩm biến động khác.</i>`
        );
      }

      lines.push(
        ``,
        `🛡️ <b>Chế độ an toàn:</b> Hệ thống giữ nguyên giá trên web và đã gắn nút <b>"Cập nhật giá mới"</b> tại trang Quản trị để A. Tân xem xét phê duyệt.`
      );
    } else {
      lines.push(
        ``,
        `✅ <b>Tuyệt vời!</b> Toàn bộ <b>${priceReport.totalProducts}/${priceReport.totalProducts}</b> sản phẩm đang bán trên web đều khớp chuẩn 100% với giá tại Hàn Quốc.`
      );
    }
  }

  lines.push(
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👉 Mở Quản Trị Kho Hàng: <a href="${adminUrl}">TAVY Admin Dashboard</a>`
  );

  return lines.join('\n');
}

/**
 * Gửi tin nhắn trực tiếp qua Telegram Bot API
 */
export async function sendTelegramMessage(text, customConfig = {}) {
  const cfg = {
    ...getLocalTelegramConfig(),
    ...customConfig
  };

  const botToken = String(cfg.botToken || '').trim();
  const chatId = String(cfg.chatId || '').trim();

  if (!botToken || !chatId) {
    return {
      success: false,
      error: 'Thiếu Telegram Bot Token hoặc Chat ID. Vui lòng kiểm tra trong mục Cài Đặt!'
    };
  }

  const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      return {
        success: false,
        error: data.description || `Telegram API lỗi HTTP ${response.status}`,
        raw: data
      };
    }

    return {
      success: true,
      messageId: data.result?.message_id,
      chatId: data.result?.chat?.id || chatId,
      sentAt: new Date().toISOString()
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Không thể kết nối tới máy chủ Telegram API'
    };
  }
}

/**
 * Thực thi trọn gói Báo cáo 20:00 (Lượt truy cập + Biến động giá) và gửi về Telegram
 */
export async function dispatchDaily8PmTelegramReport({
  products = [],
  siteTraffic = null,
  rates = null,
  liveSourcePricesMap = null,
  customConfig = {}
} = {}) {
  const now = new Date();
  const { dayKey } = getCurrentTimeKeys(now);

  // 1. Lấy dữ liệu lượng truy cập hôm nay
  let trafficSummary;
  if (siteTraffic && typeof siteTraffic.today === 'number') {
    const liveFromDb = await fetchLiveTrafficSummary(now);
    trafficSummary = {
      ...liveFromDb,
      todayVisits: Math.max(Number(siteTraffic.today) || 0, liveFromDb.todayVisits),
      weekVisits: Math.max(Number(siteTraffic.thisWeek) || 0, liveFromDb.weekVisits),
      monthVisits: Math.max(Number(siteTraffic.thisMonth) || 0, liveFromDb.monthVisits),
      yearVisits: Math.max(Number(siteTraffic.thisYear) || 0, liveFromDb.yearVisits),
      allTimeVisits: Math.max(Number(siteTraffic.allTime) || 0, liveFromDb.allTimeVisits)
    };
  } else {
    trafficSummary = await fetchLiveTrafficSummary(now);
  }

  // 2. Phân tích biến động giá tất cả sản phẩm so với web
  const priceReport = analyzeProductPriceVolatility(products, {
    rates,
    liveSourcePricesMap
  });

  // 3. Định dạng nội dung báo cáo
  const messageHtml = formatDaily8PmTelegramReport({
    traffic: trafficSummary,
    priceReport,
    rates,
    now
  });

  // 4. Gửi tới Bot Telegram
  const sendRes = await sendTelegramMessage(messageHtml, customConfig);

  if (sendRes.success) {
    await saveTelegramConfig({
      ...customConfig,
      lastSentAt: sendRes.sentAt,
      lastDailyReportDate: dayKey,
      lastStatus: 'sent_ok'
    });
  }

  return {
    ...sendRes,
    trafficSummary,
    priceReport,
    messageHtml
  };
}

/**
 * Áp dụng giá mới từ nguồn Hàn Quốc cho 1 sản phẩm khi Admin bấm nút "Cập nhật giá" trên Web
 */
export function applyPendingPriceToProduct(product, rates = {}) {
  if (!product) return product;
  const krwRate = Number(rates?.KRW?.rate || rates?.krwRate) || 19.5;
  const serviceFee = Number(rates?.serviceFeePercent) || 5;

  const pending = product.pendingPriceUpdate;
  const alert = product.priceChangeAlert;
  const verified = getOliveYoungVerifiedPrice(product.goodsNo || product.id);

  const oldWon = Number(product.foreignPrice || product.price) || 0;
  const newWon = Number(
    pending?.newForeignPrice ||
    alert?.pendingNewWon ||
    verified?.foreignPrice ||
    oldWon
  );
  const newOriginalWon = Number(
    pending?.newOriginalPrice ||
    verified?.originalPrice ||
    product.originalPrice ||
    newWon
  );

  const oldPriceVnd = Number(product.priceVnd) || calculateVndPrice(oldWon, krwRate, serviceFee);
  const newPriceVnd = calculateVndPrice(newWon, krwRate, serviceFee);
  const diffWon = newWon - oldWon;
  const diffVnd = newPriceVnd - oldPriceVnd;
  const changePercent = oldWon > 0 ? Math.round((diffWon / oldWon) * 1000) / 10 : 0;
  const changeType = diffWon < 0 ? 'drop' : (diffWon > 0 ? 'increase' : 'unchanged');

  const existingHistory = Array.isArray(product.priceHistory) ? product.priceHistory : [];
  const newHistoryEntry = {
    timestamp: new Date().toISOString(),
    oldForeignPrice: oldWon,
    newForeignPrice: newWon,
    oldPriceVnd,
    newPriceVnd,
    diffWon,
    diffVnd,
    changePercent,
    changeType,
    source: pending?.source || 'Admin Approved (Telegram Alert)',
    reason: `Admin duyệt cập nhật giá mới từ cảnh báo Telegram (${changePercent > 0 ? '+' : ''}${changePercent}%)`
  };

  return {
    ...product,
    foreignPrice: newWon,
    price: newWon,
    originalPrice: newOriginalWon,
    priceVnd: newPriceVnd,
    priceSyncStatus: 'synced_oliveyoung',
    priceLastSyncedAt: new Date().toISOString(),
    pendingPriceUpdate: null,
    priceChangeAlert: {
      hasChanged: false,
      changePercent: 0,
      changeType: 'unchanged',
      lastChecked: new Date().toISOString(),
      badgeText: ''
    },
    priceHistory: diffWon !== 0 ? [newHistoryEntry, ...existingHistory].slice(0, 50) : existingHistory
  };
}
