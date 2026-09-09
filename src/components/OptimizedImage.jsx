import React, { useState } from 'react';

/**
 * OptimizedImage Component
 * ========================
 * Chuẩn tối ưu hóa hình ảnh cho thiết bị di động (Mobile-First Luxury):
 * 1. Native Lazy Loading & Async Decoding (không nghẽn main thread).
 * 2. Skeleton Shimmer ánh sáng ngà Luxury trong khi chờ tải (Zero Layout Shift - CLS = 0).
 * 3. Fade-in mượt mà khi tải hoàn tất.
 * 4. Fallback tự động khi ảnh bị lỗi mạng.
 */
export default function OptimizedImage({
  src,
  alt = 'Sản phẩm Hàn Quốc',
  aspectRatio = '1 / 1',
  priority = false,
  objectFit = 'cover',
  className = '',
  style = {},
  imgStyle = {},
  fallbackSrc = '/tavy-logo.png',
  borderRadius,
  onClick,
  onLoad,
  onError,
  ...rest
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const finalSrc = hasError ? fallbackSrc : (src || fallbackSrc);

  const handleLoad = (e) => {
    setIsLoaded(true);
    if (onLoad) onLoad(e);
  };

  const handleError = (e) => {
    if (!hasError) {
      setHasError(true);
      if (onError) onError(e);
    }
  };

  return (
    <div
      className={`optimized-image-container ${className}`}
      onClick={onClick}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: aspectRatio || '1 / 1',
        overflow: 'hidden',
        borderRadius: borderRadius || style.borderRadius || 0,
        backgroundColor: 'var(--bg-ivory, #FAF8F5)',
        ...style
      }}
      {...rest}
    >
      {/* 1. Skeleton Shimmer Placeholder chống giật layout (Zero CLS) */}
      {!isLoaded && (
        <div
          className="tavy-image-skeleton"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 1,
            pointerEvents: 'none'
          }}
          aria-hidden="true"
        />
      )}

      {/* 2. Thẻ img tối ưu di động với Async Decoding & Lazy Loading */}
      <img
        src={finalSrc}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={handleLoad}
        onError={handleError}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: hasError ? 'contain' : objectFit,
          opacity: isLoaded ? 1 : 0,
          transition: 'opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease',
          zIndex: 2,
          padding: hasError ? '16px' : 0,
          ...imgStyle
        }}
      />
    </div>
  );
}
