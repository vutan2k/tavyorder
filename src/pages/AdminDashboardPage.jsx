import React, { useContext, useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { useToast } from '../components/Toast';
import AdminProductCatalog from '../components/AdminProductCatalog';
import AdminProductSourcing from '../components/AdminProductSourcing';
import AdminOrderManager from '../components/AdminOrderManager';
import AdminUserManager from '../components/AdminUserManager';
import AdminAiManager from '../components/AdminAiManager';
import { APP_VERSION } from '../data/appVersion';
import { getOrderTotalVnd } from '../utils/priceCalculator';
import { aggregateCustomers } from '../utils/customerAggregator';
import { verifyAdminSession, AUTH_GUARD_CONFIG } from '../utils/adminAuthGuard';
import {
  BarChart3,
  ShoppingBag,
  Zap,
  Layers,
  LogOut,
  RefreshCw,
  TrendingUp,
  CreditCard,
  Calculator,
  ChevronRight,
  Menu,
  X,
  Clock,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Inbox,
  Sun,
  Moon,
  Users,
  FileText,
  Bot
} from 'lucide-react';

export default function AdminDashboardPage() {
  const {
    isAdminAuthenticated,
    logoutAdmin,
    orders,
    rates,
    updateRates,
    products,
    pendingProducts,
    adminTheme,
    setAdminTheme,
    toggleAdminTheme,
    usersList
  } = useContext(AppContext);
  const isDark = adminTheme === 'dark';
  const navigate = useNavigate();
  const location = useLocation();
  const showToast = useToast();

  // Tabs chuẩn E-commerce: Overview | Orders | Users | Products | Sourcing | Settings
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'orders' | 'users' | 'products' | 'sourcing' | 'settings'
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Tổng số lượng khách hàng thực tế trong hệ thống (R1 Badge)
  const totalCustomers = useMemo(() => {
    return aggregateCustomers(usersList, orders, rates).length;
  }, [usersList, orders, rates]);

  // Sync activeTab from URL pathname
  useEffect(() => {
    const path = (location.pathname || '').toLowerCase();
    if (path.includes('/products') || path.includes('/catalog')) {
      setActiveTab('products');
    } else if (path.includes('/sourcing') || path.includes('/pending')) {
      setActiveTab('sourcing');
    } else if (path.includes('/orders')) {
      setActiveTab('orders');
    } else if (path.includes('/users') || path.includes('/customers')) {
      setActiveTab('users');
    } else if (path.includes('/ai-manager') || path.includes('/agent') || path.includes('/pho-tuong')) {
      setActiveTab('ai-manager');
    } else if (path.includes('/settings') || path.includes('/rates')) {
      setActiveTab('settings');
    } else if (path.includes('/overview') || path.includes('/dashboard') || path === '/admin' || path === '/admin/') {
      setActiveTab('overview');
    }
  }, [location.pathname]);

  // Redirect to login if not authenticated or session token invalid
  useEffect(() => {
    const sessionToken = typeof window !== 'undefined' ? localStorage.getItem(AUTH_GUARD_CONFIG.SESSION_STORAGE_KEY) : null;
    const isSessionValid = isAdminAuthenticated && verifyAdminSession(sessionToken);
    if (!isSessionValid) {
      if (isAdminAuthenticated) {
        logoutAdmin();
      }
      navigate('/admin/login', { replace: true });
    }
  }, [isAdminAuthenticated, navigate, logoutAdmin]);

  // Quick Currency Converter state
  const [calcWon, setCalcWon] = useState('1000');

  const krwRate = rates?.KRW?.rate || 19.5;
  const serviceFee = rates?.serviceFeePercent || 5;

  const calcVnd = useMemo(() => {
    const won = parseFloat(String(calcWon).replace(/,/g, '')) || 0;
    const vnd = Math.round(won * krwRate * (1 + serviceFee / 100));
    return vnd.toLocaleString('vi-VN');
  }, [calcWon, krwRate, serviceFee]);

  // Settings inputs
  const [krwRateInput, setKrwRateInput] = useState(rates?.KRW?.rate || 19.5);
  const [serviceFeeInput, setServiceFeeInput] = useState(rates?.serviceFeePercent || 5);
  const [isSavingRates, setIsSavingRates] = useState(false);

  useEffect(() => {
    if (rates?.KRW?.rate !== undefined) setKrwRateInput(rates.KRW.rate);
    if (rates?.serviceFeePercent !== undefined) setServiceFeeInput(rates.serviceFeePercent);
  }, [rates?.KRW?.rate, rates?.serviceFeePercent]);

  // Current time clocks (Seoul KST & Vietnam ICT)
  const [timeNow, setTimeNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTimeNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seoulTimeStr = useMemo(() => {
    return timeNow.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
  }, [timeNow]);

  const vnTimeStr = useMemo(() => {
    return timeNow.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
  }, [timeNow]);

  // Phân tích việc cần làm khẩn cấp
  const urgentQueue = useMemo(() => {
    const needQuote = orders.filter(o => o.status === 'pending');
    const needPurchase = orders.filter(o => o.status === 'deposit_paid' || o.status === 'paid' || o.status === 'purchasing_korea');
    return { needQuote, needPurchase };
  }, [orders]);

  // Tổng doanh số GMV
  const totalGmvVnd = useMemo(() => {
    return orders.reduce((sum, order) => {
      return sum + getOrderTotalVnd(order, krwRate, serviceFee);
    }, 0);
  }, [orders, krwRate, serviceFee]);

  const handleSwitchTab = (tabId) => {
    setActiveTab(tabId);
    setSidebarOpen(false);
    navigate(`/admin/${tabId}`, { replace: true });
  };

  // 🖐️ Mobile Touch Gesture Engine: Tab swipe + Edge swipe drawer
  const touchStartRef = useRef({ x: 0, y: 0, time: 0, isIgnore: false });
  const [swipeIndicator, setSwipeIndicator] = useState(null);

  const getTabTitle = (id) => {
    switch (id) {
      case 'overview': return 'Tổng Quan';
      case 'orders': return 'Đơn Hàng';
      case 'users': return 'Khách Hàng';
      case 'products': return 'Kho Sản Phẩm';
      case 'sourcing': return 'Kho Nạp Hàng';
      case 'settings': return 'Cài Đặt';
      default: return id;
    }
  };

  const triggerSwipeFeedback = (text) => {
    setSwipeIndicator(text);
    setTimeout(() => {
      setSwipeIndicator(null);
    }, 750);
  };

  const handleGlobalTouchStart = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];
    const target = e.target;

    // Do not trigger tab swipe if touching inside a table, input, or horizontal nav
    const isIgnore = Boolean(
      target.closest('table') ||
      target.closest('input, textarea, select, button') ||
      target.closest('.admin-mobile-pills-bar') ||
      target.closest('.admin-mobile-bottom-nav') ||
      target.closest('[data-swipe-ignore="true"]') ||
      target.closest('.overflow-x-auto')
    );

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      isIgnore
    };
  };

  const handleGlobalTouchEnd = (e) => {
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    const startX = touchStartRef.current.x;

    // 1. Edge swipe from left edge (< 40px) to open sidebar drawer
    if (startX < 40 && deltaX > 60 && Math.abs(deltaY) < 55) {
      setSidebarOpen(true);
      return;
    }

    // 2. Swipe left on open sidebar to close it
    if (sidebarOpen && deltaX < -50 && Math.abs(deltaY) < 65) {
      setSidebarOpen(false);
      return;
    }

    // 3. Tab swipe (when sidebar is closed and not inside table/input)
    if (!sidebarOpen && !touchStartRef.current.isIgnore && deltaTime < 450 && Math.abs(deltaX) > 65 && Math.abs(deltaY) < 45) {
      const tabOrder = ['overview', 'orders', 'users', 'products', 'sourcing', 'settings'];
      const currentIndex = tabOrder.indexOf(activeTab);

      if (deltaX < 0) {
        // Swiped Left ➔ Next Tab
        if (currentIndex < tabOrder.length - 1) {
          const nextTab = tabOrder[currentIndex + 1];
          handleSwitchTab(nextTab);
          triggerSwipeFeedback(`➔ ${getTabTitle(nextTab)}`);
        }
      } else {
        // Swiped Right ➔ Previous Tab
        if (currentIndex > 0) {
          const prevTab = tabOrder[currentIndex - 1];
          handleSwitchTab(prevTab);
          triggerSwipeFeedback(`← ${getTabTitle(prevTab)}`);
        }
      }
    }
  };

  const handleSaveRates = async (e) => {
    e.preventDefault();
    setIsSavingRates(true);
    try {
      if (updateRates) {
        await updateRates({
          KRW: { rate: parseFloat(krwRateInput) || 19.5 },
          serviceFeePercent: parseFloat(serviceFeeInput) || 5
        });
      }
      if (showToast) showToast('Đã lưu cấu hình tỷ giá & phí dịch vụ thành công!', 'success');
    } catch {
      if (showToast) showToast('Lỗi khi lưu tỷ giá!', 'error');
    } finally {
      setIsSavingRates(false);
    }
  };

  const handleLogout = () => {
    logoutAdmin();
    navigate('/admin/login');
  };

  return (
    <div 
      className={`admin-dashboard-root ${isDark ? 'admin-dark' : ''}`}
      data-admin-theme={adminTheme}
      onTouchStart={handleGlobalTouchStart}
      onTouchEnd={handleGlobalTouchEnd}
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: isDark ? '#0B0F19' : '#F8FAFC',
        color: isDark ? '#F8FAFC' : '#0F172A',
        fontFamily: 'inherit',
        overflowX: 'hidden',
        width: '100%',
        maxWidth: '100vw'
      }}
    >
      {/* 🚀 Floating Swipe Feedback Indicator */}
      {swipeIndicator && (
        <div className="admin-swipe-indicator">
          {swipeIndicator}
        </div>
      )}

      {/* 📱 Mobile Top Navbar */}
      <div style={{
        display: 'none',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '60px',
        backgroundColor: '#0F172A',
        color: '#FFF',
        padding: '0 16px',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 900,
        borderBottom: '1px solid #1E293B'
      }} className="admin-mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', padding: '6px' }}
            aria-label="Mở Menu Điều Hướng"
          >
            <Menu size={22} />
          </button>
          <span style={{ fontWeight: 900, fontSize: '0.98rem', letterSpacing: '-0.01em' }}>TAVY ADMIN</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={toggleAdminTheme}
            style={{
              background: 'none',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '6px',
              color: isDark ? '#FDE047' : '#94A3B8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title={isDark ? "Giao diện Sáng" : "Giao diện Tối"}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{seoulTimeStr}</div>
        </div>
      </div>

      {/* 📱 Mobile Quick Tab Pills Bar */}
      <div className="admin-mobile-pills-bar" data-swipe-ignore="true">
        {[
          { id: 'overview', label: 'Tổng Quan' },
          { id: 'orders', label: `Đơn Hàng (${orders.length})` },
          { id: 'users', label: `Khách Hàng (${totalCustomers})` },
          { id: 'products', label: `Kho SP (${products.length})` },
          { id: 'sourcing', label: `Nạp Hàng (${pendingProducts?.length || 0})` },
          { id: 'settings', label: 'Cài Đặt Tỷ Giá' }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleSwitchTab(tab.id)}
              className={`admin-pill-tab ${isActive ? 'active' : ''}`}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: isActive ? '1px solid #8B5CF6' : (isDark ? '1px solid #334155' : '1px solid #CBD5E1'),
                backgroundColor: isActive ? '#8B5CF6' : (isDark ? '#1E293B' : '#FFF'),
                color: isActive ? '#FFF' : (isDark ? '#94A3B8' : '#64748B'),
                fontSize: '0.75rem',
                fontWeight: isActive ? 800 : 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 🧭 Sidebar Backdrop on Mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="admin-sidebar-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 998,
            transition: 'opacity 0.25s ease'
          }}
        />
      )}

      {/* 🧭 Sidebar Điều Hướng 4 Tab Chuẩn */}
      <aside
        style={{
          width: '260px',
          backgroundColor: '#0F172A',
          color: '#FFF',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: sidebarOpen ? 0 : '-260px',
          zIndex: 1000,
          transition: 'left 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          borderRight: '1px solid #1E293B'
        }}
        className="admin-sidebar-responsive"
      >
        {/* Brand Header */}
        <div style={{
          padding: '24px 20px',
          borderBottom: '1px solid #1E293B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>TAVY KOREA</span>
              <span style={{ fontSize: '0.65rem', backgroundColor: '#2563EB', padding: '1px 6px', borderRadius: '4px' }}>
                ADMIN
              </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '3px' }}>
              Hệ Thống Quản Trị & Vận Hành
            </div>
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            style={{ display: 'none', background: 'none', border: 'none', color: '#FFF', cursor: 'pointer' }}
            className="admin-close-mobile-btn"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Items (4 Main Tabs) */}
        <nav style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
          {[
            {
              id: 'overview',
              label: 'Tổng Quan (Overview)',
              icon: BarChart3,
              badge: urgentQueue.needQuote.length > 0 ? `${urgentQueue.needQuote.length} việc` : null,
              badgeColor: '#EF4444'
            },
            {
              id: 'ai-manager',
              label: '🤖 Phó Tướng AI',
              icon: Bot,
              badge: 'Hermes',
              badgeColor: '#C5A059'
            },
            {
              id: 'orders',
              label: 'Quản Lý Đơn Hàng',
              icon: CreditCard,
              badge: `${orders.length}`,
              badgeColor: '#3B82F6'
            },
            {
              id: 'users',
              label: 'Khách Hàng',
              icon: Users,
              badge: `${totalCustomers}`,
              badgeColor: '#8B5CF6'
            },
            {
              id: 'products',
              label: 'Kho Sản Phẩm',
              icon: ShoppingBag,
              badge: `${products.length}`,
              badgeColor: '#10B981'
            },
            {
              id: 'sourcing',
              label: 'Kho Nạp Hàng',
              icon: Zap,
              badge: pendingProducts?.length > 0 ? `${pendingProducts.length} chờ duyệt` : null,
              badgeColor: '#F59E0B'
            },
            {
              id: 'settings',
              label: 'Cài Đặt & Tỷ Giá',
              icon: Sliders
            }
          ].map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleSwitchTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: isActive ? '#2563EB' : 'transparent',
                  color: isActive ? '#FFF' : '#94A3B8',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                  width: '100%'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon size={18} color={isActive ? '#FFF' : '#94A3B8'} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span style={{
                    backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : item.badgeColor,
                    color: '#FFF',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: '999px'
                  }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer Time Clocks & Logout */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #1E293B', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '0.72rem', color: '#94A3B8', display: 'flex', justifyContent: 'space-between' }}>
            <span>🇰🇷 Seoul (KST):</span>
            <strong style={{ color: '#FFF' }}>{seoulTimeStr}</strong>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94A3B8', display: 'flex', justifyContent: 'space-between' }}>
            <span>🇻🇳 VN (ICT):</span>
            <strong style={{ color: '#FFF' }}>{vnTimeStr}</strong>
          </div>

          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              backgroundColor: '#1E293B',
              color: '#F87171',
              border: 'none',
              padding: '8px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: '4px'
            }}
          >
            <LogOut size={14} />
            <span>Đăng Xuất</span>
          </button>
        </div>
      </aside>

      {/* 🖥️ Main Content Area */}
      <main style={{ flex: 1, minHeight: '100vh', padding: '24px' }} className="admin-main-wrapper">
        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: TỔNG QUAN (OVERVIEW)                                    */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header Title */}
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0 }}>
                📊 Tổng Quan Hoạt Động & Việc Cần Làm
              </h1>
              <p style={{ margin: '4px 0 0 0', color: '#64748B', fontSize: '0.85rem' }}>
                Bảng theo dõi các chỉ số quan trọng và danh sách công việc cần xử lý ngay hôm nay.
              </p>
            </div>

            {/* 4 Essential KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              {/* Card 1: Doanh Số GMV */}
              <div className="admin-panel-card" style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', borderRadius: '12px', padding: '18px', border: isDark ? '1px solid #334155' : '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', display: 'flex', justifyContent: 'space-between' }}>
                  <span>TỔNG DOANH SỐ (GMV)</span>
                  <TrendingUp size={16} color="#10B981" />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: isDark ? '#F8FAFC' : '#0F172A', marginTop: '6px' }}>
                  {totalGmvVnd.toLocaleString('vi-VN')} đ
                </div>
                <div style={{ fontSize: '0.72rem', color: '#10B981', marginTop: '4px', fontWeight: 600 }}>
                  Từ {orders.length} đơn hàng trong hệ thống
                </div>
              </div>

              {/* Card 2: Đơn Chờ Báo Giá */}
              <div
                className="admin-panel-card"
                onClick={() => handleSwitchTab('orders')}
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#FFF',
                  borderRadius: '12px',
                  padding: '18px',
                  border: urgentQueue.needQuote.length > 0 ? '2px solid #EF4444' : (isDark ? '1px solid #334155' : '1px solid #E2E8F0'),
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#DC2626', display: 'flex', justifyContent: 'space-between' }}>
                  <span>CẦN BÁO GIÁ NGAY</span>
                  <AlertCircle size={16} color="#DC2626" />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#DC2626', marginTop: '6px' }}>
                  {urgentQueue.needQuote.length} Đơn
                </div>
                <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <span>Bấm để xử lý ngay</span>
                  <ChevronRight size={12} />
                </div>
              </div>

              {/* Card 3: Đơn Cần Đặt Mua Hàn Quốc */}
              <div
                className="admin-panel-card"
                onClick={() => handleSwitchTab('orders')}
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#FFF',
                  borderRadius: '12px',
                  padding: '18px',
                  border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38BDF8', display: 'flex', justifyContent: 'space-between' }}>
                  <span>CẦN MUA TẠI HÀN</span>
                  <CreditCard size={16} color="#38BDF8" />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#38BDF8', marginTop: '6px' }}>
                  {urgentQueue.needPurchase.length} Đơn
                </div>
                <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '4px' }}>
                  Đã cọc / Đã thanh toán
                </div>
              </div>

              {/* Card 4: Sản Phẩm Đang Bán */}
              <div
                className="admin-panel-card"
                onClick={() => handleSwitchTab('products')}
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#FFF',
                  borderRadius: '12px',
                  padding: '18px',
                  border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10B981', display: 'flex', justifyContent: 'space-between' }}>
                  <span>KHO HÀNG LIVE</span>
                  <ShoppingBag size={16} color="#10B981" />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10B981', marginTop: '6px' }}>
                  {products.length} Sản Phẩm
                </div>
                <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '4px' }}>
                  Sâm Nấm, Mỹ phẩm, TPCN
                </div>
              </div>

              {/* Card 5: Hàng Chờ Duyệt */}
              <div
                className="admin-panel-card"
                onClick={() => handleSwitchTab('sourcing')}
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#FFF',
                  borderRadius: '12px',
                  padding: '18px',
                  border: (pendingProducts?.length || 0) > 0 ? '2px solid #F59E0B' : (isDark ? '1px solid #334155' : '1px solid #E2E8F0'),
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#F59E0B', display: 'flex', justifyContent: 'space-between' }}>
                  <span>HÀNG CHỜ DUYỆT</span>
                  <Zap size={16} color="#F59E0B" />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#F59E0B', marginTop: '6px' }}>
                  {pendingProducts?.length || 0} Sản Phẩm
                </div>
                <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <span>Bấm để duyệt lên web</span>
                  <ChevronRight size={12} />
                </div>
              </div>
            </div>

            {/* Bảng Danh Sách Việc Cần Làm Hôm Nay (Urgent Action Queue) */}
            <div className="admin-panel-card" style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '12px',
              padding: '20px',
              border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={18} color="#2563EB" />
                  <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                    Danh Sách Đơn Hàng Cần Xử Lý Gấp Hôm Nay
                  </span>
                </div>
                <button
                  onClick={() => handleSwitchTab('orders')}
                  style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  Xem toàn bộ Kanban ➔
                </button>
              </div>

              {urgentQueue.needQuote.length === 0 && urgentQueue.needPurchase.length === 0 ? (
                <div style={{
                  padding: '30px',
                  textAlign: 'center',
                  color: isDark ? '#34D399' : '#059669',
                  backgroundColor: isDark ? 'rgba(6, 78, 59, 0.3)' : '#ECFDF5',
                  border: isDark ? '1px solid #064E3B' : 'none',
                  borderRadius: '10px'
                }}>
                  <CheckCircle2 size={32} style={{ margin: '0 auto 8px auto' }} />
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Tuyệt vời! Không có đơn hàng nào bị tồn đọng.</div>
                  <div style={{ fontSize: '0.8rem', color: isDark ? '#A7F3D0' : '#047857', marginTop: '4px' }}>Tất cả các đơn đã được báo giá và mua hàng đầy đủ.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[...urgentQueue.needQuote, ...urgentQueue.needPurchase].map(order => (
                    <div
                      key={order.id}
                      onClick={() => handleSwitchTab('orders')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                        border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{
                          backgroundColor: order.status === 'pending' ? '#FEE2E2' : '#EFF6FF',
                          color: order.status === 'pending' ? '#DC2626' : '#2563EB',
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '6px'
                        }}>
                          {order.status === 'pending' ? 'CẦN BÁO GIÁ' : 'CẦN MUA HÀN'}
                        </span>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: isDark ? '#F8FAFC' : '#0F172A' }}>#{order.id.replace(/^ORD-?/i, '')}</span>
                          <span style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.8rem', marginLeft: '8px' }}>{order.customerName || 'Khách'} ({order.customerPhone})</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: isDark ? '#38BDF8' : '#0F172A' }}>
                          {getOrderTotalVnd(order, krwRate, serviceFee).toLocaleString('vi-VN')} đ
                        </span>
                        <ChevronRight size={14} color={isDark ? '#94A3B8' : '#64748B'} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Currency Converter Widget */}
            <div className="admin-panel-card" style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '12px',
              padding: '20px',
              border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '20px',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38BDF8', fontWeight: 800, fontSize: '0.9rem' }}>
                  <Calculator size={18} />
                  <span>Máy Tính Đổi Giá Nhanh (Won ➔ VNĐ)</span>
                </div>
                <p style={{ margin: '4px 0 12px 0', fontSize: '0.78rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                  Giá về tay = Giá sản phẩm Won * Tỷ giá ({krwRate}) + Phí dịch vụ ({serviceFee}%)
                </p>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="number"
                    value={calcWon}
                    onChange={(e) => setCalcWon(e.target.value)}
                    placeholder="Nhập giá Won..."
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                      backgroundColor: isDark ? '#0F172A' : '#FFF',
                      color: isDark ? '#F8FAFC' : '#0F172A',
                      width: '140px',
                      fontSize: '0.88rem'
                    }}
                  />
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: isDark ? '#F8FAFC' : '#0F172A' }}>₩ =</span>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#38BDF8' }}>
                    {calcVnd} VNĐ
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleSwitchTab('settings')}
                  style={{
                    backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
                    border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: isDark ? '#E2E8F0' : '#334155',
                    cursor: 'pointer'
                  }}
                >
                  Cài Đặt Tỷ Giá Won Mới ➔
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: QUẢN LÝ ĐƠN HÀNG (ORDERS KANBAN)                         */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'orders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                📦 Quản Lý Đơn Hàng & Phân Luồng Kanban
              </h1>
              <p style={{ margin: '4px 0 0 0', color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.85rem' }}>
                Phân luồng 5 bước xử lý: Báo giá ➔ Chờ cọc ➔ Đặt mua tại Hàn ➔ Vận chuyển về VN ➔ Hoàn tất.
              </p>
            </div>
            <AdminOrderManager isDark={isDark} />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB 2B: QUẢN LÝ KHÁCH HÀNG (USERS)                               */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <AdminUserManager isDark={isDark} />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: KHO SẢN PHẨM ĐANG BÁN (LIVE PRODUCT CATALOG)             */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'products' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <AdminProductCatalog isDark={isDark} />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB 4: KHO NẠP HÀNG & HÀNG CHỜ DUYỆT (SOURCING & PENDING)       */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'sourcing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                📥 Kho Nạp Hàng & Kiểm Duyệt Sản Phẩm Mới
              </h1>
              <p style={{ margin: '4px 0 0 0', color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.85rem' }}>
                Tiếp nhận sản phẩm cào từ Naver, KGC, Nonghyup, Olive Young & Extension. Kiểm duyệt chất lượng và giá trước khi xuất bản lên website.
              </p>
            </div>
            <AdminProductSourcing 
              isDark={isDark} 
              initialSubTab="pending" 
            />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB: PHÓ TƯỚNG AI (AI OPERATIONS MANAGER - HERMES)              */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'ai-manager' && (
          <AdminAiManager isDark={isDark} />
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB 4: CÀI ĐẶT & TỶ GIÁ (SETTINGS)                             */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '700px' }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                ⚙️ Cài Đặt Hệ Thống & Giao Diện
              </h1>
              <p style={{ margin: '4px 0 0 0', color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.85rem' }}>
                Thiết lập chế độ giao diện quản trị, tỷ giá chuyển đổi KRW/VND và phần trăm phí dịch vụ.
              </p>
            </div>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* GIAO DIỆN QUẢN TRỊ (ADMIN THEME SETTINGS)                    */}
            {/* ════════════════════════════════════════════════════════════ */}
            <div style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '16px',
              padding: '24px',
              border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: isDark ? '#F8FAFC' : '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isDark ? <Moon size={20} color="#38BDF8" /> : <Sun size={20} color="#F59E0B" />}
                  Giao Diện Bảng Quản Trị (Admin Theme)
                </h2>
                <p style={{ margin: '4px 0 0 0', color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.85rem' }}>
                  Tùy chỉnh chế độ hiển thị Sáng hoặc Tối (Dark Slate) để bảo vệ mắt khi làm việc ban đêm. Cấu hình được lưu độc lập trên máy này.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {/* Sáng */}
                <div
                  onClick={() => setAdminTheme('light')}
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    border: !isDark ? '2px solid #2563EB' : `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                    backgroundColor: !isDark ? 'rgba(37, 99, 235, 0.08)' : (isDark ? '#0F172A' : '#F8FAFC'),
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                      <Sun size={18} color="#F59E0B" />
                      <span>Chế độ Sáng</span>
                    </div>
                    {!isDark && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, backgroundColor: '#2563EB', color: '#FFF', padding: '2px 8px', borderRadius: '12px' }}>
                        Đang dùng
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.78rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                    Giao diện tiêu chuẩn, nền sáng xám dịu (#F8FAFC).
                  </span>
                </div>

                {/* Tối */}
                <div
                  onClick={() => setAdminTheme('dark')}
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    border: isDark ? '2px solid #38BDF8' : `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                    backgroundColor: isDark ? 'rgba(56, 189, 248, 0.12)' : (isDark ? '#0F172A' : '#F8FAFC'),
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                      <Moon size={18} color="#38BDF8" />
                      <span>Chế độ Tối (Dark Slate)</span>
                    </div>
                    {isDark && (
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, backgroundColor: '#0284C7', color: '#FFF', padding: '2px 8px', borderRadius: '12px' }}>
                        Đang dùng
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.78rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                    Giao diện tối tương phản cao (#0B0F19 & #1E293B), chống mỏi mắt.
                  </span>
                </div>
              </div>

              {/* Quick Switch Toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '12px',
                borderTop: `1px solid ${isDark ? '#334155' : '#F1F5F9'}`
              }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: isDark ? '#CBD5E1' : '#334155' }}>
                  Bật công tắc chế độ tối:
                </span>
                <button
                  type="button"
                  onClick={toggleAdminTheme}
                  style={{
                    width: '50px',
                    height: '28px',
                    borderRadius: '14px',
                    backgroundColor: isDark ? '#0284C7' : '#94A3B8',
                    border: 'none',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease',
                    padding: '2px'
                  }}
                  aria-label="Chuyển đổi giao diện Admin"
                >
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: '#FFF',
                    transform: isDark ? 'translateX(22px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}>
                    {isDark ? <Moon size={12} color="#0284C7" /> : <Sun size={12} color="#F59E0B" />}
                  </div>
                </button>
              </div>
            </div>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TỶ GIÁ & PHÍ DỊCH VỤ                                          */}
            {/* ════════════════════════════════════════════════════════════ */}
            <form onSubmit={handleSaveRates} style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '16px',
              padding: '24px',
              border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                  Tỷ Giá 1 KRW (Won Hàn Quốc) đổi sang VNĐ:
                </label>
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    value={krwRateInput}
                    onChange={(e) => setKrwRateInput(e.target.value)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                      backgroundColor: isDark ? '#0F172A' : '#FFF',
                      color: isDark ? '#F8FAFC' : '#0F172A',
                      width: '160px',
                      fontSize: '0.95rem',
                      fontWeight: 700
                    }}
                  />
                  <span style={{ fontSize: '0.85rem', color: isDark ? '#94A3B8' : '#64748B' }}>VNĐ / 1 Won</span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                  Phần Trăm Phí Dịch Vụ Mua Hộ & Bảo Hiểm (%):
                </label>
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={serviceFeeInput}
                      onChange={(e) => setServiceFeeInput(e.target.value)}
                      style={{
                        padding: '10px 38px 10px 14px',
                        borderRadius: '8px',
                        border: `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                        backgroundColor: isDark ? '#0F172A' : '#FFF',
                        color: isDark ? '#F8FAFC' : '#0F172A',
                        width: '160px',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        outline: 'none'
                      }}
                    />
                    <span style={{
                      position: 'absolute',
                      right: '12px',
                      fontWeight: 800,
                      fontSize: '0.95rem',
                      color: isDark ? '#94A3B8' : '#475569',
                      pointerEvents: 'none'
                    }}>
                      %
                    </span>
                  </div>
                  <span style={{ fontSize: '0.85rem', color: isDark ? '#94A3B8' : '#64748B' }}>% trên giá gốc sản phẩm (tự do cấu hình)</span>
                </div>
              </div>

              <div style={{ paddingTop: '12px', borderTop: `1px solid ${isDark ? '#334155' : '#F1F5F9'}` }}>
                <button
                  type="submit"
                  disabled={isSavingRates}
                  style={{
                    backgroundColor: '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 24px',
                    fontSize: '0.88rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {isSavingRates ? 'Đang lưu...' : '💾 Lưu Cấu Hình Tỷ Giá Ngay'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* 📱 Mobile Bottom Navigation Bar (Fixed at bottom on < 1024px) */}
      <nav className="admin-mobile-bottom-nav" data-swipe-ignore="true">
        {[
          { id: 'overview', label: 'Tổng Quan', icon: BarChart3, badge: urgentQueue.needQuote.length > 0 ? urgentQueue.needQuote.length : null, badgeColor: '#EF4444' },
          { id: 'orders', label: 'Đơn Hàng', icon: FileText, badge: orders.length > 0 ? orders.length : null, badgeColor: '#2563EB' },
          { id: 'users', label: 'Khách Hàng', icon: Users, badge: totalCustomers > 0 ? totalCustomers : null, badgeColor: '#8B5CF6' },
          { id: 'products', label: 'Kho SP', icon: ShoppingBag, badge: products.length > 0 ? products.length : null, badgeColor: '#10B981' },
          { id: 'sourcing', label: 'Nạp Hàng', icon: Zap, badge: pendingProducts?.length > 0 ? pendingProducts.length : null, badgeColor: '#F59E0B' },
          { id: 'settings', label: 'Cài Đặt', icon: Sliders }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleSwitchTab(tab.id)}
              className={`admin-bottom-nav-btn ${isActive ? 'active' : ''}`}
              aria-label={tab.label}
            >
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <Icon size={19} color={isActive ? '#8B5CF6' : (isDark ? '#94A3B8' : '#64748B')} />
                {tab.badge && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-5px',
                      right: '-8px',
                      backgroundColor: tab.badgeColor || '#EF4444',
                      color: '#FFF',
                      fontSize: '0.62rem',
                      fontWeight: 900,
                      minWidth: '15px',
                      height: '15px',
                      padding: '0 4px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }}
                  >
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span style={{
                fontSize: '0.66rem',
                fontWeight: isActive ? 800 : 500,
                color: isActive ? (isDark ? '#F8FAFC' : '#0F172A') : (isDark ? '#94A3B8' : '#64748B'),
                marginTop: '3px',
                whiteSpace: 'nowrap'
              }}>
                {tab.label}
              </span>
              {isActive && (
                <div style={{
                  position: 'absolute',
                  bottom: '3px',
                  width: '16px',
                  height: '3px',
                  backgroundColor: '#8B5CF6',
                  borderRadius: '2px'
                }} />
              )}
            </button>
          );
        })}
      </nav>

      <style>{`
        @media (min-width: 1024px) {
          .admin-sidebar-responsive {
            left: 0 !important;
          }
          .admin-main-wrapper {
            margin-left: 260px;
          }
          .admin-mobile-pills-bar,
          .admin-mobile-bottom-nav {
            display: none !important;
          }
        }
        @media (max-width: 1023px) {
          .admin-mobile-header {
            display: flex !important;
          }
          .admin-mobile-pills-bar {
            display: flex !important;
          }
          .admin-mobile-bottom-nav {
            display: flex !important;
          }
          .admin-main-wrapper {
            margin-left: 0 !important;
            padding: 16px 12px 90px 12px !important;
            padding-top: 116px !important;
            width: 100% !important;
            max-width: 100vw !important;
            overflow-x: hidden !important;
          }
          .admin-close-mobile-btn {
            display: block !important;
          }

          /* Chống Auto-Zoom trên iOS Safari */
          .admin-dashboard-root input,
          .admin-dashboard-root select,
          .admin-dashboard-root textarea {
            font-size: 16px !important;
          }
        }

        /* Mobile Bottom Nav Bar */
        .admin-mobile-bottom-nav {
          display: none;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 62px;
          background-color: #0F172A;
          border-top: 1px solid #1E293B;
          padding: 0 4px;
          padding-bottom: env(safe-area-inset-bottom, 6px);
          z-index: 950;
          align-items: center;
          justify-content: space-around;
          box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.25);
        }

        .admin-bottom-nav-btn {
          background: none;
          border: none;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 6px 4px;
          min-width: 48px;
          min-height: 48px;
          position: relative;
          touch-action: manipulation;
          transition: transform 0.1s ease;
        }

        .admin-bottom-nav-btn:active {
          transform: scale(0.92);
        }

        /* Mobile Quick Pills Bar */
        .admin-mobile-pills-bar {
          display: none;
          position: fixed;
          top: 60px;
          left: 0;
          right: 0;
          height: 46px;
          background-color: #0F172A;
          border-bottom: 1px solid #1E293B;
          padding: 6px 12px;
          gap: 8px;
          overflow-x: auto;
          white-space: nowrap;
          -webkit-overflow-scrolling: touch;
          z-index: 890;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .admin-mobile-pills-bar::-webkit-scrollbar {
          display: none;
        }

        /* Floating Swipe Indicator Pill */
        .admin-swipe-indicator {
          position: fixed;
          top: 116px;
          left: 50%;
          transform: translateX(-50%);
          background-color: rgba(15, 23, 42, 0.94);
          color: #FFF;
          border: 1px solid #8B5CF6;
          border-radius: 20px;
          padding: 6px 18px;
          font-size: 0.8rem;
          font-weight: 800;
          z-index: 999;
          box-shadow: 0 8px 24px rgba(139, 92, 246, 0.4);
          pointer-events: none;
          animation: adminSwipeFade 0.75s ease forwards;
        }

        @keyframes adminSwipeFade {
          0% { opacity: 0; transform: translate(-50%, -10px); }
          20% { opacity: 1; transform: translate(-50%, 0); }
          80% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -8px); }
        }

        /* Admin Dark Theme Rules */
        .admin-dark .admin-main-wrapper {
          background-color: #0B0F19;
          color: #F8FAFC;
        }
        .admin-dark h1, .admin-dark h2, .admin-dark h3 {
          color: #F8FAFC !important;
        }
        .admin-dark div[style*="background-color: #FFF"],
        .admin-dark div[style*="backgroundColor: #FFF"],
        .admin-dark div[style*="background-color: rgb(255, 255, 255)"],
        .admin-dark div[style*="backgroundColor: rgb(255, 255, 255)"],
        .admin-dark div[style*="backgroundColor: rgb(255,255,255)"] {
          background-color: #1E293B !important;
          border-color: #334155 !important;
          color: #F8FAFC !important;
        }
        .admin-dark div[style*="color: #0F172A"],
        .admin-dark div[style*="color: rgb(15, 23, 42)"],
        .admin-dark span[style*="color: #0F172A"],
        .admin-dark strong[style*="color: #0F172A"] {
          color: #F8FAFC !important;
        }
        .admin-dark div[style*="color: #64748B"],
        .admin-dark div[style*="color: rgb(100, 116, 139)"],
        .admin-dark span[style*="color: #64748B"] {
          color: #94A3B8 !important;
        }
        .admin-dark table {
          background-color: #1E293B !important;
          color: #F8FAFC !important;
        }
        .admin-dark table th {
          background-color: #0F172A !important;
          color: #94A3B8 !important;
          border-color: #334155 !important;
        }
        .admin-dark table td {
          border-color: #334155 !important;
          color: #F8FAFC !important;
        }
        .admin-dark input,
        .admin-dark select,
        .admin-dark textarea {
          background-color: #0F172A !important;
          color: #F8FAFC !important;
          border-color: #334155 !important;
        }
      `}</style>
    </div>
  );
}
