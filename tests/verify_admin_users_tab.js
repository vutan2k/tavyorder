import assert from 'assert';
import {
  aggregateCustomers,
  filterCustomers,
  formatPhone,
  normalizePhone,
  normalizeEmail
} from '../src/utils/customerAggregator.js';
import { getOrderTotalVnd } from '../src/utils/priceCalculator.js';

console.log('--- RUNNING CUSTOMER AGGREGATION & ADMIN USERS VERIFICATION ---');

// Test 1: normalizePhone and formatPhone
assert.strictEqual(normalizePhone('0912345678'), '0912345678');
assert.strictEqual(normalizePhone('+84912345678'), '0912345678');
assert.strictEqual(normalizePhone('84912345678'), '0912345678');
assert.strictEqual(normalizePhone('(091) 234-5678'), '0912345678');
assert.strictEqual(formatPhone('0912345678'), '0912 345 678');
console.log('✓ Test 1: Phone normalization and formatting passed');

// Test 2: normalizeEmail
assert.strictEqual(normalizeEmail('  Alice@Example.COM  '), 'alice@example.com');
assert.strictEqual(normalizeEmail(''), '');
assert.strictEqual(normalizeEmail(null), '');
console.log('✓ Test 2: Email normalization passed');

// Test 3: aggregateCustomers with empty inputs
const emptyAgg = aggregateCustomers([], [], {});
assert.strictEqual(emptyAgg.length, 0);
console.log('✓ Test 3: Empty input handling passed');

// Test 4: Registered user without orders
const mockUsers = [
  {
    uid: 'u1',
    name: 'Nguyễn Văn A',
    email: 'nguyenvana@gmail.com',
    phone: '0912345678',
    address: '123 Phố Huế, Hà Nội',
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    uid: 'u2',
    name: 'Trần Thị B',
    email: 'tranthib@gmail.com',
    phone: '0987654321',
    address: '456 Lê Lợi, TP.HCM',
    createdAt: '2026-01-02T00:00:00Z'
  }
];

const aggWithNoOrders = aggregateCustomers(mockUsers, [], { KRW: { rate: 20 } });
assert.strictEqual(aggWithNoOrders.length, 2);
assert.strictEqual(aggWithNoOrders[0].orderCount, 0);
assert.strictEqual(aggWithNoOrders[0].totalSpent, 0);
assert.strictEqual(aggWithNoOrders[0].isRegistered, true);
console.log('✓ Test 4: Registered users with 0 orders passed');

// Test 5: Orders linking to registered users
const mockOrders = [
  {
    id: 'ORD-101',
    userId: 'u1',
    customerName: 'Nguyễn Văn A',
    customerPhone: '0912345678',
    userEmail: 'nguyenvana@gmail.com',
    totalVnd: 500000,
    createdAt: '2026-02-01T10:00:00Z'
  },
  {
    id: 'ORD-102',
    customerName: 'Nguyễn Văn A',
    customerPhone: '0912345678',
    userEmail: 'nguyenvana@gmail.com',
    totalVnd: 300000,
    createdAt: '2026-02-05T10:00:00Z'
  },
  // Guest order from customer C
  {
    id: 'ORD-201',
    customerName: 'Lê Văn C',
    customerPhone: '0901234567',
    userEmail: 'levanc@yahoo.com',
    totalVnd: 1200000,
    shippingAddress: '789 Trần Hưng Đạo, Đà Nẵng',
    createdAt: '2026-02-10T10:00:00Z'
  },
  // Second guest order from customer C (matching phone)
  {
    id: 'ORD-202',
    customerName: 'Lê Văn C',
    customerPhone: '0901234567',
    userEmail: '',
    totalVnd: 800000,
    shippingAddress: '789 Trần Hưng Đạo, Đà Nẵng',
    createdAt: '2026-02-12T10:00:00Z'
  },
  // Guest order with only phone (no email)
  {
    id: 'ORD-301',
    customerName: 'Phạm Thị D',
    customerPhone: '0933445566',
    userEmail: '',
    totalVnd: 450000,
    shippingAddress: 'Cần Thơ',
    createdAt: '2026-02-15T10:00:00Z'
  }
];

