import { getOrderTotalVnd } from './priceCalculator.js';

/**
 * Standardize and clean phone number (digits only, normalizes +84/0084/840 prefix to 0, adds leading 0 for 9-digit numbers)
 */
export function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('00840') && cleaned.length === 14) {
    cleaned = '0' + cleaned.slice(5);
  } else if (cleaned.startsWith('0084') && cleaned.length >= 13) {
    cleaned = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('840') && cleaned.length === 12) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('84') && cleaned.length === 11) {
    cleaned = '0' + cleaned.slice(2);
  } else if (cleaned.length === 11 && cleaned.startsWith('00') && /^[35789]/.test(cleaned.slice(2))) {
    cleaned = cleaned.slice(1);
  } else if (cleaned.length === 9 && /^[35789]/.test(cleaned)) {
    cleaned = '0' + cleaned;
  }
  return cleaned;
}

/**
 * Standardize and clean email address (lowercase, trimmed).
 * Filters out system placeholder emails (e.g. guest@tavy.vn).
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const clean = email.trim().toLowerCase();
  if (clean === 'guest@tavy.vn' || clean === 'admin_manual@tavykorea.vn') return '';
  return clean;
}

/**
 * Strip Vietnamese diacritics for accents-insensitive searching
 */
export function stripDiacritics(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, m => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase();
}

/**
 * Format phone number for clean UI display (e.g. 0912 345 678)
 */
export function formatPhone(phone) {
  const norm = normalizePhone(phone);
  if (norm.length === 10) {
    return `${norm.slice(0, 4)} ${norm.slice(4, 7)} ${norm.slice(7)}`;
  }
  return phone || '';
}

/**
 * Disjoint Set (Union-Find) with path compression for robust multi-key entity unification
 */
class DisjointSet {
  constructor() {
    this.parent = new Map();
  }
  find(i) {
    if (!this.parent.has(i)) {
      this.parent.set(i, i);
      return i;
    }
    if (this.parent.get(i) !== i) {
      this.parent.set(i, this.find(this.parent.get(i)));
    }
    return this.parent.get(i);
  }
  union(i, j) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent.set(rootI, rootJ);
    }
  }
}

/**
 * Aggregates customers from Firestore users collection and orders collection.
 * Uses Disjoint-Set Connected Components across UID, normalized phone, and normalized email
 * to ensure 100% customer coverage with ZERO duplicates regardless of order sequence.
 *
 * @param {Array} usersList - Users from Firestore 'users' collection
 * @param {Array} orders - Orders from Firestore 'orders' collection
 * @param {Object|number} rates - Exchange rates for calculating order totals
 * @returns {Array} List of unified customer objects
 */
