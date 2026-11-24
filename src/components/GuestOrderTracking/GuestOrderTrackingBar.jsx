import React, { useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

/**
 * GuestOrderTrackingBar
 * Clean & minimal order status tracking input bar for guest users on the Home Page.
 * Supports Phone Number or Order ID lookup.
 */
export default function GuestOrderTrackingBar({
  onSearch,
  onClear,
  initialValue = '',
  isLoading = false,
  placeholder = 'Số điện thoại đặt hàng'
}) {
  const [query, setQuery] = useState(initialValue || '');
  const [prevInitial, setPrevInitial] = useState(initialValue);

  // Synchronize state when initialValue changes from parent without setState in useEffect
  if (initialValue !== prevInitial) {
    setPrevInitial(initialValue);
    setQuery(initialValue || '');
  }

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    const cleanQuery = query.trim();
    if (cleanQuery && onSearch) {
      onSearch(cleanQuery);
    }
  };

  const handleClear = () => {
    setQuery('');
    if (onClear) {
      onClear();
    }
  };

  return (
    <div className="guest-order-tracking-bar-container">
      <form onSubmit={handleSubmit} style={{ position: 'relative', width: '100%' }}>
        <div className="guest-tracking-wrapper">
          <Search
            className="guest-tracking-search-icon"
            size={20}
          />

          <input
            id="search-input-main"
            type="text"
            className="guest-tracking-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label="Tra cứu tiến độ đơn hàng"
          />

          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="guest-tracking-clear-btn"
              aria-label="Xóa tìm kiếm"
              title="Xóa nội dung"
            >
              <X size={16} />
            </button>
          )}

          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="guest-tracking-submit-btn"
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Đang tra...
              </>
            ) : (
              'Tra cứu'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