const fullAgg = aggregateCustomers(mockUsers, mockOrders, {});
// Total customers should be 4:
// 1. Lê Văn C: 2 orders, 2.000.000đ
// 2. Nguyễn Văn A: 2 orders, 800.000đ
// 3. Phạm Thị D: 1 order, 450.000đ
// 4. Trần Thị B: 0 orders, 0đ
assert.strictEqual(fullAgg.length, 4, `Expected 4 unique customers, got ${fullAgg.length}`);

const userA = fullAgg.find(c => c.name === 'Nguyễn Văn A');
assert(userA, 'User A must exist');
assert.strictEqual(userA.orderCount, 2);
assert.strictEqual(userA.totalSpent, 800000);
assert.strictEqual(userA.isRegistered, true);

const guestC = fullAgg.find(c => c.phone === '0901234567');
assert(guestC, 'Guest C must exist');
assert.strictEqual(guestC.name, 'Lê Văn C');
assert.strictEqual(guestC.orderCount, 2);
assert.strictEqual(guestC.totalSpent, 2000000);
assert.strictEqual(guestC.isRegistered, false);
assert.strictEqual(guestC.address, '789 Trần Hưng Đạo, Đà Nẵng');

const guestD = fullAgg.find(c => c.phone === '0933445566');
assert(guestD, 'Guest D must exist');
assert.strictEqual(guestD.email, '');
assert.strictEqual(guestD.orderCount, 1);
assert.strictEqual(guestD.totalSpent, 450000);

console.log('✓ Test 5: Full customer aggregation & deduplication passed');

// Test 6: filterCustomers
// Search by phone
const searchByPhone = filterCustomers(fullAgg, '0933445566');
assert.strictEqual(searchByPhone.length, 1);
assert.strictEqual(searchByPhone[0].name, 'Phạm Thị D');

// Search by name
const searchByName = filterCustomers(fullAgg, 'văn');
assert.strictEqual(searchByName.length, 2); // Nguyễn Văn A and Lê Văn C

// Search by address
const searchByAddr = filterCustomers(fullAgg, 'Đà Nẵng');
assert.strictEqual(searchByAddr.length, 1);
assert.strictEqual(searchByAddr[0].name, 'Lê Văn C');

// Search by order ID
const searchByOrderId = filterCustomers(fullAgg, 'ORD-201');
assert.strictEqual(searchByOrderId.length, 1);
assert.strictEqual(searchByOrderId[0].name, 'Lê Văn C');

// Filter by registered
const registeredOnly = filterCustomers(fullAgg, '', 'registered');
assert.strictEqual(registeredOnly.length, 2);

// Filter by guests
const guestsOnly = filterCustomers(fullAgg, '', 'guests');
assert.strictEqual(guestsOnly.length, 2);

// Filter by with_orders
const withOrders = filterCustomers(fullAgg, '', 'with_orders');
assert.strictEqual(withOrders.length, 3);

// Filter by no_orders
const noOrders = filterCustomers(fullAgg, '', 'no_orders');
assert.strictEqual(noOrders.length, 1);
assert.strictEqual(noOrders[0].name, 'Trần Thị B');

console.log('✓ Test 6: Customer search and filtering passed');

// Test 7: Sorting logic
const sortedBySpending = [...fullAgg].sort((a, b) => b.totalSpent - a.totalSpent);
assert.strictEqual(sortedBySpending[0].name, 'Lê Văn C'); // 2.000.000đ
assert.strictEqual(sortedBySpending[sortedBySpending.length - 1].totalSpent, 0);

const sortedByName = [...fullAgg].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
assert.strictEqual(sortedByName[0].name, 'Lê Văn C');
console.log('✓ Test 7: Sorting logic passed');

