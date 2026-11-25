/**
 * Thu thập ảnh gốc + ảnh review Lotte cho SKU high-end.
 * Chạy: node scripts/collect_highend_media.mjs [--limit N]
 * Kết quả: /tmp/highend_media.json (chưa tải ảnh).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME = '/Users/tan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const items = JSON.parse(fs.readFileSync('/tmp/highend.json', 'utf8'));
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : items.length;

const b = await chromium.launch({ headless: true, executablePath: CHROME });
const ctx = await b.newContext({
  locale: 'ko-KR',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const out = {};
const file = '/tmp/highend_media.json';
if (fs.existsSync(file)) Object.assign(out, JSON.parse(fs.readFileSync(file, 'utf8')));

for (const it of items.slice(0, limit)) {
  if (out[it.id]?.main) { console.log('skip', it.id); continue; }
  if (!it.url) { console.log('nourl', it.id); continue; }
  const p = await ctx.newPage();
  try {
    await p.goto(it.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(2600);
    await p.evaluate(() => window.scrollTo(0, 1300));
    await p.waitForTimeout(1800);
    const imgs = await p.evaluate(() => [...document.querySelectorAll('img')].map(i => i.currentSrc || i.src).filter(Boolean));
    const mains = [...new Set(imgs.filter(u => /contents\.lotteon\.com\/itemimage/.test(u)))].map(u => u.split('/dims/')[0]);
    const revs = [...new Set(imgs.filter(u => /contents\.lotteon\.com\/review\/ctnts/.test(u)))].map(u => u.split('/dims/')[0]);
    out[it.id] = { main: mains[0] || null, gallery: mains.slice(0, 4), reviews: revs.slice(0, 8), brand: it.brand };
    console.log(it.id, 'main', mains.length, 'rev', revs.length);
  } catch (e) {
    console.log(it.id, 'ERR', String(e).slice(0, 80));
    out[it.id] = { main: null, reviews: [], error: String(e).slice(0, 120) };
  } finally {
    await p.close().catch(() => {});
  }
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
}
await b.close();
console.log('DONE', Object.keys(out).length);
