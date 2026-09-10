import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
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
  ShoppingBag,
  ShieldCheck,
  Terminal,
  Cpu
} from 'lucide-react';

export default function AdminAiManager({ isDark }) {
  const { orders, rates, products, pendingProducts } = useContext(AppContext);
  const showToast = useToast();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputCommand, setInputCommand] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const chatEndRef = useRef(null);
  const logEndRef = useRef(null);

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

  // Auto-scroll chat to bottom when tasks update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tasks]);

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        showToast('Đã gửi lệnh tới AI!', 'success');
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
      icon: TrendingUp,
      label: 'Báo cáo vận hành',
      command: 'Báo cáo tổng quan vận hành sàn: Doanh thu, số lượng đơn, đơn chờ duyệt và đơn cần xử lý gấp.'
    },
    {
      icon: ShoppingBag,
      label: 'Kiểm tra 5 đơn mới',
      command: 'Kiểm tra chi tiết 5 đơn hàng mới nhất: Khách hàng, số điện thoại, giá trị đơn, trạng thái thanh toán và mã bước.'
    },
    {
      icon: Zap,
      label: 'Kiểm tra tỷ giá & phí',
      command: 'Kiểm tra tỷ giá KRW/VND và % phí dịch vụ mua hộ hiện tại đang áp dụng trên toàn hệ thống.'
    },
    {
      icon: Cpu,
      label: 'Kiểm tra kho & chờ duyệt',
      command: 'Kiểm tra tổng quan kho sản phẩm và danh sách các sản phẩm đang chờ duyệt tại kho nạp hàng.'
    },
    {
      icon: ShieldCheck,
      label: 'Audit hệ thống',
      command: 'Kiểm tra tình trạng kết nối Firestore, bộ nhớ RAM trên máy Mac và trạng thái các bot tự động.'
    }
  ];

  // Derive execution logs stream from task lifecycle & system status
  const systemLogs = useMemo(() => {
    const logs = [
      {
        id: 'sys-init',
        time: 'Hệ thống',
        level: 'READY',
        text: 'Hermes AI Ops worker online • Kênh realtime ai_manager_tasks sẵn sàng.'
      }
    ];

    tasks.forEach((t) => {
      const timeStr = t.requestedAt ? new Date(t.requestedAt).toLocaleTimeString('vi-VN') : '--:--';
      const shortId = t.id ? t.id.slice(0, 6) : 'cmd';
      
      logs.push({
        id: `${t.id}-in`,
        time: timeStr,
        level: 'IN',
        text: `[#${shortId}] Nhận chỉ đạo: "${t.command.slice(0, 60)}${t.command.length > 60 ? '...' : ''}"`
      });

      if (t.status === 'processing') {
        logs.push({
          id: `${t.id}-run`,
          time: timeStr,
          level: 'EXEC',
          text: `[#${shortId}] Đang phân tích dữ liệu & thực thi lệnh trên Mac...`
        });
      } else if (t.status === 'completed') {
        logs.push({
          id: `${t.id}-done`,
          time: timeStr,
          level: 'DONE',
          text: `[#${shortId}] Hoàn tất thực thi • Phản hồi (${t.response?.length || 0} ký tự).`
        });
      } else if (t.status === 'error') {
        logs.push({
          id: `${t.id}-err`,
          time: timeStr,
          level: 'ERR',
          text: `[#${shortId}] Thất bại: ${t.error || 'Lỗi runtime'}`
        });
      }
    });

    return logs;
  }, [tasks]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* 🏷️ Header: Tối giản chuẩn đen trắng, đã gỡ sạch Tỷ giá, Đơn hàng, Kho SKU */}
      <div
        style={{
          backgroundColor: isDark ? '#1E293B' : '#FFF',
          borderRadius: '10px',
          padding: '14px 18px',
          border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: isDark ? '#000000' : '#F4F4F5',
              border: isDark ? '1px solid #334155' : '1px solid #E4E4E7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isDark ? '#FFFFFF' : '#000000'
            }}
          >
            <Bot size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                AI
              </h1>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  backgroundColor: isDark ? '#000000' : '#000000',
                  color: '#FFFFFF',
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  letterSpacing: '0.04em'
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#10B981'
                  }}
                />
                ONLINE • HERMES
              </span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: '0.75rem', color: isDark ? '#94A3B8' : '#71717A', fontFamily: 'monospace' }}>
          Realtime Command Center
        </div>
      </div>

      {/* 💬 KHUNG CHAT CHÍNH (Chiếm tỉ lệ lớn ~440px) */}
      <div
        style={{
          backgroundColor: isDark ? '#0F172A' : '#FFF',
          borderRadius: '10px',
          border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          height: '440px',
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}
      >
        {/* Chat Header Bar */}
        <div
          style={{
            padding: '10px 16px',
            borderBottom: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
            backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A' }}>
              Hội Thoại & Chỉ Đạo AI
            </span>
          </div>
          <span style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#71717A', fontFamily: 'monospace' }}>
            {tasks.length} lượt tương tác
          </span>
        </div>

        {/* Chat Messages List */}
        <div
          style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: isDark ? '#94A3B8' : '#71717A' }}>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ marginLeft: '8px', fontSize: '0.82rem' }}>Đang kết nối trung tâm điều hành...</span>
            </div>
          ) : tasks.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px', color: isDark ? '#94A3B8' : '#71717A' }}>
              <Bot size={36} color={isDark ? '#475569' : '#A1A1AA'} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: isDark ? '#E2E8F0' : '#18181B' }}>
                  Chưa có lệnh nào
                </div>
                <div style={{ fontSize: '0.78rem', color: isDark ? '#94A3B8' : '#71717A', marginTop: '2px' }}>
                  Bấm lệnh nhanh bên dưới hoặc nhập chỉ đạo để AI thi hành ngay.
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
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  {/* Tin nhắn từ người dùng (A. Tân) */}
                  <div
                    style={{
                      alignSelf: 'flex-end',
                      maxWidth: '85%',
                      backgroundColor: isDark ? '#1E293B' : '#000000',
                      color: isDark ? '#F8FAFC' : '#FFFFFF',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      fontSize: '0.84rem',
                      lineHeight: '1.4'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '0.68rem', color: isDark ? '#94A3B8' : '#A1A1AA' }}>
                      <span style={{ fontWeight: 800 }}>{task.requestedBy || 'A. Tân'}</span>
                      <span>{task.requestedAt ? new Date(task.requestedAt).toLocaleTimeString('vi-VN') : ''}</span>
                    </div>
                    <div style={{ fontWeight: 600 }}>{task.command}</div>
                  </div>

                  {/* Trạng thái thực thi */}
                  {(isPending || isProcessing) && (
                    <div
                      style={{
                        alignSelf: 'flex-start',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.75rem',
                        color: isDark ? '#94A3B8' : '#71717A',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backgroundColor: isDark ? '#1E293B' : '#F4F4F5'
                      }}
                    >
                      <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>{isProcessing ? 'AI đang thi hành trên máy Mac...' : 'Chờ worker tiếp nhận...'}</span>
                    </div>
                  )}

                  {/* Phản hồi từ AI */}
                  {isCompleted && task.response && (
                    <div
                      style={{
                        alignSelf: 'flex-start',
                        maxWidth: '92%',
                        backgroundColor: isDark ? '#18181B' : '#F8FAFC',
                        border: isDark ? '1px solid #27272A' : '1px solid #E2E8F0',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        fontSize: '0.84rem',
                        color: isDark ? '#F4F4F5' : '#18181B',
                        lineHeight: '1.55'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '0.74rem', color: isDark ? '#A1A1AA' : '#71717A', marginBottom: '6px' }}>
                        <Bot size={14} />
                        <span>Phản hồi từ AI</span>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                        {task.response}
                      </div>
                    </div>
                  )}

                  {/* Lỗi nếu có */}
                  {isError && (
                    <div
                      style={{
                        alignSelf: 'flex-start',
                        maxWidth: '90%',
                        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '0.78rem',
                        color: '#EF4444'
                      }}
                    >
                      Lỗi: {task.error}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Quick Commands Bar (Nút lệnh nhanh gọn gàng ngay trên ô nhập) */}
        <div
          style={{
            padding: '6px 14px',
            borderTop: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
            backgroundColor: isDark ? '#0F172A' : '#FAFAFA',
            display: 'flex',
            gap: '6px',
            overflowX: 'auto'
          }}
        >
          {quickCommands.map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSendCommand(q.command)}
              disabled={isSubmitting}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: isDark ? '1px solid #334155' : '1px solid #E4E4E7',
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                color: isDark ? '#E2E8F0' : '#18181B',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>{q.label}</span>
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendCommand();
          }}
          style={{
            padding: '10px 14px',
            borderTop: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
            backgroundColor: isDark ? '#1E293B' : '#FFF',
            display: 'flex',
            gap: '8px',
            alignItems: 'center'
          }}
        >
          <input
            type="text"
            value={inputCommand}
            onChange={(e) => setInputCommand(e.target.value)}
            placeholder="Nhập lệnh hoặc hỏi AI..."
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '6px',
              border: isDark ? '1px solid #475569' : '1px solid #D4D4D8',
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              color: isDark ? '#FFF' : '#000',
              fontSize: '0.82rem',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            disabled={isSubmitting || !inputCommand.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isDark ? '#FFFFFF' : '#000000',
              color: isDark ? '#000000' : '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: !inputCommand.trim() || isSubmitting ? 'not-allowed' : 'pointer',
              opacity: !inputCommand.trim() || isSubmitting ? 0.4 : 1
            }}
          >
            {isSubmitting ? (
              <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Send size={14} />
            )}
            <span>Gửi</span>
          </button>
        </form>
      </div>

      {/* 📜 KHU GHI LOG Ở DƯỚI (Tỉ lệ nhỏ hơn ~180px, chuẩn Terminal Log) */}
      <div
        style={{
          backgroundColor: isDark ? '#09090B' : '#18181B',
          color: '#F4F4F5',
          borderRadius: '10px',
          border: isDark ? '1px solid #27272A' : '1px solid #27272A',
          height: '180px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
      >
        {/* Terminal Header */}
        <div
          style={{
            padding: '8px 14px',
            backgroundColor: '#0F172A',
            borderBottom: '1px solid #27272A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={14} color="#A1A1AA" />
            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#F4F4F5', fontFamily: 'monospace' }}>
              NHẬT KÝ THỰC THI (SYSTEM LOGS)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#10B981'
              }}
            />
            <span style={{ fontSize: '0.68rem', color: '#A1A1AA', fontFamily: 'monospace' }}>
              LIVE STREAM
            </span>
          </div>
        </div>

        {/* Terminal Log Body */}
        <div
          style={{
            flex: 1,
            padding: '10px 14px',
            overflowY: 'auto',
            fontFamily: 'monospace, Menlo, Courier, monospace',
            fontSize: '0.72rem',
            lineHeight: '1.6',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px'
          }}
        >
          {systemLogs.map((log) => {
            const levelColor =
              log.level === 'READY'
                ? '#10B981'
                : log.level === 'DONE'
                ? '#10B981'
                : log.level === 'ERR'
                ? '#EF4444'
                : log.level === 'EXEC'
                ? '#38BDF8'
                : '#A1A1AA';

            return (
              <div key={log.id} style={{ display: 'flex', gap: '8px', wordBreak: 'break-all' }}>
                <span style={{ color: '#71717A', flexShrink: 0 }}>[{log.time}]</span>
                <span style={{ color: levelColor, fontWeight: 700, flexShrink: 0 }}>[{log.level}]</span>
                <span style={{ color: '#E4E4E7' }}>{log.text}</span>
              </div>
            );
          })}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