// Test 8: Updating Customer Synchronizes Associated Orders
let testOrders = JSON.parse(JSON.stringify(mockOrders));
const customerToUpdate = fullAgg.find(c => c.name === 'Lê Văn C');
assert(customerToUpdate, 'Customer C should exist');

// Simulate updateCustomer
const updatedName = 'Lê Văn C Cập Nhật';
const updatedPhone = '0909999999';
const updatedAddress = '999 Đường Mới, TP.HCM';

testOrders = testOrders.map(order => {
  const isMatched = (customerToUpdate.orders.some(o => o.id === order.id)) ||
                    (order.customerPhone === customerToUpdate.phone);
  if (isMatched) {
    return {
      ...order,
      customerName: updatedName,
      customerPhone: updatedPhone,
      shippingAddress: updatedAddress
    };
  }
  return order;
});

// Check that orders for Customer C are updated
const ordersForC = testOrders.filter(o => o.id === 'ORD-201' || o.id === 'ORD-202');
assert.strictEqual(ordersForC.length, 2);
assert.strictEqual(ordersForC[0].customerName, updatedName);
assert.strictEqual(ordersForC[0].customerPhone, updatedPhone);
assert.strictEqual(ordersForC[0].shippingAddress, updatedAddress);
assert.strictEqual(ordersForC[1].customerName, updatedName);
assert.strictEqual(ordersForC[1].customerPhone, updatedPhone);

// Check that other customer orders were NOT touched
const orderA = testOrders.find(o => o.id === 'ORD-101');
assert.strictEqual(orderA.customerName, 'Nguyễn Văn A');
console.log('✓ Test 8: Customer update & order synchronization passed');

// Test 9: Deleting Customer Cascades to Associated Orders
const customerToDelete = customerToUpdate;
const orderIdsToDelete = new Set(customerToDelete.orders.map(o => o.id));

const remainingOrders = testOrders.filter(o => !orderIdsToDelete.has(o.id));
assert.strictEqual(remainingOrders.length, testOrders.length - 2);
assert(!remainingOrders.some(o => o.id === 'ORD-201' || o.id === 'ORD-202'));
console.log('✓ Test 9: Cascade deletion of customer and associated orders passed');

// Test 10: Advanced Phone Normalization (+840 prefix)
assert.strictEqual(normalizePhone('+84 (0) 91 234 5678'), '0912345678');
assert.strictEqual(normalizePhone('840987654321'), '0987654321');
console.log('✓ Test 10: Advanced Phone Normalization (+840 prefix) passed');

// Test 11: Placeholder Email Filtering
assert.strictEqual(normalizeEmail('guest@tavy.vn'), '');
assert.strictEqual(normalizeEmail('  guest@TAVY.VN  '), '');
assert.strictEqual(normalizeEmail('admin_manual@tavykorea.vn'), '');
assert.strictEqual(normalizeEmail('realuser@gmail.com'), 'realuser@gmail.com');
console.log('✓ Test 11: Placeholder Email Filtering passed');

// Test 12: Independent Guest Orders with Default guest@tavy.vn Do NOT Merge
const guestOrdersWithDefaultEmail = [
  {
    id: 'ORD-G1',
    customerName: 'Khách Một',
    customerPhone: '0911111111',
    userEmail: 'guest@tavy.vn',
    totalVnd: 200000,
    createdAt: '2026-03-01T00:00:00Z'
  },
  {
    id: 'ORD-G2',
    customerName: 'Khách Hai',
    customerPhone: '0922222222',
    userEmail: 'guest@tavy.vn',
    totalVnd: 350000,
    createdAt: '2026-03-02T00:00:00Z'
  }
];

const guestAgg = aggregateCustomers([], guestOrdersWithDefaultEmail, {});
assert.strictEqual(guestAgg.length, 2, 'Should create 2 distinct guest customers, not merge under guest@tavy.vn');
assert.strictEqual(guestAgg[0].email, '', 'Guest 1 email should be empty string (displayed as Chưa có)');
assert.strictEqual(guestAgg[1].email, '', 'Guest 2 email should be empty string (displayed as Chưa có)');
console.log('✓ Test 12: Independent guest orders with default email kept separate with empty email');

