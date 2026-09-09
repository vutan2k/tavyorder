/**
 * tests/security_defense.test.js
 * Comprehensive E2E Programmatic Security Defense Test Suite (Tier 5: R1-R5)
 *
 * Verifies multi-layer security protections:
 * - R1: Admin Portal Authentication Hardening, HMAC Sessions & Progressive Brute-Force Lockout
 * - R2: Input Sanitization (Stored/Reflected XSS), Honeypot Bot Trap & Sliding Window Rate Limiting
 * - R3: HTTP Security Headers Parity across Vercel and Firebase Hosting (CSP, HSTS, Clickjacking)
 * - R4: Cloud Firestore Security Rules Lockdown & Order Tamper/PII Scraping Defense
 * - R5: Zero Regression, Interface Contract Integrity & Standalone Execution Parity
 *
 * TAVY Korea Security Defense System
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { test, setTier, runRegisteredTests } from './framework/runner.js';
import {
  assert,
  assertEquals,
  assertContains,
  assertDeepEquals,
  assertGreaterThan
} from './framework/assert.js';

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
  AUTH_GUARD_CONFIG,
  getSessionSecret,
  computeHmacSha256,
  getLockoutStatus,
  recordFailedAttempt,
  recordSuccessfulLogin,
  createAdminSession,
  verifyAdminSession,
  touchAdminSession,
  clearAdminSession
} from '../src/utils/adminAuthGuard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Setup in-memory LocalStorage mock for Node.js environment if missing
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

if (!globalThis.localStorage) {
  globalThis.localStorage = new MockLocalStorage();
}

// Designate Tier 5 scope
setTier('Tier 5: Security Defense Suite (R1-R5)');

// ---------------------------------------------------------------------------
// R1: Admin Portal Authentication Hardening & Brute-Force Lockout Defense
// ---------------------------------------------------------------------------

test('[SEC-R1-01] 5 consecutive invalid admin passwords trigger active lockout lasting >= 900 seconds', () => {
  localStorage.clear();

  // Attempts 1 to 4 should decrement remaining attempts without triggering lockout
  for (let i = 1; i <= 4; i++) {
    const status = recordFailedAttempt();
    assertEquals(status.isLocked, false, `Attempt ${i} should not be locked`);
    assertEquals(status.remainingAttempts, 5 - i, `Attempt ${i} remaining attempts mismatch`);
    assertEquals(status.tier, 1, `Attempt ${i} tier should be 1`);
  }

  // 5th attempt triggers lockout
  const lockoutStatus = recordFailedAttempt();
  assertEquals(lockoutStatus.isLocked, true, '5th failed attempt must trigger isLocked = true');
  assertEquals(lockoutStatus.remainingAttempts, 0, 'Remaining attempts must be 0 upon lockout');
  assertEquals(lockoutStatus.tier, 1, 'Initial lockout tier must be 1 (15 minutes)');
  assert(lockoutStatus.remainingSeconds >= 898 && lockoutStatus.remainingSeconds <= 900,
    `Remaining seconds (${lockoutStatus.remainingSeconds}) should be near 900s`);
  assertGreaterThan(lockoutStatus.lockedUntil, Date.now(), 'lockedUntil must be in the future');
});

test('[SEC-R1-02] Submissions during lockout period are immediately blocked without modifying timer', () => {
  // Lockout is active from previous test
  const statusBefore = getLockoutStatus();
  assertEquals(statusBefore.isLocked, true, 'Must still be in locked state');
  const lockedUntilBefore = statusBefore.lockedUntil;

  // Attempting another submission while locked
  const statusDuring = recordFailedAttempt();
  assertEquals(statusDuring.isLocked, true, 'Attempt during lockout must be immediately rejected as locked');
  assertEquals(statusDuring.lockedUntil, lockedUntilBefore, 'lockedUntil timestamp must not be reset during active lockout');
  assertEquals(statusDuring.remainingAttempts, 0, 'Remaining attempts must remain 0');
});

test('[SEC-R1-03] Progressive cooldown escalation (Tier 2: 30m, Tier 3: 60m) and successful login reset', () => {
  localStorage.clear();

  // Fast-forward: simulate a Tier 1 lockout that has just expired
  const now = Date.now();
  localStorage.setItem(AUTH_GUARD_CONFIG.LOCKOUT_STORAGE_KEY, JSON.stringify({
    failedAttempts: 5,
    lockoutTier: 1,
    lockedUntil: now - 1000 // 1s ago (expired)
  }));

  // Next failed attempt should escalate directly to Tier 2 (30 minutes)
  const tier2Status = recordFailedAttempt();
  assertEquals(tier2Status.isLocked, true, 'Must trigger Tier 2 lockout');
  assertEquals(tier2Status.tier, 2, 'Lockout tier must escalate to 2');
  assert(tier2Status.remainingSeconds >= 1795 && tier2Status.remainingSeconds <= 1800,
    `Tier 2 remaining seconds (${tier2Status.remainingSeconds}) should be near 1800s (30m)`);

  // Fast-forward: simulate Tier 2 lockout expiration
  localStorage.setItem(AUTH_GUARD_CONFIG.LOCKOUT_STORAGE_KEY, JSON.stringify({
    failedAttempts: 6,
    lockoutTier: 2,
    lockedUntil: now - 1000 // expired
  }));

  // Next failed attempt should escalate to Tier 3 (60 minutes)
  const tier3Status = recordFailedAttempt();
  assertEquals(tier3Status.isLocked, true, 'Must trigger Tier 3 lockout');
  assertEquals(tier3Status.tier, 3, 'Lockout tier must escalate to 3');
  assert(tier3Status.remainingSeconds >= 3595 && tier3Status.remainingSeconds <= 3600,
    `Tier 3 remaining seconds (${tier3Status.remainingSeconds}) should be near 3600s (60m)`);

  // Successful login clears the lockout state completely
  recordSuccessfulLogin();
  const resetStatus = getLockoutStatus();
  assertEquals(resetStatus.isLocked, false, 'Lockout must be cleared on successful login');
  assertEquals(resetStatus.remainingAttempts, 5, 'Remaining attempts reset to 5');
});

test('[SEC-R1-04] Admin auth state cannot be achieved by forgeable localStorage admin_auth flag', () => {
  localStorage.clear();

  // Attacker attempts F12 console manipulation
  localStorage.setItem('admin_auth', 'true');

  // Security guard verification must reject this forgeable flag
  const isAuth = verifyAdminSession();
  assertEquals(isAuth, false, 'verifyAdminSession must return false for raw admin_auth flag');

  // When admin logs out or clears session, legacy flag is explicitly purged
  clearAdminSession();
  assertEquals(localStorage.getItem('admin_auth'), null, 'clearAdminSession must purge legacy admin_auth flag');

  // When admin logs in and creates a new cryptographic session, legacy flag is automatically purged
  localStorage.setItem('admin_auth', 'true');
  createAdminSession();
  assertEquals(localStorage.getItem('admin_auth'), null, 'createAdminSession must purge legacy admin_auth flag');
});

test('[SEC-R1-05] Admin session token contains HMAC-SHA256 signature; tampered signatures are rejected', () => {
  localStorage.clear();

  const { token, session } = createAdminSession();
  assert(typeof token === 'string', 'Token must be a serialized string');
  assert(session.payload && session.sig, 'Session object must have payload and sig properties');
  assertEquals(session.payload.role, 'admin', 'Session role must be admin');
  assertEquals(session.payload.sub, 'admin@tavykorea.vn', 'Session subject must be admin@tavykorea.vn');

  // Genuine token must verify successfully
  assertEquals(verifyAdminSession(token), true, 'Genuine session must verify as true');

  // Tamper vector A: Attacker elevates role to superadmin
  const tamperedPayload = { ...session.payload, role: 'superadmin' };
  const tamperedTokenA = JSON.stringify({ payload: tamperedPayload, sig: session.sig });
  assertEquals(verifyAdminSession(tamperedTokenA), false, 'Tampered payload must fail HMAC verification');

  // Tamper vector B: Attacker alters subject email
  const tamperedSub = { ...session.payload, sub: 'attacker@evil.com' };
  const tamperedTokenB = JSON.stringify({ payload: tamperedSub, sig: session.sig });
  assertEquals(verifyAdminSession(tamperedTokenB), false, 'Tampered sub must fail HMAC verification');

  // Tamper vector C: Attacker modifies the signature
  const corruptedSig = session.sig.slice(0, -2) + (session.sig.endsWith('00') ? 'ff' : '00');
  const tamperedTokenC = JSON.stringify({ payload: session.payload, sig: corruptedSig });
  assertEquals(verifyAdminSession(tamperedTokenC), false, 'Corrupted signature must be rejected');
});

test('[SEC-R1-06] Inactivity exceeding 60 minutes automatically clears session and revokes access', () => {
  localStorage.clear();

  // Create a genuine session
  createAdminSession();
  assertEquals(verifyAdminSession(), true, 'Initial session is valid');

  // Synthesize session from 61 minutes ago with valid signature for that old timestamp
  const oldTime = Date.now() - (61 * 60 * 1000);
  const oldPayload = {
    sub: 'admin@tavykorea.vn',
    role: 'admin',
    iat: oldTime,
    lastActiveAt: oldTime,
    nonce: 'exp-test-nonce-123'
  };
  const secret = getSessionSecret();
  const oldSig = computeHmacSha256(JSON.stringify(oldPayload), secret);
  const expiredSessionStr = JSON.stringify({ payload: oldPayload, sig: oldSig });

  localStorage.setItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY, expiredSessionStr);

  // Verification must detect inactivity timeout and purge session
  const isValid = verifyAdminSession();
  assertEquals(isValid, false, 'Session exceeding 60m inactivity must be invalidated');
  assertEquals(localStorage.getItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY), null,
    'Expired session must be automatically removed from storage');
});

test('[SEC-R1-07] Sliding activity extension: user activity touches session timestamp within active window', () => {
  localStorage.clear();

  createAdminSession();
  const initialSession = JSON.parse(localStorage.getItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY));
  const initialActive = initialSession.payload.lastActiveAt;

  // Set lastActiveAt to 10 minutes ago and sign
  const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
  initialSession.payload.lastActiveAt = tenMinutesAgo;
  const secret = getSessionSecret();
  initialSession.sig = computeHmacSha256(JSON.stringify(initialSession.payload), secret);
  localStorage.setItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY, JSON.stringify(initialSession));

  // Touch session
  touchAdminSession();

  const touchedSession = JSON.parse(localStorage.getItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY));
  assertGreaterThan(touchedSession.payload.lastActiveAt, tenMinutesAgo, 'touchAdminSession must advance lastActiveAt');
  assertEquals(verifyAdminSession(), true, 'Touched session must remain valid');
});

// ---------------------------------------------------------------------------
// R2: User Web Protection Against XSS & Bot Order Flooding
// ---------------------------------------------------------------------------

test('[SEC-R2-01] Input strings with <script>, onerror=, <iframe> are sanitized/HTML-encoded across checkout fields', () => {
  // Test escapeHtml
  const rawHtml = '<script>alert("XSS")</script>';
  const escaped = escapeHtml(rawHtml);
  assertEquals(escaped, '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;', 'HTML entities must be safely escaped');

  // Test sanitizeText on various XSS injection vectors
  assertEquals(sanitizeText('<script>alert(1)</script>Nguyen Van A'), 'Nguyen Van A', 'Script tags and contents must be stripped');
  assertEquals(sanitizeText('<img src="x" onerror="alert(document.domain)">123 Le Loi'), '123 Le Loi', 'Inline event handlers stripped');
  assertEquals(sanitizeText('<iframe src="javascript:alert(1)"></iframe>Giao hang buoi chieu'), 'Giao hang buoi chieu', 'Iframe tags stripped');
  assertEquals(sanitizeText('<object data="malware.swf"></object>Don hang gap'), 'Don hang gap', 'Object tags stripped');
  assertEquals(sanitizeText('javascript:void(0)'), 'void(0)', 'javascript: pseudo-protocol stripped');

  // Test defensive payload sanitizer
  const rawPayload = {
    customerName: '<script>alert(1)</script>Tran Thi B',
    customerPhone: '090-123-4567',
    customerAddress: '<b onclick="hack()">So 456 Tran Hung Dao</b>',
    customerNote: 'Luu y: <script>steal()</script>Goi can than',
    productUrl: 'javascript:alert(1)',
    povVideoUrl: 'https://valid-drive.google.com/file/123'
  };

  const cleanPayload = sanitizeOrderPayload(rawPayload);
  assertEquals(cleanPayload.customerName, 'Tran Thi B', 'customerName sanitized in payload');
  assertEquals(cleanPayload.customerPhone, '0901234567', 'customerPhone sanitized to numeric string');
  assertEquals(cleanPayload.customerAddress, 'So 456 Tran Hung Dao', 'customerAddress sanitized in payload');
  assertEquals(cleanPayload.customerNote, 'Luu y: Goi can than', 'customerNote sanitized in payload');
  assertEquals(cleanPayload.productUrl, '', 'Dangerous productUrl sanitized to empty string');
  assertEquals(cleanPayload.povVideoUrl, 'https://valid-drive.google.com/file/123', 'Valid URL preserved');
});

test('[SEC-R2-02] Dangerous URL schemes (javascript:, data:, vbscript:) are sanitized/rejected', () => {
  assertEquals(isValidHttpUrl('javascript:alert(1)'), false, 'javascript: URL rejected');
  assertEquals(isValidHttpUrl('data:text/html,<script>alert(1)</script>'), false, 'data: URL rejected');
  assertEquals(isValidHttpUrl('vbscript:msgbox("xss")'), false, 'vbscript: URL rejected');
  assertEquals(isValidHttpUrl('https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000223414'), true, 'Valid HTTPS URL accepted');
  assertEquals(isValidHttpUrl('http://localhost:3000'), true, 'Valid HTTP URL accepted');

  assertEquals(sanitizeUrl('javascript:alert(1)', 'https://fallback.com'), 'https://fallback.com', 'Fallback returned on unsafe URL');
  assertEquals(sanitizeUrl('https://tavyorder.web.app', ''), 'https://tavyorder.web.app', 'Safe URL preserved');
});

test('[SEC-R2-03] Submitting non-empty value in invisible honeypot field prevents order creation and returns innocuous rejection', () => {
  // Human customer leaves the hidden trap empty
  assertEquals(isHoneypotTriggered(''), false, 'Empty honeypot string is allowed');
  assertEquals(isHoneypotTriggered('   '), false, 'Whitespace honeypot string is allowed');
  assertEquals(isHoneypotTriggered(null), false, 'Null honeypot is allowed');
  assertEquals(isHoneypotTriggered(undefined), false, 'Undefined honeypot is allowed');

  // Automated spam bot fills all input fields
  assertEquals(isHoneypotTriggered('http://spam-promotion.com'), true, 'Spam URL in honeypot triggers trap');
  assertEquals(isHoneypotTriggered('Automated Bot Company'), true, 'Text filled in honeypot triggers trap');
});

test('[SEC-R2-04] Exceeding order threshold (more than 3 orders within 5 minutes) triggers rate-limit delay notice', () => {
  localStorage.clear();

  // Fresh state: rate limit allowed
  const initial = checkOrderRateLimit();
  assertEquals(initial.allowed, true, 'Initial state must allow order');
  assertEquals(initial.remainingSeconds, 0, 'No remaining cooldown initially');

  // Record 3 orders in rapid succession
  recordOrderCreationTimestamp();
  recordOrderCreationTimestamp();
  recordOrderCreationTimestamp();

  // 4th order must be blocked by rate limiter
  const throttled = checkOrderRateLimit();
  assertEquals(throttled.allowed, false, '4th order within 5m must be blocked');
  assert(throttled.remainingSeconds > 0 && throttled.remainingSeconds <= 300,
    `Remaining seconds (${throttled.remainingSeconds}) must be between 1 and 300s`);
  assert(typeof throttled.message === 'string' && throttled.message.includes('5 phút qua'),
    'Rate limit message must explain the 5-minute sliding window');
});

test('[SEC-R2-05] Normal checkout resumes cleanly after 5-minute rate-limit cooldown window', () => {
  localStorage.clear();

  // Simulate 3 orders placed 6 minutes ago (outside sliding window)
  const sixMinutesAgo = Date.now() - (6 * 60 * 1000);
  localStorage.setItem('tavy_order_timestamps', JSON.stringify([
    sixMinutesAgo,
    sixMinutesAgo + 1000,
    sixMinutesAgo + 2000
  ]));

  // Rate limiter should prune expired timestamps and allow new order
  const status = checkOrderRateLimit();
  assertEquals(status.allowed, true, 'Orders older than 5m must not block new creation');
  assertEquals(status.remainingSeconds, 0, 'No cooldown remaining after window expiry');

  // Recording a new order should cleanly append without breaking
  recordOrderCreationTimestamp();
  const raw = JSON.parse(localStorage.getItem('tavy_order_timestamps'));
  assertEquals(raw.length, 1, 'Sliding window must prune old entries, leaving only current order');
});

// ---------------------------------------------------------------------------
// R3: HTTP Security Headers Parity Across Environments (Vercel & Firebase)
// ---------------------------------------------------------------------------

test('[SEC-R3-01] vercel.json contains all 6 strict HTTP security headers with valid directives', () => {
  const vercelPath = path.join(rootDir, 'vercel.json');
  assert(fs.existsSync(vercelPath), 'vercel.json must exist');

  const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
  assert(Array.isArray(vercelConfig.headers), 'vercel.json must contain headers array');

  const spaHeadersEntry = vercelConfig.headers.find(h => h.source === '/(.*)');
  assert(spaHeadersEntry, 'vercel.json must contain headers configuration for source /(.*)');

  const headerMap = {};
  spaHeadersEntry.headers.forEach(h => {
    headerMap[h.key] = h.value;
  });

  assertEquals(headerMap['X-Frame-Options'], 'DENY', 'X-Frame-Options must be DENY');
  assertEquals(headerMap['X-Content-Type-Options'], 'nosniff', 'X-Content-Type-Options must be nosniff');
  assertEquals(headerMap['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains; preload',
    'HSTS header must enforce preload and subdomains');
  assertEquals(headerMap['Referrer-Policy'], 'strict-origin-when-cross-origin', 'Referrer-Policy must be strict');
  assertContains(headerMap['Permissions-Policy'], 'camera=()', 'Permissions-Policy must disable camera');
  assertContains(headerMap['Permissions-Policy'], 'microphone=()', 'Permissions-Policy must disable microphone');
  assert(typeof headerMap['Content-Security-Policy'] === 'string' && headerMap['Content-Security-Policy'].length > 50,
    'Content-Security-Policy must be non-empty and comprehensive');
});

test('[SEC-R3-02] firebase.json headers section mirrors all security headers in vercel.json (100% parity)', () => {
  const vercelPath = path.join(rootDir, 'vercel.json');
  const firebasePath = path.join(rootDir, 'firebase.json');
  assert(fs.existsSync(firebasePath), 'firebase.json must exist');

  const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
  const firebaseConfig = JSON.parse(fs.readFileSync(firebasePath, 'utf8'));

  const vercelHeaders = vercelConfig.headers.find(h => h.source === '/(.*)')?.headers || [];
  const firebaseHeaders = firebaseConfig.hosting?.headers?.find(h => h.source === '/**')?.headers || [];

  assert(firebaseHeaders.length > 0, 'firebase.json must configure headers on source /**');

  const vMap = {};
  vercelHeaders.forEach(h => { vMap[h.key] = h.value; });

  const fMap = {};
  firebaseHeaders.forEach(h => { fMap[h.key] = h.value; });

  const requiredSecurityKeys = [
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Strict-Transport-Security',
    'Referrer-Policy',
    'Permissions-Policy',
    'Content-Security-Policy'
  ];

  for (const key of requiredSecurityKeys) {
    assert(fMap[key] !== undefined, `firebase.json is missing required header: ${key}`);
    assertEquals(fMap[key], vMap[key], `Parity mismatch for header ${key} between Vercel and Firebase Hosting`);
  }
});

test('[SEC-R3-03] CSP correctly whitelists Vite, Firebase Auth, Firestore, PayOS, VietQR, Korean CDNs, Google Fonts & Unsplash', () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
  const csp = vercelConfig.headers.find(h => h.source === '/(.*)')?.headers?.find(h => h.key === 'Content-Security-Policy')?.value;
  assert(csp, 'CSP string must exist');

  // Core restrictive controls
  assertContains(csp, "default-src 'self'", 'CSP must define default-src self');
  assertContains(csp, "object-src 'none'", 'CSP must block object-src');
  assertContains(csp, "frame-ancestors 'none'", 'CSP must prohibit frame embedding');

  // Integrations whitelist
  assertContains(csp, 'https://apis.google.com', 'CSP whitelists Google APIs');
  assertContains(csp, 'https://www.gstatic.com', 'CSP whitelists gstatic');
  assertContains(csp, 'https://fonts.googleapis.com', 'CSP whitelists Google Fonts');
  assertContains(csp, 'https://fonts.gstatic.com', 'CSP whitelists Fonts gstatic');
  assertContains(csp, 'https://images.unsplash.com', 'CSP whitelists Unsplash');
  assertContains(csp, 'https://img.vietqr.io', 'CSP whitelists VietQR');
  assertContains(csp, 'https://api.qrserver.com', 'CSP whitelists QR Server');
  assertContains(csp, 'https://api.payos.vn', 'CSP whitelists PayOS');
  assertContains(csp, 'https://*.firestore.googleapis.com', 'CSP whitelists Firestore');
  assertContains(csp, 'wss://*.firebaseio.com', 'CSP whitelists Firebase Realtime WebSockets');
  assertContains(csp, 'https://*.oliveyoung.co.kr', 'CSP whitelists Olive Young Korean CDN');
  assertContains(csp, 'https://*.pstatic.net', 'CSP whitelists Naver Korean CDN');
  assertContains(csp, 'https://*.coupangcdn.com', 'CSP whitelists Coupang Korean CDN');
});

test('[SEC-R3-04] Clickjacking defense: X-Frame-Options is DENY and CSP frame-ancestors is none across both hosts', () => {
  const vConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
  const fConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'firebase.json'), 'utf8'));

  const vHeaders = vConfig.headers.find(h => h.source === '/(.*)')?.headers;
  const fHeaders = fConfig.hosting?.headers?.find(h => h.source === '/**')?.headers;

  const vXFO = vHeaders.find(h => h.key === 'X-Frame-Options')?.value;
  const fXFO = fHeaders.find(h => h.key === 'X-Frame-Options')?.value;
  assertEquals(vXFO, 'DENY', 'Vercel X-Frame-Options must be DENY');
  assertEquals(fXFO, 'DENY', 'Firebase X-Frame-Options must be DENY');

  const vCSP = vHeaders.find(h => h.key === 'Content-Security-Policy')?.value;
  const fCSP = fHeaders.find(h => h.key === 'Content-Security-Policy')?.value;
  assertContains(vCSP, "frame-ancestors 'none'", 'Vercel CSP must enforce frame-ancestors none');
  assertContains(fCSP, "frame-ancestors 'none'", 'Firebase CSP must enforce frame-ancestors none');
});

// ---------------------------------------------------------------------------
// R4: Cloud Firestore Security Rules Lockdown & Tamper Defense
// ---------------------------------------------------------------------------

test('[SEC-R4-01] firestore.rules completely eliminates open allow read, write: if true; on orders', () => {
  const rulesPath = path.join(rootDir, 'firestore.rules');
  assert(fs.existsSync(rulesPath), 'firestore.rules must exist');

  const rulesText = fs.readFileSync(rulesPath, 'utf8');

  // Extract the orders match block
  const ordersMatchRegex = /match\s+\/orders\/\{orderId\}[\s\S]*?(?=match|\}\s*$)/;
  const ordersMatch = rulesText.match(ordersMatchRegex);
  assert(ordersMatch, 'Orders match block must be found in firestore.rules');

  const ordersBlock = ordersMatch[0];
  assert(!ordersBlock.includes('allow read, write: if true;'),
    'CRITICAL VULNERABILITY: allow read, write: if true; must not exist in orders collection block');
});

test('[SEC-R4-02] Rules enforce required schema fields on guest creation and reject initial status != pending', () => {
  const rulesText = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');

  // Verify isValidOrderCreate() definition in rules
  assertContains(rulesText, 'function isValidOrderCreate()', 'Rules must define isValidOrderCreate() helper');
  assertContains(rulesText, "hasAll(['customerName', 'customerPhone', 'items', 'totalVnd'])",
    'Rules must check required keys: customerName, customerPhone, items, totalVnd');
  assertContains(rulesText, "data.totalVnd is number && data.totalVnd > 0", 'Rules must check positive totalVnd');
  assertContains(rulesText, "(!('status' in data) || data.status == 'pending')", 'Rules must enforce status == pending');
  assertContains(rulesText, "(!('paymentStatus' in data) || data.paymentStatus == 'unpaid')", 'Rules must enforce paymentStatus == unpaid');

  // Programmatic simulation of the rule evaluator logic
  const evaluateOrderCreateRule = (data) => {
    const hasKeys = ['customerName', 'customerPhone', 'items', 'totalVnd'].every(k => k in data);
    if (!hasKeys) return false;
    if (typeof data.customerName !== 'string' || data.customerName.length === 0) return false;
    if (typeof data.customerPhone !== 'string' || data.customerPhone.length < 9) return false;
    if (!Array.isArray(data.items) || data.items.length === 0) return false;
    if (typeof data.totalVnd !== 'number' || data.totalVnd <= 0) return false;
    if ('status' in data && data.status !== 'pending') return false;
    if ('paymentStatus' in data && data.paymentStatus !== 'unpaid') return false;
    return true;
  };

  // Valid order creation payload
  const validPayload = {
    customerName: 'Le Thi C',
    customerPhone: '0987654321',
    items: [{ name: 'Son Duong', priceWon: 12000, quantity: 1 }],
    totalVnd: 250000,
    status: 'pending',
    paymentStatus: 'unpaid'
  };
  assertEquals(evaluateOrderCreateRule(validPayload), true, 'Valid guest order creation must pass rules');

  // Malicious payload: guest attempting to pre-mark order as paid without payment
  const tamperedStatusPayload = { ...validPayload, status: 'paid' };
  assertEquals(evaluateOrderCreateRule(tamperedStatusPayload), false, 'Initial status != pending must be rejected');

  // Malicious payload: guest attempting to pre-mark paymentStatus as paid
  const tamperedPaymentPayload = { ...validPayload, paymentStatus: 'paid' };
  assertEquals(evaluateOrderCreateRule(tamperedPaymentPayload), false, 'Initial paymentStatus != unpaid must be rejected');

  // Invalid payload: negative or zero totalVnd
  const negativePricePayload = { ...validPayload, totalVnd: 0 };
  assertEquals(evaluateOrderCreateRule(negativePricePayload), false, 'Zero totalVnd must be rejected');

  // Invalid payload: missing customer phone
  const missingPhonePayload = { ...validPayload, customerPhone: '' };
  assertEquals(evaluateOrderCreateRule(missingPhonePayload), false, 'Missing phone must be rejected');
});

test('[SEC-R4-03] Unauthenticated client writes attempting to alter order status fields are rejected by rules logic', () => {
  const rulesText = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');

  // Verify allow update rule definition
  assertContains(rulesText, 'allow update: if isAdmin() || isAllowedGuestOrderUpdate();',
    'Order updates must be restricted to admin or whitelisted guest updates');
  assertContains(rulesText, 'function isAllowedGuestOrderUpdate()',
    'Rules must define isAllowedGuestOrderUpdate() helper function');

  // Verify whitelisted guest update fields
  const allowedFieldsMatch = rulesText.match(/let\s+allowedKeys\s*=\s*\[([^\]]+)\]/);
  assert(allowedFieldsMatch, 'isAllowedGuestOrderUpdate must declare allowedKeys array');
  const allowedKeysStr = allowedFieldsMatch[1];
  assertContains(allowedKeysStr, 'depositProofImage', 'Must allow depositProofImage upload');
  assertContains(allowedKeysStr, 'customerReportedPaid', 'Must allow customerReportedPaid flag');

  // Crucial security constraint: status, paymentStatus, totalVnd must NOT be in allowedKeys
  assert(!allowedKeysStr.includes("'status'"), "'status' must not be in guest allowedKeys");
  assert(!allowedKeysStr.includes("'paymentStatus'"), "'paymentStatus' must not be in guest allowedKeys");
  assert(!allowedKeysStr.includes("'totalVnd'"), "'totalVnd' must not be in guest allowedKeys");

  // Programmatic simulation of Firestore rules diff evaluator
  const simulateOrderUpdateRule = (affectedKeys, isAdmin = false) => {
    if (isAdmin) return true;
    const allowedKeys = ['depositProofImage', 'depositProofUploadedAt', 'customerReportedPaid', 'paymentDue', 'updatedAt'];
    return affectedKeys.every(k => allowedKeys.includes(k));
  };

  // Legitimate guest upload of transfer receipt
  assertEquals(simulateOrderUpdateRule(['depositProofImage', 'depositProofUploadedAt', 'updatedAt'], false), true,
    'Legitimate proof image upload must be allowed for guests');

  // Malicious update: guest trying to change status to paid
  assertEquals(simulateOrderUpdateRule(['status'], false), false,
    'Guest write to status must be rejected by rules');

  // Malicious update: guest trying to change paymentStatus
  assertEquals(simulateOrderUpdateRule(['paymentStatus'], false), false,
    'Guest write to paymentStatus must be rejected by rules');

  // Malicious update: guest trying to tamper order total amount
  assertEquals(simulateOrderUpdateRule(['totalVnd'], false), false,
    'Guest write to totalVnd must be rejected by rules');

  // Authenticated admin can update any of these fields
  assertEquals(simulateOrderUpdateRule(['status', 'paymentStatus', 'totalVnd'], true), true,
    'Admin must have permission to update all order fields');
});

test('[SEC-R4-04] Order deletion is strictly restricted to authenticated administrators (isAdmin())', () => {
  const rulesText = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');

  // Extract allow delete rule within orders block
  const deleteRuleMatch = rulesText.match(/match\s+\/orders\/\{orderId\}[\s\S]*?allow\s+delete\s*:\s*if\s+([^;]+);/);
  assert(deleteRuleMatch, 'allow delete rule on orders must be present');

  const deleteCondition = deleteRuleMatch[1].trim();
  assertEquals(deleteCondition, 'isAdmin()', 'allow delete on orders must be strictly restricted to isAdmin()');
});

test('[SEC-R4-05] Collection list queries are restricted to admins/owners to prevent unauthorized bulk PII dumping', () => {
  const rulesText = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');

  // Extract allow list rule within orders block
  const listRuleMatch = rulesText.match(/match\s+\/orders\/\{orderId\}[\s\S]*?allow\s+list\s*:\s*if\s+([^;]+);/);
  assert(listRuleMatch, 'allow list rule on orders must be present');

  const listCondition = listRuleMatch[1].trim();
  assertContains(listCondition, 'isAdmin()', 'allow list must permit authenticated admin');
  assertContains(listCondition, 'request.auth.token.email == resource.data.userEmail',
    'allow list for authenticated users must be restricted to their own email');
  assert(!listCondition.includes('if true'), 'allow list must never be open to the public');
});

// ---------------------------------------------------------------------------
// R5: Zero Regression, Interface Contract Integrity & Validation Tests
// ---------------------------------------------------------------------------

test('[SEC-R5-01] Vietnamese phone sanitizer and validator adheres strictly to 10-digit mobile spec', () => {
  // Valid Vietnamese phone numbers (prefixes 03, 05, 07, 08, 09)
  const validPhones = ['0901234567', '0389876543', '0771122334', '0868889999', '0562233445'];
  for (const p of validPhones) {
    assertEquals(isValidVietnamesePhone(p), true, `Phone ${p} must be recognized as valid`);
    assertEquals(sanitizePhone(p), p, `Clean phone ${p} must not be changed by sanitizePhone`);
  }

  // Formatted phones with spaces, dashes, or dots
  assertEquals(isValidVietnamesePhone('090-123-4567'), true, 'Dashed phone must validate after sanitization');
  assertEquals(isValidVietnamesePhone('090 123 4567'), true, 'Spaced phone must validate after sanitization');
  assertEquals(isValidVietnamesePhone('(090) 123.4567'), true, 'Parenthesized phone must validate after sanitization');

  // Invalid numbers: wrong length, invalid prefixes, or alpha characters
  const invalidPhones = ['0123456789', '0243123456', '090123456', '09012345678', '090123456a', ''];
  for (const inv of invalidPhones) {
    assertEquals(isValidVietnamesePhone(inv), false, `Invalid phone ${inv} must be rejected`);
  }
});

test('[SEC-R5-02] Security utility and auth guard interface contracts export all required symbols', () => {
  // securityUtils exports
  assert(typeof escapeHtml === 'function', 'escapeHtml must be exported');
  assert(typeof sanitizeText === 'function', 'sanitizeText must be exported');
  assert(typeof sanitizePhone === 'function', 'sanitizePhone must be exported');
  assert(typeof isValidVietnamesePhone === 'function', 'isValidVietnamesePhone must be exported');
  assert(typeof isValidHttpUrl === 'function', 'isValidHttpUrl must be exported');
  assert(typeof sanitizeUrl === 'function', 'sanitizeUrl must be exported');
  assert(typeof isHoneypotTriggered === 'function', 'isHoneypotTriggered must be exported');
  assert(typeof checkOrderRateLimit === 'function', 'checkOrderRateLimit must be exported');
  assert(typeof recordOrderCreationTimestamp === 'function', 'recordOrderCreationTimestamp must be exported');
  assert(typeof sanitizeOrderPayload === 'function', 'sanitizeOrderPayload must be exported');

  // adminAuthGuard exports
  assert(typeof AUTH_GUARD_CONFIG === 'object', 'AUTH_GUARD_CONFIG must be exported');
  assert(typeof getSessionSecret === 'function', 'getSessionSecret must be exported');
  assert(typeof computeHmacSha256 === 'function', 'computeHmacSha256 must be exported');
  assert(typeof getLockoutStatus === 'function', 'getLockoutStatus must be exported');
  assert(typeof recordFailedAttempt === 'function', 'recordFailedAttempt must be exported');
  assert(typeof recordSuccessfulLogin === 'function', 'recordSuccessfulLogin must be exported');
  assert(typeof createAdminSession === 'function', 'createAdminSession must be exported');
  assert(typeof verifyAdminSession === 'function', 'verifyAdminSession must be exported');
  assert(typeof touchAdminSession === 'function', 'touchAdminSession must be exported');
  assert(typeof clearAdminSession === 'function', 'clearAdminSession must be exported');
});

// ---------------------------------------------------------------------------
// Direct Standalone Execution Support via `node tests/security_defense.test.js`
// ---------------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runRegisteredTests({ exit: true }).catch((err) => {
    console.error('Fatal error during standalone security test suite execution:', err);
    process.exit(1);
  });
}
