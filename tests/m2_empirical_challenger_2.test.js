/**
 * tests/m2_empirical_challenger_2.test.js
 * Comprehensive Empirical Challenge Suite for Milestone 2:
 * 1. XSS Sanitization & URL Defense (sanitizeText, sanitizeUrl, escapeHtml, sanitizeOrderPayload)
 * 2. Invisible Honeypot Bot Rejection & Order Shielding
 * 3. Client Order Rate Limiting (3 orders / 5 min sliding window) & Cart Preservation
 * 4. Admin Auth Guard HMAC Verification & Brute-Force Lockout
 */

import {
  escapeHtml,
  sanitizeText,
  sanitizePhone,
  isValidVietnamesePhone,
  isValidHttpUrl,
  sanitizeUrl,
  isHoneypotTriggered,
  checkOrderRateLimit,
  recordOrderCreationTimestamp,
  sanitizeOrderPayload
} from '../src/utils/securityUtils.js';

import {
  getLockoutStatus,
  recordFailedAttempt,
  recordSuccessfulLogin,
  createAdminSession,
  verifyAdminSession,
  touchAdminSession,
  clearAdminSession,
  AUTH_GUARD_CONFIG
} from '../src/utils/adminAuthGuard.js';

import { getEmbedVideoUrl } from '../src/utils/videoUrlHelper.js';

// Setup Mock Storage for Node.js test environment
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(k) {
    return this.store[k] !== undefined ? this.store[k] : null;
  }
  setItem(k, v) {
    this.store[k] = String(v);
  }
  removeItem(k) {
    delete this.store[k];
  }
  clear() {
    this.store = {};
  }
}

globalThis.localStorage = new MockLocalStorage();

console.log('='.repeat(80));
console.log('  MILESTONE 2: EMPIRICAL CHALLENGER 2 STRESS HARNESS');
console.log('='.repeat(80));

let totalPassed = 0;
let totalFailed = 0;
const failureDetails = [];

function assert(condition, testName, extraInfo = '') {
  if (condition) {
    totalPassed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    totalFailed++;
    const msg = `  [FAIL] ${testName} ${extraInfo ? '(' + extraInfo + ')' : ''}`;
    console.error(msg);
    failureDetails.push(msg);
  }
}

