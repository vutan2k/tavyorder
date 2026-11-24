import { chromium } from 'playwright';
import fs from 'fs';

const CHROME_PATH = '/Users/tan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const catalog = JSON.parse(fs.readFileSync('/Users/tan/tavy-korea/public/data/all_products_catalog.json', 'utf8'));

// Chọn ngẫu nhiên 5 sản phẩm bất kỳ trong catalog
const sample = [];
const shuffled = [...catalog].sort(() => 0.5 - Math.random());
for (const p of shuffled) {
  if (p.goodsNo && p.goodsNo.startsWith('A')) {
    sample.push(p);
    if (sample.length === 5) break;
  }
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  });

  console.log('🔍 KIỂM TRA NGẪU NHIÊN 5 SKU BẤT KỲ TRÊN WEB:\n');
  for (const item of sample) {
    const gid = item.goodsNo;
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

    const isMatch = (oy.sale === item.foreignPrice && oy.orig === item.originalPriceWon);
    console.log(`[${gid}] ${item.brand} - ${item.name.slice(0, 30)}`);
    console.log(`  • OY Live Thật:   Gốc: ${oy.orig.toLocaleString()} KRW | Sale: ${oy.sale.toLocaleString()} KRW`);
    console.log(`  • Tavy Đang Lưu:  Gốc: ${item.originalPriceWon.toLocaleString()} KRW | Sale: ${item.foreignPrice.toLocaleString()} KRW`);
    console.log(`  • Trạng thái:     ${isMatch ? '✅ KHỚP CHUẨN 100%' : '⚠️ LỆCH (CẦN ĐỒNG BỘ)'}\n`);
  }

  await browser.close();
}

run();
