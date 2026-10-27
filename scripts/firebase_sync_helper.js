import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, writeBatch, deleteField } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/tan/tavy-korea/.env' });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: 'tavyorder.firebaseapp.com',
  projectId: 'tavyorder',
  storageBucket: 'tavyorder.firebasestorage.app',
  messagingSenderId: '307372781687',
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const LOCAL_PRODUCTS_DIR = '/Users/tan/tavy-korea/public/products';

async function loginAdmin() {
  const adminEmail = process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn';
  const adminPass = process.env.FIREBASE_ADMIN_PASSWORD || 'admin123';
  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
}

const action = process.argv[2];

async function main() {
  if (action === 'dump') {
    const snap = await getDocs(collection(db, 'products'));
    const prods = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
    const outPath = process.argv[3] || '/tmp/firestore_products.json';
    fs.writeFileSync(outPath, JSON.stringify(prods, null, 2));
    console.log(`DUMP_OK: ${prods.length} products saved to ${outPath}`);
    process.exit(0);
  }

  if (action === 'upload-images') {
    await loginAdmin();
    const gidsToUpload = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    // Array of { goodsNo: string, isSold: boolean }
    const results = {};

    for (let i = 0; i < gidsToUpload.length; i++) {
      const { goodsNo, isSold } = gidsToUpload[i];
      let filePath = null;
      let ext = 'jpg';
      for (const testExt of ['jpg', 'png', 'jpeg', 'webp']) {
        const p = path.join(LOCAL_PRODUCTS_DIR, `${goodsNo}.${testExt}`);
        if (fs.existsSync(p)) {
          filePath = p;
          ext = testExt;
          break;
        }
      }

      if (!filePath) {
        console.warn(`[UPLOAD_SKIP] No local file for ${goodsNo}`);
        continue;
      }

      try {
        const storagePath = isSold ? `products/${goodsNo}/main_thumbnail_sold.${ext}` : `products/${goodsNo}/main_thumbnail.${ext}`;
        const sRef = ref(storage, storagePath);
        const buf = fs.readFileSync(filePath);
        const contentType = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');

        await uploadBytes(sRef, buf, { contentType });
        const downloadUrl = await getDownloadURL(sRef);
        results[goodsNo] = downloadUrl;
        console.log(`[UPLOAD_OK ${i+1}/${gidsToUpload.length}] ${goodsNo} -> ${downloadUrl.slice(0, 70)}...`);
      } catch (err) {
        console.error(`[UPLOAD_ERR ${goodsNo}]`, err.message);
      }
    }

    const outPath = process.argv[4] || '/tmp/uploaded_images_map.json';
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`ALL_UPLOADS_DONE: ${Object.keys(results).length} images mapped.`);
    process.exit(0);
  }

  if (action === 'commit') {
    await loginAdmin();
    const payloadPath = process.argv[3] || '/tmp/firestore_sync_payload.json';
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

    // 1. Identify current Top 100 goodsNos
    const topGids = new Set(payload.filter(p => p.rank !== undefined && p.rank !== null).map(p => p.goodsNo || p.firestoreId));

    // 2. Fetch existing products to clear obsolete rank fields
    const snap = await getDocs(collection(db, 'products'));
    let cleanRankBatch = writeBatch(db);
    let cleanCount = 0;

    snap.forEach(d => {
      const data = d.data();
      const gid = data.goodsNo || d.id;
      if (!topGids.has(gid) && data.rank !== undefined) {
        cleanRankBatch.update(doc(db, 'products', d.id), { rank: deleteField() });
        cleanCount++;
      }
    });

    if (cleanCount > 0) {
      await cleanRankBatch.commit();
      console.log(`CLEANED_RANKS: ${cleanCount} non-top products had obsolete rank removed.`);
    }

    // 3. Batch upsert full payload
    let batch = writeBatch(db);
    let opCount = 0;
    let totalCommitted = 0;

    for (const item of payload) {
      const docId = item.goodsNo || item.firestoreId;
      if (!docId) continue;
      
      const docRef = doc(db, 'products', docId);
      batch.set(docRef, item, { merge: true });
      opCount++;
      totalCommitted++;

      if (opCount >= 100) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    console.log(`COMMIT_SUCCESS: ${totalCommitted} products updated in Firestore.`);
    process.exit(0);
  }

  console.error(`Unknown action: ${action}`);
  process.exit(1);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