// Test 13: Adversarial Cascade Deletion Safety (No Global Guest Wipeout)
const deleteTarget = guestAgg.find(c => c.phone === '0911111111');
assert(deleteTarget, 'Target guest 1 should exist');

const targetOrders = Array.isArray(deleteTarget.orders) ? deleteTarget.orders : [];
const idsToDelete = new Set(targetOrders.map(o => o.id));

const targetPhoneNorm = normalizePhone(deleteTarget.phone);
const targetEmailNorm = normalizeEmail(deleteTarget.email);

guestOrdersWithDefaultEmail.forEach(o => {
  const oPhoneNorm = normalizePhone(o.customerPhone);
  const oEmailNorm = normalizeEmail(o.userEmail || o.customerEmail);
  const isMatchedByUid = deleteTarget.uid && (o.userId === deleteTarget.uid || o.uid === deleteTarget.uid);
  const isMatchedByPhone = targetPhoneNorm && oPhoneNorm && targetPhoneNorm === oPhoneNorm;
  const isMatchedByEmail = targetEmailNorm && oEmailNorm && targetEmailNorm === oEmailNorm;

  if (isMatchedByUid || isMatchedByPhone || isMatchedByEmail) {
    idsToDelete.add(o.id);
  }
});

// idsToDelete must ONLY contain ORD-G1, NOT ORD-G2!
assert.strictEqual(idsToDelete.size, 1, 'Only target customer order should be marked for deletion');
assert(idsToDelete.has('ORD-G1'), 'ORD-G1 must be marked for deletion');
assert(!idsToDelete.has('ORD-G2'), 'ORD-G2 must NOT be deleted when deleting ORD-G1!');
console.log('✓ Test 13: Cascade deletion safety against placeholder email passed');

// Test 14: Search by Order ID with '#' prefix
const searchWithHash = filterCustomers(fullAgg, '#201');
assert.strictEqual(searchWithHash.length, 1);
assert.strictEqual(searchWithHash[0].name, 'Lê Văn C');
console.log('✓ Test 14: Search by order ID with # prefix passed');

// Test 15: Search by pure numeric phone prefix
const searchByTwoDigits = filterCustomers(fullAgg, '09');
assert.strictEqual(searchByTwoDigits.length, 4, 'All 4 customers with 09 phone should match');
const searchByThreeDigits = filterCustomers(fullAgg, '091');
assert.strictEqual(searchByThreeDigits.length, 1, 'Only Nguyen Van A has 091 phone');
assert.strictEqual(searchByThreeDigits[0].name, 'Nguyễn Văn A');
console.log('✓ Test 15: Search by pure 2-digit and 3-digit phone prefix passed');

// Test 16: Out-of-order Order Arrival (Unlinked order precedes registered order)
const outOfOrderUsers = [{ uid: 'u_alice', email: 'alice@gmail.com', phone: '' }];
const outOfOrderOrders = [
  { id: 'ORD-OO1', customerPhone: '0912345678', createdAt: '2026-03-01T00:00:00Z' }, // guest, arrives first
  { id: 'ORD-OO2', userId: 'u_alice', customerPhone: '0912345678', userEmail: 'alice@gmail.com', createdAt: '2026-03-02T00:00:00Z' }
];
const oooAgg = aggregateCustomers(outOfOrderUsers, outOfOrderOrders, {});
assert.strictEqual(oooAgg.length, 1, 'Should unify into single registered customer despite out-of-order arrival');
assert.strictEqual(oooAgg[0].orderCount, 2, 'Should link both orders');
assert.strictEqual(oooAgg[0].isRegistered, true, 'Customer should be marked as registered');
assert.strictEqual(oooAgg[0].normPhone, '0912345678', 'Customer should have resolved phone number');
console.log('✓ Test 16: Out-of-order order arrival linked seamlessly passed');

