// Ghi cấu hình price API vào Firestore: system_config/priceApi
// Chạy: node scripts/set_price_api_config.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

dotenv.config({ path: '/Users/tan/tavy-korea/.env' });

const cfg = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: 'tavyorder.firebaseapp.com',
  projectId: 'tavyorder',
  storageBucket: 'tavyorder.firebasestorage.app',
  messagingSenderId: '307372781687',
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(cfg);
const auth = getAuth(app);
const db = getFirestore(app);

const baseUrl = fs.readFileSync('/tmp/tunnel_url.txt', 'utf8').trim();
const apiKey = fs.readFileSync(path.join(os.homedir(), '.config/tavy/price-api.key'), 'utf8').trim();

await signInWithEmailAndPassword(auth, process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn', process.env.FIREBASE_ADMIN_PASSWORD);

await setDoc(doc(db, 'system_config', 'priceApi'), {
  baseUrl,
  apiKey,
  ttlSec: 900,
  enabled: true,
  provider: 'local-mac',
  updatedAt: new Date().toISOString(),
}, { merge: true });

console.log('WROTE system_config/priceApi', baseUrl);
process.exit(0);
