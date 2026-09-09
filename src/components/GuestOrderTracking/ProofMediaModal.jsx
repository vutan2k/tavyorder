import React, { useEffect } from 'react';
import { X, Video, FileText, PackageCheck, ExternalLink } from 'lucide-react';
import { getEmbedVideoUrl, isEmbeddableVideo } from '../../utils/videoUrlHelper.js';

/**
 * ProofMediaModal
 * Lightbox modal for displaying POV videos, store receipt bills, and packing videos.
 * Supports backdrop click and Escape key dismissal.
 */
export default function ProofMediaModal({ media, onClose }) {
  useEffect(() => {
    if (!media) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [media, onClose]);

  if (!media) return null;

  const isVideo = media.type === 'video';
  const isImage = media.type === 'image';
  const isEmbed = isVideo && isEmbeddableVideo(media.url);
  const embedUrl = isVideo ? getEmbedVideoUrl(media.url) : '';

  const getMediaIcon = () => {
    if (media.badgeType === 'packing_video' || media.title?.includes('Đóng Kiện')) {
      return <PackageCheck size={20} style={{ color: '#DB2777' }} />;
    }
    if (isVideo) {
      return <Video size={20} style={{ color: 'var(--purple-primary, #00FF00)' }} />;
    }
    return <FileText size={20} style={{ color: '#374151' }} />;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="proof-media-modal-title"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          maxWidth: '720px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #EAE6DF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FAF9F6'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            {getMediaIcon()}
            <div style={{ minWidth: 0 }}>
              <h3
                id="proof-media-modal-title"
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: '#1F2937',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {media.title || (isVideo ? 'Video Bằng Chứng Mua Hàng' : 'Hóa Đơn Store Hàn Quốc')}
              </h3>
              {media.subtitle && (
                <p style={{ fontSize: '0.78rem', color: '#6B7280', margin: '2px 0 0 0' }}>
                  {media.subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6B7280',
              padding: '6px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#E5E7EB')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body / Media Content */}
        <div
          style={{
            padding: '20px',
            textAlign: 'center',
            backgroundColor: '#0F172A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '260px',
            overflow: 'auto'
          }}
        >
          {isVideo && isEmbed ? (
            <iframe
              src={embedUrl}
              title={media.title || 'Video Player'}
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{
                width: '100%',
                height: '380px',
                border: 'none',
                borderRadius: '8px'
              }}
            />
          ) : isVideo ? (
            <video
              src={media.url}
              controls
              autoPlay
              playsInline
              style={{
                maxWidth: '100%',
                maxHeight: '65vh',
                borderRadius: '8px',
                outline: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
              }}
            >
              Trình duyệt không hỗ trợ xem video trực tiếp.
            </video>
          ) : isImage ? (
            <img
              src={media.url}
              alt={media.title || 'Hóa đơn chứng từ mua hàng'}
              style={{
                maxWidth: '100%',
                maxHeight: '68vh',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
              }}
            />
          ) : (
            <p style={{ color: '#E2E8F0', fontSize: '0.9rem' }}>
              Không có định dạng phù hợp để hiển thị tệp này.
            </p>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#FAF9F6',
            borderTop: '1px solid #EAE6DF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          {media.url && (media.url.startsWith('http://') || media.url.startsWith('https://')) ? (
            <a
              href={media.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                color: 'var(--purple-primary, #00FF00)',
                textDecoration: 'none',
                fontWeight: 600
              }}
            >
              Mở trong tab mới <ExternalLink size={14} />
            </a>
          ) : <div />}

          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              backgroundColor: 'var(--purple-primary, #00FF00)',
              color: '#000000',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'opacity 0.2s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Đóng cửa sổ
          </button>
        </div>
      </div>
    </div>
  );
}
