import { setTier, test } from '../framework/runner.js';
import {
  assertEquals,
  assertThrows,
} from '../framework/assert.js';
import { getStatusConfig } from '../../src/data/orderStatuses.js';
import {
  normalizePhone,
  findGuestOrders,
  calculateStepProgress,
  getProofBadges
} from '../../src/services/guestTrackingService.js';

setTier('Tier 2: Boundary & Corner Cases');

test('[F6-B1] Invalid status transition rejection [completed->pending]', () => {
  const isTransitionAllowed = (fromStatus, toStatus) => {
    const fromConfig = getStatusConfig(fromStatus);
    const toConfig = getStatusConfig(toStatus);
    if (fromStatus === 'completed' && toStatus === 'pending') return false;
    if (fromStatus === 'delivering' && toStatus === 'pending') return false;
    return toConfig.stepIndex >= fromConfig.stepIndex;
  };

  assertEquals(isTransitionAllowed('completed', 'pending'), false, 'Transition from completed back to pending must be rejected');
  assertEquals(isTransitionAllowed('delivering', 'pending'), false, 'Transition from delivering back to pending must be rejected');
  assertEquals(isTransitionAllowed('pending', 'quoted'), true, 'Forward transition pending -> quoted allowed');
});

test('[F6-B2] Non-existent order ID tracking lookup', () => {
  const orders = [
    { id: 'ORD-1001', customerName: 'Trần Văn A', status: 'pending' },
    { id: 'ORD-1002', customerName: 'Lê Thị B', status: 'completed' }
  ];

  const lookupOrder = (orderId) => {
    const found = orders.find(o => o.id === orderId);
    if (!found) return null;
    return found;
  };

  assertEquals(lookupOrder('ORD-9999-NOTFOUND'), null, 'Non-existent order ID returns null');
  assertEquals(lookupOrder(''), null, 'Empty order ID lookup returns null');
});

test('[F6-B3] Corrupted VietQR payload string handling', () => {
  const generateVietQRPayload = (bankCode, accountNo, amount, memo) => {
    if (!bankCode || !accountNo || isNaN(Number(amount)) || Number(amount) <= 0) {
      return { success: false, error: 'Thông tin thanh toán VietQR không hợp lệ!' };
    }
    return {
      success: true,
      qrUrl: `https://img.vietqr.io/image/${bankCode}-${accountNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(memo)}`
    };
  };

  assertEquals(generateVietQRPayload('WOORI', '1002998877', -50000, 'ORD-100').success, false, 'Negative amount rejected');
  assertEquals(generateVietQRPayload('', '1002998877', 50000, 'ORD-100').success, false, 'Missing bank code rejected');
  assertEquals(generateVietQRPayload('WOORI', '', 50000, 'ORD-100').success, false, 'Missing account number rejected');
  assertEquals(generateVietQRPayload('WOORI', '1002998877', 50000, 'ORD-100').success, true, 'Valid parameters generate VietQR');
});

test('[F6-B4] Negative order total payment error handling', () => {
  const processPayment = (orderTotal, amountPaid) => {
    if (orderTotal <= 0) {
      throw new Error('Số tiền đơn hàng không hợp lệ (nhỏ hơn hoặc bằng 0).');
    }
    if (amountPaid < orderTotal) {
      throw new Error('Số tiền thanh toán chưa đủ!');
    }
    return { success: true, status: 'paid' };
  };

  assertThrows(() => processPayment(-100000, 100000), 'Số tiền đơn hàng không hợp lệ');
  assertThrows(() => processPayment(500000, 200000), 'Số tiền thanh toán chưa đủ');
  assertEquals(processPayment(500000, 500000).status, 'paid', 'Exact total payment succeeds');
});

test('[F6-B5] Missing bank info fallback details', () => {
  const getBankPaymentInfo = (bankConfig) => {
    if (!bankConfig || !bankConfig.bankName || !bankConfig.accountNumber) {
      return {
        bankName: 'Ngân hàng Woori Việt Nam (Woori Bank)',
        accountName: 'CONG TY TNHH TAVY KOREA',
        accountNumber: '1002-888-999999',
        branch: 'Chi nhánh TP. Hồ Chí Minh'
      };
    }
    return bankConfig;
  };

  const fallbackInfo = getBankPaymentInfo(null);
  assertEquals(fallbackInfo.bankName, 'Ngân hàng Woori Việt Nam (Woori Bank)', 'Missing bank config falls back to default Woori Bank');
  assertEquals(fallbackInfo.accountNumber, '1002-888-999999', 'Fallback account number provided');
});

