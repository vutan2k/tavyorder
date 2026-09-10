import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, ShoppingBag, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import OptimizedImage from './OptimizedImage';

// Chuẩn hóa URL ảnh HD sắc nét từ Olive Young
const getHighResUrl = (url) => {
  if (!url) return '';
  return url
    .replace(/RS=\d+x\d+&?/gi, '')
    .replace(/QT=\d+&?/gi, 'QT=100&')
    .replace(/\?$/, '')
    .trim();
};

export default function ProductDetailModal({ product, krwRate, onClose, onOrderNow, hideAddToCart = false }) {
  const options = Array.isArray(product?.options) ? product.options : [];
  const hasOptions = options.length > 0;
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);

  useEffect(() => {
    setSelectedOptionIndex(0);
  }, [product]);

  const activeOption = hasOptions ? options[selectedOptionIndex] : null;
  const optionImage = activeOption?.image_url ? getHighResUrl(activeOption.image_url) : null;

  const rawImages = product?.images && product.images.length > 0 ? product.images : (product?.productImage ? [product.productImage] : []);
  const images = Array.from(new Set(rawImages.map(getHighResUrl))).filter(Boolean);

  const reviewPhotos = Array.from(new Set([
    ...images,
    ...(product?.photoReviews || [])
  ])).map(getHighResUrl).filter(Boolean);

  const allPhotos = useMemo(() => {
    const list = [...reviewPhotos];
    if (product?.productImage) list.unshift(getHighResUrl(product.productImage));
    if (optionImage && !list.includes(optionImage)) list.unshift(optionImage);
    const unique = Array.from(new Set(list.filter(Boolean)));
    return unique.length > 0 ? unique : (product?.productImage ? [getHighResUrl(product.productImage)] : []);
  }, [reviewPhotos, product?.productImage, optionImage]);

  const [activeSlide, setActiveSlide] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(null); // Fullscreen HD Lightbox Index
  const [activeZoomSlide, setActiveZoomSlide] = useState(0);
  const carouselRef = useRef(null);
  const lightboxCarouselRef = useRef(null);

  useEffect(() => {
    setActiveSlide(0);
    if (carouselRef.current) {
      carouselRef.current.scrollTo({ left: 0 });
    }
  }, [product, selectedOptionIndex]);

  // Đồng bộ vị trí cuộn khi mở Lightbox phóng to ảnh HD
  useEffect(() => {
    if (zoomIndex !== null) {
      setActiveZoomSlide(zoomIndex);
      setTimeout(() => {
        if (lightboxCarouselRef.current) {
          const w = lightboxCarouselRef.current.offsetWidth || (typeof window !== 'undefined' ? window.innerWidth : 0);
          if (w > 0) {
            lightboxCarouselRef.current.scrollTo({
              left: zoomIndex * w,
              behavior: 'instant'
            });
          }
        }
      }, 30);
    }
  }, [zoomIndex]);

  // Lắng nghe phím Escape để lùi 1 bước: đóng Lightbox trước, nếu Lightbox đã đóng thì mới đóng Modal chi tiết
  useEffect(() => {
    if (!product) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (zoomIndex !== null) {
          e.stopPropagation();
          setZoomIndex(null);
        } else if (onClose) {
          onClose();
        }
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [product, zoomIndex, onClose]);

  if (!product) return null;

  const isOptionSoldOut = Boolean(activeOption?.is_sold_out || activeOption?.status === 'out_of_stock');
  const activeWon = activeOption?.price_krw ? Number(activeOption.price_krw) : (Number(product?.foreignPrice ?? product?.priceKrw ?? product?.priceWon ?? product?.price) || 0);
  const originalWon = activeOption?.original_price_krw
    ? Number(activeOption.original_price_krw)
    : (Number(product?.originalPrice || product?.origin_price_krw) || 0);
  const discountBadge = activeOption?.discount_percent
    ? `-${activeOption.discount_percent}%`
    : (product?.discountRate || (product?.discount_percent ? `-${product.discount_percent}%` : null));
  const hasDiscount = originalWon > activeWon;
  const calculatedVnd = Math.round(activeWon * krwRate);
  const formatVnd = (n) => (n || n === 0) ? `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} VNĐ` : '0 VNĐ';
  const formatKrw = (n) => `₩${(n || 0).toLocaleString('vi-VN')}`;

  const handleCarouselScroll = (e) => {
    const el = e.currentTarget;
    if (el.offsetWidth > 0) {
      const idx = Math.round(el.scrollLeft / el.offsetWidth);
      if (idx !== activeSlide && idx >= 0 && idx < allPhotos.length) {
        setActiveSlide(idx);
      }
    }
  };

  const handleLightboxScroll = (e) => {
    const el = e.currentTarget;
    const w = el.offsetWidth || (typeof window !== 'undefined' ? window.innerWidth : 0);
    if (w > 0) {
      const idx = Math.round(el.scrollLeft / w);
      if (idx !== activeZoomSlide && idx >= 0 && idx < allPhotos.length) {
        setActiveZoomSlide(idx);
      }
    }
  };

  const scrollToSlide = (idx) => {
    if (carouselRef.current) {
      carouselRef.current.scrollTo({
        left: idx * carouselRef.current.offsetWidth,
        behavior: 'smooth'
      });
      setActiveSlide(idx);
    }
  };

  const prevSlide = (e) => {
    e.stopPropagation();
    const newIdx = (activeSlide - 1 + allPhotos.length) % allPhotos.length;
    scrollToSlide(newIdx);
  };

  const nextSlide = (e) => {
    e.stopPropagation();
    const newIdx = (activeSlide + 1) % allPhotos.length;
    scrollToSlide(newIdx);
  };

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px'
      }}
    >
      <div 
        className="modal-content product-detail-popup" 
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-white, #FFFFFF)',
          color: 'var(--text-dark)',
          borderRadius: '24px',
          maxWidth: '480px',
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          position: 'relative',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Nút Đóng Modal */}
        <button
          onClick={onClose}
          aria-label="Đóng"
          style={{
            position: 'absolute',
            top: '14px',
            right: '14px',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.88)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 30,
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
          }}
        >
          <X size={18} color="var(--text-dark, #374151)" />
        </button>

        {/* 1. KHU VỰC ẢNH CHIẾM PHẦN LỚN POPUP & VUỐT NGANG */}
        <div style={{ position: 'relative', width: '100%', backgroundColor: '#FAF9F6', borderRadius: '24px 24px 0 0', overflow: 'hidden' }}>
          {/* Tag Thương hiệu nổi trên ảnh */}
          {product.brand && (
            <span style={{
              position: 'absolute',
              top: '14px',
              left: '14px',
              backgroundColor: 'rgba(0, 0, 0, 0.72)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '20px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              backdropFilter: 'blur(4px)',
              zIndex: 10
            }}>
              {product.brand}
            </span>
          )}

          {/* Badge Đếm Số Ảnh (VD: 1/8) */}
          {allPhotos.length > 1 && (
            <span style={{
              position: 'absolute',
              bottom: '12px',
              right: '14px',
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              color: '#FFFFFF',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: '14px',
              letterSpacing: '0.5px',
              backdropFilter: 'blur(4px)',
              zIndex: 10
            }}>
              {activeSlide + 1} / {allPhotos.length}
            </span>
          )}

          {/* Container Vuốt Ngang (Horizontal Carousel) */}
          <div 
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            style={{
              display: 'flex',
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              scrollBehavior: 'smooth',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              width: '100%',
              height: '340px'
            }}
          >
            {allPhotos.map((photoUrl, pIdx) => (
              <div 
                key={pIdx}
                onClick={() => setZoomIndex(pIdx)}
                style={{
                  flex: '0 0 100%',
                  width: '100%',
                  height: '100%',
                  scrollSnapAlign: 'start',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative'
                }}
              >
                <OptimizedImage
                  src={photoUrl}
                  alt={`${product.name} ${pIdx + 1}`}
                  aspectRatio="auto"
                  objectFit="contain"
                  priority={pIdx === 0}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            ))}
          </div>

          {/* Nút Chuyển Ảnh Trái / Phải (Desktop & Tablet) */}
          {allPhotos.length > 1 && (
            <>
              <button
                onClick={prevSlide}
                aria-label="Ảnh trước"
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.85)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 10,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                }}
              >
                <ChevronLeft size={18} color="#374151" />
              </button>
              <button
                onClick={nextSlide}
                aria-label="Ảnh kế tiếp"
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.85)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 10,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                }}
              >
                <ChevronRight size={18} color="#374151" />
              </button>
            </>
          )}

          {/* Thanh chấm tròn (Dot indicators) nếu số ảnh <= 8 */}
          {allPhotos.length > 1 && allPhotos.length <= 8 && (
            <div style={{
              position: 'absolute',
              bottom: '12px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '6px',
              zIndex: 10
            }}>
              {allPhotos.map((_, dotIdx) => (
                <span
                  key={dotIdx}
                  onClick={() => scrollToSlide(dotIdx)}
                  style={{
                    width: activeSlide === dotIdx ? '16px' : '6px',
                    height: '6px',
                    borderRadius: '3px',
                    backgroundColor: activeSlide === dotIdx ? 'var(--gold-primary, #C5A059)' : 'rgba(0,0,0,0.25)',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* 2. THÔNG TIN SẢN PHẨM (DƯỚI ẢNH) */}
        <div style={{ padding: '20px 22px 22px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            {product.brand && (
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                {product.brand}
              </div>
            )}
            <h2 style={{ fontSize: '1.18rem', fontWeight: 800, color: 'var(--text-dark, #111827)', lineHeight: '1.35', margin: 0 }}>
              {product.name}
            </h2>
            {typeof product.options === 'string' && product.options && (
              <div style={{ marginBottom: '10px' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-subtle-purple, #F8F6FA)',
                  color: 'var(--purple-primary, #7C3AED)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  border: '1px solid var(--border-color, #E5E7EB)'
                }}>
                  Quy cách: {product.options}
                </span>
              </div>
            )}
            {product.description && (
              <div style={{
                margin: '12px 0 0 0',
                fontSize: '0.88rem',
                color: 'var(--text-muted, #4B5563)',
                lineHeight: '1.65',
                whiteSpace: 'pre-line',
                wordBreak: 'break-word'
              }}>
                {product.description}
              </div>
            )}
          </div>

          {/* 3. CHỌN PHÂN LOẠI HÀNG (NẾU CÓ OPTIONS) */}
          {hasOptions && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-dark)' }}>
                  Phân loại ({options.length}):
                </span>
                {activeOption && (
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: isOptionSoldOut ? '#EF4444' : '#10B981',
                    backgroundColor: isOptionSoldOut ? '#FEE2E2' : '#D1FAE5',
                    padding: '2px 8px',
                    borderRadius: '6px'
                  }}>
                    {isOptionSoldOut ? 'Hết hàng' : 'Còn hàng'}
                  </span>
                )}
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '220px',
                overflowY: 'auto',
                paddingRight: '4px'
              }}>
                {options.map((opt, idx) => {
                  const isSelected = idx === selectedOptionIndex;
                  const isSoldOut = Boolean(opt.is_sold_out || opt.status === 'out_of_stock');
                  const optPriceWon = opt.price_krw ? Number(opt.price_krw) : Number(product.foreignPrice);
                  const optPriceVnd = Math.round(optPriceWon * krwRate);
                  const optDiscount = opt.discount_percent ? `-${opt.discount_percent}%` : null;

                  return (
                    <button
                      key={opt.id || idx}
                      type="button"
                      disabled={isSoldOut}
                      onClick={() => setSelectedOptionIndex(idx)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        padding: '9px 12px',
                        borderRadius: '12px',
                        border: isSelected ? '2px solid #2563EB' : '1px solid var(--border-color, #E5E7EB)',
                        backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.05)' : (isSoldOut ? '#F9FAFB' : 'var(--bg-white, #FFFFFF)'),
                        opacity: isSoldOut ? 0.55 : 1,
                        cursor: isSoldOut ? 'not-allowed' : 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        {opt.image_url ? (
                          <img
                            src={getHighResUrl(opt.image_url)}
                            alt=""
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '8px',
                              objectFit: 'cover',
                              flexShrink: 0,
                              border: '1px solid #E5E7EB'
                            }}
                          />
                        ) : null}
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: '0.82rem',
                            fontWeight: isSelected ? 700 : 600,
                            color: isSelected ? '#1D4ED8' : 'var(--text-dark, #1F2937)',
                            whiteSpace: 'normal',
                            lineHeight: 1.3
                          }}>
                            {opt.name_vi || opt.name_kr || `Phân loại #${idx + 1}`}
                          </div>
                          {opt.name_vi && opt.name_kr && opt.name_vi !== opt.name_kr && (
                            <div style={{ fontSize: '0.72rem', color: '#9CA3AF', marginTop: '2px' }}>
                              {opt.name_kr}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                          {optDiscount && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#EF4444' }}>
                              {optDiscount}
                            </span>
                          )}
                          <strong style={{ fontSize: '0.84rem', color: isSelected ? '#1D4ED8' : 'var(--text-dark)' }}>
                            {formatKrw(optPriceWon)}
                          </strong>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          ~{formatVnd(optPriceVnd)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. KHỐI GIÁ TIỀN */}
          <div style={{
            background: 'var(--bg-subtle-purple, #F8F6FA)',
            padding: '12px 16px',
            borderRadius: '14px',
            border: '1px solid var(--border-color, #E5E7EB)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted, #6B7280)', fontWeight: 600 }}>
                Giá tại Hàn:
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {hasDiscount && (
                  <span style={{ textDecoration: 'line-through', color: '#9CA3AF', fontSize: '0.82rem' }}>
                    {formatKrw(originalWon)}
                  </span>
                )}
                <strong style={{ fontSize: '0.94rem', color: 'var(--text-dark, #374151)', fontWeight: 700 }}>
                  {formatKrw(activeWon)}
                </strong>
                {discountBadge && (
                  <span style={{
                    backgroundColor: '#FEE2E2',
                    color: '#EF4444',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: '6px'
                  }}>
                    {discountBadge}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px dashed #E5E7EB' }}>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-dark)', fontWeight: 700 }}>
                Giá trọn gói về tay:
              </span>
              <strong style={{ fontSize: '1.25rem', color: 'var(--text-dark)', fontWeight: 800 }}>
                {formatVnd(calculatedVnd)}
              </strong>
            </div>
          </div>

          {/* 5. NÚT THÊM VÀO GIỎ HÀNG */}
          {!hideAddToCart && onOrderNow && (
            <button
              disabled={isOptionSoldOut}
              onClick={(e) => {
                if (isOptionSoldOut) return;
                const payloadItem = hasOptions && activeOption ? {
                  ...product,
                  cartItemId: `${product.goodsNo || product.id}_${activeOption.id || activeOption.name_vi || activeOption.name_kr}`,
                  selectedOption: activeOption,
                  options: activeOption.name_vi || activeOption.name_kr,
                  foreignPrice: activeOption.price_krw || product.foreignPrice,
                  price: activeOption.price_krw || product.price,
                  productImage: activeOption.image_url || product.productImage
                } : product;
                if (onOrderNow) onOrderNow(payloadItem, e);
                if (onClose) onClose();
              }}
              className={isOptionSoldOut ? '' : 'btn-gold'}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '14px 20px',
                borderRadius: '50px',
                cursor: isOptionSoldOut ? 'not-allowed' : 'pointer',
                border: 'none',
                backgroundColor: isOptionSoldOut ? '#E5E7EB' : undefined,
                color: isOptionSoldOut ? '#9CA3AF' : undefined,
                boxShadow: isOptionSoldOut ? 'none' : '0 4px 14px rgba(0,0,0,0.12)'
              }}
            >
              <ShoppingBag size={18} />
              <span style={{ fontSize: '0.96rem', fontWeight: 800, letterSpacing: '0.3px' }}>
                {isOptionSoldOut ? 'PHÂN LOẠI NÀY ĐÃ HẾT HÀNG' : 'THÊM VÀO GIỎ HÀNG'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* LIGHTBOX PHÓNG TO ẢNH HD FULL SCREEN HỖ TRỢ VUỐT CẢM ỨNG MƯỢT MÀ NHƯ NGOÀI TAB */}
      {zoomIndex !== null && allPhotos.length > 0 && (
        <div 
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.96)',
            backdropFilter: 'blur(12px)',
            zIndex: 100000,
            display: 'flex',
            flexDirection: 'column',
            userSelect: 'none',
            touchAction: 'pan-x'
          }}
        >
          {/* Nút Đóng */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoomIndex(null);
            }}
            aria-label="Đóng ảnh lớn"
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              backgroundColor: 'rgba(255, 255, 255, 0.22)',
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#FFF',
              zIndex: 100005,
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
            }}
          >
            <X size={26} />
          </button>

          {/* Counter Badge: 1 / 8 */}
          <div style={{
            position: 'absolute',
            top: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            color: '#FFF',
            padding: '6px 18px',
            borderRadius: '20px',
            fontSize: '0.88rem',
            fontWeight: 700,
            letterSpacing: '1px',
            zIndex: 100005,
            backdropFilter: 'blur(8px)'
          }}>
            {activeZoomSlide + 1} / {allPhotos.length}
          </div>

          {/* Fullscreen Horizontal Swipe Carousel (Vuốt mượt mà tự nhiên như ngoài tab) */}
          <div 
            ref={lightboxCarouselRef}
            onScroll={handleLightboxScroll}
            onClick={() => setZoomIndex(null)}
            style={{
              display: 'flex',
              width: '100vw',
              height: '100vh',
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              scrollBehavior: 'smooth',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}
          >
            {allPhotos.map((photoUrl, pIdx) => (
              <div 
                key={pIdx}
                style={{
                  flex: '0 0 100vw',
                  width: '100vw',
                  height: '100vh',
                  scrollSnapAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                  boxSizing: 'border-box'
                }}
              >
                <img 
                  src={photoUrl} 
                  alt={`HD Zoom ${pIdx + 1}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    maxWidth: '94vw',
                    maxHeight: '86vh',
                    objectFit: 'contain',
                    borderRadius: '16px',
                    boxShadow: '0 25px 50px rgba(0,0,0,0.7)',
                    userSelect: 'none',
                    WebkitUserSelect: 'none'
                  }} 
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