// Test 17: Multi-Order Guest Linking Across Phone & Email (Bridged Identity)
const bridgedGuestOrders = [
  { id: 'BG-1', userEmail: 'bob@gmail.com', totalVnd: 100000 },
  { id: 'BG-2', userEmail: 'bob@gmail.com', customerPhone: '0988776655', totalVnd: 200000 },
  { id: 'BG-3', customerPhone: '0988776655', totalVnd: 300000 }
];
const bridgedAgg = aggregateCustomers([], bridgedGuestOrders, {});
assert.strictEqual(bridgedAgg.length, 1, 'Should unify all 3 orders into 1 guest customer via bridged identity');
assert.strictEqual(bridgedAgg[0].orderCount, 3);
assert.strictEqual(bridgedAgg[0].totalSpent, 600000);
assert.strictEqual(bridgedAgg[0].normPhone, '0988776655');
assert.strictEqual(bridgedAgg[0].email, 'bob@gmail.com');
console.log('✓ Test 17: Multi-order guest bridged identity passed');

// Test 18: Deduplication of Duplicate Registered Users in Firestore
const duplicateUsers = [
  { uid: 'u_dan', email: 'dan@gmail.com', name: 'Dan Nguyên' },
  { id: 'dan_gmail_com', email: 'dan@gmail.com', name: 'Dan Nguyên Copy' }
];
const dupAgg = aggregateCustomers(duplicateUsers, [], {});
assert.strictEqual(dupAgg.length, 1, 'Duplicate user docs with same email should merge into 1 customer');
console.log('✓ Test 18: Duplicate registered user documents deduplication passed');

// Test 19: Unaccented Vietnamese Search (Diacritics Insensitive)
const searchUnaccentedName = filterCustomers(fullAgg, 'nguyen van a');
assert.strictEqual(searchUnaccentedName.length, 1);
assert.strictEqual(searchUnaccentedName[0].name, 'Nguyễn Văn A');

const searchUnaccentedAddr = filterCustomers(fullAgg, 'da nang');
assert.strictEqual(searchUnaccentedAddr.length, 1);
assert.strictEqual(searchUnaccentedAddr[0].name, 'Lê Văn C');
console.log('✓ Test 19: Diacritics-insensitive Vietnamese search passed');

// Test 20: 0084 Phone Prefix & 9-digit Numbers Normalization
assert.strictEqual(normalizePhone('0084912345678'), '0912345678');
assert.strictEqual(normalizePhone('912345678'), '0912345678');
assert.strictEqual(normalizePhone('987654321'), '0987654321');
console.log('✓ Test 20: 0084 prefix and 9-digit phone normalization passed');

// Test 21: Search by Product Name within Customer Orders
const custWithProduct = [
  {
    name: 'Khách Test',
    normPhone: '0977112233',
    orders: [
      { id: 'ORD-P1', items: [{ name: 'Torriden Dive-In Serum 50ml' }] }
    ]
  }
];
const searchProduct = filterCustomers(custWithProduct, 'Torriden');
assert.strictEqual(searchProduct.length, 1, 'Should find customer who ordered Torriden');
const searchProductLower = filterCustomers(custWithProduct, 'serum');
assert.strictEqual(searchProductLower.length, 1);
console.log('✓ Test 21: Product name search within customer orders passed');

// Test 22: getOrderTotalVnd with 3-argument signature
const orderWithoutExplicitTotal = {
  country: 'KRW',
  items: [{ foreignPrice: 1000, qty: 1 }]
};
// 1000 Won * 20 rate * (1 + 10/100) = 22,000 VND
const totalWithFee = getOrderTotalVnd(orderWithoutExplicitTotal, 20, 10);
assert.strictEqual(totalWithFee, 22000, '3-argument getOrderTotalVnd should use rate 20 and fee 10%');
console.log('✓ Test 22: 3-argument getOrderTotalVnd signature verification passed');

