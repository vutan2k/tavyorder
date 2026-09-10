import { chromium, devices } from 'playwright';

const iPhone14 = devices['iPhone 14 Pro'];

async function runLiveShow() {
  console.log('🚀 Đang mở cửa sổ Chrome thật trên màn hình Mac để A. Tân theo dõi...');
  
  // 1. Mở cửa sổ Mobile thật (iPhone 14 Pro)
  const browser = await chromium.launch({
    headless: false, // CỬA SỔ THẬT TRÊN MÀN HÌNH
    slowMo: 400,     // Chạy chậm để quan sát trực quan
    args: [
      '--window-size=430,920',
      '--window-position=860,40' // Nằm góc phải màn hình
    ]
  });

  const context = await browser.newContext({
    ...iPhone14,
    locale: 'vi-VN'
  });

  const page = await context.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('❌ [CONSOLE ERROR]:', msg.text());
  });
  page.on('pageerror', err => console.error('💥 [CRASH ERROR]:', err.message));

  console.log('🌐 Đang tải trang chủ...');
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.product-card', { timeout: 10000 });
  await page.waitForTimeout(1500);

  // 1. Lướt thanh danh mục ngang
  console.log('👆 Đang lướt thanh danh mục ngang...');
  const ribbon = await page.$('.category-filter-ribbon');
  if (ribbon) {
    await ribbon.evaluate(el => el.scrollBy({ left: 350, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
    await ribbon.evaluate(el => el.scrollBy({ left: -350, behavior: 'smooth' }));
    await page.waitForTimeout(800);
  }

  // 2. Cuộn xem lưới sản phẩm 2 cột
  console.log('📱 Đang cuộn xem lưới sản phẩm 2 cột rộng rãi...');
  await page.evaluate(() => window.scrollBy({ top: 500, behavior: 'smooth' }));
  await page.waitForTimeout(1500);

  // Chụp ảnh thẻ sản phẩm 2 cột
  await page.screenshot({ path: '/Users/tan/Desktop/live_mobile_2col_grid.png' });
  console.log('📸 Đã chụp màn hình lưới 2 cột: /Users/tan/Desktop/live_mobile_2col_grid.png');

  // 3. Mở Modal chi tiết sản phẩm Top 1 Mediheal
  console.log('🔍 Đang bấm mở Modal chi tiết sản phẩm Top 1...');
  await page.click('.product-card-title');
  await page.waitForTimeout(1500);

  // Chụp ảnh Modal trên mobile
  await page.screenshot({ path: '/Users/tan/Desktop/live_mobile_modal_translated.png' });
  console.log('📸 Đã chụp màn hình Modal đã dịch 100% tiếng Việt: /Users/tan/Desktop/live_mobile_modal_translated.png');

  // 4. Bấm chọn phân loại Rose PDRN
  console.log('✨ Đang chọn phân loại Rose PDRN...');
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const txt = await b.innerText();
    if (txt.includes('Rose PDRN')) {
      await b.click();
      await page.waitForTimeout(800);
      break;
    }
  }

  // 5. Bấm nút THÊM VÀO GIỎ HÀNG trên thanh sticky
  console.log('🛒 Đang bấm THÊM VÀO GIỎ HÀNG...');
  const addBtn = page.locator('button:has-text("THÊM VÀO GIỎ HÀNG")');
  await addBtn.click();
  await page.waitForTimeout(1000);

  // 6. Mở lại Modal và chọn phân loại Collagen
  console.log('🔍 Mở lại Modal để thêm phân loại Collagen...');
  await page.click('.product-card-title');
  await page.waitForTimeout(1200);

  const buttons2 = await page.$$('button');
  for (const b of buttons2) {
    const txt = await b.innerText();
    if (txt.includes('Collagen')) {
      await b.click();
      await page.waitForTimeout(800);
      break;
    }
  }

  console.log('🛒 Đang bấm THÊM VÀO GIỎ HÀNG cho Collagen...');
  const addBtn2 = page.locator('button:has-text("THÊM VÀO GIỎ HÀNG")');
  await addBtn2.click();
  await page.waitForTimeout(1000);

  // 7. Chuyển sang trang Giỏ Hàng
  console.log('📦 Đang chuyển sang trang Giỏ Hàng /cart...');
  await page.goto('http://localhost:3000/cart', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: '/Users/tan/Desktop/live_mobile_cart_verified.png' });
  console.log('📸 Đã chụp màn hình Giỏ Hàng: /Users/tan/Desktop/live_mobile_cart_verified.png');

  await browser.close();
  console.log('🎉 Hoàn tất kịch bản kiểm thử trực quan trên điện thoại!');
}

runLiveShow().catch(err => {
  console.error('Lỗi kịch bản:', err);
  process.exit(1);
});
