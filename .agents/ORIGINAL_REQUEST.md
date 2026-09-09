# Original User Request

## 2026-09-08T13:48:25Z

# Teamwork Project Prompt — Final Draft

> Status: Launched
> Goal: Xây dựng tab Dữ Liệu Khách Hàng (Users) trong Admin Dashboard của TAVY Korea
> Requested team: Small, focused team

Xây dựng Tab "Khách Hàng (Users)" trong trang Quản Trị Admin (`AdminDashboardPage`) của TAVY Korea, hiển thị danh sách khách hàng dạng bảng chuyên nghiệp với các trường: STT, Email/Gmail, Số điện thoại, Địa chỉ nhận hàng, Lịch sử/Số lượng đơn hàng, kèm tính năng Chỉnh sửa thông tin và Xoá người dùng triệt để.

This is a single self-contained fix; keep it small and focused.

Working directory: /Users/tan/Downloads/tavy
Integrity mode: development

## Requirements

### R1. Tab "Khách Hàng" trên Sidebar Quản Trị Admin
- Bổ sung tab mới `users` ("Khách Hàng") vào thanh Sidebar Admin (`AdminDashboardPage.jsx`) với biểu tượng `Users` từ `lucide-react`.
- Hiển thị huy hiệu (badge) đếm tổng số lượng khách hàng thực tế trong hệ thống.
- Bố cục giao diện theo phong cách Luxury Ivory & Slate, hỗ trợ thanh tìm kiếm nhanh theo Tên, Số điện thoại, Email hoặc Địa chỉ.

### R2. Nguồn dữ liệu khách hàng toàn diện (Comprehensive User Aggregation)
- Tổng hợp dữ liệu từ 2 nguồn:
  1. Collection `users` trên Cloud Firestore (các tài khoản đăng nhập thành viên qua Google hoặc Email).
  2. Collection `orders` trên Cloud Firestore (các khách hàng đã từng đặt đơn hàng, gom nhóm thông minh theo Số điện thoại hoặc Email).
- Đảm bảo 100% khách hàng từng tương tác hoặc mua sắm đều được hiển thị đầy đủ, không trùng lặp.

### R3. Bảng dữ liệu khách hàng chi tiết
- **STT**: Đánh số thứ tự từ 1 đến N.
- **Khách hàng**: Tên hiển thị + Avatar viết tắt chữ cái đầu sang trọng.
- **Gmail / Email**: Địa chỉ email của khách (hoặc nhãn "Chưa có" nếu đặt đơn chỉ bằng SĐT).
- **Số điện thoại**: SĐT định dạng chuẩn 10 số Việt Nam.
- **Địa chỉ**: Địa chỉ giao hàng mặc định hoặc địa chỉ từ đơn hàng gần nhất.
- **Đơn hàng**: Hiển thị số lượng đơn + tổng chi tiêu (ví dụ: `3 đơn • 1.250.000đ`). Khi nhấp vào, mở Popup xem chi tiết các đơn hàng của khách đó (mã đơn, ngày tạo, tổng tiền, trạng thái, danh sách sản phẩm).
- **Thao tác**: Cung cấp 2 nút hành động:
  - Nút **Chỉnh sửa** (mở Modal cập nhật thông tin).
  - Nút **Xoá** (kèm hộp thoại xác nhận bảo mật).

### R4. Tính năng Chỉnh sửa thông tin khách hàng (Edit User)
- Modal chỉnh sửa cho phép Admin cập nhật: Tên khách hàng, Gmail/Email, Số điện thoại, Địa chỉ nhận hàng.
- Khi bấm Lưu:
  - Cập nhật trực tiếp vào Firestore collection `users`.
  - Tự động đồng bộ thông tin liên hệ mới trên các đơn hàng của khách hàng này trong Firestore và bộ nhớ ứng dụng.
  - Hiển thị Toast thông báo thành công.

### R5. Tính năng Xoá người dùng triệt để (Delete User & Associated Orders)
- Khi bấm nút Xoá, hiển thị hộp thoại xác nhận bảo mật: *"Bạn có chắc chắn muốn xoá người dùng này cùng TOÀN BỘ các đơn hàng liên quan? Thao tác này không thể hoàn tác."*
- Khi Admin xác nhận:
  - Xoá hồ sơ người dùng khỏi Firestore collection `users`.
  - Xoá triệt để tất cả các đơn hàng thuộc về khách hàng này (theo email và SĐT) khỏi collection `orders`.
  - Cập nhật giao diện và huy hiệu đếm tức thì, hiển thị Toast xác nhận.

### R6. Kiểm định chất lượng & Triển khai trực tiếp (Live Verification)
- Bộ kiểm thử 303/303 test cases PASS 100% (`npm test`).
- Bộ kiểm tra Agent Constitution 29/29 PASS 100% (`npm run test:agents`).
- Bản đóng gói Vite production đạt ZERO lỗi (`npm run build`).
- Triển khai trực tiếp lên máy chủ Firebase Hosting (`https://tavyorder.web.app`).

## Acceptance Criteria

