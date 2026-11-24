import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase';
import { normalizePhone, findGuestOrders } from './guestTrackingService';

// Collection References
const ORDERS_COLLECTION = 'orders';
const USERS_COLLECTION = 'users';
const SYSTEM_CONFIG_COLLECTION = 'system_config';
const PRODUCTS_COLLECTION = 'products';
const PENDING_PRODUCTS_COLLECTION = 'pending_products';
const AI_MANAGER_TASKS_COLLECTION = 'ai_manager_tasks';
const RATES_DOC = 'rates';

/**
 * 1. Subscribe to Realtime Orders (Global or User filtered)
 */
export const subscribeToOrders = (onUpdate, onError, userEmail) => {
  try {
    let q;
    if (userEmail) {
      q = query(
        collection(db, ORDERS_COLLECTION),
        where('userEmail', '==', userEmail)
      );
    } else {
      q = query(collection(db, ORDERS_COLLECTION));
    }

    return onSnapshot(q, (snapshot) => {
      const ordersList = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        let createdAtIso = new Date().toISOString();
        if (data.createdAt?.toDate) {
          createdAtIso = data.createdAt.toDate().toISOString();
        } else if (typeof data.createdAt === 'string') {
          createdAtIso = data.createdAt;
        }
        return {
          id: docSnap.id,
          ...data,
          createdAt: createdAtIso
        };
      });
      // Sắp xếp đơn mới nhất lên ĐẦU danh sách (index 0)
      ordersList.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      onUpdate(ordersList);
    }, (err) => {
      console.warn("Firestore orders listener fallback:", err);
      if (onError) onError(err);
    });
  } catch (err) {
    console.warn("Firestore subscription error:", err);
    if (onError) onError(err);
    return () => {};
  }
};

// Helper: Bọc Timeout an toàn cho các tác vụ Firestore tránh treo UI
export const withTimeout = (promise, ms = 8000, errorMsg = 'Quá thời gian kết nối đến máy chủ (8 giây). Vui lòng thử lại!') => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    timeoutPromise
  ]);
};

/**
 * 2. Create New Order
 */
export const createOrderInDB = async (orderData) => {
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const orderId = orderData.id || `ORD-${Date.now()}-${randSuffix}`;
  const docRef = doc(db, ORDERS_COLLECTION, orderId);
  const nowIso = new Date().toISOString();
  
  const payload = {
    ...orderData,
    id: orderId,
    status: orderData.status || 'pending',
    paymentStatus: 'unpaid',
    paymentMethod: orderData.paymentMethod || null,
    bankAccount: orderData.bankAccount || null,
    bankName: orderData.bankName || null,
    paymentDue: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: nowIso,
    updatedAt: nowIso
  };

  try {
    await withTimeout(setDoc(docRef, payload), 8000);
    // Ghi chỉ mục tra cứu đơn theo SĐT 10 số cho khách vãng lai (phục vụ getDoc đơn lẻ, không mở list)
    const cleanPhone = normalizePhone(payload.customerPhone || '');
    if (/^0[35789]\d{8}$/.test(cleanPhone)) {
      const phoneIdxRef = doc(db, 'guest_phone_orders', cleanPhone);
      setDoc(phoneIdxRef, {
        phone: cleanPhone,
        orderIds: arrayUnion(orderId),
        updatedAt: nowIso
      }, { merge: true }).catch(() => {});
    }
    return { success: true, id: orderId, order: payload };
  } catch (err) {
    console.warn("Firestore createOrderInDB error:", err);
    throw err;
  }
};

/**
 * 2b. Tra cứu đơn hàng an toàn từ Firestore theo đúng Mã đơn (ORD-...) hoặc SĐT 10 số
 * (Sử dụng getDoc đơn lẻ, tuyệt đối không dùng list query toàn cục)
 */
export const lookupGuestOrdersInDB = async (rawQuery, localOrders = []) => {
  const term = String(rawQuery || '').trim();
  if (!term) return [];

  const localMatched = findGuestOrders(term, localOrders);
  const byId = new Map(localMatched.map((o) => [o.id, o]));

  try {
    const cleanPhone = normalizePhone(term);
    const candidateIds = new Set();

    // 1. Nếu khách nhập mã đơn (ORD-... hoặc mã đơn cụ thể >= 5 ký tự)
    const upperTerm = term.toUpperCase();
    if (upperTerm.startsWith('ORD-')) {
      candidateIds.add(upperTerm);
      candidateIds.add(term);
    } else if (/^[A-Za-z0-9_-]{6,}$/.test(term) && !/^0[35789]\d{8}$/.test(cleanPhone)) {
      candidateIds.add(term);
      candidateIds.add(`ORD-${term}`);
    }

    // 2. Nếu khách nhập đúng SĐT 10 số chuẩn Việt Nam
    if (/^0[35789]\d{8}$/.test(cleanPhone)) {
      candidateIds.add(cleanPhone); // Tương thích đơn cũ dùng SĐT làm ID
      try {
        const idxSnap = await getDoc(doc(db, 'guest_phone_orders', cleanPhone));
        if (idxSnap.exists()) {
          const ids = idxSnap.data()?.orderIds;
          if (Array.isArray(ids)) {
            ids.forEach((id) => {
              if (id && typeof id === 'string') candidateIds.add(id);
            });
          }
        }
      } catch {}
    }

    // 3. Tải từng đơn theo ID bằng getDoc
    const fetchedDocs = await Promise.all(
      Array.from(candidateIds).slice(0, 20).map(async (id) => {
        try {
          const snap = await getDoc(doc(db, ORDERS_COLLECTION, id));
          if (!snap.exists()) return null;
          const data = snap.data();
          const createdAtIso = data.createdAt?.toDate
            ? data.createdAt.toDate().toISOString()
            : (typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString());
          return { id: snap.id, ...data, createdAt: createdAtIso };
        } catch {
          return null;
        }
      })
    );

    for (const item of fetchedDocs) {
      if (item && item.id) {
        byId.set(item.id, item);
      }
    }
  } catch (err) {
    console.warn('lookupGuestOrdersInDB fallback:', err);
  }

  return findGuestOrders(term, Array.from(byId.values()));
};

/**
 * 3. Update Order Quote (Admin)
 */
export const updateOrderQuoteInDB = async (orderId, quoteData, totalCalculated) => {
  try {
    const docRef = doc(db, ORDERS_COLLECTION, orderId);
    const batch = writeBatch(db);

    batch.update(docRef, {
      status: 'quoted',
      quote: quoteData,
      totalVnd: totalCalculated,
      updatedAt: serverTimestamp()
    });

    await batch.commit();
    return { success: true };
  } catch (err) {
    console.warn("Firestore updateQuote error:", err);
    return { success: false, error: err };
  }
};

/**
 * 4. Update Order Status / Tracking (Admin)
 */
export const updateOrderStatusInDB = async (orderId, updates) => {
  try {
    const docRef = doc(db, ORDERS_COLLECTION, orderId);
    await withTimeout(updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    }), 8000);
    return { success: true };
  } catch (err) {
    console.warn("Firestore updateOrderStatus error:", err);
    return { success: false, error: err };
  }
};

/**
 * 4b. Delete Order (Admin)
 */
export const deleteOrderFromDB = async (orderId) => {
  try {
    const docRef = doc(db, ORDERS_COLLECTION, orderId);
    await deleteDoc(docRef);
    return { success: true };
  } catch (err) {
    console.warn("Firestore deleteOrder error:", err);
    return { success: false, error: err };
  }
};

/**
 * 5. Confirm Order Payment
 */
export const confirmOrderPaymentInDB = async (orderId, amountPaid) => {
  try {
    const docRef = doc(db, ORDERS_COLLECTION, orderId);
    await updateDoc(docRef, {
      status: 'deposit_paid',
      paymentStatus: 'paid',
      paymentConfirmed: true,
      paymentDate: new Date().toISOString(),
      amountPaid: amountPaid,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (err) {
    console.warn("Firestore confirmPayment error:", err);
    return { success: false, error: err };
  }
};

/**
 * 6. System Exchange Rates Sync
 */
export const subscribeToRates = (onUpdate) => {
  try {
    const docRef = doc(db, SYSTEM_CONFIG_COLLECTION, RATES_DOC);
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(docSnap.data());
      }
    }, (err) => {
      console.warn("Firestore rates listener fallback:", err);
    });
  } catch (err) {
    console.warn("Firestore rates subscribe error:", err);
    return () => {};
  }
};

