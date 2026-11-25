/**
 * Thu ảnh review thật (gdasEditor) từ PDP Olive Young.
 * Chạy: node scripts/collect_oy_reviews.mjs [--limit N]
 * Kết quả: /tmp/oy_reviews.json  { goodsNo: [url,...] }
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME = '/Users/tan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ids = JSON.parse(fs.readFileSync('/tmp/oy_review_ids.json', 'utf8'));
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : ids.length;
const FILE = '/tmp/oy_reviews.json';
const out = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};

const b = await chromium.launch({ headless: true, executablePath: CHROME });
const ctx = await b.newContext({
  locale: 'ko-KR',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

for (const gid of ids.slice(0, limit)) {
  if ((out[gid] || []).length >= 3) { console.log('skip', gid); continue; }
  const p = await ctx.newPage();
  try {
    await p.goto(`https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${gid}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(2500);
    // cuộn xuống khu vực review để widget load
    for (let i = 0; i < 6; i++) {
      await p.mouse.wheel(0, 900);
      await p.waitForTimeout(700);
    }
    // bấm tab 리뷰 nếu có
    for (const sel of ['a:has-text("리뷰")', 'button:has-text("리뷰")', '[data-testid*="review"]']) {
      try { const el = await p.$(sel); if (el) { await el.click({ timeout: 1500 }); break; } } catch {}
    }
    await p.waitForTimeout(2500);
    const urls = await p.evaluate(() => {
      const all = new Set();
      const walk = (root) => {
        if (!root) return;
        if (root.querySelectorAll) root.querySelectorAll('img').forEach(i => { if (i.src) all.add(i.src); });
        if (root.querySelectorAll) root.querySelectorAll('*').forEach(el => { if (el.shadowRoot) walk(el.shadowRoot); });
      };
      walk(document);
      return [...all];
    });
    const rev = urls
      .filter(u => u.includes('gdasEditor') || /\/review\/ctnts\//.test(u))
      .map(u => u.split('?')[0])
      .filter((u, i, a) => a.indexOf(u) === i)
      .slice(0, 5);
    out[gid] = rev;
    console.log(gid, 'rev', rev.length);
  } catch (e) {
    console.log(gid, 'ERR', String(e).slice(0, 60));
    out[gid] = out[gid] || [];
  }
  fs.writeFileSync(FILE, JSON.stringify(out, null, 1));
  await p.close();
  await new Promise(r => setTimeout(r, 2500));
}
await b.close();
console.log('DONE');
