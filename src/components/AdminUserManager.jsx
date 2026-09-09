import React, { useState, useContext, useMemo, useEffect, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { useToast } from './Toast';
import {
  aggregateCustomers,
  filterCustomers,
  formatPhone,
  normalizePhone
} from '../utils/customerAggregator';
import { getOrderTotalVnd } from '../utils/priceCalculator';
import {
  Users,
  Search,
  Edit3,
  Trash2,
  X,
  UserCheck,
  ShoppingBag,
  CreditCard,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Package,
  Clock,
  ArrowUpDown,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Filter,
  RefreshCw,
  Eye,
  LayoutGrid,
  Table
} from 'lucide-react';

export default function AdminUserManager({ isDark: isDarkProp } = {}) {
  const isDark = isDarkProp !== undefined
    ? isDarkProp
    : (typeof window !== 'undefined' && localStorage.getItem('tavy_admin_theme') === 'dark');

  const {
    usersList,
    orders,
    rates,
    updateCustomer,
    deleteCustomerAndOrders
  } = useContext(AppContext);

  const showToast = useToast();

  // Search & Filter & Sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'registered' | 'guests' | 'with_orders' | 'no_orders'
  const [sortField, setSortField] = useState('totalSpent'); // 'totalSpent' | 'orderCount' | 'name' | 'createdAt'
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' | 'asc'
  // View mode: 'cards' on phones (< 768px) for thumb-friendly cards, 'table' for spreadsheet table
  const [viewMode, setViewMode] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768) ? 'cards' : 'table');

  // Modals state
  const [selectedCustomerForOrders, setSelectedCustomerForOrders] = useState(null);
  const [customerToEdit, setCustomerToEdit] = useState(null);
  const [customerToDelete, setCustomerToDelete] = useState(null);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  });
  const [editErrors, setEditErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 1. Comprehensive Customer Aggregation (Rule 0 & R2 Compliance)
  const aggregatedCustomers = useMemo(() => {
    return aggregateCustomers(usersList, orders, rates);
  }, [usersList, orders, rates]);

  // 2. Filter & Search
  const filteredCustomers = useMemo(() => {
    const list = filterCustomers(aggregatedCustomers, searchTerm, filterType);

    // Apply sorting
    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'name') {
        const cmp = String(valA || '').localeCompare(String(valB || ''), 'vi');
        if (cmp !== 0) return sortOrder === 'asc' ? cmp : -cmp;
      } else if (sortField === 'createdAt') {
        const timeA = new Date(valA || 0).getTime();
        const timeB = new Date(valB || 0).getTime();
        if (timeA !== timeB) return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      } else {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
        if (valA !== valB) return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      // Stable secondary tie-breaker: order count then createdAt
      const tieCount = (b.orderCount || 0) - (a.orderCount || 0);
      if (tieCount !== 0) return tieCount;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    return list;
  }, [aggregatedCustomers, searchTerm, filterType, sortField, sortOrder]);

  // Statistics KPI
  const stats = useMemo(() => {
    const total = aggregatedCustomers.length;
    const registered = aggregatedCustomers.filter(c => c.isRegistered).length;
    const buyers = aggregatedCustomers.filter(c => c.orderCount > 0).length;
    const totalGMV = aggregatedCustomers.reduce((sum, c) => sum + c.totalSpent, 0);

    return { total, registered, buyers, totalGMV };
  }, [aggregatedCustomers]);

  // Handle Sort Change
  const handleSortToggle = (field) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
  };

  // Keyboard Escape listener (LIFO order: top-most modal closes first)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (customerToDelete) {
          setCustomerToDelete(null);
        } else if (customerToEdit) {
          setCustomerToEdit(null);
        } else if (selectedCustomerForOrders) {
          setSelectedCustomerForOrders(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [customerToDelete, customerToEdit, selectedCustomerForOrders]);

  // Lock background body scroll when any modal is open
  useEffect(() => {
    const isAnyModalOpen = Boolean(customerToDelete || customerToEdit || selectedCustomerForOrders);
    if (isAnyModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [customerToDelete, customerToEdit, selectedCustomerForOrders]);

  // Open Edit Modal
  const handleOpenEdit = (customer) => {
    setCustomerToEdit(customer);
    setEditForm({
      name: customer.name || '',
      email: customer.email || '',
      phone: normalizePhone(customer.phone) || customer.phone || '',
      address: customer.address || ''
    });
    setEditErrors({});
  };

  // Validate Email
  const validateEmail = (email) => {
    if (!email) return true; // Optional if not provided
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
  };

  // Validate VN Phone
  const validatePhone = (phone) => {
    if (!phone) return true; // Optional if not provided
    const clean = normalizePhone(phone);
    const vnPhoneRegex = /^0(3|5|7|8|9)[0-9]{8}$/;
    return vnPhoneRegex.test(clean);
  };

  // Save Edit Customer
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!editForm.name.trim()) {
      errors.name = 'Vui lòng nhập tên khách hàng';
    }
    const cleanEmailLower = editForm.email ? editForm.email.trim().toLowerCase() : '';
    if (editForm.email && !validateEmail(editForm.email)) {
      errors.email = 'Địa chỉ email không hợp lệ (ví dụ: khachhang@gmail.com)';
    } else if (cleanEmailLower === 'guest@tavy.vn' || cleanEmailLower === 'admin_manual@tavykorea.vn') {
      errors.email = 'Vui lòng nhập email riêng của khách (không dùng email hệ thống)';
    }
    if (editForm.phone && !validatePhone(editForm.phone)) {
      errors.phone = 'Số điện thoại không hợp lệ (10 số, bắt đầu bằng 03, 05, 07, 08, 09)';
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setIsSaving(true);
    try {
      if (updateCustomer) {
        const cleanPhone = editForm.phone ? normalizePhone(editForm.phone) : '';
        const cleanEmail = editForm.email ? editForm.email.trim() : '';

        const res = await updateCustomer(customerToEdit.id, {
          name: editForm.name.trim(),
          email: cleanEmail,
          phone: cleanPhone,
          address: editForm.address.trim(),
          uid: customerToEdit.uid,
          previousPhone: customerToEdit.phone,
          previousEmail: customerToEdit.email,
          orderIds: customerToEdit.orders?.map(o => o.id) || []
        });
        if (res.success) {
          if (showToast) showToast('Cập nhật thông tin khách hàng và đơn hàng thành công!', 'success');
          setCustomerToEdit(null);
        } else {
          if (showToast) showToast('Không thể lưu thông tin. Vui lòng thử lại!', 'error');
        }
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Lỗi khi lưu dữ liệu khách hàng!', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm Delete Customer & Orders
  const handleConfirmDelete = async () => {
    if (!customerToDelete) return;
    setIsDeleting(true);
    try {
      if (deleteCustomerAndOrders) {
        const res = await deleteCustomerAndOrders(customerToDelete);
        if (res.success) {
          if (showToast) {
            const count = res.deletedOrderCount !== undefined ? res.deletedOrderCount : (customerToDelete.orders?.length || 0);
            showToast(`Đã xoá khách hàng và ${count} đơn hàng liên quan thành công!`, 'success');
          }
          setCustomerToDelete(null);
        } else {
          if (showToast) showToast('Không thể xoá khách hàng. Vui lòng thử lại!', 'error');
        }
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Lỗi khi xoá khách hàng!', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper for customer initials
  const getInitials = (name) => {
    if (!name) return 'KH';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Helper for Order Status Label & Color
  const getOrderStatusBadge = (status) => {
    const map = {
      pending: { label: 'Chờ Báo Giá', bg: '#FEE2E2', color: '#DC2626' },
      quoted: { label: 'Đã Báo Giá', bg: '#EFF6FF', color: '#2563EB' },
      deposit_paid: { label: 'Đã Cọc 100%', bg: '#ECFDF5', color: '#047857' },
      paid: { label: 'Đã Thanh Toán', bg: '#ECFDF5', color: '#047857' },
      purchasing_korea: { label: 'Đang Mua Tại Hàn', bg: '#F5F3FF', color: '#7C3AED' },
      korea_warehouse: { label: 'Kho Hàn Quốc', bg: '#EEF2FF', color: '#4F46E5' },
      shipping_vn: { label: 'Bay Về VN', bg: '#E0F2FE', color: '#0284C7' },
      vn_warehouse: { label: 'Kho Việt Nam', bg: '#F0FDFA', color: '#0D9488' },
      delivering: { label: 'Đang Giao Hàng', bg: '#FFFBEB', color: '#D97706' },
      delivered: { label: 'Đã Giao Hàng', bg: '#ECFDF5', color: '#059669' },
      completed: { label: 'Hoàn Tất', bg: '#ECFDF5', color: '#059669' },
      cancelled: { label: 'Đã Huỷ', bg: '#F3F4F6', color: '#6B7280' }
    };
    return map[status] || { label: status || 'Đang xử lý', bg: '#F3F4F6', color: '#4B5563' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Header & Title */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{
              fontSize: '1.5rem',
              fontWeight: 900,
              margin: 0,
              color: isDark ? '#F8FAFC' : '#0F172A',
              letterSpacing: '-0.02em'
            }}>
              👥 Quản Lý Khách Hàng (Users)
            </h1>
            <span style={{
              backgroundColor: '#8B5CF6',
              color: '#FFF',
              fontSize: '0.75rem',
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: '999px'
            }}>
              {stats.total} khách
            </span>
          </div>
          <p style={{
            margin: '4px 0 0 0',
            color: isDark ? '#94A3B8' : '#64748B',
            fontSize: '0.85rem'
          }}>
            Tổng hợp dữ liệu đồng bộ thời gian thực từ Cloud Firestore collection <code>users</code> và lịch sử đơn hàng <code>orders</code>.
          </p>
        </div>
      </div>

      {/* 2. KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '14px'
      }}>
        {/* Card 1 */}
        <div style={{
          backgroundColor: isDark ? '#1E293B' : '#FFF',
          borderRadius: '12px',
          padding: '16px',
          border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: isDark ? '#94A3B8' : '#64748B'
          }}>
            <span>TỔNG KHÁCH HÀNG</span>
            <Users size={16} color="#8B5CF6" />
          </div>
          <div style={{
            fontSize: '1.4rem',
            fontWeight: 900,
            color: isDark ? '#F8FAFC' : '#0F172A',
            marginTop: '6px'
          }}>
            {stats.total}
          </div>
          <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '4px' }}>
            Toàn bộ khách trên hệ thống
          </div>
        </div>

        {/* Card 2 */}
        <div style={{
          backgroundColor: isDark ? '#1E293B' : '#FFF',
          borderRadius: '12px',
          padding: '16px',
          border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: isDark ? '#94A3B8' : '#64748B'
          }}>
            <span>THÀNH VIÊN ĐĂNG KÝ</span>
            <ShieldCheck size={16} color="#10B981" />
          </div>
          <div style={{
            fontSize: '1.4rem',
            fontWeight: 900,
            color: '#10B981',
            marginTop: '6px'
          }}>
            {stats.registered}
          </div>
          <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '4px' }}>
            Đã liên kết Google / Email
          </div>
        </div>

        {/* Card 3 */}
        <div style={{
          backgroundColor: isDark ? '#1E293B' : '#FFF',
          borderRadius: '12px',
          padding: '16px',
          border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: isDark ? '#94A3B8' : '#64748B'
          }}>
            <span>KHÁCH ĐÃ ĐẶT ĐƠN</span>
            <ShoppingBag size={16} color="#3B82F6" />
          </div>
          <div style={{
            fontSize: '1.4rem',
            fontWeight: 900,
            color: '#3B82F6',
            marginTop: '6px'
          }}>
            {stats.buyers}
          </div>
          <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '4px' }}>
            Đã có ít nhất 1 đơn hàng
          </div>
        </div>

        {/* Card 4 */}
        <div style={{
          backgroundColor: isDark ? '#1E293B' : '#FFF',
          borderRadius: '12px',
          padding: '16px',
          border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: isDark ? '#94A3B8' : '#64748B'
          }}>
            <span>TỔNG CHI TIÊU TOÀN SÀN</span>
            <CreditCard size={16} color="#F59E0B" />
          </div>
          <div style={{
            fontSize: '1.4rem',
            fontWeight: 900,
            color: isDark ? '#F8FAFC' : '#0F172A',
            marginTop: '6px'
          }}>
            {stats.totalGMV.toLocaleString('vi-VN')} đ
          </div>
          <div style={{ fontSize: '0.72rem', color: '#10B981', marginTop: '4px', fontWeight: 600 }}>
            Tích lũy từ tất cả đơn hàng
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div style={{
        backgroundColor: isDark ? '#1E293B' : '#FFF',
        borderRadius: '12px',
        padding: '16px',
        border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Search Input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
          border: `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
          borderRadius: '8px',
          padding: '8px 12px',
          flex: '1 1 280px',
          minWidth: '240px'
        }}>
          <Search size={18} color={isDark ? '#94A3B8' : '#64748B'} />
          <input
            type="text"
            placeholder="Tìm theo Tên, SĐT, Email hoặc Địa chỉ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '0.86rem',
              color: isDark ? '#F8FAFC' : '#0F172A',
              width: '100%'
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: isDark ? '#94A3B8' : '#64748B',
                padding: 0
              }}
              title="Xóa tìm kiếm"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filter Badges & View Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'registered', label: 'Thành viên' },
              { id: 'with_orders', label: 'Có đơn hàng' },
              { id: 'no_orders', label: 'Chưa có đơn' }
            ].map(tab => {
              const isActive = filterType === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: isActive ? '1px solid #8B5CF6' : `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                    backgroundColor: isActive
                      ? (isDark ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)')
                      : (isDark ? '#0F172A' : '#F8FAFC'),
                    color: isActive ? '#8B5CF6' : (isDark ? '#94A3B8' : '#64748B'),
                    fontWeight: isActive ? 700 : 500,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* View Mode Switcher: Cards vs Table */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
            padding: '3px',
            borderRadius: '8px',
            border: isDark ? '1px solid #334155' : '1px solid #E2E8F0'
          }}>
            <button
              onClick={() => setViewMode('cards')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: viewMode === 'cards' ? (isDark ? '#334155' : '#FFF') : 'transparent',
                color: viewMode === 'cards' ? (isDark ? '#F8FAFC' : '#0F172A') : (isDark ? '#94A3B8' : '#64748B'),
                fontSize: '0.78rem',
                fontWeight: viewMode === 'cards' ? 800 : 600,
                cursor: 'pointer',
                boxShadow: viewMode === 'cards' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
              title="Chế độ xem Thẻ (Mobile Friendly)"
            >
              <LayoutGrid size={14} />
              <span>Dạng Thẻ</span>
            </button>

            <button
              onClick={() => setViewMode('table')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: viewMode === 'table' ? (isDark ? '#334155' : '#FFF') : 'transparent',
                color: viewMode === 'table' ? (isDark ? '#F8FAFC' : '#0F172A') : (isDark ? '#94A3B8' : '#64748B'),
                fontSize: '0.78rem',
                fontWeight: viewMode === 'table' ? 800 : 600,
                cursor: 'pointer',
                boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
              title="Chế độ xem Bảng Excel"
            >
              <Table size={14} />
              <span>Dạng Bảng</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Customer Data Table (Standard 7 Columns) */}
      {viewMode === 'table' && (
        <div style={{
          backgroundColor: isDark ? '#1E293B' : '#FFF',
          borderRadius: '12px',
          border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}>
          {/* Mobile Swipe Hint */}
          <div style={{
            padding: '8px 16px',
            fontSize: '0.75rem',
            color: isDark ? '#94A3B8' : '#64748B',
            backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
            borderBottom: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>👉 <em>Vuốt ngang bảng để xem đầy đủ 7 cột thông tin</em></span>
            <span>Tổng: <strong>{filteredCustomers.length}</strong> khách</span>
          </div>

          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }} className="overflow-x-auto">
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.85rem',
              textAlign: 'left',
              minWidth: '700px'
            }}>
            <thead>
              <tr style={{
                backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                borderBottom: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                color: isDark ? '#94A3B8' : '#64748B',
                fontSize: '0.75rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                <th style={{ padding: '14px 16px', width: '50px', textAlign: 'center' }}>STT</th>
                <th
                  onClick={() => handleSortToggle('name')}
                  style={{ padding: '14px 16px', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Khách Hàng</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th style={{ padding: '14px 16px' }}>Gmail / Email</th>
                <th style={{ padding: '14px 16px' }}>Số Điện Thoại</th>
                <th style={{ padding: '14px 16px' }}>Địa Chỉ Nhận Hàng</th>
                <th
                  onClick={() => handleSortToggle('totalSpent')}
                  style={{ padding: '14px 16px', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Đơn Hàng / Chi Tiêu</span>
                    <ArrowUpDown size={12} />
                  </div>
                </th>
                <th style={{ padding: '14px 16px', width: '130px', textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>

            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: isDark ? '#94A3B8' : '#64748B' }}>
                      <Users size={36} strokeWidth={1.5} color={isDark ? '#475569' : '#CBD5E1'} />
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Không tìm thấy khách hàng nào</div>
                      <div style={{ fontSize: '0.8rem' }}>Thử thay đổi từ khoá tìm kiếm hoặc chuyển bộ lọc.</div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer, index) => {
                  const initials = getInitials(customer.name);
                  const isRegistered = customer.isRegistered;
                  const formattedPhone = formatPhone(customer.phone);

                  return (
                    <tr
                      key={customer.id}
                      style={{
                        borderBottom: isDark ? '1px solid #334155' : '1px solid #F1F5F9',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isDark ? '#262F40' : '#FAF8F5'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {/* 1. STT */}
                      <td style={{
                        padding: '14px 16px',
                        textAlign: 'center',
                        color: isDark ? '#64748B' : '#94A3B8',
                        fontWeight: 700
                      }}>
                        {index + 1}
                      </td>

                      {/* 2. Khách Hàng (Avatar + Tên + Badge) */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {customer.photoURL ? (
                            <img
                              src={customer.photoURL}
                              alt={customer.name}
                              style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '2px solid #8B5CF6'
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '50%',
                              backgroundColor: isDark ? '#312E81' : '#F3E8FF',
                              color: isDark ? '#C4B5FD' : '#7E22CE',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '0.82rem',
                              border: `1px solid ${isDark ? '#4338CA' : '#E9D5FF'}`
                            }}>
                              {initials}
                            </div>
                          )}

                          <div>
                            <div style={{
                              fontWeight: 700,
                              color: isDark ? '#F8FAFC' : '#0F172A',
                              fontSize: '0.9rem'
                            }}>
                              {customer.name}
                            </div>
                            <div style={{ marginTop: '2px' }}>
                              {isRegistered ? (
                                <span style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
                                  color: '#10B981',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}>
                                  <ShieldCheck size={10} />
                                  Thành viên
                                </span>
                              ) : (
                                <span style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                  backgroundColor: isDark ? 'rgba(100, 116, 139, 0.2)' : '#F1F5F9',
                                  color: isDark ? '#94A3B8' : '#64748B',
                                  padding: '1px 6px',
                                  borderRadius: '4px'
                                }}>
                                  Khách vãng lai
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 3. Gmail / Email */}
                      <td style={{ padding: '14px 16px', color: isDark ? '#CBD5E1' : '#334155' }}>
                        {customer.normEmail ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Mail size={14} color="#8B5CF6" />
                            <span>{customer.email}</span>
                          </div>
                        ) : (
                          <span style={{ color: isDark ? '#64748B' : '#94A3B8', fontStyle: 'italic' }}>
                            Chưa có
                          </span>
                        )}
                      </td>

                      {/* 4. Số Điện Thoại */}
                      <td style={{ padding: '14px 16px', color: isDark ? '#CBD5E1' : '#334155' }}>
                        {customer.normPhone ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Phone size={14} color="#10B981" />
                            <strong style={{ fontWeight: 700 }}>{formattedPhone}</strong>
                          </div>
                        ) : (
                          <span style={{ color: isDark ? '#64748B' : '#94A3B8', fontStyle: 'italic' }}>
                            Chưa có
                          </span>
                        )}
                      </td>

                      {/* 5. Địa Chỉ */}
                      <td style={{ padding: '14px 16px', maxWidth: '240px' }}>
                        {customer.address ? (
                          <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '6px',
                            color: isDark ? '#CBD5E1' : '#334155'
                          }}>
                            <MapPin size={14} color="#F59E0B" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }} title={customer.address}>
                              {customer.address}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: isDark ? '#64748B' : '#94A3B8', fontStyle: 'italic' }}>
                            Chưa cập nhật
                          </span>
                        )}
                      </td>

                      {/* 6. Đơn Hàng (Click to view History) */}
                      <td style={{ padding: '14px 16px' }}>
                        <button
                          onClick={() => setSelectedCustomerForOrders(customer)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                            backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                            color: isDark ? '#F8FAFC' : '#0F172A',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            transition: 'all 0.15s ease'
                          }}
                          title="Nhấp để xem toàn bộ lịch sử đơn hàng của khách"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#8B5CF6';
                            e.currentTarget.style.color = '#8B5CF6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = isDark ? '#334155' : '#E2E8F0';
                            e.currentTarget.style.color = isDark ? '#F8FAFC' : '#0F172A';
                          }}
                        >
                          <ShoppingBag size={14} color="#8B5CF6" />
                          <span>{customer.orderCount} đơn</span>
                          <span style={{ color: isDark ? '#64748B' : '#94A3B8' }}>•</span>
                          <strong style={{ color: '#10B981' }}>
                            {customer.totalSpent.toLocaleString('vi-VN')}đ
                          </strong>
                          <Eye size={12} color={isDark ? '#94A3B8' : '#64748B'} />
                        </button>
                      </td>

                      {/* 7. Thao Tác (Chỉnh sửa & Xoá) */}
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          {/* Nút Chỉnh Sửa */}
                          <button
                            onClick={() => handleOpenEdit(customer)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                              backgroundColor: isDark ? '#1E293B' : '#FFF',
                              color: isDark ? '#F8FAFC' : '#334155',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            title="Chỉnh sửa thông tin khách hàng"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = '#2563EB';
                              e.currentTarget.style.color = '#2563EB';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = isDark ? '#334155' : '#CBD5E1';
                              e.currentTarget.style.color = isDark ? '#F8FAFC' : '#334155';
                            }}
                          >
                            <Edit3 size={13} />
                            <span>Sửa</span>
                          </button>

                          {/* Nút Xoá */}
                          <button
                            onClick={() => setCustomerToDelete(customer)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: `1px solid ${isDark ? '#7F1D1D' : '#FEE2E2'}`,
                              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
                              color: '#EF4444',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            title="Xoá khách hàng và toàn bộ đơn hàng liên quan"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#EF4444';
                              e.currentTarget.style.color = '#FFF';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2';
                              e.currentTarget.style.color = '#EF4444';
                            }}
                          >
                            <Trash2 size={13} />
                            <span>Xoá</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* 4B. Customer Data Card View (Tối ưu cho màn hình cảm ứng điện thoại) */}
      {viewMode === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
          {filteredCustomers.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1',
              padding: '48px 20px',
              textAlign: 'center',
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '16px',
              border: isDark ? '1px dashed #334155' : '1px dashed #CBD5E1',
              color: isDark ? '#94A3B8' : '#64748B'
            }}>
              <Users size={36} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
              <div style={{ fontWeight: 800, fontSize: '1rem', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                Không tìm thấy khách hàng nào
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc trạng thái.
              </p>
            </div>
          ) : (
            filteredCustomers.map((customer, idx) => {
              const initials = (customer.name || 'U')
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map(w => w[0])
                .join('')
                .toUpperCase() || 'U';

              const formattedPhone = customer.normPhone ? formatPhone(customer.normPhone) : 'Chưa có';

              return (
                <div
                  key={customer.primaryId || idx}
                  style={{
                    backgroundColor: isDark ? '#1E293B' : '#FFF',
                    borderRadius: '14px',
                    border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                    padding: '16px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px'
                  }}
                >
                  {/* Card Top: Avatar, Name, STT, Role Badge */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        backgroundColor: isDark ? '#312E81' : '#EDE9FE',
                        color: isDark ? '#C4B5FD' : '#6D28D9',
                        fontWeight: 900,
                        fontSize: '0.95rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid #8B5CF6',
                        flexShrink: 0
                      }}>
                        {initials}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.96rem', color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.3 }}>
                          {customer.name}
                        </div>
                        <div style={{ marginTop: '3px' }}>
                          {customer.isRegistered ? (
                            <span style={{
                              fontSize: '0.66rem',
                              fontWeight: 800,
                              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
                              color: '#10B981',
                              border: isDark ? '1px solid #065F46' : '1px solid #A7F3D0',
                              padding: '2px 7px',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}>
                              <UserCheck size={10} />
                              {customer.provider === 'google' ? 'Google Auth' : 'Thành viên'}
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              backgroundColor: isDark ? '#334155' : '#F1F5F9',
                              color: isDark ? '#94A3B8' : '#64748B',
                              padding: '2px 7px',
                              borderRadius: '6px'
                            }}>
                              Khách vãng lai
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: isDark ? '#64748B' : '#94A3B8',
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                      padding: '2px 8px',
                      borderRadius: '6px'
                    }}>
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Card Middle: Contact & Address */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
                    {/* Phone */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isDark ? '#E2E8F0' : '#334155' }}>
                      <Phone size={14} color="#10B981" style={{ flexShrink: 0 }} />
                      {customer.normPhone ? (
                        <a
                          href={`tel:${customer.normPhone}`}
                          style={{ color: isDark ? '#38BDF8' : '#2563EB', fontWeight: 700, textDecoration: 'none' }}
                        >
                          {formattedPhone}
                        </a>
                      ) : (
                        <span style={{ color: isDark ? '#64748B' : '#94A3B8', fontStyle: 'italic' }}>Chưa có SĐT</span>
                      )}
                    </div>

                    {/* Email */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isDark ? '#E2E8F0' : '#334155' }}>
                      <Mail size={14} color="#8B5CF6" style={{ flexShrink: 0 }} />
                      {customer.normEmail ? (
                        <a
                          href={`mailto:${customer.email}`}
                          style={{ color: isDark ? '#C4B5FD' : '#7C3AED', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {customer.email}
                        </a>
                      ) : (
                        <span style={{ color: isDark ? '#64748B' : '#94A3B8', fontStyle: 'italic' }}>Chưa có Email</span>
                      )}
                    </div>

                    {/* Address */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: isDark ? '#CBD5E1' : '#475569' }}>
                      <MapPin size={14} color="#F59E0B" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span style={{ lineHeight: 1.35, fontSize: '0.8rem' }}>
                        {customer.address || <em style={{ color: isDark ? '#64748B' : '#94A3B8' }}>Chưa có địa chỉ</em>}
                      </span>
                    </div>
                  </div>

                  {/* Card Order Summary Pill */}
                  <div
                    onClick={() => customer.orderCount > 0 && setSelectedCustomerForOrders(customer)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      backgroundColor: customer.orderCount > 0 ? (isDark ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF') : (isDark ? '#0F172A' : '#F8FAFC'),
                      border: customer.orderCount > 0 ? (isDark ? '1px solid #1D4ED8' : '1px solid #BFDBFE') : (isDark ? '1px solid #334155' : '1px solid #E2E8F0'),
                      cursor: customer.orderCount > 0 ? 'pointer' : 'default',
                      touchAction: 'manipulation'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShoppingBag size={15} color={customer.orderCount > 0 ? '#2563EB' : '#94A3B8'} />
                      <span style={{ fontWeight: 800, fontSize: '0.86rem', color: customer.orderCount > 0 ? (isDark ? '#93C5FD' : '#1E40AF') : (isDark ? '#64748B' : '#94A3B8') }}>
                        {customer.orderCount} đơn hàng
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontWeight: 900, fontSize: '0.88rem', color: customer.totalSpent > 0 ? '#10B981' : (isDark ? '#64748B' : '#94A3B8') }}>
                        {customer.totalSpent.toLocaleString('vi-VN')} đ
                      </span>
                      {customer.orderCount > 0 && <Eye size={13} color="#2563EB" />}
                    </div>
                  </div>

                  {/* Card Bottom Actions (Min 44px height for Touch Targets) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '6px', borderTop: isDark ? '1px solid #334155' : '1px solid #F1F5F9' }}>
                    <button
                      onClick={() => handleOpenEdit(customer)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        minHeight: '44px',
                        borderRadius: '8px',
                        border: `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                        backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                        color: isDark ? '#F8FAFC' : '#1E293B',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        touchAction: 'manipulation'
                      }}
                    >
                      <Edit3 size={15} color="#2563EB" />
                      <span>Chỉnh Sửa</span>
                    </button>

                    <button
                      onClick={() => setCustomerToDelete(customer)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        minHeight: '44px',
                        borderRadius: '8px',
                        border: `1px solid ${isDark ? '#7F1D1D' : '#FEE2E2'}`,
                        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
                        color: '#EF4444',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        touchAction: 'manipulation'
                      }}
                    >
                      <Trash2 size={15} color="#EF4444" />
                      <span>Xoá</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* POPUP 1: MODAL XEM CHI TIẾT LỊCH SỬ ĐƠN HÀNG (ORDER HISTORY)     */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {selectedCustomerForOrders && (
        <div
          onClick={() => setSelectedCustomerForOrders(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              color: isDark ? '#F8FAFC' : '#0F172A',
              borderRadius: '16px',
              maxWidth: '750px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: isDark ? '#0F172A' : '#FAF8F5'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Package size={20} color="#8B5CF6" />
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                    Lịch Sử Đơn Hàng: {selectedCustomerForOrders.name}
                  </h2>
                </div>
                <div style={{ fontSize: '0.8rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '4px' }}>
                  SĐT: {formatPhone(selectedCustomerForOrders.phone) || 'Chưa có'} • Email: {selectedCustomerForOrders.email || 'Chưa có'}
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCustomerForOrders(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isDark ? '#94A3B8' : '#64748B',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content / Order List */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
              {selectedCustomerForOrders.orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: isDark ? '#94A3B8' : '#64748B' }}>
                  <ShoppingBag size={40} strokeWidth={1.5} color={isDark ? '#475569' : '#CBD5E1'} />
                  <p style={{ marginTop: '12px', fontWeight: 600 }}>Khách hàng này hiện chưa đặt đơn hàng nào.</p>
                </div>
              ) : (
                selectedCustomerForOrders.orders.map((order, oIdx) => {
                  const statusInfo = getOrderStatusBadge(order.status);
                  const orderTotal = getOrderTotalVnd(order, rates);
                  const items = Array.isArray(order.items) ? order.items : [];
                  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : 'Không rõ ngày';

                  return (
                    <div
                      key={order.id || oIdx}
                      style={{
                        borderRadius: '10px',
                        border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                        backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}
                    >
                      {/* Order top bar */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        borderBottom: `1px solid ${isDark ? '#1E293B' : '#E2E8F0'}`,
                        paddingBottom: '10px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: isDark ? '#38BDF8' : '#2563EB' }}>
                            #{String(order.id).replace(/^ORD-?/i, '')}
                          </span>
                          <span style={{
                            backgroundColor: statusInfo.bg,
                            color: statusInfo.color,
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px'
                          }}>
                            {statusInfo.label}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem' }}>
                          <span style={{ color: isDark ? '#94A3B8' : '#64748B' }}>{orderDate}</span>
                          <strong style={{ fontSize: '0.95rem', color: '#10B981', fontWeight: 800 }}>
                            {orderTotal.toLocaleString('vi-VN')} đ
                          </strong>
                        </div>
                      </div>

                      {/* Items Preview */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {items.length === 0 ? (
                          <div style={{ fontSize: '0.8rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                            Đơn hàng gửi link báo giá / dịch vụ order hộ
                          </div>
                        ) : (
                          items.map((item, iIdx) => (
                            <div key={iIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '0.82rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                {item.productImage && (
                                  <img
                                    src={item.productImage}
                                    alt=""
                                    style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' }}
                                  />
                                )}
                                <span style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  color: isDark ? '#E2E8F0' : '#1E293B',
                                  fontWeight: 500
                                }}>
                                  {item.name || item.productName || 'Sản phẩm Hàn Quốc'}
                                </span>
                              </div>
                              <span style={{ color: isDark ? '#94A3B8' : '#64748B', flexShrink: 0 }}>
                                x{item.qty || item.quantity || 1}
                              </span>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Delivery Address */}
                      {order.shippingAddress && (
                        <div style={{ fontSize: '0.78rem', color: isDark ? '#94A3B8' : '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin size={12} color="#F59E0B" />
                          <span>Giao tới: {order.shippingAddress}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              display: 'flex',
              justifyContent: 'flex-end',
              backgroundColor: isDark ? '#0F172A' : '#FAF8F5'
            }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCustomerForOrders(null);
                }}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  backgroundColor: isDark ? '#334155' : '#E2E8F0',
                  color: isDark ? '#F8FAFC' : '#0F172A',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* POPUP 2: MODAL CHỈNH SỬA THÔNG TIN KHÁCH HÀNG (R4 EDIT USER)    */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {customerToEdit && (
        <div
          onClick={() => setCustomerToEdit(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              color: isDark ? '#F8FAFC' : '#0F172A',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: isDark ? '#0F172A' : '#FAF8F5'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={18} color="#2563EB" />
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                  Chỉnh Sửa Thông Tin Khách Hàng
                </h2>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCustomerToEdit(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isDark ? '#94A3B8' : '#64748B',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveEdit}>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Field 1: Tên */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: isDark ? '#CBD5E1' : '#334155' }}>
                    Tên Khách Hàng <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ví dụ: Nguyễn Văn An"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: editErrors.name ? '1px solid #EF4444' : `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                      backgroundColor: isDark ? '#0F172A' : '#FFF',
                      color: isDark ? '#F8FAFC' : '#0F172A',
                      outline: 'none',
                      fontSize: '0.88rem'
                    }}
                  />
                  {editErrors.name && (
                    <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '4px', display: 'block' }}>
                      {editErrors.name}
                    </span>
                  )}
                </div>

                {/* Field 2: Email */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: isDark ? '#CBD5E1' : '#334155' }}>
                    Gmail / Email
                  </label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="example@gmail.com"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: editErrors.email ? '1px solid #EF4444' : `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                      backgroundColor: isDark ? '#0F172A' : '#FFF',
                      color: isDark ? '#F8FAFC' : '#0F172A',
                      outline: 'none',
                      fontSize: '0.88rem'
                    }}
                  />
                  {editErrors.email && (
                    <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '4px', display: 'block' }}>
                      {editErrors.email}
                    </span>
                  )}
                </div>

                {/* Field 3: Số Điện Thoại */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: isDark ? '#CBD5E1' : '#334155' }}>
                    Số Điện Thoại (10 số Việt Nam)
                  </label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="0912345678"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: editErrors.phone ? '1px solid #EF4444' : `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                      backgroundColor: isDark ? '#0F172A' : '#FFF',
                      color: isDark ? '#F8FAFC' : '#0F172A',
                      outline: 'none',
                      fontSize: '0.88rem'
                    }}
                  />
                  {editErrors.phone && (
                    <span style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '4px', display: 'block' }}>
                      {editErrors.phone}
                    </span>
                  )}
                </div>

                {/* Field 4: Địa Chỉ */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', color: isDark ? '#CBD5E1' : '#334155' }}>
                    Địa Chỉ Giao Hàng
                  </label>
                  <textarea
                    rows={3}
                    value={editForm.address}
                    onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${isDark ? '#334155' : '#CBD5E1'}`,
                      backgroundColor: isDark ? '#0F172A' : '#FFF',
                      color: isDark ? '#F8FAFC' : '#0F172A',
                      outline: 'none',
                      fontSize: '0.88rem',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: isDark ? 'rgba(37, 99, 235, 0.12)' : '#EFF6FF',
                  border: `1px solid ${isDark ? '#1E3A8A' : '#DBEAFE'}`,
                  fontSize: '0.75rem',
                  color: isDark ? '#93C5FD' : '#1E40AF',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                  <span>
                    Hệ thống sẽ tự động cập nhật Firestore và đồng bộ thông tin trên {customerToEdit.orders?.length || 0} đơn hàng liên quan của khách hàng này.
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{
                padding: '16px 24px',
                borderTop: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                backgroundColor: isDark ? '#0F172A' : '#FAF8F5'
              }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCustomerToEdit(null);
                  }}
                  disabled={isSaving}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: isDark ? '#334155' : '#E2E8F0',
                    color: isDark ? '#F8FAFC' : '#0F172A',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: isSaving ? 'not-allowed' : 'pointer'
                  }}
                >
                  Huỷ
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isSaving && <RefreshCw size={14} className="spin" />}
                  <span>{isSaving ? 'Đang lưu...' : 'Lưu Thay Đổi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* POPUP 3: MODAL XOÁ KHÁCH HÀNG & ĐƠN HÀNG (R5 DELETE USER)       */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {customerToDelete && (
        <div
          onClick={() => setCustomerToDelete(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              color: isDark ? '#F8FAFC' : '#0F172A',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              border: `1px solid ${isDark ? '#7F1D1D' : '#FEE2E2'}`,
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: isDark ? '#450A0A' : '#FEF2F2'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={22} color="#DC2626" />
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#DC2626' }}>
                  Xác Nhận Xoá Khách Hàng
                </h2>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCustomerToDelete(null);
                }}
                disabled={isDeleting}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isDark ? '#FCA5A5' : '#DC2626',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  padding: '4px',
                  borderRadius: '6px'
                }}
                title="Đóng hộp thoại"
              >
                <X size={20} />
              </button>
            </div>

            {/* Warning Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{
                fontSize: '0.92rem',
                fontWeight: 700,
                color: isDark ? '#FCA5A5' : '#991B1B',
                lineHeight: 1.5,
                margin: 0
              }}>
                Bạn có chắc chắn muốn xoá người dùng này cùng TOÀN BỘ các đơn hàng liên quan? Thao tác này không thể hoàn tác.
              </p>

              <div style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                fontSize: '0.82rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                <div><strong>Khách hàng:</strong> {customerToDelete.name}</div>
                <div><strong>SĐT:</strong> {formatPhone(customerToDelete.phone) || 'Chưa có'}</div>
                <div><strong>Email:</strong> {customerToDelete.email || 'Chưa có'}</div>
                <div style={{ color: '#DC2626', fontWeight: 700, marginTop: '4px' }}>
                  ⚠️ {customerToDelete.orders.length} đơn hàng sẽ bị xoá vĩnh viễn khỏi hệ thống.
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{
              padding: '16px 24px',
              borderTop: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              backgroundColor: isDark ? '#0F172A' : '#FAF8F5'
            }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCustomerToDelete(null);
                }}
                disabled={isDeleting}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: isDark ? '#334155' : '#E2E8F0',
                  color: isDark ? '#F8FAFC' : '#0F172A',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: isDeleting ? 'not-allowed' : 'pointer'
                }}
              >
                Huỷ Bỏ
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  backgroundColor: '#DC2626',
                  color: '#FFF',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isDeleting && <RefreshCw size={14} className="spin" />}
                <span>{isDeleting ? 'Đang xoá...' : 'Xác Nhận Xoá Triệt Để'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
