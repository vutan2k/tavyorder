import React, { useContext, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { Helmet } from 'react-helmet-async';
import paymentService from '../services/paymentService';
import { Trash2, Plus, Minus, CheckCircle, Globe, Zap, CreditCard, Loader2, User } from 'lucide-react';
import CascadingAddressSelector from '../components/CascadingAddressSelector';
import Footer from '../components/Footer';
import confetti from 'canvas-confetti';
import {
  isHoneypotTriggered,
  checkOrderRateLimit,
  recordOrderCreationTimestamp,
  sanitizeText,
  sanitizePhone,
  isValidVietnamesePhone
} from '../utils/securityUtils';

export default function CartPage() {
  const { cart, removeFromCart, updateCartQty, clearCart, currentUser, createOrder, rates, orders } = useContext(AppContext);
  const navigate = useNavigate();

  // Đơn hàng chờ cọc active của người dùng hiện tại
  const activePendingOrder = orders?.find(o => {
    const isUserOrder = (currentUser?.email && o.userEmail && o.userEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
                        (currentUser?.phone && o.customerPhone && o.customerPhone === currentUser.phone);
    const isUnpaidPending = (o.status === 'pending' || o.status === 'quoted') && o.paymentStatus !== 'paid';
    return isUserOrder && isUnpaidPending;
  });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (currentUser) {
      if (currentUser.name && currentUser.name !== 'Khách hàng Google') {
        setName(currentUser.name);
      }
      if (currentUser.phone) setPhone(currentUser.phone);
      if (currentUser.address) setAddress(currentUser.address);
    }
  }, [currentUser]);

  const krwRate = rates?.KRW?.rate || 19.5;
  const serviceFeeMultiplier = 1 + (rates?.serviceFeePercent ?? 5) / 100;
  const formatVnd = (n) => (n || n === 0) ? `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} VNĐ` : '0 VNĐ';
  const formatKrw = (n) => new Intl.NumberFormat('ko-KR').format(n) + ' ₩';

  // Hàm tính đơn giá VND cho từng sản phẩm (Single Source of Truth, làm tròn chính xác theo đồng)
  const getItemUnitVnd = (item) => {
    if (typeof item.priceVnd === 'number' && item.priceVnd > 0) {
      return Math.round(item.priceVnd);
    }
    const won = Number(item.foreignPrice ?? item.priceKrw ?? item.priceWon ?? item.price) || 0;
    return Math.round(won * krwRate * serviceFeeMultiplier);
  };

  const subTotalKrw = cart.reduce((sum, item) => sum + ((Number(item.foreignPrice ?? item.priceKrw ?? item.priceWon ?? item.price) || 0) * (Number(item.qty) || 1)), 0);
  const subTotalVnd = cart.reduce((sum, item) => sum + (getItemUnitVnd(item) * (Number(item.qty) || 1)), 0);
  const MIN_ORDER_AMOUNT_VND = 1000000; // Đơn hàng tối thiểu 1.000.000 VNĐ
  const isMinOrderMet = subTotalVnd >= MIN_ORDER_AMOUNT_VND;
  const shortfallVnd = Math.max(0, MIN_ORDER_AMOUNT_VND - subTotalVnd);
  const progressPercent = Math.min(100, Math.max(0, Math.round((subTotalVnd / MIN_ORDER_AMOUNT_VND) * 100)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cart.length === 0 || isSubmitting) return;

    // 0. Bẫy Honeypot vô hình: Nếu trường ẩn bị điền giá trị -> Khẳng định là bot
    if (isHoneypotTriggered(honeypot)) {
      console.warn('⚠️ Phát hiện bot order qua Honeypot Trap, từ chối tạo đơn âm thầm.');
      setIsSubmitting(true);
      setTimeout(() => {
        setIsSubmitting(false);
        setErrorMsg('Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.');
      }, 600);
      return;
    }

    // 0.1. Kiểm tra giới hạn tần suất tạo đơn (Rate Limiting: Tối đa 3 đơn / 5 phút)
    const rateLimit = checkOrderRateLimit();
    if (!rateLimit.allowed) {
      setErrorMsg(rateLimit.message);
      return;
    }

    // 1. Kiểm tra đơn hàng tối thiểu
    if (!isMinOrderMet) {
      setErrorMsg(`Đơn hàng hiện tại là ${formatVnd(subTotalVnd)}, chưa đạt mức tối thiểu 1.000.000 VNĐ. Vui lòng chọn thêm ${formatVnd(shortfallVnd)} để tiến hành thanh toán.`);
      return;
    }

    // 2. Validate Họ và Tên (bắt buộc, tối thiểu 2 ký tự)
    const trimmedName = sanitizeText(name);
    if (!trimmedName || trimmedName.length < 2) {
      setErrorMsg('Vui lòng điền đầy đủ Họ và Tên của người nhận hàng.');
      return;
    }

    // 3. Validate Số điện thoại (bắt buộc đúng 10 số, chuẩn đầu số VN 03, 05, 07, 08, 09)
    const cleanPhone = sanitizePhone(phone);
    if (!cleanPhone || !isValidVietnamesePhone(cleanPhone)) {
      setErrorMsg('Số điện thoại không hợp lệ! Vui lòng nhập đúng số điện thoại di động Việt Nam gồm 10 chữ số (bắt đầu bằng 03, 05, 07, 08, 09) để kiểm tra mã đơn hàng và đối soát tiền cọc.');
      return;
    }

    // 4. Validate Địa chỉ giao hàng (bắt buộc tối thiểu 6 ký tự)
    const trimmedAddress = sanitizeText(address);
    if (!trimmedAddress || trimmedAddress.length < 6) {
      setErrorMsg('Vui lòng chọn hoặc điền đầy đủ Địa chỉ nhận hàng (Tỉnh/Thành phố, Quận/Huyện, Phường/Xã).');
      return;
    }
    const cleanNote = sanitizeText(note);
    setErrorMsg('');

    setIsSubmitting(true);
    try {
      const country = 'KRW';
      const bankInfo = country === 'KRW'
        ? { bankName: '우라은행', accountNumber: '1002959863658' }
        : { bankName: 'MBbank', accountNumber: '1330042000' };

      const totalAmountVnd = subTotalVnd;
      const orderData = {
        id: cleanPhone, // Dùng trực tiếp SĐT khách hàng làm định danh chính, bỏ hoàn toàn mã ORD
        customerName: trimmedName,
        customerPhone: cleanPhone,
        customerAddress: trimmedAddress,
        customerNote: cleanNote,
        country,
        items: cart.map(item => ({
          ...item,
          priceVnd: getItemUnitVnd(item)
        })),
        totalVnd: totalAmountVnd,
        totalAmount: totalAmountVnd,
        subTotalKrw: subTotalKrw,
        paymentMethod: country === 'KRW' ? 'bank_kr' : 'bank_vn',
        bankAccount: bankInfo.accountNumber,
        bankName: bankInfo.bankName,
        paymentDue: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 phút
      };

      const res = await createOrder(orderData);
      recordOrderCreationTimestamp();

      // Làm sạch giỏ hàng sau khi đã chuyển thành đơn hàng thành công
      clearCart();
      try { localStorage.removeItem('tavy_cart'); } catch {}

      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#00FF00', '#10B981', '#F4EAD3'],
      });

      // Navigate tới trang thanh toán cọc 100% bằng định danh SĐT
      const targetOrderId = res?.id || activePendingOrder?.id || cleanPhone;
      navigate(`/payment/${targetOrderId}`);
    } catch (error) {
      console.error('Error submitting order:', error);
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-ivory, #F9F6FA)', color: 'var(--text-dark)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', backgroundColor: 'var(--bg-white, #FFF)', border: '1px solid var(--border-color)', padding: '50px', borderRadius: '24px', boxShadow: 'var(--shadow-lg)' }}>
            <CheckCircle size={64} color="#10B981" style={{ margin: '0 auto 20px auto' }} />
            <h2 style={{ fontSize: '1.8rem', color: 'var(--text-dark)', marginBottom: '16px' }}>Đặt hàng thành công!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>
              Chúng tôi đã nhận được yêu cầu mua hộ của bạn. Admin sẽ kiểm tra và gửi báo giá chi tiết trong thời gian sớm nhất!
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button onClick={() => navigate('/')} className="btn-outline">Về trang chủ</button>
              <button onClick={() => navigate('/orders')} className="btn-primary">Xem đơn hàng của tôi</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-ivory, #F9F6FA)', color: 'var(--text-dark)' }}>
      
      <Helmet>
        <title>Giỏ Hàng - TAVY Korea</title>
        <meta name="description" content="Xem và quản lý giỏ hàng của bạn trên TAVY Korea. Thanh toán nhanh chóng và an toàn." />
      </Helmet>

      <main className="container" style={{ flex: 1, padding: '40px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.4rem', color: 'var(--text-dark)', margin: 0 }}>Giỏ Hàng Của Bạn</h1>
          <div style={{ backgroundColor: 'var(--bg-subtle-purple, #F3EFF6)', border: '1px solid var(--border-color, #E9D5FF)', borderRadius: '20px', padding: '8px 18px', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-dark)', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)' }}>
            <Globe size={16} /> Tỷ giá áp dụng: <strong>1 KRW = {krwRate} VNĐ</strong>
          </div>
        </div>
        
        {activePendingOrder && (
          <div style={{ backgroundColor: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: '14px', padding: '14px 20px', marginBottom: '24px', color: '#92400E', fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <Zap size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                Bạn đang có <strong>1 Giỏ Hàng Chờ Cọc (SĐT: {activePendingOrder.customerPhone || activePendingOrder.id})</strong>. Mọi sản phẩm bạn thêm/xóa sẽ tự động cập nhật giỏ hàng này. Giỏ hàng sẽ chính thức chuyển thành Đơn hàng hoàn chỉnh sau khi bạn cọc 100%!
              </div>
            </div>
            <button
              onClick={() => navigate(`/payment/${activePendingOrder.id}`)}
              style={{ backgroundColor: '#D97706', color: '#FFF', border: 'none', padding: '6px 14px', borderRadius: '8px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <CreditCard size={14} /> Thanh toán cọc ngay
            </button>
          </div>
        )}

        {cart.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', backgroundColor: 'var(--bg-white, #FFF)', border: '1px solid var(--border-color)', borderRadius: '16px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginBottom: '20px' }}>Giỏ hàng đang trống.</p>
            <Link to="/" className="btn-primary">Khám phá sản phẩm</Link>
          </div>
        ) : (
          <div className="cart-layout">
            
            {/* Cột trái: Danh sách item */}
            <div style={{ backgroundColor: 'var(--bg-white, #FFF)', border: '1px solid var(--border-color)', padding: '24px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
              {cart.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '20px', padding: '20px 0', borderBottom: idx < cart.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <img src={item.productImage} alt={item.name} loading="lazy" style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0, aspectRatio: '1/1' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px' }}>{item.name}</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.options}</p>
                      </div>
                      <button onClick={() => removeFromCart(item.goodsNo)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '4px' }}>
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border-color, #ddd)', borderRadius: '6px', overflow: 'hidden' }}>
                        <button type="button" onClick={() => updateCartQty(item.goodsNo, item.qty - 1)} style={{ padding: '6px 10px', background: 'var(--bg-subtle-purple, #f9f9f9)', color: 'var(--text-dark)', border: 'none', cursor: 'pointer' }}><Minus size={14}/></button>
                        <span style={{ padding: '6px 16px', fontSize: '0.9rem', fontWeight: 600, minWidth: '40px', textAlign: 'center', color: 'var(--text-dark)' }}>{item.qty}</span>
                        <button type="button" onClick={() => updateCartQty(item.goodsNo, item.qty + 1)} style={{ padding: '6px 10px', background: 'var(--bg-subtle-purple, #f9f9f9)', color: 'var(--text-dark)', border: 'none', cursor: 'pointer' }}><Plus size={14}/></button>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text-dark)', fontSize: '1.05rem' }}>
                          {formatKrw((Number(item.foreignPrice ?? item.priceKrw ?? item.priceWon ?? item.price) || 0) * (Number(item.qty) || 1))}
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#2563EB', marginTop: '2px' }}>
                          ~ {formatVnd(getItemUnitVnd(item) * (Number(item.qty) || 1))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Banner Thông Báo Giải Thích Giá Nằm Dưới Danh Sách Sản Phẩm */}
              <div style={{
                marginTop: '20px',
                backgroundColor: 'var(--bg-subtle-purple, #FAF5FF)',
                border: '1px solid var(--border-color, #E9D5FF)',
                borderRadius: '14px',
                padding: '16px 20px',
                fontSize: '0.88rem',
                color: 'var(--text-dark, #581C87)',
                lineHeight: '1.55',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{ fontWeight: 800, marginBottom: '6px', fontSize: '0.92rem', color: 'var(--text-dark)' }}>
                  Thông tin thanh toán & Giá về tay:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: 'var(--text-muted)' }}>
                  <div>• <strong>Giá tại Hàn (Won ₩):</strong> Giá gốc niêm yết tại Store Olive Young / Hàn Quốc.</div>
                  <div>• <strong>Giá VNĐ về tay:</strong> Đã bao gồm tiền hàng gốc, tỷ giá và phí dịch vụ trọn gói (toàn bộ tiền vận chuyển 2 đầu đã nằm tất cả trong phí dịch vụ, quý khách chỉ thanh toán 1 lần duy nhất).</div>
                </div>
              </div>
            </div>

            {/* Cột phải: Form Đặt Hàng */}
            <div style={{ backgroundColor: 'var(--bg-white, #FFF)', border: '1px solid var(--border-color)', padding: '30px 24px', borderRadius: '16px', boxShadow: 'var(--shadow-md)', position: 'sticky', top: '24px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '20px', borderBottom: '2px solid var(--border-color, #f0f0f0)', paddingBottom: '12px', color: 'var(--text-dark)' }}>Thông tin người nhận</h3>
              
              {/* Card Thông Báo Đơn Tối Thiểu 1.000.000 VNĐ */}
              {!isMinOrderMet ? (
                <div style={{
                  backgroundColor: 'var(--bg-subtle-purple, #FFFBEB)',
                  border: '1.5px solid var(--gold-primary, #FCD34D)',
                  borderRadius: '14px',
                  padding: '16px',
                  marginBottom: '20px',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--gold-primary, #B45309)', fontWeight: 800, fontSize: '0.9rem' }}>
                      <span>⚠️ Đơn hàng tối thiểu: <strong>1.000.000 VNĐ</strong></span>
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--gold-primary, #D97706)' }}>{progressPercent}%</span>
                  </div>
                  {/* Thanh tiến trình */}
                  <div style={{ width: '100%', height: '7px', backgroundColor: 'var(--bg-ivory, #FDE68A)', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' }}>
                    <div style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: 'var(--gold-primary, #F59E0B)', transition: 'width 0.3s ease' }} />
                  </div>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-dark, #92400E)', margin: '0 0 6px 0', lineHeight: 1.45 }}>
                    Bạn cần chọn thêm <strong>{formatVnd(shortfallVnd)}</strong> để đạt mức tối thiểu 1.000.000đ.
                  </p>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted, #B45309)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                    💡 <em>Ghi chú: TAVY Korea áp dụng đơn tối thiểu 1.000.000đ để tối ưu chi phí mua hộ từ Hàn Quốc và bảo đảm quy chuẩn đóng gói đường bay an toàn.</em>
                  </p>
                  <Link
                    to="/#products"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--purple-light, #FEF3C7)',
                      color: 'var(--purple-dark, #B45309)',
                      border: '1px solid var(--border-color, #FCD34D)',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      textDecoration: 'none'
                    }}
                  >
                    + Chọn thêm sản phẩm
                  </Link>
                </div>
              ) : (
                <div style={{
                  backgroundColor: 'var(--bg-subtle-purple, #F0FDF4)',
                  border: '1.5px solid var(--border-color, #86EFAC)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  marginBottom: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#22C55E',
                  fontSize: '0.84rem',
                  fontWeight: 600
                }}>
                  <CheckCircle size={16} color="#22C55E" style={{ flexShrink: 0 }} />
                  <span>Đã đạt điều kiện đơn hàng tối thiểu (trên 1.000.000 VNĐ)!</span>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {/* Invisible Honeypot Trap: Bẫy bot tự động điền form, người thật không thấy và không thể focus */}
                <div
                  aria-hidden="true"
                  style={{
                    opacity: 0,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: 0,
                    width: 0,
                    zIndex: -1,
                    overflow: 'hidden',
                    pointerEvents: 'none'
                  }}
                >
                  <label htmlFor="company_website">Website doanh nghiệp</label>
                  <input
                    id="company_website"
                    type="text"
                    name="company_website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Họ và tên người nhận <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="Nhập họ và tên người nhận..."
                    value={name}
                    onChange={e => {
                      setName(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                  />
                </div>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      Số điện thoại nhận hàng <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    {phone && (
                      <span style={{ fontSize: '0.75rem', color: /^0(3|5|7|8|9)[0-9]{8}$/.test(phone.replace(/\D/g, '')) ? '#10B981' : '#EF4444', fontWeight: 600 }}>
                        {phone.replace(/\D/g, '').length}/10 số {/^0(3|5|7|8|9)[0-9]{8}$/.test(phone.replace(/\D/g, '')) ? '✓ Hợp lệ' : '(Chưa đúng định dạng)'}
                      </span>
                    )}
                  </div>
                  <input
                    type="tel"
                    required
                    className="input"
                    placeholder="VD: 0912345678 (Dùng để kiểm tra đơn hàng)"
                    value={phone}
                    onChange={e => {
                      setPhone(e.target.value.replace(/\D/g, ''));
                      if (errorMsg) setErrorMsg('');
                    }}
                    maxLength={10}
                    style={{
                      borderColor: phone && !/^0(3|5|7|8|9)[0-9]{8}$/.test(phone.replace(/\D/g, '')) && phone.length === 10 ? '#EF4444' : undefined
                    }}
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted, #6B7280)', marginTop: '4px' }}>
                    💡 Bắt buộc số điện thoại di động chính xác để tra cứu đơn hàng và đối soát chuyển khoản.
                  </div>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Tỉnh/Thành, Quận/Huyện, Phường/Xã</label>
                  <CascadingAddressSelector 
                    initialAddress={currentUser?.address || ''}
                    onChange={(addrInfo) => setAddress(addrInfo.fullAddress)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Ghi chú (Không bắt buộc)</label>
                  <textarea className="input" placeholder="Ví dụ: Giao hàng trong giờ hành chính..." value={note} onChange={e => setNote(e.target.value)} />
                </div>

                <div style={{ backgroundColor: 'var(--bg-subtle-purple, #F3EFF6)', padding: '16px 18px', borderRadius: '14px', marginTop: '24px', marginBottom: '24px', border: '1px solid var(--border-color, #E9D5FF)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>1. Giá gốc tại Hàn (Won):</span>
                    <strong style={{ fontSize: '1.05rem', color: 'var(--text-dark, #374151)' }}>{formatKrw(subTotalKrw)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: '10px', borderTop: '1px dashed var(--border-color, #D8B4FE)', flexWrap: 'wrap', gap: '4px' }}>
                    <span style={{ color: 'var(--text-dark)', fontWeight: 700, fontSize: '0.92rem' }}>2. Tổng tiền về tay:</span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--text-dark)' }}>{formatVnd(subTotalVnd)}</strong>
                  </div>
                </div>

                {errorMsg && (
                  <div style={{ color: '#EF4444', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '10px 14px', fontSize: '0.85rem', marginBottom: '16px', textAlign: 'center', lineHeight: 1.4 }}>
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary"
                  style={{
                    width: '100%',
                    padding: '16px',
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    borderRadius: '14px',
                    boxShadow: isMinOrderMet ? '0 4px 16px rgba(0, 0, 0, 0.15)' : '0 4px 12px rgba(217, 119, 6, 0.2)',
                    background: isMinOrderMet ? undefined : 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
                    opacity: isSubmitting ? 0.6 : 1,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="lucide-spin" size={20} />
                      Đang xử lý...
                    </>
                  ) : !isMinOrderMet ? (
                    `Cần thêm ${formatVnd(shortfallVnd)} để Đặt Hàng`
                  ) : (
                    'Xác Nhận Đặt Hàng & Thanh Toán'
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