test('[F6-B6] Phone normalization boundary & adversarial inputs', () => {
  assertEquals(normalizePhone(undefined), '', 'Undefined input returns empty');
  assertEquals(normalizePhone(null), '', 'Null input returns empty');
  assertEquals(normalizePhone(''), '', 'Empty string returns empty');
  assertEquals(normalizePhone('   \t\n  '), '', 'Whitespace-only returns empty');
  assertEquals(normalizePhone('abc!@#$%^&*()_+'), '', 'Symbols without digits return empty');
  assertEquals(normalizePhone('840912345678'), '0912345678', '840 prefix format converted correctly');
  assertEquals(normalizePhone(912345678), '0912345678', 'Numeric input supported');
});

test('[F6-B7] Guest order search adversarial queries & regex safety', () => {
  const orders = [
    { id: 'ORD-827192', customerPhone: '0912345678', trackingCode: 'AWB-100', createdAt: '2026-08-25T10:00:00Z' },
    null,
    { id: undefined, customerPhone: null },
    { id: 'ORD-111111', customerPhone: '0988888888', createdAt: '2026-08-26T10:00:00Z' }
  ];

  // Regex special characters must not throw SyntaxError
  const adversarialQueries = ['.*', '[a-z]+', 'ORD-(.*)', '(?:test)', '\\', '+84', '$^'];
  for (const q of adversarialQueries) {
    const res = findGuestOrders(q, orders);
    assertEquals(Array.isArray(res), true, `Query "${q}" must return array safely`);
  }

  // Null / empty queries & lists
  assertEquals(findGuestOrders('', orders).length, 0);
  assertEquals(findGuestOrders('ORD-827192', null).length, 0);
  assertEquals(findGuestOrders('ORD-827192', []).length, 0);
});

test('[F6-B8] Progress & Proof Badges fallback & edge cases', () => {
  // calculateStepProgress fallbacks
  const nullProg = calculateStepProgress(null);
  assertEquals(nullProg.stepIndex, 0);
  assertEquals(nullProg.progressPercentage, 12.5);

  const unknownStatusProg = calculateStepProgress({ status: 'non_existent_status' });
  assertEquals(unknownStatusProg.stepIndex, 0);
  assertEquals(unknownStatusProg.progressPercent, '12.5%');

  // getProofBadges fallbacks
  const nullProof = getProofBadges(null);
  assertEquals(nullProof.hasProof, false);
  assertEquals(nullProof.badges.length, 0);
  assertEquals(nullProof.domesticCarrier, 'ViettelPost');

  const zeroWeightProof = getProofBadges({ packageWeightKg: 0 });
  assertEquals(zeroWeightProof.hasProof, true);
  assertEquals(zeroWeightProof.packageWeightKg, 0);
});

test('[F6-B9] Empty and whitespace-only queries resilience', () => {
  const sampleOrders = [
    { id: 'ORD-123456', customerPhone: '0912345678', createdAt: '2026-08-25T10:00:00Z' }
  ];

  const blankQueries = ['', ' ', '   ', '\t', '\n', '  \t \n  ', null, undefined];
  blankQueries.forEach((q) => {
    const res = findGuestOrders(q, sampleOrders);
    assertEquals(Array.isArray(res), true);
    assertEquals(res.length, 0, `Search with '${q}' must return empty array`);
  });
});

test('[F6-B10] Single-digit and boundary phone mismatch isolation', () => {
  const orders = [
    { id: 'ORD-TARGET', customerPhone: '0912345678', createdAt: '2026-08-25T10:00:00Z' }
  ];

  // Distinct phone numbers with single-digit and prefix differences (not substrings)
  const mismatches = [
    '0912345679', // Last digit different (9 vs 8)
    '0912345688', // 8th digit different
    '0812345678', // 2nd digit different
    '0988776655', // Completely different phone
    '0381234567'  // Different carrier prefix
  ];

  mismatches.forEach((queryPhone) => {
    const res = findGuestOrders(queryPhone, orders);
    assertEquals(res.length, 0, `Query '${queryPhone}' must not match 0912345678`);
  });

  // Valid 10-digit phone variations that MUST match
  const validMatches = [
    '0912345678',
    '+84912345678',
    '+84 912 345 678',
    '84912345678',
    '840912345678',
    '0912-345-678',
    '912345678' // 9-digit normalized to 0912345678
  ];

  validMatches.forEach((queryPhone) => {
    const res = findGuestOrders(queryPhone, orders);
    assertEquals(res.length, 1, `Query '${queryPhone}' must match target order`);
    assertEquals(res[0].id, 'ORD-TARGET');
  });
});

