// In ứng viên Lotte cho 4 SKU chưa map được, để chọn tay.
import { chromium } from 'playwright';

const CHROME = '/Users/tan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const QUERIES = [
  ['HE0000000052', '설화수 자음생 아이크림 20ml', 165000],
  ['HE0000000004', '디올 포에버 스킨 글로우 쿠션', 108000],
  ['HE0000000003', '디올 루즈 디올 포에버 리퀴드 립스틱', 61000],
  ['HE0000000005', '입생로랑 캔디 글레이즈 립 글로스 스틱', 57000],
];

const b = await chromium.launch({ headless: true, executablePath: CHROME });
const ctx = await b.newContext({ locale: 'ko-KR', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
const page = await ctx.newPage();

for (const [id, q, band] of QUERIES) {
  const url = `https://www.lotteon.com/search/search/search.ecn?render=search&q=${encodeURIComponent(q)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3500);
  const cards = await page.$$eval('.c-product-card', (els) => els.map((el) => {
    const a = el.querySelector('a[href*="/product/"]');
    return { text: (el.innerText || '').replace(/\s+/g, ' ').trim(), href: a ? a.href : '' };
  }));
  console.log(`\n=== ${id} band=${band} q="${q}" cards=${cards.length}`);
  const withPrice = cards.map((c) => {
    const m = c.text.match(/최종가\s*\|?\s*([\d,]{4,})/) || c.text.match(/([\d,]{4,})\s*원/);
    return { price: m ? Number(m[1].replace(/,/g, '')) : 0, ...c };
  }).filter((c) => c.price > 0);
  withPrice.sort((a, b2) => Math.abs(a.price - band) - Math.abs(b2.price - band));
  for (const c of withPrice.slice(0, 6)) {
    console.log(`  ${String(c.price).padStart(9)} | ${c.text.slice(0, 95)}`);
    console.log(`            ${c.href.split('&dp_infw')[0]}`);
  }
  await page.waitForTimeout(700);
}
await b.close();
