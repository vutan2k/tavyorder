/**
 * Payment Service - TAVY Korea
 * Xử lý tạo mã VietQR chuẩn NAPAS 24/7 và tích hợp cổng thanh toán PayOS
 */

// Cấu hình tài khoản ngân hàng mặc định
export const DEFAULT_BANK_ACCOUNTS = {
  VN: {
    bankId: 'MBBANK',
    bankName: 'MB Bank (Quân Đội)',
    accountNumber: '1330042000',
    accountHolder: 'LE THI HA VY',
    currency: 'VND',
  },
  KR: {
    bankId: 'WOORI',
    bankName: '우라은행 (Woori Bank)',
    accountNumber: '1002959863658',
    accountHolder: 'VU VAN TAN',
    currency: 'KRW',
  },
};

/**
 * Sinh URL mã QR VietQR chuẩn NAPAS 24/7
 * Tự động điền: Ngân hàng, Số tài khoản, Tên chủ tài khoản, Số tiền & Nội dung chuyển khoản
 *
 * @param {Object} params
 * @param {string} params.bankId - Mã định danh ngân hàng (VD: MBBANK, VCB, TCB)
 * @param {string} params.accountNo - Số tài khoản ngân hàng
 * @param {string} params.accountName - Tên chủ tài khoản
 * @param {number} params.amount - Số tiền VND cần chuyển
 * @param {string} params.memo - Nội dung chuyển khoản (Tối đa 25 ký tự theo chuẩn VietQR)
 * @param {string} params.template - Giao diện QR (compact2, compact, qr_only)
 * @returns {string} Image URL của mã VietQR
 */
export function generateVietQRUrl({
  bankId = 'MBBANK',
  accountNo = '1330042000',
  accountName = 'LE THI HA VY',
  amount = 0,
  memo = '',
  template = 'compact2',
} = {}) {
  const safeAmount = Math.round(Math.max(0, Number(amount) || 0));
  const safeMemo = (memo || '').toString().trim().replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 25);
  const encodedMemo = encodeURIComponent(safeMemo);
  const encodedName = encodeURIComponent(accountName);

  return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${safeAmount}&addInfo=${encodedMemo}&accountName=${encodedName}`;
}

/**
 * Sinh mã QR ngân hàng Hàn Quốc (Woori Bank)
 */
export function generateKrwQRUrl(accountNumber = '1002959863658') {
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(accountNumber)}`;
}

/**
 * Gọi Cloud Function để tạo mã QR động qua cổng PayOS (nếu đã cấu hình)
 * Tự động fallback sang VietQR thông thường nếu PayOS chưa cấu hình hoặc gặp lỗi
 */
export async function createPayOSPaymentLink({ orderId, amount }) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    // Ưu tiên số 1: Gọi Cloud Function chính thức trên Firebase (đối chiếu trực tiếp totalVnd từ Firestore)
    const cloudFunctionUrl = 'https://createpayospaymentlink-rkn7dgrfkq-uc.a.run.app';
    try {
      const res = await fetch(cloudFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, amount }),
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          clearTimeout(timer);
          return data;
        }
      }
    } catch (_cfErr) {
      // Fallback sang endpoint nội bộ nếu đang chạy trên Vercel
    }

    // Fallback: Gọi Serverless Function nội bộ nếu đang trên Vercel
    try {
      const isVercelHost = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
      if (isVercelHost) {
        const resVercel = await fetch('/api/createPayOSPaymentLink', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, amount }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (resVercel.ok) {
          const data = await resVercel.json();
          if (data && data.success) {
            return data;
          }
        }
      }
    } catch (_vErr) {
      // Bỏ qua và fallback sang VietQR
    }
    clearTimeout(timer);
    return { success: false, fallback: true };
  } catch (err) {
    // Luôn fallback an toàn sang VietQR MB Bank nếu không gọi được API
    return { success: false, fallback: true, error: err.message };
  }
}

/**
 * Tải ảnh QR Code về máy để khách hàng dễ dàng quét từ thư viện ảnh ngân hàng
 */
export async function downloadQRCode(imageUrl, filename = 'vietqr-tavy.png') {
  try {
    const response = await fetch(imageUrl, { mode: 'cors' });
    if (!response.ok) throw new Error('Fetch failed');
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
    return true;
  } catch (err) {
    // Fallback: Mở ảnh trong tab mới nếu tải trực tiếp bị chặn CORS
    window.open(imageUrl, '_blank');
    return false;
  }
}

const paymentService = {
  DEFAULT_BANK_ACCOUNTS,
  generateVietQRUrl,
  generateKrwQRUrl,
  createPayOSPaymentLink,
  downloadQRCode,
};

export default paymentService;