export function aggregateCustomers(usersList = [], orders = [], rates = {}) {
  const validUsers = Array.isArray(usersList) ? usersList : [];
  const validOrders = Array.isArray(orders) ? orders : [];

  const ds = new DisjointSet();
  const userNodes = [];
  const orderNodes = [];

  // 1. Register and union keys for registered users
  validUsers.forEach((u, idx) => {
    const keys = [];
    const uidKey = u.uid || u.id;
    if (uidKey) keys.push(`uid:${uidKey}`);
    const normEmail = normalizeEmail(u.email);
    if (normEmail) keys.push(`email:${normEmail}`);
    const normPhone = normalizePhone(u.phone || u.phoneNumber);
    if (normPhone) keys.push(`phone:${normPhone}`);

    if (keys.length === 0) keys.push(`user_idx:${idx}`);

    keys.forEach(k => ds.find(k));
    for (let i = 1; i < keys.length; i++) {
      ds.union(keys[0], keys[i]);
    }
    userNodes.push({ user: u, primaryKey: keys[0] });
  });

  // 2. Register and union keys for orders
  validOrders.forEach((o, idx) => {
    const keys = [];
    const uidKey = o.userId || o.uid;
    if (uidKey) keys.push(`uid:${uidKey}`);
    const normEmail = normalizeEmail(o.userEmail || o.customerEmail || o.email);
    if (normEmail) keys.push(`email:${normEmail}`);
    const normPhone = normalizePhone(o.customerPhone || o.phone);
    if (normPhone) keys.push(`phone:${normPhone}`);

    if (keys.length === 0) keys.push(`order:${o.id || idx}`);

    keys.forEach(k => ds.find(k));
    for (let i = 1; i < keys.length; i++) {
      ds.union(keys[0], keys[i]);
    }
    orderNodes.push({ order: o, primaryKey: keys[0] });
  });

  // 3. Group users and orders by connected root
  const groups = new Map();
  userNodes.forEach(({ user, primaryKey }) => {
    const root = ds.find(primaryKey);
    if (!groups.has(root)) groups.set(root, { users: [], orders: [] });
    groups.get(root).users.push(user);
  });

  orderNodes.forEach(({ order, primaryKey }) => {
    const root = ds.find(primaryKey);
    if (!groups.has(root)) groups.set(root, { users: [], orders: [] });
    groups.get(root).orders.push(order);
  });

  // 4. Construct unified customer profiles
  const customers = [];
  groups.forEach(group => {
    const { users, orders: groupOrders } = group;

    // Deduplicate orders by ID
    const orderMap = new Map();
    groupOrders.forEach((o, oIdx) => {
      if (!o) return;
      const key = o.id || `order_no_id_${oIdx}`;
      orderMap.set(key, o);
    });
    const uniqueOrders = Array.from(orderMap.values());
    uniqueOrders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const isRegistered = users.length > 0;
    const primaryUser = isRegistered ? (users.find(u => u.photoURL) || users.find(u => u.uid) || users[0]) : null;

    const latestOrder = uniqueOrders[0] || null;
    const orderWithAddress = uniqueOrders.find(o => Boolean((o.shippingAddress || o.address || '').trim()));
    const orderWithPhone = uniqueOrders.find(o => Boolean(normalizePhone(o.customerPhone || o.phone)));
    const orderWithEmail = uniqueOrders.find(o => Boolean(normalizeEmail(o.userEmail || o.customerEmail || o.email)));
    const orderWithName = uniqueOrders.find(o => {
      const cName = (o.customerName || '').trim();
      return Boolean(cName && cName !== 'Khách hàng' && cName !== 'Khách hàng TAVY');
    });

    const userEmailRaw = primaryUser && typeof primaryUser.email === 'string' ? primaryUser.email.trim() : '';
    const userEmailNorm = normalizeEmail(userEmailRaw);
    const orderEmailRaw = orderWithEmail ? (orderWithEmail.userEmail || orderWithEmail.customerEmail || orderWithEmail.email || '').trim() : '';
    const orderEmailNorm = normalizeEmail(orderEmailRaw);

    const rawEmail = userEmailNorm ? userEmailRaw : (orderEmailNorm ? orderEmailRaw : '');
    const normEmail = userEmailNorm || orderEmailNorm;

    const userPhoneRaw = primaryUser ? (primaryUser.phone || primaryUser.phoneNumber || '') : '';
    const userPhoneNorm = normalizePhone(userPhoneRaw);
    const orderPhoneRaw = orderWithPhone ? (orderWithPhone.customerPhone || orderWithPhone.phone || '') : '';
    const orderPhoneNorm = normalizePhone(orderPhoneRaw);

    const rawPhone = userPhoneNorm ? userPhoneRaw : (orderPhoneNorm ? orderPhoneRaw : '');
    const normPhone = userPhoneNorm || orderPhoneNorm;

    const userAddress = primaryUser && (primaryUser.address || primaryUser.shippingAddress || '').trim();
    const orderAddress = orderWithAddress ? (orderWithAddress.shippingAddress || orderWithAddress.address || '').trim() : '';
    const address = userAddress || orderAddress || '';

    let name = '';
    const userDisplayName = primaryUser && (primaryUser.displayName || primaryUser.name || '').trim();
    const isGenericUserName = !userDisplayName || userDisplayName === 'Khách hàng' || userDisplayName === 'Khách hàng TAVY';

    if (userDisplayName && !isGenericUserName) {
      name = userDisplayName;
    } else if (orderWithName && orderWithName.customerName) {
      name = orderWithName.customerName.trim();
    } else if (userDisplayName) {
      name = userDisplayName;
    } else if (latestOrder && (latestOrder.customerName || '').trim() && latestOrder.customerName !== 'Khách hàng' && latestOrder.customerName !== 'Khách hàng TAVY') {
      name = latestOrder.customerName.trim();
    } else if (normEmail) {
      name = rawEmail.split('@')[0];
    } else {
      name = isRegistered ? 'Khách hàng' : 'Khách vãng lai';
    }

    let id = '';
    let uid = null;
    if (isRegistered) {
      uid = primaryUser.uid || primaryUser.id;
      id = uid;
    } else {
      id = `guest_${normPhone || (normEmail ? normEmail.replace(/[@.]/g, '_') : (latestOrder ? latestOrder.id : Date.now()))}`;
    }

    const earliestOrder = uniqueOrders[uniqueOrders.length - 1];
    const createdAt = (primaryUser && (primaryUser.createdAt || primaryUser.lastLoginAt)) || (earliestOrder && earliestOrder.createdAt) || (latestOrder && latestOrder.createdAt) || new Date().toISOString();

    const totalSpent = uniqueOrders.reduce((sum, o) => sum + getOrderTotalVnd(o, rates), 0);

    customers.push({
      id,
      uid,
      name,
      email: normEmail ? rawEmail : '',
      normEmail,
      phone: rawPhone,
      normPhone,
      address,
      photoURL: (primaryUser && primaryUser.photoURL) || '',
      createdAt,
      isRegistered,
      orders: uniqueOrders,
      orderCount: uniqueOrders.length,
      totalSpent
    });
  });

  // Default sorting: highest spending or most recent orders
  customers.sort((a, b) => {
    if (b.totalSpent !== a.totalSpent) return b.totalSpent - a.totalSpent;
    if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  return customers;
}

/**
 * Filter customers by search term and filter type (accents-insensitive & product name support)
 */
export function filterCustomers(customers = [], searchTerm = '', filterType = 'all') {
  if (!Array.isArray(customers)) return [];
  const rawTerm = searchTerm.trim().toLowerCase();
  const strippedTerm = stripDiacritics(rawTerm);

  return customers.filter(c => {
    // Filter by type
    if (filterType === 'registered' && !c.isRegistered) return false;
    if (filterType === 'guests' && c.isRegistered) return false;
    if (filterType === 'with_orders' && c.orderCount === 0) return false;
    if (filterType === 'no_orders' && c.orderCount > 0) return false;

    // Search query matching
    if (!rawTerm) return true;

    // Search UID or Customer ID
    const idMatch = Boolean((c.id && c.id.toLowerCase().includes(rawTerm)) || (c.uid && c.uid.toLowerCase().includes(rawTerm)));

    const nameLower = (c.name || '').toLowerCase();
    const nameStripped = stripDiacritics(c.name);
    const nameMatch = nameLower.includes(rawTerm) || nameStripped.includes(strippedTerm);

    const emailMatch = Boolean(c.email && c.email.toLowerCase().includes(rawTerm));

    const cleanDigits = rawTerm.replace(/\D/g, '');
    const isPureDigits = /^\d+$/.test(rawTerm);
    const normSearchPhone = cleanDigits.length >= 9 ? normalizePhone(rawTerm) : '';
    const normPhoneMatch = Boolean(
      c.normPhone && (
        (((isPureDigits && rawTerm.length >= 2) || cleanDigits.length >= 3) && c.normPhone.includes(cleanDigits)) ||
        (normSearchPhone && c.normPhone.includes(normSearchPhone))
      )
    );

    const addrLower = (c.address || '').toLowerCase();
    const addrStripped = stripDiacritics(c.address);
    const addressMatch = addrLower.includes(rawTerm) || addrStripped.includes(strippedTerm);

    // Also check if search matches any order ID (with or without '#' prefix, or numeric part)
    const cleanTerm = rawTerm.replace(/^#/, '');
    const orderIdMatch = c.orders?.some(o => {
      if (!o || !o.id) return false;
      const oIdLower = String(o.id).toLowerCase();
      return oIdLower.includes(rawTerm) ||
             (cleanTerm && oIdLower.includes(cleanTerm)) ||
             (cleanDigits.length >= 3 && String(o.id).replace(/\D/g, '').includes(cleanDigits));
    });

    // Also check item names inside orders
    const productMatch = c.orders?.some(o => o.items?.some(i => {
      const pName = (i.name || i.productName || '').toLowerCase();
      const pStripped = stripDiacritics(i.name || i.productName);
      return pName.includes(rawTerm) || pStripped.includes(strippedTerm);
    }));

    return Boolean(idMatch || nameMatch || emailMatch || normPhoneMatch || addressMatch || orderIdMatch || productMatch);
  });
}
