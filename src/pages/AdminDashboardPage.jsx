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
  Bot,
  ShieldCheck
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

  // Chi tiết phân tích phí dịch vụ & giá gốc
  const calcBreakdown = useMemo(() => {
    const won = parseFloat(String(calcWon).replace(/,/g, '')) || 0;
    const base = Math.round(won * krwRate);
    const fee = Math.round(base * (serviceFee / 100));
    const total = base + fee;
    return {
      baseVnd: base.toLocaleString('vi-VN'),
      feeVnd: fee.toLocaleString('vi-VN'),
      totalVnd: total.toLocaleString('vi-VN'),
      serviceFee,
      krwRate
    };
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

  // Phân tích việc cần làm khẩn cấp & đơn hàng gần nhất
  const urgentQueue = useMemo(() => {
    const needQuote = orders.filter(o => o.status === 'pending');
    const needPurchase = orders.filter(o => o.status === 'deposit_paid' || o.status === 'paid' || o.status === 'purchasing_korea');
    return { needQuote, needPurchase };
  }, [orders]);

  const displayOrders = useMemo(() => {
    const urgent = [...urgentQueue.needQuote, ...urgentQueue.needPurchase];
    if (urgent.length > 0) return { title: 'Đơn Cần Xử Lý Ngay', list: urgent.slice(0, 5), isUrgent: true };
    return { title: 'Đơn Hàng Gần Nhất', list: orders.slice(0, 5), isUrgent: false };
  }, [urgentQueue, orders]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'confirmed':
        return { label: 'ĐÃ XÁC NHẬN', bg: isDark ? '#FFFFFF' : '#000000', color: isDark ? '#000000' : '#FFFFFF' };
      case 'packed_kr':
      case 'in_kr_warehouse':
      case 'korea_warehouse':
        return { label: 'KHO SEOUL', bg: isDark ? '#27272A' : '#F4F4F5', color: isDark ? '#FAFAFA' : '#18181B' };
      case 'in_transit_air':
      case 'transit':
      case 'shipping_vietnam':
        return { label: 'ĐANG BAY', bg: isDark ? '#27272A' : '#F4F4F5', color: isDark ? '#FAFAFA' : '#18181B' };
      case 'customs_cleared':
      case 'in_vn_warehouse':
      case 'vietnam_warehouse':
        return { label: 'KHO VN', bg: isDark ? '#27272A' : '#F4F4F5', color: isDark ? '#FAFAFA' : '#18181B' };
      case 'completed':
      case 'delivered':
        return { label: 'ĐÃ GIAO', bg: isDark ? '#FFFFFF' : '#000000', color: isDark ? '#000000' : '#FFFFFF' };
      case 'pending':
        return { label: 'BÁO GIÁ', bg: isDark ? '#27272A' : '#E4E4E7', color: isDark ? '#FAFAFA' : '#09090B' };
      case 'deposit_paid':
      case 'paid':
        return { label: 'ĐÃ CỌC', bg: isDark ? '#27272A' : '#F4F4F5', color: isDark ? '#FAFAFA' : '#18181B' };
      case 'purchased':
      case 'purchasing_korea':
        return { label: 'ĐANG MUA', bg: isDark ? '#27272A' : '#F4F4F5', color: isDark ? '#FAFAFA' : '#18181B' };
      default:
        return { label: status?.toUpperCase() || 'ĐƠN HÀNG', bg: isDark ? '#27272A' : '#F4F4F5', color: isDark ? '#FAFAFA' : '#18181B' };
    }
  };

  const recentActivities = useMemo(() => {
    const acts = [];
    if (orders.length > 0) {
      orders.slice(0, 2).forEach(o => {
        acts.push({
          id: `order-${o.id}`,
          dot: isDark ? '#FFFFFF' : '#000000',
          title: `Đơn #${o.orderCode || o.id} - ${o.customerName || 'Khách'}`,
          desc: `${o.status === 'confirmed' ? 'Đã xác nhận thanh toán' : o.status === 'packed_kr' ? 'Đóng gói tại kho Seoul' : o.status} • ${getOrderTotalVnd(o, krwRate, serviceFee).toLocaleString('vi-VN')} đ`
        });
      });
    }
    acts.push({
      id: 'catalog-sync',
      dot: isDark ? '#A1A1AA' : '#71717A',
      title: `Đồng bộ ${products.length || 100} SKU Olive Young`,
      desc: `Khớp giá live Won sang VND (Tỷ giá ${krwRate} đ/₩ • Phí ${serviceFee}%)`
    });
    acts.push({
      id: 'worker-live',
      dot: isDark ? '#71717A' : '#A1A1AA',
      title: 'Worker Phó Tướng AI kết nối',
      desc: 'Lắng nghe queue ai_manager_tasks realtime trên Firestore'
    });
    return acts.slice(0, 4);
  }, [orders, products, krwRate, serviceFee, isDark]);

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
      case 'ai-manager': return 'Phó Tướng AI';
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
      const tabOrder = ['overview', 'ai-manager', 'orders', 'users', 'products', 'sourcing', 'settings'];
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
          { id: 'ai-manager', label: '🤖 Phó Tướng AI' },
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
                border: isActive ? (isDark ? '1px solid #FFF' : '1px solid #000') : (isDark ? '1px solid #334155' : '1px solid #CBD5E1'),
                backgroundColor: isActive ? (isDark ? '#FFF' : '#000') : (isDark ? '#1E293B' : '#FFF'),
                color: isActive ? (isDark ? '#000' : '#FFF') : (isDark ? '#94A3B8' : '#64748B'),
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
              <span style={{ fontSize: '0.65rem', backgroundColor: '#FFF', color: '#000', padding: '1px 6px', borderRadius: '4px', fontWeight: 900 }}>
                ADMIN
              </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#71717A', marginTop: '3px' }}>
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

        {/* Navigation Items */}
        <nav style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
          {[
            {
              id: 'overview',
              label: 'Tổng Quan',
              icon: BarChart3,
              badge: urgentQueue.needQuote.length > 0 ? `${urgentQueue.needQuote.length}` : null,
              badgeColor: '#EF4444'
            },
            {
              id: 'ai-manager',
              label: 'AI',
              icon: Bot,
              badge: 'Hermes',
              badgeColor: '#6366F1'
            },
            {
              id: 'orders',
              label: 'Quản Lý Đơn Hàng',
              icon: CreditCard,
              badge: orders.length > 0 ? `${orders.length}` : null,
              badgeColor: '#3B82F6'
            },
            {
              id: 'users',
              label: 'Khách Hàng',
              icon: Users,
              badge: totalCustomers > 0 ? `${totalCustomers}` : null,
              badgeColor: '#8B5CF6'
            },
            {
              id: 'products',
              label: 'Kho Sản Phẩm',
              icon: ShoppingBag,
              badge: products.length > 0 ? `${products.length}` : null,
              badgeColor: '#10B981'
            },
            {
              id: 'sourcing',
              label: 'Kho Nạp Hàng',
              icon: Zap,
              badge: pendingProducts?.length > 0 ? `${pendingProducts.length}` : null,
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
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                  color: isActive ? '#000000' : '#A1A1AA',
                  fontWeight: isActive ? 800 : 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                  width: '100%'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon size={18} color={isActive ? '#000000' : '#A1A1AA'} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span style={{
                    backgroundColor: isActive ? '#000000' : '#27272A',
                    color: isActive ? '#FFFFFF' : '#D4D4D8',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: '6px'
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header Title & Status Badges */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                  Tổng Quan Vận Hành
                </h1>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  backgroundColor: isDark ? '#18181B' : '#F4F4F5',
                  color: isDark ? '#F4F4F5' : '#18181B',
                  border: isDark ? '1px solid #27272A' : '1px solid #E4E4E7'
                }}>
                  KRW/VND {krwRate} • Phí {serviceFee}%
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  backgroundColor: isDark ? '#FFFFFF' : '#000000',
                  color: isDark ? '#000000' : '#FFFFFF',
                  border: 'none'
                }}>
                  Live Sync
                </span>
              </div>
            </div>

            {/* Hermes AI Command Dock */}
            <div
              style={{
                background: isDark ? '#0F172A' : '#F8FAFC',
                border: isDark ? '1px solid #1E293B' : '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  backgroundColor: isDark ? '#27272A' : '#E4E4E7',
                  color: isDark ? '#FFFFFF' : '#000000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Bot size={18} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                      Hermes AI Ops
                    </span>
                    <span style={{
                      fontSize: '0.62rem',
                      backgroundColor: isDark ? '#27272A' : '#E4E4E7',
                      color: isDark ? '#FAFAFA' : '#09090B',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontWeight: 800,
                      letterSpacing: '0.04em'
                    }}>
                      ONLINE
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '2px' }}>
                    Phó Tướng vận hành • Giám sát 102 SKU & xử lý đơn hàng tự động
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleSwitchTab('ai-manager')}
                style={{
                  padding: '7px 14px',
                  borderRadius: '7px',
                  backgroundColor: isDark ? '#FFFFFF' : '#000000',
                  color: isDark ? '#000000' : '#FFFFFF',
                  border: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'opacity 0.15s ease'
                }}
              >
                <span>Phòng Điều Hành AI</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* 🤖 Executive AI Commander Banner */}
            <div
              onClick={() => handleSwitchTab('ai-manager')}
              style={{
                background: isDark 
                  ? 'linear-gradient(135deg, #1E1B4B 0%, #0F172A 100%)' 
                  : 'linear-gradient(135deg, #EEF2FF 0%, #F8FAFC 100%)',
                border: '2px solid #6366F1',
                borderRadius: '14px',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.15)',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  backgroundColor: '#6366F1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFF',
                  flexShrink: 0
                }}>
                  <Bot size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 900, color: isDark ? '#FFF' : '#1E1B4B' }}>
                      🤖 PHÓ TƯỚNG AI (HERMES)
                    </span>
                    <span style={{ 
                      fontSize: '0.65rem', 
                      backgroundColor: '#10B981', 
                      color: '#FFF', 
                      padding: '2px 8px', 
                      borderRadius: '12px', 
                      fontWeight: 800 
                    }}>
                      ONLINE
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '2px' }}>
                    Sẵn sàng nhận lệnh điều hành, kiểm tra đơn hàng, tự động đồng bộ giá Olive Young & quản lý hệ thống.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6366F1', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0 }}>
                <span>Vào chỉ đạo</span>
                <ChevronRight size={18} />
              </div>
            </div>

            {/* 4 Essential KPI Cards */}
            <div className="admin-kpi-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '12px'
            }}>
              {/* Card 1: Doanh Số GMV */}
              <div className="admin-panel-card" style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', borderRadius: '10px', padding: '16px', border: isDark ? '1px solid #334155' : '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', display: 'flex', justifyContent: 'space-between', letterSpacing: '0.04em' }}>
                  <span>DOANH SỐ (GMV)</span>
                  <TrendingUp size={15} color={isDark ? '#FFF' : '#000'} />
                </div>
                <div className="admin-kpi-value" style={{ fontSize: '1.35rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A', marginTop: '6px', fontFamily: 'monospace, sans-serif' }}>
                  {totalGmvVnd.toLocaleString('vi-VN')} đ
                </div>
                <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#71717A', marginTop: '4px', fontWeight: 600 }}>
                  {orders.length} đơn hàng hệ thống
                </div>
              </div>

              {/* Card 2: Đơn Đang Xử Lý */}
              <div
                className="admin-panel-card"
                onClick={() => handleSwitchTab('orders')}
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#FFF',
                  borderRadius: '10px',
                  padding: '16px',
                  border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', display: 'flex', justifyContent: 'space-between', letterSpacing: '0.04em' }}>
                  <span>ĐƠN ĐANG XỬ LÝ</span>
                  <AlertCircle size={15} color={isDark ? '#FFF' : '#000'} />
                </div>
                <div className="admin-kpi-value" style={{ fontSize: '1.35rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A', marginTop: '6px', fontFamily: 'monospace, sans-serif' }}>
                  {urgentQueue.needQuote.length + urgentQueue.needPurchase.length > 0 ? `${urgentQueue.needQuote.length + urgentQueue.needPurchase.length} Đơn` : `${orders.length} Đơn`}
                </div>
                <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '4px', display: 'flex', gap: '8px' }}>
                  {urgentQueue.needQuote.length + urgentQueue.needPurchase.length > 0 ? (
                    <>
                      <span>Báo giá: <b>{urgentQueue.needQuote.length}</b></span>
                      <span>•</span>
                      <span>Mua Hàn: <b>{urgentQueue.needPurchase.length}</b></span>
                    </>
                  ) : (
                    <>
                      <span>Xác nhận: <b>{orders.filter(o => o.status === 'confirmed').length}</b></span>
                      <span>•</span>
                      <span>Kho HQ: <b>{orders.filter(o => o.status === 'packed_kr' || o.status === 'in_kr_warehouse').length}</b></span>
                    </>
                  )}
                </div>
              </div>

              {/* Card 3: Kho Hàng Live */}
              <div
                className="admin-panel-card"
                onClick={() => handleSwitchTab('products')}
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#FFF',
                  borderRadius: '10px',
                  padding: '16px',
                  border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', display: 'flex', justifyContent: 'space-between', letterSpacing: '0.04em' }}>
                  <span>KHO HÀNG LIVE</span>
                  <ShoppingBag size={15} color={isDark ? '#FFF' : '#000'} />
                </div>
                <div className="admin-kpi-value" style={{ fontSize: '1.35rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A', marginTop: '6px', fontFamily: 'monospace, sans-serif' }}>
                  {products.length} SKU
                </div>
                <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#71717A', marginTop: '4px', fontWeight: 600 }}>
                  Olive Young live sync
                </div>
              </div>

              {/* Card 4: Lợi Nhuận Ước Tính */}
              <div
                className="admin-panel-card"
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#FFF',
                  borderRadius: '10px',
                  padding: '16px',
                  border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
              >
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', display: 'flex', justifyContent: 'space-between', letterSpacing: '0.04em' }}>
                  <span>LỢI NHUẬN ƯỚC TÍNH</span>
                  <ShieldCheck size={15} color={isDark ? '#FFF' : '#000'} />
                </div>
                <div className="admin-kpi-value" style={{ fontSize: '1.35rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A', marginTop: '6px', fontFamily: 'monospace, sans-serif' }}>
                  {Math.round(totalGmvVnd * (serviceFee / (100 + serviceFee))).toLocaleString('vi-VN')} đ
                </div>
                <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '4px' }}>
                  Phí dịch vụ {serviceFee}%
                </div>
              </div>
            </div>

            {/* 2-Column Action & Activity Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
              {/* Left Column: Urgent Action Queue */}
              <div className="admin-panel-card" style={{
                backgroundColor: isDark ? '#1E293B' : '#FFF',
                borderRadius: '10px',
                padding: '18px',
                border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={16} color={isDark ? '#F8FAFC' : '#0F172A'} />
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                      {displayOrders.title}
                    </span>
                  </div>
                  <button
                    onClick={() => handleSwitchTab('orders')}
                    style={{ background: 'none', border: 'none', color: isDark ? '#F8FAFC' : '#0F172A', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    Xem tất cả ➔
                  </button>
                </div>

                {displayOrders.list.length === 0 ? (
                  <div style={{
                    padding: '28px 16px',
                    textAlign: 'center',
                    color: isDark ? '#94A3B8' : '#64748B',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#F8FAFC',
                    borderRadius: '8px'
                  }}>
                    <CheckCircle2 size={24} color={isDark ? '#F8FAFC' : '#0F172A'} style={{ margin: '0 auto 6px auto' }} />
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: isDark ? '#F8FAFC' : '#0F172A' }}>Chưa có đơn hàng</div>
                    <div style={{ fontSize: '0.75rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '2px' }}>Các đơn mới từ khách sẽ xuất hiện tại đây theo thời gian thực.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {displayOrders.list.map(order => {
                      const badge = getStatusBadge(order.status);
                      return (
                        <div
                          key={order.id}
                          onClick={() => handleSwitchTab('orders')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                            border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                              backgroundColor: badge.bg,
                              color: badge.color,
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: '4px'
                            }}>
                              {badge.label}
                            </span>
                            <div>
                              <span style={{
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                color: isDark ? '#F8FAFC' : '#0F172A',
                                backgroundColor: isDark ? '#27272A' : '#E4E4E7',
                                padding: '1px 5px',
                                borderRadius: '4px'
                              }}>
                                #{order.orderCode || order.id.replace(/^ORD-?/i, '')}
                              </span>
                              <span style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontSize: '0.82rem', fontWeight: 600, marginLeft: '8px' }}>
                                {order.customerName || 'Khách'}
                              </span>
                              <span style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.75rem', marginLeft: '4px' }}>
                                ({order.items?.length || 1} SP)
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: 'monospace' }}>
                              {getOrderTotalVnd(order, krwRate, serviceFee).toLocaleString('vi-VN')} đ
                            </span>
                            <ChevronRight size={14} color={isDark ? '#94A3B8' : '#64748B'} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: AI Operations Feed */}
              <div className="admin-panel-card" style={{
                backgroundColor: isDark ? '#1E293B' : '#FFF',
                borderRadius: '10px',
                padding: '18px',
                border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={16} color={isDark ? '#F8FAFC' : '#0F172A'} />
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                      Nhật Ký Tự Động Hóa
                    </span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                    Realtime Feed
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {recentActivities.map(act => (
                    <div
                      key={act.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                        border: isDark ? '1px solid #334155' : '1px solid #E2E8F0'
                      }}
                    >
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: act.dot, marginTop: '5px', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                          {act.title}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '2px' }}>
                          {act.desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Currency Converter Widget */}
            <div className="admin-panel-card" style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '10px',
              padding: '14px 18px',
              border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isDark ? '#F8FAFC' : '#0F172A', fontWeight: 700, fontSize: '0.85rem' }}>
                    <Calculator size={16} />
                    <span>Quy Đổi Nhanh (KRW ➔ VND)</span>
                  </div>
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: isDark ? '#27272A' : '#E4E4E7',
                    color: isDark ? '#F8FAFC' : '#0F172A',
                    border: 'none'
                  }}>
                    Phí dịch vụ: {serviceFee}%
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <input
                      type="number"
                      value={calcWon}
                      onChange={(e) => setCalcWon(e.target.value)}
                      placeholder="Giá Won..."
                      style={{
                        padding: '6px 36px 6px 10px',
                        borderRadius: '6px',
                        border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                        backgroundColor: isDark ? '#0F172A' : '#FFF',
                        color: isDark ? '#F8FAFC' : '#0F172A',
                        width: '130px',
                        fontSize: '0.85rem'
                      }}
                    />
                    <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', fontWeight: 700 }}>
                      ₩
                    </span>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: isDark ? '#94A3B8' : '#64748B' }}>=</span>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A', fontFamily: 'monospace' }}>
                    {calcVnd} đ
                  </div>

                  {/* Chi tiết bóc tách Giá Gốc & Phí dịch vụ */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginLeft: '4px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace, sans-serif'
                  }}>
                    <span style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
                      Gốc: <b>{calcBreakdown.baseVnd} đ</b>
                    </span>
                    <span style={{ color: isDark ? '#475569' : '#CBD5E1' }}>•</span>
                    <span style={{ color: isDark ? '#F8FAFC' : '#0F172A', fontWeight: 700 }}>
                      Phí (+{serviceFee}%): +{calcBreakdown.feeVnd} đ
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <button
                  onClick={() => handleSwitchTab('settings')}
                  style={{
                    backgroundColor: isDark ? '#FFFFFF' : '#000000',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: isDark ? '#000000' : '#FFFFFF',
                    cursor: 'pointer'
                  }}
                >
                  Cài đặt tỷ giá ➔
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: QUẢN LÝ ĐƠN HÀNG (ORDERS KANBAN)                         */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'orders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                  Quản Lý Đơn Hàng
                </h1>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
                  color: '#3B82F6',
                  padding: '2px 8px',
                  borderRadius: '999px'
                }}>
                  {orders.length} Đơn
                </span>
              </div>
            </div>
            <AdminOrderManager isDark={isDark} />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB 2B: QUẢN LÝ KHÁCH HÀNG (USERS)                               */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                Khách Hàng
              </h1>
            </div>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                Kho Nạp Hàng & Kiểm Duyệt
              </h1>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '650px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                Cài Đặt Hệ Thống
              </h1>
            </div>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* GIAO DIỆN QUẢN TRỊ (ADMIN THEME SETTINGS)                    */}
            {/* ════════════════════════════════════════════════════════════ */}
            <div style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '10px',
              padding: '18px',
              border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
              <div>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: isDark ? '#F8FAFC' : '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isDark ? <Moon size={16} color="#38BDF8" /> : <Sun size={16} color="#F59E0B" />}
                  Giao Diện Quản Trị
                </h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* Sáng */}
                <div
                  onClick={() => setAdminTheme('light')}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: !isDark ? '2px solid #2563EB' : `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                    backgroundColor: !isDark ? 'rgba(37, 99, 235, 0.08)' : (isDark ? '#0F172A' : '#F8FAFC'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.84rem', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                    <Sun size={16} color="#F59E0B" />
                    <span>Chế độ Sáng</span>
                  </div>
                  {!isDark && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#2563EB', color: '#FFF', padding: '1px 7px', borderRadius: '10px' }}>
                      Bật
                    </span>
                  )}
                </div>

                {/* Tối */}
                <div
                  onClick={() => setAdminTheme('dark')}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: isDark ? '2px solid #38BDF8' : `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                    backgroundColor: isDark ? 'rgba(56, 189, 248, 0.12)' : (isDark ? '#0F172A' : '#F8FAFC'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.84rem', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                    <Moon size={16} color="#38BDF8" />
                    <span>Chế độ Tối</span>
                  </div>
                  {isDark && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#0284C7', color: '#FFF', padding: '1px 7px', borderRadius: '10px' }}>
                      Bật
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Switch Toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '10px',
                borderTop: `1px solid ${isDark ? '#334155' : '#F1F5F9'}`
              }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isDark ? '#94A3B8' : '#64748B' }}>
                  Chuyển nhanh giao diện Tối / Sáng
                </span>
                <button
                  type="button"
                  onClick={toggleAdminTheme}
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '12px',
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
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: '#FFF',
                    transform: isDark ? 'translateX(20px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }}>
                    {isDark ? <Moon size={11} color="#0284C7" /> : <Sun size={11} color="#F59E0B" />}
                  </div>
                </button>
              </div>
            </div>

            {/* ════════════════════════════════════════════════════════════ */}
            {/* TỶ GIÁ & PHÍ DỊCH VỤ                                          */}
            {/* ════════════════════════════════════════════════════════════ */}
            <form onSubmit={handleSaveRates} style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '10px',
              padding: '18px',
              border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                  Tỷ Giá 1 KRW (Won Hàn Quốc) đổi sang VNĐ
                </label>
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    value={krwRateInput}
                    onChange={(e) => setKrwRateInput(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                      backgroundColor: isDark ? '#0F172A' : '#FFF',
                      color: isDark ? '#F8FAFC' : '#0F172A',
                      width: '140px',
                      fontSize: '0.88rem',
                      fontFamily: 'monospace',
                      fontWeight: 700
                    }}
                  />
                  <span style={{ fontSize: '0.8rem', color: isDark ? '#94A3B8' : '#64748B' }}>VNĐ / Won</span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                  Phần Trăm Phí Dịch Vụ Mua Hộ (%)
                </label>
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={serviceFeeInput}
                      onChange={(e) => setServiceFeeInput(e.target.value)}
                      style={{
                        padding: '8px 30px 8px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                        backgroundColor: isDark ? '#0F172A' : '#FFF',
                        color: isDark ? '#F8FAFC' : '#0F172A',
                        width: '140px',
                        fontSize: '0.88rem',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        outline: 'none'
                      }}
                    />
                    <span style={{
                      position: 'absolute',
                      right: '10px',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      color: isDark ? '#94A3B8' : '#475569',
                      pointerEvents: 'none'
                    }}>
                      %
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: isDark ? '#94A3B8' : '#64748B' }}>trên giá gốc sản phẩm</span>
                </div>
              </div>

              <div style={{ paddingTop: '10px', borderTop: `1px solid ${isDark ? '#334155' : '#F1F5F9'}` }}>
                <button
                  type="submit"
                  disabled={isSavingRates}
                  style={{
                    backgroundColor: isDark ? '#F8FAFC' : '#0F172A',
                    color: isDark ? '#0F172A' : '#F8FAFC',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isSavingRates ? 'Đang lưu...' : 'Lưu Cấu Hình'}
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
          { id: 'ai-manager', label: 'Phó Tướng', icon: Bot, badge: 'AI', badgeColor: '#C5A059' },
          { id: 'orders', label: 'Đơn Hàng', icon: FileText, badge: orders.length > 0 ? orders.length : null, badgeColor: '#2563EB' },
          { id: 'users', label: 'Khách', icon: Users, badge: totalCustomers > 0 ? totalCustomers : null, badgeColor: '#8B5CF6' },
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
                <Icon size={19} color={isActive ? (isDark ? '#F8FAFC' : '#0F172A') : (isDark ? '#94A3B8' : '#64748B')} />
                {tab.badge && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-5px',
                      right: '-8px',
                      backgroundColor: isDark ? '#FFFFFF' : '#000000',
                      color: isDark ? '#000000' : '#FFFFFF',
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
                  backgroundColor: isDark ? '#F8FAFC' : '#0F172A',
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
            display: none !important;
          }
          .admin-mobile-bottom-nav {
            display: flex !important;
          }
          .admin-main-wrapper {
            margin-left: 0 !important;
            padding: 12px 10px 100px 10px !important;
            padding-top: 66px !important;
            width: 100% !important;
            max-width: 100vw !important;
            overflow-x: hidden !important;
          }
          .admin-close-mobile-btn {
            display: block !important;
          }

          /* Mobile 2x2 KPI Grid */
          .admin-kpi-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
          }
          .admin-kpi-grid .admin-panel-card {
            padding: 12px 10px !important;
          }
          .admin-kpi-grid .admin-kpi-value {
            font-size: 1.12rem !important;
            margin-top: 4px !important;
            letter-spacing: -0.02em !important;
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
