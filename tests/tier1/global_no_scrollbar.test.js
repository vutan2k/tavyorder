import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('Tier 1: Global No-Scrollbar Universal UI Cleanliness', () => {
  it('src/index.css phải định nghĩa scrollbar-width: none !important cho toàn bộ phần tử', () => {
    const cssPath = path.join(PROJECT_ROOT, 'src/index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('scrollbar-width: none !important'), 'Phải có scrollbar-width: none !important');
    assert.ok(cssContent.includes('-ms-overflow-style: none !important'), 'Phải có -ms-overflow-style: none !important');
  });

  it('src/index.css phải ẩn hoàn toàn thanh cuộn WebKit (*::-webkit-scrollbar)', () => {
    const cssPath = path.join(PROJECT_ROOT, 'src/index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('*::-webkit-scrollbar'), 'Phải có selector *::-webkit-scrollbar');
    assert.ok(cssContent.includes('display: none !important'), 'Phải có display: none !important');
    assert.ok(cssContent.includes('width: 0 !important'), 'Phải có width: 0 !important');
  });

  it('src/index.css phải cung cấp tiện ích .no-scrollbar độc lập', () => {
    const cssPath = path.join(PROJECT_ROOT, 'src/index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    assert.ok(cssContent.includes('.no-scrollbar'), 'Phải có class .no-scrollbar');
    assert.ok(cssContent.includes('.no-scrollbar::-webkit-scrollbar'), 'Phải có .no-scrollbar::-webkit-scrollbar');
  });
});
