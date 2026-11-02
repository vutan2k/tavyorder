#!/usr/bin/env node
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
});
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  const dataFile = resolve(process.cwd(), 'scripts/audited_options_data.json');
  const audited = JSON.parse(readFileSync(dataFile, 'utf8'));

  console.log('🔐 Đang đăng nhập Admin Auth...');
  await signInWithEmailAndPassword(auth, 'admin@tavykorea.vn', 'admin123');
  console.log('✅ Đăng nhập Admin thành công!');

  for (const [goodsNo, scrapedOpts] of Object.entries(audited)) {
    const docRef = doc(db, 'products', goodsNo);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      console.log(`⚠️ Không tìm thấy ${goodsNo} trên Firestore.`);
      continue;
    }

    const currentData = snap.data();
    const existingOpts = Array.isArray(currentData.options) ? currentData.options : [];
    
    // Map existing options with audited data
    const updatedOptions = existingOpts.map((opt, idx) => {
      // Find matching scraped opt by nameKr or index
      let match = scrapedOpts.find(s => s.nameKr && opt.name_kr && s.nameKr.includes(opt.name_kr));
      if (!match && idx < scrapedOpts.length) {
        match = scrapedOpts[idx];
      }

      if (match && match.priceKrw) {
        return {
          ...opt,
          price_krw: match.priceKrw,
          price: match.priceKrw,
          is_sold_out: Boolean(match.isSoldOut),
          isSoldOut: Boolean(match.isSoldOut),
          status: match.isSoldOut ? 'out_of_stock' : 'available',
          image_url: match.imageUrl || opt.image_url
        };
      }
      return opt;
    });

    // Calculate parent minimum price from available options
    const availableOpts = updatedOptions.filter(o => !o.is_sold_out);
    const candidateOpts = availableOpts.length > 0 ? availableOpts : updatedOptions;
    const minWon = Math.min(...candidateOpts.map(o => o.price_krw || o.price || 9999999));
    const finalParentWon = (minWon && minWon < 9999999) ? minWon : (currentData.foreignPrice || 25000);

    const updates = {
      options: updatedOptions,
      foreignPrice: finalParentWon,
      price: finalParentWon,
      is_sold_out: availableOpts.length === 0,
      isSoldOut: availableOpts.length === 0,
      status: availableOpts.length === 0 ? 'out_of_stock' : 'published',
      isPublished: true,
      lastAuditedAt: new Date().toISOString()
    };

    await updateDoc(docRef, updates);
    console.log(`✅ [${goodsNo}] Đã cập nhật ${updatedOptions.length} options! Giá cha tối thiểu: ₩${finalParentWon.toLocaleString()}`);
  }

  console.log('\n🎉 Đã hoàn tất cập nhật options vào Cloud Firestore!');
  process.exit(0);
}

main().catch(err => {
  console.error('Lỗi cập nhật:', err);
  process.exit(1);
});