export const updateRatesInDB = async (newRates) => {
  try {
    const docRef = doc(db, SYSTEM_CONFIG_COLLECTION, RATES_DOC);
    await setDoc(docRef, {
      ...newRates,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return { success: true };
  } catch (err) {
    console.warn("Firestore updateRates error:", err);
    return { success: false, error: err };
  }
};

/**
 * 7. Save / Update User Profile
 */
export const saveUserProfileInDB = async (userData) => {
  try {
    const userId = userData.uid || userData.email.replace(/[@.]/g, '_');
    const docRef = doc(db, USERS_COLLECTION, userId);
    await setDoc(docRef, {
      ...userData,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return { success: true };
  } catch (err) {
    console.warn("Firestore saveUserProfile error:", err);
    return { success: false, error: err };
  }
};

/**
 * 8. Subscribe to Realtime Products (published catalog)
 */
export const subscribeToProducts = (onUpdate) => {
  try {
    // Chế độ demo catalog 100 SKU (kích hoạt qua param ?demo=100 hoặc localStorage tavy_demo_mode='100')
    const isDemo100 = typeof window !== 'undefined' && (
      window.location.search.includes('demo=100') ||
      localStorage.getItem('tavy_demo_mode') === '100'
    );

    if (isDemo100) {
      console.log("[Demo Mode] Nạp danh mục 100 SKU Tinh Hoa từ /data/demo_100_products.json");
      fetch('/data/demo_100_products.json')
        .then(res => res.json())
        .then(products => {
          onUpdate(products);
        })
        .catch(err => console.error("Lỗi nạp demo catalog:", err));
      return () => {};
    }

    const colRef = collection(db, PRODUCTS_COLLECTION);
    return onSnapshot(colRef, (snapshot) => {
      const products = snapshot.docs.map(docSnap => ({
        goodsNo: docSnap.id,
        ...docSnap.data()
      }));

      // Sắp xếp in-memory theo Thứ Hạng Olive Young (Rank 1 -> 100)
      products.sort((a, b) => {
        const rankA = Number(a.rank) || 9999;
        const rankB = Number(b.rank) || 9999;
        if (rankA !== rankB) return rankA - rankB;
        const timeA = a.updatedAt?.seconds || (a.createdAt?.seconds) || (new Date(a.scrapedAt || 0).getTime()) || 0;
        const timeB = b.updatedAt?.seconds || (b.createdAt?.seconds) || (new Date(b.scrapedAt || 0).getTime()) || 0;
        if (timeB !== timeA) return timeB - timeA;
        return String(a.goodsNo).localeCompare(String(b.goodsNo));
      });

      onUpdate(products);
    }, (err) => {
      console.warn("Firestore products listener error:", err);
    });
  } catch (err) {
    console.warn("Firestore subscribeToProducts error:", err);
    return () => {};
  }
};

/**
 * 9. Save / Upsert a single product to Firestore
 */
export const saveProductToDB = async (product) => {
  try {
    if (!product || typeof product !== 'object') return { success: false };
    const goodsNo = product.goodsNo || `SP-${Date.now()}`;
    const docRef = doc(db, PRODUCTS_COLLECTION, String(goodsNo));

    const cleanPayload = {
      goodsNo: String(goodsNo),
      name: String(product.name || ''),
      nameKr: String(product.nameKr || product.name || ''),
      brand: String(product.brand || 'Korea Brand'),
      brandKr: String(product.brandKr || product.brand || ''),
      category: String(product.category || 'skincare'),
      subCategory: String(product.subCategory || ''),
      categoryLabel: String(product.categoryLabel || ''),
      categoryKr: String(product.categoryKr || ''),
      foreignPrice: Number(product.foreignPrice) || 0,
      originalPrice: Number(product.originalPrice || product.origin_price_krw) || 0,
      discountRate: String(product.discountRate || (product.discount_percent ? `-${product.discount_percent}%` : '')),
      productImage: String(product.productImage || ''),
      images: Array.isArray(product.images) && product.images.length > 0
        ? product.images.map(String).filter(Boolean)
        : (product.productImage ? [String(product.productImage)] : []),
      photoReviews: Array.isArray(product.photoReviews) ? product.photoReviews.map(String).filter(Boolean) : [],
      options: Array.isArray(product.options) ? product.options : [],
      description: String(product.description || ''),
      usage: String(product.usage || ''),
      origin: String(product.origin || 'Store Olive Young Korea'),
      rating: Number.isFinite(Number(product.rating)) ? Number(product.rating) : 0,
      reviewsCount: Number.isFinite(Number(product.reviewsCount)) ? Number(product.reviewsCount) : 0,
      productUrl: String(product.productUrl || ''),
      isPublished: product.isPublished !== false,
      status: String(product.status || 'published'),
      updatedAt: serverTimestamp()
    };

    if (product.priceVnd !== undefined) cleanPayload.priceVnd = Number(product.priceVnd) || 0;
    if (product.priceSyncStatus !== undefined) cleanPayload.priceSyncStatus = String(product.priceSyncStatus || '');
    if (product.priceLastSyncedAt !== undefined) cleanPayload.priceLastSyncedAt = product.priceLastSyncedAt;
    if (product.pendingPriceUpdate !== undefined) cleanPayload.pendingPriceUpdate = product.pendingPriceUpdate;
    if (product.priceChangeAlert !== undefined) cleanPayload.priceChangeAlert = product.priceChangeAlert;
    if (Array.isArray(product.priceHistory)) cleanPayload.priceHistory = product.priceHistory;
    if (product.isOutOfStock !== undefined) cleanPayload.isOutOfStock = Boolean(product.isOutOfStock);
    if (product.isHidden !== undefined) cleanPayload.isHidden = Boolean(product.isHidden);

    await setDoc(docRef, cleanPayload, { merge: true });
    return { success: true };
  } catch (err) {
    console.warn("Firestore saveProduct error:", err);
    return { success: false, error: err };
  }
};

/**
 * 10. Delete a product from Firestore
 */
export const deleteProductFromDB = async (goodsNo) => {
  try {
    if (!goodsNo) return { success: false, error: 'missing goodsNo' };
    const docRef = doc(db, PRODUCTS_COLLECTION, String(goodsNo));
    await deleteDoc(docRef);
    return { success: true };
  } catch (err) {
    console.warn("Firestore deleteProduct error:", err);
    return { success: false, error: err };
  }
};

/**
 * 11. Subscribe to Realtime Pending Products (Hàng chờ duyệt)
 */
export const subscribeToPendingProducts = (onUpdate) => {
  try {
    const colRef = collection(db, PENDING_PRODUCTS_COLLECTION);
    return onSnapshot(colRef, (snapshot) => {
      const pendingItems = snapshot.docs.map(docSnap => ({
        goodsNo: docSnap.id,
        ...docSnap.data()
      }));

      pendingItems.sort((a, b) => {
        const timeA = new Date(a.scrapedAt || 0).getTime();
        const timeB = new Date(b.scrapedAt || 0).getTime();
        if (timeB !== timeA) return timeB - timeA;
        return String(b.goodsNo).localeCompare(String(a.goodsNo));
      });

      onUpdate(pendingItems);
    }, (err) => {
      console.warn("Firestore pending_products listener error:", err);
    });
  } catch (err) {
    console.warn("Firestore subscribeToPendingProducts error:", err);
    return () => {};
  }
};

/**
 * 12. Save Pending Product to Firestore
 */
export const savePendingProductToDB = async (product) => {
  try {
    if (!product || typeof product !== 'object') return { success: false };
    const goodsNo = product.goodsNo || `SP-${Date.now()}`;
    const docRef = doc(db, PENDING_PRODUCTS_COLLECTION, String(goodsNo));

    const cleanPayload = {
      goodsNo: String(goodsNo),
      name: String(product.name || ''),
      nameKr: String(product.nameKr || product.name || ''),
      brand: String(product.brand || 'Korea Brand'),
      brandKr: String(product.brandKr || product.brand || ''),
      category: String(product.category || 'skincare'),
      subCategory: String(product.subCategory || ''),
      categoryLabel: String(product.categoryLabel || ''),
      categoryKr: String(product.categoryKr || ''),
      foreignPrice: Number(product.foreignPrice || product.price) || 0,
      price: Number(product.price || product.foreignPrice) || 0,
      productImage: String(product.productImage || ''),
      images: Array.isArray(product.images) && product.images.length > 0
        ? product.images.map(String).filter(Boolean)
        : (product.productImage ? [String(product.productImage)] : []),
      photoReviews: Array.isArray(product.photoReviews) ? product.photoReviews.map(String).filter(Boolean) : [],
      description: String(product.description || ''),
      usage: String(product.usage || ''),
      origin: String(product.origin || 'Store Olive Young Korea'),
      rating: Number.isFinite(Number(product.rating)) ? Number(product.rating) : 0,
      reviewsCount: Number.isFinite(Number(product.reviewsCount)) ? Number(product.reviewsCount) : 0,
      productUrl: String(product.productUrl || ''),
      scrapedAt: product.scrapedAt || new Date().toISOString(),
      updatedAt: serverTimestamp()
    };

    await setDoc(docRef, cleanPayload, { merge: true });
    return { success: true };
  } catch (err) {
    console.warn("Firestore savePendingProduct error:", err);
    return { success: false, error: err };
  }
};

/**
 * 13. Delete Pending Product from Firestore
 */
export const deletePendingProductFromDB = async (goodsNo) => {
  try {
    if (!goodsNo) return { success: false, error: 'missing goodsNo' };
    const docRef = doc(db, PENDING_PRODUCTS_COLLECTION, String(goodsNo));
    await deleteDoc(docRef);
    return { success: true };
  } catch (err) {
    console.warn("Firestore deletePendingProduct error:", err);
    return { success: false, error: err };
  }
};

/**
 * 14. Subscribe to Realtime Users (Admin)
 */
export const subscribeToUsers = (onUpdate, onError) => {
  try {
    const colRef = collection(db, USERS_COLLECTION);
    return onSnapshot(colRef, (snapshot) => {
      const usersList = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        uid: docSnap.id,
        ...docSnap.data()
      }));
      onUpdate(usersList);
    }, (err) => {
      console.warn("Firestore users listener fallback:", err);
      if (onError) onError(err);
    });
  } catch (err) {
    console.warn("Firestore subscribeToUsers error:", err);
    if (onError) onError(err);
    return () => {};
  }
};

/**
 * 15. AI Manager Task Management (Hermes Operations)
 */
export const sendAiManagerTask = async (command, meta = {}) => {
  try {
    if (!command || !String(command).trim()) {
      return { success: false, error: 'Lệnh không được để trống' };
    }
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const docRef = doc(db, AI_MANAGER_TASKS_COLLECTION, taskId);
    const payload = {
      id: taskId,
      command: String(command).trim(),
      status: 'pending',
      requestedBy: meta.requestedBy || 'A. Tân (Boss)',
      requestedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      ...meta
    };
    await setDoc(docRef, payload);
    return { success: true, taskId };
  } catch (err) {
    console.warn("Firestore sendAiManagerTask error:", err);
    return { success: false, error: err };
  }
};

export const subscribeToAiManagerTasks = (onUpdate, onError) => {
  try {
    const q = query(collection(db, AI_MANAGER_TASKS_COLLECTION));
    return onSnapshot(q, (snapshot) => {
      const taskList = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        let requestedAtIso = data.requestedAt || new Date().toISOString();
        if (data.createdAt?.toDate) {
          requestedAtIso = data.createdAt.toDate().toISOString();
        }
        return {
          id: docSnap.id,
          ...data,
          requestedAt: requestedAtIso
        };
      });
      // Sắp xếp lệnh mới nhất lên đầu
      taskList.sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));
      onUpdate(taskList);
    }, (err) => {
      console.warn("Firestore AI Manager listener fallback:", err);
      if (onError) onError(err);
    });
  } catch (err) {
    console.warn("Firestore AI Manager subscription error:", err);
    if (onError) onError(err);
    return () => {};
  }
};

/**
 * 16. Update User Profile in DB (Admin)
 */
export const updateUserInDB = async (userId, data) => {
  try {
    if (!userId) return { success: false, error: 'missing userId' };
    const docRef = doc(db, USERS_COLLECTION, String(userId));
    await setDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return { success: true };
  } catch (err) {
    console.warn("Firestore updateUser error:", err);
    return { success: false, error: err };
  }
};

/**
 * 17. Delete User from Firestore (Admin)
 */
export const deleteUserFromDB = async (userId) => {
  try {
    if (!userId) return { success: false, error: 'missing userId' };
    const docRef = doc(db, USERS_COLLECTION, String(userId));
    await deleteDoc(docRef);
    return { success: true };
  } catch (err) {
    console.warn("Firestore deleteUser error:", err);
    return { success: false, error: err };
  }
};

/**
 * 18. Update Order Details (Admin)
 */
export const updateOrderInDB = async (orderId, updates) => {
  try {
    if (!orderId) return { success: false, error: 'missing orderId' };
    const docRef = doc(db, ORDERS_COLLECTION, String(orderId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (err) {
    console.warn("Firestore updateOrder error:", err);
    return { success: false, error: err };
  }
};
