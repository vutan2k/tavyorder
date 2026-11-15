import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const HOME_CATALOG_PATHS = ['/', '/home', '/products', '/catalog', '/kr-order'];

export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const isHomeCatalog = HOME_CATALOG_PATHS.includes(pathname);
      const isRestorePending = sessionStorage.getItem('tavy_catalog_restore_pending') === '1';
      const hasSavedScroll = sessionStorage.getItem('tavy_catalog_scroll_y') !== null ||
        Boolean(sessionStorage.getItem('tavy_catalog_last_goods_no'));

      if (isHomeCatalog && (isRestorePending || (navigationType === 'POP' && hasSavedScroll))) {
        sessionStorage.setItem('tavy_catalog_restore_pending', '1');
        return;
      }
    } catch {}

    const htmlEl = document.documentElement;
    const prevBehavior = htmlEl.style.scrollBehavior;
    htmlEl.style.scrollBehavior = 'auto';
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    htmlEl.style.scrollBehavior = prevBehavior;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
