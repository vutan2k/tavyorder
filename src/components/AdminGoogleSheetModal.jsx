import React, { useState, useRef } from 'react';
import {
  X, FileSpreadsheet, UploadCloud, Link as LinkIcon,
  CheckCircle2, AlertCircle, RefreshCw, Check, ArrowRight,
  HelpCircle, ExternalLink, Table
} from 'lucide-react';
import { classifyCosmeticsCategory, extractBrandFromTitleOrDom } from '../services/oliveYoungScraperCore';

/**
 * Helper to parse CSV text accurately handling quoted values with commas
 */
function parseCSV(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.trim().replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse a single CSV row
  const parseRow = (line) => {
    const row = [];
    let inQuotes = false;
    let current = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"' && inQuotes && nextChar === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    return row;
  };

  const rawHeaders = parseRow(lines[0]);
  const headers = rawHeaders.map(h => h.toLowerCase().trim());

  const findCol = (...keywords) => {
    return headers.findIndex(h => keywords.some(k => h.includes(k)));
  };

  const skuIdx = findCol('sku', 'mã sp', 'mã hàng', 'id', 'goodsno', 'goods_no');
  const nameIdx = findCol('tên sản phẩm', 'tên tiếng việt', 'tên việt', 'name', 'product_name');
  const nameKrIdx = findCol('tên tiếng hàn', 'tiếng hàn', 'namekr', 'name_kr');
  const brandIdx = findCol('thương hiệu', 'brand', 'nhãn hiệu', 'hãng');
  const catIdx = findCol('ngành hàng', 'danh mục', 'category');
  const priceIdx = findCol('giá won', 'won', 'price', 'giá (₩)', 'foreignprice');
  const imgIdx = findCol('link ảnh', 'link ảnh đại diện', 'ảnh', 'image', 'thumbnail', 'productimage');
  const detailsIdx = findCol('ảnh chi tiết', 'chi tiết ảnh', 'detail', 'details', 'images');
  const reviewIdx = findCol('ảnh review', 'review', 'ảnh review khách hàng', 'đánh giá', 'photoreviews');
  const urlIdx = findCol('link sản phẩm', 'link olive young', 'url', 'producturl');
  const descIdx = findCol('mô tả', 'công dụng', 'description', 'benefits');

  const products = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const row = parseRow(line);
    const sku = (skuIdx !== -1 && row[skuIdx]) ? row[skuIdx] : `SP-SHEET-${Date.now()}-${i}`;
    const name = (nameIdx !== -1 && row[nameIdx]) ? row[nameIdx] : (nameKrIdx !== -1 ? row[nameKrIdx] : `Sản Phẩm ${i}`);
    const nameKr = (nameKrIdx !== -1 && row[nameKrIdx]) ? row[nameKrIdx] : name;
    const rawBrand = (brandIdx !== -1 && row[brandIdx]) ? row[brandIdx] : '';
    const brandInfo = extractBrandFromTitleOrDom(name, rawBrand);
    const desc = (descIdx !== -1 && row[descIdx]) ? row[descIdx] : '';
    const catInfo = classifyCosmeticsCategory(name, desc);
    const priceStr = (priceIdx !== -1 && row[priceIdx]) ? row[priceIdx] : '0';
    const price = parseInt(String(priceStr).replace(/[^0-9]/g, ''), 10) || 25000;
    const img = (imgIdx !== -1 && row[imgIdx]) ? row[imgIdx] : '';
    const rawDetails = (detailsIdx !== -1 && row[detailsIdx]) ? row[detailsIdx].split(';').map(s => s.trim()).filter(Boolean) : [];
    const rawReviews = (reviewIdx !== -1 && row[reviewIdx]) ? row[reviewIdx].split(';').map(s => s.trim()).filter(Boolean) : [];
    const allImages = Array.from(new Set([img, ...rawDetails])).filter(Boolean);
    const url = (urlIdx !== -1 && row[urlIdx]) ? row[urlIdx] : '';

    products.push({
      goodsNo: sku,
      name: name,
      nameKr: nameKr,
      brand: brandInfo.brand || rawBrand || 'Korea Brand',
      brandKr: brandInfo.brandKr || rawBrand,
      category: catInfo.category,
      subCategory: catInfo.subCategory,
      categoryLabel: catInfo.categoryLabel,
      categoryKr: catInfo.categoryKr,
      foreignPrice: price,
      price: price,
      originalPrice: price,
      productImage: img || allImages[0] || '',
      images: allImages.length > 0 ? allImages : (img ? [img] : []),
      photoReviews: rawReviews,
      description: desc || `Sản phẩm ${brandInfo.brand} chính hãng Hàn Quốc. Mã SKU: ${sku}.`,
      origin: 'Store Hàn Quốc',
      rating: 4.9,
      reviewsCount: rawReviews.length > 0 ? rawReviews.length : 5,
      productUrl: url,
      inStock: true,
      status: 'pending',
      isPublished: false,
      source: 'GOOGLE_SHEETS_CSV_IMPORT',
      scrapedAt: new Date().toISOString()
    });
  }

  return products;
}

