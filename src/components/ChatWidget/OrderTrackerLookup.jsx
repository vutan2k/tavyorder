import React, { useState, useContext } from 'react';
import { AppContext } from '../../context/AppContext';
import { getStatusConfig, getOrderStepIndex, ORDER_STEPS } from '../../data/orderStatuses';
import { getOrderTotalVnd, formatVnd, formatKrw } from '../../utils/priceCalculator';
import { findGuestOrders } from '../../services/guestTrackingService';
import { lookupGuestOrdersInDB } from '../../services/dbService';
import { Search, Package, Check, ExternalLink, Video, FileText, PackageCheck, Scale, Plane, Truck, ArrowLeft } from 'lucide-react';

export default function OrderTrackerLookup({ onBack, isMobile }) {
  const { orders, rates } = useContext(AppContext);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchedOrder, setSearchedOrder] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const krwRate = rates?.KRW?.rate || 19.5;
  const serviceFeeMultiplier = 1 + (rates?.serviceFeePercent ?? 5) / 100;

  const handleSearch = async (e) => {
    e?.preventDefault();
    const query = searchTerm.trim();
    if (!query) return;

    setHasSearched(true);
    let matched = findGuestOrders(query, orders || []);
    if (matched.length === 0) {
      matched = await lookupGuestOrdersInDB(query, orders || []);
    }

    setSearchedOrder(matched[0] || null);
  };

  const formatVnd = (n) => (n || n === 0) ? `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} VNĐ` : '0 VNĐ';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '14px', height: '100%' }}>
      {/* Header with Back button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #E5E7EB', paddingBottom: '8px' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--purple-primary)',
            cursor: 'pointer',
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            touchAction: 'manipulation'
          }}
          title="Quay lại menu"
        >
          <ArrowLeft size={18} />
        </button>
        <span style={{ fontSize: isMobile ? '0.84rem' : '0.88rem', fontWeight: 700, color: 'var(--text-dark)' }}>
          Tra cứu tiến độ 8 bước
        </span>
      </div>

      {/* Input Search Form */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '6px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="text"
            placeholder="Nhập Số điện thoại đặt hàng (VD: 0912345678)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: isMobile ? '10px 12px 10px 34px' : '8px 12px 8px 32px',
              borderRadius: '8px',
              border: '1px solid #D1D5DB',
              fontSize: isMobile ? '0.85rem' : '0.82rem',
              outline: 'none',
              backgroundColor: '#FFFFFF',
              color: '#1F2937'
            }}
          />
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
        </div>
        <button
          type="submit"
          style={{
            backgroundColor: 'var(--purple-primary)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            padding: isMobile ? '10px 14px' : '8px 14px',
            fontSize: isMobile ? '0.82rem' : '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            touchAction: 'manipulation'
          }}
        >
          Tra cứu
        </button>
      </form>

      {/* Result Area */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {hasSearched && !searchedOrder && (
          <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '14px', textAlign: 'center', color: '#991B1B', fontSize: '0.82rem' }}>
            <Package size={28} style={{ margin: '0 auto 6px auto', color: '#EF4444', display: 'block' }} />
            <strong>Không tìm thấy đơn hàng!</strong>
            <p style={{ margin: '4px 0 0 0', color: '#B91C1C' }}>
              Vui lòng kiểm tra lại số điện thoại nhận hàng đã đặt.
            </p>
          </div>
        )}

        {searchedOrder && (
          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: isMobile ? '12px' : '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Top Status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #F3F4F6', paddingBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: 700 }}>
                  SĐT Đơn hàng
                </span>
                <div style={{ fontSize: isMobile ? '0.9rem' : '0.95rem', fontWeight: 800, color: 'var(--purple-primary)' }}>
                  {searchedOrder.customerPhone || searchedOrder.id.replace(/^ORD-?/i, '')}
                </div>
              </div>
              {(() => {
                const cfg = getStatusConfig(searchedOrder.status);
                return (
                  <span style={{
                    backgroundColor: cfg.bgColor || '#EEF2FF',
                    color: cfg.color || 'var(--purple-primary)',
                    border: `1px solid ${cfg.borderColor || '#C7D2FE'}`,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: 700
                  }}>
                    {cfg.label}
                  </span>
                );
              })()}
            </div>

            {/* Current Step Tracker */}
            {(() => {
              const currentStepIdx = getOrderStepIndex(searchedOrder);
              const currentStep = ORDER_STEPS[currentStepIdx] || ORDER_STEPS[0];
              return (
                <div style={{ backgroundColor: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--purple-primary)', marginBottom: '4px' }}>
                    📍 Tiến độ: Bước {currentStepIdx + 1}/8 - {currentStep.title}
                  </div>
                  <div style={{ width: '100%', height: '6px', backgroundColor: '#E5E7EB', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${((currentStepIdx + 1) / 8) * 100}%`, height: '100%', backgroundColor: 'var(--purple-primary)', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              );
            })()}

            {/* Proof Media Buttons if available */}
            {(searchedOrder.povVideoUrl || searchedOrder.receiptImageUrl || searchedOrder.packingVideoUrl || searchedOrder.packageWeightKg || searchedOrder.flightCode || searchedOrder.domesticTrackingCode) && (
              <div style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>
                  🛡️ Bằng chứng minh bạch & Vận đơn:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {searchedOrder.povVideoUrl && (
                    <a
                      href={searchedOrder.povVideoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 8px', borderRadius: '6px', backgroundColor: '#FFFFFF', border: '1px solid var(--purple-primary)', color: 'var(--purple-primary)', fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none', touchAction: 'manipulation' }}
                    >
                      <Video size={12} /> Video POV Store
                    </a>
                  )}
                  {searchedOrder.receiptImageUrl && (
                    <a
                      href={searchedOrder.receiptImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 8px', borderRadius: '6px', backgroundColor: '#FFFFFF', border: '1px solid #4B5563', color: '#374151', fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none', touchAction: 'manipulation' }}
                    >
                      <FileText size={12} /> Bill Store
                    </a>
                  )}
                  {searchedOrder.packingVideoUrl && (
                    <a
                      href={searchedOrder.packingVideoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 8px', borderRadius: '6px', backgroundColor: '#FFFFFF', border: '1px solid #DB2777', color: '#DB2777', fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none', touchAction: 'manipulation' }}
                    >
                      <PackageCheck size={12} /> Video Đóng Kiện
                    </a>
                  )}
                  {searchedOrder.packageWeightKg && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 8px', borderRadius: '6px', backgroundColor: '#FFFFFF', border: '1px solid #10B981', color: '#047857', fontSize: '0.72rem', fontWeight: 700 }}>
                      <Scale size={12} /> Cân nặng: {searchedOrder.packageWeightKg} kg
                    </span>
                  )}
                  {searchedOrder.trackingCode && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 8px', borderRadius: '6px', backgroundColor: '#FFFFFF', border: '1px solid #0284C7', color: '#0369A1', fontSize: '0.72rem', fontWeight: 700 }}>
                      <Plane size={12} /> AWB Air: {searchedOrder.trackingCode}
                    </span>
                  )}
                  {searchedOrder.domesticTrackingCode && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 8px', borderRadius: '6px', backgroundColor: '#FFFFFF', border: '1px solid #059669', color: '#047857', fontSize: '0.72rem', fontWeight: 700 }}>
                      <Truck size={12} /> Vận đơn VN: {searchedOrder.domesticTrackingCode}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Total Payment Amount */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', paddingTop: '4px' }}>
              <span style={{ color: '#6B7280' }}>Tổng thanh toán:</span>
              <strong style={{ color: 'var(--text-dark)', fontSize: '0.88rem' }}>
                {formatVnd(getOrderTotalVnd(searchedOrder, rates))}
              </strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
