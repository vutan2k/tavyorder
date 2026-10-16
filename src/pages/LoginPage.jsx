import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { loginWithGoogleAuth } = useContext(AppContext);
  const navigate = useNavigate();

  const [error, setError] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleAuth = async () => {
    setError('');
    setIsGoogleLoading(true);
    try {
      const res = await loginWithGoogleAuth();
      if (res.success) {
        navigate('/');
      } else if (res.message) {
        setError(res.message);
      }
    } catch (err) {
      setError('Lỗi kết nối dịch vụ Google. Vui lòng thử lại.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 120px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-ivory, #FAF8F5)',
      padding: '40px 20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        backgroundColor: 'var(--bg-white, #FFFFFF)',
        borderRadius: '24px',
        border: '1px solid var(--border-color, #E5E7EB)',
        boxShadow: 'var(--shadow-md, 0 8px 30px rgba(0,0,0,0.06))',
        padding: '40px 32px',
        textAlign: 'center'
      }}>
        {/* Title Header */}
        <div style={{ marginBottom: '28px' }}>
          <img
            src="/tavy-logo.png"
            alt="TAVY Logo"
            style={{ height: '58px', width: 'auto', display: 'inline-block', objectFit: 'contain', marginBottom: '6px' }}
          />
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--purple-primary, #000000)', letterSpacing: '2.5px', textTransform: 'uppercase' }}>
            KOREA
          </div>
          <h2 style={{ fontSize: '1.65rem', fontFamily: 'var(--font-serif)', color: 'var(--text-dark, #1F2937)', fontWeight: 600, marginTop: '8px' }}>
            Đăng Nhập Với Google Gmail
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted, #6B7280)', marginTop: '4px' }}>
            TAVY KOREA • MUA HÀNG HÀN QUỐC CHÍNH HÃNG
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#991B1B',
            borderRadius: '12px',
            padding: '12px 14px',
            fontSize: '0.85rem',
            marginBottom: '22px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textAlign: 'left'
          }}>
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Nút Đăng Nhập Chính Bằng Google Gmail */}
        <button
          type="button"
          disabled={isGoogleLoading}
          onClick={handleGoogleAuth}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '14px',
            border: '2px solid var(--border-color, #E2E8F0)',
            backgroundColor: 'var(--bg-white, #FFFFFF)',
            color: 'var(--text-dark, #1E293B)',
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: isGoogleLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
            transition: 'all 0.2s ease',
            opacity: isGoogleLoading ? 0.7 : 1
          }}
          onMouseEnter={(e) => {
            if (!isGoogleLoading) {
              e.currentTarget.style.backgroundColor = 'var(--bg-subtle-purple, #F8FAFC)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isGoogleLoading) {
              e.currentTarget.style.backgroundColor = 'var(--bg-white, #FFFFFF)';
            }
          }}
        >
          {isGoogleLoading ? (
            <>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              <span>Đang kết nối Google Gmail...</span>
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.41-1.57-5.13-3.72L.97 13.04C2.45 15.98 5.48 18 9 18z"/>
                <path fill="#FBBC05" d="M3.87 10.8c-.19-.53-.3-1.1-.3-1.8s.11-1.27.3-1.8L.97 4.96C.35 6.18 0 7.55 0 9s.35 2.82.97 4.04l2.9-2.24z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.45 2.02.97 4.96l2.9 2.24C4.59 5.05 6.62 3.58 9 3.58z"/>
              </svg>
              <span>Tiếp tục với Google Gmail</span>
            </>
          )}
        </button>

        <div style={{ textAlign: 'center', fontSize: '0.78rem', color: '#9CA3AF', marginTop: '18px', lineHeight: 1.5 }}>
          Bằng việc tiếp tục, Quý khách đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của TAVY KOREA.
        </div>

        {/* Nút Quay Về Trang Chủ */}
        <div style={{ marginTop: '26px', textAlign: 'center' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #6B7280)',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <ArrowLeft size={16} /> Quay về Trang chủ
          </button>
        </div>

      </div>
    </div>
  );
}

