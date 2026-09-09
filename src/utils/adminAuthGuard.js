/**
 * src/utils/adminAuthGuard.js
 * Comprehensive Admin Security Guard:
 * - Pure synchronous HMAC-SHA256 session token generation and verification
 * - Progressive brute-force lockout defense (15m, 30m, 60m)
 * - 60-minute inactivity auto-logout
 * - Complete purge and neutralization of legacy forgeable 'admin_auth' flag
 *
 * TAVY Korea Security Defense System
 */

export const AUTH_GUARD_CONFIG = {
  MAX_FAILED_ATTEMPTS: 5,
  TIER_DURATIONS_MS: [
    15 * 60 * 1000, // Tier 1: 15 minutes (900,000 ms)
    30 * 60 * 1000, // Tier 2: 30 minutes (1,800,000 ms)
    60 * 60 * 1000  // Tier 3: 60 minutes (3,600,000 ms)
  ],
  INACTIVITY_LIMIT_MS: 60 * 60 * 1000, // 60 minutes (3,600,000 ms)
  LOCKOUT_STORAGE_KEY: 'tavy_admin_lockout',
  SESSION_STORAGE_KEY: 'tavy_admin_session',
  LEGACY_STORAGE_KEY: 'admin_auth'
};

const SESSION_SALT = 'TAVY_KOREA_ADMIN_HMAC_SECRET_2026_@DEFENSE';

export function getSessionSecret() {
  let envPass = 'admin123';
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_PASSWORD) {
      envPass = import.meta.env.VITE_ADMIN_PASSWORD;
    } else if (typeof process !== 'undefined' && process.env?.VITE_ADMIN_PASSWORD) {
      envPass = process.env.VITE_ADMIN_PASSWORD;
    }
  } catch {}
  return `${envPass}::${SESSION_SALT}`;
}

// ---------------------------------------------------------------------------
// Pure Synchronous UTF-8, SHA-256 and HMAC-SHA256 Implementation (Zero Dependencies)
// ---------------------------------------------------------------------------

