import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Helmet } from 'react-helmet-async';
import confetti from 'canvas-confetti';
import {
  Clock, CheckCircle, Copy, RefreshCw,
  Download, ChevronDown, ChevronUp,
  Package, MapPin, User, Phone, AlertCircle, ArrowLeft,
  Sparkles, Check, UploadCloud, ExternalLink
} from 'lucide-react';
import { getOrderTotalVnd, formatVnd } from '../utils/priceCalculator';
import {
  DEFAULT_BANK_ACCOUNTS,
  generateVietQRUrl,
  generateKrwQRUrl,
  createPayOSPaymentLink,
  downloadQRCode
} from '../services/paymentService';
import Footer from '../components/Footer';

const PAYMENT_DEADLINE_MS = 15 * 60 * 1000; // 15 phút

function formatTime(ms) {
  if (ms <= 0) return '00:00';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function PaymentPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { currentUser, rates } = useContext(AppContext);

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorNotFound, setErrorNotFound] = useState(false);
  const [timeLeft, setTimeLeft] = useState(PAYMENT_DEADLINE_MS);
  const [copied, setCopied] = useState('');
  const [activeTab, setActiveTab] = useState('vietqr_vn'); // 'vietqr_vn' | 'woori_kr'
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [payosData, setPayosData] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [proofImageBase64, setProofImageBase64] = useState(null);
  const [proofSuccessMsg, setProofSuccessMsg] = useState('');

  // 1. Realtime listener cho đơn hàng
  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      setErrorNotFound(true);
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'orders', orderId),
      (snap) => {
        setLoading(false);
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() };
          setOrder(data);
          setErrorNotFound(false);

          // Kích hoạt pháo hoa nếu vừa hoàn tất thanh toán
          if (data.paymentStatus === 'paid' || data.status === 'deposit_paid') {
            try {
              confetti({
                particleCount: 120,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#10B981', '#6366F1', '#F59E0B'],
              });
            } catch (_err) {
              // canvas-confetti fallback
            }
          }
        } else {
          setErrorNotFound(true);
        }
      },
      (err) => {
        console.warn('Lỗi đọc dữ liệu đơn hàng:', err);
        setLoading(false);
        setErrorNotFound(true);
      }
    );

    return unsub;
  }, [orderId]);

  // 2. Countdown timer 15 phút
  useEffect(() => {
    if (!order?.paymentDue) return;
    const deadline = new Date(order.paymentDue).getTime();

    const tick = () => {
      const remaining = deadline - Date.now();
      setTimeLeft(Math.max(0, remaining));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [order?.paymentDue]);

  // 3. Tự động chuyển về trạng thái 'pending' nếu hết hạn 15 phút
  useEffect(() => {
    if (timeLeft <= 0 && order && order.paymentStatus === 'unpaid' && order.status !== 'pending') {
      updateDoc(doc(db, 'orders', orderId), {
        status: 'pending',
        updatedAt: serverTimestamp(),
      }).catch(console.warn);
    }
  }, [timeLeft, order, orderId]);

  // 4. Số tiền VND cọc 100% đồng nhất hoàn toàn với giá tiền giỏ hàng (không delta)
  const transferVnd = useMemo(() => {
    if (!order) return 0;
    if (typeof order.totalVnd === 'number' && order.totalVnd > 0) {
      return Math.round(order.totalVnd);
    }
    if (typeof order.totalAmount === 'number' && order.totalAmount > 0) {
      return Math.round(order.totalAmount);
    }
    return getOrderTotalVnd(order, rates);
  }, [order, rates]);

  useEffect(() => {
    if (!orderId || transferVnd <= 0 || order?.paymentStatus === 'paid') return;

    let isMounted = true;
    createPayOSPaymentLink({ orderId, amount: transferVnd })
      .then((res) => {
        if (isMounted && res && res.success && res.data) {
          setPayosData(res.data);
        }
      })
      .catch(() => {
        // Fallback tự động dùng VietQR trực tiếp
      });

    return () => {
      isMounted = false;
    };
  }, [orderId, transferVnd, order?.paymentStatus]);

  // Sao chép văn bản vào bộ nhớ tạm
  const copyToClipboard = useCallback((text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 2200);
    });
  }, []);

  // Gia hạn thêm 15 phút
  const handleRenewPayment = async () => {
    if (!orderId) return;
    try {
      const newDue = new Date(Date.now() + PAYMENT_DEADLINE_MS).toISOString();
      await updateDoc(doc(db, 'orders', orderId), {
        paymentDue: newDue,
        status: 'pending',
        updatedAt: serverTimestamp(),
      });
      setTimeLeft(PAYMENT_DEADLINE_MS);
    } catch (err) {
      console.warn('Lỗi gia hạn thanh toán:', err);
    }
  };

  // Tính toán số tiền KRW (nếu thanh toán qua Woori Bank)
  const krwRate = rates?.KRW?.rate || 19.5;
  const transferKrw = useMemo(() => {
    if (!order) return 0;
    if (typeof order.subTotalKrw === 'number' && order.subTotalKrw > 0) return Math.round(order.subTotalKrw);
    if (Array.isArray(order.items) && order.items.length > 0) {
      return order.items.reduce((sum, i) => sum + (Number(i.foreignPrice ?? i.priceKrw ?? i.priceWon ?? i.price) || 0) * (Number(i.qty || i.quantity) || 1), 0);
    }
    return Math.round(Number(order.foreignPrice) || 0) || (order.quote?.totalVnd ? Math.round(order.quote.totalVnd / krwRate) : 0);
  }, [order, krwRate]);

  // Nội dung chuyển khoản làm sạch: TAVY [Số điện thoại]
  const rawCustomerPhone = order?.customerPhone || currentUser?.phone || '';
  const cleanCustomerPhone = rawCustomerPhone.replace(/\D/g, '');
  const transferMemo = cleanCustomerPhone ? `TAVY ${cleanCustomerPhone}` : (orderId ? `TAVY ${orderId.replace(/^(ord-?|#)/i, '')}` : 'TAVY');

  // Link mã QR VietQR chuẩn NAPAS MB Bank (Chứa số tiền chính xác đến từng đồng)
  const directVietQRUrl = useMemo(() => {
    return generateVietQRUrl({
      bankId: 'MBBANK',
      accountNo: DEFAULT_BANK_ACCOUNTS.VN.accountNumber,
      accountName: DEFAULT_BANK_ACCOUNTS.VN.accountHolder,
      amount: transferVnd,
      memo: transferMemo,
      template: 'compact2',
    });
  }, [transferVnd, transferMemo]);

  // Thông tin ngân hàng VN hoạt động (Ưu tiên PayOS nếu kết nối thành công, fallback MB Bank mặc định)
  const activeVnBank = useMemo(() => {
    if (payosData && payosData.accountNumber) {
      return {
        bankName: 'MB Bank (Quân Đội - Cổng PayOS)',
        accountNumber: payosData.accountNumber,
        accountHolder: payosData.accountName || DEFAULT_BANK_ACCOUNTS.VN.accountHolder,
        memo: payosData.description || transferMemo,
        checkoutUrl: payosData.checkoutUrl || null,
        isPayOS: true,
      };
    }
    return {
      bankName: DEFAULT_BANK_ACCOUNTS.VN.bankName,
      accountNumber: DEFAULT_BANK_ACCOUNTS.VN.accountNumber,
      accountHolder: DEFAULT_BANK_ACCOUNTS.VN.accountHolder,
      memo: transferMemo,
      checkoutUrl: null,
      isPayOS: false,
    };
  }, [payosData, transferMemo]);

  // Link mã QR hiển thị (Nếu có PayOS qrCode thì render hình ảnh chuẩn, nếu không dùng directVietQR)
  const activeQrUrl = (payosData && payosData.qrCode)
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(payosData.qrCode)}`
    : directVietQRUrl;
  const activeKrwQrUrl = generateKrwQRUrl(DEFAULT_BANK_ACCOUNTS.KR.accountNumber);

  // Xử lý tải mã QR về máy
  const handleDownloadQR = async () => {
    setIsDownloading(true);
    try {
      await downloadQRCode(
        activeTab === 'vietqr_vn' ? activeQrUrl : activeKrwQrUrl,
        `TAVY-QR-${orderId}.png`
      );
    } finally {
      setIsDownloading(false);
    }
  };

  // Xử lý chọn ảnh biên lai chuyển tiền dự phòng
  const handleProofImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Vui lòng chọn ảnh có dung lượng dưới 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProofImageBase64(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Gửi ảnh biên lai chuyển tiền lên Firestore
  const handleUploadProof = async () => {
    if (!proofImageBase64 || !orderId) return;
    setIsUploadingProof(true);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        depositProofImage: proofImageBase64,
        depositProofUploadedAt: new Date().toISOString(),
        customerReportedPaid: true,
        updatedAt: serverTimestamp(),
      });
      setProofSuccessMsg('Đã gửi biên lai chuyển tiền thành công! Admin sẽ đối soát và xác nhận đơn của bạn ngay lập tức.');
    } catch (err) {
      console.warn('Lỗi lưu biên lai chuyển tiền:', err);
      alert('Không thể lưu ảnh biên lai. Vui lòng thử lại hoặc gửi qua Zalo CSKH.');
    } finally {
      setIsUploadingProof(false);
    }
  };

  // Trạng thái đơn
  const isPaid = order?.paymentStatus === 'paid' || order?.status === 'deposit_paid';
  const isExpired = timeLeft <= 0 || order?.status === 'cancelled';
  const isUrgent = timeLeft > 0 && timeLeft < 3 * 60 * 1000 && !isExpired;

  // --- RENDERING TRẠNG THÁI LOADING ---
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-ivory, #F9F6FA)' }}>
        <RefreshCw size={36} className="spin" style={{ color: 'var(--purple-primary, #7C3AED)', marginBottom: '16px' }} />
        <p style={{ color: 'var(--text-muted, #6B7280)', fontWeight: 600, fontSize: '0.95rem' }}>Đang tải thông tin đơn hàng...</p>
      </div>
    );
  }

  // --- RENDERING TRẠNG THÁI KHÔNG TÌM THẤY ---
  if (errorNotFound || !order) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-ivory, #F9F6FA)', color: 'var(--text-dark, #1A1A2E)' }}>
        <Helmet><title>Không tìm thấy đơn hàng - TAVY Korea</title></Helmet>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ textAlign: 'center', backgroundColor: '#FFFFFF', border: '1px solid var(--border-color, #E5E7EB)', padding: '40px 24px', borderRadius: '24px', maxWidth: '440px', width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            <AlertCircle size={54} color="#EF4444" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '10px' }}>Không tìm thấy đơn hàng</h2>
            <p style={{ color: 'var(--text-muted, #6B7280)', fontSize: '0.88rem', marginBottom: '24px', lineHeight: 1.5 }}>
              Mã đơn hàng <strong>{orderId.replace(/^ORD-?/i, '')}</strong> không tồn tại hoặc đã được chuyển sang cơ sở dữ liệu lưu trữ.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={() => navigate('/')} className="btn-outline" style={{ padding: '10px 18px', borderRadius: '10px', fontWeight: 600 }}>Về trang chủ</button>
              <button onClick={() => navigate('/orders')} className="btn-primary" style={{ padding: '10px 18px', borderRadius: '10px', fontWeight: 600 }}>Danh sách đơn</button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // --- RENDERING TRẠNG THÁI ĐÃ THANH TOÁN THÀNH CÔNG ---
  if (isPaid) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-ivory, #F9F6FA)', color: 'var(--text-dark, #1A1A2E)' }}>
        <Helmet><title>Thanh toán thành công đơn {cleanCustomerPhone || orderId.replace(/^ORD-?/i, '')} - TAVY Korea</title></Helmet>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
          <div style={{ textAlign: 'center', backgroundColor: '#FFFFFF', border: '1px solid #D1FAE5', padding: '48px 28px', borderRadius: '28px', maxWidth: '520px', width: '100%', boxShadow: '0 8px 30px rgba(16, 185, 129, 0.12)' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle size={48} color="#10B981" />
            </div>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#065F46', marginBottom: '8px', fontFamily: 'var(--font-serif)' }}>
              Thanh Toán Thành Công!
            </h1>
            <p style={{ color: 'var(--text-muted, #4B5563)', fontSize: '0.92rem', marginBottom: '24px', lineHeight: 1.5 }}>
              Đơn hàng theo SĐT <strong>{cleanCustomerPhone || orderId.replace(/^ORD-?/i, '')}</strong> đã được hệ thống tự động ghi nhận cọc 100%. Đội ngũ TAVY tại Hàn Quốc sẽ tiến hành mua hàng cho bạn ngay!
            </p>

            <div style={{ backgroundColor: '#F9FAFB', borderRadius: '16px', padding: '16px', marginBottom: '28px', textAlign: 'left', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #E5E7EB' }}>
                <span style={{ color: '#6B7280' }}>Số tiền đã cọc:</span>
                <span style={{ fontWeight: 700, color: '#10B981' }}>{transferVnd.toLocaleString('vi-VN')} đ</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #E5E7EB' }}>
                <span style={{ color: '#6B7280' }}>SĐT nhận hàng:</span>
                <span style={{ fontWeight: 700 }}>{cleanCustomerPhone || orderId.replace(/^ORD-?/i, '')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ color: '#6B7280' }}>Thời gian ghi nhận:</span>
                <span style={{ fontWeight: 600 }}>{order.paidAt ? new Date(order.paidAt).toLocaleString('vi-VN') : 'Vừa xong'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => navigate('/orders')}
                className="btn-primary"
                style={{ flex: 1, minWidth: '160px', padding: '12px 20px', borderRadius: '12px', fontWeight: 700 }}
              >
                Xem chi tiết đơn hàng
              </button>
              <button
                onClick={() => navigate('/')}
                className="btn-outline"
                style={{ padding: '12px 20px', borderRadius: '12px', fontWeight: 600 }}
              >
                Về trang chủ
              </button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // --- GIAO DIỆN CHÍNH TRANG THANH TOÁN (FINTECH STYLE) ---
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-ivory, #F9F6FA)', color: 'var(--text-dark, #1A1A2E)' }}>
      <Helmet>
        <title>Thanh toán đơn hàng {cleanCustomerPhone || orderId.replace(/^ORD-?/i, '')} - TAVY Korea</title>
        <meta name="description" content="Quét mã VietQR để thanh toán đơn hàng mua hộ Hàn Quốc nhanh chóng và tự động 24/7." />
      </Helmet>

      <main style={{ flex: 1, padding: '32px 16px', maxWidth: '860px', margin: '0 auto', width: '100%' }}>
        
        {/* Navigation Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <Link
            to="/orders"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted, #6B7280)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 }}
          >
            <ArrowLeft size={16} /> Quay lại danh sách đơn
          </Link>
          <span style={{ fontSize: '0.82rem', color: '#9CA3AF' }}>SĐT đặt hàng: <strong style={{ color: 'var(--text-dark)' }}>{cleanCustomerPhone || orderId.replace(/^ORD-?/i, '')}</strong></span>
        </div>

        {/* Thanh đếm ngược & Thông báo gia hạn */}
        <div style={{
          backgroundColor: isExpired ? '#FEE2E2' : isUrgent ? '#FEF3C7' : '#ECFDF5',
          border: `1px solid ${isExpired ? '#FCA5A5' : isUrgent ? '#FCD34D' : '#A7F3D0'}`,
          borderRadius: '16px',
          padding: '14px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={20} color={isExpired ? '#DC2626' : isUrgent ? '#D97706' : '#059669'} />
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: isExpired ? '#DC2626' : isUrgent ? '#B45309' : '#065F46' }}>
                {isExpired ? 'Đơn hàng đã hết hạn thanh toán' : `Thời gian giữ giá: ${formatTime(timeLeft)}`}
              </div>
              <div style={{ fontSize: '0.78rem', color: isExpired ? '#991B1B' : '#6B7280' }}>
                {isExpired
                  ? 'Vui lòng bấm nút Gia hạn để tiếp tục thanh toán giữ đơn hàng.'
                  : 'Vui lòng quét mã và chuyển khoản trước khi hết hạn để đảm bảo tỷ giá.'}
              </div>
            </div>
          </div>

          {isExpired && (
            <button
              onClick={handleRenewPayment}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} /> Gia hạn 15 phút
            </button>
          )}
        </div>

        {/* Khung Tóm Tắt Đơn Hàng (Collapsible Order Summary) */}
        <div style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--border-color, #E5E7EB)',
          borderRadius: '20px',
          padding: '20px',
          marginBottom: '24px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
        }}>
          <div
            onClick={() => setShowOrderDetails(!showOrderDetails)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Package size={20} style={{ color: 'var(--purple-primary, #7C3AED)' }} />
              <div>
                <span style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-dark)' }}>
                  Tổng thanh toán cọc 100%:
                </span>
                <span style={{ marginLeft: '8px', fontSize: '1.2rem', fontWeight: 800, color: '#2563EB' }}>
                  {transferVnd.toLocaleString('vi-VN')} đ
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted, #6B7280)', fontSize: '0.82rem' }}>
              {showOrderDetails ? 'Ẩn chi tiết' : 'Xem chi tiết đơn'}
              {showOrderDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>

          {/* Chi tiết đơn hàng khi mở rộng */}
          {showOrderDetails && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #F3F4F6' }}>
              {/* Danh sách sản phẩm */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Sản phẩm đặt mua ({order.items?.length || 1})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(order.items && order.items.length > 0) ? (
                    order.items.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                          {(item.productImage || item.image) && (
                            <img src={item.productImage || item.image} alt={item.name} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                          )}
                          <div style={{ minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{item.name || 'Sản phẩm mua hộ'}</div>
                            <div style={{ color: '#9CA3AF', fontSize: '0.76rem' }}>Số lượng: {item.qty || 1} • Giá gốc: ₩{(Number(item.foreignPrice ?? item.priceKrw ?? item.priceWon ?? item.price) || 0).toLocaleString()}</div>
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--text-dark)', marginLeft: '12px' }}>
                          {formatVnd((item.priceVnd || Math.round((Number(item.foreignPrice ?? item.priceKrw ?? item.priceWon ?? item.price) || 0) * krwRate * (1 + (rates?.serviceFeePercent || 5) / 100))) * (Number(item.qty || item.quantity) || 1))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: '#4B5563' }}>
                      {order.productName || order.productUrl || 'Đơn hàng mua hộ trọn gói'}
                    </div>
                  )}
                </div>
              </div>

              {/* Thông tin người nhận */}
              <div style={{ backgroundColor: '#F9FAFB', borderRadius: '12px', padding: '12px', fontSize: '0.82rem', color: '#4B5563', lineHeight: 1.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px' }}>
                  <User size={14} /> {order.customerName || currentUser?.name || 'Khách hàng'} • <Phone size={14} /> {order.customerPhone || currentUser?.phone || 'Chưa cập nhật'}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <MapPin size={14} style={{ marginTop: '3px', flexShrink: 0 }} />
                  <span>{order.customerAddress || currentUser?.address || 'Nhận hàng tại địa chỉ cung cấp'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* TABS CHỌN PHƯƠNG THỨC THANH TOÁN (VNĐ / KRW) */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button
            onClick={() => setActiveTab('vietqr_vn')}
            style={{
              flex: 1,
              padding: '14px 16px',
              borderRadius: '16px',
              border: activeTab === 'vietqr_vn' ? '2px solid var(--purple-primary, #7C3AED)' : '1px solid var(--border-color, #E5E7EB)',
              backgroundColor: activeTab === 'vietqr_vn' ? '#FAF5FF' : '#FFFFFF',
              color: activeTab === 'vietqr_vn' ? 'var(--purple-dark, #581C87)' : 'var(--text-muted, #6B7280)',
              fontWeight: 800,
              fontSize: '0.92rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: activeTab === 'vietqr_vn' ? '0 2px 10px rgba(124, 58, 237, 0.1)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <span style={{ backgroundColor: '#EF4444', color: '#FFF', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '6px' }}>VN</span>
            Mã VietQR Tự Động (VNĐ)
          </button>

          <button
            onClick={() => setActiveTab('woori_kr')}
            style={{
              flex: 1,
              padding: '14px 16px',
              borderRadius: '16px',
              border: activeTab === 'woori_kr' ? '2px solid #2563EB' : '1px solid var(--border-color, #E5E7EB)',
              backgroundColor: activeTab === 'woori_kr' ? '#EFF6FF' : '#FFFFFF',
              color: activeTab === 'woori_kr' ? '#1E40AF' : 'var(--text-muted, #6B7280)',
              fontWeight: 800,
              fontSize: '0.92rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: activeTab === 'woori_kr' ? '0 2px 10px rgba(37, 99, 235, 0.1)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <span style={{ backgroundColor: '#2563EB', color: '#FFF', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '6px' }}>KR</span>
            Chuyển khoản Hàn Quốc (KRW)
          </button>
        </div>

        {/* NỘI DUNG TAB 1: VIETQR TỰ ĐỘNG (VNĐ) */}
        {activeTab === 'vietqr_vn' && (
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-color, #E5E7EB)',
            borderRadius: '24px',
            padding: '28px 24px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
          }}>
            
            {/* Header thông tin quét QR */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#ECFDF5', color: '#065F46', padding: '6px 14px', borderRadius: '20px', fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px' }}>
                <Sparkles size={14} color="#10B981" /> Tự động xác nhận sau 3 giây khi chuyển tiền
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-dark)' }}>
                Quét mã VietQR bằng ứng dụng ngân hàng
              </h2>
              <p style={{ color: 'var(--text-muted, #6B7280)', fontSize: '0.84rem', marginTop: '6px', marginBottom: 0 }}>
                Hỗ trợ tất cả ngân hàng Việt Nam: Vietcombank, MB, Techcombank, ACB, VPBank, TPBank, MoMo...
              </p>
            </div>

            {/* Khung Mã QR và Nút Tiện Ích */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              backgroundColor: '#FAFAFA',
              border: '1px solid #F3F4F6',
              borderRadius: '20px',
              padding: '24px 16px',
              marginBottom: '24px'
            }}>
              {/* Hình ảnh QR Code */}
              <div style={{
                position: 'relative',
                backgroundColor: '#FFFFFF',
                padding: '12px',
                borderRadius: '16px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                display: 'inline-block'
              }}>
                <img
                  src={activeQrUrl}
                  alt={`VietQR Thanh Toán ${orderId.replace(/^ORD-?/i, '')}`}
                  width={240}
                  height={240}
                  style={{ display: 'block', borderRadius: '10px', objectFit: 'contain' }}
                />
              </div>

              {/* Nút hành động dưới ảnh QR */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={handleDownloadQR}
                  disabled={isDownloading}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #D1D5DB',
                    color: 'var(--text-dark)',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}
                >
                  <Download size={14} /> {isDownloading ? 'Đang tải...' : 'Lưu ảnh mã QR'}
                </button>

                <button
                  onClick={() => copyToClipboard(DEFAULT_BANK_ACCOUNTS.VN.accountNumber, 'stk_top')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#FAF5FF',
                    border: '1px solid #E9D5FF',
                    color: 'var(--purple-primary, #7C3AED)',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {copied === 'stk_top' ? <Check size={14} /> : <Copy size={14} />}
                  {copied === 'stk_top' ? 'Đã copy STK!' : 'Sao chép STK'}
                </button>
              </div>
            </div>

            {/* Chi Tiết Thông Tin Chuyển Khoản & Các Nút Sao Chép */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              
              {/* 1. Số tiền cần chuyển chính xác - KHỐI TRỌNG TÂM NHẤT */}
              <div style={{
                padding: '16px 18px',
                backgroundColor: '#EFF6FF',
                borderRadius: '16px',
                border: '2px solid #3B82F6',
                boxShadow: '0 2px 10px rgba(59, 130, 246, 0.08)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '0.76rem', color: '#1E40AF', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      ⚡ SỐ TIỀN THANH TOÁN CỌC 100% (ĐỒNG NHẤT VỚI GIỎ HÀNG)
                    </div>
                    <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#1D4ED8', marginTop: '2px' }}>
                      {transferVnd.toLocaleString('vi-VN')} VNĐ
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(transferVnd.toString(), 'amount')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: '#2563EB',
                      border: 'none',
                      color: '#FFFFFF',
                      padding: '8px 16px',
                      borderRadius: '10px',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(37, 99, 235, 0.2)'
                    }}
                  >
                    {copied === 'amount' ? <Check size={14} /> : <Copy size={14} />}
                    {copied === 'amount' ? 'Đã sao chép!' : 'Copy số tiền'}
                  </button>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#1E40AF', marginTop: '8px', lineHeight: 1.45 }}>
                  ⚠️ <strong>Lưu ý:</strong> Quý khách chuyển cọc 100% để nhân viên TAVY tại Hàn Quốc tiến hành mua hàng tại Store ngay lập tức.
                </div>
              </div>

              {/* 2. Nội dung chuyển khoản (Tự động theo SĐT nhận hàng) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <div>
                  <div style={{ fontSize: '0.74rem', color: '#6B7280', fontWeight: 600 }}>
                    NỘI DUNG CHUYỂN KHOẢN (QUÉT QR TỰ ĐIỀN)
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--purple-dark, #581C87)' }}>
                    {transferMemo}
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(transferMemo, 'memo')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #D1D5DB', color: '#4B5563', padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  {copied === 'memo' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'memo' ? 'Đã chép' : 'Copy'}
                </button>
              </div>

              {/* 3. Ngân hàng & STK */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                <div style={{ padding: '12px 14px', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: '0.76rem', color: '#6B7280' }}>Ngân hàng thụ hưởng</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-dark)', marginTop: '2px' }}>
                    {activeVnBank.bankName}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                  <div>
                    <div style={{ fontSize: '0.76rem', color: '#6B7280' }}>Số tài khoản</div>
                    <div style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-dark)', marginTop: '2px' }}>
                      {activeVnBank.accountNumber}
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(activeVnBank.accountNumber, 'stk')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #D1D5DB', padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    {copied === 'stk' ? <Check size={12} /> : <Copy size={12} />}
                    {copied === 'stk' ? 'Đã chép' : 'Copy'}
                  </button>
                </div>

                <div style={{ padding: '12px 14px', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '1px solid #E5E7EB', gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.76rem', color: '#6B7280' }}>Chủ tài khoản</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-dark)', marginTop: '2px' }}>
                    {activeVnBank.accountHolder}
                  </div>
                </div>
              </div>

              {activeVnBank.checkoutUrl && (
                <div style={{ textAlign: 'center', marginTop: '6px' }}>
                  <a
                    href={activeVnBank.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.82rem',
                      color: 'var(--purple-primary, #7C3AED)',
                      fontWeight: 700,
                      textDecoration: 'none'
                    }}
                  >
                    Mở cổng thanh toán PayOS toàn màn hình <ExternalLink size={13} />
                  </a>
                </div>
              )}

            </div>

            {/* Hướng dẫn 3 bước quét mã nhanh */}
            <div style={{ backgroundColor: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: '16px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--purple-dark, #581C87)', marginBottom: '8px' }}>
                Hướng dẫn thanh toán nhanh:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', color: '#4B5563' }}>
                <div><strong>1.</strong> Mở ứng dụng ngân hàng bất kỳ trên điện thoại của bạn.</div>
                <div><strong>2.</strong> Chọn tính năng <strong>Quét mã QR</strong> (hoặc lưu ảnh mã QR ở trên rồi chọn từ thư viện ảnh).</div>
                <div><strong>3.</strong> Ứng dụng sẽ tự động điền số tiền chính xác <strong>{transferVnd.toLocaleString('vi-VN')} đ</strong>. Bấm xác nhận chuyển tiền, đơn hàng của bạn sẽ được kích hoạt tức thì!</div>
              </div>
            </div>

            {/* Phần Tùy Chọn: Tải biên lai chuyển tiền dự phòng */}
            <div style={{ borderTop: '1px dashed #E5E7EB', paddingTop: '16px' }}>
              {proofSuccessMsg ? (
                <div style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '12px', padding: '12px 16px', color: '#065F46', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle size={16} color="#10B981" /> {proofSuccessMsg}
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.82rem', color: '#6B7280' }}>
                      Đã chuyển khoản nhưng hệ thống chưa kịp cập nhật?
                    </span>
                    <label
                      htmlFor="proof-upload-input"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #D1D5DB',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        color: 'var(--text-dark)'
                      }}
                    >
                      <UploadCloud size={14} /> {proofImageBase64 ? 'Đổi ảnh biên lai' : 'Tải ảnh biên lai/bill'}
                    </label>
                    <input
                      id="proof-upload-input"
                      type="file"
                      accept="image/*"
                      onChange={handleProofImageChange}
                      style={{ display: 'none' }}
                    />
                  </div>

                  {proofImageBase64 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px', backgroundColor: '#F9FAFB', padding: '10px', borderRadius: '10px' }}>
                      <img src={proofImageBase64} alt="Biên lai" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px' }} />
                      <div style={{ flex: 1, fontSize: '0.8rem', color: '#4B5563' }}>Ảnh đã sẵn sàng. Bấm xác nhận để gửi cho Admin đối soát.</div>
                      <button
                        onClick={handleUploadProof}
                        disabled={isUploadingProof}
                        style={{
                          backgroundColor: '#10B981',
                          color: '#FFFFFF',
                          border: 'none',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {isUploadingProof ? 'Đang gửi...' : 'Gửi biên lai'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

        {/* NỘI DUNG TAB 2: CHUYỂN KHOẢN HÀN QUỐC (KRW - WOORI BANK) */}
        {activeTab === 'woori_kr' && (
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-color, #E5E7EB)',
            borderRadius: '24px',
            padding: '28px 24px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '6px 14px', borderRadius: '20px', fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px' }}>
                Ngân hàng Hàn Quốc Woori Bank (우리은행)
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-dark)' }}>
                Chuyển khoản trực tiếp bằng Won (KRW)
              </h2>
              <p style={{ color: 'var(--text-muted, #6B7280)', fontSize: '0.84rem', marginTop: '6px', marginBottom: 0 }}>
                Dành cho khách hàng sử dụng ứng dụng ngân hàng Hàn Quốc (Toss, KakaoPay, Woori WON...)
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#FAFAFA', border: '1px solid #F3F4F6', borderRadius: '20px', padding: '24px 16px', marginBottom: '24px' }}>
              <div style={{ backgroundColor: '#FFFFFF', padding: '12px', borderRadius: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                <img
                  src={activeKrwQrUrl}
                  alt="QR Code Woori Bank KRW"
                  width={220}
                  height={220}
                  style={{ display: 'block', borderRadius: '10px' }}
                />
              </div>
              <p style={{ color: '#6B7280', fontSize: '0.8rem', marginTop: '10px', marginBottom: 0 }}>
                Quét mã để sao chép nhanh số tài khoản Woori Bank
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {/* Số tiền Won */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#ECFDF5', borderRadius: '12px', border: '1px solid #A7F3D0' }}>
                <div>
                  <div style={{ fontSize: '0.76rem', color: '#065F46', fontWeight: 600 }}>SỐ TIỀN CẦN CHUYỂN (WON)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>
                    ₩{transferKrw.toLocaleString('ko-KR')}
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(transferKrw.toString(), 'amount_kr')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#FFFFFF', border: '1px solid #6EE7B7', color: '#059669', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  {copied === 'amount_kr' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'amount_kr' ? 'Đã chép' : 'Sao chép'}
                </button>
              </div>

              {/* Thông tin Woori Bank */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <div>
                  <div style={{ fontSize: '0.76rem', color: '#6B7280' }}>Ngân hàng</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>우리은행 (Woori Bank)</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <div>
                  <div style={{ fontSize: '0.76rem', color: '#6B7280' }}>Số tài khoản (계좌번호)</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1E40AF' }}>{DEFAULT_BANK_ACCOUNTS.KR.accountNumber}</div>
                </div>
                <button
                  onClick={() => copyToClipboard(DEFAULT_BANK_ACCOUNTS.KR.accountNumber, 'stk_kr')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #D1D5DB', padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  {copied === 'stk_kr' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'stk_kr' ? 'Đã chép' : 'Copy'}
                </button>
              </div>

              <div style={{ padding: '12px 14px', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                <div style={{ fontSize: '0.76rem', color: '#6B7280' }}>Chủ tài khoản (예금주)</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{DEFAULT_BANK_ACCOUNTS.KR.accountHolder}</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', backgroundColor: '#FEF3C7', borderRadius: '12px', border: '1px solid #FCD34D' }}>
                <div>
                  <div style={{ fontSize: '0.76rem', color: '#92400E', fontWeight: 700 }}>Nội dung chuyển khoản (받는분 통장표시)</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#B45309' }}>{transferMemo}</div>
                </div>
                <button
                  onClick={() => copyToClipboard(transferMemo, 'memo_kr')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F59E0B', border: 'none', color: '#FFF', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  {copied === 'memo_kr' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'memo_kr' ? 'Đã chép' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Nút gửi biên lai cho KRW */}
            <div style={{ borderTop: '1px dashed #E5E7EB', paddingTop: '16px' }}>
              <p style={{ fontSize: '0.82rem', color: '#6B7280', margin: 0 }}>
                Sau khi chuyển khoản thành công qua ứng dụng ngân hàng Hàn Quốc, vui lòng lưu lại ảnh biên lai hoặc gửi qua kênh Zalo/KakaoTalk của TAVY Korea để được kích hoạt đơn tức thì!
              </p>
            </div>
          </div>
        )}

      </main>

      <Footer />
    </div>
  );
}
