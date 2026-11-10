# BÁO CÁO TOÀN DIỆN KIỂM TOÁN HỆ THỐNG & CODEBASE TAVY KOREA
*Thực hiện bởi: Cố vấn Trưởng tansupo (Model: ag/gemini-4-argon-medium)*  
*Thời gian: 10/11/2026*

---

## 1. TỔNG QUAN TÌNH TRẠNG HỆ THỐNG
Sau 4 vòng rà soát độc lập ở cấp độ cao nhất (Hardcore & Binary State Audit), toàn bộ hệ sinh thái Tavy Korea (Web Client, Admin Dashboard, Cloud Functions, Firestore Rules, Daemon Giám Sát, Bot Cào Dữ Liệu) đã được bóc tách chi tiết.

- **Điểm bảo mật & kiến trúc ban đầu:** `1.5 / 10` (Báo động đỏ về thất thoát tài chính và rò rỉ dữ liệu).
- **Nguyên tắc khắc phục:** Tước bỏ toàn bộ quyền can thiệp giá và dữ liệu từ khách hàng bên ngoài, đồng thời giữ vững và mở rộng quyền lực tối cao cho Web Admin (`isAdmin()`).

---

## 2. BẢNG PHONG THẦN CÁC LỖ HỔNG CHÍ MẠNG (TỪ PHASE 1 ĐẾN PHASE 4)

### NHÓM P0: NGUY HIỂM CHẾT NGƯỜI (TIỀN BẠC & DỮ LIỆU)
1. **Lỗ hổng gian lận thanh toán 2.000đ (PayOS Webhook & Create Payment Link):**
   - **Vị trí:** `functions/index.js` & `src/pages/PaymentPage.jsx`.
   - **Rủi ro:** Client gửi `amount` tùy ý lên API tạo link PayOS. Webhook PayOS khi nhận tiền cọc không hề đối chiếu số tiền thực chuyển với `totalVnd` trong Firestore. Khách đặt đơn 10 triệu có thể sửa thành 2.000đ, quét mã thật và đơn hàng vẫn tự động duyệt thành "ĐÃ CỌC".
   - **Xử lý:** Ép server tự đọc `totalVnd` từ Firestore; Webhook bắt buộc verify `amount >= totalVnd`.
2. **Lỗ hổng Remote Code Execution (RCE) qua máy Mac của Dev:**
   - **Vị trí:** `vite.config.js` (plugin `run-scraper-api`).
   - **Rủi ro:** Mở endpoint `POST /api/run-scraper` dùng `child_process.exec()` nối chuỗi và mở cổng `0.0.0.0` (`host: true`). Thiết bị cùng Wi-Fi hoặc web lạ có thể gửi request để chạy terminal trực tiếp trên máy Mac.
   - **Xử lý:** Đổi `host: '127.0.0.1'`, dùng `execFile` truyền tham số an toàn.
3. **Lộ toàn bộ đơn hàng của toàn hệ thống qua ô Tra Cứu (Mass Order Leak):**
   - **Vị trí:** `src/services/guestTrackingService.js`.
   - **Rủi ro:** Dùng `.includes()` cho phép tìm kiếm chuỗi con. Nhập 1 chữ cái ("o", "d") hoặc 4 số đầu nhà mạng ("0905", "0912") là hệ thống in ra sạch sẽ danh sách đơn hàng kèm tên, SĐT, địa chỉ, bill chuyển khoản của toàn bộ khách.
   - **Xử lý:** Xóa `.includes()`. Bắt buộc khớp chính xác 100% SĐT đủ 10 số hoặc toàn bộ mã đơn hàng.
4. **Mất đơn hàng âm thầm do lỗi Daemon giám sát (PID 6094):**
   - **Vị trí:** `scripts/order_watcher_daemon.js`.
   - **Rủi ro:**
     - Khi daemon khởi động lại (`isFirstLoad`), ép toàn bộ đơn vào `seenOrders` mà không check, làm mất trắng thông báo của các đơn khách đặt lúc daemon đang tắt/sleep.
     - Đánh dấu đã xem TRƯỚC khi gửi Telegram thành công; mạng lag là mất đơn vĩnh viễn.
     - Không escape HTML (`parse_mode: 'HTML'`), khách nhập tên hoặc địa chỉ có `<, >, &` là API Telegram báo lỗi và nuốt chửng đơn.
   - **Xử lý:** Thêm `escapeHtml`, chỉ ghi `.seen_orders.json` sau khi Telegram báo `200 OK`, xử lý đơn backlog khi restart.