export default function AdminGoogleSheetModal({
  isOpen,
  onClose,
  onImportProducts,
  isDark = false,
  showToast
}) {
  const [activeMode, setActiveMode] = useState('link'); // 'link' | 'file'
  const [sheetUrl, setSheetUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [parsedProducts, setParsedProducts] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [fileName, setFileName] = useState('');

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Xử lý chuyển đổi link Google Sheet sang dạng export CSV
  const formatGoogleSheetCsvUrl = (url) => {
    let clean = url.trim();
    if (!clean) return '';

    // Nếu link dạng https://docs.google.com/spreadsheets/d/{ID}/edit...
    const match = clean.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      const sheetId = match[1];
      // Check xem có chỉ định gid cụ thể không
      const gidMatch = clean.match(/[#&?]gid=([0-9]+)/);
      const gid = gidMatch ? gidMatch[1] : '0';
      return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    }

    return clean;
  };

  // Tải dữ liệu từ Google Sheets Link
  const handleFetchGoogleSheet = async () => {
    if (!sheetUrl.trim()) {
      setErrorMsg('Vui lòng nhập đường link Google Sheets!');
      return;
    }

    setErrorMsg('');
    setIsLoading(true);
    setParsedProducts([]);

    const csvUrl = formatGoogleSheetCsvUrl(sheetUrl);

    try {
      // Dùng proxy nếu bị chặn CORS trực tiếp bởi trình duyệt
      let textData = '';
      try {
        const response = await fetch(csvUrl);
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        textData = await response.text();
      } catch (corsErr) {
        // Fallback qua CORS proxy
        console.warn('Direct fetch failed, falling back to proxy:', corsErr);
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(csvUrl)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error('Không thể tải file CSV từ Google Sheets. Vui lòng đảm bảo bảng tính đã được "Xuất bản lên web" dạng CSV!');
        textData = await res.text();
      }

      const products = parseCSV(textData);
      if (products.length === 0) {
        throw new Error('Bảng tính không có dữ liệu hoặc định dạng các cột chưa đúng!');
      }

      setParsedProducts(products);
      if (showToast) showToast(`Đã nhận diện thành công ${products.length} sản phẩm từ Google Sheets!`, 'success');
    } catch (err) {
      setErrorMsg(err.message || 'Lỗi kết nối tới Google Sheets!');
    } finally {
      setIsLoading(false);
    }
  };

  // Xử lý đọc file CSV tải lên
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    setFileName(file.name);
    setIsLoading(true);
    setParsedProducts([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result;
        const products = parseCSV(String(text || ''));
        if (products.length === 0) {
          throw new Error('File CSV rỗng hoặc không đúng cấu trúc!');
        }
        setParsedProducts(products);
        if (showToast) showToast(`Đã đọc thành công ${products.length} sản phẩm từ file CSV!`, 'success');
      } catch (err) {
        setErrorMsg(err.message || 'Lỗi đọc file CSV!');
      } finally {
        setIsLoading(false);
      }
    };

    reader.onerror = () => {
      setErrorMsg('Không thể đọc file đã chọn!');
      setIsLoading(false);
    };

    reader.readAsText(file, 'UTF-8');
  };

  // Xác nhận nạp vào Hàng Chờ Duyệt
  const handleConfirmImport = () => {
    if (parsedProducts.length === 0) return;
    onImportProducts(parsedProducts);
    if (showToast) showToast(`Đã nạp thành công ${parsedProducts.length} sản phẩm vào Hàng Chờ Duyệt!`, 'success');
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '16px'
    }} onClick={onClose}>
      <div style={{
        backgroundColor: isDark ? '#1E293B' : '#FFF',
        color: isDark ? '#F8FAFC' : '#0F172A',
        borderRadius: '16px',
        maxWidth: '750px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
        border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
        overflow: 'hidden'
      }} onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: isDark ? '#0F172A' : '#F8FAFC'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: '#10B981',
              color: '#FFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900 }}>
                Nhập Sản Phẩm Từ Google Sheets / File CSV
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                Đồng bộ nhanh hàng trăm sản phẩm trực tiếp vào Kho Hàng Chờ Duyệt
              </p>
            </div>
          </div>

          <button onClick={onClose} style={{ background: 'none', border: 'none', color: isDark ? '#94A3B8' : '#64748B', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Mode Selector */}
        <div style={{ padding: '16px 24px 0 24px', display: 'flex', gap: '10px' }}>
          <button
            onClick={() => { setActiveMode('link'); setErrorMsg(''); }}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: activeMode === 'link' ? '2px solid #10B981' : (isDark ? '1px solid #334155' : '1px solid #CBD5E1'),
              backgroundColor: activeMode === 'link' ? (isDark ? '#064E3B' : '#ECFDF5') : 'transparent',
              color: activeMode === 'link' ? '#10B981' : (isDark ? '#94A3B8' : '#64748B'),
              fontWeight: 800,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <LinkIcon size={16} />
            <span>Dán Link Google Sheets</span>
          </button>

          <button
            onClick={() => { setActiveMode('file'); setErrorMsg(''); }}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: activeMode === 'file' ? '2px solid #10B981' : (isDark ? '1px solid #334155' : '1px solid #CBD5E1'),
              backgroundColor: activeMode === 'file' ? (isDark ? '#064E3B' : '#ECFDF5') : 'transparent',
              color: activeMode === 'file' ? '#10B981' : (isDark ? '#94A3B8' : '#64748B'),
              fontWeight: 800,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <UploadCloud size={16} />
            <span>Tải Lên File CSV (.csv)</span>
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeMode === 'link' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                Nhập đường dẫn Google Sheets (Đã chia sẻ hoặc Xuất bản web):
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                    backgroundColor: isDark ? '#0F172A' : '#FFF',
                    color: isDark ? '#F8FAFC' : '#0F172A',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={handleFetchGoogleSheet}
                  disabled={isLoading}
                  style={{
                    backgroundColor: '#10B981',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 20px',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: isLoading ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isLoading ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  <span>{isLoading ? 'Đang Đọc...' : 'Đồng Bộ'}</span>
                </button>
              </div>

              <div style={{
                backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                padding: '12px 16px',
                borderRadius: '8px',
                border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
                fontSize: '0.78rem',
                color: isDark ? '#94A3B8' : '#64748B',
                lineHeight: 1.5
              }}>
                💡 <strong>Mẹo nhỏ</strong>: Để đồng bộ mượt mà nhất, trên Google Sheets bạn chọn <strong>Tệp (File) ➔ Chia sẻ (Share) ➔ Xuất bản lên web (Publish to web) ➔ Chọn CSV ➔ Bấm Xuất bản</strong>.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: isDark ? '2px dashed #334155' : '2px dashed #CBD5E1',
                  borderRadius: '12px',
                  padding: '36px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                  transition: 'all 0.2s'
                }}
              >
                <UploadCloud size={36} color="#10B981" style={{ margin: '0 auto 10px auto' }} />
                <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                  {fileName ? `Đã chọn: ${fileName}` : 'Nhấp để chọn file CSV từ máy tính'}
                </div>
                <div style={{ fontSize: '0.78rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '4px' }}>
                  Hỗ trợ các file định dạng .csv xuất từ Excel hoặc Google Sheets
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div style={{
              backgroundColor: isDark ? '#450A0A' : '#FEF2F2',
              border: isDark ? '1px solid #991B1B' : '1px solid #F87171',
              color: '#EF4444',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Preview Results Table */}
          {parsedProducts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#10B981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} />
                  <span>Tìm thấy {parsedProducts.length} sản phẩm hợp lệ sẵn sàng nạp:</span>
                </span>
                <span style={{ fontSize: '0.75rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                  Hiển thị mẫu 5 dòng đầu
                </span>
              </div>

              <div style={{
                borderRadius: '8px',
                border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead style={{ backgroundColor: isDark ? '#0F172A' : '#F1F5F9', borderBottom: isDark ? '1px solid #334155' : '1px solid #CBD5E1' }}>
                    <tr>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>SKU</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Tên Sản Phẩm</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Hãng</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Ngành Hàng</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Giá Won</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedProducts.slice(0, 5).map((p, idx) => (
                      <tr key={idx} style={{ borderBottom: isDark ? '1px solid #334155' : '1px solid #E2E8F0' }}>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700 }}>{p.goodsNo}</td>
                        <td style={{ padding: '8px 10px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                        <td style={{ padding: '8px 10px' }}>{p.brand}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ backgroundColor: isDark ? '#334155' : '#E2E8F0', padding: '2px 6px', borderRadius: '4px', fontSize: '0.72rem' }}>
                            {p.categoryLabel}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#10B981' }}>{p.foreignPrice.toLocaleString()}₩</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 24px',
          borderTop: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px',
          backgroundColor: isDark ? '#0F172A' : '#F8FAFC'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
              backgroundColor: 'transparent',
              color: isDark ? '#94A3B8' : '#64748B',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            Đóng
          </button>

          <button
            onClick={handleConfirmImport}
            disabled={parsedProducts.length === 0}
            style={{
              padding: '10px 22px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: parsedProducts.length > 0 ? '#10B981' : (isDark ? '#334155' : '#CBD5E1'),
              color: '#FFF',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: parsedProducts.length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: parsedProducts.length > 0 ? '0 4px 12px rgba(16, 185, 129, 0.25)' : 'none'
            }}
          >
            <Check size={16} />
            <span>Nạp {parsedProducts.length > 0 ? `(${parsedProducts.length})` : ''} Vào Hàng Chờ Duyệt</span>
          </button>
        </div>
      </div>
    </div>
  );
}
