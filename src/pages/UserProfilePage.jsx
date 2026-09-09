import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { useToast } from '../components/Toast';
import { 
  User, Lock, Save, Mail, Package, LogOut, ShoppingBag, Copy, Check, ExternalLink, Settings, Sun, Moon 
} from 'lucide-react';
import CascadingAddressSelector from '../components/CascadingAddressSelector';
import ProductDetailModal from '../components/ProductDetailModal';
import { ORDER_STEPS, getOrderStepIndex } from '../data/orderStatuses';
import { getOrderTotalVnd, formatVnd, formatKrw } from '../utils/priceCalculator';

export default function UserProfilePage() {
  const { currentUser, updateUserProfile, changePassword, logoutUser, orders, rates, oliveYoungCatalog, addToCart, userTheme, setUserTheme, toggleUserTheme } = useContext(AppContext);
  const showToast = useToast();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'password' | 'orders' | 'settings'
  const [activeOrderTab, setActiveOrderTab] = useState('all');
  const [copiedCode, setCopiedCode] = useState('');
  const [detailProduct, setDetailProduct] = useState(null);

  const krwRate = rates?.KRW?.rate || 19.5;
  const serviceFeeMultiplier = 1 + (rates?.serviceFeePercent ?? 5) / 100;

  const handleProductClick = (item, order) => {
    const itemName = item?.name || order?.productName;
    const match = oliveYoungCatalog?.find(p => p.id === item?.productId || (itemName && p.name?.toLowerCase() === itemName.toLowerCase()));
    if (match) {
      setDetailProduct(match);
    } else {
      setDetailProduct({
        id: item?.productId || order?.id || 'temp-id',
        name: itemName || 'Sản phẩm Hàn Quốc',
        brand: item?.brand || order?.brand || 'Olive Young',
        productImage: item?.productImage || order?.productImage,
        images: item?.productImage ? [item.productImage] : (order?.productImage ? [order.productImage] : []),
        foreignPrice: item?.foreignPrice || order?.foreignPrice || 0,
        description: 'Sản phẩm mua hộ trực tiếp từ Hàn Quốc.',
        options: item?.options || order?.options || 'Tiêu chuẩn'
      });
    }
  };

  // Form states
  const [name, setName] = useState(currentUser?.name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [address, setAddress] = useState(currentUser?.address || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Sync state with currentUser changes (e.g., initial load or updates)
  const [prevUserUid, setPrevUserUid] = useState(null);
  if (currentUser && (currentUser.uid || currentUser.id) !== prevUserUid) {
    setPrevUserUid(currentUser.uid || currentUser.id);
    setName(currentUser.name || '');
    setPhone(currentUser.phone || '');
    setAddress(currentUser.address || '');
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      if (showToast) showToast('Vui lòng nhập họ và tên!', 'error');
      return;
    }

    const phoneRegex = /^0[3|5|7|8|9][0-9]{8}$/;
    if (!phoneRegex.test(phone)) {
      if (showToast) showToast('Số điện thoại không hợp lệ. Vui lòng nhập SĐT gồm 10 chữ số bắt đầu bằng 03, 05, 07, 08, 09.', 'error');
      return;
    }

    if (!address || address.trim() === "" || address.includes("Chưa chọn")) {
      if (showToast) showToast('Vui lòng chọn địa chỉ nhận hàng đầy đủ.', 'error');
      return;
    }

    const res = await updateUserProfile({
      name,
      phone,
      address
    });

    if (res.success) {
      if (showToast) showToast('Cập nhật hồ sơ cá nhân thành công!', 'success');
    } else {
      if (showToast) showToast(res.message || 'Lỗi cập nhật hồ sơ', 'error');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (!currentPassword) {
      if (showToast) showToast('Vui lòng nhập mật khẩu hiện tại!', 'error');
      return;
    }
    if (currentUser?.password && currentPassword !== currentUser.password) {
      if (showToast) showToast('Mật khẩu hiện tại không chính xác!', 'error');
      return;
    }
    if (!newPassword) {
      if (showToast) showToast('Vui lòng nhập mật khẩu mới!', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      if (showToast) showToast('Mật khẩu xác nhận không trùng khớp!', 'error');
      return;
    }

    const res = changePassword ? await changePassword(currentPassword, newPassword) : await updateUserProfile({ password: newPassword });

    if (res.success) {
      if (showToast) showToast('Đổi mật khẩu thành công!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      if (showToast) showToast(res.message || 'Lỗi đổi mật khẩu', 'error');
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    if (showToast) showToast('Đã đăng xuất tài khoản test!', 'success');
    navigate('/login');
  };

  const formatVnd = (n) => (n || n === 0) ? `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} VNĐ` : '0 VNĐ';

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2500);
  };

  if (!currentUser) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center', minHeight: '60vh', backgroundColor: '#FDFBF7' }}>
        <div style={{ maxWidth: '400px', margin: '0 auto', backgroundColor: '#FFF', padding: '40px', borderRadius: '16px', border: '1px solid #E5E7EB', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <Package size={54} style={{ color: 'var(--purple-primary)', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px', color: '#111827' }}>Vui lòng đăng nhập</h2>
          <p style={{ color: '#6B7280', marginBottom: '24px', fontSize: '0.9rem', lineHeight: '1.5' }}>
            Bạn cần đăng nhập tài khoản để xem thông tin cá nhân và theo dõi đơn hàng của mình.
          </p>
          <button 
            className="btn-submit" 
            onClick={() => navigate('/login')}
            style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--purple-primary)', color: '#FFF', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            Đăng nhập ngay
          </button>
        </div>
      </div>
    );
  }

  // Lọc đơn hàng của người dùng
  const userOrders = (orders || []).filter(
    (o) =>
      (o.userEmail && o.userEmail.toLowerCase() === currentUser.email.toLowerCase()) ||
      (o.customerPhone && currentUser.phone && o.customerPhone === currentUser.phone)
  );

  const filteredOrders = userOrders.filter((order) => {
    if (activeOrderTab === 'all') return true;
    return order.status === activeOrderTab;
  });

  const steps = ORDER_STEPS;

  const getStepIndex = (statusOrOrder) => {
    return getOrderStepIndex(statusOrOrder);
  };

  const statusTabs = [
    { id: 'all', label: 'Tất cả đơn' },
    { id: 'pending', label: 'Chờ cọc' },
    { id: 'deposit_paid', label: 'Đã cọc 100%' },
    { id: 'purchased', label: 'Đang mua hộ' },
    { id: 'transit', label: 'Shipping' },
    { id: 'completed', label: 'Hoàn thành' }
  ];

  return (
    <div style={{ backgroundColor: 'var(--bg-ivory, #FDFBF7)', minHeight: '90vh', width: '100%', color: 'var(--text-dark)' }}>
      <style>{`
        .profile-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 30px;
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        @media (max-width: 992px) {
          .profile-layout {
            grid-template-columns: 1fr;
            gap: 24px;
            padding: 20px 12px;
          }
        }
        .sidebar-card {
          background-color: var(--bg-white, #FFF);
          border-radius: 16px;
          border: 1px solid var(--border-color, #E5E7EB);
          box-shadow: var(--shadow-sm, 0 4px 20px rgba(0,0,0,0.015));
          padding: 24px;
          display: flex;
          flex-direction: column;
          height: fit-content;
        }
        .content-card {
          background-color: var(--bg-white, #FFF);
          border-radius: 16px;
          border: 1px solid var(--border-color, #E5E7EB);
          box-shadow: var(--shadow-sm, 0 4px 20px rgba(0,0,0,0.015));
          padding: 30px;
        }
        @media (max-width: 768px) {
          .content-card {
            padding: 20px;
          }
        }
        .menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border: none;
          background: none;
          color: var(--text-dark, #4B5563);
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          border-radius: 12px;
          transition: all 0.2s ease;
          text-align: left;
          width: 100%;
          position: relative;
        }
        .menu-item:hover {
          background-color: var(--bg-subtle-purple, #F9FAFB);
          color: var(--purple-primary);
        }
        .menu-item.active {
          background-color: var(--purple-light, #F5F3FF);
          color: var(--purple-primary);
          font-weight: 600;
        }
        .menu-item.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 15%;
          height: 70%;
          width: 4px;
          background-color: var(--purple-primary);
          border-radius: 0 4px 4px 0;
        }
        .logout-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border: none;
          background: none;
          color: #EF4444;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          border-radius: 12px;
          transition: all 0.2s ease;
          text-align: left;
          width: 100%;
        }
        .logout-item:hover {
          background-color: #FEF2F2;
        }
        .badge-verified {
          background: #D1FAE5;
          color: #065F46;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          display: inline-block;
        }
        .avatar-circle {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          background-color: var(--purple-primary);
          color: #FFF;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          font-weight: 700;
          margin: 0 auto 12px auto;
          box-shadow: 0 4px 10px rgba(122, 75, 158, 0.15);
        }
        .input-field {
          width: 100%;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid #E5E7EB;
          outline: none;
          font-size: 0.95rem;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        .input-field:focus {
          border-color: var(--purple-primary);
          box-shadow: 0 0 0 3px rgba(122, 75, 158, 0.1);
        }
        .btn-submit {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background-color: var(--purple-primary);
          color: #FFF;
          border: none;
          padding: 14px 28px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-submit:hover {
          opacity: 0.9;
        }
        .order-tab-btn {
          padding: 8px 18px;
          border-radius: 20px;
          border: 1px solid #E5E7EB;
          background-color: #FFF;
          color: #374151;
          font-weight: 500;
          font-size: 0.85rem;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s ease;
        }
        .order-tab-btn.active {
          border-color: var(--purple-primary);
          background-color: var(--purple-primary);
          color: #FFF;
          font-weight: 700;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 20px;
        }
        .form-label {
          font-size: 0.88rem;
          font-weight: 600;
          color: #4B5563;
        }
        .order-details-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 24px;
          align-items: center;
        }
        @media (max-width: 768px) {
          .order-details-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
        }
      `}</style>

      <div className="profile-layout">
        
        {/* Left Sidebar */}
        <div className="sidebar-card">
          {/* Avatar Profile */}
          <div style={{ textAlign: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border-color, #E5E7EB)', paddingBottom: '20px' }}>
            <div className="avatar-circle">
              {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <h3 style={{ margin: '8px 0 4px 0', fontSize: '1.15rem', color: 'var(--text-dark, #111827)', fontWeight: 700 }}>
              {currentUser.name || 'Khách Hàng TAVY'}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', margin: '0 0 12px 0', color: 'var(--text-muted, #6B7280)', fontSize: '0.85rem' }}>
              <Mail size={14} />
              <span style={{ wordBreak: 'break-all' }}>{currentUser.email}</span>
            </div>
            <span className="badge-verified">
              Tài Khoản Xác Thực
            </span>
          </div>

          {/* Navigation Menu */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              className={`menu-item ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <User size={18} />
              <span>Thông tin tài khoản</span>
            </button>
            
            <button 
              className={`menu-item ${activeTab === 'password' ? 'active' : ''}`}
              onClick={() => setActiveTab('password')}
            >
              <Lock size={18} />
              <span>Đổi mật khẩu</span>
            </button>
            
            <button 
              className={`menu-item ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              <Package size={18} />
              <span>Đơn hàng của tôi</span>
            </button>

            <button 
              className={`menu-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={18} />
              <span>Cài đặt & Giao diện</span>
            </button>

            <div style={{ height: '1px', backgroundColor: 'var(--border-color, #E5E7EB)', margin: '16px 0' }} />

            <button 
              className="logout-item"
              onClick={handleLogout}
            >
              <LogOut size={18} />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>

        {/* Right Content Panel */}
        <div className="content-card">
          
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div>
              <h3 style={{ margin: '0 0 24px 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--purple-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <User size={22} />
                HỒ SƠ VÀ SỔ ĐỊA CHỈ GIAO HÀNG
              </h3>

              <form onSubmit={handleSaveProfile}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Họ và tên *</label>
                    <input
                      type="text"
                      className="input-field"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nhập họ và tên của bạn..."
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Số điện thoại chính *</label>
                    <input
                      type="tel"
                      className="input-field"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Nhập số điện thoại (10 số)..."
                      required
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <CascadingAddressSelector
                    initialAddress={currentUser?.address || address}
                    onChange={(addrInfo) => setAddress(addrInfo.fullAddress)}
                    required={true}
                  />
                </div>

                <button type="submit" className="btn-submit">
                  <Save size={18} />
                  <span>LƯU THAY ĐỔI HỒ SƠ</span>
                </button>
              </form>
            </div>
          )}

          {/* PASSWORD TAB */}
          {activeTab === 'password' && (
            <div>
              <h3 style={{ margin: '0 0 24px 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--purple-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Lock size={22} />
                ĐỔI MẬT KHẨU TÀI KHOẢN
              </h3>

              <form onSubmit={handleChangePassword}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px', marginBottom: '28px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Mật khẩu hiện tại *</label>
                    <input
                      type="password"
                      className="input-field"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Nhập mật khẩu hiện tại..."
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Mật khẩu mới *</label>
                    <input
                      type="password"
                      className="input-field"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nhập mật khẩu mới..."
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Xác nhận mật khẩu mới *</label>
                    <input
                      type="password"
                      className="input-field"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu mới..."
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="btn-submit">
                  <Save size={18} />
                  <span>CẬP NHẬT MẬT KHẨU</span>
                </button>
              </form>
            </div>
          )}

          {/* ORDERS TAB */}
          {activeTab === 'orders' && (
            <div>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--purple-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Package size={22} />
                ĐƠN HÀNG CỦA TÔI
              </h3>

              {/* Filter Tabs */}
              <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', marginBottom: '28px', paddingBottom: '8px' }}>
                {statusTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveOrderTab(tab.id)}
                    className={`order-tab-btn ${activeOrderTab === tab.id ? 'active' : ''}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {filteredOrders.length === 0 ? (
                <div style={{ border: '1px dashed #D1D5DB', borderRadius: '16px', padding: '60px 20px', textAlign: 'center' }}>
                  <ShoppingBag size={48} style={{ color: 'var(--purple-primary)', marginBottom: '12px', opacity: 0.8 }} />
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>Chưa tìm thấy đơn hàng nào</h4>
                  <p style={{ fontSize: '0.9rem', color: '#6B7280', marginBottom: '20px' }}>
                    Hãy chọn mua các sản phẩm Mỹ phẩm & Thực phẩm chức năng Hàn Quốc chất lượng!
                  </p>
                  <button className="btn-submit" onClick={() => navigate('/')}>
                    Khám phá sản phẩm ngay
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {filteredOrders.map((order) => {
                    const currentStepIdx = getStepIndex(order.status);
                    const krwRate = rates?.KRW?.rate || 19.5;
  const serviceFeeMultiplier = 1 + (rates?.serviceFeePercent ?? 5) / 100;

                    // Tính tổng hóa đơn 100% chuẩn xác
                    const displayTotal = getOrderTotalVnd(order, rates);

                    return (
                      <div
                        key={order.id}
                        style={{
                          backgroundColor: 'var(--bg-white, #FFF)',
                          borderRadius: '16px',
                          border: '1px solid var(--border-color, #E5E7EB)',
                          boxShadow: 'var(--shadow-sm)',
                          overflow: 'hidden'
                        }}
                      >
                        {/* Order Top Bar */}
                        <div style={{
                          padding: '16px 24px',
                          backgroundColor: 'var(--bg-subtle-purple, #F9FAFB)',
                          borderBottom: '1px solid var(--border-color, #E5E7EB)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '12px'
                        }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6B7280)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>MÃ ĐƠN HÀNG</span>
                            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--purple-primary)', margin: '2px 0 0 0' }}>{order.id}</h4>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6B7280)' }}>Ngày đặt:</span>
                              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark, #374151)' }}>
                                {new Date(order.createdAt).toLocaleDateString('vi-VN')}
                              </div>
                            </div>

                            <div style={{ textAlign: 'right', paddingLeft: '15px', borderLeft: '1px solid var(--border-color, #E5E7EB)' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6B7280)' }}>Tổng thanh toán:</span>
                              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-dark, #111827)' }}>
                                {formatVnd(displayTotal)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Progress Bar 9 Bước */}
                        <div style={{ padding: '30px 24px', backgroundColor: 'var(--bg-subtle-purple, #FDFBFF)', borderBottom: '1px solid var(--border-color, #E5E7EB)', overflowX: 'auto' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', minWidth: '700px' }}>
                            
                            {/* Line nối */}
                            <div style={{
                              position: 'absolute',
                              top: '16px',
                              left: '5%',
                              right: '5%',
                              height: '3px',
                              backgroundColor: 'var(--border-color, #E5E7EB)',
                              zIndex: 1
                            }}>
                              <div style={{
                                height: '100%',
                                backgroundColor: 'var(--purple-primary)',
                                width: `${(currentStepIdx / (steps.length - 1)) * 100}%`,
                                transition: 'width 0.4s ease'
                              }}></div>
                            </div>

                            {/* Step Circles */}
                            {steps.map((st, idx) => {
                              const isCompleted = idx <= currentStepIdx;
                              const isCurrent = idx === currentStepIdx;

                              return (
                                <div key={st.key} style={{ zIndex: 2, textAlign: 'center', flex: 1 }}>
                                  <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    backgroundColor: isCompleted ? 'var(--purple-primary)' : 'var(--bg-white, #FFF)',
                                    color: isCompleted ? '#FFF' : 'var(--text-muted, #9CA3AF)',
                                    border: isCompleted ? '2px solid var(--purple-primary)' : '2px solid var(--border-color, #E5E7EB)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    marginBottom: '8px',
                                    boxShadow: isCurrent ? '0 0 0 4px rgba(122, 75, 158, 0.2)' : 'none',
                                    transition: 'all 0.3s ease'
                                  }}>
                                    {isCompleted ? <Check size={16} /> : idx + 1}
                                  </div>
                                  <div style={{
                                    fontSize: '0.75rem',
                                    fontWeight: isCurrent ? 700 : 500,
                                    color: isCompleted ? 'var(--purple-primary)' : '#6B7280',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {st.title}
                                  </div>
                                </div>
                              );
                            })}

                          </div>
                        </div>

                        {/* Tracking Code Bar & Info */}
                        {(() => {
                          const showTracking = Boolean(order.trackingCode || (order.paymentStatus === 'paid' && order.status !== 'pending'));
                          return (
                            <div style={{ padding: '20px 24px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: showTracking ? '1.2fr 1fr' : '1fr', gap: '20px', alignItems: 'center' }}>
                                
                                {/* Chi tiết sản phẩm */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                  {order.items ? order.items.map((item, idx) => {
                                    const itemPrice = item.priceVnd || item.price || Math.round((Number(item.foreignPrice ?? item.priceKrw ?? item.priceWon) || 0) * krwRate * serviceFeeMultiplier);
                                    const itemTotal = itemPrice * (item.qty || 1);
                                    return (
                                      <div key={idx} style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', borderBottom: idx < order.items.length - 1 ? '1px dashed #E5E7EB' : 'none', paddingBottom: idx < order.items.length - 1 ? '12px' : 0 }}>
                                        <div 
                                          onClick={() => handleProductClick(item, order)}
                                          style={{ display: 'flex', gap: '16px', alignItems: 'center', flex: 1, cursor: 'pointer' }}
                                          title="Bấm để xem chi tiết sản phẩm"
                                        >
                                          <img src={item.productImage} alt="" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #E5E7EB', transition: 'transform 0.2s ease' }} />
                                          <div>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--purple-primary)', marginBottom: '4px', lineHeight: '1.4', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                              <span>{item.name}</span>
                                              <ExternalLink size={14} style={{ opacity: 0.7 }} />
                                            </h4>
                                            <p style={{ fontSize: '0.8rem', color: '#6B7280', margin: 0 }}>
                                              {item.options ? `${item.options} | ` : ''}Số lượng: x{item.qty || 1}
                                            </p>
                                          </div>
                                        </div>
                                        <div style={{ textAlign: 'right', minWidth: '130px' }}>
                                          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--purple-primary)' }}>
                                            {formatVnd(itemTotal)}
                                          </div>
                                          <div style={{ fontSize: '0.78rem', color: '#6B7280', marginTop: '2px' }}>
                                            {formatVnd(itemPrice)} × {item.qty || 1}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }) : (
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <div 
                                        onClick={() => handleProductClick(null, order)}
                                        style={{ display: 'flex', gap: '16px', alignItems: 'center', flex: 1, cursor: 'pointer' }}
                                        title="Bấm để xem chi tiết sản phẩm"
                                      >
                                        {order.productImage && (
                                          <img src={order.productImage} alt="" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #E5E7EB' }} />
                                        )}
                                        <div>
                                          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--purple-primary)', marginBottom: '4px', lineHeight: '1.4', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span>{order.productName}</span>
                                            <ExternalLink size={14} style={{ opacity: 0.7 }} />
                                          </h4>
                                          <p style={{ fontSize: '0.8rem', color: '#6B7280', margin: 0 }}>
                                            Thương hiệu: {order.brand} | Quy cách: {order.options} | Số lượng: x{order.qty || 1}
                                          </p>
                                        </div>
                                      </div>
                                      <div style={{ textAlign: 'right', minWidth: '130px' }}>
                                        {(() => {
                                          const unitVnd = Math.round((Number(order.foreignPrice ?? order.priceKrw ?? order.priceWon) || 0) * krwRate * serviceFeeMultiplier);
                                          return (
                                            <>
                                              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--purple-primary)' }}>
                                                {formatVnd(unitVnd * (order.qty || 1))}
                                              </div>
                                              <div style={{ fontSize: '0.78rem', color: '#6B7280', marginTop: '2px' }}>
                                                {formatVnd(unitVnd)} × {order.qty || 1}
                                              </div>
                                            </>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  )}
                                  {order.adminNote && (
                                    <div style={{ marginTop: '4px' }}>
                                      <p style={{ fontSize: '0.8rem', color: '#D97706', backgroundColor: '#FEF3C7', padding: '6px 12px', borderRadius: '8px', display: 'inline-block', margin: 0 }}>
                                        💬 Ghi chú từ Admin: {order.adminNote}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* Mã Vận Đơn Air (Chỉ hiện khi đã cọc 100% hoặc có mã vận thực) */}
                                {showTracking && (
                                  <div style={{ backgroundColor: '#F9FAFB', padding: '14px 18px', borderRadius: '12px', border: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                      <span style={{ fontSize: '0.72rem', color: '#6B7280', display: 'block', fontWeight: 600, letterSpacing: '0.5px' }}>MÃ VẬN ĐƠN (AIR HÀN - VIỆT)</span>
                                      <strong style={{ fontSize: '0.95rem', fontFamily: 'monospace', color: 'var(--purple-primary)', display: 'block', marginTop: '2px' }}>
                                        {order.trackingCode || 'Đang cập nhật...'}
                                      </strong>
                                    </div>

                                    {order.trackingCode && (
                                      <button
                                        onClick={() => handleCopyCode(order.trackingCode)}
                                        style={{
                                          backgroundColor: copiedCode === order.trackingCode ? '#10B981' : 'var(--purple-primary)',
                                          color: '#FFF',
                                          border: 'none',
                                          padding: '8px 14px',
                                          borderRadius: '8px',
                                          fontSize: '0.78rem',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          transition: 'all 0.2s ease'
                                        }}
                                      >
                                        {copiedCode === order.trackingCode ? <Check size={14} /> : <Copy size={14} />}
                                        <span>{copiedCode === order.trackingCode ? 'Đã chép' : 'Sao chép'}</span>
                                      </button>
                                    )}
                                  </div>
                                )}

                              </div>
                            </div>
                          );
                        })()}

                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB 4: CÀI ĐẶT & GIAO DIỆN HIỂN THỊ (SETTINGS & THEME)         */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'settings' && (
            <div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--purple-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Settings size={22} />
                CÀI ĐẶT & GIAO DIỆN HIỂN THỊ
              </h3>
              <p style={{ margin: '0 0 24px 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                Tùy chỉnh giao diện theo sở thích để có trải nghiệm mua sắm thoải mái và thuận mắt nhất. Cài đặt được lưu riêng cho trình duyệt này.
              </p>

              {/* Theme Selection Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '28px' }}>
                {/* 1. Light Mode Card */}
                <div 
                  onClick={() => setUserTheme('light')}
                  style={{
                    border: userTheme === 'light' ? '2px solid var(--purple-primary)' : '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '20px',
                    cursor: 'pointer',
                    backgroundColor: userTheme === 'light' ? 'rgba(122, 75, 158, 0.06)' : 'var(--bg-white)',
                    boxShadow: userTheme === 'light' ? '0 4px 14px rgba(122, 75, 158, 0.12)' : 'none',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                >
                  {userTheme === 'light' && (
                    <span style={{
                      position: 'absolute', top: '14px', right: '14px',
                      backgroundColor: 'var(--purple-primary)', color: '#FFF',
                      fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px',
                      borderRadius: '20px'
                    }}>
                      ✓ Đang dùng
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <div style={{
                      width: '42px', height: '42px', borderRadius: '12px',
                      backgroundColor: '#FEF3C7', color: '#D97706',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Sun size={24} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-dark)' }}>
                        Chế độ Sáng (Light)
                      </h4>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Mặc định tinh tế</span>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    Tông màu ngà ấm áp (Ivory & Gold), phù hợp sử dụng vào ban ngày và nơi có đầy đủ ánh sáng tự nhiên.
                  </p>
                </div>

                {/* 2. Dark Mode Card */}
                <div 
                  onClick={() => setUserTheme('dark')}
                  style={{
                    border: userTheme === 'dark' ? '2px solid var(--purple-primary)' : '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '20px',
                    cursor: 'pointer',
                    backgroundColor: userTheme === 'dark' ? 'rgba(157, 104, 202, 0.12)' : 'var(--bg-white)',
                    boxShadow: userTheme === 'dark' ? '0 4px 14px rgba(157, 104, 202, 0.18)' : 'none',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                >
                  {userTheme === 'dark' && (
                    <span style={{
                      position: 'absolute', top: '14px', right: '14px',
                      backgroundColor: 'var(--purple-primary)', color: '#FFF',
                      fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px',
                      borderRadius: '20px'
                    }}>
                      ✓ Đang dùng
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <div style={{
                      width: '42px', height: '42px', borderRadius: '12px',
                      backgroundColor: '#312E81', color: '#A5B4FC',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Moon size={24} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-dark)' }}>
                        Chế độ Tối (Dark)
                      </h4>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Neutral Dark Slate</span>
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    Tông màu đen chì dịu mắt, độ tương phản cao, giúp giảm chói lóa và chống mỏi mắt khi mua sắm ban đêm.
                  </p>
                </div>
              </div>

              {/* Quick Toggle Switch Banner */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderRadius: '12px',
                backgroundColor: 'var(--bg-subtle-purple)',
                border: '1px solid var(--border-color)'
              }}>
                <div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-dark)' }}>
                    Bật Chế Độ Tối (Dark Mode)
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {userTheme === 'dark' ? 'Đang bật - Giúp bảo vệ mắt khi mua sắm ban đêm' : 'Đang tắt - Đang hiển thị giao diện ban ngày'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={toggleUserTheme}
                  style={{
                    width: '54px',
                    height: '30px',
                    borderRadius: '15px',
                    backgroundColor: userTheme === 'dark' ? 'var(--purple-primary)' : '#CBD5E1',
                    border: 'none',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'background-color 0.25s ease',
                    padding: '3px'
                  }}
                  aria-label="Công tắc bật tắt chế độ tối"
                >
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: '#FFF',
                    transform: userTheme === 'dark' ? 'translateX(24px)' : 'translateX(0)',
                    transition: 'transform 0.25s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}>
                    {userTheme === 'dark' ? <Moon size={13} color="var(--purple-primary)" /> : <Sun size={13} color="#F59E0B" />}
                  </div>
                </button>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Popup Modal Chi Tiết Sản Phẩm */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          krwRate={krwRate * serviceFeeMultiplier}
          onClose={() => setDetailProduct(null)}
          hideAddToCart={true}
        />
      )}

    </div>
  );
}