// Test 23: Cross-identifier Customer Update with previousPhone and previousEmail
let syncTestOrders = [
  { id: 'O-OLD-1', customerPhone: '0911111111', userEmail: 'old@gmail.com', customerName: 'Old Name' },
  { id: 'O-OLD-2', customerPhone: '0911111111', userEmail: 'old@gmail.com', customerName: 'Old Name' }
];
const updatePayload = {
  name: 'New Name',
  phone: '0999999999',
  email: 'new@gmail.com',
  previousPhone: '0911111111',
  previousEmail: 'old@gmail.com',
  address: 'New Address'
};
const updatedPrevPhoneNorm = normalizePhone(updatePayload.previousPhone);
const updatedTargetPhoneNorm = normalizePhone(updatePayload.phone);
syncTestOrders = syncTestOrders.map(order => {
  const oPhoneNorm = normalizePhone(order.customerPhone);
  if (oPhoneNorm === updatedPrevPhoneNorm || oPhoneNorm === updatedTargetPhoneNorm) {
    return {
      ...order,
      customerName: updatePayload.name,
      customerPhone: updatedTargetPhoneNorm,
      userEmail: updatePayload.email,
      shippingAddress: updatePayload.address
    };
  }
  return order;
});
assert.strictEqual(syncTestOrders[0].customerPhone, '0999999999');
assert.strictEqual(syncTestOrders[1].customerPhone, '0999999999');
assert.strictEqual(syncTestOrders[0].customerName, 'New Name');
console.log('✓ Test 23: Cross-identifier customer update with previousPhone passed');

// Test 24: 00840 14-digit & 00912345678 11-digit phone normalization
assert.strictEqual(normalizePhone('0084 091 234 5678'), '0912345678', 'Should strip 00840 trunk to 0912345678');
assert.strictEqual(normalizePhone('00840912345678'), '0912345678', '14-digit continuous 00840 should yield 10 digits');
assert.strictEqual(normalizePhone('00912345678'), '0912345678', 'Should strip double zero prefix');
console.log('✓ Test 24: 00840 14-digit & double-zero normalization passed');

// Test 25: Search by international phone format (+84 / 84 / 0084)
const searchByPlus84 = filterCustomers(fullAgg, '+84912345678');
assert.strictEqual(searchByPlus84.length, 1, 'Should find customer when searching with +84');
assert.strictEqual(searchByPlus84[0].name, 'Nguyễn Văn A');
const searchBy84 = filterCustomers(fullAgg, '84912345678');
assert.strictEqual(searchBy84.length, 1, 'Should find customer when searching with 84 prefix');
console.log('✓ Test 25: Search by international phone format passed');

// Test 26: Search by Customer UID / ID
const searchByUid = filterCustomers(fullAgg, 'u1');
assert.strictEqual(searchByUid.length, 1, 'Should find customer by UID');
assert.strictEqual(searchByUid[0].name, 'Nguyễn Văn A');
console.log('✓ Test 26: Search by customer UID / ID passed');

// Test 27: Primary user whitespace fallback & generic name fallback to order customerName
const userWithWhitespaceAndGeneric = [
  {
    uid: 'u_generic',
    name: 'Khách hàng',
    displayName: 'Khách hàng',
    phone: '   ',
    address: '   ',
    email: 'generic@gmail.com'
  }
];
const orderForGeneric = [
  {
    id: 'ORD-GEN-1',
    userId: 'u_generic',
    customerName: 'Nguyễn Văn Minh Thực Tế',
    customerPhone: '0981234567',
    shippingAddress: '456 Phố Mới, Hải Phòng'
  }
];
const genericAgg = aggregateCustomers(userWithWhitespaceAndGeneric, orderForGeneric, {});
assert.strictEqual(genericAgg.length, 1);
assert.strictEqual(genericAgg[0].name, 'Nguyễn Văn Minh Thực Tế', 'Generic name Khách hàng should fallback to order customerName');
assert.strictEqual(genericAgg[0].normPhone, '0981234567', 'Whitespace phone in profile should fallback to order customerPhone');
assert.strictEqual(genericAgg[0].address, '456 Phố Mới, Hải Phòng', 'Whitespace address in profile should fallback to order shippingAddress');
console.log('✓ Test 27: Primary user whitespace & generic name fallback passed');

