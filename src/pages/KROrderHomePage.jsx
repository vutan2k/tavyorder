import React, { useState, useContext, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Menu, X, ShoppingCart, User, LogOut, Package, AlertCircle, Sun, Moon
} from 'lucide-react';
import { AppContext } from '../context/AppContext';
import ProductDetailModal from '../components/ProductDetailModal';
import HeroSection from '../components/HeroSection';
import ProductGrid from '../components/ProductGrid';
import Footer from '../components/Footer';
import { triggerFlyToCart } from '../utils/flyToCart';
import { GuestOrderTrackingBar, GuestOrderStatusCard } from '../components/GuestOrderTracking';
import { findGuestOrders } from '../services/guestTrackingService';

export default function KROrderHomePage() {
  const { oliveYoungCatalog, rates, currentUser, logoutUser, cart, addToCart, orders, userTheme, toggleUserTheme } = useContext(AppContext);
  const [detailProduct, setDetailProduct] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Guest Order Tracking State
  const [trackingQuery, setTrackingQuery] = useState('');
  const [matchedOrders, setMatchedOrders] = useState([]);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const krwRate = rates?.KRW?.rate || 19.5;
  const serviceFeeMultiplier = 1 + (rates?.serviceFeePercent ?? 5) / 100;

  const categories = [
    { id: 'all', name: 'Tất cả sản phẩm' },
    { id: 'lipstick', name: 'Son môi' },
    { id: 'foundation', name: 'Kem nền & Che khuyết điểm' },
    { id: 'cushion', name: 'Phấn nước (Cushion)' },
    { id: 'eyeshadow', name: 'Phấn mắt' },
    { id: 'blush', name: 'Phấn má hồng' },
    { id: 'powder', name: 'Phấn phủ kiềm dầu' },
    { id: 'eye_makeup', name: 'Mascara & Kẻ mắt' },
    { id: 'serum', name: 'Serum & Tinh chất' },
    { id: 'cream', name: 'Kem dưỡng da' },
    { id: 'mask', name: 'Mặt nạ' },
    { id: 'suncare', name: 'Kem chống nắng' },
    { id: 'cleanser', name: 'Sữa rửa mặt' },
    { id: 'makeup_remover', name: 'Tẩy trang' },
    { id: 'toner_pad', name: 'Toner & Toner Pad' },
    { id: 'haircare', name: 'Chăm sóc tóc' },
    { id: 'bodycare', name: 'Chăm sóc cơ thể' },
    { id: 'ginseng', name: 'Sâm nấm Hàn Quốc' },
    { id: 'supplements', name: 'Thực phẩm chức năng' }
  ];

  // Dynamic sample suggestions from existing orders or standard fallbacks
  const sampleSuggestions = useMemo(() => {
    const list = [];
    if (Array.isArray(orders) && orders.length > 0) {
      const firstOrder = orders[0];
      if (firstOrder?.id) {
        list.push({ label: `Thử mã: ${firstOrder.id.replace(/^ORD-?/i, '')}`, value: firstOrder.id.replace(/^ORD-?/i, '') });
      }
      const phone = firstOrder?.customerPhone || firstOrder?.phone;
      if (phone) {
        list.push({ label: `Thử SĐT: ${phone}`, value: phone });
      }
    }
    if (list.length === 0) {
      list.push(
        { label: 'Thử SĐT: 0912345678', value: '0912345678' },
        { label: 'Thử SĐT: 0935861690', value: '0935861690' }
      );
    }
    return list;
  }, [orders]);

  // Handle Guest Tracking Search
  const handleTrackingSearch = (query) => {
    const term = String(query || '').trim();
    if (!term) return;

    setIsSearching(true);
    const results = findGuestOrders(term, orders || []);
    setTrackingQuery(term);
    setMatchedOrders(results);
    setSelectedOrderIndex(0);
    setHasSearched(true);
    setIsSearching(false);

    // Smooth scroll to tracking section on mobile
    const trackerElem = document.getElementById('order-tracker');
    if (trackerElem) {
      trackerElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // Handle Clear / Reset Tracking
  const handleTrackingClear = () => {
    setTrackingQuery('');
    setMatchedOrders([]);
    setSelectedOrderIndex(0);
    setHasSearched(false);
  };

  // Close Tracking Status Card / Banner
  const handleCloseTracking = () => {
    setHasSearched(false);
  };

  const filteredProducts = useMemo(() => {
    if (!oliveYoungCatalog) return [];
    return oliveYoungCatalog.filter((product) => {
      if (product.isPublished === false || product.status === 'pending' || product.isHidden === true) return false;

      if (activeCategory === 'all') return true;
      const cat = (product.category || '').toLowerCase();
      const subCat = (product.subCategory || '').toLowerCase();
      const name = (product.name || '').toLowerCase();
      const nameKr = (product.nameKr || product.koreanTitle || '').toLowerCase();

      // Top navbar link fallback
      if (activeCategory === 'cosmetics') {
        return cat !== 'ginseng' && cat !== 'supplements' && !/sâm|hồng sâm|nấm|protein|thực phẩm chức năng|viên uống/i.test(name);
      }

      // Direct category or subCategory match
      if (cat === activeCategory || subCat === activeCategory) return true;

      // Smart Vietnamese & Korean Name & Semantic matching per category
      switch (activeCategory) {
        case 'lipstick':
          return cat === 'lipstick' || /son|tint|lip|thỏi|thoa môi/i.test(name) || /립|tint|lipstick/i.test(nameKr);
        case 'foundation':
          return cat === 'foundation' || cat === 'concealer' ||
            /kem nền|foundation|bb cream|cc cream|cover cream|che khuyết|kem lót|lotion che/i.test(name) ||
            /파운데이션|비비|컨실러|프라이머/i.test(nameKr);
        case 'cushion':
          return cat === 'cushion' || /cushion|phấn nước|phấn tươi/i.test(name) || /쿠션|팩트/i.test(nameKr);
        case 'eyeshadow':
          return cat === 'eyeshadow' || /phấn mắt|bảng mắt|bảng phấn mắt|eyeshadow|eye shadow|shadow/i.test(name) || /아이섀도|섀도우/i.test(nameKr);
        case 'blush':
          return cat === 'blush' || /má hồng|phấn má|blush|blusher|cheek/i.test(name) || /블러셔|치크/i.test(nameKr);
        case 'powder':
          return cat === 'powder' || /phấn phủ|bột phủ|kiềm dầu|powder|no-sebum/i.test(name) || /파우더/i.test(nameKr);
        case 'eye_makeup':
          return cat === 'mascara' || cat === 'eyeliner' || cat === 'eyebrow' ||
            /mascara|kẻ mắt|kẻ mày|chì mày|chuốt mi|eyeliner|eyebrow/i.test(name) ||
            /마스카라|아이라이너|아이브로우/i.test(nameKr);
        case 'serum':
          return cat === 'serum' || /serum|tinh chất|ampoule|essence/i.test(name) || /세럼|앰플|에센스/i.test(nameKr);
        case 'cream':
          return cat === 'cream' || ((/kem dưỡng|dưỡng ẩm|cấp ẩm|cream|lotion|emulsion|moisturizer/i.test(name) || /크림|보습/i.test(nameKr)) &&
            !/chống nắng|body|rửa mặt|nền|che khuyết|lót/i.test(name));
        case 'mask':
          return cat === 'mask' || /mặt nạ|mask|sheet mask|sleeping mask|đắp mặt/i.test(name) || /마스크팩|마스크/i.test(nameKr);
        case 'suncare':
          return cat === 'suncare' || /chống nắng|kem chống nắng|sunscreen|sun cream|suncream|sun stick/i.test(name) || /선크림|선케어/i.test(nameKr);
        case 'cleanser':
          return cat === 'cleanser' || /sữa rửa mặt|gel rửa mặt|bọt rửa mặt|cleanser|cleansing foam|pack to foam/i.test(name) || /클렌징폼|폼클렌징/i.test(nameKr);
        case 'makeup_remover':
          return cat === 'makeup_remover' || /tẩy trang|nước tẩy trang|dầu tẩy trang|sáp tẩy trang|sữa tẩy trang|cleansing oil|cleansing water|cleansing balm/i.test(name) || /클렌징오일|클렌징워터/i.test(nameKr);
        case 'toner_pad':
          return cat === 'toner_pad' || cat === 'toner' || /toner|pad|bông toner|nước hoa hồng|nước cân bằng/i.test(name) || /토너|토너패드|스킨/i.test(nameKr);
        case 'haircare':
          return cat === 'haircare' || /tóc|dầu gội|dầu xả|ủ tóc|dưỡng tóc|tạo kiểu tóc|hair|shampoo/i.test(name) || /헤어|샴푸|트리트먼트/i.test(nameKr);
        case 'bodycare':
          return cat === 'bodycare' || cat === 'exfoliator' || /sữa tắm|dưỡng thể|body|toàn thân|vệ sinh phụ nữ|đánh răng|kem đánh răng|tẩy tế bào chết body/i.test(name) || /바디|치약/i.test(nameKr);
        case 'ginseng':
          return cat === 'ginseng' || /sâm|hồng sâm|cao hồng sâm|nước hồng sâm|nấm|linh chi|ginseng/i.test(name) || /홍삼|인삼/i.test(nameKr);
        case 'supplements':
          return cat === 'supplements' || /protein|viên uống|bột uống|thực phẩm chức năng|men vi sinh|vitamin|supplement/i.test(name) || /단백질|유산균/i.test(nameKr);
        default:
          return false;
      }
    });
  }, [oliveYoungCatalog, activeCategory]);

  const handleNavCategoryClick = (e, catId) => {
    e.preventDefault();
    setActiveCategory(catId);
    if (catId === 'all') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const elem = document.getElementById('products');
      if (elem) {
        elem.scrollIntoView({ behavior: 'smooth' });
      }
    }
    setMobileMenuOpen(false);
  };

  const handleAddToCart = (product, e) => {
    addToCart(product, 1);
    if (e && product.productImage) {
      triggerFlyToCart(e, product.productImage);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* 1. Thanh thông báo hàng đầu */}
      <div className="top-announcement-bar">
        MUA HÀNG HÀN QUỐC CHÍNH HÃNG 100% | <span>GIAO HÀNG TẬN NƠI TẠI VIỆT NAM (3-7 NGÀY)</span>
      </div>

      {/* 2. Header & Navigation */}
      <header className="site-header">
        <div className="container">
          <div className="site-nav-wrap">
            <a href="#" onClick={(e) => handleNavCategoryClick(e, 'all')} className="brand-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
              <img
                src="/tavy-logo.png"
                alt="TAVY Logo"
                style={{ height: '54px', width: 'auto', display: 'block', objectFit: 'contain' }}
              />
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--purple-primary)', letterSpacing: '2px', textTransform: 'uppercase' }}>
                KOREA
              </span>
            </a>

            <nav>
              <ul className="nav-links">
                <li><a href="#" onClick={(e) => handleNavCategoryClick(e, 'all')} className={activeCategory === 'all' ? 'active' : ''}>TRANG CHỦ</a></li>
                <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'cosmetics')} className={activeCategory === 'cosmetics' ? 'active' : ''}>MỸ PHẨM</a></li>
                <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'ginseng')} className={activeCategory === 'ginseng' ? 'active' : ''}>SÂM NẤM</a></li>
                <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'supplements')} className={activeCategory === 'supplements' ? 'active' : ''}>THỰC PHẨM CHỨC NĂNG</a></li>
                <li><Link to="/policy">QUY ĐỊNH & CHÍNH SÁCH</Link></li>
              </ul>
            </nav>

            <div className="nav-icons" style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              {/* Nút chuyển đổi Dark/Light mode */}
              <button
                onClick={toggleUserTheme}
                className="icon-btn"
                aria-label={userTheme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
                title={userTheme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-dark)',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {userTheme === 'dark' ? <Sun size={24} color="#FBBF24" /> : <Moon size={24} />}
              </button>

              {/* Tra cứu đơn hàng (Desktop only) */}
              <a href="#order-tracker" className="icon-btn desktop-only-icon" aria-label="Tra cứu đơn hàng" title="Tra cứu tiến độ đơn hàng" style={{ color: 'var(--text-dark)' }}>
                <Search size={26} />
              </a>

              {/* Giỏ hàng (Hiển thị trên cả Desktop & Mobile) */}
              <Link id="cart-icon-header" to="/cart" className="icon-btn" style={{ position: 'relative', transition: 'transform 0.2s ease', color: 'var(--text-dark)' }} aria-label="Giỏ hàng" title="Giỏ hàng">
                <ShoppingCart size={26} />
                {cart && cart.length > 0 && (
                  <span style={{
                    position: 'absolute', top: '-8px', right: '-12px',
                    backgroundColor: 'var(--purple-primary)',
                    color: userTheme === 'dark' ? '#111827' : '#FFFFFF',
                    fontSize: '0.75rem',
                    fontWeight: 800, width: '22px', height: '22px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%',
                    border: '2px solid var(--nav-bg, #FFFFFF)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                  }}>
                    {cart.length > 99 ? '99+' : cart.length}
                  </span>
                )}
              </Link>

              {/* Đơn của tôi & Tài khoản & Đăng nhập/Đăng xuất (Desktop only - Trên Mobile được gom gọn vào Menu 3 gạch) */}
              {currentUser ? (
                <>
                  <Link to="/orders" className="icon-btn desktop-only-icon" aria-label="Đơn của tôi" title="Đơn của tôi" style={{ color: 'var(--text-dark)' }}>
                    <Package size={26} />
                  </Link>
                  <Link to="/profile" className="icon-btn desktop-only-icon" aria-label="Tài khoản" title="Tài khoản" style={{ color: 'var(--text-dark)' }}>
                    <User size={26} />
                  </Link>
                  <button onClick={() => logoutUser()} className="icon-btn desktop-only-icon" aria-label="Đăng xuất" title="Đăng xuất" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dark)', padding: 0 }}>
                    <LogOut size={26} />
                  </button>
                </>
              ) : (
                <Link to="/login" className="icon-btn desktop-only-icon" aria-label="Đăng nhập" title="Đăng nhập" style={{ color: 'var(--text-dark)' }}>
                  <User size={26} />
                </Link>
              )}

              {/* Nút 3 gạch Menu trên Mobile */}
              <button
                className="icon-btn mobile-menu-toggle"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle Navigation Menu"
                style={{ color: 'var(--text-dark)' }}
              >
                {mobileMenuOpen ? <X size={26} /> : <Menu size={26} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Drawer (Gom gọn toàn bộ chức năng tài khoản, tra cứu & danh mục) */}
        {mobileMenuOpen && (
          <div className="mobile-nav-drawer" style={{
            position: 'absolute', top: '80px', left: 0, width: '100%',
            backgroundColor: '#FFFFFF', borderBottom: '1px solid var(--border-color)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '20px 24px', zIndex: 99
          }}>
            {/* 1. Nhóm Tra cứu, Đơn hàng & Tài khoản */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
              <a
                href="#order-tracker"
                onClick={() => {
                  setMobileMenuOpen(false);
                  const elem = document.getElementById('order-tracker');
                  if (elem) elem.scrollIntoView({ behavior: 'smooth' });
                }}
                style={{ color: 'var(--purple-primary)', fontWeight: 700, fontSize: '0.94rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}
              >
                <Search size={18} />
                <span>Tra cứu tiến độ đơn hàng</span>
              </a>

              {currentUser ? (
                <>
                  <Link
                    to="/orders"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{ color: 'var(--text-dark)', fontWeight: 600, fontSize: '0.92rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}
                  >
                    <Package size={18} />
                    <span>Đơn hàng của tôi</span>
                  </Link>

                  <Link
                    to="/profile"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{ color: 'var(--text-dark)', fontWeight: 600, fontSize: '0.92rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}
                  >
                    <User size={18} />
                    <span>Tài khoản ({currentUser.name || 'Cá nhân'})</span>
                  </Link>

                  <button
                    onClick={() => { logoutUser(); setMobileMenuOpen(false); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: '0.92rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', padding: 0, textAlign: 'left' }}
                  >
                    <LogOut size={18} />
                    <span>Đăng xuất</span>
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  style={{ color: 'var(--purple-primary)', fontWeight: 700, fontSize: '0.92rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <User size={18} />
                  <span>Đăng nhập / Đăng ký</span>
                </Link>
              )}

              {/* Nút chuyển đổi Dark/Light Mode trên Mobile */}
              <button
                onClick={() => toggleUserTheme()}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-dark)',
                  fontSize: '0.92rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '6px 0',
                  textAlign: 'left'
                }}
              >
                {userTheme === 'dark' ? <Sun size={18} color="#FBBF24" /> : <Moon size={18} />}
                <span>{userTheme === 'dark' ? 'Giao diện: Chế độ Tối (Bật)' : 'Giao diện: Chế độ Sáng (Bật)'}</span>
              </button>
            </div>

            {/* 2. Nhóm Danh mục sản phẩm */}
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
              Danh mục mua sắm
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '14px', margin: 0, padding: 0 }}>
              <li><a href="#" onClick={(e) => handleNavCategoryClick(e, 'all')} style={{ color: activeCategory === 'all' ? 'var(--purple-primary)' : 'var(--text-dark)', fontWeight: activeCategory === 'all' ? 700 : 600, textDecoration: 'none', fontSize: '0.9rem' }}>Tất cả sản phẩm</a></li>
              <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'lipstick')} style={{ color: activeCategory === 'lipstick' ? 'var(--purple-primary)' : 'var(--text-dark)', fontWeight: activeCategory === 'lipstick' ? 700 : 600, textDecoration: 'none', fontSize: '0.9rem' }}>Son môi</a></li>
              <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'foundation')} style={{ color: activeCategory === 'foundation' ? 'var(--purple-primary)' : 'var(--text-dark)', fontWeight: activeCategory === 'foundation' ? 700 : 600, textDecoration: 'none', fontSize: '0.9rem' }}>Kem nền & Cushion</a></li>
              <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'eyeshadow')} style={{ color: activeCategory === 'eyeshadow' ? 'var(--purple-primary)' : 'var(--text-dark)', fontWeight: activeCategory === 'eyeshadow' ? 700 : 600, textDecoration: 'none', fontSize: '0.9rem' }}>Phấn mắt & Phấn má</a></li>
              <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'serum')} style={{ color: activeCategory === 'serum' ? 'var(--purple-primary)' : 'var(--text-dark)', fontWeight: activeCategory === 'serum' ? 700 : 600, textDecoration: 'none', fontSize: '0.9rem' }}>Serum & Tinh chất</a></li>
              <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'cream')} style={{ color: activeCategory === 'cream' ? 'var(--purple-primary)' : 'var(--text-dark)', fontWeight: activeCategory === 'cream' ? 700 : 600, textDecoration: 'none', fontSize: '0.9rem' }}>Kem dưỡng da</a></li>
              <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'mask')} style={{ color: activeCategory === 'mask' ? 'var(--purple-primary)' : 'var(--text-dark)', fontWeight: activeCategory === 'mask' ? 700 : 600, textDecoration: 'none', fontSize: '0.9rem' }}>Mặt nạ dưỡng da</a></li>
              <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'suncare')} style={{ color: activeCategory === 'suncare' ? 'var(--purple-primary)' : 'var(--text-dark)', fontWeight: activeCategory === 'suncare' ? 700 : 600, textDecoration: 'none', fontSize: '0.9rem' }}>Kem chống nắng</a></li>
              <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'cleanser')} style={{ color: activeCategory === 'cleanser' ? 'var(--purple-primary)' : 'var(--text-dark)', fontWeight: activeCategory === 'cleanser' ? 700 : 600, textDecoration: 'none', fontSize: '0.9rem' }}>Sữa rửa mặt & Tẩy trang</a></li>
              <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'haircare')} style={{ color: activeCategory === 'haircare' ? 'var(--purple-primary)' : 'var(--text-dark)', fontWeight: activeCategory === 'haircare' ? 700 : 600, textDecoration: 'none', fontSize: '0.9rem' }}>Chăm sóc tóc</a></li>
              <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'bodycare')} style={{ color: activeCategory === 'bodycare' ? 'var(--purple-primary)' : 'var(--text-dark)', fontWeight: activeCategory === 'bodycare' ? 700 : 600, textDecoration: 'none', fontSize: '0.9rem' }}>Chăm sóc cơ thể</a></li>
              <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'ginseng')} style={{ color: activeCategory === 'ginseng' ? 'var(--purple-primary)' : 'var(--text-dark)', fontWeight: activeCategory === 'ginseng' ? 700 : 600, textDecoration: 'none', fontSize: '0.9rem' }}>Sâm nấm Hàn Quốc</a></li>
              <li><a href="#products" onClick={(e) => handleNavCategoryClick(e, 'supplements')} style={{ color: activeCategory === 'supplements' ? 'var(--purple-primary)' : 'var(--text-dark)', fontWeight: activeCategory === 'supplements' ? 700 : 600, textDecoration: 'none', fontSize: '0.9rem' }}>Thực phẩm chức năng</a></li>
              <li><Link to="/policy" onClick={() => setMobileMenuOpen(false)} style={{ color: 'var(--purple-primary)', fontWeight: 600, textDecoration: 'none', fontSize: '0.88rem' }}>Quy định & Chính sách</Link></li>
            </ul>
          </div>
        )}
      </header>

      <main style={{ flex: 1 }}>
        {/* Banner Tối Giản */}
        <HeroSection />

        {/* Khu vực Tra Cứu Đơn Hàng & Danh mục & Danh sách sản phẩm */}
        <section id="order-tracker" style={{ padding: '36px 0 60px 0', background: 'var(--bg-ivory)' }}>
          <div className="container">

            {/* Prominent Guest Order Tracking Bar (R1) */}
            <GuestOrderTrackingBar
              onSearch={handleTrackingSearch}
              onClear={handleTrackingClear}
              initialValue={trackingQuery}
              isLoading={isSearching}
              sampleSuggestions={sampleSuggestions}
            />

            {/* Matched Order Status Card (R2, R3) */}
            {hasSearched && matchedOrders.length > 0 && (
              <GuestOrderStatusCard
                order={matchedOrders[selectedOrderIndex]}
                matchedOrders={matchedOrders}
                selectedOrderIndex={selectedOrderIndex}
                onSelectOrder={setSelectedOrderIndex}
                onClose={handleCloseTracking}
                rates={rates}
              />
            )}

            {/* Friendly Not-Found Banner */}
            {hasSearched && matchedOrders.length === 0 && (
              <div
                className="tracking-not-found-box"
                style={{
                  maxWidth: '720px',
                  margin: '0 auto 28px auto',
                  padding: '20px 24px',
                  borderRadius: '16px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.08)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  animation: 'fadeIn 0.2s ease'
                }}
              >
                <AlertCircle size={24} style={{ color: '#DC2626', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#991B1B', margin: 0 }}>
                      Không tìm thấy đơn hàng nào
                    </h4>
                    <button
                      onClick={handleCloseTracking}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', padding: '2px' }}
                      aria-label="Đóng thông báo"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#7F1D1D', margin: '6px 0 10px 0', lineHeight: 1.4 }}>
                    Không tìm thấy đơn hàng nào khớp với thông tin "<strong>{trackingQuery}</strong>". Quý khách vui lòng kiểm tra lại Số điện thoại (VD: 0912345678).
                  </p>
                  <div style={{ fontSize: '0.82rem', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span>Cần hỗ trợ tra cứu nhanh?</span>
                    <a
                      href="https://zalo.me/0935861690"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#991B1B',
                        fontWeight: 700,
                        textDecoration: 'underline'
                      }}
                    >
                      Chat Zalo CSKH: 0935 861 690
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Filter Tabs (Tự động dàn hàng và xuống dòng co dãn đa thiết bị) */}
            <div id="products" className="category-filter-ribbon">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`category-filter-btn ${activeCategory === cat.id ? 'active' : ''}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Lưới sản phẩm */}
            <ProductGrid
              products={filteredProducts}
              krwRate={krwRate * serviceFeeMultiplier}
              onSelectProduct={handleAddToCart}
              onViewDetail={setDetailProduct}
            />

            {/* Banner Tối Giản Mua Hộ Ngoài Web */}
            <div className="consult-banner-wrap">
              <div className="consult-banner-text">
                Cần tìm mua sản phẩm khác từ Hàn Quốc?
              </div>

              <a
                href="https://www.facebook.com/messages/t/100062954372060"
                target="_blank"
                rel="noopener noreferrer"
                className="consult-banner-btn"
              >
                Nhận tư vấn
              </a>
            </div>
          </div>
        </section>

      </main>

      <Footer />

      {/* Modal Xem Chi Tiết Sản Phẩm */}
      <ProductDetailModal
        product={detailProduct}
        krwRate={krwRate * serviceFeeMultiplier}
        onClose={() => setDetailProduct(null)}
        onOrderNow={handleAddToCart}
      />
    </div>
  );
}
