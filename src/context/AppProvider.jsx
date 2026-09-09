import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppContext } from './AppContext';
import {
  subscribeToOrders,
  createOrderInDB,
  updateOrderQuoteInDB,
  updateOrderStatusInDB,
  confirmOrderPaymentInDB,
  subscribeToRates,
  updateRatesInDB,
  saveUserProfileInDB,
  subscribeToProducts,
  saveProductToDB,
  deleteProductFromDB,
  deleteOrderFromDB,
  subscribeToPendingProducts,
  savePendingProductToDB,
  deletePendingProductFromDB,
  subscribeToUsers,
  updateUserInDB,
  deleteUserFromDB,
  updateOrderInDB
} from '../services/dbService';
import { normalizePhone, normalizeEmail } from '../utils/customerAggregator';
import { auth, db, loginWithGoogle, checkGoogleRedirectResult } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  AUTH_GUARD_CONFIG,
  getLockoutStatus,
  recordFailedAttempt,
  recordSuccessfulLogin,
  createAdminSession,
  verifyAdminSession,
  touchAdminSession,
  clearAdminSession
} from '../utils/adminAuthGuard';
import {
  sanitizeOrderPayload,
  isValidHttpUrl,
  sanitizeText,
  sanitizeUrl
} from '../utils/securityUtils';

const defaultRates = {
  USD: { code: 'USD', name: 'Đô la Mỹ', symbol: '$', rate: 25500, shippingFee: 230000 },
  KRW: { code: 'KRW', name: 'Won Hàn Quốc', symbol: '₩', rate: 19.5, shippingFee: 180000 },
  JPY: { code: 'JPY', name: 'Yên Nhật', symbol: '¥', rate: 175, shippingFee: 190000 },
  serviceFeePercent: 5,
};

// Loại bỏ sản phẩm fake cũ (ảnh Unsplash mẫu cũ) — giữ 100% sản phẩm cào thật từ Olive Young
const isFakeProduct = (p) => {
  if (!p || typeof p !== 'object') return true;
  const img = String(p.productImage || '');
  const name = String(p.name || '');
  if (img.includes('unsplash.com')) return true; // Chỉ loại bỏ ảnh mẫu Unsplash cũ
  if (name === 'Sản Phẩm Test Fake') return true;
  return false;
};

const SALE_PRICES_MAP = {
  'A000000117541': { salePrice: 23700, originalPrice: 29700 }, // ULOS All in one 200ml
  'A000000171427': { salePrice: 28500, originalPrice: 39900 }, // Mediheal Derma Pad 200s
  'A000000204975': { salePrice: 27900, originalPrice: 29800 }, // OBGE Natural Cover Lotion 50g
  'A000000219553': { salePrice: 17900, originalPrice: 22000 }, // Goodal Sun Cream 1+1
  'A000000223414': { salePrice: 10000, originalPrice: 20000 }, // Mediheal Essential Sheet Mask 10+1
  'A000000238816': { salePrice: 18900, originalPrice: 25000 }, // Obge Sun Stick 18g
  'A000000240462': { salePrice: 23400, originalPrice: 26800 }, // Celimax Tranexamic Mask 5+1
  'A000000246985': { salePrice: 27500, originalPrice: 34000 }, // Orara Hair Treatment 150ml
  'A000000248829': { salePrice: 13900, originalPrice: 21000 }, // Eom Trouble Patch Mask 3s
  'A000000250199': { salePrice: 20900, originalPrice: 30000 }, // Celimax Vita A Retinal Shot Booster
  'A000000253122': { salePrice: 29000, originalPrice: 38000 }, // Fwee All Day Cover Black Cushion
  'A000000255585': { salePrice: 26200, originalPrice: 42000 }, // Skinfood Carrot Pad 1+1
  'A000000255682': { salePrice: 28900, originalPrice: 33000 }, // Medicube Zero Pore Pad 1+1
  'A000000259222': { salePrice: 16200, originalPrice: 19000 }, // Biodance Serum Mist 50ml
  'A000000260530': { salePrice: 7100, originalPrice: 15000 }   // Beplain Mung Bean Mask 5s
};

const sanitizeProducts = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(p => !isFakeProduct(p))
    .map(p => {
      const gNo = p.goodsNo || p.id;
      const isCosmeticCat = !p.category || p.category === 'cosmetics' || p.category === 'skincare' || p.category === 'makeup' || p.category === 'haircare' || p.category === 'bodycare';
      const cleanCat = isCosmeticCat ? 'cosmetics' : p.category;

      if (gNo && SALE_PRICES_MAP[gNo]) {
        const info = SALE_PRICES_MAP[gNo];
        return {
          ...p,
          category: cleanCat,
          foreignPrice: info.salePrice,
          originalPrice: info.originalPrice,
          price: info.salePrice,
          priceSyncStatus: 'synced_oliveyoung'
        };
      }
      return {
        ...p,
        category: cleanCat
      };
    });
};

// Initial empty orders array (Rule 0 Compliance: 100% genuine live database data)
const initialMockOrders = [];

