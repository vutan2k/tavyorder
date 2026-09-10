import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';

const BANNER_IMAGES = [
  {
    url: '/banner/banner-1.webp',
    alt: 'Store Olive Young Hàn Quốc chính hãng'
  },
  {
    url: '/banner/banner-2.webp',
    alt: 'Kệ sản phẩm mỹ phẩm nội địa Hàn Quốc tại Store'
  },
  {
    url: '/banner/banner-3.webp',
    alt: 'Kiện hàng đóng gói thực tế gửi từ Seoul về Việt Nam'
  }
];

export default function HeroSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef(null);

  // Tự động chuyển ảnh sau mỗi 3.5 giây (tạm dừng khi rê chuột)
  useEffect(() => {
    if (isHovered) return;
    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % BANNER_IMAGES.length);
    }, 3500);
    return () => clearInterval(timerRef.current);
  }, [isHovered]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + BANNER_IMAGES.length) % BANNER_IMAGES.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % BANNER_IMAGES.length);
  };

  const handleTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchEndX - touchStartX;
    if (diff > 35) {
      handlePrev();
    } else if (diff < -35) {
      handleNext();
    }
    setTouchStartX(null);
  };

  return (
    <section className="hero-banner-section">
      <div className="container">
        <div className="hero-banner-wrap">
          {/* Headline & CTA */}
          <div className="hero-banner-content">
            <span className="hero-banner-tag">
              MUA HÀNG HÀN QUỐC TRỰC TIẾP TỪ STORE
            </span>

            <h1 className="hero-banner-title">
              Mỹ Phẩm & Sâm Nấm <br />
              <span className="font-serif-italic" style={{ color: 'var(--purple-primary)', fontWeight: 600 }}>Nội Địa Hàn Chính Hãng</span>
            </h1>

            <p className="hero-banner-desc">
              Phân phối và mua hộ trực tiếp từ Olive Young, hiệu thuốc và các cửa hàng uy tín tại Seoul. Giao tận tay tại Việt Nam.
            </p>

            <a
              href="#products"
              className="btn-gold hero-banner-btn"
            >
              <span>Xem tất cả sản phẩm</span>
              <ArrowRight size={15} />
            </a>
          </div>

          {/* Interactive Visual Banner Slider */}
          <div 
            className="hero-banner-slider-col"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div 
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="hero-slider-wrap"
            >
              {BANNER_IMAGES.map((img, idx) => (
                <div
                  key={idx}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundImage: `url("${img.url}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    opacity: idx === currentIndex ? 1 : 0,
                    transform: idx === currentIndex ? 'scale(1)' : 'scale(1.04)',
                    transition: 'opacity 0.6s ease, transform 0.6s ease',
                    pointerEvents: idx === currentIndex ? 'auto' : 'none'
                  }}
                  title={img.alt}
                />
              ))}

              {/* Dãy chấm nhỏ hiển thị tổng số ảnh & ảnh đang chọn */}
              <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '20px',
                backgroundColor: 'rgba(0, 0, 0, 0.38)',
                backdropFilter: 'blur(4px)',
                zIndex: 2
              }}>
                {BANNER_IMAGES.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    aria-label={`Chuyển đến ảnh ${idx + 1}`}
                    style={{
                      width: idx === currentIndex ? '16px' : '5px',
                      height: '5px',
                      borderRadius: '3px',
                      backgroundColor: idx === currentIndex ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
