import fs from 'fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MEDIHEAL_INFO_PATH = '/Users/tan/Desktop/oliveyoung_ranking/top_1_메디힐_A000000223414/info.json';

describe('Kiểm định Cấu trúc Thông tin Sản phẩm Mẫu (Mặt nạ Mediheal Top 1)', () => {
  it('File info.json phải tồn tại và có thể parse JSON', () => {
    assert.ok(fs.existsSync(MEDIHEAL_INFO_PATH), 'File info.json phải tồn tại');
    const content = fs.readFileSync(MEDIHEAL_INFO_PATH, 'utf8');
    assert.doesNotThrow(() => JSON.parse(content));
  });

  it('Sản phẩm phải có đầy đủ tên tiếng Việt, thương hiệu, trạng thái và thông tin cơ bản', () => {
    const data = JSON.parse(fs.readFileSync(MEDIHEAL_INFO_PATH, 'utf8'));
    assert.ok(data.name_vi && data.name_vi.includes('Mediheal'), 'Tên tiếng Việt phải chuẩn xác');
    assert.equal(data.brand, '메디힐');
    assert.equal(data.product_status, 'active');
    assert.equal(data.in_stock, true);

    // Thông tin cơ bản
    assert.ok(data.basic_info, 'Phải có trường basic_info');
    assert.ok(data.basic_info.origin, 'Phải có xuất xứ');
    assert.ok(data.basic_info.packaging, 'Phải có quy cách đóng gói');
    assert.ok(data.basic_info.skin_type, 'Phải có loại da phù hợp');
    assert.ok(data.basic_info.core_benefits, 'Phải có công dụng cốt lõi');
    assert.ok(data.basic_info.usage, 'Phải có hướng dẫn sử dụng');
  });

  it('Phải có chính xác 7 phân loại (options) với đầy đủ giá bán và % giảm giá', () => {
    const data = JSON.parse(fs.readFileSync(MEDIHEAL_INFO_PATH, 'utf8'));
    assert.ok(Array.isArray(data.options), 'Trường options phải là mảng');
    assert.equal(data.options.length, 7, 'Mặt nạ Mediheal phải có 7 options');

    data.options.forEach((opt, idx) => {
      assert.ok(opt.id, `Option #${idx + 1} phải có id`);
      assert.ok(opt.name_kr, `Option #${idx + 1} phải có tên tiếng Hàn`);
      assert.ok(opt.name_vi, `Option #${idx + 1} phải có tên tiếng Việt`);
      assert.equal(typeof opt.price_krw, 'number', `Option #${idx + 1} giá KRW phải là số`);
      assert.equal(typeof opt.price_vnd, 'number', `Option #${idx + 1} giá VND phải là số`);
      assert.ok(opt.price_krw > 0, `Option #${idx + 1} giá KRW phải > 0`);
      assert.ok(opt.price_vnd > 0, `Option #${idx + 1} giá VND phải > 0`);
      assert.ok(opt.discount_rate, `Option #${idx + 1} phải có % giảm giá`);
      assert.equal(typeof opt.is_sold_out, 'boolean', `Option #${idx + 1} phải có trạng thái is_sold_out`);
    });
  });

  it('Phải có 1 ảnh đại diện chính và đúng 8 ảnh review HD thật trên ổ cứng', () => {
    const data = JSON.parse(fs.readFileSync(MEDIHEAL_INFO_PATH, 'utf8'));
    assert.ok(data.local_main_thumbnail && fs.existsSync(data.local_main_thumbnail), 'Ảnh đại diện chính phải tồn tại');
    assert.ok(Array.isArray(data.local_user_reviews), 'local_user_reviews phải là mảng');
    assert.equal(data.local_user_reviews.length, 8, 'Phải có đủ 8 ảnh review');

    data.local_user_reviews.forEach((filePath, idx) => {
      assert.ok(fs.existsSync(filePath), `File ảnh review #${idx + 1} phải tồn tại: ${filePath}`);
      const stats = fs.statSync(filePath);
      assert.ok(stats.size > 10000, `File ảnh review #${idx + 1} phải là file ảnh thật (>10KB)`);
    });
  });
});
