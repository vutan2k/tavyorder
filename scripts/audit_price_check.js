import { chromium } from 'playwright';
import fs from 'fs';

const CHROME_PATH = '/Users/tan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const catalog = JSON.parse(fs.readFileSync('/Users/tan/tavy-korea/public/data/all_products_catalog.json', 'utf8'));
const catMap = new Map();
catalog.forEach(p => catMap.set(p.goodsNo, p));

const testGids = ['A000000249163', 'A000001002386', 'A000000223414'];

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  });

  console.log('=== ĐỐI SOÁT TRỰC TIẾP GIÁ LIVE TRÊN OLIVE YOUNG VS WEB TAVY ===\n');
  for (const gid of testGids) {
    const item = catMap.get(gid);
    await page.goto('https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=' + gid, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const oy = await page.evaluate(() => {
      const metas = Array.from(document.querySelectorAll('meta')).reduce((acc, m) => {
        const p = m.getAttribute('property') || m.getAttribute('name');
        if (p) acc[p] = m.getAttribute('content');
        return acc;
      }, {});
      return {
        sale: parseInt(metas['eg:salePrice'] || '0'),
        orig: parseInt(metas['eg:originalPrice'] || '0')
      };
    });

    console.log(`[SKU: ${gid}] ${item.brand} - ${item.name.slice(0, 35)}`);
    console.log(`  • OY Web Gốc (Live):  Gốc: ${oy.orig.toLocaleString()} KRW | Sale: ${oy.sale.toLocaleString()} KRW`);
    console.log(`  • Tavy Database:      Gốc: ${item.originalPriceWon.toLocaleString()} KRW | Sale: ${item.foreignPrice.toLocaleString()} KRW`);
    console.log(`  • Tavy Tiền VND:      ${item.priceVnd.toLocaleString('vi-VN')} VNĐ`);
    console.log(`  • Công thức kiểm tra: round(${oy.sale} * 19.5 * 1.3 / 1000) * 1000 = ${(Math.round(oy.sale * 19.5 * 1.3 / 1000) * 1000).toLocaleString('vi-VN')} VNĐ`);
    const match = (oy.sale === item.foreignPrice && oy.orig === item.originalPriceWon);
    console.log(`  • Kết quả đối soát:   ${match ? '✅ CHÍNH XÁC 100% TUYỆT ĐỐI' : '❌ LỆCH'}\n`);
  }

  await browser.close();
}

run();
