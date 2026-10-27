import { setTier, test } from '../framework/runner.js';
import {
  assert,
  assertEquals,
  assertContains
} from '../framework/assert.js';
import {
  DEFAULT_TELEGRAM_CONFIG,
  getLocalTelegramConfig,
  saveTelegramConfig,
  extractTrafficSummary,
  analyzeProductPriceVolatility,
  formatDaily8PmTelegramReport,
  applyPendingPriceToProduct
} from '../../src/services/telegramNotificationService.js';

setTier('Tier 1: Feature Coverage');

const testRates = {
  KRW: { rate: 19.5 },
  serviceFeePercent: 5
};

test('[F26-1] extractTrafficSummary accurately computes today, yesterday, week, month, and all-time traffic', () => {
  const fixedNow = new Date('2026-10-26T20:00:00+09:00');
  const analyticsData = {
    allTime: 1250,
    days: {
      '2026-10-26': 48,
      '2026-10-25': 32
    },
    weeks: {
      '2026-W44': 180
    },
    months: {
      '2026-10': 640
    },
    years: {
      '2026': 1250
    }
  };

  const summary = extractTrafficSummary(analyticsData, fixedNow);
  assertEquals(summary.dayKey, '2026-10-26', 'Day key should match 2026-10-26');
  assertEquals(summary.yesterdayKey, '2026-10-25', 'Yesterday key should match 2026-10-25');
  assertEquals(summary.todayVisits, 48, 'Today visits should be 48');
  assertEquals(summary.yesterdayVisits, 32, 'Yesterday visits should be 32');
  assertEquals(summary.diffVsYesterday, 16, 'Diff vs yesterday should be +16');
  assertEquals(summary.diffPercentVsYesterday, 50.0, 'Diff percent vs yesterday should be +50%');
  assertEquals(summary.allTimeVisits, 1250, 'All-time visits should be 1250');
});

test('[F26-2] analyzeProductPriceVolatility detects price drops & increases in Alert-Only mode without overwriting web prices', () => {
  const catalog = [
    {
      goodsNo: 'A000000223414',
      name: 'Mặt Nạ Giấy Mediheal Essential Sheet Mask',
      foreignPrice: 15000, // Web price is 15,000 Won; Olive Young verified price is 10,000 Won (Drop -33.3%)
      price: 15000
    },
    {
      goodsNo: 'A000000260530',
      name: 'Mặt Nạ Đất Sét Đậu Xanh Beplain Mung Bean Pore Clay',
      foreignPrice: 5000, // Web price is 5,000 Won; Olive Young verified price is 7,100 Won (Increase +42.0%)
      price: 5000
    },
    {
      goodsNo: 'A000000117541',
      name: 'Sữa Dưỡng Thể Nam ULOS All-In-One Moisturizing',
      foreignPrice: 23700, // Matches verified price 23,700 Won
      price: 23700
    }
  ];

  const report = analyzeProductPriceVolatility(catalog, { rates: testRates });

  assertEquals(report.totalProducts, 3, 'Should scan all 3 products');
  assertEquals(report.matchedCount, 1, '1 product matches source price');
  assertEquals(report.discrepancyCount, 2, '2 products have price discrepancies');
  assertEquals(report.priceDropsCount, 1, '1 product dropped in price');
  assertEquals(report.priceIncreasesCount, 1, '1 product increased in price');

  // Verify Alert-Only integrity: annotatedProducts must preserve original foreignPrice until Admin approves
  const annotatedDrop = report.annotatedProducts.find((p) => p.goodsNo === 'A000000223414');
  assertEquals(annotatedDrop.foreignPrice, 15000, 'Alert-Only mode must NOT automatically overwrite live foreignPrice');
  assert(annotatedDrop.pendingPriceUpdate.hasDiscrepancy, 'pendingPriceUpdate.hasDiscrepancy must be true');
  assertEquals(annotatedDrop.pendingPriceUpdate.newWon, 10000, 'pendingPriceUpdate.newWon should be 10,000 Won');
  assertEquals(annotatedDrop.pendingPriceUpdate.changeType, 'drop', 'changeType should be drop');
});

test('[F26-3] formatDaily8PmTelegramReport generates comprehensive 20:00 HTML report', () => {
  const fixedNow = new Date('2026-10-26T20:00:00+09:00');
  const traffic = extractTrafficSummary(
    {
      allTime: 500,
      days: { '2026-10-26': 25, '2026-10-25': 20 },
      weeks: { '2026-W44': 110 },
      months: { '2026-10': 320 }
    },
    fixedNow
  );
  const priceReport = analyzeProductPriceVolatility(
    [
      {
        goodsNo: 'A000000223414',
        name: 'Mediheal Mask',
        foreignPrice: 15000,
        price: 15000
      }
    ],
    { rates: testRates }
  );

  const html = formatDaily8PmTelegramReport({
    traffic,
    priceReport,
    rates: testRates,
    now: fixedNow
  });

  assertContains(html, 'BÁO CÁO VẬN HÀNH TAVY KOREA — 20:00 TỐI', 'Report header must include 20:00 title');
  assertContains(html, 'TỔNG LƯỢT TRUY CẬP WEBSITE HÔM NAY', 'Report must include today traffic section');
  assertContains(html, '25 lượt', 'Report must show 25 visits today');
  assertContains(html, 'BIẾN ĐỘNG GIÁ SẢN PHẨM SO VỚI TRÊN WEB', 'Report must include price volatility section');
  assertContains(html, 'A000000223414', 'Report must list the discrepant SKU');
  assertContains(html, 'Cập nhật giá', 'Report must guide Admin to use the update price button');
});

test('[F26-4] applyPendingPriceToProduct updates product price when Admin approves', () => {
  const report = analyzeProductPriceVolatility(
    [
      {
        goodsNo: 'A000000223414',
        name: 'Mediheal Mask',
        foreignPrice: 15000,
        price: 15000
      }
    ],
    { rates: testRates }
  );

  const discrepantProduct = report.annotatedProducts[0];
  const updated = applyPendingPriceToProduct(discrepantProduct, testRates);

  assertEquals(updated.foreignPrice, 10000, 'Approved product foreignPrice must update to 10,000 Won');
  assertEquals(updated.price, 10000, 'Approved product price must update to 10,000 Won');
  assertEquals(updated.priceVnd, 204750, 'Approved product priceVnd must equal 10,000 * 19.5 * 1.05 = 204,750 VND');
  assertEquals(updated.pendingPriceUpdate, null, 'pendingPriceUpdate must be cleared after Admin approval');
  assertEquals(updated.priceChangeAlert.hasChanged, false, 'priceChangeAlert.hasChanged must be cleared after approval');
  assertEquals(updated.priceHistory.length, 1, 'priceHistory must record the approved price update');
});

test('[F26-5] Telegram bot configuration persistence in localStorage', async () => {
  const saved = await saveTelegramConfig(
    {
      enabled: true,
      scheduleTime: '20:00',
      chatId: DEFAULT_TELEGRAM_CONFIG.chatId
    },
    { syncCloud: false }
  );

  assertEquals(saved.enabled, true, 'Telegram bot should be enabled');
  assertEquals(saved.scheduleTime, '20:00', 'Schedule time should be 20:00');

  const loaded = getLocalTelegramConfig();
  assertEquals(loaded.scheduleTime, '20:00', 'Loaded scheduleTime should persist as 20:00');
  assertEquals(loaded.chatId, DEFAULT_TELEGRAM_CONFIG.chatId, 'Loaded chatId should match default Chat ID');
});
