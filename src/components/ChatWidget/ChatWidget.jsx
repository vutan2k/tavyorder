import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ChatWidget() {
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(false);

  // Cấu hình Zalo & Hotline chính thức của TAVY Korea
  const rawZaloPhone = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ZALO_PHONE) || '0935861690';
  const cleanZaloPhone = rawZaloPhone.replace(/[^0-9]/g, '');
  const zaloChatUrl = `https://zalo.me/${cleanZaloPhone}`;
  const displayZaloPhone = '0935 861 690';

  // Link Facebook Messenger & Profile của TAVY Korea
  const facebookPageId = '100062954372060';
  const facebookMessengerUrl = `https://www.facebook.com/messages/t/${facebookPageId}`;

  // Chỉ hiển thị 2 nút Chat tư vấn ở Trang chủ, ẩn hoàn toàn ở tất cả các tab và trang khác
  const homeRoutes = ['/', '/home', '/products', '/catalog', '/kr-order'];
  const isHomePage = homeRoutes.includes(location.pathname);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!isHomePage) {
    return null;
  }

  const btnSize = isMobile ? '44px' : '58px';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: isMobile ? '16px' : '22px',
        right: isMobile ? '12px' : '22px',
        zIndex: 9995,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: isMobile ? '8px' : '12px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)'
      }}
    >
      {/* 1. NÚT ZALO (NHẢY TRỰC TIẾP QUA ZALO CHAT) */}
      <a
        href={zaloChatUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Nhắn tin tư vấn trực tiếp qua Zalo"
        title={`Chat trực tiếp qua Zalo (${displayZaloPhone})`}
        style={{
          width: btnSize,
          height: btnSize,
          borderRadius: '50%',
          backgroundColor: '#0068FF',
          color: '#FFFFFF',
          border: '2.5px solid #FFFFFF',
          boxShadow: '0 8px 24px rgba(0, 104, 255, 0.45)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease',
          touchAction: 'manipulation',
          textDecoration: 'none',
          overflow: 'hidden'
        }}
        onMouseEnter={(e) => {
          if (!isMobile) {
            e.currentTarget.style.transform = 'translateY(-3px) scale(1.08)';
            e.currentTarget.style.boxShadow = '0 12px 28px rgba(0, 104, 255, 0.6)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isMobile) {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 104, 255, 0.45)';
          }
        }}
      >
        <img
          src="/images/zalo-avatar.jpg"
          alt="Zalo Tư Vấn"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '50%',
            display: 'block'
          }}
        />
      </a>

      {/* 2. NÚT MESSENGER (NHẢY TRỰC TIẾP QUA FACEBOOK MESSENGER) */}
      <a
        href={facebookMessengerUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Nhắn tin tư vấn trực tiếp qua Facebook Messenger"
        title="Chat trực tiếp qua Facebook Messenger"
        style={{
          width: btnSize,
          height: btnSize,
          borderRadius: '50%',
          backgroundColor: '#0084FF',
          color: '#FFFFFF',
          border: '2.5px solid #FFFFFF',
          boxShadow: '0 8px 24px rgba(0, 132, 255, 0.45)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease',
          touchAction: 'manipulation',
          textDecoration: 'none'
        }}
        onMouseEnter={(e) => {
          if (!isMobile) {
            e.currentTarget.style.transform = 'translateY(-3px) scale(1.08)';
            e.currentTarget.style.boxShadow = '0 12px 28px rgba(0, 132, 255, 0.6)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isMobile) {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 132, 255, 0.45)';
          }
        }}
      >
        <svg
          width={isMobile ? 26 : 30}
          height={isMobile ? 26 : 30}
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M14 2C7.37 2 2 6.97 2 13.1C2 16.59 3.73 19.68 6.42 21.73V26L10.53 23.75C11.64 24.06 12.8 24.2 14 24.2C20.63 24.2 26 19.23 26 13.1C26 6.97 20.63 2 14 2ZM15.42 17.37L12.02 13.74L5.38 17.37L12.69 9.61L16.1 13.24L22.73 9.61L15.42 17.37Z"
            fill="#FFFFFF"
          />
        </svg>
      </a>
    </div>
  );
}
