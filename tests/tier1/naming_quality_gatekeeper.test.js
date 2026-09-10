import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

describe('Tier 1: Naming Quality Gatekeeper Unit Test', () => {
  it('QC Gatekeeper phải từ chối các tên generic bị cấm', () => {
    const pythonCheck = `
import sys
sys.path.append("/Users/tan/Desktop/oliveyoung_ranking")
from product_qc_gatekeeper import validate_product_name_and_brand

bad_cases = [
    ("Mỹ phẩm Clio NEW", "Clio"),
    ("Mỹ phẩm 1+1", "Etude"),
    ("Mỹ phẩm", "Aromatica"),
    ("Tinh chất Serum", "Korea Beauty"),
    ("Bảng phấn mắt", "Clio"), # Quá ngắn < 20
    ("Bảng Phấn Mắt 12 Màu Đa Năng Clio Pro Eye Palette Air", "Korea Beauty") # Brand cấm
]

for name, brand in bad_cases:
    errs = validate_product_name_and_brand(name, brand)
    assert len(errs) > 0, f"Phải bắt lỗi case: {name}, {brand}"
print("PASS_BAD_CASES")
`;
    const res = execSync(`python3 -c '${pythonCheck}'`).toString().trim();
    assert.ok(res.includes('PASS_BAD_CASES'));
  });

  it('QC Gatekeeper phải phê duyệt các tên chuẩn E-Commerce 5 thành phần', () => {
    const pythonCheck = `
import sys
sys.path.append("/Users/tan/Desktop/oliveyoung_ranking")
from product_qc_gatekeeper import validate_product_name_and_brand

good_cases = [
    ("Bảng Phấn Mắt 12 Màu Đa Năng Clio Pro Eye Palette Air (Tặng Kèm Phấn Mắt Đơn)", "Clio"),
    ("Má Hồng Dạng Kem Lì Mịn Tự Nhiên Lâu Trôi Lilybyred Luv Beam Cheek Balm (20 Tông Màu)", "Lilybyred"),
    ("Chuốt Mi Siêu Cong Và Định Hình Giữ Nếp Etude Curl Fix Mascara (Set Mua 1 Tặng 1)", "Etude"),
    ("Xịt Khóa Nền Cố Định Lớp Trang Điểm So Natural All Day Tight Setting Fixer (Set Đôi 120ml + 120ml)", "So Natural")
]

for name, brand in good_cases:
    errs = validate_product_name_and_brand(name, brand)
    assert len(errs) == 0, f"Không được bắt lỗi case chuẩn: {name}, {brand}, lỗi: {errs}"
print("PASS_GOOD_CASES")
`;
    const res = execSync(`python3 -c '${pythonCheck}'`).toString().trim();
    assert.ok(res.includes('PASS_GOOD_CASES'));
  });
});
