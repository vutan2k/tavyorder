import React, { useState, useContext, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { useToast } from '../components/Toast';
import AdminProductModal from './AdminProductModal';
import {
  Search, Plus, Trash2, Edit3, ExternalLink,
  Star, RefreshCw, Eye, EyeOff, Layers, ShoppingBag,
  CheckCircle2, AlertCircle, Filter, ArrowUpRight,
  SlidersHorizontal, Check, ArrowRight, Table, LayoutGrid,
  Download, Copy, ArrowUpDown, ChevronDown, ChevronUp, CheckCheck
} from 'lucide-react';
import { getCategoryLabel as getClassifierCategoryLabel } from '../services/categoryClassifier';

export default function AdminProductCatalog({ isDark: isDarkProp } = {}) {
  const isDark = isDarkProp !== undefined
    ? isDarkProp
    : (typeof window !== 'undefined' && localStorage.getItem('tavy_admin_theme') === 'dark');

  const {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    addPendingProduct,
    rates
  } = useContext(AppContext);
  const showToast = useToast();

  // View state: 'table' (Excel Spreadsheet) | 'grid' (Cards)
  const [viewMode, setViewMode] = useState('table');

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState('all'); // 'all' | 'in_stock' | 'out_of_stock'

  // Sorting
  const [sortField, setSortField] = useState('name'); // 'name' | 'foreignPrice' | 'vnd' | 'rating' | 'goodsNo'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'

  // Batch Selection
  const [selectedIds, setSelectedIds] = useState([]);

  // Modal State
  const [editingProduct, setEditingProduct] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Hover image preview
  const [previewImgUrl, setPreviewImgUrl] = useState(null);

  const krwRate = rates?.KRW?.rate || 19.5;
  const serviceFee = rates?.serviceFeePercent || 5;

  // Lọc và sắp xếp sản phẩm
  const filteredProducts = useMemo(() => {
    let result = products.filter(p => {
      const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
      const matchSearch = !searchTerm.trim() ||
        (p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.brand && p.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.goodsNo && p.goodsNo.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.nameKr && p.nameKr.toLowerCase().includes(searchTerm.toLowerCase()));

      const isOutOfStock = Boolean(p.isOutOfStock);
      const matchStock = stockFilter === 'all' ||
        (stockFilter === 'in_stock' && !isOutOfStock) ||
        (stockFilter === 'out_of_stock' && isOutOfStock);

      return matchCat && matchSearch && matchStock;
    });

    // Sắp xếp
    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'foreignPrice' || sortField === 'price') {
        valA = a.foreignPrice || a.price || 0;
        valB = b.foreignPrice || b.price || 0;
      } else if (sortField === 'rating') {
        valA = a.rating || 0;
        valB = b.rating || 0;
      } else if (typeof valA === 'string') {
        return sortOrder === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [products, selectedCategory, searchTerm, stockFilter, sortField, sortOrder]);

  // Đổi chiều sắp xếp cột
  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Checkbox select all / deselect all
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map(p => p.goodsNo));
    }
  };

  // Toggle single item checkbox
  const handleToggleSelect = (e, goodsNo) => {
    e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(goodsNo) ? prev.filter(id => id !== goodsNo) : [...prev, goodsNo]
    );
  };

  // Mở modal sửa nhanh
  const handleOpenEdit = (prod) => {
    setEditingProduct(prod);
    setIsModalOpen(true);
  };

  // Mở modal tạo mới
  const handleOpenCreateNew = () => {
    setEditingProduct({
      goodsNo: `SP-${Date.now()}`,
      name: '',
      nameKr: '',
      brand: 'Tavy Korea',
      category: 'ginseng',
      foreignPrice: 35000,
      productImage: '',
      images: [],
      rating: 4.9,
      reviewsCount: 150,
      origin: 'Hàn Quốc',
      description: '',
      usage: '',
      activeIngredients: [],
      isOutOfStock: false,
      isHidden: false
    });
    setIsModalOpen(true);
  };

  // Lưu sản phẩm từ Modal
  const handleSaveProduct = async (goodsNo, updatedData) => {
    const exists = products.some(p => p.goodsNo === goodsNo);
    if (exists) {
      updateProduct(goodsNo, updatedData);
      if (showToast) showToast(`Đã cập nhật thông tin sản phẩm "${updatedData.name}"!`, 'success');
    } else {
      addProduct(updatedData);
      if (showToast) showToast(`Đã thêm mới sản phẩm "${updatedData.name}" vào Kho Live!`, 'success');
    }
  };

  // Xoá 1 sản phẩm
  const handleDeleteProduct = (goodsNo) => {
    if (window.confirm('Bạn có chắc chắn muốn xoá sản phẩm này khỏi Kho Hàng Live?')) {
      deleteProduct(goodsNo);
      setIsModalOpen(false);
      setSelectedIds(prev => prev.filter(id => id !== goodsNo));
      if (showToast) showToast('Đã xoá sản phẩm khỏi kho!', 'info');
    }
  };

  // Toggle nhanh trạng thái tồn kho
  const handleToggleStock = (e, prod) => {
    e.stopPropagation();
    const newStatus = !prod.isOutOfStock;
    updateProduct(prod.goodsNo, { isOutOfStock: newStatus });
    if (showToast) {
      showToast(newStatus ? `Đã chuyển "${prod.name}" sang Hết hàng!` : `Đã chuyển "${prod.name}" sang Còn hàng!`, 'info');
    }
  };

  // Toggle nhanh ẩn / hiện
  const handleToggleVisibility = (e, prod) => {
    e.stopPropagation();
    const newHidden = !prod.isHidden;
    updateProduct(prod.goodsNo, { isHidden: newHidden });
    if (showToast) {
      showToast(newHidden ? `Đã tạm ẩn "${prod.name}" khỏi web!` : `Đã hiển thị "${prod.name}" lên web!`, 'info');
    }
  };

  // Chuyển sản phẩm về Hàng Chờ Duyệt (Unpublish to Pending)
  const handleMoveToPending = (e, prod) => {
    e.stopPropagation();
    if (window.confirm(`Chuyển "${prod.name}" về lại Hàng Chờ Duyệt (gỡ khỏi web bán hàng)?`)) {
      addPendingProduct({ ...prod, isPublished: false, status: 'pending' });
      deleteProduct(prod.goodsNo);
      setSelectedIds(prev => prev.filter(id => id !== prod.goodsNo));
      if (showToast) showToast(`Đã chuyển "${prod.name}" về Hàng Chờ Duyệt!`, 'warning');
    }
  };

  // Sao chép mã SKU
  const handleCopySku = (e, sku) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sku);
    if (showToast) showToast(`Đã sao chép mã SKU: ${sku}`, 'success');
  };

  // THAO TÁC HÀNG LOẠT (BATCH ACTIONS)
  const handleBatchSetStock = (isOutOfStock) => {
    if (selectedIds.length === 0) return;
    selectedIds.forEach(id => updateProduct(id, { isOutOfStock }));
    if (showToast) showToast(`Đã cập nhật tình trạng kho cho ${selectedIds.length} sản phẩm!`, 'success');
  };

  const handleBatchSetVisibility = (isHidden) => {
    if (selectedIds.length === 0) return;
    selectedIds.forEach(id => updateProduct(id, { isHidden }));
    if (showToast) showToast(`Đã cập nhật trạng thái hiển thị cho ${selectedIds.length} sản phẩm!`, 'success');
  };

  const handleBatchMoveToPending = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`Chuyển ${selectedIds.length} sản phẩm đã chọn về lại Hàng Chờ Duyệt?`)) {
      selectedIds.forEach(id => {
        const target = products.find(p => p.goodsNo === id);
        if (target) {
          addPendingProduct({ ...target, isPublished: false, status: 'pending' });
          deleteProduct(id);
        }
      });
      setSelectedIds([]);
      if (showToast) showToast(`Đã chuyển ${selectedIds.length} sản phẩm về Hàng Chờ Duyệt!`, 'warning');
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`⚠️ BẠN CÓ CHẮC CHẮN MUỐN XOÁ ${selectedIds.length} SẢN PHẨM ĐÃ CHỌN KHỎI KHO?`)) {
      selectedIds.forEach(id => deleteProduct(id));
      setSelectedIds([]);
      if (showToast) showToast(`Đã xoá ${selectedIds.length} sản phẩm khỏi kho!`, 'info');
    }
  };

  // Xuất file CSV / Excel
  const handleExportCSV = () => {
    if (filteredProducts.length === 0) {
      alert('Không có dữ liệu sản phẩm để xuất!');
      return;
    }

    const headers = ['STT', 'Mã SKU', 'Tên Tiếng Việt', 'Tên Tiếng Hàn', 'Thương Hiệu', 'Danh Mục', 'Giá Won (KRW)', 'Giá Bán VNĐ', 'Đánh Giá', 'Số Lượt Đánh Giá', 'Tồn Kho', 'Trạng Thái Web'];
    const rows = filteredProducts.map((p, idx) => {
      const won = p.foreignPrice || p.price || 0;
      const vnd = Math.round(won * krwRate * (1 + serviceFee / 100));
      return [
        idx + 1,
        `"${p.goodsNo || ''}"`,
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.nameKr || '').replace(/"/g, '""')}"`,
        `"${(p.brand || '').replace(/"/g, '""')}"`,
        `"${p.category || 'ginseng'}"`,
        won,
        vnd,
        p.rating ?? 0,
        p.reviewsCount ?? 0,
        p.isOutOfStock ? 'Hết hàng' : 'Còn hàng',
        p.isHidden ? 'Tạm ẩn' : 'Đang bán'
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Tavy_Kho_San_Pham_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (showToast) showToast('Đã xuất file Excel / CSV thành công!', 'success');
  };

  const getCategoryLabel = (cat) => {
    if (!cat) return 'Khác';
    return getClassifierCategoryLabel(cat, true) || cat;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Banner & Control */}
      <div style={{
        backgroundColor: isDark ? '#1E293B' : '#FFF',
        borderRadius: '16px',
        padding: '18px 24px',
        border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: isDark ? '#F8FAFC' : '#0F172A' }}>
              Kho Sản Phẩm
            </h2>
            <span style={{
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
              color: '#10B981',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '999px'
            }}>
              ● {products.length} SKU Live
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* View Switcher: Table vs Grid */}
          <div style={{
            display: 'flex',
            backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
            padding: '2px',
            borderRadius: '6px',
            border: isDark ? '1px solid #334155' : 'none'
          }}>
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
              <Table size={13} />
              <span>Bảng</span>
            </button>

            <button
              onClick={() => setViewMode('grid')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '5px',
                border: 'none',
                backgroundColor: viewMode === 'grid' ? (isDark ? '#334155' : '#FFF') : 'transparent',
                color: viewMode === 'grid' ? (isDark ? '#F8FAFC' : '#0F172A') : (isDark ? '#94A3B8' : '#64748B'),
                fontWeight: viewMode === 'grid' ? 700 : 500,
                fontSize: '0.78rem',
                cursor: 'pointer',
                boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              <LayoutGrid size={13} />
              <span>Lưới</span>
            </button>
          </div>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCSV}
            style={{
              backgroundColor: isDark ? '#0F172A' : '#FFF',
              color: isDark ? '#F8FAFC' : '#0F172A',
              border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <Download size={13} color={isDark ? '#94A3B8' : '#64748B'} />
            <span>Xuất CSV</span>
          </button>

          {/* Add Product Button */}
          <button
            onClick={handleOpenCreateNew}
            style={{
              backgroundColor: isDark ? '#F8FAFC' : '#0F172A',
              color: isDark ? '#0F172A' : '#FFF',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'opacity 0.15s ease'
            }}
          >
            <Plus size={14} />
            <span>Thêm SP</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{
        backgroundColor: isDark ? '#1E293B' : '#FFF',
        borderRadius: '12px',
        padding: '12px 18px',
        border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: '380px' }}>
          <Search size={15} color={isDark ? '#94A3B8' : '#64748B'} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Tìm theo tên sản phẩm, mã SKU, thương hiệu..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: '8px',
              border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
              backgroundColor: isDark ? '#0F172A' : '#FFF',
              color: isDark ? '#F8FAFC' : '#0F172A',
              fontSize: '0.82rem',
              outline: 'none'
            }}
          />
        </div>

        {/* Categories */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { id: 'all', label: 'Tất Cả' },
            { id: 'ginseng', label: 'Sâm Nấm' },
            { id: 'supplements', label: 'TPCN' },
            { id: 'cosmetics', label: 'Mỹ Phẩm' }
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: selectedCategory === cat.id ? '1px solid #38BDF8' : (isDark ? '1px solid #334155' : '1px solid #E2E8F0'),
                backgroundColor: selectedCategory === cat.id ? (isDark ? '#1E3A8A' : '#EFF6FF') : (isDark ? '#0F172A' : '#FFF'),
                color: selectedCategory === cat.id ? (isDark ? '#F8FAFC' : '#1D4ED8') : (isDark ? '#94A3B8' : '#475569'),
                fontWeight: selectedCategory === cat.id ? 700 : 500,
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Stock Filter */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: isDark ? '#F8FAFC' : '#334155',
              backgroundColor: isDark ? '#0F172A' : '#FFF',
              outline: 'none'
            }}
          >
            <option value="all">Tất cả tình trạng kho</option>
            <option value="in_stock">Còn hàng</option>
            <option value="out_of_stock">Tạm hết hàng</option>
          </select>
        </div>
      </div>

      {/* Floating / Inline Batch Actions Bar (when rows are selected) */}
      {selectedIds.length > 0 && (
        <div style={{
          backgroundColor: '#0F172A',
          color: '#FFF',
          borderRadius: '12px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ backgroundColor: '#2563EB', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 900 }}>
              {selectedIds.length} ĐÃ CHỌN
            </span>
            <span style={{ fontSize: '0.82rem', color: '#CBD5E1' }}>
              Thao tác hàng loạt trên các sản phẩm đã chọn:
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleBatchSetStock(false)}
              style={{ backgroundColor: '#10B981', color: '#FFF', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Chuyển Còn Hàng
            </button>

            <button
              onClick={() => handleBatchSetStock(true)}
              style={{ backgroundColor: '#EF4444', color: '#FFF', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Chuyển Hết Hàng
            </button>

            <button
              onClick={() => handleBatchSetVisibility(false)}
              style={{ backgroundColor: '#3B82F6', color: '#FFF', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Hiện Lên Web
            </button>

            <button
              onClick={() => handleBatchSetVisibility(true)}
              style={{ backgroundColor: '#64748B', color: '#FFF', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Tạm Ẩn
            </button>

            <button
              onClick={handleBatchMoveToPending}
              style={{ backgroundColor: '#F59E0B', color: '#000', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
            >
              Về Chờ Duyệt
            </button>

            <button
              onClick={handleBatchDelete}
              style={{ backgroundColor: '#DC2626', color: '#FFF', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Xoá
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* EXCEL SPREADSHEET TABLE VIEW (MẶC ĐỊNH)                          */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {viewMode === 'table' && (
        <div style={{
          backgroundColor: isDark ? '#1E293B' : '#FFF',
          borderRadius: '14px',
          border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}>
          <div style={{ overflowX: 'auto', maxHeight: '72vh' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.82rem',
              textAlign: 'left'
            }}>
              {/* Excel Table Header */}
              <thead style={{
                position: 'sticky',
                top: 0,
                backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
                borderBottom: isDark ? '2px solid #334155' : '2px solid #CBD5E1',
                zIndex: 10
              }}>
                <tr style={{ color: isDark ? '#94A3B8' : '#334155', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                  {/* Select All Checkbox */}
                  <th style={{ width: '40px', padding: '10px 8px', textAlign: 'center', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                      onChange={handleToggleSelectAll}
                      style={{ width: '15px', height: '15px', accentColor: '#2563EB', cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ width: '60px', padding: '10px 8px', textAlign: 'center', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>Ảnh</th>
                  
                  <th
                    onClick={() => handleSort('goodsNo')}
                    style={{ width: '130px', padding: '10px 12px', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>Mã SKU</span>
                      {sortField === 'goodsNo' && (sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </div>
                  </th>

                  <th
                    onClick={() => handleSort('name')}
                    style={{ minWidth: '260px', padding: '10px 12px', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>Tên Sản Phẩm (Việt / Hàn)</span>
                      {sortField === 'name' && (sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </div>
                  </th>

                  <th style={{ width: '120px', padding: '10px 12px', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>Thương Hiệu</th>
                  <th style={{ width: '110px', padding: '10px 12px', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>Ngành Hàng</th>

                  <th
                    onClick={() => handleSort('foreignPrice')}
                    style={{ width: '130px', padding: '10px 12px', textAlign: 'right', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                      <span>Giá Bán</span>
                      {sortField === 'foreignPrice' && (sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                    </div>
                  </th>

                  <th style={{ width: '130px', padding: '10px 12px', textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>

              {/* Excel Table Body */}
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: isDark ? '#64748B' : '#94A3B8' }}>
                      <ShoppingBag size={36} style={{ margin: '0 auto 8px auto', opacity: 0.4 }} />
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: isDark ? '#CBD5E1' : '#475569' }}>Không tìm thấy sản phẩm nào phù hợp</div>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((prod, idx) => {
                    const won = prod.foreignPrice || prod.price || 0;
                    const vnd = Math.round(won * krwRate * (1 + serviceFee / 100));
                    const isOutOfStock = Boolean(prod.isOutOfStock);
                    const isHidden = Boolean(prod.isHidden);
                    const isSelected = selectedIds.includes(prod.goodsNo);

                    return (
                      <tr
                        key={prod.goodsNo || prod.id}
                        onClick={() => handleOpenEdit(prod)}
                        style={{
                          backgroundColor: isSelected ? (isDark ? '#1E3A8A' : '#EFF6FF') : (idx % 2 === 1 ? (isDark ? '#162032' : '#F8FAFC') : (isDark ? '#1E293B' : '#FFFFFF')),
                          borderBottom: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                          cursor: 'pointer',
                          transition: 'background 0.1s',
                          opacity: isHidden ? 0.65 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = isDark ? '#243044' : '#F1F5F9';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = isSelected ? (isDark ? '#1E3A8A' : '#EFF6FF') : (idx % 2 === 1 ? (isDark ? '#162032' : '#F8FAFC') : (isDark ? '#1E293B' : '#FFFFFF'));
                        }}
                      >
                        {/* Checkbox */}
                        <td style={{ padding: '8px', textAlign: 'center', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleToggleSelect(e, prod.goodsNo)}
                            style={{ width: '15px', height: '15px', accentColor: '#2563EB', cursor: 'pointer' }}
                          />
                        </td>

                        {/* Thumbnail Image */}
                        <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>
                          <div style={{
                            position: 'relative',
                            width: '44px',
                            height: '44px',
                            borderRadius: '6px',
                            backgroundColor: isDark ? '#0F172A' : '#FFF',
                            border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                            overflow: 'hidden',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <img
                              src={prod.productImage || 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=400&q=80'}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                              onError={(e) => {
                                e.target.src = 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=400&q=80';
                              }}
                            />
                            {((prod.images && prod.images.length > 1) || (prod.photoReviews && prod.photoReviews.length > 0)) && (
                              <span
                                title={`Sản phẩm có ${(prod.images?.length || 0) + (prod.photoReviews?.length || 0)} ảnh`}
                                style={{
                                  position: 'absolute',
                                  bottom: '1px',
                                  right: '1px',
                                  backgroundColor: 'rgba(15, 23, 42, 0.85)',
                                  color: '#38BDF8',
                                  fontSize: '0.58rem',
                                  fontWeight: 800,
                                  padding: '1px 3px',
                                  borderRadius: '3px',
                                  lineHeight: 1
                                }}
                              >
                                📷{(prod.images?.length || 0) + (prod.photoReviews?.length || 0)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* SKU */}
                        <td style={{ padding: '8px 12px', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isDark ? '#93C5FD' : '#334155', fontSize: '0.78rem' }}>
                              {prod.goodsNo}
                            </span>
                            <button
                              title="Sao chép mã SKU"
                              onClick={(e) => handleCopySku(e, prod.goodsNo)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: isDark ? '#64748B' : '#94A3B8' }}
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        </td>

                        {/* Product Title */}
                        <td style={{ padding: '8px 12px', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>
                          <div style={{ fontWeight: 700, color: isDark ? '#F8FAFC' : '#0F172A', lineHeight: 1.35 }}>
                            {prod.name}
                          </div>
                          {prod.nameKr && (
                            <div style={{ fontSize: '0.7rem', color: isDark ? '#94A3B8' : '#94A3B8', marginTop: '2px' }}>
                              {prod.nameKr}
                            </div>
                          )}
                        </td>

                        {/* Brand */}
                        <td style={{ padding: '8px 12px', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0', color: isDark ? '#CBD5E1' : '#475569', fontWeight: 600 }}>
                          <span style={{
                            backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
                            border: isDark ? '1px solid #334155' : 'none',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: isDark ? '#E2E8F0' : '#334155'
                          }}>
                            {prod.brand || 'Korea'}
                          </span>
                        </td>

                        {/* Category */}
                        <td style={{ padding: '8px 12px', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: prod.category === 'ginseng' ? '#34D399' : (prod.category === 'supplements' ? '#FBBF24' : '#60A5FA'),
                            backgroundColor: prod.category === 'ginseng' ? (isDark ? '#064E3B' : '#ECFDF5') : (prod.category === 'supplements' ? (isDark ? '#78350F' : '#FFFBEB') : (isDark ? '#1E3A8A' : '#EFF6FF')),
                            border: isDark ? '1px solid #334155' : 'none',
                            padding: '2px 8px',
                            borderRadius: '4px'
                          }}>
                            {getCategoryLabel(prod.category)}
                          </span>
                        </td>

                        {/* Merged Price (VNĐ & Won) */}
                        <td style={{ padding: '8px 12px', textAlign: 'right', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>
                          <div style={{ fontWeight: 700, color: isDark ? '#F8FAFC' : '#0F172A', fontSize: '0.85rem', fontFamily: 'monospace', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            {prod.priceChangeAlert?.hasChanged && (
                              <span style={{
                                backgroundColor: prod.priceChangeAlert.changeType === 'drop' ? (isDark ? '#064E3B' : '#ECFDF5') : (isDark ? '#78350F' : '#FEF3C7'),
                                color: prod.priceChangeAlert.changeType === 'drop' ? '#10B981' : '#F59E0B',
                                fontSize: '0.68rem',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontWeight: 800
                              }}>
                                {prod.priceChangeAlert.changeType === 'drop' ? `🔻 ${Math.abs(prod.priceChangeAlert.changePercent)}%` : `🔺 +${prod.priceChangeAlert.changePercent}%`}
                              </span>
                            )}
                            <span>{vnd.toLocaleString('vi-VN')} đ</span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                            {won.toLocaleString('vi-VN')} ₩
                          </div>
                        </td>

                        {/* Action Buttons */}
                        <td style={{ padding: '6px 8px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <button
                              title="Chỉnh sửa chi tiết"
                              onClick={() => handleOpenEdit(prod)}
                              style={{
                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                                color: isDark ? '#F8FAFC' : '#0F172A',
                                border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                                borderRadius: '5px',
                                padding: '4px 8px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <Edit3 size={12} />
                              <span>Sửa</span>
                            </button>

                            <button
                              title="Chuyển về Hàng Chờ Duyệt"
                              onClick={(e) => handleMoveToPending(e, prod)}
                              style={{
                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                                color: isDark ? '#FDE68A' : '#D97706',
                                border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                                borderRadius: '5px',
                                padding: '4px 8px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              Nháp
                            </button>

                            <button
                              title="Xoá sản phẩm"
                              onClick={() => handleDeleteProduct(prod.goodsNo || prod.id)}
                              style={{
                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                                color: '#EF4444',
                                border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                                borderRadius: '5px',
                                padding: '4px 7px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <Trash2 size={12} />
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

          {/* Table Footer Summary */}
          <div style={{
            padding: '10px 18px',
            backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
            borderTop: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.78rem',
            color: isDark ? '#94A3B8' : '#64748B',
            fontWeight: 600
          }}>
            <div>
              Hiển thị <strong>{filteredProducts.length}</strong> / <strong>{products.length}</strong> sản phẩm trong kho
            </div>
            <div>
              Tỷ giá quy đổi: <strong>1 KRW = {krwRate} VNĐ</strong> (Phí {serviceFee}%)
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* GRID VIEW (KHI CHỌN XEM DẠNG THẺ ẢNH)                           */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {viewMode === 'grid' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px'
        }}>
          {filteredProducts.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1',
              padding: '50px 20px',
              textAlign: 'center',
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '16px',
              border: isDark ? '1px dashed #334155' : '1px dashed #CBD5E1',
              color: isDark ? '#64748B' : '#94A3B8'
            }}>
              <ShoppingBag size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
              <div style={{ fontWeight: 800, fontSize: '1rem', color: isDark ? '#CBD5E1' : '#475569' }}>
                Không tìm thấy sản phẩm nào phù hợp
              </div>
            </div>
          ) : (
            filteredProducts.map(prod => {
              const won = prod.foreignPrice || prod.price || 0;
              const vnd = Math.round(won * krwRate * (1 + serviceFee / 100));
              const isOutOfStock = Boolean(prod.isOutOfStock);
              const isHidden = Boolean(prod.isHidden);
              const isSelected = selectedIds.includes(prod.goodsNo);

              return (
                <div
                  key={prod.goodsNo || prod.id}
                  onClick={() => handleOpenEdit(prod)}
                  style={{
                    backgroundColor: isDark ? '#1E293B' : '#FFF',
                    borderRadius: '14px',
                    border: isSelected ? '2px solid #38BDF8' : (isOutOfStock ? (isDark ? '1px solid #7F1D1D' : '1px solid #FECACA') : (isHidden ? (isDark ? '1px dashed #475569' : '1px dashed #CBD5E1') : (isDark ? '1px solid #334155' : '1px solid #E2E8F0'))),
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    position: 'relative',
                    opacity: isHidden ? 0.75 : 1
                  }}
                >
                  <div style={{
                    position: 'relative',
                    width: '100%',
                    height: '190px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    border: isDark ? '1px solid #334155' : '1px solid #F1F5F9'
                  }}>
                    <img
                      src={prod.productImage || 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=400&q=80'}
                      alt={prod.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={(e) => {
                        e.target.src = 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=400&q=80';
                      }}
                    />

                    <span style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      backgroundColor: 'rgba(15, 23, 42, 0.85)',
                      color: '#FFF',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '4px'
                    }}>
                      {prod.brand || 'Hàn Quốc'}
                    </span>

                    {((prod.images && prod.images.length > 1) || (prod.photoReviews && prod.photoReviews.length > 0)) && (
                      <span style={{
                        position: 'absolute',
                        bottom: '8px',
                        left: '8px',
                        backgroundColor: 'rgba(15, 23, 42, 0.85)',
                        color: '#38BDF8',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}>
                        📷 {(prod.images?.length || 0) + (prod.photoReviews?.length || 0)} ảnh
                      </span>
                    )}

                    <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                      {isOutOfStock && (
                        <span style={{ backgroundColor: '#EF4444', color: '#FFF', fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                          HẾT HÀNG
                        </span>
                      )}
                      {isHidden && (
                        <span style={{ backgroundColor: '#64748B', color: '#FFF', fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                          TẠM ẨN
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      color: isDark ? '#F8FAFC' : '#0F172A',
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {prod.name}
                    </div>

                    {prod.nameKr && (
                      <div style={{ fontSize: '0.72rem', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {prod.nameKr}
                      </div>
                    )}

                    <div style={{ marginTop: 'auto', paddingTop: '8px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', fontWeight: 600 }}>
                          {won.toLocaleString('vi-VN')} ₩
                        </div>
                        <div style={{ fontWeight: 900, fontSize: '1.05rem', color: '#38BDF8' }}>
                          {vnd.toLocaleString('vi-VN')} đ
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', color: '#F59E0B', fontWeight: 800 }}>
                        <Star size={13} fill="#F59E0B" />
                        <span>{prod.rating ?? 0}</span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      paddingTop: '10px',
                      borderTop: isDark ? '1px solid #334155' : '1px solid #F1F5F9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        onClick={(e) => handleToggleStock(e, prod)}
                        style={{
                          backgroundColor: isOutOfStock ? (isDark ? '#450A0A' : '#FEE2E2') : (isDark ? '#0F172A' : '#F1F5F9'),
                          color: isOutOfStock ? '#EF4444' : (isDark ? '#CBD5E1' : '#475569'),
                          border: isDark ? '1px solid #334155' : 'none',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {isOutOfStock ? 'Hết hàng' : 'Còn hàng'}
                      </button>

                      <button
                        onClick={(e) => handleToggleVisibility(e, prod)}
                        style={{
                          backgroundColor: isHidden ? (isDark ? '#0F172A' : '#F1F5F9') : (isDark ? '#1E3A8A' : '#EFF6FF'),
                          color: isHidden ? '#64748B' : (isDark ? '#93C5FD' : '#2563EB'),
                          border: isDark ? '1px solid #334155' : 'none',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {isHidden ? 'Ẩn' : 'Hiện'}
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        onClick={() => handleOpenEdit(prod)}
                        style={{
                          backgroundColor: '#2563EB',
                          color: '#FFF',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Edit3 size={12} />
                        <span>Sửa</span>
                      </button>

                      <button
                        title="Xoá"
                        onClick={() => handleDeleteProduct(prod.goodsNo || prod.id)}
                        style={{
                          backgroundColor: isDark ? '#450A0A' : '#FEE2E2',
                          color: '#EF4444',
                          border: isDark ? '1px solid #7F1D1D' : 'none',
                          borderRadius: '6px',
                          padding: '4px 6px',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Quick Edit Modal */}
      <AdminProductModal
        isOpen={isModalOpen}
        product={editingProduct}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProduct}
        onDelete={handleDeleteProduct}
        rates={rates}
        isPending={false}
        isDark={isDark}
      />
    </div>
  );
}
