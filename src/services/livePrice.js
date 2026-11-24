// Live price client — Gate 1 (product detail).
// Dev: gọi thẳng price-api qua tunnel. Production: gọi same-origin /api/price (Vercel proxy).
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const CFG_TTL_MS = 5 * 60 * 1000;
const MANIFEST_TTL_MS = 60 * 60 * 1000;
const BATCH_TTL_MS = 60 * 1000;

let cfgCache = { data: null, at: 0 };
let manifestCache = { data: null, at: 0 };
let batchCache = { data: null, at: 0 };

async function getConfig() {
  if (cfgCache.data && Date.now() - cfgCache.at < CFG_TTL_MS) return cfgCache.data;
  const snap = await getDoc(doc(db, 'system_config', 'priceApi'));
  if (!snap.exists()) throw new Error('price_api_not_configured');
  const data = snap.data();
  if (!data?.baseUrl) throw new Error('price_api_not_configured');
  cfgCache = { data, at: Date.now() };
  return data;
}

// Production dùng proxy cùng origin để không lộ key/URL tunnel và không vướng CSP.
function endpoint(cfg) {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return { base: `${window.location.origin}/api/price`, key: null };
    }
  }
  return { base: cfg.baseUrl, key: cfg.apiKey || '' };
}

async function apiGet(path) {
  const cfg = await getConfig();
  if (cfg.enabled === false) throw new Error('price_api_disabled');
  const ep = endpoint(cfg);
  const headers = ep.key ? { 'x-api-key': ep.key } : {};
  const res = await fetch(`${ep.base}${path}`, { headers, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`price_api_http_${res.status}`);
  return res.json();
}

export async function getManifestEntry(product) {
  const id = product?.goodsNo || product?.id;
  if (!id) return null;
  if (!manifestCache.data || Date.now() - manifestCache.at > MANIFEST_TTL_MS) {
    const d = await apiGet('/manifest');
    manifestCache = { data: Array.isArray(d?.items) ? d.items : [], at: Date.now() };
  }
  return manifestCache.data.find((x) => String(x.firestoreId) === String(id)) || null;
}

/**
 * @returns {Promise<{ok:boolean, won?:number, originWon?:number, soldOut?:boolean,
 *   ageSec?:number, error?:string, source?:'api'|'batch'}>}
 */
export async function getLivePrice(product, { force = false } = {}) {
  const entry = await getManifestEntry(product);
  if (!entry || entry.source === 'none' || (!entry.goodsNo && !entry.url)) {
    return { ok: false, error: 'unmapped' };
  }

  const key = entry.source === 'oy' ? `oy:${entry.goodsNo}` : `mall:${entry.url}`;

  if (!force && batchCache.data && Date.now() - batchCache.at < BATCH_TTL_MS) {
    const hit = batchCache.data[key];
    if (hit?.ok) {
      return {
        ok: true,
        won: hit.salePrice ?? hit.priceKrw,
        originWon: hit.originPrice || hit.originPriceKrw || null,
        soldOut: Boolean(hit.soldOut),
        ageSec: hit.ageSec || 0,
        source: 'batch',
      };
    }
  }

  const q = entry.source === 'oy'
    ? `goodsNo=${encodeURIComponent(entry.goodsNo)}`
    : `url=${encodeURIComponent(entry.url)}`;
  const d = await apiGet(`/price?${q}${force ? '&force=1' : ''}`);

  if (!d?.ok) {
    return { ok: false, error: d?.error || 'price_unavailable' };
  }
  return {
    ok: true,
    won: d.salePrice ?? d.priceKrw,
    originWon: d.originPrice || d.originPriceKrw || null,
    soldOut: Boolean(d.soldOut),
    ageSec: d.ageSec || 0,
    source: 'api',
  };
}

export async function refreshBatch() {
  const d = await apiGet('/prices');
  batchCache = { data: d?.items || {}, at: Date.now() };
  return d;
}

export async function postVerify(items) {
  const cfg = await getConfig();
  if (cfg.enabled === false) throw new Error('price_api_disabled');
  const ep = endpoint(cfg);
  const res = await fetch(`${ep.base}/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(ep.key ? { 'x-api-key': ep.key } : {}) },
    body: JSON.stringify({ items }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`price_api_http_${res.status}`);
  return res.json();
}

export async function postAlert(items) {
  try {
    const cfg = await getConfig();
    if (!cfg?.baseUrl) return false;
    const ep = endpoint(cfg);
    const res = await fetch(`${ep.base}/alert`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(ep.key ? { 'x-api-key': ep.key } : {}) },
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(8000),
    });
    const d = await res.json();
    return Boolean(d?.sent);
  } catch {
    return false;
  }
}
