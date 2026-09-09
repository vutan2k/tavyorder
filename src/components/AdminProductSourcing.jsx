import React, { useState, useContext, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { useToast } from '../components/Toast';
import AdminProductModal from './AdminProductModal';
import AdminGoogleSheetModal from './AdminGoogleSheetModal';
import {
  VERIFIED_KOREAN_HEALTH_CATALOG,
  scrapeKoreanHealthProduct
} from '../services/koreanHealthScraperCore';
import { scrapeProductMetadata } from '../services/productScraperService';
import {
  Zap, Search, Trash2, Edit3, Check,
  CheckCircle2, RefreshCw, Layers,
  X, CheckCheck, ArrowLeft,
  Table, LayoutGrid, Download, Copy, ChevronDown, ChevronUp, ShoppingBag,
  TrendingDown, TrendingUp, Bot, Activity, Clock, Terminal, Sliders, History, ShieldCheck,
  ScanSearch, Sparkles, FileSpreadsheet, Camera, Image as ImageIcon
} from 'lucide-react';
import {
  getPriceSyncConfig,
  savePriceSyncConfig,
  executeAutoPriceSync,
  clearPriceSyncLogs,
  getRecentPriceAlerts
} from '../services/autoScraperBotService';
import { getCategoryLabel as getClassifierCategoryLabel } from '../services/categoryClassifier';
import { calculateVndPrice } from '../services/oliveYoungPriceSyncService';
import AdminProductResearchTab from './AdminProductResearchTab';


export default function AdminProductSourcing({ isDark: isDarkProp, initialSubTab } = {}) {
  const isDark = isDarkProp !== undefined
    ? isDarkProp
    : (typeof window !== 'undefined' && localStorage.getItem('tavy_admin_theme') === 'dark');

  const {
    pendingProducts,
    addPendingProduct,
    updatePendingProduct,
    approvePendingProduct,
    approveSelectedPendingProducts,
    approveAllPendingProducts,
    rejectPendingProduct,
    addProduct,
    products,
    updateProduct,
    rates
  } = useContext(AppContext);
  const showToast = useToast();

  const [activeSubTab, setActiveSubTab] = useState(() => {
    if (initialSubTab && initialSubTab !== 'all') return initialSubTab;
    return 'pending';
  }); // 'pending' (Default) | 'scraper' | 'scheduler' | 'research'

  React.useEffect(() => {
    if (initialSubTab && initialSubTab !== 'all') {
      setActiveSubTab(initialSubTab);
    } else if (typeof window !== 'undefined' && window.location.pathname.includes('/pending')) {
      setActiveSubTab('pending');
    }
  }, [initialSubTab]);

  // View state: 'table' (Excel Spreadsheet) | 'grid' (Cards)
  const [viewMode, setViewMode] = useState('table');

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Sorting
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  // Sourcing input state
  const [sourcingInput, setSourcingInput] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedPreview, setScrapedPreview] = useState(null);

  // Batch selection state in Pending queue
  const [selectedIds, setSelectedIds] = useState([]);

  // Modal edit state for pending item
  const [editingItem, setEditingItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGoogleSheetModalOpen, setIsGoogleSheetModalOpen] = useState(false);

  // Nhập hàng loạt từ Google Sheets / File CSV
  const handleImportFromSheetOrCsv = (importedList) => {
    if (!Array.isArray(importedList) || importedList.length === 0) return;
    importedList.forEach(prod => {
      addPendingProduct(prod);
    });
    if (showToast) showToast(`Đã nạp thành công ${importedList.length} sản phẩm vào Hàng Chờ Duyệt!`, 'success');
  };

  const krwRate = rates?.KRW?.rate || 19.5;
  const serviceFee = rates?.serviceFeePercent || 5;

  // Lọc và sắp xếp hàng chờ duyệt
  const filteredPending = useMemo(() => {
    let result = (pendingProducts || []).filter(p => {
      const matchCat = selectedCategory === 'all' || p.category === selectedCategory || p.subCategory === selectedCategory;
      const matchSearch = !searchTerm.trim() ||
        (p.name && p.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.brand && p.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.goodsNo && p.goodsNo.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.nameKr && p.nameKr.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchCat && matchSearch;
    });

    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'foreignPrice' || sortField === 'price') {
        valA = a.foreignPrice || a.price || 0;
        valB = b.foreignPrice || b.price || 0;
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
  }, [pendingProducts, selectedCategory, searchTerm, sortField, sortOrder]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Toggle select item
  const handleToggleSelect = (e, goodsNo) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(goodsNo) ? prev.filter(id => id !== goodsNo) : [...prev, goodsNo]
    );
  };

  // Select all / Deselect all
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredPending.length && filteredPending.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPending.map(p => p.goodsNo));
    }
  };

  // Duyệt 1 sản phẩm 1-click
  const handleApproveSingle = (e, prod) => {
    if (e && e.stopPropagation) e.stopPropagation();
    approvePendingProduct(prod.goodsNo);
    if (showToast) showToast(`Đã duyệt và xuất bản "${prod.name}" lên website!`, 'success');
  };

  // Duyệt các mục đã chọn
  const handleApproveSelected = () => {
    if (selectedIds.length === 0) return;
    approveSelectedPendingProducts(selectedIds);
    if (showToast) showToast(`Đã duyệt thành công ${selectedIds.length} sản phẩm lên website!`, 'success');
    setSelectedIds([]);
  };

  // Duyệt tất cả
  const handleApproveAll = () => {
    if (pendingProducts.length === 0) return;
    if (window.confirm(`Bạn có chắc chắn muốn duyệt và xuất bản TẤT CẢ ${pendingProducts.length} sản phẩm lên website?`)) {
      approveAllPendingProducts();
      if (showToast) showToast(`Đã duyệt toàn bộ ${pendingProducts.length} sản phẩm lên website!`, 'success');
      setSelectedIds([]);
    }
  };

  // Từ chối / Xoá 1 sản phẩm chờ duyệt
  const handleRejectSingle = (goodsNo) => {
    rejectPendingProduct(goodsNo);
    setIsModalOpen(false);
    setSelectedIds(prev => prev.filter(id => id !== goodsNo));
    if (showToast) showToast('Đã xoá sản phẩm khỏi Hàng Chờ Duyệt!', 'info');
  };

  // Xoá hàng loạt
  const handleBatchReject = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`Bạn có chắc chắn muốn xoá ${selectedIds.length} sản phẩm đã chọn khỏi Hàng Chờ Duyệt?`)) {
      selectedIds.forEach(id => rejectPendingProduct(id));
      setSelectedIds([]);
      if (showToast) showToast(`Đã xoá ${selectedIds.length} sản phẩm khỏi Hàng Chờ Duyệt!`, 'info');
    }
  };

  // Mở modal sửa trước khi duyệt
  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  // Lưu chỉnh sửa cho sản phẩm chờ duyệt
  const handleSavePendingItem = (goodsNo, updatedData) => {
    updatePendingProduct(goodsNo, updatedData);
    if (showToast) showToast(`Đã cập nhật thông tin "${updatedData.name}" trong Hàng Chờ Duyệt!`, 'success');
  };

  // Duyệt & Đăng ngay từ modal
  const handleApproveFromModal = (goodsNo, updatedData) => {
    const cleanProduct = {
      ...updatedData,
      goodsNo: goodsNo,
      isPublished: true,
      status: 'published'
    };
    addProduct(cleanProduct);
    rejectPendingProduct(goodsNo);
    if (showToast) showToast(`Đã duyệt và xuất bản "${cleanProduct.name}" lên website!`, 'success');
  };

  // Sao chép mã SKU
  const handleCopySku = (e, sku) => {
    if (e && e.stopPropagation) e.stopPropagation();
    navigator.clipboard.writeText(sku);
    if (showToast) showToast(`Đã sao chép mã SKU: ${sku}`, 'success');
  };

  // Dynamic Category label helper (tự động hiển thị danh mục động cào được chuẩn xác)
  const getCategoryLabel = (cat) => {
    if (!cat) return 'Khác';
    return getClassifierCategoryLabel(cat, true) || cat;
  };

  // Xuất file CSV
  const handleExportCSV = () => {
    if (filteredPending.length === 0) {
      alert('Không có dữ liệu sản phẩm để xuất!');
      return;
    }

    const headers = ['Mã SKU', 'Tên Sản Phẩm', 'Tên Tiếng Hàn', 'Thương Hiệu', 'Ngành Hàng', 'Giá Won (KRW)', 'Giá VNĐ'];
    const rows = filteredPending.map(p => {
      const won = p.foreignPrice || p.price || 0;
      const vnd = Math.round(won * krwRate * (1 + serviceFee / 100));
      return [
        `"${p.goodsNo || ''}"`,
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.nameKr || '').replace(/"/g, '""')}"`,
        `"${p.brand || ''}"`,
        `"${getCategoryLabel(p.category)}"`,
        won,
        vnd
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Tavy_Hang_Cho_Duyet_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (showToast) showToast('Đã xuất file Excel / CSV thành công!', 'success');
  };

  // Xử lý cào sản phẩm từ URL
  const handleScrapeProduct = async (e) => {
    if (e) e.preventDefault();
    if (!sourcingInput.trim() || isScraping) return;

    setIsScraping(true);
    setScrapedPreview(null);

    const input = sourcingInput.trim();
    try {
      if (/kgc|nhmall|nonghyup|naver|smartstore|brand\.naver|health|ginseng/i.test(input)) {
        const item = await scrapeKoreanHealthProduct(input);
        setScrapedPreview(item);
        if (showToast) showToast('Đã bóc tách thành công sản phẩm từ Hàn Quốc!', 'success');
      } else {
        const res = await scrapeProductMetadata(input);
        if (res.success && res.product) {
          setScrapedPreview(res.product);
          if (showToast) showToast('Đã bóc tách thành công sản phẩm từ Olive Young!', 'success');
        } else {
          const item = await scrapeKoreanHealthProduct(input);
          setScrapedPreview(item);
        }
      }
    } catch (err) {
      if (showToast) showToast(`Lỗi khi cào dữ liệu: ${err.message}`, 'error');
    } finally {
      setIsScraping(false);
    }
  };

  // Lưu vào Hàng Chờ Duyệt (Mặc định chuẩn)
  const handleSaveToPendingQueue = (prod) => {
    if (!prod) return;
    addPendingProduct({
      goodsNo: prod.goodsNo || `P-${Date.now()}`,
      name: prod.name,
      nameKr: prod.koreanTitle || prod.nameKr || '',
      brand: prod.brand,
      category: prod.category || 'ginseng',
      foreignPrice: Number(prod.foreignPrice) || Number(prod.price) || 0,
      price: Number(prod.foreignPrice) || Number(prod.price) || 0,
      productImage: prod.productImage,
      images: prod.images || (prod.productImage ? [prod.productImage] : []),
      rating: Number(prod.rating) || 0,
      reviewsCount: Number(prod.reviewsCount) || 0,
      origin: prod.origin || 'Hàn Quốc',
      description: prod.description || '',
      usage: prod.usage || '',
      activeIngredients: prod.activeIngredients || [],
      isPublished: false,
      status: 'pending',
      scrapedAt: new Date().toISOString()
    });
    if (showToast) showToast(`Đã lưu "${prod.name}" vào Hàng Chờ Duyệt!`, 'success');
    setScrapedPreview(null);
    setSourcingInput('');
    setActiveSubTab('pending');
  };

  // Duyệt & Đăng ngay (1-click bypass)
  const handleDirectPublish = (prod) => {
    if (!prod) return;
    addProduct({
      goodsNo: prod.goodsNo || `P-${Date.now()}`,
      name: prod.name,
      nameKr: prod.koreanTitle || prod.nameKr || '',
      brand: prod.brand,
      category: prod.category || 'ginseng',
      foreignPrice: Number(prod.foreignPrice) || Number(prod.price) || 0,
      price: Number(prod.foreignPrice) || Number(prod.price) || 0,
      productImage: prod.productImage,
      images: prod.images || (prod.productImage ? [prod.productImage] : []),
      rating: Number(prod.rating) || 0,
      reviewsCount: Number(prod.reviewsCount) || 0,
      origin: prod.origin || 'Hàn Quốc',
      description: prod.description || '',
      usage: prod.usage || '',
      activeIngredients: prod.activeIngredients || [],
      isVerifiedHealthFood: true,
      isGmpCertified: true,
      isPublished: true,
      status: 'published'
    });
    if (showToast) showToast(`Đã đăng "${prod.name}" lên Kho Live thành công!`, 'success');
    setScrapedPreview(null);
    setSourcingInput('');
  };

  // Nạp nhanh bộ sưu tập vào Hàng Chờ Duyệt
  const handleBatchImportToPending = (type = 'all') => {
    let pool = [...VERIFIED_KOREAN_HEALTH_CATALOG];
    if (type === 'ginseng') pool = pool.filter(p => p.category === 'ginseng');
    else if (type === 'supplements') pool = pool.filter(p => p.category === 'supplements');
    else if (type === 'kgc') pool = pool.filter(p => p.brand.includes('KGC') || p.brand.includes('CheongKwanJang'));
    else if (type === 'naver') pool = pool.filter(p => p.source.includes('Naver') || (p.originalUrl && p.originalUrl.includes('naver.com')));

    let count = 0;
    pool.forEach(item => {
      addPendingProduct({
        goodsNo: item.goodsNo,
        name: item.name,
        nameKr: item.koreanTitle || '',
        brand: item.brand,
        category: item.category,
        foreignPrice: item.foreignPrice,
        price: item.foreignPrice,
        productImage: item.productImage,
        images: item.images,
        rating: item.rating,
        reviewsCount: item.reviewsCount,
        origin: item.origin,
        description: item.description,
        usage: item.usage,
        activeIngredients: item.activeIngredients,
        isPublished: false,
        status: 'pending',
        scrapedAt: new Date().toISOString()
      });
      count++;
    });

    if (showToast) showToast(`Đã nạp ${count} sản phẩm ${type.toUpperCase()} vào Hàng Chờ Duyệt!`, 'success');
    setActiveSubTab('pending');
  };

  // ════════════════════════════════════════════════════════════════════════
  // AUTO-SCHEDULER & PRICE WATCHER STATE & HANDLERS
  // ════════════════════════════════════════════════════════════════════════
  const [schedulerConfig, setSchedulerConfig] = useState(() => getPriceSyncConfig());
  const [isSyncingPrices, setIsSyncingPrices] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, currentName: '', percent: 0 });
  const [terminalLogs, setTerminalLogs] = useState(() => {
    const cfg = getPriceSyncConfig();
    return (cfg.logs || []).slice(0, 40).map(l => ({
      id: l.id || `LOG-${Math.random()}`,
      time: l.timestamp ? new Date(l.timestamp).toLocaleTimeString('vi-VN') : '',
      text: `${l.changeType === 'drop' ? '🔻 GIẢM GIÁ' : '🔺 TĂNG GIÁ'} [${l.brand || 'Korea'}] ${l.name}: ${Number(l.oldPrice).toLocaleString()}₩ ➔ ${Number(l.newPrice).toLocaleString()}₩ (${l.changePercent > 0 ? '+' : ''}${l.changePercent}%)`,
      type: l.changeType === 'drop' ? 'success' : 'alert'
    }));
  });
  const [priceHistoryModalItem, setPriceHistoryModalItem] = useState(null);
  const [alertFilter, setAlertFilter] = useState('all'); // 'all' | 'drops' | 'increases'

  // Toggle Scheduler Auto-Run
  const handleToggleScheduler = () => {
    const newEnabled = !schedulerConfig.enabled;
    const updated = { ...schedulerConfig, enabled: newEnabled };
    setSchedulerConfig(updated);
    savePriceSyncConfig(updated);
    if (showToast) {
      showToast(newEnabled ? 'Đã BẬT Auto-Scheduler giám sát giá tự động!' : 'Đã TẮT Auto-Scheduler.', newEnabled ? 'success' : 'info');
    }
  };

  // Change Interval Hours
  const handleChangeInterval = (hours) => {
    const updated = { ...schedulerConfig, intervalHours: hours, intervalMins: hours * 60 };
    setSchedulerConfig(updated);
    savePriceSyncConfig(updated);
    if (showToast) showToast(`Đã thiết lập chu kỳ quét: Mỗi ${hours} Giờ`, 'info');
  };

  // Run Now Instant Sync
  const handleRunSchedulerNow = async () => {
    if (isSyncingPrices) return;
    setIsSyncingPrices(true);
    setSyncProgress({ current: 0, total: products?.length || 0, currentName: 'Khởi động...', percent: 0 });

    const newTerminalLogs = [...terminalLogs];
    const addLog = (msg, type = 'info') => {
      const entry = {
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        time: new Date().toLocaleTimeString('vi-VN'),
        text: msg,
        type: type
      };
      newTerminalLogs.unshift(entry);
      setTerminalLogs([...newTerminalLogs].slice(0, 60));
    };

    addLog(`🚀 Bắt đầu quét & đối chiếu giá cho ${products?.length || 0} sản phẩm trong kho hàng...`, 'info');

    try {
      const res = await executeAutoPriceSync(products || [], updateProduct, {
        rates,
        onProgress: (current, total, name) => {
          const percent = total > 0 ? Math.round((current / total) * 100) : 0;
          setSyncProgress({ current, total, currentName: name, percent });
        },
        onLog: (msg, type) => {
          addLog(msg, type);
        }
      });

      setSchedulerConfig(getPriceSyncConfig());

      if (res.success) {
        if (showToast) showToast(res.message, 'success');
      } else {
        if (showToast) showToast(res.message || 'Quét giá hoàn tất', 'info');
      }
    } catch (err) {
      addLog(`❌ Lỗi phiên đồng bộ: ${err.message}`, 'alert');
      if (showToast) showToast(`Lỗi đồng bộ: ${err.message}`, 'error');
    } finally {
      setIsSyncingPrices(false);
      setSyncProgress({ current: 0, total: 0, currentName: '', percent: 100 });
    }
  };

  // Clear Terminal Logs
  const handleClearLogs = () => {
    clearPriceSyncLogs();
    setTerminalLogs([]);
    setSchedulerConfig(prev => ({ ...prev, logs: [] }));
    if (showToast) showToast('Đã làm sạch lịch sử log!', 'info');
  };

  // Lọc sản phẩm có biến động giá
  const priceAlertProducts = useMemo(() => {
    const list = getRecentPriceAlerts(products || []);
    if (alertFilter === 'drops') {
      return list.filter(p => p.priceChangeAlert?.changeType === 'drop' || (p.priceHistory && p.priceHistory[0]?.changeType === 'drop'));
    }
    if (alertFilter === 'increases') {
      return list.filter(p => p.priceChangeAlert?.changeType === 'increase' || (p.priceHistory && p.priceHistory[0]?.changeType === 'increase'));
    }
    return list;
  }, [products, alertFilter]);

  // Danh mục động được trích xuất từ dữ liệu sản phẩm cào về
  const dynamicCategories = useMemo(() => {
    const defaultCats = [
      { id: 'all', label: 'Tất Cả' },
      { id: 'ginseng', label: 'Sâm Nấm' },
      { id: 'supplements', label: 'TPCN' },
      { id: 'cosmetics', label: 'Mỹ Phẩm' }
    ];
    const presentCats = new Set();
    (pendingProducts || []).forEach(p => {
      if (p.category && !['all', 'ginseng', 'supplements', 'cosmetics'].includes(p.category)) {
        presentCats.add(p.category);
      }
      if (p.subCategory && !['all', 'ginseng', 'supplements', 'cosmetics'].includes(p.subCategory)) {
        presentCats.add(p.subCategory);
      }
    });
    const extra = Array.from(presentCats).map(c => ({ id: c, label: getCategoryLabel(c) }));
    return [...defaultCats, ...extra];
  }, [pendingProducts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Sub-view Navigation Return Button (when not in pending mode) */}
      {activeSubTab !== 'pending' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: isDark ? '#1E293B' : '#FFF',
          borderRadius: '12px',
          padding: '10px 16px',
          border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
        }}>
          <button
            onClick={() => setActiveSubTab('pending')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isDark ? '#334155' : '#F1F5F9',
              color: isDark ? '#F8FAFC' : '#0F172A',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={16} />
            <span>← Quay lại Kho Hàng Chờ Duyệt ({pendingProducts.length})</span>
          </button>
        </div>
      )}

      {/* SUB-VIEW 1: RESEARCH TAB (Only rendered if user explicitly selects research) */}
      {activeSubTab === 'research' && (
        <AdminProductResearchTab
          isDark={isDark}
          rates={rates}
          addPendingProduct={addPendingProduct}
          addProduct={addProduct}
          approvePendingProduct={approvePendingProduct}
          showToast={showToast}
          onNavigateToPending={() => setActiveSubTab('pending')}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MAIN VIEW: KHO HÀNG CHỜ DUYỆT (PENDING APPROVAL QUEUE - DEFAULT) */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'pending' && (
        <div id="pending-queue-section" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                <h2 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                  Kho Hàng Chờ Duyệt ({pendingProducts.length})
                </h2>
                <span style={{
                  backgroundColor: isDark ? '#78350F' : '#FEF3C7',
                  color: isDark ? '#FDE68A' : '#D97706',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: isDark ? '1px solid #B45309' : '1px solid #FDE68A'
                }}>
                  CHƯA HIỂN THỊ TRÊN WEB
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.82rem' }}>
                Bảng danh sách chuẩn Excel: Nhấp vào dòng để <strong>Chỉnh Sửa Nhanh</strong> thông tin và giá trước khi bấm <strong>Duyệt</strong> đưa lên website.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* View Switcher: Table vs Grid */}
              <div style={{
                display: 'flex',
                backgroundColor: isDark ? '#0F172A' : '#F1F5F9',
                padding: '3px',
                borderRadius: '8px',
                border: isDark ? '1px solid #334155' : '1px solid #CBD5E1'
              }}>
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
                    fontWeight: viewMode === 'table' ? 800 : 600,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    boxShadow: viewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  <Table size={14} />
                  <span>Bảng Excel</span>
                </button>

                <button
                  onClick={() => setViewMode('grid')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: viewMode === 'grid' ? (isDark ? '#334155' : '#FFF') : 'transparent',
                    color: viewMode === 'grid' ? (isDark ? '#F8FAFC' : '#0F172A') : (isDark ? '#94A3B8' : '#64748B'),
                    fontWeight: viewMode === 'grid' ? 800 : 600,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  <LayoutGrid size={14} />
                  <span>Lưới Thẻ</span>
                </button>
              </div>

              {/* Export CSV Button */}
              <button
                onClick={handleExportCSV}
                style={{
                  backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                  color: isDark ? '#F8FAFC' : '#0F172A',
                  border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Download size={14} color="#10B981" />
                <span>Xuất Excel/CSV</span>
              </button>

              {/* Import Google Sheets / CSV Button */}
              <button
                onClick={() => setIsGoogleSheetModalOpen(true)}
                style={{
                  backgroundColor: isDark ? '#064E3B' : '#ECFDF5',
                  color: '#10B981',
                  border: isDark ? '1px solid #059669' : '1px solid #A7F3D0',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FileSpreadsheet size={14} color="#10B981" />
                <span>Nhập Google Sheets / CSV</span>
              </button>

              {/* Go to Scraper tab */}
              <button
                onClick={() => setActiveSubTab('scraper')}
                style={{
                  backgroundColor: '#10B981',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                }}
              >
                <Zap size={15} />
                <span>Cào Link Mới</span>
              </button>

              {/* Approve All Pending Products to Live Store */}
              {pendingProducts.length > 0 && (
                <button
                  onClick={handleApproveAll}
                  style={{
                    backgroundColor: '#7A4B9E',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(122, 75, 158, 0.25)'
                  }}
                >
                  <CheckCheck size={16} />
                  <span>Duyệt Tất Cả ({pendingProducts.length}) Lên Web</span>
                </button>
              )}
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
              {dynamicCategories.map(cat => (
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
                  onClick={handleApproveSelected}
                  style={{ backgroundColor: '#10B981', color: '#FFF', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <Check size={14} />
                  <span>Duyệt {selectedIds.length} Sản Phẩm Lên Web</span>
                </button>

                <button
                  onClick={handleBatchReject}
                  style={{ backgroundColor: '#DC2626', color: '#FFF', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  Xoá
                </button>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════ */}
          {/* EXCEL SPREADSHEET TABLE VIEW (MẶC ĐỊNH)                        */}
          {/* ════════════════════════════════════════════════════════════ */}
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
                          checked={selectedIds.length === filteredPending.length && filteredPending.length > 0}
                          onChange={handleToggleSelectAll}
                          style={{ width: '15px', height: '15px', accentColor: '#2563EB', cursor: 'pointer' }}
                        />
                      </th>
                      <th style={{ width: '45px', padding: '10px 8px', textAlign: 'center', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>#</th>
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

                      <th style={{ width: '140px', padding: '10px 12px', textAlign: 'center' }}>Thao Tác</th>
                    </tr>
                  </thead>

                  {/* Excel Table Body */}
                  <tbody>
                    {filteredPending.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: '48px 24px', textAlign: 'center', color: isDark ? '#64748B' : '#94A3B8' }}>
                          {pendingProducts.length === 0 ? (
                            <>
                              <CheckCheck size={40} style={{ margin: '0 auto 12px auto', color: '#10B981' }} />
                              <div style={{ fontWeight: 800, fontSize: '1rem', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: '6px' }}>
                                Tuyệt vời! Toàn bộ sản phẩm đã được duyệt và xuất bản lên website
                              </div>
                              <p style={{ margin: 0, fontSize: '0.82rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                                Không còn sản phẩm nào tồn đọng trong Hàng Chờ Duyệt. Khi cào thêm link mới, sản phẩm sẽ hiển thị tại đây.
                              </p>
                            </>
                          ) : (
                            <>
                              <ShoppingBag size={36} style={{ margin: '0 auto 8px auto', opacity: 0.4 }} />
                              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: isDark ? '#CBD5E1' : '#475569' }}>
                                Không tìm thấy sản phẩm nào phù hợp với bộ lọc tìm kiếm
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredPending.map((prod, idx) => {
                        const won = prod.foreignPrice || prod.price || 0;
                        const vnd = Math.round(won * krwRate * (1 + serviceFee / 100));
                        const isSelected = selectedIds.includes(prod.goodsNo);

                        return (
                          <tr
                            key={prod.goodsNo || prod.id}
                            onClick={() => handleOpenEdit(prod)}
                            style={{
                              backgroundColor: isSelected ? (isDark ? '#1E3A8A' : '#EFF6FF') : (idx % 2 === 1 ? (isDark ? '#162032' : '#F8FAFC') : (isDark ? '#1E293B' : '#FFFFFF')),
                              borderBottom: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                              cursor: 'pointer',
                              transition: 'background 0.1s'
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

                            {/* STT */}
                            <td style={{ padding: '8px', textAlign: 'center', color: isDark ? '#64748B' : '#94A3B8', fontWeight: 600, borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>
                              {idx + 1}
                            </td>

                            {/* Thumbnail Image */}
                            <td style={{ padding: '6px 8px', textAlign: 'center', borderRight: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>
                              <div style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '6px',
                                backgroundColor: isDark ? '#0F172A' : '#FFF',
                                border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                                overflow: 'hidden',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                <img
                                  src={prod.productImage || prod.thumbnailUrl || prod.thumbnail_url || ''}
                                  alt=""
                                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                  onError={(e) => {
                                    if (e.target.dataset.hasError) return;
                                    e.target.dataset.hasError = 'true';
                                    if (prod.thumbnail_url && e.target.src !== prod.thumbnail_url) {
                                      e.target.src = prod.thumbnail_url;
                                    } else if (prod.thumbnailUrl && e.target.src !== prod.thumbnailUrl) {
                                      e.target.src = prod.thumbnailUrl;
                                    } else {
                                      e.target.style.opacity = '0.3';
                                    }
                                  }}
                                />
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
                              {((prod.photoReviews && prod.photoReviews.length > 0) || (prod.images && prod.images.length > 1)) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                                  {prod.photoReviews && prod.photoReviews.length > 0 && (
                                    <span style={{
                                      fontSize: '0.66rem',
                                      fontWeight: 800,
                                      color: '#10B981',
                                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                                      border: isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #A7F3D0',
                                      padding: '1px 6px',
                                      borderRadius: '6px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px'
                                    }}>
                                      <Camera size={10} />
                                      {prod.photoReviews.length} review thật
                                    </span>
                                  )}
                                  {prod.images && prod.images.length > 1 && (
                                    <span style={{
                                      fontSize: '0.66rem',
                                      fontWeight: 700,
                                      color: '#0284C7',
                                      backgroundColor: isDark ? 'rgba(2, 132, 199, 0.15)' : '#F0F9FF',
                                      border: isDark ? '1px solid rgba(2, 132, 199, 0.3)' : '1px solid #BAE6FD',
                                      padding: '1px 6px',
                                      borderRadius: '6px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px'
                                    }}>
                                      <ImageIcon size={10} />
                                      {prod.images.length} ảnh HD
                                    </span>
                                  )}
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
                              <div style={{ fontWeight: 800, color: isDark ? '#38BDF8' : '#1D4ED8', fontSize: '0.88rem' }}>
                                {vnd.toLocaleString('vi-VN')} đ
                              </div>
                              <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                                {won.toLocaleString('vi-VN')} ₩
                              </div>
                            </td>

                            {/* Action Buttons */}
                            <td style={{ padding: '6px 8px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                <button
                                  title="Duyệt xuất bản lên website"
                                  onClick={(e) => handleApproveSingle(e, prod)}
                                  style={{
                                    backgroundColor: '#10B981',
                                    color: '#FFF',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  <Check size={12} />
                                  <span>Duyệt</span>
                                </button>

                                <button
                                  title="Chỉnh sửa trước khi duyệt"
                                  onClick={() => handleOpenEdit(prod)}
                                  style={{
                                    backgroundColor: '#2563EB',
                                    color: '#FFF',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  <Edit3 size={11} />
                                  <span>Sửa</span>
                                </button>

                                <button
                                  title="Xoá khỏi Hàng Chờ Duyệt"
                                  onClick={() => handleRejectSingle(prod.goodsNo || prod.id)}
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
                  Hiển thị <strong>{filteredPending.length}</strong> / <strong>{pendingProducts.length}</strong> sản phẩm chờ duyệt
                </div>
                <div>
                  Tỷ giá quy đổi: <strong>1 KRW = {krwRate} VNĐ</strong> (Phí {serviceFee}%)
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════ */}
          {/* GRID VIEW (KHI CHỌN XEM DẠNG THẺ)                              */}
          {/* ════════════════════════════════════════════════════════════ */}
          {viewMode === 'grid' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px'
            }}>
              {filteredPending.length === 0 ? (
                <div style={{
                  gridColumn: '1 / -1',
                  padding: '50px 20px',
                  textAlign: 'center',
                  backgroundColor: isDark ? '#1E293B' : '#FFF',
                  borderRadius: '16px',
                  border: isDark ? '1px dashed #334155' : '1px dashed #CBD5E1',
                  color: isDark ? '#64748B' : '#94A3B8'
                }}>
                  {pendingProducts.length === 0 ? (
                    <>
                      <CheckCheck size={44} style={{ margin: '0 auto 12px auto', color: '#10B981' }} />
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: isDark ? '#F8FAFC' : '#0F172A', marginBottom: '6px' }}>
                        Tuyệt vời! Toàn bộ sản phẩm đã được duyệt và xuất bản lên website
                      </div>
                      <p style={{ margin: 0, fontSize: '0.84rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                        Không còn sản phẩm nào tồn đọng trong Hàng Chờ Duyệt.
                      </p>
                    </>
                  ) : (
                    <>
                      <ShoppingBag size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: isDark ? '#CBD5E1' : '#475569' }}>
                        Không tìm thấy sản phẩm nào phù hợp với bộ lọc tìm kiếm
                      </div>
                    </>
                  )}
                </div>
              ) : (
                filteredPending.map(prod => {
                  const won = prod.foreignPrice || prod.price || 0;
                  const vnd = Math.round(won * krwRate * (1 + serviceFee / 100));
                  const isSelected = selectedIds.includes(prod.goodsNo);

                  return (
                    <div
                      key={prod.goodsNo || prod.id}
                      onClick={() => handleOpenEdit(prod)}
                      style={{
                        backgroundColor: isDark ? '#1E293B' : '#FFF',
                        borderRadius: '14px',
                        border: isSelected ? '2px solid #38BDF8' : (isDark ? '1px solid #334155' : '1px solid #E2E8F0'),
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        position: 'relative'
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
                          src={prod.productImage || prod.thumbnailUrl || prod.thumbnail_url || ''}
                          alt={prod.name}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          onError={(e) => {
                            if (e.target.dataset.hasError) return;
                            e.target.dataset.hasError = 'true';
                            if (prod.thumbnail_url && e.target.src !== prod.thumbnail_url) {
                              e.target.src = prod.thumbnail_url;
                            } else if (prod.thumbnailUrl && e.target.src !== prod.thumbnailUrl) {
                              e.target.src = prod.thumbnailUrl;
                            } else {
                              e.target.style.opacity = '0.3';
                            }
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

                        <span style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          backgroundColor: isDark ? '#78350F' : '#FEF3C7',
                          color: isDark ? '#FDE68A' : '#D97706',
                          fontSize: '0.65rem',
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}>
                          CHỜ DUYỆT
                        </span>

                        {prod.photoReviews && prod.photoReviews.length > 0 && (
                          <span style={{
                            position: 'absolute',
                            bottom: '8px',
                            left: '8px',
                            backgroundColor: 'rgba(16, 185, 129, 0.9)',
                            color: '#FFF',
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                          }}>
                            <Camera size={11} /> {prod.photoReviews.length} review
                          </span>
                        )}
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
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: prod.category === 'ginseng' ? '#34D399' : (prod.category === 'supplements' ? '#FBBF24' : '#60A5FA'),
                            backgroundColor: prod.category === 'ginseng' ? (isDark ? '#064E3B' : '#ECFDF5') : (prod.category === 'supplements' ? (isDark ? '#78350F' : '#FFFBEB') : (isDark ? '#1E3A8A' : '#EFF6FF')),
                            border: isDark ? '1px solid #334155' : 'none',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            {getCategoryLabel(prod.category)}
                          </span>
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
                        <button
                          onClick={(e) => handleApproveSingle(e, prod)}
                          style={{
                            flex: 1,
                            backgroundColor: '#10B981',
                            color: '#FFF',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <Check size={12} />
                          <span>Duyệt Lên Web</span>
                        </button>

                        <button
                          onClick={() => handleOpenEdit(prod)}
                          style={{
                            backgroundColor: '#2563EB',
                            color: '#FFF',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 10px',
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
                          onClick={() => handleRejectSingle(prod.goodsNo || prod.id)}
                          style={{
                            backgroundColor: isDark ? '#450A0A' : '#FEE2E2',
                            color: '#EF4444',
                            border: isDark ? '1px solid #7F1D1D' : 'none',
                            borderRadius: '6px',
                            padding: '6px 8px',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* SUB-VIEW 2: CÀO & NẠP DỮ LIỆU HÀN QUỐC                           */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'scraper' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Smart Scraper Input Bar */}
          <div style={{
            backgroundColor: '#0F172A',
            color: '#FFF',
            borderRadius: '16px',
            padding: '24px',
            border: isDark ? '1px solid #334155' : 'none',
            boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ backgroundColor: '#10B981', color: '#FFF', fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
                ĐA NỀN TẢNG
              </span>
              <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                Naver Brand Store • KGC CheongKwanJang • Nonghyup • Olive Young
              </span>
            </div>

            <h2 style={{ fontSize: '1.3rem', fontWeight: 900, margin: '0 0 6px 0' }}>
              Trung Tâm Tìm & Nạp Hàng Hàn Quốc Chuẩn Y Tế
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#CBD5E1', margin: '0 0 16px 0' }}>
              Dán đường dẫn sản phẩm bất kỳ để tự động bóc tách ảnh HD, giá gốc và thành phần dinh dưỡng.
            </p>

            <form onSubmit={handleScrapeProduct} style={{ display: 'flex', gap: '8px', maxWidth: '700px' }}>
              <input
                type="text"
                placeholder="Dán link Naver Brand Store, KGC, Nonghyup, Olive Young..."
                value={sourcingInput}
                onChange={(e) => setSourcingInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '1px solid #334155',
                  backgroundColor: '#1E293B',
                  color: '#FFF',
                  fontSize: '0.88rem',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={isScraping || !sourcingInput.trim()}
                style={{
                  backgroundColor: '#10B981',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0 20px',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: isScraping ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isScraping ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
                <span>{isScraping ? 'Đang bóc tách...' : 'Cào Dữ Liệu'}</span>
              </button>
            </form>

            {/* Quick Batch Sourcing Buttons */}
            <div style={{ marginTop: '18px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Nạp nhanh bộ sưu tập vào Hàng Chờ Duyệt:</span>
              <button
                onClick={() => handleBatchImportToPending('naver')}
                style={{ backgroundColor: '#03C75A', color: '#FFF', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Naver Brand Store
              </button>
              <button
                onClick={() => handleBatchImportToPending('kgc')}
                style={{ backgroundColor: '#047857', color: '#FFF', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
              >
                + Top Sâm KGC
              </button>
              <button
                onClick={() => handleBatchImportToPending('ginseng')}
                style={{ backgroundColor: '#047857', color: '#FFF', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
              >
                + Nấm Nonghyup
              </button>
              <button
                onClick={() => handleBatchImportToPending('supplements')}
                style={{ backgroundColor: '#047857', color: '#FFF', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
              >
                + TPCN Quốc Dân
              </button>
              <button
                onClick={() => handleBatchImportToPending('all')}
                style={{ backgroundColor: '#F59E0B', color: '#000', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
              >
                Nhập Tất Cả Vào Hàng Chờ Duyệt
              </button>
            </div>
          </div>

          {/* Scraped Product Result Preview Card */}
          {scrapedPreview && (
            <div style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '16px',
              border: '2px solid #10B981',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.15)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={20} color="#10B981" />
                  <span style={{ fontWeight: 900, fontSize: '1rem', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                    KẾT QUẢ BÓC TÁCH THÀNH CÔNG
                  </span>
                </div>
                <button onClick={() => setScrapedPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#94A3B8' : '#64748B' }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr', gap: '20px' }}>
                {/* Image */}
                <div style={{ borderRadius: '10px', overflow: 'hidden', backgroundColor: isDark ? '#0F172A' : '#F8FAFC', border: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>
                  <img
                    src={scrapedPreview.productImage}
                    alt=""
                    style={{ width: '100%', height: '220px', objectFit: 'contain' }}
                  />
                </div>

                {/* Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '0.78rem', color: isDark ? '#CBD5E1' : '#64748B', fontWeight: 700 }}>
                    Thương hiệu: {scrapedPreview.brand} • Nguồn: {scrapedPreview.source || 'Hàn Quốc'}
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                    {scrapedPreview.name}
                  </h3>
                  {scrapedPreview.koreanTitle && (
                    <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                      Tên tiếng Hàn: {scrapedPreview.koreanTitle}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: isDark ? '#CBD5E1' : '#64748B' }}>Giá Won: </span>
                      <strong style={{ fontSize: '1rem', color: isDark ? '#F8FAFC' : '#0F172A' }}>{scrapedPreview.foreignPrice?.toLocaleString('vi-VN')} ₩</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: isDark ? '#CBD5E1' : '#64748B' }}>Giá về VN ước tính: </span>
                      <strong style={{ fontSize: '1.1rem', color: '#38BDF8' }}>
                        {(Math.round(scrapedPreview.foreignPrice * krwRate * (1 + serviceFee / 100))).toLocaleString('vi-VN')} đ
                      </strong>
                    </div>
                  </div>

                  {scrapedPreview.activeIngredients && scrapedPreview.activeIngredients.length > 0 && (
                    <div style={{ marginTop: '6px', fontSize: '0.78rem', color: isDark ? '#34D399' : '#059669', backgroundColor: isDark ? '#064E3B' : '#ECFDF5', border: isDark ? '1px solid #059669' : 'none', padding: '8px 12px', borderRadius: '8px' }}>
                      <strong>Hoạt chất chính:</strong> {scrapedPreview.activeIngredients.join(' | ')}
                    </div>
                  )}

                  {/* Actions for Scraped Item */}
                  <div style={{ marginTop: 'auto', paddingTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleSaveToPendingQueue(scrapedPreview)}
                      style={{
                        backgroundColor: '#F59E0B',
                        color: '#FFF',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '10px 18px',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Layers size={16} />
                      <span>Lưu Vào Hàng Chờ Duyệt (Khuyên Dùng)</span>
                    </button>

                    <button
                      onClick={() => handleDirectPublish(scrapedPreview)}
                      style={{
                        backgroundColor: '#10B981',
                        color: '#FFF',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '10px 18px',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Check size={16} />
                      <span>Duyệt & Đăng Lên Web Ngay</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* SUB-VIEW 3: AUTO-BOT SCHEDULER & GIÁM SÁT BIẾN ĐỘNG GIÁ          */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'scheduler' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top 4 Metrics Summary Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px'
          }}>
            {/* Card 1: Scheduler Status */}
            <div style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '14px',
              padding: '18px',
              border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', color: isDark ? '#94A3B8' : '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>
                  Trạng Thái Auto-Bot
                </span>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: schedulerConfig.enabled ? (isDark ? 'rgba(16,185,129,0.2)' : '#ECFDF5') : (isDark ? 'rgba(148,163,184,0.2)' : '#F1F5F9'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Bot size={18} color={schedulerConfig.enabled ? '#10B981' : '#94A3B8'} />
                </div>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: schedulerConfig.enabled ? '#10B981' : (isDark ? '#CBD5E1' : '#64748B') }}>
                {schedulerConfig.enabled ? 'Đang Hoạt Động (ON)' : 'Tạm Dừng (OFF)'}
              </div>
              <div style={{ fontSize: '0.74rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                Chu kỳ: <strong>Mỗi {schedulerConfig.intervalHours || 1} Giờ</strong> • Chạy cuối: {schedulerConfig.lastSyncTime ? new Date(schedulerConfig.lastSyncTime).toLocaleTimeString('vi-VN') : 'Chưa chạy'}
              </div>
            </div>

            {/* Card 2: Monitored Products */}
            <div style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '14px',
              padding: '18px',
              border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', color: isDark ? '#94A3B8' : '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>
                  Kho Hàng Theo Dõi
                </span>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: isDark ? 'rgba(56,189,248,0.2)' : '#E0F2FE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Activity size={18} color="#0284C7" />
                </div>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                {products?.length || 0} Sản Phẩm
              </div>
              <div style={{ fontSize: '0.74rem', color: '#0284C7', fontWeight: 700 }}>
                100% Neo Giá Trực Tiếp Olive Young
              </div>
            </div>

            {/* Card 3: Price Drops (Sale) */}
            <div style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '14px',
              padding: '18px',
              border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', color: isDark ? '#94A3B8' : '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>
                  Ưu Đãi Giảm Giá (Sale)
                </span>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: isDark ? 'rgba(16,185,129,0.2)' : '#ECFDF5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <TrendingDown size={18} color="#10B981" />
                </div>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#10B981' }}>
                {priceAlertProducts.filter(p => p.priceChangeAlert?.changeType === 'drop' || (p.priceHistory && p.priceHistory[0]?.changeType === 'drop')).length} Sản Phẩm
              </div>
              <div style={{ fontSize: '0.74rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                Phát hiện giảm giá $\ge 1\%$ từ Hàn Quốc
              </div>
            </div>

            {/* Card 4: Price Increases */}
            <div style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '14px',
              padding: '18px',
              border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', color: isDark ? '#94A3B8' : '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>
                  Biến Động Tăng Giá
                </span>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: isDark ? 'rgba(245,158,11,0.2)' : '#FEF3C7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <TrendingUp size={18} color="#F59E0B" />
                </div>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#F59E0B' }}>
                {priceAlertProducts.filter(p => p.priceChangeAlert?.changeType === 'increase' || (p.priceHistory && p.priceHistory[0]?.changeType === 'increase')).length} Sản Phẩm
              </div>
              <div style={{ fontSize: '0.74rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                Đã tự động tính toán lại giá VNĐ
              </div>
            </div>
          </div>

          {/* Scheduler Control Panel Bar */}
          <div style={{
            backgroundColor: isDark ? '#1E293B' : '#FFF',
            borderRadius: '16px',
            padding: '20px 24px',
            border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              {/* Toggle Switch */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={handleToggleScheduler}
                  style={{
                    backgroundColor: schedulerConfig.enabled ? '#10B981' : (isDark ? '#334155' : '#CBD5E1'),
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '24px',
                    padding: '8px 16px',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Bot size={16} />
                  <span>{schedulerConfig.enabled ? 'Auto-Scheduler: ĐANG BẬT' : 'Auto-Scheduler: ĐÃ TẮT'}</span>
                </button>
              </div>

              {/* Cycle Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} color={isDark ? '#94A3B8' : '#64748B'} />
                <span style={{ fontSize: '0.82rem', color: isDark ? '#CBD5E1' : '#475569', fontWeight: 700 }}>
                  Chu kỳ quét:
                </span>
                <select
                  value={schedulerConfig.intervalHours || 1}
                  onChange={(e) => handleChangeInterval(parseInt(e.target.value, 10))}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                    backgroundColor: isDark ? '#0F172A' : '#FFF',
                    color: isDark ? '#F8FAFC' : '#0F172A',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value={1}>Mỗi 1 Giờ (Khuyên Dùng)</option>
                  <option value={6}>Mỗi 6 Giờ</option>
                  <option value={12}>Mỗi 12 Giờ</option>
                  <option value={24}>Mỗi 24 Giờ</option>
                </select>
              </div>
            </div>

            {/* Run Now & Clear Logs Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={handleClearLogs}
                style={{
                  backgroundColor: 'transparent',
                  color: isDark ? '#94A3B8' : '#64748B',
                  border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Làm Sạch Log
              </button>

              <button
                onClick={handleRunSchedulerNow}
                disabled={isSyncingPrices}
                style={{
                  backgroundColor: isSyncingPrices ? '#64748B' : '#10B981',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 22px',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  cursor: isSyncingPrices ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                <RefreshCw size={16} className={isSyncingPrices ? 'animate-spin' : ''} />
                <span>{isSyncingPrices ? 'Đang đồng bộ...' : '⚡ Đồng Bộ Giá Ngay (Run Now)'}</span>
              </button>
            </div>
          </div>

          {/* Live Progress Bar Banner */}
          {isSyncingPrices && (
            <div style={{
              backgroundColor: isDark ? '#0F172A' : '#F0FDF4',
              border: '2px solid #10B981',
              borderRadius: '14px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#10B981', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RefreshCw size={16} className="animate-spin" />
                  Đang quét và đối chiếu giá: {syncProgress.currentName || 'Đang chuẩn bị...'}
                </span>
                <span style={{ fontSize: '0.86rem', fontWeight: 900, color: '#10B981' }}>
                  {syncProgress.current} / {syncProgress.total} ({syncProgress.percent}%)
                </span>
              </div>
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: isDark ? '#1E293B' : '#DCFCE7',
                borderRadius: '999px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${syncProgress.percent}%`,
                  height: '100%',
                  backgroundColor: '#10B981',
                  borderRadius: '999px',
                  transition: 'width 0.2s ease'
                }} />
              </div>
            </div>
          )}

          {/* Two-Column Grid: Live Terminal Logs + Price Volatility Table */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 420px) 1fr',
            gap: '20px',
            alignItems: 'start'
          }}>
            {/* Left Column: Live Terminal Log Console */}
            <div style={{
              backgroundColor: '#090D16',
              borderRadius: '16px',
              border: isDark ? '1px solid #334155' : '1px solid #1E293B',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1E293B', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Terminal size={16} color="#10B981" />
                  <span style={{ color: '#F8FAFC', fontWeight: 800, fontSize: '0.85rem' }}>
                    Live Terminal Logs ({terminalLogs.length})
                  </span>
                </div>
                <span style={{ fontSize: '0.7rem', color: '#64748B', fontFamily: 'monospace' }}>
                  PLAYWRIGHT BOT v20.0
                </span>
              </div>

              <div style={{
                height: '400px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontFamily: 'monospace',
                fontSize: '0.74rem',
                lineHeight: '1.4'
              }}>
                {terminalLogs.length === 0 ? (
                  <div style={{ color: '#64748B', textAlign: 'center', marginTop: '60px' }}>
                    Chưa có log hoạt động. Bấm "Run Now" để khởi chạy quét giá.
                  </div>
                ) : (
                  terminalLogs.map(log => {
                    let color = '#CBD5E1';
                    if (log.type === 'success') color = '#34D399';
                    else if (log.type === 'alert') color = '#FBBF24';
                    else if (log.type === 'warning') color = '#F87171';

                    return (
                      <div key={log.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <span style={{ color: '#64748B', flexShrink: 0 }}>[{log.time || '--:--:--'}]</span>
                        <span style={{ color, wordBreak: 'break-word' }}>{log.text}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Price Volatility & Alerts Table */}
            <div style={{
              backgroundColor: isDark ? '#1E293B' : '#FFF',
              borderRadius: '16px',
              border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sliders size={18} color="#10B981" />
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                    Bảng Giám Sát Biến Động Giá Kho Hàng
                  </h3>
                </div>

                {/* Filter Pills */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => setAlertFilter('all')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: alertFilter === 'all' ? '#10B981' : (isDark ? '#0F172A' : '#F1F5F9'),
                      color: alertFilter === 'all' ? '#FFF' : (isDark ? '#94A3B8' : '#64748B'),
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    Tất Cả ({getRecentPriceAlerts(products || []).length})
                  </button>
                  <button
                    onClick={() => setAlertFilter('drops')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: alertFilter === 'drops' ? '#10B981' : (isDark ? '#0F172A' : '#F1F5F9'),
                      color: alertFilter === 'drops' ? '#FFF' : (isDark ? '#94A3B8' : '#64748B'),
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    🔻 Giảm Giá
                  </button>
                  <button
                    onClick={() => setAlertFilter('increases')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: alertFilter === 'increases' ? '#F59E0B' : (isDark ? '#0F172A' : '#F1F5F9'),
                      color: alertFilter === 'increases' ? '#000' : (isDark ? '#94A3B8' : '#64748B'),
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    🔺 Tăng Giá
                  </button>
                </div>
              </div>

              {/* Table / List */}
              {priceAlertProducts.length === 0 ? (
                <div style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: isDark ? '#94A3B8' : '#64748B',
                  backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                  borderRadius: '12px',
                  border: isDark ? '1px dashed #334155' : '1px dashed #E2E8F0'
                }}>
                  <ShieldCheck size={32} color="#10B981" style={{ margin: '0 auto 8px auto' }} />
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                    Tất cả sản phẩm đều khớp giá 100%
                  </div>
                  <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>
                    Chưa phát hiện biến động giá bất thường $\ge 1\%$ trong các phiên quét gần đây.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
                  {priceAlertProducts.map(prod => {
                    const alert = prod.priceChangeAlert || {};
                    const isDrop = alert.changeType === 'drop' || (prod.priceHistory && prod.priceHistory[0]?.changeType === 'drop');
                    const changePct = alert.changePercent || (prod.priceHistory && prod.priceHistory[0]?.changePercent) || 0;
                    const foreignWon = prod.foreignPrice || prod.price || 0;
                    const vndPrice = prod.priceVnd || calculateVndPrice(foreignWon, krwRate, serviceFee);

                    return (
                      <div
                        key={prod.goodsNo}
                        style={{
                          backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                          borderRadius: '12px',
                          border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          flexWrap: 'wrap'
                        }}
                      >
                        {/* Thumbnail & Title */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '220px' }}>
                          <img
                            src={prod.productImage || (prod.images && prod.images[0]) || ''}
                            alt=""
                            style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'contain', backgroundColor: '#FFF' }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', fontWeight: 700 }}>
                              {prod.brand || 'Korea Brand'} • SKU: {prod.goodsNo}
                            </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                              {prod.name}
                            </span>
                          </div>
                        </div>

                        {/* Price & Badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                              <span style={{
                                backgroundColor: isDrop ? (isDark ? '#064E3B' : '#ECFDF5') : (isDark ? '#78350F' : '#FEF3C7'),
                                color: isDrop ? '#10B981' : '#F59E0B',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 900
                              }}>
                                {isDrop ? `🔻 ${Math.abs(changePct)}%` : `🔺 +${changePct}%`}
                              </span>
                              <strong style={{ fontSize: '0.92rem', color: isDark ? '#F8FAFC' : '#0F172A' }}>
                                {foreignWon.toLocaleString()} ₩
                              </strong>
                            </div>
                            <div style={{ fontSize: '0.76rem', color: '#38BDF8', fontWeight: 700, marginTop: '2px' }}>
                              {vndPrice.toLocaleString('vi-VN')} đ
                            </div>
                          </div>

                          {/* Action button */}
                          <button
                            onClick={() => setPriceHistoryModalItem(prod)}
                            style={{
                              backgroundColor: isDark ? '#1E293B' : '#FFF',
                              color: isDark ? '#CBD5E1' : '#475569',
                              border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                              borderRadius: '8px',
                              padding: '6px 12px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <History size={14} />
                            <span>Lịch Sử</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}



      {/* Price History Timeline Modal */}
      {priceHistoryModalItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: isDark ? '#1E293B' : '#FFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '85vh',
            overflowY: 'auto',
            border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{ padding: '18px 20px', borderBottom: isDark ? '1px solid #334155' : '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={18} color="#10B981" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                  Lịch Sử Biến Động Giá Bán
                </h3>
              </div>
              <button
                onClick={() => setPriceHistoryModalItem(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#94A3B8' : '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Product Summary */}
            <div style={{ padding: '16px 20px', borderBottom: isDark ? '1px solid #334155' : '1px solid #E2E8F0', display: 'flex', gap: '14px', alignItems: 'center', backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }}>
              <img
                src={priceHistoryModalItem.productImage || (priceHistoryModalItem.images && priceHistoryModalItem.images[0]) || ''}
                alt=""
                style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'contain', backgroundColor: '#FFF' }}
              />
              <div>
                <div style={{ fontSize: '0.75rem', color: isDark ? '#94A3B8' : '#64748B', fontWeight: 700 }}>
                  {priceHistoryModalItem.brand} • SKU: {priceHistoryModalItem.goodsNo}
                </div>
                <div style={{ fontSize: '0.92rem', fontWeight: 900, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                  {priceHistoryModalItem.name}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#10B981', fontWeight: 800, marginTop: '2px' }}>
                  Giá hiện tại: {Number(priceHistoryModalItem.foreignPrice || priceHistoryModalItem.price || 0).toLocaleString()} ₩ ({(priceHistoryModalItem.priceVnd || calculateVndPrice(priceHistoryModalItem.foreignPrice, krwRate, serviceFee)).toLocaleString('vi-VN')} đ)
                </div>
              </div>
            </div>

            {/* Timeline List */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {(!priceHistoryModalItem.priceHistory || priceHistoryModalItem.priceHistory.length === 0) ? (
                <div style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
                  Chưa có bản ghi biến động giá nào được lưu.
                </div>
              ) : (
                priceHistoryModalItem.priceHistory.map((item, idx) => {
                  const isDrop = item.changeType === 'drop';
                  return (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        paddingLeft: '24px',
                        borderLeft: isDrop ? '2px solid #10B981' : '2px solid #F59E0B',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        left: '-6px',
                        top: '0',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: isDrop ? '#10B981' : '#F59E0B'
                      }} />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                        <span style={{ color: isDark ? '#94A3B8' : '#64748B', fontWeight: 700 }}>
                          {item.timestamp ? new Date(item.timestamp).toLocaleString('vi-VN') : 'Gần đây'}
                        </span>
                        <span style={{
                          backgroundColor: isDrop ? (isDark ? '#064E3B' : '#ECFDF5') : (isDark ? '#78350F' : '#FEF3C7'),
                          color: isDrop ? '#10B981' : '#F59E0B',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 900,
                          fontSize: '0.72rem'
                        }}>
                          {isDrop ? `🔻 ${Math.abs(item.changePercent)}%` : `🔺 +${item.changePercent}%`}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                        {item.oldForeignPrice?.toLocaleString()} ₩ ➔ {item.newForeignPrice?.toLocaleString()} ₩
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#38BDF8', fontWeight: 700 }}>
                        {item.oldPriceVnd?.toLocaleString('vi-VN')} đ ➔ {item.newPriceVnd?.toLocaleString('vi-VN')} đ
                      </div>
                      {item.reason && (
                        <div style={{ fontSize: '0.72rem', color: isDark ? '#CBD5E1' : '#64748B', fontStyle: 'italic', marginTop: '2px' }}>
                          {item.reason}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: isDark ? '1px solid #334155' : '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPriceHistoryModalItem(null)}
                style={{
                  backgroundColor: '#10B981',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Sheets / CSV Importer Modal */}
      <AdminGoogleSheetModal
        isOpen={isGoogleSheetModalOpen}
        onClose={() => setIsGoogleSheetModalOpen(false)}
        onImportProducts={handleImportFromSheetOrCsv}
        isDark={isDark}
        showToast={showToast}
      />

      {/* Quick Edit Modal for Pending Item */}
      <AdminProductModal
        isOpen={isModalOpen}
        product={editingItem}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSavePendingItem}
        onApprove={handleApproveFromModal}
        onDelete={handleRejectSingle}
        rates={rates}
        isPending={true}
        isDark={isDark}
      />
    </div>
  );
}
