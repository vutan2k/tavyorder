import { setTier, test } from '../framework/runner.js';
import {
  assert,
  assertEquals,
  assertDeepEquals,
  assertGreaterThan,
} from '../framework/assert.js';
import {
  getOrderTotalVnd,
  getVndFromWon,
  formatVnd,
  formatKrw
} from '../../src/utils/priceCalculator.js';
import {
  syncProductPriceWithOliveYoung,
  syncAllProductsWithOliveYoung,
  VERIFIED_OLIVEYOUNG_PRICES
} from '../../src/services/oliveYoungPriceSyncService.js';

setTier('Tier 1: Feature Coverage');

const standardRates = {
  KRW: { code: 'KRW', rate: 19.5 },
  USD: { code: 'USD', rate: 25500 },
  serviceFeePercent: 5.0
};

test('[F17-1] getOrderTotalVnd with explicit totalVnd and quote.totalVnd', () => {
  const orderWithTotal = { id: 'ORD-001', totalVnd: 500000, foreignPrice: 10000 };
  assertEquals(getOrderTotalVnd(orderWithTotal, standardRates), 500000, 'Explicit totalVnd should take highest priority');

  const orderWithQuote = { id: 'ORD-002', quote: { totalVnd: 350000 }, foreignPrice: 10000 };
  assertEquals(getOrderTotalVnd(orderWithQuote, standardRates), 350000, 'Quote totalVnd should be used when totalVnd is missing');
});

test('[F17-2] getOrderTotalVnd with multi-item cart items and service fee multiplier', () => {
  const multiItemOrder = {
    id: 'ORD-003',
    items: [
      { productId: 'p1', name: 'Item 1', foreignPrice: 10000, qty: 2 }, // 10000 * 19.5 * 1.05 = 204,750 * 2 = 409,500
      { productId: 'p2', name: 'Item 2', price: 150000, qty: 1 }        // explicit price = 150,000
    ]
  };

  const expectedTotal = (Math.round(10000 * 19.5 * 1.05) * 2) + 150000;
  assertEquals(getOrderTotalVnd(multiItemOrder, standardRates), expectedTotal, 'Multi-item cart total should correctly include service fee');
  assertEquals(getOrderTotalVnd(multiItemOrder, 19.5, 5.0), expectedTotal, 'Multi-item cart total should work with numeric krwRate and serviceFee args');

  // Exact 0-dong discrepancy test with fractional .5 amounts
  const fractionalOrder = {
    items: [
      { foreignPrice: 10700, qty: 1 }, // 10700 * 19.1 * 1.35 = 275899.5 -> 275900
      { foreignPrice: 15500, qty: 1 }  // 15500 * 19.1 * 1.35 = 399667.5 -> 399668
    ]
  };
  const fractionalRates = { KRW: { rate: 19.1 }, serviceFeePercent: 35 };
  assertEquals(getOrderTotalVnd(fractionalOrder, fractionalRates), 275900 + 399668, 'Sum of line items must equal order total with 0-dong discrepancy');
});

test('[F17-3] getOrderTotalVnd with single foreign price fallback and custom exchange rate', () => {
  const customRates = {
    KRW: { rate: 20.0 },
    serviceFeePercent: 10.0
  };
  const singleOrder = { id: 'ORD-004', foreignPrice: 30000, qty: 2 };
  // 30,000 * 20.0 * 1.10 * 2 = 1,320,000 VND
  assertEquals(getOrderTotalVnd(singleOrder, customRates), 1320000, 'Single item total should scale with rates, serviceFee, and qty');
});

test('[F17-4] getOrderTotalVnd edge cases: null, undefined, empty items', () => {
  assertEquals(getOrderTotalVnd(null, standardRates), 0, 'Null order returns 0');
  assertEquals(getOrderTotalVnd(undefined, standardRates), 0, 'Undefined order returns 0');
  assertEquals(getOrderTotalVnd({}, standardRates), 0, 'Empty order returns 0');
  assertEquals(getOrderTotalVnd({ items: [] }, standardRates), 0, 'Empty items order returns 0');
});

test('[F17-5] getVndFromWon and currency formatters (formatVnd, formatKrw)', () => {
  // getVndFromWon: 10000 Won * 19.5 * 1.05 = 204,750 VND
  assertEquals(getVndFromWon(10000, standardRates), 204750, '10,000 Won should convert to 204,750 VND');

  assertEquals(formatVnd(204750), '204.750 VNĐ', 'formatVnd should format numbers with dot separator');
  assertEquals(formatVnd(0), '0 VNĐ', 'formatVnd(0) should format as 0 VNĐ');
  assertEquals(formatVnd(null), '0 VNĐ', 'formatVnd(null) should format safely');

  assertEquals(formatKrw(25000), '₩25,000', 'formatKrw should format with Korean Won symbol and separator');
  assertEquals(formatKrw(null), '₩0', 'formatKrw(null) should return ₩0');
});

test('[F17-6] Honest Price Sync: Verified item receives synced_oliveyoung', () => {
  const knownGoodsNo = 'A000000223414'; // Mediheal Sheet Mask (10,000 Won sale, 20,000 Won orig)
  const product = {
    id: knownGoodsNo,
    goodsNo: knownGoodsNo,
    name: 'Mediheal Mask Sample',
    foreignPrice: 15000
  };

  const synced = syncProductPriceWithOliveYoung(product);
  assertEquals(synced.priceSyncStatus, 'synced_oliveyoung', 'Verified product must receive synced_oliveyoung');
  assertEquals(synced.foreignPrice, 10000, 'Sale price must match verified catalog price');
  assertEquals(synced.originalPrice, 20000, 'Original price must match verified catalog original price');
});

test('[F17-7] Honest Price Sync: Unverified item receives unverified without fake 1.2x price (RULE 0)', () => {
  const unverifiedProduct = {
    id: 'UNKNOWN_999999',
    goodsNo: 'UNKNOWN_999999',
    name: 'Mỹ phẩm chưa xác thực',
    foreignPrice: 35000,
    originalPrice: 35000
  };

  const synced = syncProductPriceWithOliveYoung(unverifiedProduct);
  assertEquals(synced.priceSyncStatus, 'unverified', 'Unverified product must be marked unverified');
  assertEquals(synced.foreignPrice, 35000, 'Price must NOT be modified with fake multiplier');
  assertEquals(synced.originalPrice, 35000, 'Original price must NOT have fake 1.2x markup');
});

test('[F17-8] syncAllProductsWithOliveYoung accurately reports verifiedCount and unverifiedCount', () => {
  const testCatalog = [
    { goodsNo: 'A000000223414', foreignPrice: 12000 }, // Verified (Mediheal 10,000W)
    { goodsNo: 'UNKNOWN_111', foreignPrice: 20000 },    // Unverified
    { goodsNo: 'A000000219553', foreignPrice: 17900 }  // Verified (Goodal 17,900W)
  ];

  const result = syncAllProductsWithOliveYoung(testCatalog);
  assertEquals(result.totalScanned, 3, 'Total scanned should be 3');
  assertEquals(result.verifiedCount, 2, 'Verified count should be 2');
  assertEquals(result.unverifiedCount, 1, 'Unverified count should be 1');
  assertEquals(result.updatedCount, 1, 'Only A000000223414 has price diff (12000 -> 10000)');
});
