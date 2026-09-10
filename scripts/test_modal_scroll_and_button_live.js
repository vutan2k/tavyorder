import { chromium, devices } from 'playwright';

const iPhone14 = devices['iPhone 14 Pro'];

async function testModalLive() {
  console.log('📱 Khởi chạy kiểm thử trực quan trên iPhone 14 Pro...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...iPhone14,
    locale: 'vi-VN'
  });
  const page = await context.newPage();

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // 1. Mở modal Top 1 Mediheal
  const card1 = page.locator('.product-card').first();
  await card1.click();
  await page.waitForTimeout(600);

  // 2. Chụp ảnh màn hình khi vừa mở modal
  await page.screenshot({ path: '/Users/tan/Desktop/live_modal_initial_fixed_btn.png' });
  console.log('📸 Đã chụp modal vừa mở: /Users/tan/Desktop/live_modal_initial_fixed_btn.png');

  // 3. Cuộn nội dung xuống dưới cùng
  const scrollArea = page.locator('.modal-scroll-area');
  await scrollArea.evaluate(el => el.scrollTo({ top: 1000, behavior: 'instant' }));
  await page.waitForTimeout(500);

  // 4. Chụp ảnh màn hình khi đã cuộn xuống cuối
  await page.screenshot({ path: '/Users/tan/Desktop/live_modal_scrolled_to_bottom.png' });
  console.log('📸 Đã chụp modal khi cuộn xuống đáy: /Users/tan/Desktop/live_modal_scrolled_to_bottom.png');

  // 5. Bấm nút THÊM VÀO GIỎ HÀNG cố định ở đáy
  const fixedBtn = page.locator('.modal-fixed-action-bar button');
  await fixedBtn.click();
  await page.waitForTimeout(600);

  // 6. Điều hướng vào giỏ hàng
  await page.goto('http://localhost:3000/cart', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/Users/tan/Desktop/live_cart_after_fixed_btn.png' });
  console.log('📸 Đã chụp trang giỏ hàng: /Users/tan/Desktop/live_cart_after_fixed_btn.png');

  await browser.close();
  console.log('🎉 Kiểm thử hoàn tất thành công 100%!');
}

testModalLive().catch(err => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
