// Proxy same-origin cho price API chạy trên Mac (quick tunnel).
// Web gọi /api/price/* → function đọc system_config/priceApi → forward, giấu key và URL tunnel.
const PROJECT = 'tavyorder';
const ALLOWED = new Set(['health', 'prices', 'manifest', 'price', 'verify', 'alert']);
const CACHE_MS = 30_000;

let cfgCache = { at: 0, data: null };

async function loadConfig() {
  if (cfgCache.data && Date.now() - cfgCache.at < CACHE_MS) return cfgCache.data;
  const key = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  if (!key) throw new Error('missing_firebase_key');
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/system_config/priceApi?key=${key}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`firestore_${r.status}`);
  const j = await r.json();
  const f = j.fields || {};
  const data = {
    baseUrl: f.baseUrl?.stringValue || '',
    apiKey: f.apiKey?.stringValue || '',
    enabled: f.enabled?.booleanValue !== false,
  };
  cfgCache = { at: Date.now(), data };
  return data;
}

function send(res, code, obj, cacheSeconds = 0) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', cacheSeconds ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=60` : 'no-store');
  res.end(JSON.stringify(obj));
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  // Vercel không điền req.query.path cho catch-all ngoài Next → tách từ URL.
  const url = new URL(req.url || '/', 'http://localhost');
  const segs = url.pathname.split('/').filter(Boolean); // api / price / <ep>
  const ep = segs[2] || '';
  if (!ALLOWED.has(ep)) return send(res, 404, { ok: false, error: 'not_found' });

  const qs = new URLSearchParams();
  for (const [k, v] of url.searchParams.entries()) qs.append(k, v);

  let cfg;
  try {
    cfg = await loadConfig();
  } catch (e) {
    return send(res, 503, { ok: false, error: 'config_unavailable', detail: e.message });
  }
  if (!cfg.baseUrl || cfg.enabled === false) {
    return send(res, 503, { ok: false, error: 'price_api_disabled' });
  }

  const headers = { 'x-api-key': cfg.apiKey || '' };
  let body;
  if (req.method === 'POST') {
    headers['content-type'] = 'application/json';
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  }

  const target = `${cfg.baseUrl.replace(/\/$/, '')}/${ep}${qs.toString() ? `?${qs}` : ''}`;
  try {
    const r = await fetch(target, { method: req.method, headers, body, signal: AbortSignal.timeout(280_000) });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: false, error: 'bad_upstream', raw: text.slice(0, 200) }; }
    return send(res, r.status, data, ep === 'prices' || ep === 'manifest' ? 30 : 0);
  } catch (e) {
    return send(res, 502, { ok: false, error: 'proxy_failed', detail: String(e.message || e).slice(0, 160) });
  }
}
