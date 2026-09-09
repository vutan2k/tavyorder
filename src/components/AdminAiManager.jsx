import React, { useState, useEffect, useRef, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { sendAiManagerTask, subscribeToAiManagerTasks } from '../services/dbService';
import { useToast } from './Toast';
import {
  Bot,
  Send,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Zap,
  TrendingUp,
  CreditCard,
  ShoppingBag,
  ShieldCheck,
  Terminal,
  ChevronRight,
  Cpu
} from 'lucide-react';

export default function AdminAiManager({ isDark }) {
  const { orders, rates, products, pendingProducts } = useContext(AppContext);
  const showToast = useToast();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputCommand, setInputCommand] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef(null);

  // Subscribe to realtime AI Manager tasks
  useEffect(() => {
    const unsubscribe = subscribeToAiManagerTasks(
      (taskList) => {
        setTasks(taskList);
        setLoading(false);
      },
      (err) => {
        console.warn('Lỗi lắng nghe tác vụ AI:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Auto-scroll to bottom of tasks when new one added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tasks]);

  const handleSendCommand = async (cmdText) => {
    const textToSend = (cmdText || inputCommand).trim();
    if (!textToSend) return;

    setIsSubmitting(true);
    try {
      const res = await sendAiManagerTask(textToSend, {
        requestedBy: 'A. Tân (Owner)',
        contextSnapshot: {
          ordersCount: orders.length,
          productsCount: products.length,
          pendingCount: pendingProducts?.length || 0,
          krwRate: rates?.KRW?.rate || 19.5,
          serviceFee: rates?.serviceFeePercent || 5
        }
      });

      if (res.success) {
        showToast('Đã phát lệnh tới Phó Tướng AI!', 'success');
        if (!cmdText) setInputCommand('');
      } else {
        showToast('Không thể gửi lệnh: ' + (res.error || 'Lỗi không xác định'), 'error');
      }
    } catch (err) {
      showToast('Lỗi gửi lệnh: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickCommands = [
    {
      label: '📊 Báo Cáo Vận Hành Sàn',
      command: 'Báo cáo tổng quan vận hành sàn: Doanh thu, số lượng đơn, đơn chờ duyệt và đơn cần xử lý gấp.'
    },
    {
      label: '🔍 Soi 5 Đơn Hàng Mới Nhất',
      command: 'Soi chi tiết 5 đơn hàng mới nhất: Khách hàng, số điện thoại, giá trị đơn, trạng thái thanh toán và mã bước.'
    },
    {
      label: '💱 Kiểm Tra Tỷ Giá & Phí',
      command: 'Kiểm tra tỷ giá KRW/VND và % phí dịch vụ mua hộ hiện tại đang áp dụng trên toàn hệ thống.'
    },
    {
      label: '📦 Soi Kho Hàng & Chờ Duyệt',
      command: 'Kiểm tra tổng quan kho sản phẩm và danh sách các sản phẩm đang chờ duyệt tại kho nạp hàng.'
    },
    {
      label: '🛡️ Kiểm Tra Sức Khỏe Hệ Thống',
      command: 'Kiểm tra tình trạng kết nối Firestore, bộ nhớ RAM trên máy Mac và trạng thái các bot tự động.'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div
        style={{
          backgroundColor: isDark ? '#1E293B' : '#FFF',
          borderRadius: '16px',
          padding: '24px',
          border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.2)' : '0 4px 20px rgba(0,0,0,0.03)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #C5A059 0%, #9A7B38 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(197, 160, 89, 0.35)',
              color: '#FFF'
            }}
          >
            <Bot size={32} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 900, margin: 0, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                Phó Tướng AI Vận Hành (Hermes Agent)
              </h1>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#10B981',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '4px 10px',
                  borderRadius: '999px',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#10B981',
                    animation: 'pulse 1.5s infinite'
                  }}
                />
                ONLINE • CHỈ LẮNG NGHE A. TÂN
              </span>
            </div>
            <p style={{ margin: '6px 0 0 0', color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.85rem' }}>
              Tác tử quản trị tối cao trực thuộc A. Tân. Tự động kiểm soát đơn hàng, giám sát kho vận, cào giá thị trường Hàn Quốc và thực thi mệnh lệnh theo thời gian thực (Zero Mock Data).
            </p>
          </div>
        </div>

        {/* Realtime Stats Pills */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div
            style={{
              padding: '8px 14px',
              borderRadius: '12px',
              backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
              border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <span style={{ fontSize: '0.7rem', color: isDark ? '#94A3B8' : '#64748B', fontWeight: 600 }}>Tỷ Giá Áp Dụng</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#C5A059' }}>{rates?.KRW?.rate || 19.5} đ/₩</span>
          </div>

          <div
            style={{
              padding: '8px 14px',
              borderRadius: '12px',
              backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
              border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <span style={{ fontSize: '0.7rem', color: isDark ? '#94A3B8' : '#64748B', fontWeight: 600 }}>Tổng Đơn Hàng</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#3B82F6' }}>{orders.length} đơn</span>
          </div>

          <div
            style={{
              padding: '8px 14px',
              borderRadius: '12px',
              backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
              border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <span style={{ fontSize: '0.7rem', color: isDark ? '#94A3B8' : '#64748B', fontWeight: 600 }}>Sản Phẩm Trong Kho</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#10B981' }}>{products.length} SP</span>
          </div>
        </div>
      </div>

      {/* Quick Command Suggestions */}
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', marginBottom: '8px' }}>
          ⚡ CHỈ ĐẠO NHANH (1-CLICK DIRECTIVE)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {quickCommands.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSendCommand(q.command)}
              disabled={isSubmitting}
              style={{
                backgroundColor: isDark ? '#1E293B' : '#FFF',
                color: isDark ? '#E2E8F0' : '#1E293B',
                border: `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                borderRadius: '10px',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#C5A059';
                e.currentTarget.style.color = '#C5A059';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isDark ? '#334155' : '#CBD5E1';
                e.currentTarget.style.color = isDark ? '#E2E8F0' : '#1E293B';
              }}
            >
              <span>{q.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Command & Response Console */}
      <div
        style={{
          backgroundColor: isDark ? '#0F172A' : '#FFF',
          borderRadius: '16px',
          border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
          display: 'flex',
          flexDirection: 'column',
          height: '560px',
          overflow: 'hidden',
          boxShadow: '0 6px 24px rgba(0,0,0,0.06)'
        }}
      >
        {/* Console Header Bar */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
            backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={18} color="#C5A059" />
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A' }}>
              NHẬT KÝ CHỈ THỊ & BÁO CÁO VẬN HÀNH (LIVE AUDIT)
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: isDark ? '#94A3B8' : '#64748B' }}>
            {tasks.length} lệnh đã ghi nhận
          </span>
        </div>

        {/* Task Messages Scrollable Area */}
        <div
          style={{
            flex: 1,
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#94A3B8' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ marginLeft: '10px', fontSize: '0.85rem' }}>Đang kết nối trung tâm điều hành...</span>
            </div>
          ) : tasks.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: '#94A3B8' }}>
              <Bot size={44} color={isDark ? '#475569' : '#CBD5E1'} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: isDark ? '#E2E8F0' : '#475569' }}>
                  Chưa có chỉ đạo nào từ Boss!
                </div>
                <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                  Hãy bấm vào các nút lệnh nhanh phía trên hoặc gõ yêu cầu vào khung bên dưới để Phó Tướng AI thi hành ngay.
                </div>
              </div>
            </div>
          ) : (
            tasks.map((task) => {
              const isPending = task.status === 'pending';
              const isProcessing = task.status === 'processing';
              const isCompleted = task.status === 'completed';
              const isError = task.status === 'error';

              return (
                <div
                  key={task.id}
                  style={{
                    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                    border: `1px solid ${
                      isPending ? '#F59E0B' : isProcessing ? '#3B82F6' : isCompleted ? (isDark ? '#334155' : '#E2E8F0') : '#EF4444'
                    }`,
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  {/* Task Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          color: '#C5A059',
                          backgroundColor: 'rgba(197, 160, 89, 0.12)',
                          padding: '2px 8px',
                          borderRadius: '6px'
                        }}
                      >
                        {task.requestedBy || 'A. Tân'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                        {new Date(task.requestedAt).toLocaleTimeString('vi-VN')}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {isPending && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#F59E0B', fontWeight: 700 }}>
                          <Clock size={14} /> Chờ Mac tiếp nhận...
                        </span>
                      )}
                      {isProcessing && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#3B82F6', fontWeight: 700 }}>
                          <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Phó Tướng đang thi hành...
                        </span>
                      )}
                      {isCompleted && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#10B981', fontWeight: 700 }}>
                          <CheckCircle2 size={14} /> Đã thi hành xong
                        </span>
                      )}
                      {isError && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#EF4444', fontWeight: 700 }}>
                          <AlertCircle size={14} /> Lỗi thực thi
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Command Text */}
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                    👉 {task.command}
                  </div>

                  {/* Response Text (if completed) */}
                  {task.response && (
                    <div
                      style={{
                        backgroundColor: isDark ? '#0F172A' : '#FFF',
                        borderRadius: '8px',
                        padding: '12px 14px',
                        border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                        fontSize: '0.85rem',
                        color: isDark ? '#CBD5E1' : '#334155',
                        whiteSpace: 'pre-wrap',
                        lineHeight: '1.5'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#C5A059', fontWeight: 700, marginBottom: '6px' }}>
                        <Bot size={16} /> Báo cáo từ Phó Tướng:
                      </div>
                      {task.response}
                    </div>
                  )}

                  {/* Error Text (if any) */}
                  {task.error && (
                    <div style={{ fontSize: '0.8rem', color: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '6px' }}>
                      Lỗi: {task.error}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Command Input Field */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendCommand();
          }}
          style={{
            padding: '14px 20px',
            borderTop: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
            backgroundColor: isDark ? '#1E293B' : '#FFF',
            display: 'flex',
            gap: '10px',
            alignItems: 'center'
          }}
        >
          <input
            type="text"
            value={inputCommand}
            onChange={(e) => setInputCommand(e.target.value)}
            placeholder="Nhập mệnh lệnh chỉ đạo của Boss (VD: Báo cáo đơn hàng, kiểm tra tỉ giá, cào giá sản phẩm...)"
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '10px',
              border: `1px solid ${isDark ? '#475569' : '#CBD5E1'}`,
              backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
              color: isDark ? '#FFF' : '#0F172A',
              fontSize: '0.88rem',
              outline: 'none',
              transition: 'border 0.2s ease'
            }}
            onFocus={(e) => (e.target.style.borderColor = '#C5A059')}
            onBlur={(e) => (e.target.style.borderColor = isDark ? '#475569' : '#CBD5E1')}
          />
          <button
            type="submit"
            disabled={isSubmitting || !inputCommand.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: !inputCommand.trim() || isSubmitting ? (isDark ? '#334155' : '#CBD5E1') : '#C5A059',
              color: '#FFF',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 20px',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: !inputCommand.trim() || isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: inputCommand.trim() && !isSubmitting ? '0 4px 12px rgba(197, 160, 89, 0.35)' : 'none'
            }}
          >
            {isSubmitting ? (
              <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Send size={18} />
            )}
            <span>Ra Lệnh</span>
          </button>
        </form>
      </div>
    </div>
  );
}
