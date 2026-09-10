import { chromium } from 'playwright';

async function runDesktopInspection() {
  console.log('🖥️ Đang mở trình duyệt Desktop (1280x900) để kiểm tra Modal 2 cột...');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 300,
    args: ['--window-size=1280,920', '--window-position=50,40']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.product-card', { timeout: 10000 });
  await page.waitForTimeout(1500);

  // Mở modal sản phẩm Top 1 Mediheal trên Desktop
  await page.click('.product-card-title');
  await page.waitForTimeout(1500);

  // Chụp ảnh Modal 2 cột Desktop
  await page.screenshot({ path: '/Users/tan/Desktop/tavy_desktop_modal_2col_final.png' });
  console.log('📸 Đã chụp màn hình Modal 2 cột Desktop: /Users/tan/Desktop/tavy_desktop_modal_2col_final.png');

  await browser.close();
}

runDesktopInspection().catch(err => {
  console.error('Lỗi Desktop inspection:', err);
  process.exit(1);
});
