/**
 * Centralized Price Calculation & Currency Formatting Utility
 * Standardized across all customer & admin workflows in TAVY Korea.
 */

/**
 * Calculates the total VND of an order based on:
 * 1. Explicit order.totalVnd if > 0
 * 2. Admin quote order.quote.totalVnd if > 0
 * 3. Multi-item cart order (order.items) with serviceFeeMultiplier
 * 4. Single-item fallback: foreignPrice * krwRate * serviceFeeMultiplier * qty
 *
 * @param {Object} order - The order object
 * @param {Object} rates - Exchange rates config from AppContext/Firestore
 * @returns {number} Total amount in VND (rounded integer)
 */
export function getOrderTotalVnd(order, rates, maybeServiceFee) {
  if (!order || typeof order !== 'object') return 0;

  // 1. Explicit order.totalVnd or order.totalAmount if valid number > 0
  if (typeof order.totalVnd === 'number' && order.totalVnd > 0) {
    return Math.round(order.totalVnd);
  }
  if (typeof order.totalAmount === 'number' && order.totalAmount > 0) {
    return Math.round(order.totalAmount);
  }

  // 2. Admin Quotation total if available
  if (order.quote && typeof order.quote.totalVnd === 'number' && order.quote.totalVnd > 0) {
    return Math.round(order.quote.totalVnd);
  }

  const country = order.country || 'KRW';
  let krwRate = 19.5;
  let serviceFeePercent = 5;

  if (typeof rates === 'number') {
    krwRate = rates;
    if (typeof maybeServiceFee === 'number') {
      serviceFeePercent = maybeServiceFee;
    }
  } else if (rates && typeof rates === 'object') {
    const rateInfo = rates[country] || rates.KRW;
    krwRate = rateInfo?.rate || rates.KRW?.rate || rates.krwRate || 19.5;
    if (rates.serviceFeePercent !== undefined) {
      serviceFeePercent = rates.serviceFeePercent;
    }
  }
  const serviceFeeMultiplier = 1 + (serviceFeePercent / 100);

  // 3. Multi-item cart order
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.items.reduce((sum, item) => {
      if (!item) return sum;
      const qty = Number(item.qty || item.quantity) || 1;
      let itemPriceVnd;
      if (typeof item.priceVnd === 'number' && item.priceVnd > 0) {
        itemPriceVnd = Math.round(item.priceVnd);
      } else if (item.foreignPrice !== undefined || item.priceKrw !== undefined || item.priceWon !== undefined) {
        const itemWon = Number(item.foreignPrice ?? item.priceKrw ?? item.priceWon) || 0;
        itemPriceVnd = Math.round(itemWon * krwRate * serviceFeeMultiplier);
      } else if (typeof item.price === 'number' && item.price > 0) {
        itemPriceVnd = Math.round(item.price);
      } else {
        itemPriceVnd = 0;
      }
      return sum + (itemPriceVnd * qty);
    }, 0);
  }

  // 4. Single-item order fallback (unit price rounded to dong * qty)
  const foreignPrice = Number(order.foreignPrice ?? order.priceKrw ?? order.priceWon) || 0;
  const qty = Number(order.qty || order.quantity) || 1;
  const unitVnd = Math.round(foreignPrice * krwRate * serviceFeeMultiplier);
  return unitVnd * qty;
}

/**
 * Calculates single VND price from Korean Won (KRW) with exchange rate and service fee.
 *
 * @param {number|string} won - Price in Won (KRW)
 * @param {Object|number} rates - Exchange rates config or direct KRW rate number
 * @param {number} [maybeServiceFee] - Optional service fee percent if rates is a number
 * @returns {number} Price in VND (rounded integer)
 */
export function getVndFromWon(won, rates, maybeServiceFee) {
  const numWon = Number(won) || 0;
  let krwRate = 19.5;
  let serviceFeePercent = 5;

  if (typeof rates === 'number') {
    krwRate = rates;
    if (typeof maybeServiceFee === 'number') {
      serviceFeePercent = maybeServiceFee;
    }
  } else if (rates && typeof rates === 'object') {
    const rateInfo = rates.KRW || rates[Object.keys(rates)[0]];
    krwRate = rateInfo?.rate || rates.KRW?.rate || rates.krwRate || 19.5;
    if (rates.serviceFeePercent !== undefined) {
      serviceFeePercent = rates.serviceFeePercent;
    }
  }
  const serviceFeeMultiplier = 1 + (serviceFeePercent / 100);
  return Math.round(numWon * krwRate * serviceFeeMultiplier);
}

/**
 * Formats a number into Vietnamese Dong currency format (e.g., "150.000 VNĐ").
 *
 * @param {number|string} amount
 * @returns {string} Formatted VND string
 */
export function formatVnd(amount) {
  if (amount == null || isNaN(amount)) return '0 VNĐ';
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))} VNĐ`;
}

/**
 * Formats a number into Korean Won currency format (e.g., "₩25,000").
 *
 * @param {number|string} amount
 * @returns {string} Formatted KRW string
 */
export function formatKrw(amount) {
  if (amount == null || isNaN(amount)) return '₩0';
  return `₩${new Intl.NumberFormat('ko-KR').format(Math.round(amount))}`;
}