function utf8ToBytes(str) {
  if (typeof str !== 'string') return [];
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0xd800 || c >= 0xe000) {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      i++;
      c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return bytes;
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256Bytes(bytes) {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
      h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const bitLength = bytes.length * 8;
  const padded = bytes.slice();
  padded.push(0x80);
  while ((padded.length % 64) !== 56) {
    padded.push(0);
  }
  const hi = Math.floor(bitLength / 0x100000000);
  const lo = bitLength >>> 0;
  padded.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
  padded.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);

  const w = new Int32Array(64);

  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      const idx = i + t * 4;
      w[t] = (padded[idx] << 24) | (padded[idx + 1] << 16) | (padded[idx + 2] << 8) | padded[idx + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = ((w[t - 15] >>> 7) | (w[t - 15] << 25)) ^ ((w[t - 15] >>> 18) | (w[t - 15] << 14)) ^ (w[t - 15] >>> 3);
      const s1 = ((w[t - 2] >>> 17) | (w[t - 2] << 15)) ^ ((w[t - 2] >>> 19) | (w[t - 2] << 13)) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + SHA256_K[t] + w[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const out = [];
  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let j = 0; j < 8; j++) {
    out.push((words[j] >>> 24) & 0xff, (words[j] >>> 16) & 0xff, (words[j] >>> 8) & 0xff, words[j] & 0xff);
  }
  return out;
}

/**
 * Synchronously computes HMAC-SHA256 digest in hex format
 * @param {string} message
 * @param {string} secret
 * @returns {string} hex digest
 */
export function computeHmacSha256(message, secret) {
  let keyBytes = typeof secret === 'string' ? utf8ToBytes(secret) : Array.from(secret || []);
  const msgBytes = typeof message === 'string' ? utf8ToBytes(message) : Array.from(message || []);

  if (keyBytes.length > 64) {
    keyBytes = sha256Bytes(keyBytes);
  }
  while (keyBytes.length < 64) {
    keyBytes.push(0);
  }

  const oKeyPad = new Array(64);
  const iKeyPad = new Array(64);
  for (let i = 0; i < 64; i++) {
    oKeyPad[i] = keyBytes[i] ^ 0x5c;
    iKeyPad[i] = keyBytes[i] ^ 0x36;
  }

  const innerHash = sha256Bytes(iKeyPad.concat(msgBytes));
  const outerHash = sha256Bytes(oKeyPad.concat(innerHash));

  return outerHash.map(b => ('0' + b.toString(16)).slice(-2)).join('');
}

// ---------------------------------------------------------------------------
// Brute-Force Lockout Defense Functions
// ---------------------------------------------------------------------------

/**
 * Inspects current brute-force lockout status
 * @returns {{ isLocked: boolean, remainingSeconds: number, tier: number, remainingAttempts: number, lockedUntil: number }}
 */
export function getLockoutStatus() {
  try {
    if (typeof localStorage === 'undefined') {
      return { isLocked: false, remainingSeconds: 0, tier: 1, remainingAttempts: AUTH_GUARD_CONFIG.MAX_FAILED_ATTEMPTS, lockedUntil: 0 };
    }
    const raw = localStorage.getItem(AUTH_GUARD_CONFIG.LOCKOUT_STORAGE_KEY);
    if (!raw) {
      return { isLocked: false, remainingSeconds: 0, tier: 1, remainingAttempts: AUTH_GUARD_CONFIG.MAX_FAILED_ATTEMPTS, lockedUntil: 0 };
    }
    const state = JSON.parse(raw);
    const now = Date.now();
    const lockedUntil = Number(state.lockedUntil) || 0;
    const tier = Number(state.lockoutTier) || 1;

    if (lockedUntil > now) {
      const remainingMs = lockedUntil - now;
      const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      return {
        isLocked: true,
        remainingSeconds,
        tier,
        remainingAttempts: 0,
        lockedUntil
      };
    }

    // Lockout has expired or not locked yet
    const failedAttempts = Number(state.failedAttempts) || 0;
    const remainingAttempts = Math.max(0, AUTH_GUARD_CONFIG.MAX_FAILED_ATTEMPTS - (failedAttempts >= AUTH_GUARD_CONFIG.MAX_FAILED_ATTEMPTS ? 0 : failedAttempts));

    return {
      isLocked: false,
      remainingSeconds: 0,
      tier,
      remainingAttempts: remainingAttempts === 0 ? AUTH_GUARD_CONFIG.MAX_FAILED_ATTEMPTS : remainingAttempts,
      lockedUntil: 0
    };
  } catch (e) {
    console.warn('Lỗi đọc trạng thái lockout:', e);
    return { isLocked: false, remainingSeconds: 0, tier: 1, remainingAttempts: AUTH_GUARD_CONFIG.MAX_FAILED_ATTEMPTS, lockedUntil: 0 };
  }
}

/**
 * Records a failed admin login attempt and enforces lockout if threshold reached
 * @returns {{ isLocked: boolean, remainingSeconds: number, tier: number, remainingAttempts: number, lockedUntil: number }}
 */
export function recordFailedAttempt() {
  try {
    if (typeof localStorage === 'undefined') {
      return { isLocked: false, remainingSeconds: 0, tier: 1, remainingAttempts: 4, lockedUntil: 0 };
    }

    const currentStatus = getLockoutStatus();
    if (currentStatus.isLocked) {
      return currentStatus;
    }

    const raw = localStorage.getItem(AUTH_GUARD_CONFIG.LOCKOUT_STORAGE_KEY);
    const state = raw ? JSON.parse(raw) : { failedAttempts: 0, lockoutTier: 1, lockedUntil: 0 };
    const now = Date.now();

    // If previously served a lockout that expired and failed again, escalate tier
    const wasPreviouslyLocked = (Number(state.lockedUntil) || 0) > 0 && (Number(state.lockedUntil) || 0) <= now;
    let nextTier = Number(state.lockoutTier) || 1;
    let newAttempts = (Number(state.failedAttempts) || 0) + 1;

    if (wasPreviouslyLocked) {
      nextTier = Math.min(AUTH_GUARD_CONFIG.TIER_DURATIONS_MS.length, nextTier + 1);
    }

    if (newAttempts >= AUTH_GUARD_CONFIG.MAX_FAILED_ATTEMPTS || wasPreviouslyLocked) {
      const tierIndex = Math.max(0, Math.min(AUTH_GUARD_CONFIG.TIER_DURATIONS_MS.length - 1, nextTier - 1));
      const durationMs = AUTH_GUARD_CONFIG.TIER_DURATIONS_MS[tierIndex];
      const lockedUntil = now + durationMs;
      const remainingSeconds = Math.ceil(durationMs / 1000);

      const nextState = {
        failedAttempts: newAttempts,
        lockoutTier: nextTier,
        lockedUntil,
        lastFailedAt: now
      };

      localStorage.setItem(AUTH_GUARD_CONFIG.LOCKOUT_STORAGE_KEY, JSON.stringify(nextState));
      return {
        isLocked: true,
        remainingSeconds,
        tier: nextTier,
        remainingAttempts: 0,
        lockedUntil
      };
    }

    const remainingAttempts = AUTH_GUARD_CONFIG.MAX_FAILED_ATTEMPTS - newAttempts;
    const nextState = {
      failedAttempts: newAttempts,
      lockoutTier: nextTier,
      lockedUntil: 0,
      lastFailedAt: now
    };

    localStorage.setItem(AUTH_GUARD_CONFIG.LOCKOUT_STORAGE_KEY, JSON.stringify(nextState));
    return {
      isLocked: false,
      remainingSeconds: 0,
      tier: nextTier,
      remainingAttempts,
      lockedUntil: 0
    };
  } catch (e) {
    console.warn('Lỗi ghi nhận failed attempt:', e);
    return { isLocked: false, remainingSeconds: 0, tier: 1, remainingAttempts: 0, lockedUntil: 0 };
  }
}

/**
 * Resets lockout state on successful credential validation
 */
export function recordSuccessfulLogin() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(AUTH_GUARD_CONFIG.LOCKOUT_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Lỗi xoá lockout state:', e);
  }
}

