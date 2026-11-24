import { chromium } from 'playwright';

const CHROME = '/Users/tan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = process.argv[2] || 'https://www.lotteon.com/p/product/LE1217073670';

const b = await chromium.launch({ headless: true, executablePath: CHROME });
const ctx = await b.newContext({ locale: 'ko-KR', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
const page = await ctx.newPage();
const hits = [];
page.on('response', async (resp) => {
  const u = resp.url();
  if (!/api|graphql|product/i.test(u)) return;
  const rt = resp.request().resourceType();
  if (rt !== 'xhr' && rt !== 'fetch') return;
  try {
    const body = await resp.text();
    if (/"(salePrice|discountPrice|price)"/.test(body)) hits.push({ status: resp.status(), url: u.slice(0, 180), len: body.length, snip: body.slice(0, 260) });
  } catch {}
});
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(4000);
const txt = await page.innerText('body');
const prices = [...txt.matchAll(/([0-9][0-9,]{3,})\s*원/g)].map(m => m[1]).slice(0, 8);
console.log('TITLE', (await page.title()).slice(0, 90));
console.log('DOM_PRICES', JSON.stringify(prices));
for (const h of hits.slice(0, 6)) console.log('API', h.status, h.url, h.len, h.snip.replace(/\n/g, ' '));
if (!hits.length) console.log('NO_PRICE_API');
await b.close();
