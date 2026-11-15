import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatVnd, formatKrw } from '../utils/priceCalculator';
import { getProductUrl } from '../utils/slugify';
import OptimizedImage from './OptimizedImage';

function ProductGrid({ products, activeCategory = 'all', krwRate, onSelectProduct, onViewDetail, itemsPerPage = 24 }) {
  const [currentPage, setCurrentPage] = useState(() => {
    try {
      const saved = parseInt(sessionStorage.getItem('tavy_catalog_page') || '1', 10);
      return Number.isFinite(saved) && saved >= 1 ? saved : 1;
    } catch {
      return 1;
    }
  });

  const prevCategoryRef = useRef(activeCategory);
  useEffect(() => {
    if (prevCategoryRef.current !== activeCategory) {
      prevCategoryRef.current = activeCategory;
      setCurrentPage(1);
      try {
        sessionStorage.setItem('tavy_catalog_page', '1');
      } catch {}
    }
  }, [activeCategory]);

  const totalProducts = products?.length || 0;
  // Logic phân trang dạng danh sách trang (Trang 1, Trang 2...)
  const totalPages = Math.max(1, Math.ceil(totalProducts / itemsPerPage));
  const effectivePage = totalProducts > 0 ? Math.min(currentPage, totalPages) : currentPage;
  const startIndex = (effectivePage - 1) * itemsPerPage;
  const currentProducts = useMemo(() => {
    return products?.slice(startIndex, startIndex + itemsPerPage) || [];
  }, [products, startIndex, itemsPerPage]);

  const saveScrollSnapshot = (goodsNo) => {
    if (typeof window === 'undefined') return;
    try {
      const currentY = Math.round(window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0);
      sessionStorage.setItem('tavy_catalog_page', String(effectivePage));
      sessionStorage.setItem('tavy_catalog_scroll_y', String(currentY));
      if (goodsNo) {
        sessionStorage.setItem('tavy_catalog_last_goods_no', String(goodsNo));
      }
      sessionStorage.setItem('tavy_catalog_restore_pending', '1');
    } catch {}
  };

  // Khôi phục đúng trang & đúng vị trí cuộn khi khách Back từ trang chi tiết sản phẩm về danh sách
  useEffect(() => {
    if (typeof window === 'undefined' || currentProducts.length === 0) return;
    let rafId = null;
    let timer1 = null;
    let timer2 = null;
    try {
      const isPending = sessionStorage.getItem('tavy_catalog_restore_pending') === '1';
      if (!isPending) return;

      const rawSavedY = sessionStorage.getItem('tavy_catalog_scroll_y');
      const savedY = rawSavedY !== null ? parseInt(rawSavedY, 10) : -1;
      const lastGoodsNo = sessionStorage.getItem('tavy_catalog_last_goods_no') || '';

      const jumpInstant = (targetTop) => {
        const htmlEl = document.documentElement;
        const prevBehavior = htmlEl.style.scrollBehavior;
        htmlEl.style.scrollBehavior = 'auto';
        window.scrollTo({ top: targetTop, left: 0, behavior: 'instant' });
        htmlEl.style.scrollBehavior = prevBehavior;
      };

      const restorePosition = () => {
        if (lastGoodsNo) {
          const cardEl = document.querySelector(`[data-goods-no="${lastGoodsNo}"]`);
          if (cardEl && Number.isFinite(savedY) && savedY >= 0) {
            jumpInstant(savedY);
            const rect = cardEl.getBoundingClientRect();
            if (rect.bottom < 64 || rect.top > window.innerHeight) {
              const cardTop = rect.top + (window.scrollY || window.pageYOffset || 0) - Math.max(90, Math.round(window.innerHeight * 0.22));
              jumpInstant(Math.max(0, cardTop));
            }
            return;
          }
          if (cardEl) {
            const rect = cardEl.getBoundingClientRect();
            const cardTop = rect.top + (window.scrollY || window.pageYOffset || 0) - Math.max(90, Math.round(window.innerHeight * 0.22));
            jumpInstant(Math.max(0, cardTop));
            return;
          }
        }
        if (Number.isFinite(savedY) && savedY >= 0) {
          jumpInstant(savedY);
        }
      };

      restorePosition();
      rafId = requestAnimationFrame(() => {
        restorePosition();
        timer1 = setTimeout(restorePosition, 60);
        timer2 = setTimeout(() => {
          restorePosition();
          try {
            sessionStorage.removeItem('tavy_catalog_restore_pending');
          } catch {}
        }, 160);
      });
    } catch {}
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (timer1) clearTimeout(timer1);
      if (timer2) clearTimeout(timer2);
    };
  }, [currentProducts.length, effectivePage]);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages || newPage === effectivePage) return;
    setCurrentPage(newPage);
    try {
      sessionStorage.setItem('tavy_catalog_page', String(newPage));
      sessionStorage.removeItem('tavy_catalog_restore_pending');
      sessionStorage.removeItem('tavy_catalog_scroll_y');
      sessionStorage.removeItem('tavy_catalog_last_goods_no');
    } catch {}
    if (typeof window !== 'undefined') {
      const elem = document.getElementById('products') || document.querySelector('.product-grid-container');
      if (elem) {
        const yOffset = -70;
        const y = elem.getBoundingClientRect().top + window.pageYOffset + yOffset;
        const htmlEl = document.documentElement;
        const prevBehavior = htmlEl.style.scrollBehavior;
        htmlEl.style.scrollBehavior = 'auto';
        window.scrollTo({ top: Math.max(0, y), left: 0, behavior: 'instant' });
        htmlEl.style.scrollBehavior = prevBehavior;
      }
    }
  };

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (effectivePage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (effectivePage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', effectivePage - 1, effectivePage, effectivePage + 1, '...', totalPages];
  }, [effectivePage, totalPages]);

  return (
    <div>
      <div className="product-grid-container">
        {currentProducts.map((product, pIdx) => {
          const won = Number(product.foreignPrice ?? product.priceKrw ?? product.priceWon ?? product.price) || 0;
          const calculatedVnd = Math.round(won * krwRate);
          const originalPriceWon = Number(product.originalPrice || product.origin_price_krw) || 0;
          const hasDiscount = originalPriceWon > won;
          const discountVal = hasDiscount
            ? (product.discountRate || product.discount_percent
                ? (String(product.discountRate || product.discount_percent).includes('%')
                    ? String(product.discountRate || product.discount_percent)
                    : `${product.discountRate || product.discount_percent}%`)
                : `${Math.round((1 - won / originalPriceWon) * 100)}%`)
            : null;
          const cleanDiscountBadge = discountVal ? (discountVal.startsWith('-') ? discountVal : `-${discountVal}`) : null;
          const defaultImg = 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&auto=format&fit=crop&q=80';
          const productUrl = getProductUrl(product);

          return (
            <div
              key={product.goodsNo || `grid-prod-${pIdx}`}
              data-goods-no={product.goodsNo || ''}
              className="product-card"
              style={{
                borderRadius: '14px',
                overflow: 'hidden',
                border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                backgroundColor: 'var(--bg-white, #FFF)',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.2s ease'
              }}
            >
              {/* Product Image with Optimized Mobile Shimmer & Lazy Loading */}
              <Link
                to={productUrl}
                onClick={() => saveScrollSnapshot(product.goodsNo)}
                className="product-card-image-wrap"
                style={{ position: 'relative', width: '100%', overflow: 'hidden', cursor: 'pointer', display: 'block' }}
              >
                <OptimizedImage
                  src={product.productImage || (product.goodsNo ? `/products/${product.goodsNo}.jpg` : '') || product.thumbnailUrl || defaultImg}
                  alt={product.name || 'Sản phẩm Hàn Quốc'}
                  aspectRatio="1 / 1"
                  objectFit="cover"
                  priority={pIdx < 4}
                  fallbackSrc={defaultImg}
                />
                <span
                  className="product-card-brand-badge"
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '20px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 3
                  }}
                >
                  {product.brand || 'Olive Young'}
                </span>
                {cleanDiscountBadge && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      backgroundColor: '#EF4444',
                      color: '#FFFFFF',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '2px 7px',
                      borderRadius: '6px',
                      zIndex: 3,
                      letterSpacing: '0.3px',
                      boxShadow: '0 2px 6px rgba(239, 68, 68, 0.35)'
                    }}
                  >
                    {cleanDiscountBadge}
                  </span>
                )}
              </Link>

              {/* Product Info */}
              <div
                className="product-card-body"
                style={{ padding: '12px', display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'space-between' }}
              >
                <div>
                  <Link
                    to={productUrl}
                    onClick={() => saveScrollSnapshot(product.goodsNo)}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <h3
                      className="product-card-title"
                      style={{
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        color: 'var(--text-dark)',
                        marginBottom: '4px',
                        lineHeight: '1.3',
                        height: '36px',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        cursor: 'pointer'
                      }}
                      title={product.name}
                    >
                      {product.name}
                    </h3>
                  </Link>
                  <p
                    className="product-card-subtitle"
                    style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '8px', minHeight: '1.2em' }}
                  >
                    {typeof product.options === 'string' && product.options
                      ? `Quy cách: ${product.options}`
                      : (Array.isArray(product.options) && product.options.length > 0
                          ? `${product.options.length} phân loại tùy chọn`
                          : 'Hàng chính hãng nội địa Hàn')}
                  </p>
                </div>

                <div>
                  {/* Check if sold out */}
                  {(() => {
                    const isProductSoldOut = Array.isArray(product.options) && product.options.length > 0
                      ? !product.options.some(opt => !opt.is_sold_out && opt.status !== 'out_of_stock')
                      : Boolean(product.is_sold_out || product.status === 'out_of_stock' || product.isSoldOut);
                    return (
                      <>
                        {/* 2 Dòng Giá Rõ Ràng: Giá tại Hàn & Giá về tay */}
                        <div
                          className="product-card-price-box"
                          style={{ marginBottom: '10px', background: 'var(--bg-subtle-purple, #F8F6FA)', padding: '8px 10px', borderRadius: '10px' }}
                        >
                          <div
                            className="product-card-price-krw-row"
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted, #6B7280)', marginBottom: '2px' }}
                          >
                            <span>Giá Hàn:</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              {(Number(product.originalPrice || product.origin_price_krw) > Number(product.foreignPrice)) && (
                                <span style={{ textDecoration: 'line-through', color: '#9CA3AF', fontSize: '0.68rem' }}>
                                  {formatKrw(product.originalPrice || product.origin_price_krw)}
                                </span>
                              )}
                              <strong style={{ color: 'var(--text-dark, #374151)', fontWeight: 700 }}>{formatKrw(product.foreignPrice)}</strong>
                            </div>
                          </div>
                          <div
                            className="product-card-price-vnd-row"
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
                          >
                            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-dark)' }}>Về tay:</span>
                            <strong style={{ fontSize: '0.98rem', color: 'var(--text-dark)', fontWeight: 800 }}>{formatVnd(calculatedVnd)}</strong>
                          </div>
                        </div>

                        {/* Buttons Action: Xem Chi Tiết & Đặt Mua Ngay */}
                        <div
                          className="product-card-actions"
                          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}
                        >
                          <button
                            className="product-card-btn-detail"
                            onClick={() => onViewDetail && onViewDetail(product)}
                            style={{
                              padding: '8px 0',
                              borderRadius: '24px',
                              border: '1px solid var(--border-color)',
                              backgroundColor: 'var(--bg-white, #FFF)',
                              color: 'var(--text-dark)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Xem chi tiết"
                          >
                            <Eye size={18} />
                          </button>

                          <button
                            className={isProductSoldOut ? 'product-card-btn-cart' : 'btn-gold product-card-btn-cart'}
                            disabled={isProductSoldOut}
                            onClick={(e) => !isProductSoldOut && onSelectProduct(product, e)}
                            style={{ 
                              width: '100%', 
                              justifyContent: 'center', 
                              padding: '8px 0',
                              borderRadius: '24px',
                              display: 'flex',
                              alignItems: 'center',
                              backgroundColor: isProductSoldOut ? '#E5E7EB' : undefined,
                              color: isProductSoldOut ? '#9CA3AF' : undefined,
                              cursor: isProductSoldOut ? 'not-allowed' : 'pointer'
                            }}
                            title={isProductSoldOut ? "Tạm hết hàng" : (Array.isArray(product.options) && product.options.length > 0 ? "Chọn phân loại & Đặt mua" : "Thêm vào giỏ hàng")}
                          >
                            <ShoppingBag size={18} />
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination: Minimalist Black & White Numbered Buttons */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          marginTop: '28px',
          marginBottom: '20px',
          flexWrap: 'wrap'
        }}>
          {pageNumbers.map((pNum, idx) => {
            if (pNum === '...') {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  style={{
                    padding: '0 4px',
                    color: '#94A3B8',
                    fontSize: '0.9rem',
                    fontWeight: 700
                  }}
                >
                  ...
                </span>
              );
            }

            const isActive = pNum === effectivePage;
            return (
              <button
                key={`page-${pNum}`}
                onClick={() => handlePageChange(pNum)}
                className={`pagination-btn ${isActive ? 'active' : ''}`}
                style={{
                  minWidth: '40px',
                  height: '40px',
                  padding: '0 8px',
                  borderRadius: '8px',
                  border: isActive ? '1px solid var(--purple-primary, #000000)' : '1px solid var(--border-color, #E2E8F0)',
                  backgroundColor: isActive ? 'var(--purple-primary, #000000)' : 'var(--bg-white, #FFFFFF)',
                  color: isActive ? '#FFFFFF' : 'var(--text-dark, #0F172A)',
                  fontWeight: isActive ? 800 : 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isActive ? '0 2px 4px rgba(0,0,0,0.15)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {pNum}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default memo(ProductGrid);