// ---------------------------------------------------------------------------
// Cryptographic Admin Session Token Management
// ---------------------------------------------------------------------------

/**
 * Creates and stores a cryptographically signed HMAC-SHA256 admin session token
 * @returns {{ token: string, session: object }}
 */
export function createAdminSession() {
  const now = Date.now();
  const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const payload = {
    sub: 'admin@tavykorea.vn',
    role: 'admin',
    iat: now,
    lastActiveAt: now,
    nonce
  };

  const secret = getSessionSecret();
  const sig = computeHmacSha256(JSON.stringify(payload), secret);
  const sessionObj = { payload, sig };
  const tokenStr = JSON.stringify(sessionObj);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY, tokenStr);
      localStorage.removeItem(AUTH_GUARD_CONFIG.LEGACY_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Lỗi lưu admin session:', e);
  }

  return { token: tokenStr, session: sessionObj };
}

/**
 * Verifies authenticity, signature integrity, and inactivity window of admin session
 * @param {string|object} [tokenStr]
 * @returns {boolean}
 */
export function verifyAdminSession(tokenStr) {
  try {
    let raw = tokenStr;
    if (!raw && typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY);
    }
    if (!raw) return false;

    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || !data.payload || !data.sig) return false;

    // Check payload structure and role
    if (data.payload.role !== 'admin') return false;

    // Verify HMAC-SHA256 signature
    const secret = getSessionSecret();
    const expectedSig = computeHmacSha256(JSON.stringify(data.payload), secret);
    if (expectedSig !== data.sig) {
      clearAdminSession();
      return false;
    }

    // Check 60-minute inactivity limit
    const now = Date.now();
    const lastActiveAt = Number(data.payload.lastActiveAt) || 0;
    if (now - lastActiveAt > AUTH_GUARD_CONFIG.INACTIVITY_LIMIT_MS) {
      clearAdminSession();
      return false;
    }

    return true;
  } catch (e) {
    console.warn('Lỗi xác thực admin session:', e);
    clearAdminSession();
    return false;
  }
}

/**
 * Refreshes the lastActiveAt timestamp of an active session within the inactivity window
 */
export function touchAdminSession() {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY);
    if (!raw) return;

    if (verifyAdminSession(raw)) {
      const data = JSON.parse(raw);
      data.payload.lastActiveAt = Date.now();
      const secret = getSessionSecret();
      data.sig = computeHmacSha256(JSON.stringify(data.payload), secret);
      localStorage.setItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY, JSON.stringify(data));
    }
  } catch (e) {
    console.warn('Lỗi touch admin session:', e);
  }
}

/**
 * Clears and purges both the cryptographic session and legacy auth flags from storage
 */
export function clearAdminSession() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY);
      localStorage.removeItem(AUTH_GUARD_CONFIG.LEGACY_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Lỗi clear admin session:', e);
  }
}
