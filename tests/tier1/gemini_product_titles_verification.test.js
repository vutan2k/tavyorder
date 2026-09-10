import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('Tier 1: Gemini Product Titles Verification & E-Commerce Standard Rule', () => {
  it('File quy chuẩn .agents/rules/ecommerce-product-naming-standard.md phải tồn tại', () => {
    const rulePath = path.join(PROJECT_ROOT, '.agents/rules/ecommerce-product-naming-standard.md');
    assert.ok(fs.existsSync(rulePath), 'Phải có file quy chuẩn đặt tên');
    const content = fs.readFileSync(rulePath, 'utf8');
    assert.ok(content.includes('5 Thành Phần'), 'Phải có quy chuẩn 5 thành phần');
    assert.ok(content.includes('Zero Tolerance'), 'Phải có quy định cấm tên generic');
  });

  it('100/100 sản phẩm không được có tên bắt đầu bằng "Mỹ phẩm" hay chứa tên generic', () => {
    const catalogPath = path.join(PROJECT_ROOT, 'public/data/playwright_scraped_products.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    assert.equal(catalog.length, 100, 'Catalog phải có đúng 100 sản phẩm');

    for (const p of catalog) {
      const name = (p.name || '').trim();
      assert.ok(!/^(mỹ phẩm|sản phẩm|hàng hàn)/i.test(name), `SP #${p.rank} (${p.goodsNo}) không được bắt đầu bằng generic: "${name}"`);
      assert.ok(name.length >= 20, `SP #${p.rank} (${p.goodsNo}) tên phải >= 20 ký tự (thực tế: ${name.length}): "${name}"`);
    }
  });

  it('100/100 sản phẩm không được mang thương hiệu tạm "Korea Beauty"', () => {
    const catalogPath = path.join(PROJECT_ROOT, 'public/data/playwright_scraped_products.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    for (const p of catalog) {
      const brand = (p.brand || '').toLowerCase().trim();
      assert.notEqual(brand, 'korea beauty', `SP #${p.rank} (${p.goodsNo}) không được có brand Korea Beauty`);
      assert.notEqual(brand, 'unknown', `SP #${p.rank} (${p.goodsNo}) không được có brand unknown`);
      assert.ok(brand.length >= 2, `Brand phải hợp lệ: "${p.brand}"`);
    }
  });

  it('Các sản phẩm trang điểm tiêu biểu phải có danh từ loại sản phẩm chính xác', () => {
    const catalogPath = path.join(PROJECT_ROOT, 'public/data/playwright_scraped_products.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    const findBySKU = (sku) => catalog.find(p => (p.goodsNo || p.id) === sku);

    // Clio Bảng mắt A000000188988
    const clioPalette = findBySKU('A000000188988');
    assert.ok(clioPalette, 'Phải có Clio bảng mắt');
    assert.ok(clioPalette.name.toLowerCase().includes('phấn mắt'), `Clio phải có 'phấn mắt': "${clioPalette.name}"`);

    // WakeMake Bảng mắt A000000180532
    const wakemakePalette = findBySKU('A000000180532');
    assert.ok(wakemakePalette, 'Phải có WakeMake bảng mắt');
    assert.ok(wakemakePalette.name.toLowerCase().includes('phấn mắt'), `WakeMake phải có 'phấn mắt': "${wakemakePalette.name}"`);

    // Lilybyred Má hồng A000000137964
    const lilybyred = findBySKU('A000000137964');
    assert.ok(lilybyred, 'Phải có Lilybyred má hồng');
    assert.ok(lilybyred.name.toLowerCase().includes('má hồng'), `Lilybyred phải có 'má hồng': "${lilybyred.name}"`);

    // Etude Mascara A000000203943
    const etude = findBySKU('A000000203943');
    assert.ok(etude, 'Phải có Etude chuốt mi');
    assert.ok(etude.name.toLowerCase().includes('chuốt mi') || etude.name.toLowerCase().includes('mascara'), `Etude phải có 'chuốt mi/mascara': "${etude.name}"`);

    // So Natural Xịt khóa nền A000000162114
    const soNatural = findBySKU('A000000162114');
    assert.ok(soNatural, 'Phải có So Natural xịt khóa nền');
    assert.ok(soNatural.name.toLowerCase().includes('khóa nền') || soNatural.name.toLowerCase().includes('cố định'), `So Natural phải có 'khóa nền': "${soNatural.name}"`);
  });
});
