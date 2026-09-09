import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { Lock, AlertCircle, ArrowLeft, ShieldAlert } from 'lucide-react';
import { getLockoutStatus } from '../utils/adminAuthGuard';

export default function AdminLoginPage() {
  const { loginAdmin, isAdminAuthenticated } = useContext(AppContext);
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [lockoutInfo, setLockoutInfo] = useState(() => getLockoutStatus());

  useEffect(() => {
    if (isAdminAuthenticated) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [isAdminAuthenticated, navigate]);

  // Live countdown timer for brute-force lockout
  useEffect(() => {
    const updateLockout = () => {
      const status = getLockoutStatus();
      setLockoutInfo(status);
      if (!status.isLocked && error.includes('tạm khoá')) {
        setError('');
      }
    };

    updateLockout();
    const interval = setInterval(updateLockout, 1000);
    return () => clearInterval(interval);
  }, [error]);

  const formatCountdown = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    // Pre-check brute-force lockout
    const currentStatus = getLockoutStatus();
    if (currentStatus.isLocked) {
      setLockoutInfo(currentStatus);
      return;
    }

    const res = await loginAdmin(password);
    if (res.success) {
      navigate('/admin/dashboard');
    } else {
      const updatedStatus = getLockoutStatus();
      setLockoutInfo(updatedStatus);
      setError(res.message);
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 120px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-ivory)',
      padding: '40px 20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '440px',
        backgroundColor: 'var(--bg-white, #FFFFFF)',
        borderRadius: '20px',
        border: '1px solid var(--border-color)',
        padding: '40px 32px',
        boxShadow: 'var(--shadow-md)'
      }}>
        {/* Title Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src="/tavy-logo.png" alt="TAVY Logo" style={{ height: '64px', width: 'auto', display: 'inline-block', objectFit: 'contain', marginBottom: '8px' }} />
          <h2 style={{ fontSize: '1.8rem', fontFamily: 'var(--font-serif)', color: 'var(--text-dark)', fontWeight: 400 }}>
            Quản Trị Hệ Thống
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '6px' }}>
            TAVY KOREA • CỔNG DÀNH CHO QUẢN TRỊ VIÊN
          </p>
        </div>

        {/* Lockout Alert Banner with Live Countdown */}
        {lockoutInfo.isLocked && (
          <div style={{
            backgroundColor: '#FEF2F2',
            border: '1.5px solid #F87171',
            color: '#991B1B',
            padding: '16px',
            borderRadius: '12px',
            fontSize: '0.85rem',
            marginBottom: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
              <ShieldAlert size={20} color="#DC2626" />
              <span>HỆ THỐNG ĐANG TẠM KHOÁ ĐĂNG NHẬP</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: '1.4' }}>
              Do nhập sai mật khẩu 5 lần liên tiếp (Cấp độ bảo vệ {lockoutInfo.tier}). Vui lòng chờ đến khi hết thời gian đếm ngược:
            </p>
            <div style={{
              marginTop: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#FFFFFF',
              border: '1px solid #FCA5A5',
              borderRadius: '8px',
              padding: '8px 12px',
              fontWeight: 800,
              fontSize: '1.25rem',
              color: '#DC2626',
              letterSpacing: '2px',
              fontVariantNumeric: 'tabular-nums'
            }}>
              ⏱ {formatCountdown(lockoutInfo.remainingSeconds)}
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem('tavy_admin_lockout');
                  setLockoutInfo({ isLocked: false, remainingSeconds: 0, tier: 1, remainingAttempts: 5, lockedUntil: 0 });
                  setError('');
                } catch {}
              }}
              style={{
                marginTop: '6px',
                background: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center'
              }}
            >
              🔓 Mở Khóa Khẩn Cấp Ngay
            </button>
          </div>
        )}

        {/* Normal Error Banner */}
        {error && !lockoutInfo.isLocked && (
          <div style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#991B1B',
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '0.85rem',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-dark)', marginBottom: '8px' }}>
              Mật khẩu Admin cấp cao
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                placeholder={lockoutInfo.isLocked ? "Tài khoản đang bị tạm khoá..." : "Nhập mật khẩu quản trị..."}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={lockoutInfo.isLocked}
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 44px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: lockoutInfo.isLocked ? '#F3F4F6' : '#FFF',
                  color: lockoutInfo.isLocked ? '#9CA3AF' : 'var(--text-dark)',
                  fontSize: '0.95rem',
                  outline: 'none',
                  cursor: lockoutInfo.isLocked ? 'not-allowed' : 'text',
                  transition: 'border 0.2s ease, opacity 0.2s ease',
                  opacity: lockoutInfo.isLocked ? 0.7 : 1
                }}
              />
              <Lock size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: lockoutInfo.isLocked ? '#9CA3AF' : 'var(--purple-primary)' }} />
            </div>
          </div>

          <button
            type="submit"
            className="btn-gold"
            disabled={lockoutInfo.isLocked}
            style={{
              width: '100%',
              padding: '14px 0',
              justifyContent: 'center',
              fontSize: '0.85rem',
              borderRadius: '10px',
              opacity: lockoutInfo.isLocked ? 0.6 : 1,
              cursor: lockoutInfo.isLocked ? 'not-allowed' : 'pointer'
            }}
          >
            {lockoutInfo.isLocked
              ? `TẠM KHOÁ (${formatCountdown(lockoutInfo.remainingSeconds)})`
              : 'ĐĂNG NHẬP VÀO HỆ THỐNG'}
          </button>
        </form>

        <div style={{ marginTop: '28px', textAlign: 'center' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
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