- [ ] Tab "Khách Hàng" hiển thị mượt mà trên Sidebar Admin với icon `Users` và badge số lượng chính xác.
- [ ] Bảng dữ liệu hiển thị chuẩn 7 cột: STT, Khách hàng, Gmail, Số điện thoại, Địa chỉ, Đơn hàng, Thao tác.
- [ ] Dữ liệu khách hàng được tổng hợp đầy đủ từ cả `users` và `orders`.
- [ ] Cột Đơn hàng hiển thị đúng số lượng đơn + tổng chi tiêu; nhấp vào mở Popup xem chi tiết lịch sử đơn hàng.
- [ ] Modal Chỉnh sửa cho phép sửa Tên, SĐT, Email, Địa chỉ và cập nhật đồng bộ lên Firestore.
- [ ] Nút Xoá có hộp thoại xác nhận và xoá triệt để hồ sơ người dùng lẫn các đơn hàng liên quan.
- [ ] Toàn bộ 303 test cases PASS 100% và build thành công không lỗi.
- [ ] Triển khai trực tiếp lên `https://tavyorder.web.app`.

## 2026-09-09T12:52:29Z

Use the full team of agents: Security Auditor, Fullstack Developer, Firebase Specialist, and QC Gatekeeper.

Build a robust, multi-layer security defense system protecting both the customer-facing web application and the admin management portal for TAVY Korea against common cyber attacks (brute-force password guessing, F12 console/session tampering, cross-site scripting (XSS), bot order flooding/spam, unauthorized database manipulation, and clickjacking/MIME-sniffing).

Working directory: /Users/tan/Downloads/tavy
Integrity mode: development

## Requirements

### R1. Admin Portal Authentication Hardening & Brute-Force Defense
The admin login flow must defend against credential brute-forcing by tracking failed login attempts and enforcing a 15-minute temporary lockout with a live countdown after 5 consecutive failures, with progressive cooldown extensions (30m, 1h) on continued abuse. Admin authorization must not rely on raw forgeable boolean flags in localStorage; it must use a cryptographically signed/hashed session token with an inactivity timeout that automatically revokes admin access.

### R2. User Web Protection Against XSS & Bot Order Flooding
All user-facing input entry points (customer name, 10-digit Vietnamese phone number, address fields, notes, and Korean product URLs) must be sanitized and HTML-entity encoded before storage and display to neutralize Stored and Reflected XSS vectors. The checkout and order placement process must incorporate an invisible honeypot trap and client rate limiting (maximum 3 new orders per 5 minutes per client session) that silently rejects or throttles automated bot flooding while keeping real customer UX completely frictionless.

### R3. HTTP Security Headers Parity Across Environments
The web hosting configurations for both Vercel (`vercel.json`) and Firebase Hosting (`firebase.json`) must be fortified with strict HTTP security headers: Content-Security-Policy (CSP) tailored for Vite, Firebase, and PayOS integrations; X-Frame-Options set to DENY to prevent clickjacking; X-Content-Type-Options set to nosniff; Strict-Transport-Security (HSTS); and modern Referrer and Permissions policies.

### R4. Cloud Firestore Security Rules Lockdown
The Firestore security rules (`firestore.rules`) must eliminate open read/write access (`allow read, write: if true;`) on the orders collection. The rules must strictly allow guest/customer order creation only with valid, schema-conforming payloads, allow order reading only via matching order identity or phone/uid criteria, and strictly restrict order status updates and deletions to authenticated administrators.

### R5. Zero Regression & Automated Security Verification Suite
The entire existing test suite of 303 automated tests across all 4 tiers must continue to pass with 100% success (`npm test` exit code 0), Vite production build must complete with zero errors (`npm run build`), and a dedicated automated security verification suite (`tests/security_defense.test.js`) must be established to programmatically prove each security defense requirement.

## Acceptance Criteria

### Admin Security Guardrails
- [ ] 5 consecutive invalid admin password attempts trigger an active lockout state lasting at least 900 seconds (15 minutes).
- [ ] During the lockout period, further login submissions are blocked immediately without querying the backend or leaking sensitive credentials.
- [ ] Admin authentication state cannot be achieved by manually executing `localStorage.setItem('admin_auth', 'true')` in the browser console.
- [ ] Inactivity exceeding 60 minutes automatically clears the admin session and redirects to the login screen.

### Input Sanitization & Anti-Bot Defense
- [ ] Input strings containing script tags (e.g., `<script>alert(1)</script>`), javascript pseudo-protocols, or dangerous HTML event handlers are safely sanitized/escaped across all checkout fields.
- [ ] Submitting a non-empty value in the invisible honeypot field prevents order creation and returns an innocuous rejection.
- [ ] Exceeding the order placement threshold (more than 3 orders within 5 minutes) triggers a temporary rate-limit delay notice without breaking normal checkout flow.

### Infrastructure & Header Hardening
- [ ] `vercel.json` contains `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, and a valid `Content-Security-Policy`.
- [ ] `firebase.json` headers section mirrors all security headers defined in `vercel.json` to guarantee hosting parity.

### Firestore Rules & Integrity Gate
- [ ] `firestore.rules` does not contain `allow read, write: if true;` on the `orders` match block.
- [ ] Unauthenticated client writes attempting to alter order status fields (e.g. changing status to 'paid') are rejected by rules logic.
- [ ] `npm test` executes all 303 existing tests plus the new security defense tests with 100% PASS (Exit code 0).
- [ ] `npm run build` completes successfully with zero bundle errors.
- [ ] `npm run test:agents` confirms all constitution and agent integrity checks pass.
