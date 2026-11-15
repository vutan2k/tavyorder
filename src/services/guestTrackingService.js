/**
 * Guest Order Tracking & Lookup Data Service for TAVY KOREA
 * Milestone M1: Search & Lookup Data Service
 * 
 * Provides robust phone normalization, case-insensitive Order ID matching,
 * multi-order filtering and sorting, visual 8-step progress calculation,
 * and proof hub media extraction.
 */

import { ORDER_STATUSES, ORDER_STEPS, getStatusConfig, getOrderStepIndex } from '../data/orderStatuses.js';

/**
 * Normalizes raw Vietnamese phone numbers to standard 10-digit format (e.g. 0912345678).
 * Handles +84, 84, spaces, hyphens, parentheses, leading zero omissions, and country code prefixes.
 *
 * @param {string|number} rawPhone - Raw input string or number
 * @returns {string} Clean 10-digit phone number or empty string if invalid
 */
export function normalizePhone(rawPhone) {
  if (rawPhone == null) return '';
  let digits = String(rawPhone).trim().replace(/\D/g, '');
  if (!digits) return '';

  // Handle +84 (0) ... -> 840912345678 (12+ digits)
  if (digits.startsWith('840') && digits.length >= 12) {
    digits = '0' + digits.slice(3);
  }
  // Handle 84912345678 (11+ digits)
  else if (digits.startsWith('84') && digits.length >= 11) {
    digits = '0' + digits.slice(2);
  }
  // Handle 9-digit or 10-digit numbers missing leading 0 (e.g. 912345678)
  else if (!digits.startsWith('0') && (digits.length === 9 || digits.length === 10)) {
    digits = '0' + digits;
  }

  return digits;
}

/**
 * Searches orders by Order ID, Customer Phone, Air AWB, Domestic Tracking Code, or Flight Code.
 * Case-insensitive, prefix-tolerant (with/without "ORD-"), and whitespace-resilient.
 *
 * @param {string} searchTerm - Search query (phone, order ID, tracking code)
 * @param {Array<Object>} ordersList - Array of order objects from AppContext / Firestore
 * @returns {Array<Object>} Matching orders sorted by createdAt descending (newest first)
 */
