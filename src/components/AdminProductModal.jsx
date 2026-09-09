import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Check, Trash2, Image as ImageIcon, Star,
  Save, RefreshCw, Box, Plus, Camera, CheckCircle2,
  Maximize2, Minimize2, Sparkles
} from 'lucide-react';
import {
  CATEGORY_GROUPS,
  CATEGORY_DICT,
  getCategoryLabel,
  detectPreciseCategory
} from '../services/categoryClassifier';

const extractAllImages = (prod) => {
  if (!prod) return [];
  const list = [];
  if (prod.productImage) list.push(prod.productImage);
  if (Array.isArray(prod.images)) list.push(...prod.images);
  if (Array.isArray(prod.albumImgs)) list.push(...prod.albumImgs);
  return Array.from(new Set(list.filter(url => typeof url === 'string' && url.trim().length > 5)));
};

const extractReviewPhotos = (prod) => {
  if (!prod) return [];
  if (Array.isArray(prod.photoReviews)) {
    return Array.from(new Set(prod.photoReviews.filter(url => typeof url === 'string' && url.trim().length > 5)));
  }
  return [];
};

export default function AdminProductModal({
  product,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onApprove,
  rates,
  isPending = false,
  isDark: isDarkProp
}) {
  const isDark = isDarkProp !== undefined
    ? isDarkProp
    : (typeof window !== 'undefined' && localStorage.getItem('tavy_admin_theme') === 'dark');

  const krwRate = rates?.KRW?.rate || 19.5;
  const serviceFee = rates?.serviceFeePercent || 5;

  const initialImages = useMemo(() => extractAllImages(product), [product]);
  const initialReviews = useMemo(() => extractReviewPhotos(product), [product]);
  const initialMainImage = product?.productImage || initialImages[0] || '';

  // Nhận diện phân loại chính xác theo tên sản phẩm ngay từ đầu (Ví dụ: Phấn Mắt)
  const initialCategory = useMemo(() => {
    return detectPreciseCategory(
      product?.name || '',
      product?.nameKr || product?.koreanTitle || '',
      product?.category
    );
  }, [product]);

  const [formData, setFormData] = useState(() => ({
    goodsNo: product?.goodsNo || product?.id || `P-${Date.now()}`,
    name: product?.name || '',
    nameKr: product?.nameKr || product?.koreanTitle || '',
    brand: product?.brand || '',
    category: initialCategory,
    foreignPrice: product?.foreignPrice ?? product?.price ?? 0,
    productImage: initialMainImage,
    images: initialImages,
    photoReviews: initialReviews,
    description: product?.description || ''
  }));

  const [selectedPreviewImg, setSelectedPreviewImg] = useState(initialMainImage);
  const [mediaFilter, setMediaFilter] = useState('all'); // 'all' | 'product' | 'review'
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaType, setNewMediaType] = useState('product'); // 'product' | 'review'
  const [showEditMainUrl, setShowEditMainUrl] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Kích thước bảng (resizable) và trạng thái phóng to
  const [dimensions, setDimensions] = useState(() => {
    if (typeof window !== 'undefined') {
      const defaultW = Math.min(1040, Math.max(560, Math.round(window.innerWidth * 0.80)));
      const defaultH = Math.min(800, Math.max(500, Math.round(window.innerHeight * 0.88)));
      return { width: defaultW, height: defaultH };
    }
    return { width: 1040, height: 800 };
  });
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDraggingBorder, setIsDraggingBorder] = useState(false);

  useEffect(() => {
    if (product) {
      const allImgs = extractAllImages(product);
      const revImgs = extractReviewPhotos(product);
      const mainImg = product.productImage || allImgs[0] || '';
      const preciseCat = detectPreciseCategory(
        product.name || '',
        product.nameKr || product.koreanTitle || '',
        product.category
      );

      setFormData({
        goodsNo: product.goodsNo || product.id || `P-${Date.now()}`,
        name: product.name || '',
        nameKr: product.nameKr || product.koreanTitle || '',
        brand: product.brand || '',
        category: preciseCat,
        foreignPrice: product.foreignPrice ?? product.price ?? 0,
        productImage: mainImg,
        images: allImgs.length > 0 ? allImgs : (mainImg ? [mainImg] : []),
        photoReviews: revImgs,
        description: product.description || ''
      });
      setSelectedPreviewImg(mainImg);
      setNewMediaUrl('');
      setMediaFilter('all');
      setShowEditMainUrl(false);
    }
  }, [product]);

  // Đóng modal khi nhấn phím Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Bộ tính năng kéo viền để co giãn kích thước (Drag to Resize)
  const handleResizeStart = (direction, e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingBorder(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = dimensions.width;
    const startHeight = dimensions.height;

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      const maxW = Math.round(window.innerWidth * 0.98);
      const minW = Math.min(520, Math.round(window.innerWidth * 0.92));
      const maxH = Math.round(window.innerHeight * 0.96);
      const minH = Math.min(460, Math.round(window.innerHeight * 0.88));

      let newW = startWidth;
      let newH = startHeight;

      if (direction.includes('right')) {
        newW = Math.min(maxW, Math.max(minW, startWidth + dx * 2));
      } else if (direction.includes('left')) {
        newW = Math.min(maxW, Math.max(minW, startWidth - dx * 2));
      }

      if (direction.includes('bottom')) {
        newH = Math.min(maxH, Math.max(minH, startHeight + dy * 2));
      } else if (direction.includes('top')) {
        newH = Math.min(maxH, Math.max(minH, startHeight - dy * 2));
      }

      setDimensions({
        width: Math.round(newW),
        height: Math.round(newH)
      });
    };

    const onMouseUp = () => {
      setIsDraggingBorder(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const isDirty = useMemo(() => {
    if (!product) return false;
    const initialGoodsNo = product.goodsNo || product.id || '';
    const initialName = product.name || '';
    const initialNameKr = product.nameKr || product.koreanTitle || '';
    const initialCategory = product.category || 'cosmetics';
    const initialForeignPrice = product.foreignPrice ?? product.price ?? 0;
    const initialProductImage = product.productImage || '';
    const initialDescription = product.description || '';

    const initialImgs = extractAllImages(product);
    const initialRevs = extractReviewPhotos(product);
    const imagesChanged = JSON.stringify(formData.images) !== JSON.stringify(initialImgs);
    const reviewsChanged = JSON.stringify(formData.photoReviews || []) !== JSON.stringify(initialRevs);

    return (
      formData.goodsNo !== initialGoodsNo ||
      formData.name !== initialName ||
      formData.nameKr !== initialNameKr ||
      formData.category !== initialCategory ||
      parseFloat(formData.foreignPrice) !== parseFloat(initialForeignPrice) ||
      formData.productImage !== initialProductImage ||
      imagesChanged ||
      reviewsChanged ||
      formData.description !== initialDescription
    );
  }, [formData, product]);

  const currentPreview = selectedPreviewImg || formData.productImage || (formData.images && formData.images[0]) || '';

  const handleSelectPreview = (imgUrl) => {
    setSelectedPreviewImg(imgUrl);
  };

  const handleSetAsMainImage = (imgUrl) => {
    if (!imgUrl) return;
    setFormData(prev => {
      const updatedImages = prev.images.includes(imgUrl)
        ? [imgUrl, ...prev.images.filter(img => img !== imgUrl)]
        : [imgUrl, ...prev.images];
      return {
        ...prev,
        productImage: imgUrl,
        images: updatedImages
      };
    });
    setSelectedPreviewImg(imgUrl);
  };

  const handleRemoveImage = (indexToRemove, e) => {
    if (e) e.stopPropagation();
    const targetUrl = formData.images[indexToRemove];
    setFormData(prev => {
      const updatedImages = prev.images.filter((_, idx) => idx !== indexToRemove);
      let newMain = prev.productImage;
      if (prev.productImage === targetUrl) {
        newMain = updatedImages[0] || '';
      }
      return {
        ...prev,
        images: updatedImages,
        productImage: newMain
      };
    });

    if (selectedPreviewImg === targetUrl) {
      const remaining = formData.images.filter((_, idx) => idx !== indexToRemove);
      setSelectedPreviewImg(remaining[0] || '');
    }
  };

  const handleAddNewMedia = (e) => {
    if (e) e.preventDefault();
    const trimmed = newMediaUrl.trim();
    if (!trimmed) return;
    if (newMediaType === 'product') {
      if (!formData.images.includes(trimmed)) {
        setFormData(prev => ({
          ...prev,
          images: [...prev.images, trimmed],
          productImage: prev.productImage || trimmed
        }));
        setSelectedPreviewImg(trimmed);
      }
    } else {
      if (!formData.photoReviews.includes(trimmed)) {
        setFormData(prev => ({
          ...prev,
          photoReviews: [...prev.photoReviews, trimmed]
        }));
        setSelectedPreviewImg(trimmed);
      }
    }
    setNewMediaUrl('');
  };

  const handleRemoveReviewPhoto = (indexToRemove, e) => {
    if (e) e.stopPropagation();
    const targetUrl = formData.photoReviews[indexToRemove];
    setFormData(prev => ({
      ...prev,
      photoReviews: prev.photoReviews.filter((_, idx) => idx !== indexToRemove)
    }));
    if (selectedPreviewImg === targetUrl) {
      setSelectedPreviewImg(formData.productImage || (formData.images && formData.images[0]) || '');
    }
  };

  // Tự động nhận diện phân loại lại khi bấm nút AI Detect
  const handleAutoDetectCategory = () => {
    const detected = detectPreciseCategory(formData.name, formData.nameKr, formData.category);
    if (detected) {
      setFormData(prev => ({ ...prev, category: detected }));
    }
  };

  // Tính giá VNĐ ước tính tự động theo tỷ giá & phí mua hộ
  const calculatedVnd = useMemo(() => {
    const won = parseFloat(formData.foreignPrice) || 0;
    const vnd = Math.round(won * krwRate * (1 + serviceFee / 100));
    return vnd;
  }, [formData.foreignPrice, krwRate, serviceFee]);

  // Bộ lọc danh sách media (Ảnh SP + Ảnh Review)
  const displayedMedia = useMemo(() => {
    const list = [];
    if (mediaFilter === 'all' || mediaFilter === 'product') {
      (formData.images || []).forEach((url, idx) => {
        list.push({
          url,
          type: 'product',
          index: idx,
          isMain: url === formData.productImage,
          label: url === formData.productImage ? 'Chính' : `SP #${idx + 1}`
        });
      });
    }
    if (mediaFilter === 'all' || mediaFilter === 'review') {
      (formData.photoReviews || []).forEach((url, idx) => {
        list.push({
          url,
          type: 'review',
          index: idx,
          isMain: false,
          label: `Review #${idx + 1}`
        });
      });
    }
    return list;
  }, [formData.images, formData.photoReviews, formData.productImage, mediaFilter]);

  if (!isOpen || !product) return null;

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!formData.name.trim()) {
      alert('Vui lòng nhập tên sản phẩm tiếng Việt.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...product,
        ...formData,
        category: formData.category,
        subCategory: formData.category,
        categoryLabel: getCategoryLabel(formData.category),
        foreignPrice: parseFloat(formData.foreignPrice) || 0,
        price: parseFloat(formData.foreignPrice) || 0,
        images: formData.images || [],
        photoReviews: formData.photoReviews || [],
        usage: product?.usage || '',
        updatedAt: new Date().toISOString()
      };

      if (onSave) {
        if (onSave.length >= 2) {
          await onSave(formData.goodsNo, payload);
        } else {
          await onSave(payload);
        }
      }
      onClose();
    } catch (err) {
      console.error("Lỗi khi lưu sản phẩm:", err);
      alert("Lỗi khi lưu thay đổi: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveAndPublish = async () => {
    if (onApprove) {
      setIsSaving(true);
      try {
        const payload = {
          ...product,
          ...formData,
          category: formData.category,
          subCategory: formData.category,
          categoryLabel: getCategoryLabel(formData.category),
          foreignPrice: parseFloat(formData.foreignPrice) || 0,
          price: parseFloat(formData.foreignPrice) || 0,
          images: formData.images || [],
          photoReviews: formData.photoReviews || [],
          usage: product?.usage || '',
          isPublished: true,
          status: 'published',
          updatedAt: new Date().toISOString()
        };
        if (onApprove.length >= 2) {
          await onApprove(formData.goodsNo, payload);
        } else {
          await onApprove(payload);
        }
        onClose();
      } catch (err) {
        console.error("Lỗi duyệt sản phẩm:", err);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const totalMediaCount = (formData.images?.length || 0) + (formData.photoReviews?.length || 0);
  const isCurrentReview = Boolean(currentPreview && formData.photoReviews?.includes(currentPreview));
  const isCurrentMain = Boolean(currentPreview && currentPreview === formData.productImage && !isCurrentReview);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
        userSelect: isDraggingBorder ? 'none' : 'auto'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDirty) {
          onClose();
        }
      }}
    >
      {/* Khung Modal có thể kéo dãn kích thước ở cạnh viền */}
      <div
        style={{
          position: 'relative',
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderRadius: '16px',
          width: isMaximized ? '96vw' : `${dimensions.width}px`,
          height: isMaximized ? '94vh' : `${dimensions.height}px`,
          maxWidth: '96vw',
          maxHeight: '94vh',
          minWidth: '520px',
          minHeight: '460px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
          transition: isDraggingBorder ? 'none' : 'width 0.15s ease, height 0.15s ease'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* CÁC ĐIỂM KÉO VIỀN (RESIZE HANDLES) */}
        {!isMaximized && (
          <>
            {/* Viền phải */}
            <div
              onMouseDown={(e) => handleResizeStart('right', e)}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '8px',
                height: '100%',
                cursor: 'ew-resize',
                zIndex: 60,
                backgroundColor: 'transparent'
              }}
              title="Kéo sang hai bên để thay đổi chiều rộng"
            />
            {/* Viền trái */}
            <div
              onMouseDown={(e) => handleResizeStart('left', e)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '8px',
                height: '100%',
                cursor: 'ew-resize',
                zIndex: 60,
                backgroundColor: 'transparent'
              }}
              title="Kéo sang hai bên để thay đổi chiều rộng"
            />
            {/* Viền dưới */}
            <div
              onMouseDown={(e) => handleResizeStart('bottom', e)}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '100%',
                height: '8px',
                cursor: 'ns-resize',
                zIndex: 60,
                backgroundColor: 'transparent'
              }}
              title="Kéo lên / xuống để thay đổi chiều cao"
            />
            {/* Viền trên */}
            <div
              onMouseDown={(e) => handleResizeStart('top', e)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '8px',
                cursor: 'ns-resize',
                zIndex: 60,
                backgroundColor: 'transparent'
              }}
              title="Kéo lên / xuống để thay đổi chiều cao"
            />
            {/* Góc dưới - phải (Kéo cả 2 chiều + Grip Icon) */}
            <div
              onMouseDown={(e) => handleResizeStart('bottom-right', e)}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '22px',
                height: '22px',
                cursor: 'nwse-resize',
                zIndex: 70,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'flex-end',
                padding: '4px'
              }}
              title="Kéo góc để thay đổi cả chiều ngang và chiều dọc"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M10 1L1 10M10 5L5 10M10 9L9 10" stroke={isDark ? '#94A3B8' : '#64748B'} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            {/* Góc dưới - trái */}
            <div
              onMouseDown={(e) => handleResizeStart('bottom-left', e)}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '16px',
                height: '16px',
                cursor: 'nesw-resize',
                zIndex: 70
              }}
            />
            {/* Góc trên - phải */}
            <div
              onMouseDown={(e) => handleResizeStart('top-right', e)}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '16px',
                height: '16px',
                cursor: 'nesw-resize',
                zIndex: 70
              }}
            />
            {/* Góc trên - trái */}
            <div
              onMouseDown={(e) => handleResizeStart('top-left', e)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '16px',
                height: '16px',
                cursor: 'nwse-resize',
                zIndex: 70
              }}
            />
          </>
        )}

        {/* Header Modal */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            userSelect: 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              backgroundColor: isPending ? '#F59E0B' : '#2563EB',
              color: '#FFF',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Box size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{isPending ? 'Kiểm Duyệt Sản Phẩm Mới' : 'Chỉnh Sửa Thông Tin Sản Phẩm'}</span>
                <span style={{
                  fontSize: '0.72rem',
                  backgroundColor: isPending ? 'rgba(245, 158, 11, 0.2)' : 'rgba(37, 99, 235, 0.2)',
                  color: isPending ? '#FBBF24' : '#60A5FA',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: 800
                }}>
                  {formData.goodsNo}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: '2px' }}>
                {isPending ? 'Xem xét giá, hình ảnh, phân loại & mô tả trước khi xuất bản' : 'Cập nhật giá, ảnh, phân loại và mô tả sản phẩm'}
              </div>
            </div>
          </div>

          {/* Các nút điều khiển cửa sổ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Nhãn gợi ý kéo cạnh viền */}
            <span style={{
              fontSize: '0.68rem',
              color: '#94A3B8',
              backgroundColor: 'rgba(51, 65, 85, 0.6)',
              padding: '3px 8px',
              borderRadius: '6px',
              border: '1px solid #334155',
              display: 'none',
              ...(typeof window !== 'undefined' && window.innerWidth > 768 ? { display: 'inline-block' } : {})
            }}>
              ↔ Kéo cạnh viền để co giãn
            </span>

            {/* Nút Phóng to / Thu nhỏ toàn màn hình */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? "Khôi phục kích thước ban đầu" : "Phóng to toàn màn hình"}
              style={{
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#FFFFFF'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#94A3B8'}
            >
              {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>

            {/* Nút Đóng */}
            <button
              type="button"
              onClick={onClose}
              title="Đóng cửa sổ (Esc)"
              style={{
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#EF4444'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#94A3B8'}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* THÂN BẢNG: Form hiển thị thông tin */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            flex: 1,
            padding: '20px 24px',
            gap: '18px'
          }}
        >
          {/* HÀNG 1: GIÁ WON, GIÁ VIỆT & PHÂN LOẠI CHÍNH XÁC THEO TÊN */}
          <div style={{
            backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
            border: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            alignItems: 'center'
          }}>
            {/* 1. Giá Hàn (KRW) */}
            <div>
              <label style={{
                fontSize: '0.74rem',
                fontWeight: 800,
                color: isDark ? '#94A3B8' : '#64748B',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '5px'
              }}>
                1. Giá Gốc Won (KRW)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={formData.foreignPrice}
                  onChange={(e) => handleChange('foreignPrice', e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                    backgroundColor: isDark ? '#1E293B' : '#FFF',
                    color: isDark ? '#F8FAFC' : '#0F172A',
                    fontSize: '1rem',
                    fontWeight: 800,
                    width: '100%',
                    outline: 'none'
                  }}
                />
                <span style={{ fontWeight: 800, color: isDark ? '#94A3B8' : '#64748B', fontSize: '1.1rem' }}>₩</span>
              </div>
            </div>

            {/* 2. Giá Việt (VNĐ) */}
            <div>
              <label style={{
                fontSize: '0.74rem',
                fontWeight: 800,
                color: isDark ? '#94A3B8' : '#64748B',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '5px'
              }}>
                2. Giá Bán VNĐ (Ước Tính)
              </label>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#38BDF8' }}>
                {calculatedVnd.toLocaleString('vi-VN')} đ
              </div>
              <div style={{ fontSize: '0.68rem', color: isDark ? '#94A3B8' : '#64748B', marginTop: '2px' }}>
                Tỷ giá: 1 KRW = {krwRate}đ (Phí dịch vụ {serviceFee}%)
              </div>
            </div>

            {/* 3. Phân Loại Ngành Hàng Chính Xác */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                <label style={{
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  color: isDark ? '#94A3B8' : '#64748B',
                  textTransform: 'uppercase'
                }}>
                  3. Phân Loại Ngành Hàng
                </label>
                <button
                  type="button"
                  onClick={handleAutoDetectCategory}
                  title="Tự động nhận diện phân loại chính xác dựa theo tên sản phẩm"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38BDF8',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '0 2px'
                  }}
                >
                  <Sparkles size={11} />
                  <span>Nhận diện chuẩn</span>
                </button>
              </div>

              <select
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                  backgroundColor: isDark ? '#1E293B' : '#FFF',
                  color: isDark ? '#F8FAFC' : '#0F172A',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {CATEGORY_GROUPS.map((grp) => (
                  <optgroup key={grp.group} label={grp.group}>
                    {grp.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                ))}

                {/* Nếu giá trị hiện tại không nằm trong danh mục chuẩn */}
                {formData.category && !CATEGORY_DICT[formData.category] && (
                  <option value={formData.category}>
                    {formData.category} (Tự chọn)
                  </option>
                )}
              </select>
            </div>
          </div>

          {/* HÀNG 2: ẢNH TO RÕ HIỂN THỊ HẾT (TRÁI) VÀ THÔNG TIN SẢN PHẨM (PHẢI) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: (isMaximized || dimensions.width > 768) ? 'minmax(380px, 460px) 1fr' : '1fr',
            gap: '24px',
            alignItems: 'start'
          }}>
            {/* KHU VỰC HÌNH ẢNH (TO RÕ HƠN, HIỂN THỊ HẾT TOÀN BỘ ALBUM) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Tiêu đề & Nút lọc tab hình ảnh */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ImageIcon size={16} color="#38BDF8" />
                  <span style={{ fontSize: '0.86rem', fontWeight: 800, color: isDark ? '#F8FAFC' : '#0F172A' }}>
                    Bộ Sưu Tập Ảnh
                  </span>
                  <span style={{
                    fontSize: '0.7rem',
                    backgroundColor: isDark ? '#334155' : '#E2E8F0',
                    color: isDark ? '#93C5FD' : '#2563EB',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontWeight: 800
                  }}>
                    {totalMediaCount} hình
                  </span>
                </div>

                {/* Nút lọc ảnh: Tất cả / SP / Review */}
                <div style={{
                  display: 'inline-flex',
                  backgroundColor: isDark ? '#0F172A' : '#E2E8F0',
                  padding: '2px',
                  borderRadius: '8px',
                  gap: '2px',
                  border: isDark ? '1px solid #334155' : '1px solid #CBD5E1'
                }}>
                  <button
                    type="button"
                    onClick={() => setMediaFilter('all')}
                    style={{
                      border: 'none',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '0.68rem',
                      fontWeight: mediaFilter === 'all' ? 800 : 600,
                      backgroundColor: mediaFilter === 'all' ? (isDark ? '#334155' : '#FFF') : 'transparent',
                      color: mediaFilter === 'all' ? (isDark ? '#F8FAFC' : '#0F172A') : (isDark ? '#94A3B8' : '#64748B'),
                      cursor: 'pointer'
                    }}
                  >
                    Tất cả ({totalMediaCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaFilter('product')}
                    style={{
                      border: 'none',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '0.68rem',
                      fontWeight: mediaFilter === 'product' ? 800 : 600,
                      backgroundColor: mediaFilter === 'product' ? (isDark ? '#334155' : '#FFF') : 'transparent',
                      color: mediaFilter === 'product' ? '#38BDF8' : (isDark ? '#94A3B8' : '#64748B'),
                      cursor: 'pointer'
                    }}
                  >
                    SP ({formData.images?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaFilter('review')}
                    style={{
                      border: 'none',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '0.68rem',
                      fontWeight: mediaFilter === 'review' ? 800 : 600,
                      backgroundColor: mediaFilter === 'review' ? (isDark ? '#334155' : '#FFF') : 'transparent',
                      color: mediaFilter === 'review' ? '#10B981' : (isDark ? '#94A3B8' : '#64748B'),
                      cursor: 'pointer'
                    }}
                  >
                    Review ({formData.photoReviews?.length || 0})
                  </button>
                </div>
              </div>

              {/* KHUNG XEM ẢNH LỚN: Kích thước to rõ, chất lượng cao (320px - 400px) */}
              <div style={{
                width: '100%',
                height: isMaximized ? '400px' : '320px',
                borderRadius: '14px',
                border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                backgroundColor: isDark ? '#090D16' : '#F8FAFC',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)'
              }}>
                {currentPreview ? (
                  <img
                    src={currentPreview}
                    alt={formData.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      transition: 'transform 0.2s ease'
                    }}
                    onError={(e) => {
                      if (e.target.dataset.hasError) return;
                      e.target.dataset.hasError = 'true';
                      if (product?.thumbnail_url && e.target.src !== product.thumbnail_url) {
                        e.target.src = product.thumbnail_url;
                      } else if (product?.thumbnailUrl && e.target.src !== product.thumbnailUrl) {
                        e.target.src = product.thumbnailUrl;
                      } else {
                        e.target.style.opacity = '0.3';
                      }
                    }}
                  />
                ) : (
                  <div style={{ color: '#94A3B8', fontSize: '0.85rem', textAlign: 'center', padding: '16px' }}>
                    Chưa có ảnh hiển thị
                  </div>
                )}

                {/* Nhãn phân biệt loại ảnh */}
                {isCurrentReview ? (
                  <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    backgroundColor: '#10B981',
                    color: '#FFF',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.35)'
                  }}>
                    <Camera size={13} />
                    <span>ẢNH REVIEW GDAS KHÁCH HÀNG THẬT</span>
                  </div>
                ) : isCurrentMain ? (
                  <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    backgroundColor: '#2563EB',
                    color: '#FFF',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.35)'
                  }}>
                    <CheckCircle2 size={13} />
                    <span>ẢNH ĐẠI DIỆN CHÍNH</span>
                  </div>
                ) : (
                  <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    backgroundColor: '#0284C7',
                    color: '#FFF',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.35)'
                  }}>
                    <ImageIcon size={13} />
                    <span>ẢNH GÓC CHỤP CHI TIẾT</span>
                  </div>
                )}

                {/* Nút đặt làm ảnh chính */}
                {!isCurrentReview && !isCurrentMain && currentPreview && (
                  <button
                    type="button"
                    onClick={() => handleSetAsMainImage(currentPreview)}
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      backgroundColor: '#2563EB',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '5px 10px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.35)'
                    }}
                  >
                    <Star size={12} fill="#FFF" />
                    <span>Đặt làm ảnh chính</span>
                  </button>
                )}
              </div>

              {/* DẢI TOÀN BỘ ẢNH THU NHỎ (HIỆN RA HẾT 100% TRÊN LƯỚI — KHÔNG BỊ ẨN) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: isDark ? '#CBD5E1' : '#475569',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>Danh sách ({displayedMedia.length} hình - bấm xem ảnh lớn):</span>
                  {mediaFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setMediaFilter('all')}
                      style={{ background: 'none', border: 'none', color: '#38BDF8', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}
                    >
                      Hiện tất cả ({totalMediaCount})
                    </button>
                  )}
                </div>

                {displayedMedia.length > 0 ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
                    gap: '8px',
                    maxHeight: isMaximized ? '260px' : '190px',
                    overflowY: 'auto',
                    padding: '2px'
                  }}>
                    {displayedMedia.map((item) => {
                      const isSelected = currentPreview === item.url;
                      const isReview = item.type === 'review';
                      const isMain = item.isMain;

                      let borderColor = isDark ? '#334155' : '#E2E8F0';
                      if (isSelected) borderColor = isReview ? '#10B981' : '#38BDF8';
                      else if (isMain) borderColor = '#2563EB';

                      return (
                        <div
                          key={`${item.type}-${item.index}`}
                          onClick={() => handleSelectPreview(item.url)}
                          style={{
                            position: 'relative',
                            height: '70px',
                            borderRadius: '8px',
                            border: isSelected ? `2.5px solid ${borderColor}` : (isMain ? '2px solid #2563EB' : `1px solid ${borderColor}`),
                            backgroundColor: isDark ? '#0F172A' : '#FFF',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            opacity: isSelected ? 1 : 0.82,
                            transform: isSelected ? 'scale(1.02)' : 'none',
                            transition: 'all 0.15s ease',
                            boxShadow: isSelected ? '0 3px 8px rgba(0,0,0,0.2)' : 'none'
                          }}
                          title={isReview ? `Ảnh review khách hàng #${item.index + 1}` : (isMain ? 'Ảnh đại diện chính' : `Ảnh chi tiết #${item.index + 1}`)}
                        >
                          <img
                            src={item.url}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: isReview ? 'cover' : 'contain' }}
                            onError={(e) => {
                              if (e.target.dataset.hasError) return;
                              e.target.dataset.hasError = 'true';
                              if (product?.thumbnail_url && e.target.src !== product.thumbnail_url) {
                                e.target.src = product.thumbnail_url;
                              } else {
                                e.target.style.opacity = '0.3';
                              }
                            }}
                          />

                          {/* Nhãn góc ảnh */}
                          <div style={{
                            position: 'absolute',
                            bottom: '2px',
                            left: '2px',
                            backgroundColor: isReview ? 'rgba(16, 185, 129, 0.95)' : (isMain ? 'rgba(37, 99, 235, 0.95)' : 'rgba(15, 23, 42, 0.85)'),
                            color: '#FFF',
                            borderRadius: '3px',
                            padding: '1px 4px',
                            fontSize: '0.55rem',
                            fontWeight: 800,
                            lineHeight: 1.1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}>
                            {isReview ? <Camera size={8} /> : (isMain ? <Star size={8} fill="#FFF" /> : null)}
                            <span>{isReview ? `R#${item.index + 1}` : (isMain ? 'Chính' : `#${item.index + 1}`)}</span>
                          </div>

                          {/* Nút xoá ảnh */}
                          <button
                            type="button"
                            title="Xoá ảnh này"
                            onClick={(e) => {
                              if (isReview) handleRemoveReviewPhoto(item.index, e);
                              else handleRemoveImage(item.index, e);
                            }}
                            style={{
                              position: 'absolute',
                              top: '2px',
                              right: '2px',
                              backgroundColor: 'rgba(239, 68, 68, 0.9)',
                              color: '#FFF',
                              border: 'none',
                              borderRadius: '4px',
                              width: '16px',
                              height: '16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            <X size={10} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.74rem', color: isDark ? '#94A3B8' : '#64748B', fontStyle: 'italic', padding: '8px 0' }}>
                    Chưa có ảnh nào trong bộ lọc này.
                  </div>
                )}
              </div>

              {/* Ô Thêm Ảnh mới */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <select
                  value={newMediaType}
                  onChange={(e) => setNewMediaType(e.target.value)}
                  style={{
                    padding: '7px 8px',
                    borderRadius: '8px',
                    border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                    backgroundColor: isDark ? '#0F172A' : '#FFF',
                    color: isDark ? '#F8FAFC' : '#0F172A',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="product">🖼️ Ảnh SP</option>
                  <option value="review">📸 Ảnh Review</option>
                </select>

                <input
                  type="text"
                  placeholder={newMediaType === 'product' ? 'Dán link ảnh sản phẩm HD...' : 'Dán link ảnh review khách hàng...'}
                  value={newMediaUrl}
                  onChange={(e) => setNewMediaUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewMedia(e);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                    backgroundColor: isDark ? '#0F172A' : '#FFF',
                    color: isDark ? '#F8FAFC' : '#0F172A',
                    fontSize: '0.76rem',
                    outline: 'none'
                  }}
                />

                <button
                  type="button"
                  onClick={handleAddNewMedia}
                  disabled={!newMediaUrl.trim()}
                  style={{
                    backgroundColor: newMediaUrl.trim()
                      ? (newMediaType === 'product' ? '#2563EB' : '#10B981')
                      : (isDark ? '#334155' : '#E2E8F0'),
                    color: newMediaUrl.trim() ? '#FFF' : '#94A3B8',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '0 12px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: newMediaUrl.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    height: '33px',
                    flexShrink: 0
                  }}
                >
                  <Plus size={14} />
                  <span>Thêm</span>
                </button>
              </div>

              {/* Tùy chọn chỉnh sửa link ảnh đại diện chính */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowEditMainUrl(!showEditMainUrl)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isDark ? '#94A3B8' : '#64748B',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>{showEditMainUrl ? '▼ Thu gọn link ảnh chính' : '► Chỉnh sửa trực tiếp URL ảnh đại diện chính'}</span>
                </button>
                {showEditMainUrl && (
                  <div style={{ marginTop: '4px' }}>
                    <input
                      type="text"
                      placeholder="URL ảnh đại diện chính..."
                      value={formData.productImage}
                      onChange={(e) => handleChange('productImage', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                        backgroundColor: isDark ? '#0F172A' : '#FFF',
                        color: isDark ? '#F8FAFC' : '#0F172A',
                        fontSize: '0.74rem',
                        outline: 'none'
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* KHU VỰC THÔNG TIN SẢN PHẨM: TÊN VIỆT, TÊN HÀN & MÔ TẢ (ĐÃ BỎ HƯỚNG DẪN SỬ DỤNG) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Tên Sản Phẩm Tiếng Việt */}
              <div>
                <label style={{
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  color: isDark ? '#F8FAFC' : '#0F172A',
                  display: 'block',
                  marginBottom: '5px'
                }}>
                  Tên Sản Phẩm (Tiếng Việt) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Ví dụ: Bảng Phấn Mắt Trang Điểm Clio Pro Eye Palette Air..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                    backgroundColor: isDark ? '#0F172A' : '#FFF',
                    color: isDark ? '#F8FAFC' : '#0F172A',
                    fontSize: '0.94rem',
                    fontWeight: 700,
                    outline: 'none'
                  }}
                />
              </div>

              {/* Tên Gốc Tiếng Hàn */}
              <div>
                <label style={{
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  color: isDark ? '#CBD5E1' : '#475569',
                  display: 'block',
                  marginBottom: '5px'
                }}>
                  Tên Gốc (Tiếng Hàn)
                </label>
                <input
                  type="text"
                  value={formData.nameKr}
                  onChange={(e) => handleChange('nameKr', e.target.value)}
                  placeholder="Ví dụ: 클리오 프로 아이 팔레트 에어..."
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                    backgroundColor: isDark ? '#0F172A' : '#FFF',
                    color: isDark ? '#F8FAFC' : '#0F172A',
                    fontSize: '0.86rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Mô Tả Sản Phẩm (Mở rộng thoải mái, thoáng đãng) */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <label style={{
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  color: isDark ? '#CBD5E1' : '#475569',
                  display: 'block',
                  marginBottom: '5px'
                }}>
                  Mô Tả Sản Phẩm
                </label>
                <textarea
                  rows={isMaximized ? 14 : 9}
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Mô tả công dụng chính, thành phần nổi bật, đặc tính của sản phẩm..."
                  style={{
                    width: '100%',
                    minHeight: '220px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                    backgroundColor: isDark ? '#0F172A' : '#FFF',
                    color: isDark ? '#F8FAFC' : '#0F172A',
                    fontSize: '0.86rem',
                    lineHeight: '1.6',
                    resize: 'vertical',
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>
        </form>

        {/* FOOTER: NÚT XOÁ, HUỶ BỎ & LƯU / DUYỆT */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: isDark ? '1px solid #334155' : '1px solid #E2E8F0',
            backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            userSelect: 'none'
          }}
        >
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(formData.goodsNo)}
              style={{
                backgroundColor: isDark ? '#450A0A' : '#FEE2E2',
                color: '#EF4444',
                border: isDark ? '1px solid #7F1D1D' : 'none',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Trash2 size={15} />
              <span>Xoá Sản Phẩm</span>
            </button>
          ) : <div />}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: isDark ? '#1E293B' : '#FFF',
                color: isDark ? '#CBD5E1' : '#64748B',
                border: isDark ? '1px solid #334155' : '1px solid #CBD5E1',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Huỷ Bỏ
            </button>

            {isPending && onApprove ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleApproveAndPublish}
                style={{
                  backgroundColor: '#10B981',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 18px',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
              >
                {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
                <span>Duyệt & Xuất Bản Lên Web Ngay</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSubmit}
                style={{
                  backgroundColor: '#2563EB',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 20px',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
                }}
              >
                {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                <span>Lưu Thay Đổi Ngay</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
