// Re-resolve Lotte ON URL bằng Playwright (search render client-side).
//   node scripts/reresolve_lotte.mjs /tmp/reresolve_jobs.json /tmp/reresolve_out.json
import fs from 'node:fs';
import { chromium } from 'playwright';

const CHROME = '/Users/tan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const jobsFile = process.argv[2] || '/tmp/reresolve_jobs.json';
const outFile = process.argv[3] || '/tmp/reresolve_out.json';
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));

const SIZE_RE = /(\d+)\s*(ml|g)\b/gi;
const sizesOf = (s) => {
  const out = new Set();
  for (const m of (s || '').matchAll(SIZE_RE)) out.add(`${Number(m[1])}${m[2].toLowerCase()}`);
  return out;
};
const priceOf = (t) => {
  const m = t.match(/최종가\s*\|?\s*([\d,]{4,})/) || t.match(/([\d,]{4,})\s*원/);
  return m ? Number(m[1].replace(/,/g, '')) : 0;
};

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const ctx = await browser.newContext({
  locale: 'ko-KR',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();
const results = [];

for (const job of jobs) {
  const q = `${job.brand} ${job.name_kr}`.replace(/\s+/g, ' ').trim();
  const url = `https://www.lotteon.com/search/search/search.ecn?render=search&q=${encodeURIComponent(q)}`;
  let cards = [];
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);
    cards = await page.$$eval('.c-product-card', (els) => els.map((el) => {
      const a = el.querySelector('a[href*="/product/"]');
      return { text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400), href: a ? a.href : '' };
    }));
  } catch (e) {
    console.log(`${job.id} ERR ${String(e).slice(0, 90)}`);
    results.push({ ...job, best: null, error: String(e).slice(0, 120) });
    continue;
  }

  const want = new Set(job.targetSize ? [job.targetSize] : (job.sizes || []));
  const scored = cards.map((c) => {
    const price = priceOf(c.text);
    const cs = sizesOf(c.text);
    let sizeHit = 0;
    if (want.size) {
      if ([...want].some((s) => cs.has(s))) sizeHit = 1;
      else if (cs.size) sizeHit = -1;
    }
    const tokens = job.tokens || [];
    const hits = tokens.filter((t) => c.text.includes(t)).length;
    const brandHit = job.brand && c.text.toLowerCase().includes(job.brand.toLowerCase().slice(0, 5)) ? 1 : 0;
    const inBand = price > 0 && price >= job.lo * 0.7 && price <= job.hi * 1.25;
    const coverage = tokens.length ? hits / tokens.length : 0;
    const setWord = /(세트|기획|증정|듀오|미니어처|샘플|리필)/;
    const setPenalty = setWord.test(c.text) && !setWord.test(job.name_kr) ? -8 : 0;
    const s = Math.round(coverage * 20) + brandHit * 2 + sizeHit * 4 + (inBand ? 3 : -4) + setPenalty;
    return { s, coverage, sizeHit, inBand, price, href: c.href, text: c.text };
  }).sort((a, b) => b.s - a.s);

  const best = scored[0] || null;
  const needSize = (job.sizes || []).length > 0;
  const ok = best && best.inBand && best.coverage >= 0.85 && (!needSize || best.sizeHit === 1) && best.s > 0;
  console.log(`${job.id} cards=${cards.length} ${ok ? 'FIX' : 'KEEP'} ${best ? `cov=${best.coverage.toFixed(2)} size=${best.sizeHit} band=${best.inBand} ${best.price}` : ''} ${best ? best.text.slice(0, 70) : ''}`);
  if (best) console.log(`   ${best.href.slice(0, 100)}`);
  results.push({ ...job, best: ok ? { url: best.href, price: best.price, text: best.text } : null, candidates: scored.slice(0, 3).map((x) => ({ s: x.s, price: x.price, inBand: x.inBand, sizeHit: x.sizeHit, href: x.href, text: x.text.slice(0, 80) })) });
  await page.waitForTimeout(800);
}

fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
console.log(`WROTE ${outFile} | fixed ${results.filter((r) => r.best).length}/${results.length}`);
await browser.close();
