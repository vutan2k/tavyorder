import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('Kiểm Định Tính Năng Phân Loại Hàng (Options) & Giá Sale Tối Giản Web User & Admin', () => {
  const catalogPath = path.join(PROJECT_ROOT, 'public/data/playwright_scraped_products.json');

  it('File fallback catalog phải có đúng 100 sản phẩm và chứa các sản phẩm có phân loại', () => {
    assert.ok(fs.existsSync(catalogPath), 'File catalog phải tồn tại');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    assert.equal(catalog.length, 100, 'Catalog phải có đúng 100 sản phẩm');

    const productsWithOptions = catalog.filter(p => Array.isArray(p.options) && p.options.length > 0);
    assert.ok(productsWithOptions.length >= 50, `Phải có ít nhất 50 sản phẩm có variants (thực tế: ${productsWithOptions.length})`);
    
    // Kiểm tra cấu trúc phân loại của sản phẩm đầu tiên có variants
    const sample = productsWithOptions[0];
    assert.ok(sample.options[0].name_vi, 'Option phải có name_vi');
    assert.ok(Number(sample.options[0].price_krw) > 0, 'Option phải có price_krw > 0');
  });

  it('Logic định danh giỏ hàng (getCartItemId) phải tách biệt các phân loại của cùng một SKU', () => {
    const getCartItemId = (item) => {
      if (!item) return '';
      if (item.cartItemId) return item.cartItemId;
      const baseId = item.goodsNo || item.id || '';
      const optId = item.selectedOption?.id || item.selectedOption?.name_kr || item.selectedOption?.name_vi;
      if (optId) return `${baseId}_${optId}`;
      return baseId;
    };

    const baseProduct = { goodsNo: 'A000000223414', name: 'Mặt nạ Mediheal', foreignPrice: 10000 };
    const opt1 = { id: 'opt_1', name_vi: 'Tràm Trà', price_krw: 10000 };
    const opt2 = { id: 'opt_2', name_vi: 'Madecassoside', price_krw: 12000 };

    const item1 = { ...baseProduct, selectedOption: opt1, cartItemId: getCartItemId({ ...baseProduct, selectedOption: opt1 }), qty: 1 };
    const item2 = { ...baseProduct, selectedOption: opt2, cartItemId: getCartItemId({ ...baseProduct, selectedOption: opt2 }), qty: 2 };

    assert.notEqual(item1.cartItemId, item2.cartItemId, '2 options khác nhau phải có cartItemId khác nhau');
    assert.equal(item1.cartItemId, 'A000000223414_opt_1');
    assert.equal(item2.cartItemId, 'A000000223414_opt_2');

    // Thao tác giỏ hàng mô phỏng
    let cart = [item1, item2];
    assert.equal(cart.length, 2, 'Giỏ hàng phải chứa 2 dòng độc lập');

    // Xóa item 1
    cart = cart.filter(it => it.cartItemId !== item1.cartItemId);
    assert.equal(cart.length, 1, 'Giỏ hàng còn lại 1 dòng sau khi xóa item 1');
    assert.equal(cart[0].cartItemId, item2.cartItemId, 'Dòng còn lại phải là item 2');
    assert.equal(cart[0].qty, 2, 'Số lượng của item 2 phải giữ nguyên 2');
  });

  it('Logic hiển thị giá sale tối giản: Badge sale & Giá gốc gạch ngang', () => {
    const productWithDiscount = {
      foreignPrice: 10000,
      originalPrice: 20000,
      discountRate: '50%'
    };

    const hasDiscount = Number(productWithDiscount.originalPrice) > Number(productWithDiscount.foreignPrice);
    assert.equal(hasDiscount, true, 'Phải nhận diện có giảm giá khi originalPrice > foreignPrice');

    const formatBadge = (rate) => {
      if (!rate) return null;
      return rate.startsWith('-') ? rate : `-${rate}`;
    };

    assert.equal(formatBadge(productWithDiscount.discountRate), '-50%');
    assert.equal(formatBadge('-30%'), '-30%');
  });

  it('File src/data/appVersion.js phải được nâng lên v2.2.0 trở lên', () => {
    const versionPath = path.join(PROJECT_ROOT, 'src/data/appVersion.js');
    const content = fs.readFileSync(versionPath, 'utf8');
    assert.ok(content.includes('v2.2.'), 'Phải là v2.2.x');
  });
});
