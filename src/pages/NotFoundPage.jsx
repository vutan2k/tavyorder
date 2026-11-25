import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

export default function NotFoundPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #F9FDF9 0%, #E6FFE6 100%)',
      padding: '40px 20px',
      textAlign: 'center'
    }}>
      <Helmet>
        <title>Không tìm thấy trang - TAVY KOREA</title>
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <div style={{ maxWidth: '500px' }}>
        <h1 style={{
          fontSize: '6rem',
          fontFamily: 'Georgia, serif',
          color: 'var(--purple-primary, #00FF00)',
          lineHeight: 1,
          marginBottom: '8px'
        }}>
          404
        </h1>
        <h2 style={{
          fontSize: '1.5rem',
          color: '#333',
          fontWeight: 600,
          marginBottom: '16px'
        }}>
          Trang không tồn tại
        </h2>
        <p style={{ color: '#666', fontSize: '1rem', marginBottom: '32px', lineHeight: '1.6' }}>
          Trang bạn đang tìm kiếm không tồn tại hoặc đã được di chuyển.
        </p>
        <Link
          to="/"
          style={{
            display: 'inline-block',
            padding: '12px 32px',
            borderRadius: '30px',
            background: 'var(--purple-primary, #00FF00)',
            color: '#000000',
            fontSize: '0.9rem',
            fontWeight: 800,
            textDecoration: 'none',
            letterSpacing: '1px'
          }}
        >
          VỀ TRANG CHỦ
        </Link>
      </div>
    </div>
  );
}
