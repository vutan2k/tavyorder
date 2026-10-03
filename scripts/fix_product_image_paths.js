#!/usr/bin/env node
/**
 * fix_product_image_paths.js
 * Đồng bộ trường ảnh Firestore products khớp file THẬT trên disk.
 * Xác thực Admin Firebase Auth trước khi ghi (firestore rules: allow write if isAdmin).
 *
 * Usage: node scripts/fix_product_image_paths.js [--dry-run]
 */
import { readdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const DRY = process.argv.includes('--dry-run');
const SRC = join(homedir(), 'Desktop', 'oliveyoung_ranking');

const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
const envGet = (k, d) => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1]?.trim() || d;

const firebaseConfig = {
  apiKey: envGet('VITE_FIREBASE_API_KEY'),
  authDomain: envGet('VITE_FIREBASE_AUTH_DOMAIN', 'tavyorder.firebaseapp.com'),
  projectId: envGet('VITE_FIREBASE_PROJECT_ID', 'tavyorder'),
  storageBucket: envGet('VITE_FIREBASE_STORAGE_BUCKET', 'tavyorder.firebasestorage.app'),
  messagingSenderId: envGet('VITE_FIREBASE_MESSAGING_SENDER_ID', '307372781687'),
  appId: envGet('VITE_FIREBASE_APP_ID', '1:307372781687:web:356e2963e0cf23b018d672'),
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const listCache = {};
function listFiles(folder) {
  if (listCache[folder] !== undefined) return listCache[folder];
  const dir = join(SRC, folder);
  listCache[folder] = existsSync(dir) ? readdirSync(dir) : null;
  return listCache[folder];
}
const pick = (files, stem) => files.find(f => f.replace(/\.[a-z0-9]+$/i, '') === stem) || null;
const strArr = (field) => (field?.arrayValue?.values || []).map(v => v.stringValue);

function buildPlan(docs) {
  const pub = docs.filter(d => d.fields.isPublished?.booleanValue);
  const plan = [];

  for (const d of pub) {
    const id = d.name.split('/').pop();
    const f = d.fields;
    const pi = f.productImage?.stringValue || '';
    const isHttp = pi.startsWith('http');

    const allPaths = [pi, ...strArr(f.images), ...strArr(f.photoReviews)];
    const folderHit = allPaths.map(u => (u.match(/oliveyoung_ranking\/(top_[^/]+)/) || [])[1]).find(Boolean);
    if (!folderHit) { plan.push({ id, status: 'SKIP_NO_FOLDER_REF' }); continue; }
    const files = listFiles(folderHit);
    if (!files) { plan.push({ id, folder: folderHit, status: 'NO_FOLDER_ON_DISK' }); continue; }

    const mainFile = pick(files, 'main_thumbnail');
    if (!mainFile) { plan.push({ id, folder: folderHit, status: 'NO_MAIN_FILE' }); continue; }

    const base = `/oliveyoung_ranking/${folderHit}`;
    const diskMain = `${base}/${mainFile}`;

    const remap = (urls) => urls.map(u => {
      const fn = (u.split('/').pop() || '');
      const stem = fn.replace(/\.[a-z0-9]+$/i, '');
      if (!stem) return null;
      const hit = pick(files, stem);
      if (hit) return `${base}/${hit}`;
      if (stem === 'main_thumbnail') return diskMain;
      return null;
    }).filter(Boolean);

    const curImages = strArr(f.images);
    const curReviews = strArr(f.photoReviews);
    let newImages = remap(curImages);
    let newReviews = remap(curReviews);
    if (newImages.length === 0) newImages = [diskMain];
    if (newReviews.length === 0) newReviews = newImages.filter(u => /review_user_/.test(u));

    const newMain = isHttp ? pi : diskMain;

    // options[].image_url: giữ nguyên mọi field, chỉ thay image_url trỏ disk
    const newOptions = [];
    for (const o of (f.options?.arrayValue?.values || [])) {
      const of = o.mapValue?.fields || {};
      const ou = of.image_url?.stringValue;
      if (!ou || !ou.includes('/oliveyoung_ranking/')) continue;
      const stem = ou.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
      const hit = pick(files, stem) || (stem === 'main_thumbnail' ? mainFile : null);
      if (!hit) continue;
      const to = `${base}/${hit}`;
      if (to === ou) continue;
      const clone = JSON.parse(JSON.stringify(o));
      clone.mapValue.fields.image_url = { stringValue: to };
      newOptions.push(clone);
    }

    const changed = pi !== newMain ||
      JSON.stringify(curImages) !== JSON.stringify(newImages) ||
      JSON.stringify(curReviews) !== JSON.stringify(newReviews) ||
      newOptions.length > 0;

    plan.push({
      id, folder: folderHit, status: changed ? 'UPDATE' : 'OK',
      group: isHttp ? 'A' : 'B',
      before: pi, after: newMain,
      images: newImages.length, reviews: newReviews.length,
      newImages, newReviews, optFixes: newOptions.length,
      newOptions, allOptions: (f.options?.arrayValue?.values || []),
    });
  }
  return plan;
}

async function main() {
  const adminEmail = envGet('VITE_ADMIN_EMAIL', 'admin@tavykorea.vn');
  // .env VITE_ADMIN_PASSWORD hiện là mật khẩu UI admin, KHÔNG phải Firebase Auth password.
  // Firebase Auth dùng admin123 (theo các script sync khác trong repo).
  const adminPass = process.env.FIREBASE_ADMIN_PASSWORD || 'admin123';
  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  console.log('Admin auth OK:', adminEmail);

  const snap = await getDocs(collection(db, 'products'));
  const raw = snap.docs.map(d => ({ id: d.id, data: d.data(), ref: d.ref }));
  console.log('Total docs:', raw.length);

  // Adapt to the field-shape used by buildPlan (Firestore REST-like)
  const restLike = raw.map(r => {
    const toVal = (v) => {
      if (Array.isArray(v)) return { arrayValue: { values: v.map(toVal) } };
      if (v && typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toVal(x)])) } };
      if (typeof v === 'boolean') return { booleanValue: v };
      if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
      return { stringValue: v == null ? '' : String(v) };
    };
    return { name: r.ref.path, fields: Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, toVal(v)])), _id: r.id, _ref: r.ref };
  });

  const plan = buildPlan(restLike);
  const tally = {};
  plan.forEach(p => tally[p.status] = (tally[p.status] || 0) + 1);
  console.log('TALLY:', JSON.stringify(tally));
  plan.filter(p => p.status !== 'OK').forEach(p =>
    console.log(' ', p.status, p.id, '| grp', p.group || '-', '| imgs', p.images, '| rev', p.reviews, '| optFix', p.optFixes));
  writeFileSync('/tmp/fix_plan.json', JSON.stringify(plan, null, 1));

  if (DRY) { console.log('\n[DRY-RUN] no writes.'); process.exit(0); }

  const updates = plan.filter(p => p.status === 'UPDATE');
  const refMap = Object.fromEntries(restLike.map(r => [r._id, r._ref]));
  const BATCH = 400;
  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const p of updates.slice(i, i + BATCH)) {
      const payload = {
        productImage: p.after,
        images: p.newImages,
        photoReviews: p.newReviews,
      };
      if (p.newOptions && p.newOptions.length) {
        const merged = (p.allOptions || []).map(orig => {
          const oid = orig.mapValue?.fields?.id?.stringValue || '';
          const fix = p.newOptions.find(n => (n.mapValue.fields.id?.stringValue || '') === oid);
          return fix ? fix.mapValue.fields : orig.mapValue.fields;
        });
        // Convert mapValue.fields shape back to plain objects
        payload.options = merged.map(fields => Object.fromEntries(
          Object.entries(fields).map(([k, v]) => {
            if ('stringValue' in v) return [k, v.stringValue];
            if ('booleanValue' in v) return [k, v.booleanValue];
            if ('integerValue' in v) return [k, parseInt(v.integerValue)];
            if ('doubleValue' in v) return [k, v.doubleValue];
            if ('arrayValue' in v) return [k, (v.arrayValue.values || []).map(x => x.stringValue)];
            return [k, v];
          })
        ));
      }
      batch.set(refMap[p.id], payload, { merge: true });
    }
    await batch.commit();
    written += Math.min(BATCH, updates.length - i);
    console.log(`  committed ${written}/${updates.length}`);
  }
  console.log(`\nDONE. Wrote ${written} docs.`);
  process.exit(0);
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });