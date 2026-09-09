/**
 * src/utils/securityUtils.js
 * Centralized Input Sanitization, HTML-Entity Encoding, Honeypot & Order Rate Limiting Defense
 * TAVY Korea Security Defense System
 */

/**
 * Encodes HTML entities to neutralize Stored and Reflected XSS vectors
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitizes arbitrary text inputs:
 * - Strips <script>, <iframe>, <object>, <embed> tags and their contents
 * - Strips any remaining HTML tags
 * - Strips dangerous pseudo-protocols (javascript:, vbscript:, data:)
 * - Strips inline event handlers (onload, onerror, onclick, etc.)
 * @param {string} str
 * @returns {string}
 */
export function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    // Strip <script>...</script> with contents
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Strip <iframe>...</iframe> with contents
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Strip <object>...</object> with contents
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    // Strip <embed>...</embed> with contents
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    // Strip any remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Strip pseudo-protocols
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    // Strip event handlers (e.g. onerror=, onclick=, onload=)
    .replace(/\bon\w+\s*=/gi, '')
    .trim();
}

/**
 * Sanitizes and normalizes phone numbers by stripping all non-digit characters
 * @param {string|number} phone
 * @returns {string}
 */
export function sanitizePhone(phone) {
  if (!phone && phone !== 0) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Validates 10-digit Vietnamese mobile phone number format:
 * Must start with 03, 05, 07, 08, 09 followed by 8 digits
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidVietnamesePhone(phone) {
  const cleaned = sanitizePhone(phone);
  return /^0(3|5|7|8|9)[0-9]{8}$/.test(cleaned);
}

/**
 * Strictly verifies whether a given URL uses http:// or https:// protocol
 * Rejects pseudo-protocols (javascript:, data:, vbscript:) and malformed URLs
 * @param {string} url
 * @returns {boolean}
 */
export function isValidHttpUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  // Reject dangerous pseudo-protocols immediately
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return false;
  }

  // Strictly enforce http:// or https:// with a valid domain structure
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed);
}

/**
 * Sanitizes a URL, returning it trimmed if valid http(s), or fallback
 * @param {string} url
 * @param {string} fallback
 * @returns {string}
 */
export function sanitizeUrl(url, fallback = '') {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  return isValidHttpUrl(trimmed) ? trimmed : fallback;
}

/**
 * Checks if an invisible honeypot field has been filled (bot detection)
 * Real human users will not see or fill this field
 * @param {string} honeypotVal
 * @returns {boolean}
 */
export function isHoneypotTriggered(honeypotVal) {
  if (!honeypotVal) return false;
  return String(honeypotVal).trim().length > 0;
}

// Client Order Rate Limiting Configuration
const RATE_LIMIT_STORAGE_KEY = 'tavy_order_timestamps';
const MAX_ORDERS_PER_WINDOW = 3;
const WINDOW_DURATION_MS = 5 * 60 * 1000; // 5 minutes (300,000 ms)

/**
 * Checks if the client has exceeded the order placement threshold
 * (Maximum 3 orders within 5 minutes sliding window)
 * @returns {{ allowed: boolean, remainingSeconds: number, message?: string }}
 */
export function checkOrderRateLimit() {
  try {
    if (typeof localStorage === 'undefined') {
      return { allowed: true, remainingSeconds: 0 };
    }
    const raw = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    const timestamps = raw ? JSON.parse(raw) : [];
    const now = Date.now();

    // Filter timestamps within the 5-minute window
    const recentTimestamps = (Array.isArray(timestamps) ? timestamps : [])
      .map(Number)
      .filter(ts => Number.isFinite(ts) && (now - ts) < WINDOW_DURATION_MS);

    if (recentTimestamps.length >= MAX_ORDERS_PER_WINDOW) {
      const oldestInWindow = Math.min(...recentTimestamps);
      const remainingMs = (oldestInWindow + WINDOW_DURATION_MS) - now;
      const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      return {
        allowed: false,
        remainingSeconds,
        message: `Quý khách đã gửi ${MAX_ORDERS_PER_WINDOW} đơn hàng trong vòng 5 phút qua. Để bảo vệ hệ thống khỏi tình trạng quá tải, vui lòng chờ ${remainingSeconds} giây trước khi tạo đơn tiếp theo.`
      };
    }

    return { allowed: true, remainingSeconds: 0 };
  } catch (e) {
    console.warn('Lỗi kiểm tra rate limit:', e);
    // On storage error, allow to proceed so normal user checkout is never broken
    return { allowed: true, remainingSeconds: 0 };
  }
}

/**
 * Records a successful order creation timestamp into the sliding window tracker
 */
export function recordOrderCreationTimestamp() {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    const timestamps = raw ? JSON.parse(raw) : [];
    const now = Date.now();

    const recentTimestamps = (Array.isArray(timestamps) ? timestamps : [])
      .map(Number)
      .filter(ts => Number.isFinite(ts) && (now - ts) < WINDOW_DURATION_MS);

    recentTimestamps.push(now);
    localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(recentTimestamps));
  } catch (e) {
    console.warn('Lỗi ghi nhận rate limit timestamp:', e);
  }
}

/**
 * Defensive payload sanitizer for order objects before storage or transmission
 * @param {object} orderData
 * @returns {object}
 */
export function sanitizeOrderPayload(orderData) {
  if (!orderData || typeof orderData !== 'object') return orderData;

  const sanitized = { ...orderData };

  if ('customerName' in sanitized) {
    sanitized.customerName = sanitizeText(sanitized.customerName);
  }
  if ('customerPhone' in sanitized) {
    sanitized.customerPhone = sanitizePhone(sanitized.customerPhone);
  }
  if ('customerAddress' in sanitized) {
    sanitized.customerAddress = sanitizeText(sanitized.customerAddress);
  }
  if ('customerNote' in sanitized) {
    sanitized.customerNote = sanitizeText(sanitized.customerNote);
  }
  if ('productUrl' in sanitized) {
    sanitized.productUrl = sanitizeUrl(sanitized.productUrl, '');
  }
  if ('povVideoUrl' in sanitized) {
    sanitized.povVideoUrl = sanitizeUrl(sanitized.povVideoUrl, '');
  }
  if ('receiptImageUrl' in sanitized) {
    sanitized.receiptImageUrl = sanitizeUrl(sanitized.receiptImageUrl, '');
  }
  if ('packingVideoUrl' in sanitized) {
    sanitized.packingVideoUrl = sanitizeUrl(sanitized.packingVideoUrl, '');
  }
  if ('depositProofImage' in sanitized) {
    sanitized.depositProofImage = sanitizeUrl(sanitized.depositProofImage, '');
  }

  return sanitized;
}
