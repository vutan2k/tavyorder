import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('Kiểm Định Tính Toàn Vẹn Giao Diện Mobile & Desktop (2 Cột, Ribbon Ngang, Zero Hangul)', () => {
  const cssPath = path.join(PROJECT_ROOT, 'src/index.css');
  const catalogPath = path.join(PROJECT_ROOT, 'public/data/playwright_scraped_products.json');
  const chatWidgetPath = path.join(PROJECT_ROOT, 'src/components/ChatWidget/ChatWidget.jsx');

  it('Lưới sản phẩm trên mobile phải dùng 2 cột (repeat(2, 1fr)) để rộng rãi, chống bấm nhầm', () => {
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.match(css, /grid-template-columns:\s*repeat\(2,\s*1fr\)\s*!important/, 'Mobile grid phải là 2 cột');
  });

  it('Thanh danh mục trên mobile phải cuộn ngang 1 dòng (flex-wrap: nowrap, overflow-x: auto)', () => {
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.match(css, /flex-wrap:\s*nowrap\s*!important/, 'Category ribbon phải là nowrap');
    assert.match(css, /overflow-x:\s*auto\s*!important/, 'Category ribbon phải có overflow-x: auto');
  });

  it('Modal chi tiết sản phẩm phải hỗ trợ 2 cột dạng ngang trên Desktop (min-width: 768px)', () => {
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.match(css, /@media\s*\(min-width:\s*768px\)/, 'Phải có media query cho desktop >= 768px');
    assert.match(css, /grid-template-columns:\s*440px\s*1fr\s*!important/, 'Desktop modal phải chia 2 cột');
  });

  it('Widget nổi Zalo / Messenger trên mobile phải thu gọn (44px) né góc để không che khuất sản phẩm', () => {
    const widgetCode = fs.readFileSync(chatWidgetPath, 'utf8');
    assert.match(widgetCode, /isMobile\s*\?\s*'44px'\s*:\s*'58px'/, 'Mobile button size phải là 44px');
  });

  it('Toàn bộ 100 sản phẩm và tất cả phân loại hàng phải đạt chuẩn Zero Hangul (100% tiếng Việt)', () => {
    assert.ok(fs.existsSync(catalogPath), 'File catalog phải tồn tại');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const hangulRegex = /[\uac00-\ud7a3]/;

    let hangulBrandCount = 0;
    let hangulNameCount = 0;
    let hangulOptionCount = 0;

    for (const p of catalog) {
      if (hangulRegex.test(p.brand || '')) hangulBrandCount++;
      if (hangulRegex.test(p.name_vi || p.name || '')) hangulNameCount++;
      if (Array.isArray(p.options)) {
        for (const o of p.options) {
          if (hangulRegex.test(o.name_vi || '')) hangulOptionCount++;
        }
      }
    }

    assert.equal(hangulBrandCount, 0, 'Thương hiệu không được chứa tiếng Hàn');
    assert.equal(hangulNameCount, 0, 'Tên sản phẩm không được chứa tiếng Hàn');
    assert.equal(hangulOptionCount, 0, 'Tên phân loại hàng (options) không được chứa tiếng Hàn');
  });
});
