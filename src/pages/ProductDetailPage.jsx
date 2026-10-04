import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  ShoppingBag, 
  ChevronRight, 
  ArrowLeft, 
  ShieldCheck, 
  Plane, 
  Sparkles, 
  Check, 
  Star, 
  Share2, 
  AlertCircle 
} from 'lucide-react';
import { AppContext } from '../context/AppContext';
import { formatVnd, formatKrw, getVndFromWon } from '../utils/priceCalculator';
import { extractGoodsNoFromSlug, generateProductSlug, getProductUrl } from '../utils/slugify';
import OptimizedImage from '../components/OptimizedImage';
import Footer from '../components/Footer';

// Chuẩn hóa URL ảnh HD sắc nét từ Olive Young
const getHighResUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('/oliveyoung_ranking/') || trimmed.startsWith('file://')) {
    return '';
  }
  return trimmed
    .replace(/RS=\d+x\d+&?/gi, '')
    .replace(/QT=\d+&?/gi, 'QT=100&')
    .replace(/\?$/, '')
    .trim();
};

const getBaseImageUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  try {
    return url.split('?')[0];
  } catch {
    return url;
  }
};

const dedupeImageList = (urls) => {
  const seen = new Set();
  const result = [];
  for (const u of urls) {
    if (!u) continue;
    const base = getBaseImageUrl(u);
    if (!seen.has(base)) {
      seen.add(base);
      result.push(u);
    }
  }
  return result;
};