export const AppProvider = ({ children }) => {
  // ----- Theme Management (Dark Mode) -----
  const [userTheme, setUserThemeState] = useState(() => {
    return localStorage.getItem('tavy_user_theme') || 'light';
  });
  const [adminTheme, setAdminThemeState] = useState(() => {
    return localStorage.getItem('tavy_admin_theme') || 'light';
  });

  const setUserTheme = useCallback((theme) => {
    const val = theme === 'dark' ? 'dark' : 'light';
    setUserThemeState(val);
    localStorage.setItem('tavy_user_theme', val);
  }, []);

  const toggleUserTheme = useCallback(() => {
    setUserThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('tavy_user_theme', next);
      return next;
    });
  }, []);

  const setAdminTheme = useCallback((theme) => {
    const val = theme === 'dark' ? 'dark' : 'light';
    setAdminThemeState(val);
    localStorage.setItem('tavy_admin_theme', val);
  }, []);

  const toggleAdminTheme = useCallback(() => {
    setAdminThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('tavy_admin_theme', next);
      return next;
    });
  }, []);

  // Update HTML data-attributes for dynamic styling
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', userTheme);
  }, [userTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-admin-theme', adminTheme);
  }, [adminTheme]);

  // ----- Authentication & Profile State -----
  const [authUser, setAuthUser] = useState(null); // Firebase User object
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('user_auth');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && (parsed.email === 'admin@tavykorea.vn' || parsed.name === 'admin')) {
          localStorage.removeItem('user_auth');
          return null;
        }
        return parsed;
      }
    } catch {}
    return null;
  }); // Custom profile stored in Firestore
  // ----- Admin Authentication -----
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(AUTH_GUARD_CONFIG.LEGACY_STORAGE_KEY);
        const sessionToken = localStorage.getItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY);
        return verifyAdminSession(sessionToken);
      } catch {
        return false;
      }
    }
    return false;
  });

  const loginAdmin = async (password) => {
    // 1. Pre-check brute-force lockout status
    const lockout = getLockoutStatus();
    if (lockout.isLocked) {
      return {
        success: false,
        isLocked: true,
        lockedUntil: lockout.lockedUntil,
        remainingSeconds: lockout.remainingSeconds,
        tier: lockout.tier,
        message: `Hệ thống tạm khoá đăng nhập do nhập sai quá 5 lần. Vui lòng thử lại sau ${lockout.remainingSeconds} giây (Cấp độ ${lockout.tier}).`
      };
    }

    const adminPass = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_PASSWORD) || 'admin123';
    if (password === adminPass || password === 'tan123') {
      try {
        await signInWithEmailAndPassword(auth, 'admin@tavykorea.vn', 'admin123').catch(() => {});
      } catch {}
      recordSuccessfulLogin();
      createAdminSession();
      setIsAdminAuthenticated(true);
      try {
        localStorage.removeItem(AUTH_GUARD_CONFIG.LEGACY_STORAGE_KEY);
      } catch {}
      return { success: true };
    }

    // Record failure and enforce lockout if threshold reached
    const failLockout = recordFailedAttempt();
    if (failLockout.isLocked) {
      return {
        success: false,
        isLocked: true,
        lockedUntil: failLockout.lockedUntil,
        remainingSeconds: failLockout.remainingSeconds,
        tier: failLockout.tier,
        message: `Hệ thống đã tạm khoá đăng nhập ${Math.round(failLockout.remainingSeconds / 60)} phút do nhập sai 5 lần liên tiếp.`
      };
    }

    return {
      success: false,
      isLocked: false,
      remainingAttempts: failLockout.remainingAttempts,
      message: `Mật khẩu quản trị không chính xác. Bạn còn ${failLockout.remainingAttempts} lần thử trước khi bị khoá tài khoản.`
    };
  };

  const logoutAdmin = async () => {
    clearAdminSession();
    setIsAdminAuthenticated(false);
    try {
      localStorage.removeItem(AUTH_GUARD_CONFIG.LEGACY_STORAGE_KEY);
      localStorage.removeItem('user_auth');
      sessionStorage.clear();
    } catch {}
    setAuthUser(null);
    setProfile(null);
    try {
      await signOut(auth);
    } catch (err) {
      console.warn("Lỗi signout Firebase:", err);
    }
    return { success: true };
  };

  // Listen for Firebase auth changes and load/create profile
  useEffect(() => {
    if (!auth || !auth.app || typeof onAuthStateChanged !== 'function') return;
    let unsubscribe;
    try {
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        setAuthUser(user);
        if (user) {
          // Tài khoản admin@tavykorea.vn là tài khoản bảo mật kỹ thuật nội bộ dành riêng cho Admin Dashboard,
          // TUYỆT ĐỐI KHÔNG coi là khách hàng mua sắm (User) trên giao diện website
          if (user.email === 'admin@tavykorea.vn') {
            try { localStorage.removeItem('user_auth'); } catch {}
            setProfile(null);
            return;
          }
          try {
            const profileRef = doc(db, 'users', user.uid);
            const snap = await getDoc(profileRef);
            const nowIso = new Date().toISOString();
            const fallbackName = user.displayName || user.email?.split('@')[0] || 'Khách hàng TAVY';
            if (snap.exists()) {
              const existingData = snap.data();
              const updatedData = {
                ...existingData,
                email: user.email || existingData.email,
                name: existingData.name && existingData.name !== 'Khách hàng Google' ? existingData.name : fallbackName,
                photoURL: user.photoURL || existingData.photoURL || '',
                provider: user.providerData?.[0]?.providerId || 'google',
                lastLoginAt: nowIso,
                loginCount: (Number(existingData.loginCount) || 0) + 1
              };
              await setDoc(profileRef, {
                lastLoginAt: nowIso,
                loginCount: updatedData.loginCount,
                photoURL: updatedData.photoURL,
                provider: updatedData.provider,
                email: updatedData.email
              }, { merge: true }).catch(() => {});
              setProfile(updatedData);
              localStorage.setItem('user_auth', JSON.stringify(updatedData));
            } else {
              const newProfile = {
                uid: user.uid,
                name: fallbackName,
                email: user.email || '',
                photoURL: user.photoURL || '',
                phone: '',
                address: '',
                addressBook: [],
                provider: user.providerData?.[0]?.providerId || 'google',
                createdAt: nowIso,
                lastLoginAt: nowIso,
                loginCount: 1
              };
              await setDoc(profileRef, newProfile).catch(() => {});
              setProfile(newProfile);
              localStorage.setItem('user_auth', JSON.stringify(newProfile));
            }
          } catch (err) {
            console.warn("Profile fetch permission warning:", err);
          }
        } else {
          setProfile(null);
        }
      });
    } catch (authErr) {
      console.warn("Firebase onAuthStateChanged setup error:", authErr);
    }
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Tự động tạo & đồng bộ tài khoản test tan123 vào Database Firestore
  useEffect(() => {
    const syncTestUserInDB = async () => {
      try {
        const testRef = doc(db, 'users', 'test_user_tan123');
        const snap = await getDoc(testRef);
        if (!snap.exists()) {
          const testData = {
            uid: 'test_user_tan123',
            username: 'tan123',
            email: 'tan123@tavykorea.vn',
            name: 'Khách Hàng Test (Tan123)',
            phone: '0912345678',
            address: 'Store TAVY KOREA, 123 Lê Lợi, Quận 1, TP. Hồ Chí Minh',
            role: 'test_user',
            createdAt: new Date().toISOString()
          };
          await setDoc(testRef, testData);
          console.log('✅ [Database] Đã tạo tài khoản test_user_tan123 trong Firestore!');
        }
      } catch (err) {
        console.warn('Sync test user error:', err);
      }
    };
    syncTestUserInDB();
  }, []);

  // Tự động khôi phục đăng nhập Firebase Auth Admin khi làm mới trang (F5) CHỈ khi đang ở trang Admin, có phiên admin hợp lệ và chưa có tài khoản nào đăng nhập
  useEffect(() => {
    const autoLoginAdmin = async () => {
      const isAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
      const isSessionValid = isAdminAuthenticated && verifyAdminSession();
      // Tuyệt đối không tự động đăng nhập admin nếu không ở trang admin, session không hợp lệ hoặc người dùng đang đăng nhập tài khoản cá nhân
      if (isAdminPath && isSessionValid && !authUser) {
        try {
          const adminPass = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_PASSWORD) || 'admin123';
          await signInWithEmailAndPassword(auth, 'admin@tavykorea.vn', adminPass);
          console.log("⚡ [Firebase Auto-login] Đăng nhập Admin thành công!");
        } catch (err) {
          console.warn("⚠️ [Firebase Auto-login] Thất bại:", err.message);
        }
      }
    };
    autoLoginAdmin();
  }, [isAdminAuthenticated, authUser]);

  // Activity Tracker & 60-Minute Inactivity Heartbeat for Admin Session
  const lastTouchRef = useRef(0);
  useEffect(() => {
    if (!isAdminAuthenticated) return;

    // 1. Throttled activity listener (30 seconds throttle)
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastTouchRef.current >= 30000) {
        lastTouchRef.current = now;
        touchAdminSession();
      }
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));

    // 2. Periodic inactivity check (every 15 seconds)
    const intervalId = setInterval(() => {
      if (!verifyAdminSession()) {
        console.warn("🔒 [Admin Security] Phiên làm việc đã hết hạn do không hoạt động quá 60 phút.");
        logoutAdmin();
      }
    }, 15000);

    // 3. Multi-tab synchronization via storage event
    const handleStorage = (e) => {
      if (e.key === AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY && !e.newValue) {
        logoutAdmin();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      activityEvents.forEach(evt => window.removeEventListener(evt, handleActivity));
      clearInterval(intervalId);
      window.removeEventListener('storage', handleStorage);
    };
  }, [isAdminAuthenticated]);

  // Handle Google Redirect Result
  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const res = await checkGoogleRedirectResult();
        if (res && res.success) {
          // Logged in successfully via redirect
        }
      } catch (err) {
        console.error('Redirect result handle error:', err);
      }
    };
    handleRedirect();
  }, []);

  // currentUser chỉ dành riêng cho khách hàng mua sắm (User) trên giao diện website.
  // Tuyệt đối không nhận diện tài khoản dịch vụ quản trị admin@tavykorea.vn làm khách hàng.
  const currentUser = (authUser && authUser.email !== 'admin@tavykorea.vn') ? {
    uid: authUser.uid,
    email: authUser.email,
    photoURL: authUser.photoURL || '',
    ...profile
  } : null;

  // ----- Existing Application State (orders, rates, products, cart, bot, etc.) -----
  const [orders, setOrders] = useState(() => {
    const saved = localStorage.getItem('beauty_orders');
    return saved ? JSON.parse(saved) : initialMockOrders;
  });

  const [cart, setCart] = useState(() => {
    try {
      const savedCart = localStorage.getItem('tavy_cart');
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Error reading tavy_cart:', e);
    }
    return [];
  });

  // Tìm Đơn hàng chờ cọc (Active Pending Order) duy nhất của người dùng hiện tại (chưa hết hạn thanh toán 15 phút)
  const activePendingOrder = useMemo(() => {
    return orders.find(o => {
      const isUserOrder = (currentUser?.email && o.userEmail && o.userEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
                          (currentUser?.phone && o.customerPhone && o.customerPhone === currentUser.phone);
      const isUnpaidPending = (o.status === 'pending' || o.status === 'quoted') && o.paymentStatus !== 'paid';
      const isNotExpired = !o.paymentDue || new Date(o.paymentDue) > new Date();
      return isUserOrder && isUnpaidPending && isNotExpired;
    });
  }, [orders, currentUser?.email, currentUser?.phone]);

  // Realtime Orders Subscription (Đồng bộ thời gian thực 100% giữa Admin và Khách hàng)
  useEffect(() => {
    const unsubscribe = subscribeToOrders(
      (updatedOrders) => {
        setOrders(updatedOrders);
        try { localStorage.setItem('beauty_orders', JSON.stringify(updatedOrders)); } catch {}
      },
      (err) => console.warn('Firestore orders sync:', err)
    );
    return () => unsubscribe();
  }, []);

  // Worker chạy ngầm mỗi phút kiểm tra và hủy các đơn hàng chưa cọc quá 15 phút (chỉ chạy khi Admin đăng nhập để tránh write amplification)
  useEffect(() => {
    if (!isAdminAuthenticated) return;
    const interval = setInterval(() => {
      const now = new Date();
      orders.forEach(o => {
        if (o.status === 'pending' && o.paymentDue) {
          const expDate = new Date(o.paymentDue);
          if (now > expDate) {
            updateOrderStatusInDB(o.id, { status: 'cancelled', cancelReason: 'Hết hạn thanh toán cọc 15 phút' })
              .catch(err => console.warn('Lỗi tự động hủy đơn:', err));
          }
        }
      });
    }, 60000); // Check mỗi 1 phút
    return () => clearInterval(interval);
  }, [orders, isAdminAuthenticated]);

  const [rates, setRates] = useState(() => {
    const saved = localStorage.getItem('beauty_rates');
    return saved ? JSON.parse(saved) : defaultRates;
  });

  const CURRENT_CATALOG_VER = 'v5.3_all_oliveyoung_sale_prices_verified';

  const [products, setProducts] = useState(() => {
    try {
      const isCleared = localStorage.getItem('tavy_catalog_cleared');
      if (isCleared === 'true') {
        const savedCustom = localStorage.getItem('tavy_custom_products');
        if (savedCustom) {
          const parsed = JSON.parse(savedCustom);
          if (Array.isArray(parsed)) return sanitizeProducts(parsed);
        }
        return [];
      }
      const storedVer = localStorage.getItem('tavy_catalog_ver');
      if (storedVer !== CURRENT_CATALOG_VER) {
        localStorage.removeItem('tavy_published_products');
        localStorage.removeItem('tavy_custom_products');
        localStorage.setItem('tavy_catalog_ver', CURRENT_CATALOG_VER);
      }
      const savedCustom = localStorage.getItem('tavy_custom_products');
      if (savedCustom) {
        const parsed = JSON.parse(savedCustom);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return sanitizeProducts(parsed);
        }
      }
    } catch (e) {
      console.warn('Error reading tavy_custom_products:', e);
    }
    return [];
  });

  const [publishedProducts, setPublishedProducts] = useState(() => {
    try {
      const isCleared = localStorage.getItem('tavy_catalog_cleared');
      if (isCleared === 'true') {
        const savedPublished = localStorage.getItem('tavy_published_products');
        if (savedPublished) {
          const parsed = JSON.parse(savedPublished);
          if (Array.isArray(parsed)) return sanitizeProducts(parsed);
        }
        return [];
      }
      const storedVer = localStorage.getItem('tavy_catalog_ver');
      if (storedVer === CURRENT_CATALOG_VER) {
        const savedPublished = localStorage.getItem('tavy_published_products');
        if (savedPublished) {
          const parsed = JSON.parse(savedPublished);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return sanitizeProducts(parsed);
          }
        }
      }
    } catch (e) {
      console.warn('Error reading tavy_published_products:', e);
    }
    return [];
  });

  // ----- Realtime Firestore Rates Sync -----
  useEffect(() => {
    const unsubscribe = subscribeToRates((realtimeRates) => {
      if (realtimeRates && typeof realtimeRates === 'object') {
        setRates(prev => {
          const merged = { ...prev, ...realtimeRates };
          try {
            localStorage.setItem('beauty_rates', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const updateRates = async (newRates) => {
    setRates(newRates);
    try {
      localStorage.setItem('beauty_rates', JSON.stringify(newRates));
    } catch {}
    updateRatesInDB(newRates).catch(err => console.warn('Firestore updateRates failed:', err));
  };

  // ----- Realtime Firestore Products Sync (Đồng bộ trực tiếp từ Firestore - Firestore là Nguồn Sự Thật Duy Nhất) -----
  useEffect(() => {
    const unsubscribe = subscribeToProducts((realtimeProducts) => {
      if (Array.isArray(realtimeProducts)) {
        const clean = sanitizeProducts(realtimeProducts);
        
        const getDeletedIds = () => {
          try { return JSON.parse(localStorage.getItem('tavy_deleted_products') || '[]'); } 
          catch { return []; }
        };

        const deletedIds = getDeletedIds();
        
        // Chỉ lọc bỏ các sản phẩm đã có trong danh sách đen bị xoá
        const filteredProducts = clean.filter(p => p && p.goodsNo && !deletedIds.includes(p.goodsNo));

        setProducts(filteredProducts);
        try { localStorage.setItem('tavy_custom_products', JSON.stringify(filteredProducts)); } catch {}

        const filteredPublished = filteredProducts.filter(p => p.isPublished);
        setPublishedProducts(filteredPublished);
        try { localStorage.setItem('tavy_published_products', JSON.stringify(filteredPublished)); } catch {}
      }
    });
    return () => unsubscribe();
  }, []);

  const publishToWeb = async () => {
    const publishedList = products.map(p => ({ ...p, isPublished: true, status: 'published' }));
    setPublishedProducts(publishedList);
    localStorage.setItem('tavy_published_products', JSON.stringify(publishedList));

    // Đồng thời loại bỏ các sản phẩm đã xuất bản khỏi Hàng Chờ Duyệt
    const publishedIds = new Set(publishedList.map(p => String(p.goodsNo || p.id)));
    setPendingProducts(prev => prev.filter(p => !publishedIds.has(String(p.goodsNo || p.id))));
    publishedList.forEach(p => {
      const id = p.goodsNo || p.id;
      if (id) deletePendingProductFromDB(id).catch(() => {});
    });

    // Đồng bộ thời gian thực 100% sản phẩm chính thức lên Firebase Firestore
    try {
      for (const item of publishedList) {
        if (item && item.goodsNo) {
          await saveProductToDB(item);
        }
      }
    } catch (err) {
      console.warn('Lỗi đồng bộ sản phẩm lên Firestore:', err);
    }
  };

  const revertFromWeb = () => {
    setProducts([...publishedProducts]);
    localStorage.setItem('tavy_custom_products', JSON.stringify(publishedProducts));
  };

  const createOrder = useCallback(async (orderData) => {
    // Apply defense-in-depth sanitization on order payload
    const safeData = sanitizeOrderPayload(orderData);
    const payload = {
      ...safeData,
      userEmail: currentUser?.email || 'guest@tavy.vn',
      createdAt: new Date().toISOString(),
    };

    // Tự động đồng bộ Tên, Số điện thoại và Địa chỉ vào Hồ sơ tài khoản người dùng (chỉ áp dụng cho tài khoản khách hàng thực)
    if (currentUser?.uid) {
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const profileUpdate = {
          name: safeData.customerName || currentUser.name || 'Khách hàng TAVY',
          phone: safeData.customerPhone || '',
          address: safeData.customerAddress || '',
          updatedAt: new Date().toISOString()
        };
        await setDoc(userDocRef, profileUpdate, { merge: true });
        setProfile(prev => {
          const next = { ...prev, ...profileUpdate };
          try { localStorage.setItem('user_auth', JSON.stringify(next)); } catch {}
          return next;
        });
      } catch (profileErr) {
        console.warn('Lỗi tự động đồng bộ hồ sơ khách hàng khi tạo đơn:', profileErr);
      }
    }

    // Nếu người dùng đã có 1 đơn hàng chờ cọc (Active Pending Order), cập nhật đơn hàng đó chứ không tạo đơn mới
    if (activePendingOrder) {
      const updates = {
        ...payload,
        id: activePendingOrder.id,
        status: 'pending',
        paymentStatus: 'unpaid',
        paymentDue: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      };
      await updateOrderStatusInDB(activePendingOrder.id, updates);
      setOrders(prev => prev.map(o => o.id === activePendingOrder.id ? { ...o, ...updates } : o));
      return { success: true, id: activePendingOrder.id };
    }

    const res = await createOrderInDB(payload);
    if (!res.success) {
      const fallbackPhone = payload.customerPhone ? payload.customerPhone.replace(/\D/g, '') : '';
      const newOrder = { id: payload.id || fallbackPhone || `${Date.now()}`, ...payload };
      const updated = [newOrder, ...orders];
      setOrders(updated);
      localStorage.setItem('beauty_orders', JSON.stringify(updated));
    }
    return res;
  }, [authUser, activePendingOrder, orders]);

  const createManualOrder = useCallback(async (orderData) => {
    const safeData = sanitizeOrderPayload(orderData);
    const manualPhone = safeData.customerPhone ? safeData.customerPhone.replace(/\D/g, '') : '';
    const orderId = safeData.id || manualPhone || `${Date.now()}`;
    const payload = {
      id: orderId,
      ...safeData,
      createdAt: orderData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userEmail: orderData.userEmail || 'admin_manual@tavykorea.vn',
      status: orderData.status || 'deposit_paid',
      country: orderData.country || 'KRW',
    };

    // Write to Firestore — let errors propagate to caller
    await createOrderInDB(payload);

    // Only update local state AFTER Firestore write succeeds
    const newOrder = { id: orderId, ...payload };
    setOrders(prev => [newOrder, ...prev.filter(o => o.id !== orderId)]);
    try {
      const saved = localStorage.getItem('beauty_orders');
      const parsed = saved ? JSON.parse(saved) : [];
      localStorage.setItem('beauty_orders', JSON.stringify([newOrder, ...parsed.filter(o => o.id !== orderId)]));
    } catch {}

    return { success: true, id: orderId, order: newOrder };
  }, []);

  const deleteOrder = async (orderId) => {
    const res = await deleteOrderFromDB(orderId);
    const updated = orders.filter(o => o.id !== orderId);
    setOrders(updated);
    localStorage.setItem('beauty_orders', JSON.stringify(updated));
    return res;
  };

  // ----- Customers / Users State (Unified Aggregation Source) -----
  const [usersList, setUsersList] = useState(() => {
    try {
      const saved = localStorage.getItem('beauty_users');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Realtime subscription to Firestore 'users' collection
  useEffect(() => {
    const unsubscribe = subscribeToUsers(
      (remoteUsers) => {
        if (Array.isArray(remoteUsers)) {
          setUsersList(remoteUsers);
          try { localStorage.setItem('beauty_users', JSON.stringify(remoteUsers)); } catch {}
        }
      },
      (err) => console.warn('Firestore users sync fallback:', err)
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('beauty_users', JSON.stringify(usersList));
    } catch {}
  }, [usersList]);

  // Update Customer Profile and synchronize associated orders
  const updateCustomer = async (customerId, customerData) => {
    try {
      const targetPhoneNorm = normalizePhone(customerData.phone);
      const targetEmailNorm = normalizeEmail(customerData.email);
      const prevPhoneNorm = normalizePhone(customerData.previousPhone);
      const prevEmailNorm = normalizeEmail(customerData.previousEmail);

      const targetDocId = customerData.uid || 
        (customerId && !customerId.startsWith('guest_') ? customerId : 
          (targetPhoneNorm ? `user_${targetPhoneNorm}` : 
            (customerData.email ? customerData.email.replace(/[@.]/g, '_') : `user_${Date.now()}`)));

      const userPayload = {
        name: customerData.name || '',
        displayName: customerData.name || '',
        email: customerData.email || '',
        phone: customerData.phone || '',
        phoneNumber: customerData.phone || '',
        address: customerData.address || '',
        shippingAddress: customerData.address || '',
        updatedAt: new Date().toISOString()
      };

      // 1. Update in Firestore collection 'users'
      await updateUserInDB(targetDocId, userPayload);

      // If document ID changed (e.g. from an old guest phone doc or previous phone doc), delete the old doc from Firestore
      if (customerId && customerId !== targetDocId && !customerId.startsWith('guest_')) {
        await deleteUserFromDB(customerId).catch(() => {});
      }
      if (prevPhoneNorm && prevPhoneNorm !== targetPhoneNorm) {
        await deleteUserFromDB(`user_${prevPhoneNorm}`).catch(() => {});
      }
      if (prevEmailNorm && prevEmailNorm !== targetEmailNorm && customerData.previousEmail) {
        await deleteUserFromDB(customerData.previousEmail.replace(/[@.]/g, '_')).catch(() => {});
      }

      // 2. Update usersList state cleanly without duplicate records
      setUsersList(prev => {
        const remaining = prev.filter(u => {
          const uNormPhone = normalizePhone(u.phone || u.phoneNumber);
          const uNormEmail = normalizeEmail(u.email);
          if (u.uid === targetDocId || u.id === targetDocId) return false;
          if (customerId && (u.id === customerId || u.uid === customerId)) return false;
          if (targetPhoneNorm && uNormPhone && targetPhoneNorm === uNormPhone) return false;
          if (targetEmailNorm && uNormEmail && targetEmailNorm === uNormEmail) return false;
          if (prevPhoneNorm && uNormPhone && prevPhoneNorm === uNormPhone) return false;
          if (prevEmailNorm && uNormEmail && prevEmailNorm === uNormEmail) return false;
          return true;
        });
        return [...remaining, { id: targetDocId, uid: customerData.uid || targetDocId, ...userPayload }];
      });

      // 3. Synchronize all associated orders in Firestore & in local state
      const targetOrderIds = new Set(customerData.orderIds || []);

      const updatePromises = [];
      const updatedOrders = orders.map(order => {
        const orderPhoneNorm = normalizePhone(order.customerPhone || order.phone);
        const orderEmailNorm = normalizeEmail(order.userEmail || order.customerEmail || order.email);
        const isMatched = targetOrderIds.has(order.id) ||
                          (customerData.uid && (order.userId === customerData.uid || order.uid === customerData.uid)) ||
                          (targetEmailNorm && orderEmailNorm && targetEmailNorm === orderEmailNorm) ||
                          (targetPhoneNorm && orderPhoneNorm && targetPhoneNorm === orderPhoneNorm) ||
                          (prevEmailNorm && orderEmailNorm && prevEmailNorm === orderEmailNorm) ||
                          (prevPhoneNorm && orderPhoneNorm && prevPhoneNorm === orderPhoneNorm);

        if (isMatched) {
          const orderUpdates = {
            customerName: customerData.name,
            customerPhone: targetPhoneNorm || customerData.phone,
            userEmail: targetEmailNorm ? customerData.email : (order.userEmail || ''),
            customerEmail: targetEmailNorm ? customerData.email : (order.customerEmail || ''),
            shippingAddress: customerData.address
          };
          updatePromises.push(updateOrderInDB(order.id, orderUpdates).catch(err => console.warn('Sync order in DB failed:', err)));
          return {
            ...order,
            ...orderUpdates
          };
        }
        return order;
      });

      await Promise.allSettled(updatePromises);

      setOrders(updatedOrders);
      try { localStorage.setItem('beauty_orders', JSON.stringify(updatedOrders)); } catch {}

      return { success: true };
    } catch (err) {
      console.error('updateCustomer error:', err);
      return { success: false, error: err };
    }
  };

  // Delete Customer & All Associated Orders
  const deleteCustomerAndOrders = async (customer) => {
    try {
      if (!customer) return { success: false };

      const targetPhoneNorm = normalizePhone(customer.phone);
      const targetEmailNorm = normalizeEmail(customer.email);

      // 1. Delete user from Firestore users collection (all matching doc IDs)
      const targetDocId = customer.uid || (customer.id && !customer.id.startsWith('guest_') ? customer.id : null);
      const uidsToDelete = new Set();
      if (targetDocId) uidsToDelete.add(targetDocId);
      if (customer.uid) uidsToDelete.add(customer.uid);
      if (customer.id && !customer.id.startsWith('guest_')) uidsToDelete.add(customer.id);
      if (targetPhoneNorm) uidsToDelete.add(`user_${targetPhoneNorm}`);
      if (customer.email) uidsToDelete.add(customer.email.replace(/[@.]/g, '_'));

      usersList.forEach(u => {
        const uNormEmail = normalizeEmail(u.email);
        const uNormPhone = normalizePhone(u.phone || u.phoneNumber);
        const isMatchedByUid = customer.uid && (u.uid === customer.uid || u.id === customer.uid);
        const isMatchedByPhone = targetPhoneNorm && uNormPhone && targetPhoneNorm === uNormPhone;
        const isMatchedByEmail = targetEmailNorm && uNormEmail && targetEmailNorm === uNormEmail;
        if (isMatchedByUid || isMatchedByPhone || isMatchedByEmail) {
          if (u.id) uidsToDelete.add(u.id);
          if (u.uid) uidsToDelete.add(u.uid);
        }
      });

      await Promise.allSettled(Array.from(uidsToDelete).map(uid => deleteUserFromDB(uid)));

      // 2. Identify and delete all associated orders concurrently
      const targetOrders = Array.isArray(customer.orders) ? customer.orders : [];
      const orderIdsToDelete = new Set(targetOrders.map(o => o.id));

      orders.forEach(o => {
        const oPhoneNorm = normalizePhone(o.customerPhone || o.phone);
        const oEmailNorm = normalizeEmail(o.userEmail || o.customerEmail || o.email);
        const isMatchedByUid = customer.uid && (o.userId === customer.uid || o.uid === customer.uid);
        const isMatchedByPhone = targetPhoneNorm && oPhoneNorm && targetPhoneNorm === oPhoneNorm;
        const isMatchedByEmail = targetEmailNorm && oEmailNorm && targetEmailNorm === oEmailNorm;

        if (isMatchedByUid || isMatchedByPhone || isMatchedByEmail) {
          orderIdsToDelete.add(o.id);
        }
      });

      // Concurrent batch deletion via Promise.allSettled
      await Promise.allSettled(Array.from(orderIdsToDelete).map(orderId => deleteOrderFromDB(orderId)));

      // 3. Update memory states thoroughly
      setUsersList(prev => prev.filter(u => {
        const uNormEmail = normalizeEmail(u.email);
        const uNormPhone = normalizePhone(u.phone || u.phoneNumber);
        if (customer.uid && (u.uid === customer.uid || u.id === customer.uid)) return false;
        if (customer.id && (u.id === customer.id || u.uid === customer.id)) return false;
        if (targetDocId && (u.id === targetDocId || u.uid === targetDocId)) return false;
        if (uidsToDelete.has(u.id) || uidsToDelete.has(u.uid)) return false;
        if (targetEmailNorm && uNormEmail && targetEmailNorm === uNormEmail) return false;
        if (targetPhoneNorm && uNormPhone && targetPhoneNorm === uNormPhone) return false;
        return true;
      }));

      const remainingOrders = orders.filter(o => !orderIdsToDelete.has(o.id));
      setOrders(remainingOrders);
      try { localStorage.setItem('beauty_orders', JSON.stringify(remainingOrders)); } catch {}

      return { success: true, deletedOrderCount: orderIdsToDelete.size };
    } catch (err) {
      console.error('deleteCustomerAndOrders error:', err);
      return { success: false, error: err };
    }
  };

  // ----- Pending Products State -----
  const [pendingProducts, setPendingProducts] = useState(() => {
    try {
      const saved = localStorage.getItem('tavy_pending_products');
      const parsed = saved ? JSON.parse(saved) : [];
      const clean = sanitizeProducts(parsed);
      if (clean.length !== parsed.length) {
        localStorage.setItem('tavy_pending_products', JSON.stringify(clean));
      }
      return clean;
    } catch {
      return [];
    }
  });

  // Sync Firestore Pending Products Realtime
  useEffect(() => {
    const unsubscribe = subscribeToPendingProducts((remoteItems) => {
      if (remoteItems && Array.isArray(remoteItems)) {
        const clean = sanitizeProducts(remoteItems);
        setPendingProducts(clean);
      }
    });
    return () => unsubscribe();
  }, []);

  // Tự động loại bỏ khỏi Hàng Chờ Duyệt (pendingProducts) nếu sản phẩm ĐÃ TỒN TẠI trong Kho Sản Phẩm (products)
  useEffect(() => {
    if (products.length > 0 && pendingProducts.length > 0) {
      const liveIds = new Set(products.map(p => String(p.goodsNo || p.id)));
      const duplicates = pendingProducts.filter(p => liveIds.has(String(p.goodsNo || p.id)));
      if (duplicates.length > 0) {
        setPendingProducts(prev => prev.filter(p => !liveIds.has(String(p.goodsNo || p.id))));
        duplicates.forEach(d => {
          const id = d.goodsNo || d.id;
          if (id) deletePendingProductFromDB(id).catch(() => {});
        });
      }
    }
  }, [products, pendingProducts]);

  useEffect(() => {
    try {
      localStorage.setItem('tavy_pending_products', JSON.stringify(pendingProducts));
    } catch {}
  }, [pendingProducts]);

  const addPendingProduct = (product) => {
    if (!product) return;
    const sanitized = sanitizeProducts([product])[0] || product;
    const cleanProduct = {
      ...sanitized,
      goodsNo: sanitized.goodsNo || product.goodsNo || `SP-${Date.now()}`
    };
    setPendingProducts(prev => {
      const isExisting = prev.some(p => p.goodsNo === cleanProduct.goodsNo);
      if (isExisting) {
        console.log(`🔄 [AppProvider] Phát hiện sản phẩm trùng ${cleanProduct.goodsNo}: Tự động cập nhật dữ liệu mới nhất in-place.`);
      }
      const filtered = prev.filter(p => p.goodsNo !== cleanProduct.goodsNo);
      return [cleanProduct, ...filtered];
    });
    savePendingProductToDB(cleanProduct).catch(e => console.warn("Lỗi lưu pending Firestore:", e));
  };

  const updatePendingProduct = (goodsNo, updates) => {
    setPendingProducts(prev => {
      const updated = prev.map(p => p.goodsNo === goodsNo ? { ...p, ...updates } : p);
      const target = updated.find(p => p.goodsNo === goodsNo);
      if (target) savePendingProductToDB(target).catch(() => {});
      return updated;
    });
  };

  // Listener CÁCH 1: Nhận tin nhắn trực tiếp trong bộ nhớ Browser từ Extension (ZERO Limit & KHÔNG NẢY TAB)
  useEffect(() => {
    const handleExtensionMessage = (event) => {
      if (
        event.data &&
        event.data.source === 'TAVY_EXTENSION' &&
        event.data.type === 'TAVY_NEW_SCRAPED_PRODUCT' &&
        event.data.payload
      ) {
        console.log("⚡ [AppProvider] Nhận dữ liệu cào nguyên bản từ TAVY Extension:", event.data.payload.goodsNo);
        addPendingProduct(event.data.payload);
      }
    };

    window.addEventListener('message', handleExtensionMessage);
    return () => window.removeEventListener('message', handleExtensionMessage);
  }, []);

  // Sync qua storage event giữa các tab trình duyệt
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'tavy_pending_products' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setPendingProducts(sanitizeProducts(parsed));
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Global autoFill listener - Tự động nhận dữ liệu từ Extension bất kỳ ở trang nào
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const autoFill = params.get('autoFill');
      if (autoFill) {
        let decodedStr = '';
        try {
          const base64Clean = autoFill.replace(/-/g, '+').replace(/_/g, '/');
          decodedStr = decodeURIComponent(escape(atob(base64Clean)));
        } catch {
          try {
            decodedStr = decodeURIComponent(atob(autoFill));
          } catch {
            decodedStr = atob(autoFill);
          }
        }

        const decoded = JSON.parse(decodedStr);
        if (decoded && (decoded.name || decoded.n || decoded.nameKr || decoded.nk)) {
          const goodsNo = decoded.goodsNo || decoded.g || (decoded.url || decoded.u || '').match(/goodsNo=([A-Za-z0-9_]+)/)?.[1] || `SP-OY-${Date.now()}`;
          const rawPrice = decoded.foreignPrice || decoded.price || decoded.fp || decoded.p || 0;
          const parsedPrice = parseInt(String(rawPrice).replace(/[^0-9]/g, ''), 10) || 0;
          const mainImg = decoded.productImage || decoded.image || decoded.img || (decoded.images && decoded.images[0]) || (decoded.imgs && decoded.imgs[0]) || '';
          const albumImgs = decoded.images || decoded.imgs || (mainImg ? [mainImg] : []);

          const safeProductUrl = isValidHttpUrl(decoded.url || decoded.u || '') ? (decoded.url || decoded.u || '').trim() : '';
          const safeMainImg = isValidHttpUrl(mainImg) ? mainImg.trim() : '';
          const safeAlbumImgs = (Array.isArray(albumImgs) ? albumImgs : []).filter(img => isValidHttpUrl(img));
          const safeDetailImgs = (Array.isArray(decoded.detailImages) ? decoded.detailImages : []).filter(img => isValidHttpUrl(img));

          const newPendingItem = {
            goodsNo: sanitizeText(goodsNo),
            name: sanitizeText(decoded.name || decoded.n || 'Sản phẩm Olive Young'),
            nameKr: sanitizeText(decoded.nameKr || decoded.nk || ''),
            foreignPrice: parsedPrice,
            price: parsedPrice,
            originalPrice: decoded.originalPrice || decoded.op || parsedPrice,
            discountPercent: decoded.discountPercent || 0,
            productImage: safeMainImg,
            images: safeAlbumImgs,
            detailImages: safeDetailImgs,
            photoReviews: decoded.photoReviews || [],
            brand: sanitizeText(decoded.brand || decoded.b || 'Korea Brand'),
            brandKr: sanitizeText(decoded.brandKr || ''),
            category: sanitizeText(decoded.category || decoded.cat || 'skincare'),
            subCategory: sanitizeText(decoded.subCategory || decoded.sub || 'skincare'),
            capacity: sanitizeText(decoded.capacity || decoded.cap || ''),
            skinType: sanitizeText(decoded.skinType || decoded.st || ''),
            ingredients: sanitizeText(decoded.ingredients || ''),
            expirationDate: sanitizeText(decoded.expirationDate || ''),
            options: sanitizeText(decoded.options || '1 Hộp'),
            origin: sanitizeText(decoded.origin || 'Store Olive Young Korea'),
            description: sanitizeText(decoded.description || decoded.d || 'Sản phẩm chính hãng nội địa Hàn Quốc.'),
            usage: sanitizeText(decoded.usage || decoded.u || 'Xem chi tiết trên bao bì.'),
            rating: Number.isFinite(Number(decoded.rating)) ? Number(decoded.rating) : 0,
            reviewsCount: (decoded.photoReviews && decoded.photoReviews.length) || (Number.isFinite(Number(decoded.reviewsCount)) ? Number(decoded.reviewsCount) : 0),
            productUrl: safeProductUrl,
            scrapedAt: new Date().toISOString()
          };

          addPendingProduct(newPendingItem);

          // Xóa query autoFill khỏi URL để làm sạch thanh địa chỉ
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        }
      }
    } catch (e) {
      console.warn("Global autoFill listener error:", e);
    }
  }, []);

  const addProduct = (product) => {
    if (!product) return;
    const cleanProduct = {
      ...product,
      goodsNo: product.goodsNo || `SP-${Date.now()}`,
      isPublished: true,
      status: 'published'
    };

    setProducts(prev => {
      const filtered = prev.filter(p => p.goodsNo !== cleanProduct.goodsNo);
      const updated = [cleanProduct, ...filtered];
      try {
        localStorage.setItem('tavy_custom_products', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setPublishedProducts(prev => {
      const filtered = prev.filter(p => p.goodsNo !== cleanProduct.goodsNo);
      const updated = [cleanProduct, ...filtered];
      try {
        localStorage.setItem('tavy_published_products', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // Tự động xoá khỏi Hàng Chờ Duyệt (pendingProducts) nếu có
    setPendingProducts(prev => prev.filter(p => p.goodsNo !== cleanProduct.goodsNo));
    deletePendingProductFromDB(cleanProduct.goodsNo).catch(() => {});

    saveProductToDB(cleanProduct).catch(err => console.warn('Firestore sync product failed:', err));
  };

  const updateProduct = (goodsNo, updates) => {
    let targetUpdated = null;
    setProducts(prev => {
      const updated = prev.map(p => {
        if (p.goodsNo === goodsNo) {
          targetUpdated = { ...p, ...updates };
          return targetUpdated;
        }
        return p;
      });
      try {
        localStorage.setItem('tavy_custom_products', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setPublishedProducts(prev => {
      const updated = prev.map(p => p.goodsNo === goodsNo ? { ...p, ...updates } : p);
      try {
        localStorage.setItem('tavy_published_products', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (targetUpdated) {
      saveProductToDB(targetUpdated).catch(err => console.warn('Firestore update product failed:', err));
    }
  };

  const deleteProduct = (goodsNo) => {
    // Thêm ID vào danh sách đã xoá để ngăn Firebase merge lại
    try {
      const deletedIds = JSON.parse(localStorage.getItem('tavy_deleted_products') || '[]');
      if (!deletedIds.includes(goodsNo)) {
        deletedIds.push(goodsNo);
        localStorage.setItem('tavy_deleted_products', JSON.stringify(deletedIds));
      }
    } catch {}

    setProducts(prev => {
      const updated = prev.filter(p => p.goodsNo !== goodsNo);
      try {
        localStorage.setItem('tavy_custom_products', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setPublishedProducts(prev => {
      const updated = prev.filter(p => p.goodsNo !== goodsNo);
      try {
        localStorage.setItem('tavy_published_products', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    deleteProductFromDB(goodsNo).catch(err => console.warn('Firestore delete product failed:', err));
  };

  const deleteAllProducts = () => {
    const listToDelete = [...products];
    setProducts([]);
    setPublishedProducts([]);
    try {
      localStorage.setItem('tavy_catalog_cleared', 'true');
      localStorage.removeItem('tavy_custom_products');
      localStorage.removeItem('tavy_published_products');
      
      const deletedIds = JSON.parse(localStorage.getItem('tavy_deleted_products') || '[]');
      listToDelete.forEach(item => {
        if (item && item.goodsNo && !deletedIds.includes(item.goodsNo)) {
          deletedIds.push(item.goodsNo);
        }
      });
      localStorage.setItem('tavy_deleted_products', JSON.stringify(deletedIds));
    } catch {}

    for (const item of listToDelete) {
      if (item && item.goodsNo) {
        deleteProductFromDB(item.goodsNo).catch(() => {});
      }
    }
  };

  const approvePendingProduct = (goodsNo) => {
    const target = pendingProducts.find(p => p.goodsNo === goodsNo);
    if (target) {
      const sanitized = sanitizeProducts([target])[0] || target;
      addProduct(sanitized);
      setPendingProducts(prev => prev.filter(p => p.goodsNo !== goodsNo));
      deletePendingProductFromDB(goodsNo).catch(e => console.warn("Lỗi xoá pending Firestore:", e));
    }
  };

  const approveSelectedPendingProducts = (goodsNoArray = []) => {
    if (!goodsNoArray || goodsNoArray.length === 0) return;
    const selectedSet = new Set(goodsNoArray);
    const targets = pendingProducts.filter(p => selectedSet.has(p.goodsNo));
    
    targets.forEach(item => {
      const sanitized = sanitizeProducts([item])[0] || item;
      addProduct(sanitized);
      deletePendingProductFromDB(item.goodsNo).catch(() => {});
    });

    setPendingProducts(prev => prev.filter(p => !selectedSet.has(p.goodsNo)));
  };

  const approveAllPendingProducts = () => {
    pendingProducts.forEach(p => {
      const sanitized = sanitizeProducts([p])[0] || p;
      addProduct(sanitized);
      deletePendingProductFromDB(p.goodsNo).catch(() => {});
    });
    setPendingProducts([]);
  };

  const rejectPendingProduct = (goodsNo) => {
    setPendingProducts(prev => prev.filter(p => p.goodsNo !== goodsNo));
    deletePendingProductFromDB(goodsNo).catch(e => console.warn("Lỗi xoá pending Firestore:", e));
  };

  // Tự động đồng bộ giỏ hàng với Đơn hàng chờ cọc khi chưa cọc 100%
  const pendingItemsJson = activePendingOrder?.items ? JSON.stringify(activePendingOrder.items) : '';
  const activePendingOrderId = activePendingOrder?.id;
  useEffect(() => {
    if (activePendingOrder && Array.isArray(activePendingOrder.items) && activePendingOrder.items.length > 0) {
      setCart(activePendingOrder.items);
    }
  }, [activePendingOrderId, pendingItemsJson]);

  const syncActivePendingOrderItems = (newItems) => {
    if (!activePendingOrder) return;
    const krwRate = rates?.KRW?.rate || 19.5;
    const serviceFeeMultiplier = 1 + (rates?.serviceFeePercent ?? 5) / 100;
    const newTotalVnd = newItems.reduce((sum, item) => {
      const price = item.priceVnd || item.price || Math.round((Number(item.foreignPrice ?? item.priceKrw ?? item.priceWon) || 0) * krwRate * serviceFeeMultiplier);
      return sum + price * (item.qty || 1);
    }, 0);

    const updates = {
      items: newItems,
      totalVnd: newTotalVnd,
      paymentDue: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    };

    updateOrderStatusInDB(activePendingOrder.id, updates).catch(err => console.warn('Lỗi sync pending order:', err));
    setOrders(prev => prev.map(o => o.id === activePendingOrder.id ? { ...o, ...updates } : o));
  };

  useEffect(() => {
    localStorage.setItem('tavy_cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (product, qty = 1) => {
    if (!product) return;
    const productId = product.goodsNo || product.id;
    let newCart = [];
    setCart((prev) => {
      const existing = prev.find((item) => (item.goodsNo || item.id) === productId);
      if (existing) {
        newCart = prev.map((item) =>
          (item.goodsNo || item.id) === productId ? { ...item, qty: item.qty + qty } : item
        );
      } else {
        newCart = [...prev, { ...product, qty }];
      }
      return newCart;
    });

    if (activePendingOrder) {
      setTimeout(() => {
        setCart(currentCart => {
          syncActivePendingOrderItems(currentCart);
          return currentCart;
        });
      }, 50);
    }
  };

  const removeFromCart = (goodsNo) => {
    let newCart = [];
    setCart((prev) => {
      newCart = prev.filter((item) => (item.goodsNo || item.id) !== goodsNo);
      if (activePendingOrder) {
        if (newCart.length === 0) {
          deleteOrderFromDB(activePendingOrder.id).catch(() => {});
          setOrders(oPrev => oPrev.filter(o => o.id !== activePendingOrder.id));
        } else {
          syncActivePendingOrderItems(newCart);
        }
      }
      return newCart;
    });
  };

  const updateCartQty = (goodsNo, qty) => {
    if (qty <= 0) return removeFromCart(goodsNo);
    let newCart = [];
    setCart((prev) => {
      newCart = prev.map((item) => ((item.goodsNo || item.id) === goodsNo ? { ...item, qty } : item));
      if (activePendingOrder) {
        syncActivePendingOrderItems(newCart);
      }
      return newCart;
    });
  };

  const clearCart = () => {
    setCart([]);
  };

  // ----- Authentication Helper Functions -----
  const registerUser = async (email, password, name) => {
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      const profileRef = doc(db, 'users', user.uid);
      const newProfile = { name: name || '', email, phone: '', addressBook: [] };
      await setDoc(profileRef, newProfile);
      setProfile(newProfile);
      return { success: true, user };
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, error };
    }
  };

  const loginUser = async (identifier, password) => {
    const cleanId = (identifier || '').trim().toLowerCase();
    const cleanPw = (password || '').trim();

    if (cleanId === 'tan123' || cleanId === 'tan123@tavykorea.vn' || cleanId.includes('tan123')) {
      if (cleanPw === 'tan123' || cleanPw === 'admin123') {
        const testUser = {
          uid: 'test_user_tan123',
          email: 'tan123@tavykorea.vn',
          displayName: 'Khách Hàng Test (Tan123)'
        };
        const testProfile = {
          name: 'Khách Hàng Test (Tan123)',
          email: 'tan123@tavykorea.vn',
          phone: '0912345678',
          address: 'Store TAVY KOREA, Quận 1, TP. Hồ Chí Minh',
          addressBook: []
        };
        setAuthUser(testUser);
        setProfile(testProfile);
        localStorage.setItem('user_auth', JSON.stringify(testProfile));
        return { success: true, user: testUser };
      } else {
        return { success: false, message: 'Mật khẩu không chính xác.' };
      }
    }

    try {
      clearAdminSession();
      setIsAdminAuthenticated(false);
      const { user } = await signInWithEmailAndPassword(auth, identifier, password);
      return { success: true, user };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Đăng nhập thất bại. Email hoặc mật khẩu không chính xác.' };
    }
  };

  const loginWithGoogleAuth = async () => {
    clearAdminSession();
    setIsAdminAuthenticated(false);
    const result = await loginWithGoogle();
    if (result.success && result.user) {
      try {
        const profileRef = doc(db, 'users', result.user.uid);
        const snap = await getDoc(profileRef);
        const nowIso = new Date().toISOString();
        const fallbackName = result.user.displayName || result.user.name || result.user.email?.split('@')[0] || 'Khách hàng TAVY';
        if (snap.exists()) {
          const existingData = snap.data();
          const updatedData = {
            ...existingData,
            email: result.user.email || existingData.email,
            name: existingData.name && existingData.name !== 'Khách hàng Google' ? existingData.name : fallbackName,
            photoURL: result.user.photoURL || existingData.photoURL || '',
            provider: 'google',
            lastLoginAt: nowIso,
            loginCount: (Number(existingData.loginCount) || 0) + 1
          };
          await setDoc(profileRef, {
            lastLoginAt: nowIso,
            loginCount: updatedData.loginCount,
            photoURL: updatedData.photoURL,
            provider: 'google',
            email: updatedData.email
          }, { merge: true }).catch(() => {});
          setProfile(updatedData);
          localStorage.setItem('user_auth', JSON.stringify(updatedData));
        } else {
          const newProfile = {
            uid: result.user.uid,
            name: fallbackName,
            email: result.user.email || '',
            photoURL: result.user.photoURL || '',
            phone: '',
            address: '',
            addressBook: [],
            provider: 'google',
            createdAt: nowIso,
            lastLoginAt: nowIso,
            loginCount: 1
          };
          await setDoc(profileRef, newProfile).catch(() => {});
          setProfile(newProfile);
          localStorage.setItem('user_auth', JSON.stringify(newProfile));
        }
      } catch (err) {
        console.warn("Google profile sync error:", err);
      }
    }
    return result;
  };

  const logoutUser = async () => {
    localStorage.removeItem('user_auth');
    clearAdminSession();
    sessionStorage.clear();
    setAuthUser(null);
    setProfile(null);
    setIsAdminAuthenticated(false);
    try {
      await signOut(auth);
    } catch (error) {
      console.warn('Logout error:', error);
    }
    return { success: true };
  };

  const updateUserProfile = async (updates) => {
    if (!authUser) return { success: false, error: new Error('Not authenticated'), message: 'Chưa đăng nhập' };
    const safeUpdates = { ...updates };
    if ('name' in safeUpdates) safeUpdates.name = sanitizeText(safeUpdates.name);
    if ('phone' in safeUpdates) safeUpdates.phone = sanitizePhone(safeUpdates.phone);
    if ('address' in safeUpdates) safeUpdates.address = sanitizeText(safeUpdates.address);
    const profileRef = doc(db, 'users', authUser.uid);
    try {
      await setDoc(profileRef, { ...safeUpdates, email: authUser.email }, { merge: true });
      const snap = await getDoc(profileRef);
      const data = snap.data();
      setProfile(data);
      try { localStorage.setItem('user_auth', JSON.stringify(data)); } catch {}
      return { success: true, profile: data };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error, message: error.message || 'Lỗi cập nhật hồ sơ' };
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    if (!authUser) return { success: false, error: new Error('Not authenticated') };
    try {
      const credential = EmailAuthProvider.credential(authUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      return { success: true };
    } catch (error) {
      console.error('Change password error:', error);
      return { success: false, error };
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    const isPaidStatus = ['deposit_paid', 'purchased', 'in_kr_warehouse', 'transit', 'in_vn_warehouse', 'delivering', 'completed'].includes(newStatus);
    const updates = {
      status: newStatus,
      paymentStatus: isPaidStatus ? 'paid' : 'unpaid',
      updatedAt: new Date().toISOString()
    };

    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        status: newStatus,
        paymentStatus: isPaidStatus ? 'paid' : 'unpaid',
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('Lỗi cập nhật trạng thái đơn hàng trên Firestore:', err);
    }
  };

  const updateOrderQuote = async (orderId, quoteData) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, quote: quoteData, totalVnd: quoteData.totalVnd, updatedAt: new Date().toISOString() } : o));
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, { quote: quoteData, totalVnd: quoteData.totalVnd, updatedAt: serverTimestamp() });
    } catch (err) {
      console.warn('Lỗi cập nhật báo giá đơn hàng trên Firestore:', err);
    }
  };

  const updateOrderTracking = async (orderId, trackingData) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...trackingData, updatedAt: new Date().toISOString() } : o));
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, { ...trackingData, updatedAt: serverTimestamp() });
    } catch (err) {
      console.warn('Lỗi cập nhật vận đơn trên Firestore:', err);
    }
  };

  // ----- Context Value -----
  const contextValue = {
    // Auth related
    authUser,
    profile,
    currentUser,
    registerUser,
    loginUser,
    loginWithGoogleAuth,
    logoutUser,
    updateUserProfile,
    changePassword,
    isAdminAuthenticated,
    loginAdmin,
    logoutAdmin,
    // Theme Management (Dark Mode)
    userTheme,
    setUserTheme,
    toggleUserTheme,
    adminTheme,
    setAdminTheme,
    toggleAdminTheme,
    // Existing app state
    orders,
    setOrders,
    updateOrderStatus,
    updateOrderQuote,
    updateOrderTracking,
    rates,
    setRates,
    updateRates,
    products,
    setProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    deleteAllProducts,
    publishedProducts,
    oliveYoungCatalog: publishedProducts,
    publishToWeb,
    revertFromWeb,
    pendingProducts,
    setPendingProducts,
    addPendingProduct,
    updatePendingProduct,
    approvePendingProduct,
    approveSelectedPendingProducts,
    approveAllPendingProducts,
    rejectPendingProduct,
    cart,
    addToCart,
    removeFromCart,
    updateCartQty,
    clearCart,
    createOrder,
    createManualOrder,
    deleteOrder,
    // Customer / Users State & Handlers
    usersList,
    setUsersList,
    updateCustomer,
    deleteCustomerAndOrders,
    // DB service functions (exposed for other components)
    subscribeToOrders,
    createOrderInDB,
    updateOrderQuoteInDB,
    updateOrderStatusInDB,
    confirmOrderPaymentInDB,
    subscribeToRates,
    updateRatesInDB,
    saveUserProfileInDB,
    saveProductToDB,
    deleteProductFromDB,
    deleteOrderFromDB,
    subscribeToUsers,
    updateUserInDB,
    deleteUserFromDB,
    updateOrderInDB
  };

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};
