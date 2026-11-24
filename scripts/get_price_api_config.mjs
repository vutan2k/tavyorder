// Đọc cấu hình price API từ Firestore: system_config/priceApi
import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

dotenv.config({ path: '/Users/tan/tavy-korea/.env', quiet: true });
const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: 'tavyorder.firebaseapp.com',
  projectId: 'tavyorder',
  storageBucket: 'tavyorder.firebasestorage.app',
  messagingSenderId: '307372781687',
  appId: process.env.VITE_FIREBASE_APP_ID,
});
await signInWithEmailAndPassword(getAuth(app), 'admin@tavykorea.vn', process.env.FIREBASE_ADMIN_PASSWORD);
const snap = await getDoc(doc(getFirestore(app), 'system_config', 'priceApi'));
console.log(JSON.stringify(snap.data() || null));
process.exit(0);
