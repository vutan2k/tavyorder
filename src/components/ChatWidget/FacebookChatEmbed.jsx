import React from 'react';
import { MessageCircle, ExternalLink, ShieldCheck, Clock, Send } from 'lucide-react';

export default function FacebookChatEmbed({ isMobile }) {
  // Liên kết thực tế tới Facebook Messenger & Profile của TAVY Korea
  const facebookPageId = '122098145037531964';
  const facebookMessengerUrl = `https://m.me/${facebookPageId}`;
  const facebookProfileUrl = `https://www.facebook.com/${facebookPageId}`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: isMobile ? '12px 6px' : '20px 10px',
        textAlign: 'center',
        gap: isMobile ? '12px' : '16px'
      }}
    >
      <div
        style={{
          width: isMobile ? '48px' : '56px',
          height: isMobile ? '48px' : '56px',
          borderRadius: '50%',
          backgroundColor: '#0084FF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 16px rgba(0, 132, 255, 0.3)',
          color: '#FFFFFF'
        }}
      >
        <MessageCircle size={isMobile ? 26 : 30} />
      </div>

      <div>
        <h3 style={{ fontSize: isMobile ? '0.95rem' : '1.05rem', fontWeight: 800, color: '#1F2937', marginBottom: '4px' }}>
          TƯ VẤN VIÊN TAVY KOREA
        </h3>
        <p style={{ fontSize: isMobile ? '0.78rem' : '0.82rem', color: '#6B7280', margin: 0, maxWidth: '280px', lineHeight: 1.5 }}>
          Đội ngũ chăm sóc khách hàng tại Hàn Quốc & Việt Nam hỗ trợ giải đáp 24/7 trực tiếp qua Facebook Messenger.
        </p>
      </div>

      {/* Feature Pills */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '6px' : '8px', width: '100%', maxWidth: '280px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: isMobile ? '7px 10px' : '8px 12px', borderRadius: '8px', backgroundColor: '#F0F9FF', border: '1px solid #BAE6FD', fontSize: isMobile ? '0.74rem' : '0.78rem', color: '#0369A1', textAlign: 'left' }}>
          <Clock size={15} style={{ flexShrink: 0 }} />
          <span>Phản hồi trong vòng <strong>1-3 phút</strong></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: isMobile ? '7px 10px' : '8px 12px', borderRadius: '8px', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', fontSize: isMobile ? '0.74rem' : '0.78rem', color: '#15803D', textAlign: 'left' }}>
          <ShieldCheck size={15} style={{ flexShrink: 0 }} />
          <span>Gửi link sản phẩm nhận báo giá ngay</span>
        </div>
      </div>

      {/* Action Button */}
      <a
        href={facebookMessengerUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          width: '100%',
          maxWidth: '280px',
          padding: isMobile ? '11px 18px' : '12px 20px',
          borderRadius: '10px',
          backgroundColor: '#0084FF',
          color: '#FFFFFF',
          fontWeight: 700,
          fontSize: isMobile ? '0.84rem' : '0.88rem',
          textDecoration: 'none',
          boxShadow: '0 4px 12px rgba(0, 132, 255, 0.3)',
          transition: 'all 0.2s ease',
          touchAction: 'manipulation'
        }}
        onMouseEnter={(e) => {
          if (!isMobile) {
            e.currentTarget.style.backgroundColor = '#0073E6';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isMobile) {
            e.currentTarget.style.backgroundColor = '#0084FF';
            e.currentTarget.style.transform = 'translateY(0)';
          }
        }}
      >
        <Send size={16} />
        <span>Mở Facebook Messenger</span>
        <ExternalLink size={14} style={{ opacity: 0.8 }} />
      </a>

      <a
        href={facebookProfileUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: isMobile ? '0.72rem' : '0.75rem', color: '#6B7280', textDecoration: 'underline', touchAction: 'manipulation' }}
      >
        Xem Trang Facebook chính thức TAVY Korea
      </a>
    </div>
  );
}
