# PLAN: Tinh gọn Catalog 150 SKU + Chống trượt giá Live

> Trạng thái: **CHƯA THỰC THI** — chờ lệnh `ok tan`.
> Ngày chốt spec: 22/11/2026. Người chốt: A.Tân.

---

## PHẦN A — TINH GỌN CATALOG VỀ 150 SKU

### A1. Cơ cấu bắt buộc

| Nhóm | SL | Nguồn | Tiêu chí |
|---|---|---|---|
| Olive Young | 70 | `oliveyoung.co.kr` | Top BXH OY, viral TikTok/Threads, tỷ lệ hỏi mua cao |
| High-end | 50 | **Web hãng chính thức** | Sulwhasoo, WHOO, Hera, Su:m37, Dior, Chanel, Diptyque, Tamburins, Maison Margiela, Donginbi, Jung Saem Mool, Nonfiction… |
| Khác (đa dụng/niche) | 30 | OY / nội địa | Thực phẩm chức năng (collagen, men vi sinh), hair care, dụng cụ beauty (Fillimilli) |
| **Tổng** | **150** | | |

### A2. Loại bỏ
- Hiện trạng: **255 SKU** trong Firestore → cắt **~105 SKU**.
- Tiêu chí loại: SKU ngách ít ai hỏi, hàng hết trend/date cận, trùng lặp công dụng, biến thể khó order.

### A3. Nguyên tắc xử lý SKU thừa (ĐÃ CHỐT)
- **KHÔNG xóa cứng.** Set `status: "archived"` + `isActive: false`.
- "Cất một góc", ẩn hoàn toàn khỏi storefront, giữ nguyên schema để mở lại khi cần.
- Việc archive chạy trên snapshot trước, review danh sách, rồi mới apply production.

---

## PHẦN B — CƠ CHẾ CHỐNG TRƯỢT GIÁ (LIVE PRICE PROTECTION)

### B1. Chốt chặn 1 — Trang chi tiết sản phẩm (Gate 1)
- Khách bấm vào SP → gọi API/function cào **đúng SKU đó** từ nguồn Hàn (OY hoặc web hãng).
- Bóc giá KRW live + trạng thái sold out từng option.
- So sánh giá DB → nếu lệch thì cập nhật UI + ghi lại Firestore.

### B2. Chốt chặn 2 — Trước thanh toán (Gate 2)
- Trước khi tạo đơn / sinh mã QR PayOS: **batch verify toàn bộ SKU trong giỏ**.
- Phát hiện biến động giá hoặc sold out → chặn, báo khách xác nhận lại.
- Đây là chốt cuối, không có ngoại lệ.

### B3. Chính sách UX khi verify (ĐÃ CHỐT — phương án B)
- **Hiện spinner quay tròn ngay từ đầu**, KHÔNG hiển thị giá DB cũ.
- Chỉ mở nút đặt hàng khi đã có giá chính xác 100%.
- Nếu cào lỗi/timeout/WAF: **vẫn giữ spinner + disable nút**, mặc kệ người dùng đợi. Không fallback giá cũ, không cho đặt.

### B4. Sold out (ĐÃ CHỐT)
- Khóa nút đặt hàng ngay lập tức.
- **Không đặt trước, không nhận cọc, không back-order.**
- Option sold out bị disable riêng lẻ; toàn bộ SP sold out thì ẩn nút mua.

### B5. Xử lý lỗi cào
- Retry có backoff; nếu vẫn fail → giữ trạng thái loading/disabled + gắn cờ cảnh báo cho Admin.
- Không bao giờ hạ cấp xuống "cho đặt theo giá DB gần nhất".

---

## PHẦN C — HIỆN TRẠNG KỸ THUẬT ĐÃ KIỂM TRA