export default function ProductDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { 
    products, 
    publishedProducts, 
    rates, 
    addToCart, 
    oliveYoungCatalog 
  } = useContext(AppContext);

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);

  // Tìm sản phẩm dựa trên slug hoặc goodsNo
  useEffect(() => {
    setLoading(true);
    const goodsNo = extractGoodsNoFromSlug(slug);

    // 1. Tìm trong AppContext (publishedProducts hoặc products)
    const allProducts = Array.isArray(publishedProducts) && publishedProducts.length > 0 
      ? publishedProducts 
      : (Array.isArray(products) ? products : []);

    let found = allProducts.find(p => {
      if (!p) return false;
      const pGoodsNo = String(p.goodsNo || p.id || '').toUpperCase();
      if (pGoodsNo && goodsNo && pGoodsNo === goodsNo) return true;
      if (generateProductSlug(p) === slug) return true;
      return false;
    });

    if (found) {
      setProduct(found);
      setLoading(false);
      return;
    }

    // 2. Fallback: Đọc từ file public JSON nếu chưa đồng bộ xong
    fetch('/data/playwright_scraped_products.json')
      .then(res => res.ok ? res.json() : [])
      .then(fallbackList => {
        if (Array.isArray(fallbackList)) {
          const fallbackFound = fallbackList.find(p => {
            if (!p) return false;
            const pGoodsNo = String(p.goodsNo || p.id || '').toUpperCase();
            if (pGoodsNo && goodsNo && pGoodsNo === goodsNo) return true;
            if (generateProductSlug(p) === slug) return true;
            return false;
          });
          if (fallbackFound) {
            setProduct(fallbackFound);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
      });
  }, [slug, products, publishedProducts]);

  // Reset option khi sản phẩm thay đổi
  useEffect(() => {
    setSelectedOptionIndex(0);
    setActiveImageIndex(0);
  }, [product]);

  // Tỷ giá & Phí dịch vụ
  const krwRate = rates?.KRW?.rate || rates?.krwRate || 19.5;
  const serviceFeePercent = rates?.serviceFeePercent !== undefined ? rates.serviceFeePercent : 5;
  const effectiveKrwRate = krwRate * (1 + serviceFeePercent / 100);

  // Phân loại hàng (Options)
  const options = Array.isArray(product?.options) ? product.options : [];
  const hasOptions = options.length > 0;
  const activeOption = hasOptions ? options[selectedOptionIndex] : null;

  // Tính giá sản phẩm
  const activeWonPrice = useMemo(() => {
    if (activeOption && (activeOption.price || activeOption.sale_price)) {
      return Number(activeOption.price || activeOption.sale_price) || 0;
    }
    return Number(product?.foreignPrice ?? product?.priceKrw ?? product?.priceWon ?? product?.price) || 0;
  }, [product, activeOption]);

  const activeOriginalWonPrice = useMemo(() => {
    if (activeOption && activeOption.origin_price) {
      return Number(activeOption.origin_price) || 0;
    }
    return Number(product?.originalPrice || product?.origin_price_krw) || 0;
  }, [product, activeOption]);

  const calculatedVnd = Math.round(activeWonPrice * effectiveKrwRate);
  const calculatedOriginalVnd = activeOriginalWonPrice > 0 ? Math.round(activeOriginalWonPrice * effectiveKrwRate) : 0;
  const hasDiscount = calculatedOriginalVnd > calculatedVnd;

  // Xử lý danh sách ảnh
  const defaultProductImage = useMemo(() => {
    const raw = product?.productImage || (product?.images && product.images[0]) || '';
    const clean = getHighResUrl(raw);
    if (clean) return clean;
    return product?.goodsNo ? `/products/${product.goodsNo}.jpg` : 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&auto=format&fit=crop&q=80';
  }, [product]);

  const allImages = useMemo(() => {
    const list = [];
    if (activeOption?.image_url) {
      list.push(getHighResUrl(activeOption.image_url));
    }
    if (defaultProductImage) {
      list.push(defaultProductImage);
    }
    if (Array.isArray(product?.images)) {
      list.push(...product.images.map(getHighResUrl));
    }
    if (Array.isArray(product?.photoReviews)) {
      list.push(...product.photoReviews.map(getHighResUrl));
    }
    const unique = dedupeImageList(list.filter(Boolean));
    return unique.length > 0 ? unique : [defaultProductImage];
  }, [product, activeOption, defaultProductImage]);

  // Thêm vào giỏ hàng
  const handleAddToCart = (shouldRedirect = false) => {
    if (!product) return;
    const cartItem = {
      ...product,
      selectedOption: activeOption,
      selectedOptionName: activeOption?.name || activeOption?.title || null,
      priceVnd: calculatedVnd,
      foreignPrice: activeWonPrice,
      qty: 1
    };
    if (addToCart) {
      addToCart(cartItem);
    }
    if (shouldRedirect) {
      navigate('/cart');
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: product?.name,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      });
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="animate-spin" style={{ width: 40, height: 40, border: '3px solid #E5E7EB', borderTopColor: '#7A4B9E', borderRadius: '50%', margin: '0 auto 16px' }} />
          <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>Đang tải thông tin sản phẩm...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ textAlign: 'center', maxWidth: '480px' }}>
          <AlertCircle size={48} color="#EF4444" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>Không tìm thấy sản phẩm</h2>
          <p style={{ color: '#6B7280', marginBottom: '24px', fontSize: '0.92rem' }}>
            Sản phẩm bạn đang tìm kiếm có thể đã ngừng cung cấp hoặc liên kết không chính xác.
          </p>
          <Link 
            to="/" 
            className="btn-primary" 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '8px', textDecoration: 'none' }}
          >
            <ArrowLeft size={18} /> Quay lại Trang Chủ
          </Link>
        </div>
      </div>
    );
  }

  // Schema JSON-LD Product
  const schemaProduct = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: product.name,
    image: allImages,
    description: product.description || `Mua hộ ${product.name} chính hãng từ Olive Young Hàn Quốc với quy trình Order 8 Bước Minh Bạch.`,
    sku: product.goodsNo || 'TAVY-' + product.id,
    mpn: product.goodsNo,
    brand: {
      '@type': 'Brand',
      name: product.brand || 'Olive Young'
    },
    offers: {
      '@type': 'Offer',
      url: `https://tavyorder.web.app/san-pham/${slug}`,
      priceCurrency: 'VND',
      price: calculatedVnd,
      priceValidUntil: '2027-12-31',
      availability: product.is_sold_out || product.isSoldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition'
    }
  };

  const pageTitle = `${product.name} - Mua Hộ Olive Young Hàn Quốc | TAVY KOREA`;
  const pageDescription = product.description 
    ? `${product.description.slice(0, 155)}...` 
    : `Đặt mua hộ ${product.name} chính hãng tại Olive Young Hàn Quốc. Tỷ giá minh bạch, giao tận nơi 3-5 ngày qua TAVY Korea.`;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-ivory, #FAF9F6)' }}>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={`https://tavyorder.web.app/san-pham/${slug}`} />
        
        {/* OpenGraph */}
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:image" content={allImages[0]} />
        <meta property="og:url" content={`https://tavyorder.web.app/san-pham/${slug}`} />
        <meta property="og:type" content="product" />
        <meta property="og:site_name" content="TAVY KOREA" />

        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(schemaProduct)}
        </script>
      </Helmet>

      {/* Breadcrumb */}
      <div style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid var(--border-color, #E5E7EB)', padding: '12px 16px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#6B7280', flexWrap: 'wrap' }}>
          <Link to="/" style={{ color: '#4B5563', textDecoration: 'none' }}>Trang chủ</Link>
          <ChevronRight size={14} />
          <Link to="/#products" style={{ color: '#4B5563', textDecoration: 'none' }}>Mỹ phẩm Olive Young</Link>
          {product.brand && (
            <>
              <ChevronRight size={14} />
              <span style={{ color: '#4B5563' }}>{product.brand}</span>
            </>
          )}
          <ChevronRight size={14} />
          <span style={{ color: '#111827', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
            {product.name}
          </span>
        </div>
      </div>

      {/* Main Container */}
      <main style={{ flex: 1, maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '24px 16px 48px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '32px', alignItems: 'start' }}>
          
          {/* CỘT TRÁI: GALLERY ẢNH */}
          <div>
            <div style={{ 
              borderRadius: '16px', 
              overflow: 'hidden', 
              backgroundColor: '#FFFFFF', 
              border: '1px solid var(--border-color, #E5E7EB)', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
              position: 'relative'
            }}>
              <OptimizedImage
                src={allImages[activeImageIndex]}
                alt={product.name}
                aspectRatio="1 / 1"
                objectFit="contain"
                priority={true}
                fallbackSrc="https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&auto=format&fit=crop&q=80"
              />

              {product.rank && (
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  backgroundColor: '#7A4B9E',
                  color: '#FFFFFF',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(122, 75, 158, 0.4)'
                }}>
                  TOP #{product.rank} OLIVE YOUNG
                </div>
              )}
            </div>

            {/* Thumbnail list */}
            {allImages.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
                {allImages.slice(0, 8).map((img, idx) => (
                  <button
                    key={`thumb-${idx}`}
                    onClick={() => setActiveImageIndex(idx)}
                    style={{
                      width: '64px',
                      height: '64px',
                      flexShrink: 0,
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: activeImageIndex === idx ? '2px solid #7A4B9E' : '1px solid #E5E7EB',
                      padding: 0,
                      backgroundColor: '#FFFFFF',
                      cursor: 'pointer'
                    }}
                  >
                    <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}

            {/* Cam kết minh bạch */}
            <div style={{ marginTop: '24px', backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '16px' }}>
              <h4 style={{ fontSize: '0.86rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={18} color="#10B981" /> CAM KẾT ORDER MINH BẠCH 100%
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.8rem', color: '#4B5563', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Check size={14} color="#10B981" /> Mua trực tiếp tại Olive Young Hàn Quốc, kèm ảnh chụp hoá đơn thật.
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Plane size={14} color="#3B82F6" /> Vận chuyển hàng không chuyên tuyến Hàn - Việt (3-5 ngày).
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={14} color="#F59E0B" /> Đền bù 200% nếu phát hiện hàng giả, hàng không rõ nguồn gốc.
                </li>
              </ul>
            </div>
          </div>

          {/* CỘT PHẢI: THÔNG TIN VÀ NÚT MUA HÀNG */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ 
                fontSize: '0.76rem', 
                fontWeight: 700, 
                color: '#7A4B9E', 
                textTransform: 'uppercase', 
                letterSpacing: '0.5px' 
              }}>
                {product.brand || 'Olive Young Hàn Quốc'}
              </span>

              <button
                onClick={handleShare}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: '1px solid #E5E7EB',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '0.74rem',
                  color: '#4B5563',
                  cursor: 'pointer'
                }}
              >
                <Share2 size={13} /> {copiedLink ? 'Đã sao chép link!' : 'Chia sẻ'}
              </button>
            </div>

            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#111827', lineHeight: '1.35', marginBottom: '12px' }}>
              {product.name}
            </h1>

            {product.nameKr && (
              <p style={{ fontSize: '0.82rem', color: '#9CA3AF', marginBottom: '16px' }}>
                Tên gốc: {product.nameKr}
              </p>
            )}

            {/* Khối Giá */}
            <div style={{ 
              backgroundColor: '#FFFFFF', 
              padding: '16px', 
              borderRadius: '12px', 
              border: '1px solid #E5E7EB', 
              marginBottom: '20px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#C5A059' }}>
                  {formatVnd(calculatedVnd)}
                </span>
                {hasDiscount && (
                  <span style={{ fontSize: '1rem', textDecoration: 'line-through', color: '#9CA3AF' }}>
                    {formatVnd(calculatedOriginalVnd)}
                  </span>
                )}
                {product.discountRate && (
                  <span style={{ 
                    backgroundColor: '#FEE2E2', 
                    color: '#DC2626', 
                    fontWeight: 800, 
                    fontSize: '0.78rem', 
                    padding: '2px 8px', 
                    borderRadius: '6px' 
                  }}>
                    -{product.discountRate}%
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#6B7280', marginTop: '4px' }}>
                Giá gốc tại Hàn: <strong>{formatKrw(activeWonPrice)}</strong> (Tỷ giá: 1 KRW ~ {effectiveKrwRate.toFixed(1)} VNĐ)
              </div>
            </div>

            {/* Chọn Phân Loại (Nếu có) */}
            {hasOptions && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>
                  Chọn phân loại ({options.length} lựa chọn):
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {options.map((opt, oIdx) => {
                    const isSelected = selectedOptionIndex === oIdx;
                    return (
                      <button
                        key={`opt-${oIdx}`}
                        onClick={() => setSelectedOptionIndex(oIdx)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #7A4B9E' : '1px solid #D1D5DB',
                          backgroundColor: isSelected ? '#F5F3FF' : '#FFFFFF',
                          color: isSelected ? '#6D28D9' : '#374151',
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {isSelected && <Check size={14} color="#6D28D9" />}
                        {opt.name || opt.title || `Lựa chọn ${oIdx + 1}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Nút Hành Động */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleAddToCart(false)}
                style={{
                  flex: '1 1 180px',
                  backgroundColor: '#FFFFFF',
                  color: '#7A4B9E',
                  border: '2px solid #7A4B9E',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'background-color 0.2s'
                }}
              >
                <ShoppingBag size={18} /> Thêm Vào Giỏ
              </button>

              <button
                onClick={() => handleAddToCart(true)}
                style={{
                  flex: '1 1 200px',
                  backgroundColor: '#7A4B9E',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(122, 75, 158, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                Mua Ngay
              </button>
            </div>

            {/* Chi tiết sản phẩm & Công dụng */}
            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '20px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', marginBottom: '12px' }}>
                Thông tin sản phẩm & Công dụng
              </h3>
              <div style={{ fontSize: '0.86rem', color: '#4B5563', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                {product.description || 'Sản phẩm chính hãng nội địa Hàn Quốc được cào và cập nhật trực tiếp từ hệ thống Olive Young.'}
              </div>

              {product.usage && (
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>
                    Hướng dẫn sử dụng
                  </h4>
                  <p style={{ fontSize: '0.84rem', color: '#4B5563', lineHeight: '1.5' }}>
                    {product.usage}
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