export function findGuestOrders(searchTerm, ordersList = []) {
  if (!searchTerm || !Array.isArray(ordersList) || ordersList.length === 0) {
    return [];
  }

  const rawQuery = String(searchTerm).trim();
  if (!rawQuery) return [];

  const isQueryAlphabetical = /[a-zA-Z]/.test(rawQuery);
  const queryLower = rawQuery.toLowerCase();
  const queryPhone = normalizePhone(rawQuery);
  const queryNoPrefix = queryLower.replace(/^(ord-?|#)/i, '');
  const isPureNumericQuery = /^\d+$/.test(queryNoPrefix);
  const queryDigits = rawQuery.replace(/\D/g, '');

  const matches = ordersList.filter((order) => {
    if (!order || typeof order !== 'object') return false;

    // 1. Order ID Matching (exact, prefix-stripped, digits — NO substring .includes leak)
    const orderId = String(order.id || order._id || '').trim();
    const orderIdLower = orderId.toLowerCase();
    const orderIdNoPrefix = orderIdLower.replace(/^(ord-?|#)/i, '');
    const orderIdDigits = orderId.replace(/\D/g, '');

    const isIdExact = orderIdLower === queryLower;
    const isIdWithPrefix = orderIdLower === `ord-${queryNoPrefix}` || orderIdLower === `ord${queryNoPrefix}`;
    const isIdNoPrefixMatch = queryNoPrefix.length >= 3 && orderIdNoPrefix === queryNoPrefix;
    const isIdDigitsMatch = isPureNumericQuery && queryDigits.length >= 5 && (
      orderIdDigits === queryDigits ||
      orderIdNoPrefix === queryDigits
    );

    const matchId = isIdExact || isIdWithPrefix || isIdNoPrefixMatch || isIdDigitsMatch;
    if (matchId) return true;

    // 2. Customer Phone Matching (Strict 10-digit normalized equality — no prefix/substring leak)
    // Only match phone numbers if the query does NOT contain alphabetical characters
    if (!isQueryAlphabetical) {
      const oPhone = normalizePhone(order.customerPhone || order.phone || '');
      const oRawPhone = String(order.customerPhone || order.phone || '').replace(/\D/g, '');

      const matchPhone = (
        (queryPhone.length >= 10 && oPhone.length >= 10 && oPhone === queryPhone) ||
        (queryDigits.length >= 10 && oRawPhone.length >= 10 && oRawPhone === queryDigits)
      );
      if (matchPhone) return true;
    }

    // 3. Tracking Codes & Flight Code Matching (Exact match only)
    const trackingCode = String(order.trackingCode || '').trim().toLowerCase();
    const domesticTrackingCode = String(order.domesticTrackingCode || '').trim().toLowerCase();
    const flightCode = String(order.flightCode || '').trim().toLowerCase();

    const matchTracking = (
      (trackingCode && trackingCode === queryLower) ||
      (domesticTrackingCode && domesticTrackingCode === queryLower) ||
      (flightCode && (flightCode === queryLower || flightCode.split(/[\s-]+/)[0] === queryLower))
    );
    if (matchTracking) return true;

    // 4. Customer Email Matching (Exact case-insensitive match)
    const userEmail = String(order.userEmail || '').trim().toLowerCase();
    if (userEmail && userEmail === queryLower) {
      return true;
    }

    return false;
  });

  // Sort: Newest createdAt first (descending), invalid/missing dates last
  return matches.sort((a, b) => {
    const timeA = a.createdAt && !isNaN(new Date(a.createdAt).getTime()) ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt && !isNaN(new Date(b.createdAt).getTime()) ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
  });
}

/**
 * Calculates current step progression and progress bar percentage for an order.
 *
 * @param {Object|string} order - Order object or status key string
 * @param {Object} [orderStatuses] - Optional status dictionary (defaults to ORDER_STATUSES)
 * @returns {Object} Progression summary { stepIndex, currentStep, stepNumber, progressPercentage, progressPercent, isCancelled, isCompleted, statusKey, statusConfig, stepConfig }
 */
export function calculateStepProgress(order, orderStatuses = ORDER_STATUSES) {
  if (!order) {
    const defaultCfg = (orderStatuses && orderStatuses.pending) || getStatusConfig('pending');
    return {
      stepIndex: 0,
      currentStep: 0,
      stepNumber: 1,
      progressPercentage: 12.5,
      progressPercent: '12.5%',
      isCancelled: false,
      isCompleted: false,
      statusKey: 'pending',
      statusConfig: defaultCfg,
      stepConfig: ORDER_STEPS[0]
    };
  }

  const statusKey = typeof order === 'string' ? order : (order.status || 'pending');
  const statusCfg = (orderStatuses && orderStatuses[statusKey]) || getStatusConfig(statusKey);
  const isCancelled = statusKey === 'cancelled' || statusCfg.stepIndex === -1;

  if (isCancelled) {
    return {
      stepIndex: -1,
      currentStep: -1,
      stepNumber: -1,
      progressPercentage: 0,
      progressPercent: '0%',
      isCancelled: true,
      isCompleted: false,
      statusKey: 'cancelled',
      statusConfig: statusCfg,
      stepConfig: null
    };
  }

  const stepIndex = getOrderStepIndex(order);
  const safeStepIndex = Math.max(0, Math.min(stepIndex, 7));
  const progressPercentage = ((safeStepIndex + 1) / 8) * 100;
  const progressPercent = `${progressPercentage}%`;
  const isCompleted = safeStepIndex === 7 || statusKey === 'completed';
  const stepConfig = ORDER_STEPS[safeStepIndex] || ORDER_STEPS[0];

  return {
    stepIndex: safeStepIndex,
    currentStep: safeStepIndex,
    stepNumber: safeStepIndex + 1,
    progressPercentage,
    progressPercent,
    isCancelled: false,
    isCompleted,
    statusKey,
    statusConfig: statusCfg,
    stepConfig
  };
}

/**
 * Extracts and formats transparent fulfillment proof media and tracking badges.
 *
 * @param {Object} order - Order object
 * @returns {Object} Proof badges object with media URLs, carriers, and badge item array
 */
export function getProofBadges(order) {
  if (!order || typeof order !== 'object') {
    return {
      hasProof: false,
      povVideoUrl: null,
      receiptImageUrl: null,
      packingVideoUrl: null,
      packageWeightKg: null,
      flightCode: null,
      trackingCode: null,
      domesticCarrier: 'ViettelPost',
      domesticTrackingCode: null,
      badges: []
    };
  }

  const povVideoUrl = order.povVideoUrl || null;
  const receiptImageUrl = order.receiptImageUrl || order.billImageUrl || null;
  const packingVideoUrl = order.packingVideoUrl || null;
  const packageWeightKg = order.packageWeightKg != null ? order.packageWeightKg : null;
  const flightCode = order.flightCode || null;
  const trackingCode = order.trackingCode || null;
  const domesticCarrier = order.domesticCarrier || 'ViettelPost';
  const domesticTrackingCode = order.domesticTrackingCode || null;

  const badges = [];

  if (povVideoUrl) {
    badges.push({
      id: 'pov_video',
      type: 'video',
      label: 'Video POV Store',
      url: povVideoUrl,
      icon: 'Video',
      color: '#7C3AED',
      bgColor: '#F3E8FF',
      borderColor: '#8B5CF6'
    });
  }

  if (receiptImageUrl) {
    badges.push({
      id: 'receipt_bill',
      type: 'image',
      label: 'Bill Store',
      url: receiptImageUrl,
      icon: 'FileText',
      color: '#374151',
      bgColor: '#F3F4F6',
      borderColor: '#9CA3AF'
    });
  }

  if (packingVideoUrl) {
    badges.push({
      id: 'packing_video',
      type: 'video',
      label: 'Video Đóng Kiện',
      url: packingVideoUrl,
      icon: 'PackageCheck',
      color: '#DB2777',
      bgColor: '#FCE7F3',
      borderColor: '#EC4899'
    });
  }

  if (packageWeightKg != null && packageWeightKg !== '') {
    badges.push({
      id: 'package_weight',
      type: 'badge',
      label: `Cân nặng: ${packageWeightKg} kg`,
      value: packageWeightKg,
      icon: 'Scale',
      color: '#047857',
      bgColor: '#ECFDF5',
      borderColor: '#10B981'
    });
  }

  if (flightCode) {
    badges.push({
      id: 'flight_code',
      type: 'badge',
      label: `Chuyến bay: ${flightCode}`,
      value: flightCode,
      icon: 'Plane',
      color: '#0891B2',
      bgColor: '#CFFAFE',
      borderColor: '#06B6D4'
    });
  }

  if (trackingCode) {
    badges.push({
      id: 'air_awb',
      type: 'badge',
      label: `AWB Air: ${trackingCode}`,
      value: trackingCode,
      icon: 'Plane',
      color: '#0284C7',
      bgColor: '#E0F2FE',
      borderColor: '#38BDF8'
    });
  }

  if (domesticTrackingCode) {
    badges.push({
      id: 'domestic_tracking',
      type: 'tracking',
      label: `Vận đơn VN: ${domesticTrackingCode}`,
      carrier: domesticCarrier,
      value: domesticTrackingCode,
      icon: 'Truck',
      color: '#059669',
      bgColor: '#D1FAE5',
      borderColor: '#10B981'
    });
  }

  const hasProof = badges.length > 0;

  return {
    hasProof,
    povVideoUrl,
    receiptImageUrl,
    packingVideoUrl,
    packageWeightKg,
    flightCode,
    trackingCode,
    domesticCarrier,
    domesticTrackingCode,
    badges
  };
}

export default {
  normalizePhone,
  findGuestOrders,
  calculateStepProgress,
  getProofBadges
};
