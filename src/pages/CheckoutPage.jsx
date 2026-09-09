import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext.js';
import { useToast } from '../components/ToastContext';
import CascadingAddressSelector from '../components/CascadingAddressSelector';
import { ShieldCheck, CreditCard, Upload, ShoppingBag, ArrowLeft, CheckCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function CheckoutPage() {
  const { cart, clearCart, createOrder, rates, currentUser, updateUserProfile } = useContext(AppContext);
  const navigate = useNavigate();
  const showToast = useToast();

  const [customerName, setCustomerName] = useState(() => localStorage.getItem('tavy_temp_name') || '');
  const [customerPhone, setCustomerPhone] = useState(() => localStorage.getItem('tavy_temp_phone') || '');
  const [fullAddress, setFullAddress] = useState(() => localStorage.getItem('tavy_temp_address') || '');

  const [paymentMethod, setPaymentMethod] = useState('vietqr'); // 'vietqr' | 'woori'
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptBase64, setReceiptBase64] = useState('');
  const [senderName, setSenderName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successOrderId, setSuccessOrderId] = useState(null);

  const krwRate = rates?.KRW?.rate || 19.5;

  // Generate dynamic Mock Order ID for bank description
  const [tempOrderId] = useState(() => `TAVY-${Math.floor(100000 + Math.random() * 900000)}`);

  // Calculate cart total in VND
  const cartTotalVnd = cart.reduce((acc, item) => acc + (item.foreignPrice * item.qty * krwRate), 0);
  const depositNeededVnd = Math.round(cartTotalVnd * 0.5); // 50% deposit required

  useEffect(() => {
    if (cart.length === 0 && !successOrderId) {
      showToast('Giỏ hàng của bạn đang trống!', 'warning');
      navigate('/');
    }
  }, [cart, navigate, successOrderId, showToast]);

  useEffect(() => {
    if (currentUser) {
      if (currentUser.name) setCustomerName(currentUser.name);
      if (currentUser.phone) setCustomerPhone(currentUser.phone);
      if (currentUser.address) setFullAddress(currentUser.address);
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('tavy_temp_name', customerName);
  }, [customerName]);

  useEffect(() => {
    localStorage.setItem('tavy_temp_phone', customerPhone);
  }, [customerPhone]);

  useEffect(() => {
    localStorage.setItem('tavy_temp_address', fullAddress);
  }, [fullAddress]);

  // Handle image upload and convert to base64
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('Ảnh biên lai không được vượt quá 2MB!', 'error');
      return;
    }

    setReceiptFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptBase64(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmCheckout = async (e) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim() || !fullAddress.trim()) {
      showToast('Vui lòng điền đầy đủ thông tin giao hàng!', 'error');
      return;
    }

    if (!receiptBase64) {
      showToast('Vui lòng tải lên ảnh chụp màn hình biên lai chuyển tiền!', 'error');
      return;
    }

    setSubmitting(true);

    try {
      const orderData = {
        id: tempOrderId,
        customerName,
        customerPhone,
        customerAddress: fullAddress,
        items: cart.map(item => ({
          goodsNo: item.goodsNo,
          name: item.name,
          brand: item.brand,
          qty: item.qty,
          foreignPrice: item.foreignPrice,
          productImage: item.productImage
        })),
        foreignPrice: cart.reduce((acc, item) => acc + (item.foreignPrice * item.qty), 0),
        country: 'KRW',
        totalVnd: cartTotalVnd,
        amountPaid: depositNeededVnd,
        paymentConfirmed: false, // Wating for admin check bill
        paymentReceipt: receiptBase64,
        senderName: senderName || customerName,
        status: 'pending', // Starts at pending confirmation
        adminNote: 'Đã upload minh chứng đặt cọc 50%. Đang chờ Admin xác nhận.',
        createdAt: new Date().toISOString()
      };

      await createOrder(orderData);

      // Tự động cập nhật profile nếu đã đăng nhập và có thay đổi
      if (currentUser) {
        const needsUpdate = currentUser.name !== customerName || currentUser.phone !== customerPhone || currentUser.address !== fullAddress;
        if (needsUpdate) {
          updateUserProfile({ name: customerName, phone: customerPhone, address: fullAddress });
        }
      }

      // Xóa nháp sau khi thanh toán cọc thành công
      localStorage.removeItem('tavy_temp_name');
      localStorage.removeItem('tavy_temp_phone');
      localStorage.removeItem('tavy_temp_address');
      
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#7A4B9E', '#FFD1DC', '#F4EAD3']
      });

      setSuccessOrderId(tempOrderId);
      clearCart();
      showToast('Gửi yêu cầu thanh toán thành công!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Gặp lỗi khi tạo đơn hàng. Vui lòng thử lại!', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (successOrderId) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9F6FA', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ textAlign: 'center', backgroundColor: '#FFF', padding: '50px 40px', borderRadius: '24px', boxShadow: '0 8px 30px rgba(0,0,0,0.05)', maxWidth: '550px', width: '90%' }}>
          <CheckCircle size={64} color="#10B981" style={{ margin: '0 auto 20px auto' }} />
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#111827', marginBottom: '12px' }}>Gửi thanh toán cọc thành công!</h2>
          <p style={{ color: '#4B5563', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: '8px' }}>
            Mã đơn hàng của bạn là: <strong style={{ color: '#7A4B9E', fontFamily: 'monospace' }}>{successOrderId}</strong>
          </p>
          <p style={{ color: '#6B7280', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '32px' }}>
            Admin sẽ đối soát biên lai chuyển khoản và cập nhật trạng thái đơn hàng của bạn trong vòng 10-15 phút. Cảm ơn bạn đã lựa chọn TAVY KOREA!
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <button onClick={() => navigate('/')} style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid #D1D5DB', backgroundColor: '#FFF', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>Về trang chủ</button>
            <button onClick={() => navigate('/orders')} style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#7A4B9E', color: '#FFF', fontWeight: 600, cursor: 'pointer' }}>Xem đơn hàng của tôi</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#F9FAFB', minHeight: '100vh', padding: '40px 20px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        
        {/* Back button */}
        <button 
          onClick={() => navigate('/cart')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: 'none', background: 'none', color: '#4B5563', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, marginBottom: '24px' }}
        >
          <ArrowLeft size={18} /> Quay lại giỏ hàng
        </button>

        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#111827', marginBottom: '32px' }}>Thanh Toán Đặt Cọc Đơn Hàng</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }} className="checkout-grid">
          
          {/* CỘT 1: THÔNG TIN GIAO HÀNG & CHUYỂN KHOẢN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Form Giao Hàng */}
            <div style={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: '0 0 20px 0', borderBottom: '1px solid #F3F4F6', paddingBottom: '12px' }}>
                1. Thông tin giao hàng nhận hàng
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Họ và tên người nhận *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Nguyễn Văn A" 
                      value={customerName} 
                      onChange={e => setCustomerName(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '8px', outline: 'none', fontSize: '0.88rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Số điện thoại liên hệ *</label>
                    <input 
                      type="tel" 
                      required
                      placeholder="0912345678" 
                      value={customerPhone} 
                      onChange={e => setCustomerPhone(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '8px', outline: 'none', fontSize: '0.88rem' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Địa chỉ nhận hàng (Tỉnh, Huyện, Xã, Số nhà) *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Nhập số nhà, tên đường..." 
                    value={fullAddress} 
                    onChange={e => setFullAddress(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '8px', outline: 'none', fontSize: '0.88rem', marginBottom: '10px' }}
                  />
                  
                  {/* Selector hỗ trợ chọn địa chỉ nhanh */}
                  <div style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px' }}>
                    <span style={{ fontSize: '0.78rem', color: '#6B7280', display: 'block', marginBottom: '6px', fontWeight: 500 }}>Bộ chọn địa chỉ nhanh (Open API):</span>
                    <CascadingAddressSelector onSelectAddress={(addr) => setFullAddress(prev => prev ? `${prev}, ${addr}` : addr)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Thông Tin Chuyển Khoản */}
            <div style={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: '0 0 16px 0', borderBottom: '1px solid #F3F4F6', paddingBottom: '12px' }}>
                2. Chuyển khoản thanh toán đặt cọc
              </h3>

              {/* Method Switcher */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <button 
                  onClick={() => setPaymentMethod('vietqr')}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                    border: paymentMethod === 'vietqr' ? '2px solid #7A4B9E' : '1px solid #D1D5DB',
                    backgroundColor: paymentMethod === 'vietqr' ? '#F7F4FA' : '#FFF',
                    color: paymentMethod === 'vietqr' ? '#7A4B9E' : '#374151'
                  }}
                >
                  VietQR (Ngân hàng Việt Nam)
                </button>
                <button 
                  onClick={() => setPaymentMethod('woori')}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                    border: paymentMethod === 'woori' ? '2px solid #7A4B9E' : '1px solid #D1D5DB',
                    backgroundColor: paymentMethod === 'woori' ? '#F7F4FA' : '#FFF',
                    color: paymentMethod === 'woori' ? '#7A4B9E' : '#374151'
                  }}
                >
                  Woori Bank (Chuyển Won Hàn Quốc)
                </button>
              </div>

              {/* Payment Detail Details */}
              {paymentMethod === 'vietqr' ? (
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', backgroundColor: '#F9FAFB', padding: '16px', borderRadius: '8px' }}>
                  <img 
                    src={`https://api.vietqr.io/image/970422-03456789999-quick.jpg?amount=${depositNeededVnd}&addInfo=${tempOrderId}`}
                    alt="VietQR MB Bank" 
                    style={{ width: '150px', height: '150px', objectFit: 'contain', backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '6px', padding: 4 }}
                  />
                  <div style={{ fontSize: '0.85rem', color: '#4B5563', lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.95rem', marginBottom: '8px' }}>Quét mã chuyển khoản cọc 50%</div>
                    <div>Ngân hàng: <b>MB Bank (Ngân hàng Quân Đội)</b></div>
                    <div>Số tài khoản: <b>03456789999</b></div>
                    <div>Chủ tài khoản: <b>VU VAN TAN</b></div>
                    <div>Số tiền đặt cọc: <b style={{ color: '#DC2626' }}>{depositNeededVnd.toLocaleString()}đ</b></div>
                    <div>Nội dung chuyển khoản bắt buộc: <b style={{ color: '#7A4B9E', fontFamily: 'monospace' }}>{tempOrderId}</b></div>
                  </div>
                </div>
              ) : (
                <div style={{ backgroundColor: '#F9FAFB', padding: '16px', borderRadius: '8px', fontSize: '0.85rem', color: '#4B5563', lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.95rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CreditCard size={18} color="#7A4B9E" /> Chuyển khoản ngân hàng Woori Hàn Quốc
                  </div>
                  <div>Ngân hàng: <b>Woori Bank (우리은행)</b></div>
                  <div>Số tài khoản: <b>1002-123-456789</b></div>
                  <div>Chủ tài khoản: <b>VU VAN TAN (부반탄)</b></div>
                  <div>Số tiền Won quy đổi (100%): <b style={{ color: '#DC2626' }}>₩{(cart.reduce((acc, item) => acc + (item.foreignPrice * item.qty), 0)).toLocaleString()} Won</b></div>
                  <div style={{ marginTop: '8px', color: '#EF4444', fontWeight: 600 }}>* Vui lòng chuyển đúng số tiền Won và ghi nội dung chuyển khoản là tên của bạn khớp với thông tin đơn hàng.</div>
                </div>
              )}

            </div>

          </div>

          {/* CỘT 2: TÓM TẮT ĐƠN HÀNG & UPLOAD BIÊN LAI */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Tóm tắt giỏ hàng */}
            <div style={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: '0 0 16px 0', borderBottom: '1px solid #F3F4F6', paddingBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingBag size={18} color="#7A4B9E" /> Tóm tắt đơn hàng mua hộ
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '200px', overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
                {cart.map(item => (
                  <div key={item.goodsNo} style={{ display: 'flex', gap: '12px', alignItems: 'center', borderBottom: '1px solid #F3F4F6', paddingBottom: '8px' }}>
                    <img src={item.productImage} alt="" style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #E5E7EB' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</h4>
                      <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>SL: {item.qty} × ₩{item.foreignPrice.toLocaleString()}</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827' }}>{((item.foreignPrice * item.qty * krwRate)).toLocaleString()}đ</span>
                  </div>
                ))}
              </div>

              {/* Price Details */}
              <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4B5563' }}>
                  <span>Tỷ giá Won áp dụng ngày hôm nay:</span>
                  <span style={{ fontWeight: 600 }}>1 Won = {krwRate} VND</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4B5563' }}>
                  <span>Tổng tiền hàng (quy đổi VND):</span>
                  <span style={{ fontWeight: 600 }}>{cartTotalVnd.toLocaleString()}đ</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4B5563', fontSize: '0.78rem', fontStyle: 'italic', backgroundColor: '#FEF3C7', padding: '6px 10px', borderRadius: '6px' }}>
                  <span>* Lưu ý: Giá trên chưa bao gồm cước vận chuyển Air (180k/kg) tính khi hàng về tới kho Hà Nội/Sài Gòn.</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #E5E7EB', paddingTop: '10px', fontSize: '0.98rem', fontWeight: 800, color: '#111827' }}>
                  <span>Cần đặt cọc trước (50%):</span>
                  <span style={{ color: '#DC2626', fontSize: '1.1rem' }}>{depositNeededVnd.toLocaleString()}đ</span>
                </div>
              </div>
            </div>

            {/* Upload Minh Chứng */}
            <div style={{ backgroundColor: '#FFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: '0 0 16px 0', borderBottom: '1px solid #F3F4F6', paddingBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={18} color="#7A4B9E" /> 3. Xác nhận đã chuyển khoản
              </h3>

              <form onSubmit={handleConfirmCheckout}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Tên người chuyển khoản *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Tên khớp trên biên lai chuyển tiền" 
                      value={senderName} 
                      onChange={e => setSenderName(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #D1D5DB', borderRadius: '8px', outline: 'none', fontSize: '0.88rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Ảnh chụp màn hình biên lai giao dịch *</label>
                    <div style={{ border: '2px dashed #D1D5DB', borderRadius: '8px', padding: '20px', textAlign: 'center', cursor: 'pointer', position: 'relative', backgroundColor: '#F9FAFB' }}>
                      <input 
                        type="file" 
                        accept="image/*" 
                        required
                        onChange={handleFileChange}
                        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                      />
                      {receiptFile ? (
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#059669', marginBottom: '4px' }}>✓ Đã chọn ảnh biên lai thành công</div>
                          <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>{receiptFile.name} ({(receiptFile.size/1024).toFixed(0)} KB)</div>
                          {receiptBase64 && (
                            <img src={receiptBase64} alt="Receipt preview" style={{ height: '80px', marginTop: '10px', objectFit: 'contain', border: '1px solid #E5E7EB', borderRadius: '4px' }} />
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#6B7280' }}>
                          <Upload size={24} />
                          <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>Bấm để chọn file ảnh biên lai chuyển khoản</span>
                          <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>Định dạng JPG, PNG, WEBP (Tối đa 2MB)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: '100%', padding: '14px', borderRadius: '12px', border: 'none', cursor: submitting ? 'default' : 'pointer',
                    backgroundColor: '#7A4B9E', color: '#FFF', fontWeight: 700, fontSize: '0.95rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    boxShadow: '0 4px 12px rgba(122, 75, 158, 0.25)',
                    opacity: submitting ? 0.7 : 1, transition: 'all 0.2s'
                  }}
                >
                  <ShieldCheck size={20} />
                  {submitting ? 'ĐANG XỬ LÝ...' : 'XÁC NHẬN ĐÃ CHUYỂN KHOẢN'}
                </button>
              </form>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
