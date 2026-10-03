import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';

// Cấu hình Firebase qua environment variables (kèm fallback công khai để chạy được trên Vercel/Production)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCQ_cpZLNbZdgGpDzea9GlpCL8vbeb_emo',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'tavyorder.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tavyorder',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'tavyorder.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '307372781687',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:307372781687:web:356e2963e0cf23b018d672'
};

// Khởi tạo Firebase App an toàn
let app;
let authObj = {};
let dbObj = {};
let googleProviderObj = {};

try {
  app = initializeApp(firebaseConfig);
  // Chỉ gọi các hàm Firebase thật nếu có API Key
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== 'dummy') {
    authObj = getAuth(app);
    dbObj = getFirestore(app);
    googleProviderObj = new GoogleAuthProvider();
    googleProviderObj.setCustomParameters({
      prompt: 'select_account'
    });
  } else {
    console.warn("Dùng Firebase Mock vì thiếu API Key");
  }
} catch (error) {
  console.warn("Khởi tạo Firebase thất bại. Dùng cấu hình mock cho môi trường dev:", error);
}

export const auth = authObj;
export const db = dbObj;
export const googleProvider = googleProviderObj;
export { onAuthStateChanged };

// Bật Offline Data Persistence (Hỗ trợ Multi-tab chống lockup)
try {
  if (dbObj && dbObj.type) { // Kiểm tra xem dbObj có phải là Firestore instance thật không
    const enablePersistenceFn = enableMultiTabIndexedDbPersistence || enableIndexedDbPersistence;
    enablePersistenceFn(dbObj).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence failed: Multiple tabs open');
      } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence not supported by browser');
      }
    });
  }
} catch {
  // Ignore in SSR/unsupported env
}

// 1. Hàm Đăng nhập bằng tài khoản Google 1-click
export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    return {
      success: true,
      user: {
        uid: user.uid,
        name: user.displayName || user.email?.split('@')[0] || 'Khách hàng Google',
        email: user.email,
        photoURL: user.photoURL || ''
      }
    };
  } catch (error) {
    console.error("Firebase Google login error:", error);

    // Xử lý nếu popup bị trình duyệt chặn -> chuyển sang Redirect
    if (error.code === 'auth/popup-blocked') {
      try {
        await signInWithRedirect(auth, googleProvider);
        return { success: false, message: 'Đang chuyển hướng sang trang đăng nhập Google...' };
      } catch (redirectErr) {
        console.warn("Redirect fallback failed:", redirectErr);
        return { success: false, message: 'Cửa sổ bật lên bị chặn. Vui lòng cho phép popup trên trình duyệt!' };
      }
    }

    if (error.code === 'auth/popup-closed-by-user') {
      return { success: false, message: 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.' };
    }

    if (error.code === 'auth/configuration-not-found') {
      return { 
        success: false, 
        message: 'Firebase Authentication chưa được kích hoạt cho dự án tavy-oderho. Vui lòng mở Firebase Console > Authentication > bấm "Get Started" và BẬT nhà cung cấp Google.' 
      };
    }

    if (error.code === 'auth/unauthorized-domain') {
      return { 
        success: false, 
        message: 'Tên miền hiện tại (tavy-oderho.web.app / localhost) chưa được thêm vào mục Authorized Domains trong Firebase Console -> Authentication -> Settings.' 
      };
    }

    if (error.code === 'auth/operation-not-allowed') {
      return { 
        success: false, 
        message: 'Phương thức Đăng nhập bằng Google chưa được bật trong Firebase Console -> Authentication -> Sign-in method.' 
      };
    }

    return { success: false, message: `Lỗi đăng nhập Google: ${error.message || error.code}` };
  }
};

// 2. Lắng nghe kết quả Redirect từ Google (nếu có)
export const checkGoogleRedirectResult = async () => {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      const user = result.user;
      return {
        success: true,
        user: {
          uid: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'Khách hàng Google',
          email: user.email,
          photoURL: user.photoURL || ''
        }
      };
    }
  } catch (err) {
    console.warn("Redirect result error:", err);
  }
  return null;
};

// 3. Hàm Đăng xuất
export const logoutGoogle = async () => {
  try {
    await signOut(auth);
    return { success: true };
  } catch {
    return { success: true };
  }
};