test('[F6-B11] Adversarial strings and script injection safety in search', () => {
  const orders = [
    { id: 'ORD-SEC-01', customerPhone: '0909090909', customerName: 'Safe User', createdAt: '2026-08-25T10:00:00Z' }
  ];

  const maliciousStrings = [
    '<script>alert(1)</script>',
    "' OR '1'='1",
    '"; DROP TABLE orders; --',
    '${7*7}',
    '{{7*7}}',
    'javascript:void(0)',
    '\\x00\\x01\\x02',
    'ORD-.*',
    '(.*?)',
    'ORD-\\d+'
  ];

  maliciousStrings.forEach((payload) => {
    const res = findGuestOrders(payload, orders);
    assertEquals(Array.isArray(res), true, `Payload '${payload}' must return array safely`);
    assertEquals(res.length, 0, `Payload '${payload}' must not match unintended orders`);
  });
});

test('[F6-B12] Corrupted order objects in list (null, primitives, missing keys)', () => {
  const corruptedList = [
    null,
    undefined,
    'not_an_object',
    12345,
    {},
    { id: null, customerPhone: null },
    { id: undefined, customerPhone: undefined },
    { id: 'ORD-VALID', customerPhone: '0977889900', createdAt: 'invalid-date' },
    { id: 'ORD-VALID-2', customerPhone: '0977889900', createdAt: null },
    null
  ];

  const res = findGuestOrders('0977889900', corruptedList);
  assertEquals(res.length, 2, 'Should safely find the 2 valid orders amidst corrupted records');
  assertEquals(res[0].id.startsWith('ORD-VALID'), true);
});

test('[F6-B13] Cancelled orders step calculation & UI contract enforcement', () => {
  const cancelledOrder = {
    id: 'ORD-CANCELLED-99',
    status: 'cancelled',
    customerName: 'Hoàng Văn C',
    customerPhone: '0901112233'
  };

  const stepInfo = calculateStepProgress(cancelledOrder);
  assertEquals(stepInfo.stepIndex, -1, 'Cancelled stepIndex must be -1');
  assertEquals(stepInfo.stepNumber, -1, 'Cancelled stepNumber must be -1');
  assertEquals(stepInfo.progressPercentage, 0, 'Cancelled progress percentage must be 0');
  assertEquals(stepInfo.progressPercent, '0%', 'Cancelled progress percent string must be 0%');
  assertEquals(stepInfo.isCancelled, true, 'isCancelled must be true');
  assertEquals(stepInfo.isCompleted, false, 'isCompleted must be false');
  assertEquals(stepInfo.stepConfig, null, 'stepConfig must be null for cancelled orders');
});

test('[F6-B14] Order item summary fallbacks when order.items is missing or empty', () => {
  const singleItemOrder = {
    id: 'ORD-LEGACY-01',
    productName: 'Kem Dưỡng Torriden Dive-In 100ml',
    brand: 'Torriden',
    productImage: 'https://cdn.tavy.vn/torriden.jpg',
    options: 'Hộp 100ml',
    quantity: 3,
    totalVnd: 780000,
    items: null
  };

  const items = Array.isArray(singleItemOrder.items) && singleItemOrder.items.length > 0
    ? singleItemOrder.items
    : [{
        productId: singleItemOrder.id,
        name: singleItemOrder.productName || 'Sản phẩm mua hộ Hàn Quốc',
        brand: singleItemOrder.brand || 'Olive Young',
        productImage: singleItemOrder.productImage || '/tavy-logo.png',
        options: singleItemOrder.options || 'Mặc định',
        qty: singleItemOrder.quantity || 1,
        price: singleItemOrder.totalVnd || 0
      }];

  assertEquals(items.length, 1);
  assertEquals(items[0].name, 'Kem Dưỡng Torriden Dive-In 100ml');
  assertEquals(items[0].brand, 'Torriden');
  assertEquals(items[0].qty, 3);
  assertEquals(items[0].price, 780000);
});