5. **Ghi đè và xóa sổ đơn hàng do dùng SĐT làm Document ID:**
   - **Vị trí:** `src/pages/CartPage.jsx` (`id: cleanPhone`).
   - **Rủi ro:** Nếu 1 khách đặt 2 đơn trong cùng 1 ngày, đơn thứ 2 sẽ ghi đè và xóa sạch dữ liệu của đơn số 1 đã thanh toán trước đó.
   - **Xử lý:** Chuyển mã đơn thành dạng tự sinh duy nhất: `ORD-${Date.now()}-${random}`.

---

### NHÓM P1: BẢO MẬT HẠ TẦNG & RÒ RỈ SECRET
1. **Lộ bí mật hệ thống cứng trong mã nguồn (Hardcoded Secrets):**
   - Token Bot Telegram (`8887086946:AAG...`) trong `order_watcher_daemon.js` và `sync_audited_catalog_to_firestore.js`.
   - Mật khẩu Admin (`Vvtan2606@`, `admin123`) và tài khoản backdoor `tan123` trong `AppProvider.jsx`.
   - API Key OpenAI trong `playwright_ai_scraper.js`.
   - Lưu ngược `botToken` lên Firestore public `system_config/telegram_bot`.
   - **Xử lý:** Chuyển 100% vào `.env`, xóa sạch mật khẩu cứng và backdoor khỏi code.
2. **Lỗ hổng Firestore Security Rules (`firestore.rules`):**
   - Biểu thức `resource.id == orderId` luôn `true`, mở toang quyền đọc bảng `orders`.
   - Mở toang `allow read, write: if true` ở `pending_products` và `ai_manager_tasks`.
   - **Xử lý:** Khóa chặt dữ liệu nhạy cảm; cấp toàn quyền can thiệp tuyệt đối cho `isAdmin()`.
3. **Bom sập ứng dụng vì tải ảnh Base64 5MB lên Firestore Document:**
   - **Vị trí:** `src/pages/PaymentPage.jsx`.
   - **Rủi ro:** Firestore giới hạn cứng 1 MiB / document. Khách up ảnh bill chuyển khoản vượt trần gây crash cập nhật đơn và tràn RAM client.
   - **Xử lý:** Nén ảnh tại client hoặc chuyển sang Cloud Storage, chỉ lưu URL ảnh vào Firestore.

---

### NHÓM P2: LỆCH GIÁ BIẾN THỂ & TRẢI NGHIỆM SẢN PHẨM
1. **Bán hụt tiền phân loại đắt tiền (Variant Pricing Bug):**
   - **Vị trí:** `src/components/ProductDetailModal.jsx`.
   - **Rủi ro:** Khách chọn phân loại giá cao hơn, modal chỉ cập nhật giá Won mà không cập nhật lại `priceVnd`. Giỏ hàng ưu tiên đọc `item.priceVnd` nên khách vẫn mua đồ đắt tiền với giá của loại rẻ nhất.
   - **Xử lý:** Tính toán đồng bộ cả KRW và VND cho từng option khi chọn.
2. **Hàng hết phân loại nhưng khách vẫn bấm mua được:**
   - Lệch trường `isSoldOut` (camelCase) trong sync script với `is_sold_out` (snake_case) trong Modal.
   - **Xử lý:** Chuẩn hóa đồng nhất `Boolean(opt.isSoldOut || opt.is_sold_out)`.

---

## 3. THIẾT KẾ ĐẶC QUYỀN WEB ADMIN (QUYỀN SINH SÁT TỨC THÌ)
Sau khi khắc phục:
- Khách hàng vãng lai / User thường: Bị khóa chặt trong khuôn khổ quyền hạn an toàn.
- Tài khoản Admin (`admin@tavykorea.vn` / UID của Tân):
  - Nhận quyền `isAdmin() == true` trên toàn bộ Firestore Rules.
  - Sửa tỷ giá KRW và % Phí dịch vụ: Có hiệu lực tức thì trên toàn website.
  - Can thiệp, sửa đổi giá tiền, ghi chú, trạng thái của bất kỳ đơn hàng nào mà không bị bất kỳ rào cản nào chặn lại.
  - Xem và quản lý toàn bộ danh sách đơn hàng, thống kê, và sản phẩm cào duyệt.

---
*Báo cáo được lưu trữ chính thức tại `docs/SYSTEM_SECURITY_AUDIT_REPORT.md` để phục vụ bảo trì và nâng cấp.*
