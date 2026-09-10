import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link to="/" className="brand-logo" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', marginBottom: '16px' }}>
              <img
                src="/tavy-logo.png"
                alt="TAVY Logo"
                style={{ height: '48px', width: 'auto', display: 'block', objectFit: 'contain' }}
              />
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--purple-primary)', letterSpacing: '2px', textTransform: 'uppercase' }}>
                KOREA
              </span>
            </Link>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '20px' }}>
              TAVY - Hệ thống mua hộ & phân phối Mỹ phẩm Olive Young, Thực phẩm chức năng & Thuốc nội địa Hàn Quốc chính hãng 100% cho người Việt.
            </p>
          </div>

          <div className="footer-col">
            <h5>CHÍNH SÁCH & QUY ĐỊNH</h5>
            <ul className="footer-links">
              <li><Link to="/policy#order">Quy định mua hàng hộ</Link></li>
              <li><Link to="/policy#refund">Chính sách đổi trả & Hoàn tiền</Link></li>
              <li><Link to="/policy#payment">Hướng dẫn thanh toán</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h5>DANH MỤC HÀNG</h5>
            <ul className="footer-links">
              <li><a href="/#products">Mỹ phẩm</a></li>
              <li><a href="/#products">Sâm nấm</a></li>
              <li><a href="/#products">Thực phẩm chức năng</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h5>LIÊN HỆ TAVY</h5>
            <ul className="footer-links" style={{ gap: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <li>
                <strong style={{ color: 'var(--text-dark)', fontWeight: 600 }}>Hotline / Zalo VN:</strong> 0935 861 690
              </li>
              <li>
                <strong style={{ color: 'var(--text-dark)', fontWeight: 600 }}>Hotline Korea:</strong> 010 6671 3978
              </li>
              <li>
                <strong style={{ color: 'var(--text-dark)', fontWeight: 600 }}>Email:</strong> lehavy30042000@gmail.com
              </li>
            </ul>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid var(--border-color)',
          paddingTop: '24px',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: 'var(--text-light)'
        }}>
          © 2026 TAVY KOREA. Tất cả quyền được bảo lưu. Dịch vụ hàng xách tay & nhập khẩu Hàn Quốc uy tín.
        </div>
      </div>
    </footer>
  );
}