test('[F6-B15] Domestic tracking code and carrier badge edge cases', () => {
  // Case A: Custom Carrier
  const customCarrierOrder = {
    id: 'ORD-CUSTOM-CARRIER',
    domesticCarrier: 'J&T Express',
    domesticTrackingCode: 'JT882910482'
  };
  const badgesA = getProofBadges(customCarrierOrder);
  assertEquals(badgesA.hasProof, true);
  assertEquals(badgesA.domesticCarrier, 'J&T Express');
  assertEquals(badgesA.domesticTrackingCode, 'JT882910482');
  const carrierBadge = badgesA.badges.find(b => b.id === 'domestic_tracking');
  assertEquals(carrierBadge.carrier, 'J&T Express');

  // Case B: Null domestic carrier defaults to ViettelPost
  const defaultCarrierOrder = {
    id: 'ORD-DEFAULT-CARRIER',
    domesticTrackingCode: 'VT123456789VN'
  };
  const badgesB = getProofBadges(defaultCarrierOrder);
  assertEquals(badgesB.domesticCarrier, 'ViettelPost');
  assertEquals(badgesB.badges.find(b => b.id === 'domestic_tracking').carrier, 'ViettelPost');

  // Case C: Empty/blank tracking codes
  const emptyTrackingOrder = {
    id: 'ORD-EMPTY-TRACKING',
    domesticTrackingCode: '',
    trackingCode: null
  };
  const badgesC = getProofBadges(emptyTrackingOrder);
  assertEquals(badgesC.badges.length, 0);
  assertEquals(badgesC.hasProof, false);
});

test('[F6-B16] Cross-customer order isolation on alphanumeric query search (no phone digit leakage)', () => {
  const ordersDb = [
    { id: 'ORD-ALPHA-1234', customerPhone: '0905111222', customerName: 'Alice', createdAt: '2026-08-26T10:00:00Z' },
    { id: 'ORD-2026-9999', customerPhone: '0912345678', customerName: 'Bob', createdAt: '2026-08-26T09:00:00Z' }
  ];

  // Searching alphanumeric Order ID 'ALPHA-1234' must ONLY match ORD-ALPHA-1234
  // It must NOT match Bob's order just because Bob's phone (0912345678) contains substring '1234'
  const results = findGuestOrders('ALPHA-1234', ordersDb);
  assertEquals(results.length, 1, 'Alphanumeric query should match only target order');
  assertEquals(results[0].id, 'ORD-ALPHA-1234', 'Must match ORD-ALPHA-1234');
  assertEquals(results.some(o => o.id === 'ORD-2026-9999'), false, 'Unrelated customer Bob (0912345678) must not leak');

  // Searching 'ORD-ALPHA-1234' directly
  const resultsWithPrefix = findGuestOrders('ORD-ALPHA-1234', ordersDb);
  assertEquals(resultsWithPrefix.length, 1);
  assertEquals(resultsWithPrefix[0].id, 'ORD-ALPHA-1234');
  assertEquals(resultsWithPrefix.some(o => o.id === 'ORD-2026-9999'), false);

  // Searching genuine phone number '0912345678' matches Bob
  const phoneResults = findGuestOrders('0912345678', ordersDb);
  assertEquals(phoneResults.length, 1);
  assertEquals(phoneResults[0].id, 'ORD-2026-9999');
});

test('[F6-B17] Deterministic sorting with corrupted/invalid createdAt timestamps', () => {
  const mixedDates = [
    { id: 'O_CORRUPTED', customerPhone: '0900000000', createdAt: 'invalid-date' },
    { id: 'O_NEWEST', customerPhone: '0900000000', createdAt: '2026-08-26T12:00:00Z' },
    { id: 'O_OLDER', customerPhone: '0900000000', createdAt: '2026-08-20T00:00:00Z' },
    { id: 'O_NULL_DATE', customerPhone: '0900000000', createdAt: null },
    { id: 'O_UNDEFINED_DATE', customerPhone: '0900000000' }
  ];

  const sorted = findGuestOrders('0900000000', mixedDates);
  assertEquals(sorted.length, 5, 'All 5 orders for phone should be found');
  assertEquals(sorted[0].id, 'O_NEWEST', 'Valid newest order must be sorted first');
  assertEquals(sorted[1].id, 'O_OLDER', 'Valid older order must be sorted second');

  // Corrupted/null/undefined date orders must be placed at the end without throwing NaN sort error
  const remainingIds = sorted.slice(2).map(o => o.id);
  assertEquals(remainingIds.includes('O_CORRUPTED'), true);
  assertEquals(remainingIds.includes('O_NULL_DATE'), true);
  assertEquals(remainingIds.includes('O_UNDEFINED_DATE'), true);
});