### C1. Link nguồn High-end — **THIẾU HOÀN TOÀN**
- Rà `public/data/all_products_catalog.json`: **0/80 SKU High-end có URL web hãng.**
- Dữ liệu hiện có: `goodsNo` (HE…), `brand`, `koreanTitle`, `foreignPrice`, `departmentStore`, `searchQuery`.
- **Việc phải làm:** với 50 SKU được giữ lại, tự tìm và gán `sourceUrl` trỏ đúng trang SP trên web hãng chính thức.
- Script liên quan: `scripts/highend_catalog_targets.py`, `scripts/generate_highend_catalog.py`, `scripts/sync_highend_to_firestore.js`.

### C2. Hạ tầng đã verify
- Vertex AI: project `project-33c91ab6-8768-4348-ac3` (TavyOrder), billing `01A87C-3C3210-210C43` (KRW, open), endpoint `aiplatform.googleapis.com` location `global`, traffic `ON_DEMAND`.
- 9Router: combo `tan` → `vx/gemini-3.8-flash`, chạy OK.
- Công cụ cào sẵn có: `scripts/jina_reader.py` (tầng 1, 0MB RAM), `scripts/crawler_runner.py` (Crawl4AI), `scripts/stealth_sync_deep.js`, `scripts/oliveYoungPriceSyncService.js`.
- Tỷ giá động: đọc `system_config/rates` (`krwRate`, `serviceFeePercent`). Công thức `round(KRW * krwRate * (1 + fee/100) / 1000) * 1000`. Cấm chốt cứng.

### C3. Codebase liên quan
- `src/pages/ProductDetailPage.jsx`, `src/components/ProductDetailModal.jsx` → Gate 1.
- `src/pages/CartPage.jsx`, `src/pages/CheckoutPage.jsx`, `src/pages/PaymentPage.jsx`, `src/services/paymentService.js` → Gate 2.
- `src/services/oliveYoungPriceSyncService.js`, `src/services/oliveYoungScraperCore.js` → scraper layer.

---

## PHẦN D — THỨ TỰ THỰC THI

1. **D1.** Dump Firestore → snapshot local, phân loại 255 SKU theo 3 nhóm, xuất danh sách 150 SKU đề xuất + 105 SKU archive. **Trình A.Tân duyệt trước khi ghi.**
2. **D2.** Resolve `sourceUrl` cho 50 SKU High-end (web hãng chính thức).
3. **D3.** Apply archive 105 SKU (`status: "archived"`, `isActive: false`).
4. **D4.** Build service live-price (OY + web hãng), trả giá KRW + sold out theo option.
5. **D5.** Gắn Gate 1 vào ProductDetail: spinner, disable CTA đến khi giá khớp.
6. **D6.** Gắn Gate 2 vào Checkout/Payment: batch verify, chặn nếu lệch/sold out.
7. **D7.** Test end-to-end: SP bình thường, SP tăng giá, SP sold out, scraper timeout.

---

## PHẦN E — RÀNG BUỘC BẤT DI BẤT DỊCH

- Mọi mutation Firestore production phải có lệnh `ok tan`.
- Không xóa cứng dữ liệu.
- Không cho đặt hàng khi giá chưa verify xong.
- Không bịa giá, không fallback giá cũ, không đặt trước hàng sold out.
- Tỷ giá luôn đọc động từ `system_config/rates`.

---

## PHẦN 0 — CHECKPOINT ĐƯỜNG LUI (ĐÃ TẠO 24/11/2026)

- **Code:** tag + branch `checkpoint/pre-upgrade-20261124` @ `d70128b`, đã push origin.
- **Worktree WIP (kể cả file untracked):** `~/tavy-korea-backups/20261124_pre_upgrade/code_worktree.tar.gz` (63 MB, 1026 file).
- **Firestore:** export `gs://tavyorder-firestore-backups-us/checkpoint-20261124` (DB `nam5`, bucket `US`; bucket `asia-northeast3` không hợp lệ với DB này).
- **Back 1 lệnh:** `scripts/rollback.sh --check | code | data | all`
  - `code`: stash thay đổi tracked → checkout đúng tag.
  - `data`: `gcloud firestore import` từ export trên.
- Đã verify: tag checkout ra worktree sạch, export metadata tồn tại. Import thật chưa chạy (chỉ chạy khi cần).
