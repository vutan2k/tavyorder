import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Kiểm định Master Pipeline Đầy Đủ (Vision AI, Telemetry, SEO, QC, Rollback)', () => {
  it('Binary Apple Vision Framework phải nhận diện được khuôn mặt siêu tốc', () => {
    const binPath = '/Users/tan/Desktop/oliveyoung_ranking/vision_face_filter';
    assert.ok(fs.existsSync(binPath), 'Binary vision_face_filter phải tồn tại');
    
    const sampleImg = '/Users/tan/Desktop/oliveyoung_ranking/top_1_메디힐_A000000223414/main_thumbnail.png';
    const output = execSync(`"${binPath}" "${sampleImg}"`).toString().trim();
    assert.equal(output, 'FACES:0', 'Ảnh thumbnail không được chứa khuôn mặt người');
  });

  it('State Journal và Checkpoint phải ghi nhận đúng trạng thái sản phẩm', () => {
    const stateFile = '/Users/tan/Desktop/oliveyoung_ranking/harness_state_enrichment_v2.json';
    assert.ok(fs.existsSync(stateFile), 'File state checkpoint phải tồn tại');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.ok(state.products['A000000223414'], 'Top 1 Mediheal phải được ghi nhận');
    assert.equal(state.products['A000000223414'].status, 'QC_PASSED');
  });

  it('Telemetry Heartbeat phải ghi nhận tiến độ và nhịp tim hệ thống', () => {
    const telFile = '/Users/tan/Desktop/oliveyoung_ranking/enrichment_telemetry.json';
    assert.ok(fs.existsSync(telFile), 'File telemetry phải tồn tại');
    const tel = JSON.parse(fs.readFileSync(telFile, 'utf8'));
    assert.equal(typeof tel.total_products, 'number');
    assert.equal(typeof tel.completed_count, 'number');
    assert.ok(tel.system.vision_engine.includes('Apple Vision'));
  });

  it('Mô tả SEO phải đạt chuẩn 1 đoạn văn thẳng, ZERO tiếng Hàn và đúng số từ', () => {
    const top1Path = '/Users/tan/Desktop/oliveyoung_ranking/top_1_메디힐_A000000223414/info.json';
    const top1 = JSON.parse(fs.readFileSync(top1Path, 'utf8'));
    const desc = top1.description;

    assert.ok(desc, 'Phải có trường description');
    assert.equal(/[\uac00-\ud7a3]/.test(desc), false, 'Tuyệt đối không được chứa ký tự tiếng Hàn');
    assert.equal(desc.includes('\n'), false, 'Phải là một đoạn văn liền mạch');
    
    const words = desc.trim().split(/\s+/).length;
    assert.ok(words >= 50 && words <= 110, `Số từ phải từ 50-110 (hiện tại: ${words})`);
  });

  it('QC Gatekeeper phải phê duyệt 100% sản phẩm Top 1 Mediheal', () => {
    const qcScript = '/Users/tan/Desktop/oliveyoung_ranking/product_qc_gatekeeper.py';
    assert.ok(fs.existsSync(qcScript), 'File product_qc_gatekeeper.py phải tồn tại');
    
    const output = execSync(`cd /Users/tan/Desktop/oliveyoung_ranking && python3 -c "
import json
from product_qc_gatekeeper import verify_single_product
folder = '/Users/tan/Desktop/oliveyoung_ranking/top_1_메디힐_A000000223414'
data = json.load(open(f'{folder}/info.json'))
ok, rep = verify_single_product(data, folder)
print(rep['status'])
"`).toString().trim();
    assert.equal(output, 'QC_PASSED_100%');
  });

  it('Script đồng bộ Firestore sync_enriched_top100_to_firestore.js phải sẵn sàng', () => {
    const syncScript = '/Users/tan/tavy-korea/scripts/sync_enriched_top100_to_firestore.js';
    assert.ok(fs.existsSync(syncScript), 'Script đồng bộ Firestore phải tồn tại');
  });
});
