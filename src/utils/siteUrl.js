// Domain thật của site: ưu tiên origin đang chạy, fallback production Vercel.
export const SITE_URL = (typeof window !== 'undefined' && window.location?.origin)
  ? window.location.origin
  : 'https://tavyorder.vercel.app';
export default SITE_URL;
