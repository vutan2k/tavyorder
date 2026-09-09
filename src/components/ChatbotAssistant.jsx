import React, { useState, useEffect, useRef } from 'react';
import { X, Send, User } from 'lucide-react';
import { OLIVE_YOUNG_CATALOG } from '../data/catalog';

const SupportIcon = ({ size = 24, color = "currentColor", ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 64 64" 
    fill="none" 
    stroke={color} 
    strokeWidth="3.8" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    {/* Headset arc */}
    <path d="M19 28c0-7 5-13 13-13s13 6 13 13" />
    
    {/* Headset cups */}
    <rect x="14" y="25" width="6" height="10" rx="3" />
    <rect x="44" y="25" width="6" height="10" rx="3" />
    
    {/* Microphone */}
    <path d="M17 33c0 4 3 6 7 6h2" />
    <circle cx="28" cy="39" r="2" fill={color} />
    
    {/* Face / Head outline */}
    <path d="M22 28c0 4 2 8 5 10v2a5 5 0 0 0 10 0v-2c3-2 5-6 5-10 0-5.5-4.5-10-10-10S22 22.5 22 28z" />
    
    {/* Hair outline (simple) */}
    <path d="M24 23c2-3 5-4 8-4s6 1 8 4" />
    
    {/* Collar & Tie */}
    <path d="M27 49l5 5 5-5" />
    <path d="M32 54v6" />
    <path d="M29 60h6" />
    
    {/* Shoulders */}
    <path d="M12 60c2-5 6-8 12-9h16c6 1 10 4 12 9" />
  </svg>
);

export default function ChatbotAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: 'Xin chào! Mình là chuyên viên hỗ trợ mua hộ từ TAVY KOREA 🌸. Mình có thể giúp bạn tư vấn mỹ phẩm Hàn Quốc, thực phẩm chức năng hoặc giải đáp thắc mắc về đơn hàng của bạn. Hôm nay bạn cần hỗ trợ gì thế?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  // Smart Offline Advisor fallback when API key is missing or calls fail
  const getOfflineResponse = (query) => {
    const q = query.toLowerCase();
    
    // 1. Check for product catalog matching
    let matchedProducts = [];
    
    if (q.includes('mụn') || q.includes('acne') || q.includes('nặn mụn')) {
      matchedProducts = OLIVE_YOUNG_CATALOG.filter(p => 
        p.category === 'pharmacy' && (p.name.includes('mụn') || p.description.includes('mụn'))
      );
    } else if (q.includes('cà chua') || q.includes('lỗ chân lông') || q.includes('pore') || q.includes('se khít')) {
      matchedProducts = OLIVE_YOUNG_CATALOG.filter(p => p.name.includes('Cà Chua Green Tomato') || p.brand.includes('Sungboon'));
    } else if (q.includes('dưỡng ẩm') || q.includes('khô') || q.includes('cấp nước') || q.includes('serum')) {
      matchedProducts = OLIVE_YOUNG_CATALOG.filter(p => p.name.includes('Torriden') || p.name.includes('Anua') || p.name.includes('d\'Alba'));
    } else if (q.includes('chống nắng') || q.includes('nắng') || q.includes('sunscreen')) {
      matchedProducts = OLIVE_YOUNG_CATALOG.filter(p => p.name.includes('chống nắng') || p.category === 'skincare' && p.name.includes('Sunscreen'));
    } else if (q.includes('son') || q.includes('tint') || q.includes('môi') || q.includes('makeup') || q.includes('phấn')) {
      matchedProducts = OLIVE_YOUNG_CATALOG.filter(p => p.category === 'makeup');
    } else if (q.includes('sâm') || q.includes('hồng sâm') || q.includes('bồi bổ') || q.includes('khỏe') || q.includes('collagen')) {
      matchedProducts = OLIVE_YOUNG_CATALOG.filter(p => p.category === 'health');
    }

    if (matchedProducts.length > 0) {
      const prod = matchedProducts[0];
      return `Dựa trên nhu cầu của bạn, mình đề xuất sản phẩm cực hot: **${prod.name}** của thương hiệu *${prod.brand}*.\n\n✨ **Công dụng chính:** ${prod.description}\n💰 **Giá tham khảo tại Hàn Quốc:** ₩${prod.foreignPrice.toLocaleString()} (~${(prod.foreignPrice * 19.5).toLocaleString()}đ).\n\nBạn có muốn đặt mua sản phẩm này không?`;
    }

    // 2. Shipping or general order queries
    if (q.includes('ship') || q.includes('vận chuyển') || q.includes('phí') || q.includes('cước') || q.includes('bao lâu')) {
      return `✈️ **Thông tin vận chuyển tại TAVY KOREA:**\n- Hàng bay Air trực tiếp từ Seoul về Việt Nam chỉ mất từ **3 - 5 ngày làm việc**.\n- Cước vận chuyển Air thông thường khoảng 180,000đ/kg.\n- Bạn có thể theo dõi tiến độ bay thực tế của đơn hàng tại tab **Đơn của tôi** sau khi đặt hàng.`;
    }

    if (q.includes('thanh toán') || q.includes('cọc') || q.includes('chuyển khoản') || q.includes('bank')) {
      return `💳 **Chính sách thanh toán:**\n- TAVY hỗ trợ đặt cọc trước **50% hoặc thanh toán 100%** giá trị đơn hàng.\n- Bạn có thể chuyển khoản bằng quét mã **VietQR (MB Bank)** nhanh chóng hoặc chuyển khoản ngân hàng **Woori Bank (Hàn Quốc)** nếu thanh toán bằng Won.`;
    }

    return `Cảm ơn câu hỏi của bạn! Mình khuyên bạn nên xem qua dòng sản phẩm dưỡng ẩm **Torriden Low Molecular Hyaluronic Acid** hoặc nước hoa hồng **Anua Heartleaf 77%** cực kỳ lành tính và đang bán chạy số 1 tại Olive Young Seoul lúc này. Bạn có muốn mình tư vấn kỹ hơn về loại da của bạn không?`;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userText = inputValue;
    const newMsg = {
      id: Date.now(),
      sender: 'user',
      text: userText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMsg]);
    setInputValue('');
    setIsTyping(true);

    // Call Gemini AI
    if (apiKey) {
      try {
        const systemInstruction = `Bạn là TAVY AI Assistant, trợ lý ảo tư vấn mua sắm chuyên nghiệp và vui vẻ của website TAVY KOREA (chuyên mua hộ mỹ phẩm Olive Young, thực phẩm chức năng Hàn Quốc).
Nhiệm vụ của bạn:
1. Trả lời bằng tiếng Việt tự nhiên, thân thiện, sử dụng các emoji phù hợp.
2. Tư vấn sản phẩm phù hợp cho khách hàng dựa trên danh mục sản phẩm của cửa hàng dưới đây:
${JSON.stringify(OLIVE_YOUNG_CATALOG.map(p => ({ name: p.name, brand: p.brand, category: p.category, price: p.foreignPrice, desc: p.description })))}
3. Khi giới thiệu sản phẩm, hãy nói rõ thương hiệu, công dụng chính và giá tiền (cả Won và VND quy đổi x19.5).
4. Phí vận chuyển Air từ Hàn Quốc về Việt Nam là 180,000đ/kg, thời gian bay khoảng 3-5 ngày. Hỗ trợ cọc 50% chuyển khoản ngân hàng Việt Nam hoặc Woori Bank Hàn Quốc.
Hãy trả lời ngắn gọn, tập trung và thu hút khách hàng đặt hàng.`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ text: `${systemInstruction}\n\nCâu hỏi của khách hàng: ${userText}` }]
                }
              ]
            })
          }
        );

        if (!response.ok) throw new Error('API request failed');
        const data = await response.json();
        const botText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        if (botText) {
          setMessages(prev => [
            ...prev,
            {
              id: Date.now() + 1,
              sender: 'bot',
              text: botText.trim(),
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
          setIsTyping(false);
          return;
        }
      } catch (err) {
        console.warn('Lỗi gọi Gemini API, chuyển sang dùng Offline Smart Agent:', err);
      }
    }

    // Fallback to offline advisor with a slight typing delay
    setTimeout(() => {
      const reply = getOfflineResponse(userText);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          sender: 'bot',
          text: reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setIsTyping(false);
    }, 1000);
  };

  return (
    <>
      {/* Bong bóng kích hoạt chat */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'var(--purple-primary, #7A4B9E)',
          color: '#FFF',
          border: 'none',
          boxShadow: '0 8px 24px rgba(122, 75, 158, 0.35)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          zIndex: 9999,
          outline: 'none'
        }}
        className="chatbot-bubble-btn"
        title="Trò chuyện với TAVY"
      >
        {isOpen ? <X size={24} /> : <SupportIcon size={26} color="#FFF" />}
      </button>

      {/* Cửa sổ chat */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '96px',
            right: '24px',
            width: '360px',
            height: '500px',
            borderRadius: '16px',
            backgroundColor: '#FFF',
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid #EAEAEA',
            transition: 'all 0.3s ease',
            zIndex: 9999,
            fontFamily: 'Inter, sans-serif'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: 'var(--purple-primary, #7A4B9E)',
              color: '#FFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1.5px solid rgba(255,255,255,0.4)'
                }}
              >
                <SupportIcon size={22} color="#FFE6A3" />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Tư vấn viên (TAVY)</h4>
                <span style={{ fontSize: '0.7rem', color: '#FFE6A3', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }}></span>
                  Trực tuyến
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', opacity: 0.8, padding: 4 }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body Chat */}
          <div
            style={{
              flex: 1,
              padding: '20px',
              overflowY: 'auto',
              backgroundColor: '#F9F9FA',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: msg.sender === 'user' ? 'var(--purple-primary, #7A4B9E)' : '#F3F4F6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFF',
                    border: msg.sender === 'user' ? 'none' : '1px solid #E5E7EB',
                    overflow: 'hidden'
                  }}
                >
                  {msg.sender === 'user' ? (
                    <User size={14} />
                  ) : (
                    <SupportIcon size={16} color="var(--purple-primary, #7A4B9E)" />
                  )}
                </div>

                {/* Bong bóng tin nhắn */}
                <div style={{ maxWidth: '75%' }}>
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: msg.sender === 'user' ? '14px 2px 14px 14px' : '2px 14px 14px 14px',
                      backgroundColor: msg.sender === 'user' ? 'var(--purple-primary, #7A4B9E)' : '#FFF',
                      color: msg.sender === 'user' ? '#FFF' : '#333',
                      fontSize: '0.85rem',
                      lineHeight: 1.45,
                      boxShadow: msg.sender === 'user' ? 'none' : '0 2px 4px rgba(0,0,0,0.02)',
                      border: msg.sender === 'user' ? 'none' : '1px solid #EDEDED',
                      whiteSpace: 'pre-line'
                    }}
                  >
                    {msg.text}
                  </div>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      color: '#999',
                      marginTop: '4px',
                      display: 'block',
                      textAlign: msg.sender === 'user' ? 'right' : 'left'
                    }}
                  >
                    {msg.time}
                  </span>
                </div>
              </div>
            ))}

            {isTyping && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: '#F3F4F6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #E5E7EB',
                    overflow: 'hidden'
                  }}
                >
                  <SupportIcon size={16} color="var(--purple-primary, #7A4B9E)" />
                </div>
                <div
                  style={{
                    padding: '10px 18px',
                    borderRadius: '2px 14px 14px 14px',
                    backgroundColor: '#FFF',
                    border: '1px solid #EDEDED',
                    display: 'flex',
                    gap: '4px'
                  }}
                >
                  <span className="dot-typing" style={{ width: '6px', height: '6px', backgroundColor: '#999', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.3s infinite ease-in-out' }}></span>
                  <span className="dot-typing" style={{ width: '6px', height: '6px', backgroundColor: '#999', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.3s infinite ease-in-out', animationDelay: '0.2s' }}></span>
                  <span className="dot-typing" style={{ width: '6px', height: '6px', backgroundColor: '#999', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.3s infinite ease-in-out', animationDelay: '0.4s' }}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Chat Input */}
          <form
            onSubmit={handleSendMessage}
            style={{
              padding: '12px 16px',
              borderTop: '1px solid #EAEAEA',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              backgroundColor: '#FFF'
            }}
          >
            <input
              type="text"
              placeholder="Nhập tin nhắn..."
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              disabled={isTyping}
              style={{
                flex: 1,
                border: '1px solid #D1D5DB',
                borderRadius: '24px',
                padding: '8px 16px',
                fontSize: '0.85rem',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
            <button
              type="submit"
              disabled={isTyping || !inputValue.trim()}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: inputValue.trim() ? 'var(--purple-primary, #7A4B9E)' : '#F3F4F6',
                color: inputValue.trim() ? '#FFF' : '#9CA3AF',
                border: 'none',
                cursor: inputValue.trim() ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      {/* Animation CSS style */}
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </>
  );
}
