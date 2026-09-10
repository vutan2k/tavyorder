import React, { useState, useEffect, useContext, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { useToast } from '../components/Toast';
import { ORDER_STATUSES, getStatusConfig } from '../data/orderStatuses';
import { getOrderTotalVnd, getVndFromWon, formatVnd } from '../utils/priceCalculator';
import { getEmbedVideoUrl, isEmbeddableVideo } from '../utils/videoUrlHelper';
import {
  Search, Edit3, Trash2,
  CheckCircle, AlertCircle,
  Phone, MapPin, Video, FileText, Plane,
  Sparkles, Check,
  CreditCard, LayoutGrid, List, Plus,
  X, ChevronRight, Clock, Box, ExternalLink, PackageCheck, Eye
} from 'lucide-react';

// 9 CỘT PHÂN LUỒNG KANBAN CHUẨN TAVY
const KANBAN_COLUMNS = [
  {
    id: 'pending',
    title: 'Chờ cọc',
    color: '#D97706',
    statuses: ['pending', 'quoted']
  },
  {
    id: 'deposit_paid',
    title: 'Đã cọc 100%',
    color: '#4F46E5',
    statuses: ['deposit_paid', 'paid']
  },
  {
    id: 'confirmed',
    title: 'Đã xác nhận',
    color: '#0284C7',
    statuses: ['confirmed']
  },
  {
    id: 'purchased',
    title: 'Đang mua',
    color: '#7C3AED',
    statuses: ['purchased', 'purchasing_korea']
  },
  {
    id: 'packed_kr',
    title: 'Kho Seoul',
    color: '#DB2777',
    statuses: ['packed_kr', 'in_kr_warehouse', 'korea_warehouse']
  },
  {
    id: 'in_transit_air',
    title: 'Đang bay',
    color: '#0891B2',
    statuses: ['in_transit_air', 'transit', 'shipping_vietnam']
  },
  {
    id: 'customs_cleared',
    title: 'Kho VN',
    color: '#0D9488',
    statuses: ['customs_cleared', 'in_vn_warehouse', 'vietnam_warehouse']
  },
  {
    id: 'completed',
    title: 'Đã giao',
    color: '#059669',
    statuses: ['completed', 'delivering']
  },
  {
    id: 'cancelled',
    title: 'Đã hủy',
    color: '#DC2626',
    statuses: ['cancelled']
  }
];

export default function AdminOrderManager({ isDark: isDarkProp } = {}) {
  const isDark = isDarkProp !== undefined
    ? isDarkProp
    : (typeof window !== 'undefined' && localStorage.getItem('tavy_admin_theme') === 'dark');

  const {
    orders,
    rates,
    updateOrderStatus,
    updateOrderQuote,
    updateOrderTracking,
    deleteOrder,
    createManualOrder,
    updateOrderStatusInDB
  } = useContext(AppContext);
  const showToast = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'table'
  const [activeDrawerOrder, setActiveDrawerOrder] = useState(null);
  const [copiedOrderId, setCopiedOrderId] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);

  // Thêm sản phẩm mới vào đơn
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    name: '',
    foreignPrice: '',
    qty: 1,
    productImage: ''
  });

  // Quản lý link Bằng chứng Video POV & Bill Store
  const [proofForm, setProofForm] = useState({
    povVideoUrl: '',
    packingVideoUrl: '',
    receiptImageUrl: ''
  });
  const [isSavingProof, setIsSavingProof] = useState(false);

  const [prevDrawerOrderId, setPrevDrawerOrderId] = useState(null);
  if (activeDrawerOrder && activeDrawerOrder.id !== prevDrawerOrderId) {
    setPrevDrawerOrderId(activeDrawerOrder.id);
    setProofForm({
      povVideoUrl: activeDrawerOrder.povVideoUrl || '',
      packingVideoUrl: activeDrawerOrder.packingVideoUrl || '',
      receiptImageUrl: activeDrawerOrder.receiptImageUrl || ''
    });
  }

  const handleSaveProofMedia = async () => {
    if (!activeDrawerOrder) return;
    setIsSavingProof(true);
    try {
      const payload = {
        povVideoUrl: proofForm.povVideoUrl.trim(),
        packingVideoUrl: proofForm.packingVideoUrl.trim(),
        receiptImageUrl: proofForm.receiptImageUrl.trim()
      };
      await updateOrderTracking(activeDrawerOrder.id, payload);
      setActiveDrawerOrder(prev => ({ ...prev, ...payload }));
      if (showToast) showToast('Đã lưu bằng chứng video POV & hóa đơn thành công!', 'success');
    } catch (err) {
      if (showToast) showToast('Lỗi khi lưu bằng chứng: ' + (err?.message || 'Không xác định'), 'error');
    } finally {
      setIsSavingProof(false);
    }
  };

  // Form tạo đơn thủ công
  const [manualForm, setManualForm] = useState({
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    customerNote: '',
    adminNote: 'Đơn hàng mua hộ trực tiếp theo yêu cầu.',
    status: 'pending',
    items: [{ name: '', foreignPrice: '', qty: 1 }]
  });

  const isCreateFormDirty = useMemo(() => {
    const isBasicChanged = 
      manualForm.customerName !== '' ||
      manualForm.customerPhone !== '' ||
      manualForm.customerAddress !== '' ||
      manualForm.customerNote !== '';
    
    if (isBasicChanged) return true;
    if (manualForm.items.length > 1) return true;
    
    const firstItem = manualForm.items[0];
    if (firstItem.name !== '' || firstItem.foreignPrice !== '' || Number(firstItem.qty) !== 1 || (firstItem.image || '') !== '') {
      return true;
    }
    
    return false;
  }, [manualForm]);

  const krwRate = rates?.KRW?.rate || 19.5;
  const serviceFee = rates?.serviceFeePercent || 5;

  // Lọc danh sách đơn hàng theo từ khoá
  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;
    const term = searchTerm.trim().toLowerCase();
    return orders.filter(o =>
      (o.id && o.id.toLowerCase().includes(term)) ||
      (o.customerName && o.customerName.toLowerCase().includes(term)) ||
      (o.customerPhone && o.customerPhone.includes(term)) ||
      (o.customerAddress && o.customerAddress.toLowerCase().includes(term))
    );
  }, [orders, searchTerm]);

  // Phân chia đơn hàng vào 5 cột Kanban
  const kanbanData = useMemo(() => {
    const map = {};
    KANBAN_COLUMNS.forEach(col => {
      map[col.id] = filteredOrders.filter(o => col.statuses.includes(o.status));
    });
    return map;
  }, [filteredOrders]);

  const handleCopyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedOrderId(id);
    setTimeout(() => setCopiedOrderId(null), 2000);
    if (showToast) showToast('Đã sao chép vào bộ nhớ tạm!', 'info');
  };

  const handleQuickStatusChange = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      if (showToast) {
        const cfg = getStatusConfig(newStatus);
        showToast(`Đã chuyển đơn #${orderId} sang "${cfg?.label || newStatus}"`, 'success');
      }
      if (activeDrawerOrder && activeDrawerOrder.id === orderId) {
        setActiveDrawerOrder(prev => ({ ...prev, status: newStatus }));
      }
    } catch {
      if (showToast) showToast('Lỗi khi cập nhật trạng thái đơn!', 'error');
    }
  };

  const handleDeleteOrder = (orderId) => {
    setOrderToDelete(orderId);
  };

  const confirmDelete = async () => {
    if (orderToDelete) {
      try {
        await deleteOrder(orderToDelete);
        setActiveDrawerOrder(null);
        setIsAddingItem(false);
        setOrderToDelete(null);
        if (showToast) showToast(`Đã xoá đơn hàng #${orderToDelete.replace(/^ORD-?/i, '')}`, 'info');
      } catch {
        if (showToast) showToast('Lỗi khi xoá đơn hàng!', 'error');
      }
    }
  };

  const handleSaveNewItemToOrder = async () => {
    if (!newItemForm.name.trim()) {
      if (showToast) showToast('Vui lòng nhập tên sản phẩm!', 'error');
      return;
    }
    if (!newItemForm.foreignPrice || Number(newItemForm.foreignPrice) <= 0) {
      if (showToast) showToast('Vui lòng nhập giá Won hợp lệ!', 'error');
      return;
    }
    
    try {
      const currentItems = activeDrawerOrder.items || [];
      const updatedItems = [...currentItems, {
        name: newItemForm.name,
        foreignPrice: Number(newItemForm.foreignPrice),
        qty: Number(newItemForm.qty) || 1,
        quantity: Number(newItemForm.qty) || 1,
        productImage: newItemForm.productImage || ''
      }];
      
      const totalWon = updatedItems.reduce((s, it) => s + (Number(it.foreignPrice) || 0) * (Number(it.qty || it.quantity) || 1), 0);
      const totalVnd = Math.round(totalWon * krwRate * (1 + serviceFee / 100));
      
      const updates = { 
        items: updatedItems,
        totalAmount: totalVnd,
        totalVnd: totalVnd
      };
      
      const res = await updateOrderStatusInDB(activeDrawerOrder.id, updates);
      if (res.success) {
        setActiveDrawerOrder(prev => ({ ...prev, items: updatedItems, totalAmount: totalVnd, totalVnd: totalVnd }));
        setIsAddingItem(false);
        setNewItemForm({ name: '', foreignPrice: '', qty: 1, productImage: '' });
        if (showToast) showToast('Đã thêm sản phẩm thành công!', 'success');
      } else {
        if (showToast) showToast('Lỗi khi thêm sản phẩm vào Database!', 'error');
      }
    } catch (err) {
      if (showToast) showToast('Lỗi khi thêm sản phẩm!', 'error');
    }
  };

  const handleDeleteItemFromOrder = async (itemIndex) => {
    if (!activeDrawerOrder || !activeDrawerOrder.items) return;
    
    if (activeDrawerOrder.items.length <= 1) {
      if (showToast) showToast('Đơn hàng phải có ít nhất 1 sản phẩm. Hãy huỷ đơn hoặc thêm sản phẩm khác trước!', 'error');
      return;
    }

    const confirmDel = window.confirm('Bạn có chắc chắn muốn xoá sản phẩm này khỏi đơn hàng?');
    if (!confirmDel) return;

    try {
      const currentItems = [...activeDrawerOrder.items];
      currentItems.splice(itemIndex, 1);
      
      const totalWon = currentItems.reduce((s, it) => s + (Number(it.foreignPrice) || 0) * (Number(it.qty || it.quantity) || 1), 0);
      const totalVnd = Math.round(totalWon * krwRate * (1 + serviceFee / 100));
      
      const updates = { 
        items: currentItems,
        totalAmount: totalVnd,
        totalVnd: totalVnd
      };
      
      const res = await updateOrderStatusInDB(activeDrawerOrder.id, updates);
      if (res.success) {
        setActiveDrawerOrder(prev => ({ ...prev, items: currentItems, totalAmount: totalVnd, totalVnd: totalVnd }));
        if (showToast) showToast('Đã xoá sản phẩm!', 'success');
      } else {
        if (showToast) showToast('Lỗi khi xoá sản phẩm khỏi Database!', 'error');
      }
    } catch (err) {
      if (showToast) showToast('Lỗi khi xoá sản phẩm!', 'error');
    }
  };

  const handleSaveManualOrder = async (e) => {
    e.preventDefault();
    
    // 1. Validate Customer Name
    const customerName = manualForm.customerName.trim();
    if (!customerName) {
      if (showToast) showToast('Vui lòng nhập Tên Khách Hàng!', 'error');
      return;
    }

    // 2. Validate Vietnamese Phone Number
    const customerPhone = manualForm.customerPhone.trim();
    const phoneRegex = /^0(3|5|7|8|9)[0-9]{8}$/;
    if (!customerPhone) {
      if (showToast) showToast('Vui lòng nhập Số Điện Thoại!', 'error');
      return;
    }
    if (!phoneRegex.test(customerPhone)) {
      if (showToast) showToast('Số điện thoại không đúng định dạng! Phải đủ 10 số và bắt đầu bằng 03, 05, 07, 08, hoặc 09.', 'error');
      return;
    }

    // 3. Validate Delivery Address
    const customerAddress = manualForm.customerAddress.trim();
    if (!customerAddress) {
      if (showToast) showToast('Vui lòng nhập Địa Chỉ Giao Hàng!', 'error');
      return;
    }

    // 4. Validate Product Items
    if (manualForm.items.length === 0) {
      if (showToast) showToast('Vui lòng thêm ít nhất 1 sản phẩm!', 'error');
      return;
    }

    for (let i = 0; i < manualForm.items.length; i++) {
      const item = manualForm.items[i];
      if (!item.name.trim()) {
        if (showToast) showToast(`Sản phẩm #${i + 1} chưa nhập tên!`, 'error');
        return;
      }
      const price = parseFloat(item.foreignPrice);
      if (isNaN(price) || price <= 0) {
        if (showToast) showToast(`Sản phẩm #${i + 1} phải có Giá Won (₩) lớn hơn 0!`, 'error');
        return;
      }
      const qty = parseInt(item.qty, 10);
      if (isNaN(qty) || qty <= 0) {
        if (showToast) showToast(`Sản phẩm #${i + 1} phải có Số lượng (SL) lớn hơn 0!`, 'error');
        return;
      }
    }

    try {
      const orderPayload = {
        customerName,
        customerPhone,
        customerAddress,
        customerNote: manualForm.customerNote.trim(),
        adminNote: manualForm.adminNote.trim(),
        status: manualForm.status,
        items: manualForm.items.map(it => {
          const price = parseFloat(it.foreignPrice);
          return {
            name: it.name.trim(),
            foreignPrice: price,
            qty: parseInt(it.qty, 10),
            price: Math.round(price * krwRate * (1 + serviceFee / 100)),
            productImage: it.image || 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=300&q=80'
          };
        })
      };
      
      const totalWon = manualForm.items.reduce((s, it) => s + parseFloat(it.foreignPrice) * parseInt(it.qty, 10), 0);
      const totalVnd = Math.round(totalWon * krwRate * (1 + serviceFee / 100));
      orderPayload.totalAmount = totalVnd;
      orderPayload.totalVnd = totalVnd;

      const created = await createManualOrder(orderPayload);
      setIsCreateModalOpen(false);
      if (showToast) showToast(`Đã tạo đơn hàng #${created?.id || ''} thành công!`, 'success');
      setManualForm({
        customerName: '',
        customerPhone: '',
        customerAddress: '',
        customerNote: '',
        adminNote: 'Đơn hàng mua hộ trực tiếp theo yêu cầu.',
        status: 'pending',
        items: [{ name: '', foreignPrice: '', qty: 1, image: '' }]
      });
    } catch (err) {
      console.error('Lỗi tạo đơn hàng:', err);
      const errMsg = err?.message || err?.code || 'Không xác định';
      if (showToast) showToast(`Lỗi tạo đơn hàng: ${errMsg}`, 'error', 6000);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 🔍 Thanh Tìm Kiếm & Chuyển Chế Độ Xem (Kanban vs Table) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        backgroundColor: isDark ? '#1E293B' : '#FFF',
        padding: '10px 14px',
        borderRadius: '10px',
        border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
      }}>
        {/* Search Box */}
        <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
          <Search size={15} color={isDark ? '#94A3B8' : '#64748B'} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Tìm kiếm đơn hàng (Mã đơn, Tên, SĐT)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 10px 7px 32px',
              borderRadius: '6px',
              border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
              backgroundColor: isDark ? '#0F172A' : '#FFF',
              color: isDark ? '#F8FAFC' : '#0F172A',
              fontSize: '0.82rem',
              outline: 'none'
            }}
          />
        </div>

        {/* View Switcher & Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', backgroundColor: isDark ? '#0F172A' : '#F1F5F9', padding: '2px', borderRadius: '6px', border: isDark ? '1px solid #334155' : 'none' }}>
            <button
              onClick={() => setViewMode('kanban')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '5px',
                border: 'none',
                backgroundColor: viewMode === 'kanban' ? (isDark ? '#334155' : '#FFF') : 'transparent',
                color: viewMode === 'kanban' ? (isDark ? '#F8FAFC' : '#0F172A') : (isDark ? '#94A3B8' : '#64748B'),
                fontWeight: viewMode === 'kanban' ? 700 : 500,
                fontSize: '0.78rem',
                cursor: 'pointer',
                boxShadow: viewMode === 'kanban' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <LayoutGrid size={13} />
              <span>Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '5px',
                border: 'none',
                backgroundColor: viewMode === 'table' ? (isDark ? '#334155' : '#FFF') : 'transparent',
                color: viewMode === 'table' ? (isDark ? '#F8FAFC' : '#0F172A') : (isDark ? '#94A3B8' : '#64748B'),
                fontWeight: viewMode === 'table' ? 700 : 500,
                fontSize: '0.78rem',
                cursor: 'pointer',
                boxShadow: viewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <List size={13} />
              <span>Danh Sách</span>
            </button>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: isDark ? '#F8FAFC' : '#0F172A',
              color: isDark ? '#0F172A' : '#FFF',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'opacity 0.15s ease'
            }}
          >
            <Plus size={14} />
            <span>Tạo Đơn</span>
          </button>
        </div>
      </div>

      {/* 📋 Giao diện Kanban Phân Luồng */}
      {viewMode === 'kanban' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
          gap: '12px',
          alignItems: 'flex-start',
          minHeight: '600px'
        }}>
          {KANBAN_COLUMNS.map(col => {
            const colOrders = kanbanData[col.id] || [];
            return (
              <div
                key={col.id}
                style={{
                  backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                  borderRadius: '10px',
                  border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                {/* Column Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '8px',
                  borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #E2E8F0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: col.color
                    }} />
                    <span style={{ fontWeight: 700, fontSize: '0.82rem', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                      {col.title}
                    </span>
                  </div>
                  <span style={{
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
                    color: isDark ? '#94A3B8' : '#64748B',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '999px'
                  }}>
                    {colOrders.length}
                  </span>
                </div>

                {/* Orders in Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {colOrders.length === 0 ? (
                    <div style={{
                      padding: '20px 10px',
                      textAlign: 'center',
                      color: isDark ? '#64748B' : '#94A3B8',
                      fontSize: '0.75rem',
                      borderRadius: '6px',
                      border: isDark ? '1px dashed #334155' : '1px dashed #CBD5E1'
                    }}>
                      Không có đơn
                    </div>
                  ) : (
                    colOrders.map(order => {
                      const totalVnd = getOrderTotalVnd(order, krwRate, serviceFee);
                      const itemsCount = order.items?.length || 1;
                      const firstItem = order.items?.[0];

                      return (
                        <div
                          key={order.id}
                          onClick={() => setActiveDrawerOrder(order)}
                          style={{
                            backgroundColor: isDark ? '#0F172A' : '#FFF',
                            borderRadius: '10px',
                            padding: '12px',
                            border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            cursor: 'pointer',
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = isDark ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 6px -1px rgba(0,0,0,0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                          }}
                        >
                          {/* Card Header: Order ID & Date */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#38BDF8' }}>
                              #{order.id.replace(/^ORD-?/i, '')}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                              {order.createdAt ? new Date(order.createdAt).toLocaleDateString('vi-VN') : 'Hôm nay'}
                            </span>
                          </div>

                          {/* Customer Name & Phone */}
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.84rem', color: isDark ? '#F8FAFC' : '#1E293B' }}>
                              {order.customerName || 'Khách Vãng Lai'}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: isDark ? '#94A3B8' : '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Phone size={11} />
                              <span>{order.customerPhone || 'Chưa có SĐT'}</span>
                            </div>
                          </div>

                          {/* Product Summary */}
                          {firstItem && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                              padding: '6px',
                              borderRadius: '6px',
                              border: isDark ? '1px solid #334155' : 'none'
                            }}>
                              <img
                                src={firstItem.productImage || 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=100&q=80'}
                                alt=""
                                style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' }}
                              />
                              <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: isDark ? '#E2E8F0' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {firstItem.name}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                                  {itemsCount > 1 ? `+ ${itemsCount - 1} sản phẩm khác` : `Số lượng: ${firstItem.quantity || firstItem.qty || 1}`}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Financial Total & Next Action */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingTop: '6px',
                            borderTop: isDark ? '1px dashed #334155' : '1px dashed #E2E8F0'
                          }}>
                            <div>
                              <div style={{ fontSize: '0.68rem', color: isDark ? '#94A3B8' : '#64748B' }}>Tổng tiền:</div>
                              <div style={{ fontWeight: 800, fontSize: '0.85rem', color: isDark ? '#38BDF8' : '#0F172A' }}>
                                {totalVnd.toLocaleString('vi-VN')} đ
                              </div>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDrawerOrder(order);
                              }}
                              style={{
                                backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                                border: isDark ? '1px solid #334155' : 'none',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                color: isDark ? '#E2E8F0' : '#334155',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px'
                              }}
                            >
                              <span>Chi tiết</span>
                              <ChevronRight size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 📊 Giao diện Danh Sách Bảng (Table View Mode) */}
      {viewMode === 'table' && (
        <div style={{
          backgroundColor: isDark ? '#1E293B' : '#FFF',
          borderRadius: '12px',
          border: isDark ? '1px solid #334155' : '1px solid var(--border-color)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderBottom: isDark ? '1px solid #334155' : '1px solid #E2E8F0', textAlign: 'left', color: isDark ? '#94A3B8' : '#64748B' }}>
                <th style={{ padding: '12px 16px' }}>Mã Đơn</th>
                <th style={{ padding: '12px 16px' }}>Khách Hàng</th>
                <th style={{ padding: '12px 16px' }}>Sản Phẩm</th>
                <th style={{ padding: '12px 16px' }}>Tổng Tiền (VNĐ)</th>
                <th style={{ padding: '12px 16px' }}>Trạng Thái</th>
                <th style={{ padding: '12px 16px' }}>Hành Động</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: isDark ? '#64748B' : '#94A3B8' }}>
                    Không tìm thấy đơn hàng nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => {
                  const totalVnd = getOrderTotalVnd(order, krwRate, serviceFee);
                  const statusCfg = getStatusConfig(order.status);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => setActiveDrawerOrder(order)}
                      style={{ borderBottom: isDark ? '1px solid #334155' : '1px solid #F1F5F9', cursor: 'pointer' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? '#162032' : '#F8FAFC'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#38BDF8' }}>
                        #{order.id.replace(/^ORD-?/i, '')}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: isDark ? '#F8FAFC' : '#1E293B' }}>{order.customerName || 'Khách'}</div>
                        <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B' }}>{order.customerPhone}</div>
                      </td>
                      <td style={{ padding: '12px 16px', color: isDark ? '#CBD5E1' : '#334155' }}>
                        {order.items?.[0]?.name || 'Sản phẩm mua hộ'} ({order.items?.length || 1} món)
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 800, color: isDark ? '#38BDF8' : '#0F172A' }}>
                        {totalVnd.toLocaleString('vi-VN')} đ
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          backgroundColor: isDark ? '#0F172A' : (statusCfg?.bgColor || '#F1F5F9'),
                          color: statusCfg?.color || '#334155',
                          border: isDark ? '1px solid #334155' : 'none',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 700
                        }}>
                          {statusCfg?.label || order.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDrawerOrder(order);
                          }}
                          style={{
                            backgroundColor: '#2563EB',
                            color: '#FFF',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Xử lý
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 🚪 Slide-over Drawer Chi Tiết Đơn Hàng (Bên Phải) */}
      {activeDrawerOrder && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setActiveDrawerOrder(null);
              setIsAddingItem(false);
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 99999,
            display: 'flex',
            justifyContent: 'flex-end'
          }}
        >
          <div style={{
            width: 'min(500px, 100vw)',
            height: '100vh',
            backgroundColor: isDark ? '#1E293B' : '#FFF',
            boxShadow: '-10px 0 30px rgba(0,0,0,0.3)',
            borderLeft: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }} onClick={(e) => e.stopPropagation()}>
            {/* Drawer Header */}
            <div style={{ padding: '18px 20px', borderBottom: isDark ? '1px solid #334155' : '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                  Chi Tiết Đơn Hàng
                </h3>
                <span style={{ fontSize: '0.74rem', color: '#94A3B8', fontWeight: 600 }}>
                  SĐT: {activeDrawerOrder.customerPhone}
                </span>
              </div>
              <button
                onClick={() => { setActiveDrawerOrder(null); setIsAddingItem(false); }}
                style={{ background: 'none', border: 'none', color: isDark ? '#94A3B8' : '#0F172A', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Body Content */}
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* 1. Trạng Thái Hiện Tại & Đổi Nhanh */}
              <div style={{ backgroundColor: isDark ? '#0F172A' : '#F8FAFC', padding: '14px', borderRadius: '10px', border: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B', marginBottom: '8px' }}>
                  TIẾN ĐỘ XỬ LÝ ĐƠN HÀNG (9 BƯỚC)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {Object.values(ORDER_STATUSES).filter(st => ['pending', 'deposit_paid', 'confirmed', 'purchased', 'packed_kr', 'in_transit_air', 'customs_cleared', 'completed', 'cancelled'].includes(st.id)).map((st) => {
                    const isCurrent = activeDrawerOrder.status === st.id;
                    return (
                      <button
                        key={st.id}
                        onClick={() => handleQuickStatusChange(activeDrawerOrder.id, st.id)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: isCurrent ? '2px solid #38BDF8' : (isDark ? '1px solid #334155' : '1px solid #CBD5E1'),
                          backgroundColor: isCurrent ? (isDark ? '#1E3A8A' : '#EFF6FF') : (isDark ? '#1E293B' : '#FFF'),
                          color: isCurrent ? '#FFF' : (isDark ? '#E2E8F0' : '#334155'),
                          fontWeight: isCurrent ? 800 : 500,
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        {st.shortLabel || st.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: '12px', borderTop: isDark ? '1px solid #334155' : '1px solid #E2E8F0', paddingTop: '12px', display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => handleDeleteOrder(activeDrawerOrder.id)}
                    style={{
                      backgroundColor: '#FEF2F2',
                      color: '#DC2626',
                      border: '1px solid #FECACA',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      width: '100%',
                      justifyContent: 'center'
                    }}
                  >
                    <Trash2 size={16} />
                    <span>Xoá Đơn Hàng</span>
                  </button>
                </div>
              </div>

              {/* 2. Thông Tin Khách Hàng */}
              <div style={{ backgroundColor: isDark ? '#0F172A' : '#FFF', border: isDark ? '1px solid #334155' : '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: '8px' }}>
                  👤 THÔNG TIN NGƯỜI NHẬN
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', color: isDark ? '#E2E8F0' : '#1E293B' }}>
                  <div><strong>Họ tên:</strong> {activeDrawerOrder.customerName || 'Khách vãng lai'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong>Điện thoại:</strong>
                    <a href={`tel:${activeDrawerOrder.customerPhone}`} style={{ color: '#38BDF8', textDecoration: 'none' }}>
                      {activeDrawerOrder.customerPhone}
                    </a>
                  </div>
                  <div><strong>Địa chỉ:</strong> {activeDrawerOrder.customerAddress || 'Chưa cập nhật'}</div>
                  {activeDrawerOrder.customerNote && (
                    <div style={{ color: '#FBBF24', fontStyle: 'italic' }}>
                      <strong>Ghi chú của khách:</strong> "{activeDrawerOrder.customerNote}"
                    </div>
                  )}
                </div>
              </div>

              {/* 2.5 Biên Lai Chuyển Tiền / Bill Quét Mã (Nếu Khách Đã Tải Lên) */}
              {activeDrawerOrder.depositProofImage && (
                <div style={{ backgroundColor: isDark ? '#1E293B' : '#ECFDF5', border: isDark ? '1px solid #10B981' : '1px solid #A7F3D0', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: isDark ? '#10B981' : '#047857', marginBottom: '8px' }}>
                    🧾 MINH CHỨNG THANH TOÁN (ẢNH GIAO DỊCH)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <a href={activeDrawerOrder.depositProofImage} target="_blank" rel="noreferrer" title="Click để phóng to ảnh giao dịch">
                      <img
                        src={activeDrawerOrder.depositProofImage}
                        alt="Biên lai cọc"
                        style={{ maxHeight: '180px', maxWidth: '100%', borderRadius: '8px', border: '1px solid #D1D5DB', objectFit: 'contain', cursor: 'zoom-in' }}
                      />
                    </a>
                  </div>
                  {activeDrawerOrder.status !== 'deposit_paid' && activeDrawerOrder.paymentStatus !== 'paid' && (
                    <button
                      onClick={() => handleQuickStatusChange(activeDrawerOrder.id, 'deposit_paid')}
                      style={{
                        width: '100%',
                        backgroundColor: '#10B981',
                        color: '#FFF',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      ✓ Duyệt Xác Nhận Đã Nhận Cọc 100%
                    </button>
                  )}
                </div>
              )}

              {/* 2.8 Bằng Chứng Mua Hàng & Video POV (Google Drive) */}
              <div style={{
                backgroundColor: isDark ? '#0F172A' : '#FAF5FF',
                border: isDark ? '1px solid #7C3AED' : '1px solid #C084FC',
                borderRadius: '10px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: isDark ? '#C084FC' : '#6B21A8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Video size={16} />
                    <span>📹 VIDEO POV & BẰNG CHỨNG MUA HÀNG</span>
                  </div>
                  <span style={{ fontSize: '0.68rem', backgroundColor: '#10B981', color: '#FFF', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                    GOOGLE DRIVE
                  </span>
                </div>

                <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#6B7280', lineHeight: 1.4 }}>
                  Dán link Google Drive video mua hàng tại quầy Store. Hệ thống tự động chuyển sang link nhúng phát trực tiếp cho khách xem.
                </div>

                {/* Input: Video POV Mua hàng */}
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#E2E8F0' : '#374151', display: 'block', marginBottom: '4px' }}>
                    Link Video POV Mua Hàng (Google Drive / YouTube)
                  </label>
                  <input
                    type="text"
                    placeholder="https://drive.google.com/file/d/.../view"
                    value={proofForm.povVideoUrl}
                    onChange={(e) => setProofForm(prev => ({ ...prev, povVideoUrl: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                      backgroundColor: isDark ? '#1E293B' : '#FFF',
                      color: isDark ? '#F8FAFC' : '#0F172A',
                      fontSize: '0.75rem',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Preview Video POV nếu có */}
                {proofForm.povVideoUrl.trim() && (
                  <div style={{ borderRadius: '8px', overflow: 'hidden', border: isDark ? '1px solid #334155' : '1px solid #E2E8F0', backgroundColor: '#000' }}>
                    <div style={{ padding: '6px 10px', backgroundColor: 'rgba(255,255,255,0.1)', fontSize: '0.68rem', color: '#38BDF8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Xem thử video POV:</span>
                      <a href={proofForm.povVideoUrl.trim()} target="_blank" rel="noopener noreferrer" style={{ color: '#38BDF8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <ExternalLink size={10} /> Mở Drive
                      </a>
                    </div>
                    <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%' }}>
                      <iframe
                        src={getEmbedVideoUrl(proofForm.povVideoUrl.trim())}
                        title="Xem thử video POV"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                      />
                    </div>
                  </div>
                )}

                {/* Input: Video Đóng Kiện */}
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#E2E8F0' : '#374151', display: 'block', marginBottom: '4px' }}>
                    Link Video Đóng Kiện & Cân Nặng (Google Drive / YouTube)
                  </label>
                  <input
                    type="text"
                    placeholder="https://drive.google.com/file/d/.../view"
                    value={proofForm.packingVideoUrl}
                    onChange={(e) => setProofForm(prev => ({ ...prev, packingVideoUrl: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                      backgroundColor: isDark ? '#1E293B' : '#FFF',
                      color: isDark ? '#F8FAFC' : '#0F172A',
                      fontSize: '0.75rem',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Input: Link Bill / Hóa đơn quầy */}
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: isDark ? '#E2E8F0' : '#374151', display: 'block', marginBottom: '4px' }}>
                    Link Hóa Đơn / Bill Mua Hàng Store (Ảnh Online)
                  </label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={proofForm.receiptImageUrl}
                    onChange={(e) => setProofForm(prev => ({ ...prev, receiptImageUrl: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                      backgroundColor: isDark ? '#1E293B' : '#FFF',
                      color: isDark ? '#F8FAFC' : '#0F172A',
                      fontSize: '0.75rem',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ fontSize: '0.68rem', color: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '6px 8px', borderRadius: '6px' }}>
                  ⚠️ <em>Lưu ý: Đảm bảo file trên Google Drive đã bật chế độ "Bất kỳ ai có đường liên kết đều có thể xem" để khách hàng mở được video.</em>
                </div>

                <button
                  type="button"
                  disabled={isSavingProof}
                  onClick={handleSaveProofMedia}
                  style={{
                    backgroundColor: '#7C3AED',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: isSavingProof ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Check size={14} />
                  <span>{isSavingProof ? 'Đang lưu...' : 'Lưu Bằng Chứng Video & Bill'}</span>
                </button>
              </div>

              {/* 3. Danh Sách Sản Phẩm Mua Hộ */}
              <div style={{ backgroundColor: isDark ? '#0F172A' : '#FFF', border: isDark ? '1px solid #334155' : '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: '8px' }}>
                  📦 SẢN PHẨM MUA HỘ ({activeDrawerOrder.items?.length || 1} MÓN)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(activeDrawerOrder.items || []).map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', borderBottom: isDark ? '1px solid #334155' : '1px solid #F1F5F9', paddingBottom: '8px' }}>
                      <img
                        src={item.productImage || 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=120&q=80'}
                        alt=""
                        style={{ width: '45px', height: '45px', borderRadius: '6px', objectFit: 'cover' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: isDark ? '#F8FAFC' : '#1E293B' }}>{item.name}</div>
                        <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                          Giá: {item.foreignPrice?.toLocaleString('vi-VN') || 0} ₩ x {item.quantity || item.qty || 1}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteItemFromOrder(idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '4px' }}
                        title="Xoá sản phẩm"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  
                  {/* Hiển thị Tổng Tiền */}
                  {activeDrawerOrder.totalAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '12px', borderTop: isDark ? '1px dashed #334155' : '1px dashed #E2E8F0' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#94A3B8' : '#64748B' }}>Tổng cộng:</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 900, color: '#38BDF8' }}>
                        {activeDrawerOrder.totalAmount.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                  )}
                </div>
                
                {/* ➕ Nút Thêm / Form Thêm Sản Phẩm Mới */}
                {!isAddingItem ? (
                  <button
                    onClick={() => setIsAddingItem(true)}
                    style={{
                      width: '100%',
                      marginTop: '12px',
                      padding: '8px',
                      borderRadius: '8px',
                      border: isDark ? '1px dashed #475569' : '1px dashed #CBD5E1',
                      backgroundColor: 'transparent',
                      color: isDark ? '#94A3B8' : '#64748B',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Plus size={14} /> Thêm Sản Phẩm
                  </button>
                ) : (
                  <div style={{
                    marginTop: '12px',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                    border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <div style={{ position: 'relative', width: '50px', height: '50px', borderRadius: '8px', overflow: 'hidden', backgroundColor: isDark ? '#0F172A' : '#F1F5F9', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {newItemForm.productImage ? (
                          <img src={newItemForm.productImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ fontSize: '0.6rem', color: '#94A3B8', textAlign: 'center' }}>Up ảnh</div>
                        )}
                        <input
                          type="file" accept="image/*"
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (evt) => setNewItemForm({ ...newItemForm, productImage: evt.target.result });
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <input
                          type="text" placeholder="Tên sản phẩm *"
                          value={newItemForm.name}
                          onChange={(e) => setNewItemForm({ ...newItemForm, name: e.target.value })}
                          style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: isDark ? '1px solid #475569' : '1px solid #CBD5E1', backgroundColor: isDark ? '#0F172A' : '#FFF', color: isDark ? '#F8FAFC' : '#0F172A', fontSize: '0.75rem', outline: 'none' }}
                        />
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="text" placeholder="Giá (₩) *"
                            value={newItemForm.foreignPrice}
                            onChange={(e) => setNewItemForm({ ...newItemForm, foreignPrice: e.target.value.replace(/[^0-9]/g, '') })}
                            style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: isDark ? '1px solid #475569' : '1px solid #CBD5E1', backgroundColor: isDark ? '#0F172A' : '#FFF', color: isDark ? '#F8FAFC' : '#0F172A', fontSize: '0.75rem', outline: 'none' }}
                          />
                          <input
                            type="text" placeholder="SL"
                            value={newItemForm.qty}
                            onChange={(e) => setNewItemForm({ ...newItemForm, qty: e.target.value.replace(/[^0-9]/g, '') })}
                            style={{ width: '50px', padding: '6px 10px', borderRadius: '6px', border: isDark ? '1px solid #475569' : '1px solid #CBD5E1', backgroundColor: isDark ? '#0F172A' : '#FFF', color: isDark ? '#F8FAFC' : '#0F172A', fontSize: '0.75rem', outline: 'none', textAlign: 'center' }}
                          />
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                      <button
                        onClick={() => setIsAddingItem(false)}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: 'transparent', color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Hủy
                      </button>
                      <button
                        onClick={handleSaveNewItemToOrder}
                        style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#38BDF8', color: '#FFF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Lưu Sản Phẩm
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 📝 Modal Tạo Đơn Hàng Mới Thủ Công */}
      {isCreateModalOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              if (!isCreateFormDirty) {
                setIsCreateModalOpen(false);
              }
            }
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div style={{
            backgroundColor: isDark ? '#1E293B' : '#FFF',
            color: isDark ? '#F8FAFC' : '#0F172A',
            border: isDark ? '1px solid #334155' : 'none',
            borderRadius: '16px',
            maxWidth: '850px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>+ Tạo Đơn Hàng Mua Hộ Mới</h3>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'none', border: 'none', color: isDark ? '#94A3B8' : '#0F172A', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveManualOrder} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#CBD5E1' : '#475569' }}>
                    Tên Khách Hàng <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text" required placeholder="Nguyễn Văn A"
                    value={manualForm.customerName}
                    onChange={(e) => setManualForm({ ...manualForm, customerName: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: isDark ? '1px solid #334155' : '1px solid #CBD5E1', backgroundColor: isDark ? '#0F172A' : '#FFF', color: isDark ? '#F8FAFC' : '#0F172A', marginTop: '4px', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#CBD5E1' : '#475569' }}>
                    Số Điện Thoại <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text" required placeholder="0912345678"
                    value={manualForm.customerPhone}
                    onChange={(e) => setManualForm({ ...manualForm, customerPhone: e.target.value.replace(/[^0-9]/g, '') })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: isDark ? '1px solid #334155' : '1px solid #CBD5E1', backgroundColor: isDark ? '#0F172A' : '#FFF', color: isDark ? '#F8FAFC' : '#0F172A', marginTop: '4px', outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#CBD5E1' : '#475569' }}>
                  Địa Chỉ Giao Hàng <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text" required placeholder="Nhập địa chỉ giao hàng đầy đủ..."
                  value={manualForm.customerAddress}
                  onChange={(e) => setManualForm({ ...manualForm, customerAddress: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: isDark ? '1px solid #334155' : '1px solid #CBD5E1', backgroundColor: isDark ? '#0F172A' : '#FFF', color: isDark ? '#F8FAFC' : '#0F172A', marginTop: '4px', outline: 'none' }}
                />
              </div>
              
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: isDark ? '#CBD5E1' : '#475569' }}>Ghi Chú Của Khách (Tùy chọn)</label>
                <input
                  type="text" placeholder="Ví dụ: Giao giờ hành chính..."
                  value={manualForm.customerNote}
                  onChange={(e) => setManualForm({ ...manualForm, customerNote: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: isDark ? '1px solid #334155' : '1px solid #CBD5E1', backgroundColor: isDark ? '#0F172A' : '#FFF', color: isDark ? '#F8FAFC' : '#0F172A', marginTop: '4px', outline: 'none' }}
                />
              </div>

              <div style={{ marginTop: '8px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: isDark ? '#F8FAFC' : '#0F172A' }}>Danh Sách Sản Phẩm Mua Hộ</strong>
                <button
                  type="button"
                  onClick={() => setManualForm({ ...manualForm, items: [...manualForm.items, { name: '', foreignPrice: '', qty: 1, image: '' }] })}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px dashed #38BDF8', backgroundColor: 'transparent', color: '#38BDF8', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  + Thêm sản phẩm
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                {manualForm.items.map((item, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px',
                    borderRadius: '8px',
                    border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                    backgroundColor: isDark ? '#1E293B' : '#F8FAFC'
                  }}>
                    {/* 1. Ảnh vuông nhỏ */}
                    <div
                      style={{
                        position: 'relative',
                        width: '45px', height: '45px', flexShrink: 0,
                        borderRadius: '6px', border: '1px dashed #CBD5E1',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', overflow: 'hidden', backgroundColor: isDark ? '#0F172A' : '#FFF'
                      }}
                    >
                      {item.image ? (
                        <img 
                          src={item.image} 
                          alt="preview" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      ) : (
                        <span style={{ fontSize: '9px', color: '#94A3B8', textAlign: 'center' }}>+ Ảnh</span>
                      )}
                      {/* Hidden file input for upload */}
                      <input 
                        type="file" 
                        accept="image/*" 
                        title="Nhấn để tải ảnh lên"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const newItems = [...manualForm.items];
                              newItems[index].image = reader.result;
                              setManualForm({ ...manualForm, items: newItems });
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                      />
                    </div>

                    {/* 2. Tên Sản Phẩm */}
                    <input
                      type="text" required placeholder="Tên sản phẩm *"
                      value={item.name}
                      onChange={(e) => {
                        const newItems = [...manualForm.items];
                        newItems[index].name = e.target.value;
                        setManualForm({ ...manualForm, items: newItems });
                      }}
                      style={{ flex: 3, minWidth: '100px', padding: '8px', borderRadius: '6px', border: isDark ? '1px solid #334155' : '1px solid #CBD5E1', backgroundColor: isDark ? '#0F172A' : '#FFF', color: isDark ? '#F8FAFC' : '#0F172A', outline: 'none', fontSize: '0.8rem' }}
                    />

                    {/* 3. Giá Won */}
                    <div style={{ flex: 1.5, position: 'relative' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Giá(₩)"
                        value={item.foreignPrice}
                        onChange={(e) => {
                          const sanitized = e.target.value.replace(/[^0-9]/g, '');
                          const newItems = [...manualForm.items];
                          newItems[index].foreignPrice = sanitized;
                          setManualForm({ ...manualForm, items: newItems });
                        }}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: isDark ? '1px solid #334155' : '1px solid #CBD5E1', backgroundColor: isDark ? '#0F172A' : '#FFF', color: isDark ? '#F8FAFC' : '#0F172A', outline: 'none', fontSize: '0.8rem' }}
                      />
                    </div>

                    {/* 4. Số lượng */}
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="SL"
                      value={item.qty}
                      onChange={(e) => {
                        const sanitized = e.target.value.replace(/[^0-9]/g, '');
                        const newItems = [...manualForm.items];
                        newItems[index].qty = sanitized;
                        setManualForm({ ...manualForm, items: newItems });
                      }}
                      style={{ flex: 0.8, width: '50px', padding: '8px', borderRadius: '6px', border: isDark ? '1px solid #334155' : '1px solid #CBD5E1', backgroundColor: isDark ? '#0F172A' : '#FFF', color: isDark ? '#F8FAFC' : '#0F172A', outline: 'none', fontSize: '0.8rem', textAlign: 'center' }}
                    />

                    {/* 5. Tổng bill */}
                    <div style={{ flex: 1.2, fontSize: '0.8rem', fontWeight: 700, color: '#38BDF8', textAlign: 'right', whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span>{((Number(item.foreignPrice) || 0) * (Number(item.qty) || 1)).toLocaleString()} ₩</span>
                      <span style={{ fontSize: '0.7rem', color: '#10B981' }}>{formatVnd(getVndFromWon(Number(item.foreignPrice) || 0, { KRW: { rate: krwRate }, serviceFeePercent: serviceFee }) * (Number(item.qty) || 1))}</span>
                    </div>

                    {/* 6. Nút Xóa */}
                    <button
                      type="button"
                      title="Xóa"
                      onClick={() => {
                        const newItems = [...manualForm.items];
                        newItems.splice(index, 1);
                        setManualForm({ ...manualForm, items: newItems });
                      }}
                      disabled={manualForm.items.length === 1}
                      style={{
                        background: 'none', border: 'none',
                        color: manualForm.items.length === 1 ? (isDark ? '#334155' : '#CBD5E1') : '#EF4444',
                        cursor: manualForm.items.length === 1 ? 'not-allowed' : 'pointer', padding: '4px'
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                    backgroundColor: isDark ? '#0F172A' : '#FFF', color: isDark ? '#E2E8F0' : '#334155', cursor: 'pointer'
                  }}
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#2563EB', color: '#FFF', fontWeight: 700, cursor: 'pointer' }}
                >
                  Tạo Đơn Ngay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal xác nhận xoá */}
      {orderToDelete && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setOrderToDelete(null);
            }
          }}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1100,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div style={{
            backgroundColor: isDark ? '#1E293B' : '#FFF',
            padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '400px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            textAlign: 'center'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ color: '#EF4444', marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
              <AlertCircle size={48} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: '8px' }}>
              Xác nhận xoá đơn hàng
            </h3>
            <p style={{ fontSize: '0.9rem', color: isDark ? '#94A3B8' : '#64748B', marginBottom: '24px' }}>
              Bạn có chắc chắn muốn xoá vĩnh viễn đơn hàng <strong>#{orderToDelete.replace(/^ORD-?/i, '')}</strong>?<br/>
              Hành động này không thể hoàn tác!
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setOrderToDelete(null)}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                  backgroundColor: isDark ? '#0F172A' : '#FFF', color: isDark ? '#E2E8F0' : '#334155',
                  fontWeight: 600, cursor: 'pointer', flex: 1
                }}
              >
                Hủy
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: 'none',
                  backgroundColor: '#EF4444', color: '#FFF', fontWeight: 700, cursor: 'pointer', flex: 1
                }}
              >
                Xóa Vĩnh Viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