async function runAllChallenges() {
  // ============================================================================
  // CHALLENGE 1: XSS SANITIZATION & URL DEFENSE
  // ============================================================================
  console.log('\n--- [CHALLENGE 1] XSS Sanitization & URL Defense ---');

  // Vector 1: <script>alert(1)</script>
  const v1Text = sanitizeText('<script>alert(1)</script>');
  assert(v1Text === '', 'Vector 1: sanitizeText("<script>alert(1)</script>") is empty', `Got: "${v1Text}"`);
  const v1Url = sanitizeUrl('<script>alert(1)</script>', '');
  assert(v1Url === '', 'Vector 1: sanitizeUrl("<script>alert(1)</script>") returns empty fallback', `Got: "${v1Url}"`);

  // Vector 2: <img src=x onerror=alert(1)>
  const v2Text = sanitizeText('<img src=x onerror=alert(1)>');
  assert(v2Text === '', 'Vector 2: sanitizeText("<img src=x onerror=alert(1)>") is empty', `Got: "${v2Text}"`);
  const v2Url = sanitizeUrl('<img src=x onerror=alert(1)>', '');
  assert(v2Url === '', 'Vector 2: sanitizeUrl("<img src=x onerror=alert(1)>") returns empty fallback', `Got: "${v2Url}"`);

  // Vector 3: javascript:alert(1)
  const v3Text = sanitizeText('javascript:alert(1)');
  assert(v3Text === 'alert(1)', 'Vector 3: sanitizeText("javascript:alert(1)") strips pseudo-protocol', `Got: "${v3Text}"`);
  const v3Url = sanitizeUrl('javascript:alert(1)', '');
  assert(v3Url === '', 'Vector 3: sanitizeUrl("javascript:alert(1)") returns empty fallback', `Got: "${v3Url}"`);

  // Adversarial XSS Variations
  const adv1 = sanitizeText('<SCRIPT>alert(1)</SCRIPT>');
  assert(adv1 === '', 'Uppercase <SCRIPT> tag stripped completely');

  const adv2 = sanitizeText('<script src="http://attacker.com/evil.js"></script>');
  assert(adv2 === '', 'External script tags stripped completely');

  const adv3 = sanitizeText('Hello <script>evil()</script>World');
  assert(adv3 === 'Hello World' || adv3 === 'Hello  World', 'Inline script tag stripped cleanly leaving text');

  const adv4 = sanitizeText('<iframe src="javascript:alert(1)"></iframe>');
  assert(adv4 === '', 'Iframe with javascript protocol stripped');

  const adv5 = sanitizeText('<object data="javascript:alert(1)"></object>');
  assert(adv5 === '', 'Object tag stripped');

  const adv6 = sanitizeText('<embed src="javascript:alert(1)">');
  assert(adv6 === '', 'Embed tag stripped');

  const adv7 = sanitizeText('Click <a href="#" onclick="alert(1)">here</a>');
  assert(!adv7.includes('onclick='), 'Inline event handler onclick stripped');

  const adv8 = sanitizeText('User onmouseover=alert(1) test');
  assert(!adv8.includes('onmouseover='), 'Inline event handler onmouseover stripped');

  const adv9 = sanitizeText('vbscript:msgbox(1)');
  assert(adv9 === 'msgbox(1)', 'VBScript pseudo-protocol stripped');

  // URL Hardening Tests
  assert(isValidHttpUrl('http://oliveyoung.co.kr/product/123') === true, 'Valid HTTP URL accepted');
  assert(isValidHttpUrl('https://tavyorder.web.app') === true, 'Valid HTTPS URL accepted');
  assert(isValidHttpUrl('javascript:alert(1)') === false, 'javascript: URL rejected by isValidHttpUrl');
  assert(isValidHttpUrl('data:text/html,<script>alert(1)</script>') === false, 'data: URL rejected by isValidHttpUrl');
  assert(isValidHttpUrl('vbscript:alert(1)') === false, 'vbscript: URL rejected by isValidHttpUrl');
  assert(isValidHttpUrl('//attacker.com/xss') === false, 'Protocol-relative URL rejected');
  assert(isValidHttpUrl('/local/path') === false, 'Relative path rejected by isValidHttpUrl');
  assert(isValidHttpUrl('ftp://example.com/file') === false, 'FTP protocol rejected');

  // Video Helper URL Sanitization
  assert(getEmbedVideoUrl('javascript:alert(1)') === '', 'getEmbedVideoUrl rejects javascript: protocol');
  assert(getEmbedVideoUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==') === '', 'getEmbedVideoUrl rejects data: protocol');

  // escapeHtml Entity Verification
  const escaped = escapeHtml('<script>alert("XSS" & \'test\')</script>');
  assert(
    escaped === '&lt;script&gt;alert(&quot;XSS&quot; &amp; &#x27;test&#x27;)&lt;&#x2F;script&gt;',
    'escapeHtml accurately encodes all 6 dangerous HTML characters'
  );

  // sanitizeOrderPayload Recursive Protection
  const rawPayload = {
    customerName: '<script>alert(1)</script>Nguyen Van A',
    customerPhone: '0912 345 678 (call me)',
    customerAddress: '<img src=x onerror=alert(1)>123 Le Loi, Q1',
    customerNote: 'Giao gio hanh chinh <script>evil()</script>',
    productUrl: 'javascript:alert(1)',
    povVideoUrl: 'https://youtube.com/watch?v=12345'
  };
  const safePayload = sanitizeOrderPayload(rawPayload);
  assert(safePayload.customerName === 'Nguyen Van A', 'sanitizeOrderPayload cleaned customerName');
  assert(safePayload.customerPhone === '0912345678', 'sanitizeOrderPayload cleaned customerPhone');
  assert(safePayload.customerAddress === '123 Le Loi, Q1', 'sanitizeOrderPayload cleaned customerAddress');
  assert(safePayload.customerNote === 'Giao gio hanh chinh', 'sanitizeOrderPayload cleaned customerNote');
  assert(safePayload.productUrl === '', 'sanitizeOrderPayload neutralized malicious productUrl');
  assert(safePayload.povVideoUrl === 'https://youtube.com/watch?v=12345', 'sanitizeOrderPayload preserved valid povVideoUrl');

  // ============================================================================
  // CHALLENGE 2: INVISIBLE HONEYPOT DEFENSE
  // ============================================================================
  console.log('\n--- [CHALLENGE 2] Invisible Honeypot Bot Trap ---');

  // Basic Trigger Logic
  assert(isHoneypotTriggered('') === false, 'Empty honeypot returns false (legitimate user)');
  assert(isHoneypotTriggered('   ') === false, 'Whitespace-only honeypot returns false (legitimate user)');
  assert(isHoneypotTriggered(null) === false, 'Null honeypot returns false');
  assert(isHoneypotTriggered(undefined) === false, 'Undefined honeypot returns false');
  assert(isHoneypotTriggered('bot-filler') === true, 'Filled honeypot returns true (bot detected)');
  assert(isHoneypotTriggered('http://spam-site.com') === true, 'URL in honeypot returns true');
  assert(isHoneypotTriggered('1') === true, 'Single character in honeypot returns true');

  // Simulated CartPage Honeypot Rejection Workflow
  let orderCreatedInDb = false;
  let cartCleared = false;
  let simulatedErrorMsg = '';
  let submissionInProgress = false;

  const mockCreateOrder = async (orderData) => {
    orderCreatedInDb = true;
    return { success: true, id: orderData.customerPhone };
  };

  const mockClearCart = () => {
    cartCleared = true;
  };

  // Simulation: Bot submits form with non-empty honeypot
  const simulateCartPageSubmit = async (honeypotValue) => {
    orderCreatedInDb = false;
    cartCleared = false;
    simulatedErrorMsg = '';

    // Replicate CartPage.jsx lines 75-84
    if (isHoneypotTriggered(honeypotValue)) {
      submissionInProgress = true;
      await new Promise((resolve) => {
        setTimeout(() => {
          submissionInProgress = false;
          simulatedErrorMsg = 'Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.';
          resolve();
        }, 600);
      });
      return; // Order creation blocked
    }

    // Normal order submission path
    await mockCreateOrder({ customerName: 'Real User', customerPhone: '0912345678' });
    mockClearCart();
  };

  const botStartTime = Date.now();
  await simulateCartPageSubmit('automated-bot-string');
  const botDuration = Date.now() - botStartTime;

  assert(orderCreatedInDb === false, 'Honeypot blocked order creation in DB');
  assert(cartCleared === false, 'Honeypot did NOT clear user cart');
  assert(
    simulatedErrorMsg === 'Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.',
    'Honeypot displayed innocuous error message'
  );
  assert(botDuration >= 550, `Honeypot enforced simulated delay (~600ms, actual: ${botDuration}ms)`);

  // Legitimate Submission
  await simulateCartPageSubmit('');
  assert(orderCreatedInDb === true, 'Empty honeypot allows legitimate order creation');
  assert(cartCleared === true, 'Empty honeypot allows cart to be cleared upon success');

  // ============================================================================
  // CHALLENGE 3: CLIENT ORDER RATE LIMITING & CART PRESERVATION
  // ============================================================================
  console.log('\n--- [CHALLENGE 3] Client Order Rate Limiting (Sliding Window) ---');

  // Clean rate limit storage
  localStorage.removeItem('tavy_order_timestamps');

  // Simulate user cart with 2 items
  const userCart = [
    { id: 'item-1', name: 'Mediheal Mask', priceVnd: 500000, qty: 2 },
    { id: 'item-2', name: 'Anua Toner', priceVnd: 600000, qty: 1 }
  ];
  localStorage.setItem('tavy_cart', JSON.stringify(userCart));

  let actualCartState = [...userCart];
  const clearCartState = () => {
    actualCartState = [];
    localStorage.removeItem('tavy_cart');
  };

  let ordersCreatedCount = 0;
  const dispatchOrderSubmit = (orderNum) => {
    const rateLimit = checkOrderRateLimit();
    if (!rateLimit.allowed) {
      return {
        status: 'THROTTLED',
        message: rateLimit.message,
        remainingSeconds: rateLimit.remainingSeconds
      };
    }

    ordersCreatedCount++;
    recordOrderCreationTimestamp();
    clearCartState();
    return { status: 'SUCCESS' };
  };

  // Order 1
  const res1 = dispatchOrderSubmit(1);
  assert(res1.status === 'SUCCESS', 'Order 1 allowed within rate limit window');

  // Refill cart for Order 2
  actualCartState = [...userCart];
  localStorage.setItem('tavy_cart', JSON.stringify(userCart));
  const res2 = dispatchOrderSubmit(2);
  assert(res2.status === 'SUCCESS', 'Order 2 allowed within rate limit window');

  // Refill cart for Order 3
  actualCartState = [...userCart];
  localStorage.setItem('tavy_cart', JSON.stringify(userCart));
  const res3 = dispatchOrderSubmit(3);
  assert(res3.status === 'SUCCESS', 'Order 3 allowed within rate limit window');

  // Refill cart for Order 4 (Rate limit trigger!)
  actualCartState = [...userCart];
  localStorage.setItem('tavy_cart', JSON.stringify(userCart));
  const res4 = dispatchOrderSubmit(4);

  assert(res4.status === 'THROTTLED', 'Order 4 throttled (exceeded 3 orders in 5 min)');
  assert(ordersCreatedCount === 3, `Order count remains at 3 (actual: ${ordersCreatedCount})`);
  assert(res4.remainingSeconds > 0 && res4.remainingSeconds <= 300, `Remaining seconds accurate (${res4.remainingSeconds}s)`);
  assert(
    res4.message.includes('3 đơn hàng trong vòng 5 phút qua'),
    'Rate limit message contains clear Vietnamese explanation'
  );

  // Verify Cart Preservation on Throttled Order 4
  assert(actualCartState.length === 2, 'Cart state preserved on throttled order (not emptied)');
  const savedCartInStorage = JSON.parse(localStorage.getItem('tavy_cart') || '[]');
  assert(savedCartInStorage.length === 2, 'localStorage cart preserved on throttled order (not deleted)');
  assert(savedCartInStorage[0].id === 'item-1', 'First cart item intact in storage');
  assert(savedCartInStorage[1].id === 'item-2', 'Second cart item intact in storage');

  // Sliding Window Recovery: Simulate time advancing 5 minutes and 1 second
  const rawTimestamps = JSON.parse(localStorage.getItem('tavy_order_timestamps'));
  const expiredTimestamps = rawTimestamps.map(ts => ts - (5 * 60 * 1000 + 1000));
  localStorage.setItem('tavy_order_timestamps', JSON.stringify(expiredTimestamps));

  const recoveredCheck = checkOrderRateLimit();
  assert(recoveredCheck.allowed === true, 'Rate limit resets after 5 minutes sliding window');

  // ============================================================================
  // CHALLENGE 4: ADMIN AUTH GUARD HARDENING
  // ============================================================================
  console.log('\n--- [CHALLENGE 4] Admin Auth Guard & Brute-Force Lockout ---');

  localStorage.clear();
  // 1. Five failed attempts trigger 15-minute lockout
  for (let i = 1; i <= 4; i++) {
    const attempt = recordFailedAttempt();
    assert(attempt.isLocked === false, `Failed attempt ${i} does not trigger lockout`);
    assert(attempt.remainingAttempts === 5 - i, `Remaining attempts accurately tracked (${attempt.remainingAttempts})`);
  }

  const fifthAttempt = recordFailedAttempt();
  assert(fifthAttempt.isLocked === true, '5th consecutive failed attempt triggers lockout');
  assert(fifthAttempt.tier === 1, 'Initial lockout is Tier 1 (15 minutes)');
  assert(fifthAttempt.remainingSeconds >= 890, `Remaining lockout duration ~900s (actual: ${fifthAttempt.remainingSeconds}s)`);

  const statusDuringLockout = getLockoutStatus();
  assert(statusDuringLockout.isLocked === true, 'getLockoutStatus() confirms active lockout');

  // Successful login clears lockout
  recordSuccessfulLogin();
  assert(getLockoutStatus().isLocked === false, 'recordSuccessfulLogin() clears lockout state');

  // 2. F12 Console Forgery Defense
  // Attacker runs: localStorage.setItem('admin_auth', 'true')
  localStorage.setItem('admin_auth', 'true');
  assert(verifyAdminSession() === false, 'Console forgery localStorage.setItem("admin_auth", "true") REJECTED');

  // Legitimate session token verification
  const validSession = createAdminSession();
  assert(validSession && typeof validSession.token === 'string', 'createAdminSession generates signed token');
  assert(verifyAdminSession() === true, 'Valid HMAC-SHA256 session token verified successfully');

  // Attacker tampers with token signature
  const rawSaved = localStorage.getItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY);
  const parsed = JSON.parse(rawSaved);
  parsed.sig = 'tampered_signature_999999999999999999999999';
  localStorage.setItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY, JSON.stringify(parsed));
  assert(verifyAdminSession() === false, 'Tampered token signature REJECTED');

  // 3. Inactivity Timeout
  // Simulate 61 minutes of inactivity
  const expiredSession = createAdminSession();
  const parsedExpired = JSON.parse(localStorage.getItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY));
  parsedExpired.payload.lastActiveAt = Date.now() - (61 * 60 * 1000);
  localStorage.setItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY, JSON.stringify(parsedExpired));
  assert(verifyAdminSession() === false, 'Session exceeding 60 minutes inactivity automatically invalidated');

  // Touch session extends activity
  const freshSession = createAdminSession();
  touchAdminSession();
  assert(verifyAdminSession() === true, 'touchAdminSession() maintains valid active session');

  clearAdminSession();
  assert(verifyAdminSession() === false, 'clearAdminSession() purges session completely');

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log(`  EMPIRICAL CHALLENGER 2 SUMMARY:`);
  console.log(`  Passed: ${totalPassed}`);
  console.log(`  Failed: ${totalFailed}`);
  console.log('='.repeat(80));

  if (totalFailed > 0) {
    console.error('\nFAILED TESTS:');
    failureDetails.forEach(f => console.error(f));
    process.exit(1);
  } else {
    console.log('\n>>> ALL EMPIRICAL CHALLENGES PASSED (VERDICT: APPROVE) <<<');
    process.exit(0);
  }
}

runAllChallenges().catch(err => {
  console.error('Unhandled fatal test runner error:', err);
  process.exit(1);
});
