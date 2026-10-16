import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  ShoppingBag, 
  ChevronRight, 
  ArrowLeft, 
  Check, 
  Star, 
  Share2, 
  AlertCircle 
} from 'lucide-react';
import { AppContext } from '../context/AppContext';
import { formatVnd, formatKrw, getVndFromWon } from '../utils/priceCalculator';
import { extractGoodsNoFromSlug, generateProductSlug, getProductUrl } from '../utils/slugify';
import { getOptionDisplayName } from '../utils/koreanOptionTranslator';
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
    if (activeOption && (activeOption.price_krw || activeOption.price || activeOption.sale_price)) {
      return Number(activeOption.price_krw || activeOption.price || activeOption.sale_price) || 0;
    }
    return Number(product?.foreignPrice ?? product?.priceKrw ?? product?.priceWon ?? product?.price) || 0;
  }, [product, activeOption]);

  const activeOriginalWonPrice = useMemo(() => {
    if (activeOption && (activeOption.original_price_krw || activeOption.origin_price)) {
      return Number(activeOption.original_price_krw || activeOption.origin_price) || 0;
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
      selectedOptionName: activeOption ? getOptionDisplayName(activeOption, selectedOptionIndex) : null,
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
          <div className="animate-spin" style={{ width: 40, height: 40, border: '3px solid #E5E7EB', borderTopColor: 'var(--text-dark, #000000)', borderRadius: '50%', margin: '0 auto 16px' }} />
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
      <div style={{ backgroundColor: 'var(--bg-white, #FFFFFF)', borderBottom: '1px solid var(--border-color, #E5E7EB)', padding: '12px 16px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-muted, #6B7280)', flexWrap: 'wrap' }}>
          <Link to="/" style={{ color: 'var(--text-muted, #4B5563)', textDecoration: 'none' }}>Trang chủ</Link>
          <ChevronRight size={14} />
          <Link to="/#products" style={{ color: 'var(--text-muted, #4B5563)', textDecoration: 'none' }}>Mỹ phẩm Olive Young</Link>
          {product.brand && (
            <>
              <ChevronRight size={14} />
              <span style={{ color: 'var(--text-muted, #4B5563)' }}>{product.brand}</span>
            </>
          )}
          <ChevronRight size={14} />
          <span style={{ color: 'var(--text-dark, #111827)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
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
              backgroundColor: 'var(--card-bg, #FFFFFF)', 
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
                  backgroundColor: 'var(--text-dark, #000000)',
                  color: 'var(--bg-white, #FFFFFF)',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
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
                      border: activeImageIndex === idx ? '2px solid var(--text-dark, #000000)' : '1px solid var(--border-color, #E5E7EB)',
                      padding: 0,
                      backgroundColor: 'var(--card-bg, #FFFFFF)',
                      cursor: 'pointer'
                    }}
                  >
                    <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}

          </div>

          {/* CỘT PHẢI: THÔNG TIN VÀ NÚT MUA HÀNG */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ 
                fontSize: '0.76rem', 
                fontWeight: 700, 
                color: 'var(--text-muted, #71717A)', 
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
                  border: '1px solid var(--border-color, #E4E4E7)',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '0.74rem',
                  color: 'var(--text-muted, #71717A)',
                  cursor: 'pointer'
                }}
              >
                <Share2 size={13} /> {copiedLink ? 'Đã sao chép link!' : 'Chia sẻ'}
              </button>
            </div>

            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-dark, #000000)', lineHeight: '1.35', marginBottom: '12px' }}>
              {product.name}
            </h1>

            {product.nameKr && (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted, #71717A)', marginBottom: '16px' }}>
                Tên gốc: {product.nameKr}
              </p>
            )}

            {/* Khối Giá */}
            <div style={{ 
              backgroundColor: 'var(--card-bg, #FFFFFF)', 
              padding: '16px', 
              borderRadius: '12px', 
              border: '1px solid var(--border-color, #E4E4E7)', 
              marginBottom: '20px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-dark, #000000)' }}>
                  {formatVnd(calculatedVnd)}
                </span>
                {hasDiscount && (
                  <span style={{ fontSize: '1rem', textDecoration: 'line-through', color: 'var(--text-muted, #71717A)' }}>
                    {formatVnd(calculatedOriginalVnd)}
                  </span>
                )}
                {product.discountRate && (
                  <span style={{ 
                    backgroundColor: 'var(--text-dark, #000000)', 
                    color: 'var(--bg-white, #FFFFFF)', 
                    fontWeight: 800, 
                    fontSize: '0.78rem', 
                    padding: '2px 8px', 
                    borderRadius: '6px' 
                  }}>
                    -{product.discountRate}%
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted, #71717A)', marginTop: '4px' }}>
                Giá gốc tại Hàn: <strong>{formatKrw(activeWonPrice)}</strong> (Tỷ giá: 1 KRW ~ {effectiveKrwRate.toFixed(1)} VNĐ)
              </div>
            </div>

            {/* Chọn Phân Loại (Chuẩn Olive Young Hàn Quốc phiên dịch Tiếng Việt) */}
            {hasOptions && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-dark, #374151)' }}>
                    Chọn phân loại ({options.length} lựa chọn):
                  </label>
                  {activeOption && (
                    <span style={{
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      color: (activeOption.is_sold_out || activeOption.status === 'out_of_stock') ? '#EF4444' : '#10B981',
                      backgroundColor: (activeOption.is_sold_out || activeOption.status === 'out_of_stock') ? '#FEE2E2' : '#D1FAE5',
                      padding: '2px 8px',
                      borderRadius: '6px'
                    }}>
                      {(activeOption.is_sold_out || activeOption.status === 'out_of_stock') ? 'Hết hàng' : 'Còn hàng tại Hàn Quốc'}
                    </span>
                  )}
                </div>

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: options.length > 5 ? '320px' : 'none',
                  overflowY: options.length > 5 ? 'auto' : 'visible',
                  paddingRight: options.length > 5 ? '4px' : '0'
                }}>
                  {options.map((opt, oIdx) => {
                    const isSelected = selectedOptionIndex === oIdx;
                    const isSoldOut = Boolean(opt.is_sold_out || opt.status === 'out_of_stock');
                    const displayName = getOptionDisplayName(opt, oIdx);
                    const optWon = Number(opt.price_krw || opt.price || opt.sale_price || activeWonPrice) || 0;
                    const optVnd = Math.round(optWon * effectiveKrwRate);
                    const optDiscount = opt.discount_rate || (opt.discount_percent ? `${opt.discount_percent}%` : null);
                    const optImg = opt.image_url ? getHighResUrl(opt.image_url) : null;

                    return (
                      <button
                        key={opt.id || `opt-${oIdx}`}
                        type="button"
                        disabled={isSoldOut}
                        onClick={() => {
                          setSelectedOptionIndex(oIdx);
                          if (optImg) {
                            setActiveImageIndex(0);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          padding: '10px 14px',
                          borderRadius: '12px',
                          border: isSelected 
                            ? '2px solid var(--text-dark, #000000)' 
                            : '1px solid var(--border-color, #E4E4E7)',
                          backgroundColor: isSelected 
                            ? 'var(--bg-subtle-purple, #F4F4F5)' 
                            : (isSoldOut ? 'var(--bg-subtle-purple, #F9FAFB)' : 'var(--card-bg, #FFFFFF)'),
                          opacity: isSoldOut ? 0.5 : 1,
                          cursor: isSoldOut ? 'not-allowed' : 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                          width: '100%'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                          {optImg ? (
                            <img
                              src={optImg}
                              alt=""
                              style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '8px',
                                objectFit: 'cover',
                                flexShrink: 0,
                                border: '1px solid var(--border-color, #E4E4E7)',
                                backgroundColor: '#FFFFFF'
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '50%',
                              border: isSelected ? '5px solid var(--text-dark, #000000)' : '2px solid #D1D5DB',
                              backgroundColor: '#FFFFFF',
                              flexShrink: 0
                            }} />
                          )}

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{
                              fontSize: '0.84rem',
                              fontWeight: isSelected ? 700 : 600,
                              color: 'var(--text-dark, #000000)',
                              lineHeight: 1.35,
                              whiteSpace: 'normal',
                              wordBreak: 'break-word'
                            }}>
                              {displayName}
                            </div>
                            {opt.subtitle_vi && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #71717A)', marginTop: '2px' }}>
                                {opt.subtitle_vi}
                              </div>
                            )}
                            {opt.name_kr && opt.name_kr !== displayName && (
                              <div style={{ fontSize: '0.7rem', color: '#9CA3AF', marginTop: '1px' }}>
                                Tiếng Hàn: {opt.name_kr}
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                            {optDiscount && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-dark, #000000)' }}>
                                -{optDiscount.replace('-', '')}
                              </span>
                            )}
                            <strong style={{ fontSize: '0.86rem', color: 'var(--text-dark, #000000)' }}>
                              {formatVnd(optVnd)}
                            </strong>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #71717A)' }}>
                            {formatKrw(optWon)}
                          </div>
                        </div>
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
                  backgroundColor: 'var(--bg-white, #FFFFFF)',
                  color: 'var(--text-dark, #000000)',
                  border: '2px solid var(--text-dark, #000000)',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease'
                }}
              >
                <ShoppingBag size={18} /> Thêm Vào Giỏ
              </button>

              <button
                onClick={() => handleAddToCart(true)}
                style={{
                  flex: '1 1 200px',
                  backgroundColor: 'var(--text-dark, #000000)',
                  color: 'var(--bg-white, #FFFFFF)',
                  border: 'none',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
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
            <div style={{ borderTop: '1px solid var(--border-color, #E5E7EB)', paddingTop: '20px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-dark, #111827)', marginBottom: '12px' }}>
                Thông tin sản phẩm & Công dụng
              </h3>
              <div style={{ fontSize: '0.86rem', color: 'var(--text-muted, #4B5563)', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                {product.description || 'Sản phẩm chính hãng nội địa Hàn Quốc được cào và cập nhật trực tiếp từ hệ thống Olive Young.'}
              </div>

              {product.usage && (
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-dark, #111827)', marginBottom: '6px' }}>
                    Hướng dẫn sử dụng
                  </h4>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted, #4B5563)', lineHeight: '1.5' }}>
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