// Test 28: Rejecting admin_manual@tavykorea.vn as a placeholder email
assert.strictEqual(normalizeEmail('admin_manual@tavykorea.vn'), '', 'admin_manual@tavykorea.vn must be recognized as placeholder');
const guestOrdersWithAdminManual = [
  { id: 'O-AM-1', customerPhone: '0933111222', userEmail: 'admin_manual@tavykorea.vn' },
  { id: 'O-AM-2', customerPhone: '0944111222', userEmail: 'admin_manual@tavykorea.vn' }
];
const adminManualAgg = aggregateCustomers([], guestOrdersWithAdminManual, {});
assert.strictEqual(adminManualAgg.length, 2, 'Should not merge guest orders with admin_manual@tavykorea.vn');
console.log('✓ Test 28: admin_manual@tavykorea.vn placeholder handling passed');

// Test 29: Order matching via o.phone and o.email fallback during delete
const ordersWithMixedFieldNames = [
  { id: 'O-MIX-1', phone: '0912345678', email: 'mix@gmail.com' } // uses phone & email instead of customerPhone & userEmail
];
const deleteCustomerMix = {
  id: 'guest_0912345678',
  phone: '0912345678',
  email: 'mix@gmail.com',
  orders: []
};
const orderIdsToDeleteMix = new Set();
const targetPhoneNormMix = normalizePhone(deleteCustomerMix.phone);
const targetEmailNormMix = normalizeEmail(deleteCustomerMix.email);

ordersWithMixedFieldNames.forEach(o => {
  const oPhoneNorm = normalizePhone(o.customerPhone || o.phone);
  const oEmailNorm = normalizeEmail(o.userEmail || o.customerEmail || o.email);
  const isMatchedByPhone = targetPhoneNormMix && oPhoneNorm && targetPhoneNormMix === oPhoneNorm;
  const isMatchedByEmail = targetEmailNormMix && oEmailNorm && targetEmailNormMix === oEmailNorm;
  if (isMatchedByPhone || isMatchedByEmail) {
    orderIdsToDeleteMix.add(o.id);
  }
});
assert.strictEqual(orderIdsToDeleteMix.size, 1, 'Order using o.phone should be matched for deletion');
assert(orderIdsToDeleteMix.has('O-MIX-1'));
console.log('✓ Test 29: Order matching via o.phone and o.email fallback passed');

// Test 30: Old Firestore document cleanup on customer phone update
let mockUsersList = [
  { id: 'user_0911111111', phone: '0911111111', name: 'User Cu' }
];
const phoneUpdatePayload = {
  name: 'User Moi',
  phone: '0999999999',
  previousPhone: '0911111111',
  email: '',
  address: ''
};
const prevPhoneNormTest = normalizePhone(phoneUpdatePayload.previousPhone);
const targetPhoneNormTest = normalizePhone(phoneUpdatePayload.phone);
const targetDocIdTest = `user_${targetPhoneNormTest}`;

mockUsersList = mockUsersList.filter(u => {
  const uNormPhone = normalizePhone(u.phone || u.phoneNumber);
  if (u.id === targetDocIdTest) return false;
  if (targetPhoneNormTest && uNormPhone === targetPhoneNormTest) return false;
  if (prevPhoneNormTest && uNormPhone === prevPhoneNormTest) return false;
  return true;
});
mockUsersList.push({ id: targetDocIdTest, ...phoneUpdatePayload });
assert.strictEqual(mockUsersList.length, 1, 'Should update record in place without duplicates');
assert.strictEqual(mockUsersList[0].id, 'user_0999999999');
assert.strictEqual(mockUsersList[0].phone, '0999999999');
console.log('✓ Test 30: Old Firestore document cleanup on customer phone update passed');

console.log('--- ALL 30 CUSTOMER AGGREGATION & MANAGEMENT TESTS PASSED 100% ---');
