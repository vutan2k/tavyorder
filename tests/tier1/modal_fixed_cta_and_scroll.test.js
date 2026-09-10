import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('Tier 1: Modal Fixed Bottom Bar & Scrollable Area & Vietnamese Subtitles', () => {
  it('src/index.css phải định nghĩa .modal-scroll-area với overflow-y: auto và touch scrolling', () => {
    const cssPath = path.join(PROJECT_ROOT, 'src/index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('.modal-scroll-area'), 'Phải có class .modal-scroll-area');
    assert.ok(cssContent.includes('overflow-y: auto'), 'Phải có overflow-y: auto cho .modal-scroll-area');
    assert.ok(cssContent.includes('-webkit-overflow-scrolling: touch'), 'Phải có touch scrolling cho mobile');
  });

  it('src/index.css phải định nghĩa .modal-fixed-action-bar với flex-shrink: 0', () => {
    const cssPath = path.join(PROJECT_ROOT, 'src/index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('.modal-fixed-action-bar'), 'Phải có class .modal-fixed-action-bar');
    assert.ok(cssContent.includes('flex-shrink: 0'), 'Thanh đáy phải có flex-shrink: 0 để không bị co ép');
  });

  it('ProductDetailModal.jsx phải phân tầng thành modal-scroll-area và modal-fixed-action-bar', () => {
    const modalPath = path.join(PROJECT_ROOT, 'src/components/ProductDetailModal.jsx');
    const modalContent = fs.readFileSync(modalPath, 'utf8');

    assert.ok(modalContent.includes('className="modal-scroll-area"'), 'Phải bọc nội dung trong modal-scroll-area');
    assert.ok(modalContent.includes('className="modal-fixed-action-bar"'), 'Nút CTA phải nằm trong modal-fixed-action-bar');
    assert.ok(!modalContent.includes('{opt.name_kr}'), 'Không được in opt.name_kr tiếng Hàn ra giao diện');
    assert.ok(modalContent.includes('opt.subtitle_vi'), 'Phải in opt.subtitle_vi tiếng Việt ra dòng chữ nhỏ');
  });

  it('100% options trong catalog phải có subtitle_vi tiếng Việt, không chứa ký tự Hangul', () => {
    const catalogPath = path.join(PROJECT_ROOT, 'public/data/playwright_scraped_products.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const hangulRegex = /[\uac00-\ud7a3]/;

    let checkedCount = 0;
    for (const product of catalog) {
      if (Array.isArray(product.options)) {
        for (const opt of product.options) {
          checkedCount++;
          assert.ok(opt.subtitle_vi, `Option "${opt.name_vi}" phải có subtitle_vi`);
          assert.ok(!hangulRegex.test(opt.subtitle_vi), `subtitle_vi "${opt.subtitle_vi}" không được chứa Hangul`);
        }
      }
    }
    assert.ok(checkedCount >= 600, `Phải kiểm tra đủ >600 options (thực tế: ${checkedCount})`);
  });
});