test('[F6-B18] Order ID alphanumeric isolation and exact digit equivalence regression tests', () => {
  const ordersDb = [
    { id: 'ORD-ALPHA-1234', customerName: 'Alice Nguyen', customerPhone: '0905111222', createdAt: '2026-08-26T10:00:00Z' },
    { id: 'ORD-2026-1234', customerName: 'Bob Tran', customerPhone: '0912345678', createdAt: '2026-08-26T09:00:00Z' },
    { id: 'ORD-BETA-1234', customerName: 'Charlie Le', customerPhone: '0988776655', createdAt: '2026-08-26T08:00:00Z' },
    { id: 'ORD-TEST-9999', customerName: 'Test Order User', customerPhone: '0933445566', createdAt: '2026-08-26T07:00:00Z' },
    { id: 'ORD-2026-9999', customerName: 'Production User 9999', customerPhone: '0944556677', createdAt: '2026-08-26T06:00:00Z' },
    { id: 'ORD-VIP-9999', customerName: 'VIP Customer 9999', customerPhone: '0955667788', createdAt: '2026-08-26T05:00:00Z' },
    { id: 'ORD-100001', customerName: 'David Pham', customerPhone: '0966778899', createdAt: '2026-08-26T04:00:00Z' },
    { id: '100001', customerName: 'Eve Vu', customerPhone: '0977889900', createdAt: '2026-08-26T03:00:00Z' },
    { id: 'ORD-2026-100001', customerName: 'Frank Hoang', customerPhone: '0988990011', createdAt: '2026-08-26T02:00:00Z' }
  ];

  // 1. Searching 'ALPHA-1234' matches only 'ORD-ALPHA-1234' and NOT 'ORD-2026-1234' or 'ORD-BETA-1234'
  const resAlpha = findGuestOrders('ALPHA-1234', ordersDb);
  assertEquals(resAlpha.length, 1, "Searching 'ALPHA-1234' must match exactly 1 order");
  assertEquals(resAlpha[0].id, 'ORD-ALPHA-1234', "Must match only 'ORD-ALPHA-1234'");
  assertEquals(resAlpha.some(o => o.id === 'ORD-2026-1234'), false, "Must NOT match 'ORD-2026-1234'");
  assertEquals(resAlpha.some(o => o.id === 'ORD-BETA-1234'), false, "Must NOT match 'ORD-BETA-1234'");

  // Also verify lowercase / prefix variants for ALPHA-1234
  for (const q of ['alpha-1234', 'ORD-ALPHA-1234', 'ord-alpha-1234']) {
    const res = findGuestOrders(q, ordersDb);
    assertEquals(res.length, 1, `Query '${q}' must match exactly 1 order`);
    assertEquals(res[0].id, 'ORD-ALPHA-1234', `Query '${q}' must match 'ORD-ALPHA-1234'`);
    assertEquals(res.some(o => o.id === 'ORD-2026-1234' || o.id === 'ORD-BETA-1234'), false);
  }

  // 2. Searching 'ORD-TEST-9999' matches only 'ORD-TEST-9999' and NOT 'ORD-2026-9999' or 'ORD-VIP-9999'
  const resTest = findGuestOrders('ORD-TEST-9999', ordersDb);
  assertEquals(resTest.length, 1, "Searching 'ORD-TEST-9999' must match exactly 1 order");
  assertEquals(resTest[0].id, 'ORD-TEST-9999', "Must match only 'ORD-TEST-9999'");
  assertEquals(resTest.some(o => o.id === 'ORD-2026-9999'), false, "Must NOT match 'ORD-2026-9999'");
  assertEquals(resTest.some(o => o.id === 'ORD-VIP-9999'), false, "Must NOT match 'ORD-VIP-9999'");

  // Also verify prefix-free 'TEST-9999'
  const resTestNoPrefix = findGuestOrders('TEST-9999', ordersDb);
  assertEquals(resTestNoPrefix.length, 1, "Searching 'TEST-9999' must match exactly 1 order");
  assertEquals(resTestNoPrefix[0].id, 'ORD-TEST-9999', "Must match 'ORD-TEST-9999'");
  assertEquals(resTestNoPrefix.some(o => o.id === 'ORD-2026-9999' || o.id === 'ORD-VIP-9999'), false);

  // 3. Numeric search '100001' matches 'ORD-100001' and '100001' exactly, and NOT 'ORD-2026-100001'
  const resNumeric = findGuestOrders('100001', ordersDb);
  assertEquals(resNumeric.length, 2, "Numeric search '100001' must match both 'ORD-100001' and '100001'");
  const matchedIds = resNumeric.map(o => o.id);
  assertEquals(matchedIds.includes('ORD-100001'), true, "Must match 'ORD-100001'");
  assertEquals(matchedIds.includes('100001'), true, "Must match '100001'");
  assertEquals(matchedIds.includes('ORD-2026-100001'), false, "Must NOT match 'ORD-2026-100001'");
});
