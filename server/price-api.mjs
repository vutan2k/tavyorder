/**
 * TAVY KOREA — Live Price API (D4, phương án A+C)
 *  - Gate 1 (product detail): đọc cache do price-sync cập nhật, không cào per-view.
 *  - Gate 2 (checkout): /verify luôn cào mới, không cache.
 *
 *   node server/price-api.mjs        # :8787
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fetchOY, fetchMall, oyStats, closeBrowser } from './lib/scrapers.mjs';

const PORT = Number(process.env.PRICE_API_PORT || 8787);
const CACHE_TTL_MS = Number(process.env.PRICE_CACHE_TTL_MS || 15 * 60 * 1000);
const CACHE_FILE = path.resolve('server/price-cache.json');
const MANIFEST_FILE = path.resolve('server/catalog-150.json');

const cache = new Map(); // key -> { at, data }

// ---------- Auth + rate limit ----------
const KEY_FILE = path.join(process.env.HOME || '', '.config/tavy/price-api.key');
const API_KEY = process.env.PRICE_API_KEY || (fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, 'utf8').trim() : '');
const RL_WINDOW_MS = 60_000;
const RL_MAX = Number(process.env.PRICE_RL_MAX || 30);
const rl = new Map(); // ip -> { count, resetAt }

function rateLimited(ip) {
  const now = Date.now();
  const e = rl.get(ip);
  if (!e || now > e.resetAt) { rl.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS }); return false; }
  e.count++;
  return e.count > RL_MAX;
}

// ---------- Telegram alert ----------
function readEnv(key) {
  if (process.env[key]) return process.env[key];
  try {
    const line = fs.readFileSync(path.resolve('.env'), 'utf8').split('\n').find((l) => l.startsWith(key + '='));
    return line ? line.slice(key.length + 1).trim() : '';
  } catch { return ''; }
}
const alertLog = []; // { at }
async function sendTelegram(text) {
  const token = readEnv('TELEGRAM_BOT_TOKEN');
  const chat = readEnv('TELEGRAM_CHAT_ID');
  if (!token || !chat) return false;
  const now = Date.now();
  while (alertLog.length && now - alertLog[0] > 3600_000) alertLog.shift();
  if (alertLog.length >= 10) return false; // chống spam
  alertLog.push(now);
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML' }),
    });
    return r.ok;
  } catch { return false; }
}


// Chỉ cho phép URL mall thuộc allowlist — chặn SSRF qua /price?url=
const MALL_HOSTS = ['lotteon.com'];
function isAllowedMallUrl(raw) {
  try {
    const h = new URL(raw).hostname.toLowerCase();
    return MALL_HOSTS.some((d) => h === d || h.endsWith('.' + d));
  } catch { return false; }
}

function authorized(req) {
  if (!API_KEY) return true;
  const given = req.headers['x-api-key'] || '';
  return given.length === API_KEY.length && given === API_KEY;
}

function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    for (const [k, v] of Object.entries(raw.items || {})) cache.set(k, v);
    console.log(`[price-api] loaded ${cache.size} cached prices`);
  } catch {}
}
loadCache();

function saveCache() {
  try {
    const tmp = CACHE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ savedAt: new Date().toISOString(), items: Object.fromEntries(cache) }));
    fs.renameSync(tmp, CACHE_FILE);
  } catch (e) { console.error('[price-api] saveCache', e.message); }
}

function keyFor(item) {
  return item.source === 'oy' ? `oy:${item.goodsNo}` : `mall:${item.url}`;
}

function fresh(entry) {
  return entry && Date.now() - entry.at < CACHE_TTL_MS;
}

async function liveFetch(item) {
  return item.source === 'oy' ? fetchOY(item.goodsNo) : fetchMall(item.url);
}

function send(res, code, obj) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-api-key',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '');
  const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (u.pathname !== '/health' && !isLoopback) {
    if (!authorized(req)) return send(res, 401, { ok: false, error: 'unauthorized' });
    if (rateLimited(ip)) return send(res, 429, { ok: false, error: 'rate_limited' });
  }
  try {
    if (u.pathname === '/health') {
      return send(res, 200, {
        ok: true, service: 'price-api', cacheSize: cache.size,
        newestCacheAgeSec: cache.size
          ? Math.round((Date.now() - Math.max(...[...cache.values()].map((v) => v.at))) / 1000)
          : null,
        cacheTtlSec: CACHE_TTL_MS / 1000, oy: oyStats, uptime: Math.round(process.uptime()),
      });
    }

    // Toàn bộ cache cho storefront (Gate 1)
    if (u.pathname === '/prices') {
      const items = {};
      for (const [k, v] of cache) items[k] = { ...v.data, cachedAt: new Date(v.at).toISOString(), ageSec: Math.round((Date.now() - v.at) / 1000) };
      return send(res, 200, { ok: true, ttlSec: CACHE_TTL_MS / 1000, items });
    }

    // Một SKU: trả cache nếu còn hạn, hết hạn thì cào mới
    if (u.pathname === '/price') {
      const goodsNo = u.searchParams.get('goodsNo');
      const url = u.searchParams.get('url');
      if (url && !isAllowedMallUrl(url)) return send(res, 400, { ok: false, error: 'url_not_allowed' });
      const item = goodsNo ? { source: 'oy', goodsNo } : url ? { source: 'mall', url } : null;
      if (!item) return send(res, 400, { ok: false, error: 'goodsNo or url required' });
      const key = keyFor(item);
      const hit = cache.get(key);
      if (fresh(hit) && !u.searchParams.get('force')) {
        return send(res, 200, { ...hit.data, cached: true, ageSec: Math.round((Date.now() - hit.at) / 1000) });
      }
      const data = await liveFetch(item);
      if (data.ok) { cache.set(key, { at: Date.now(), data }); saveCache(); }
      return send(res, 200, data);
    }

    // Gate 2: batch verify, KHÔNG cache
    if (u.pathname === '/verify' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const items = (JSON.parse(body || '{}').items || []).slice(0, 30);
      if (!items.length) return send(res, 400, { ok: false, error: 'items required' });
      const results = await Promise.all(items.map(async (it) => {
        const item = it.source ? it : it.goodsNo ? { source: 'oy', goodsNo: it.goodsNo } : { source: 'mall', url: it.url };
        if (item.source === 'mall' && !isAllowedMallUrl(item.url || '')) {
          return { ok: false, error: 'url_not_allowed', key: keyFor(item) };
        }
        const data = await liveFetch(item);
        return { ...data, key: keyFor(item) };
      }));
      return send(res, 200, { ok: results.every((r) => r.ok), results });
    }

    // Alert admin khi Gate 2 không xác nhận được giá
    if (u.pathname === '/alert' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch {}
      const items = Array.isArray(payload.items) ? payload.items.slice(0, 8) : [];
      const lines = items.map((x) => `• ${x.name || 'SP'}: ${x.reason || x.message || 'không rõ'}`);
      const text = `🚫 <b>Checkout bị giữ do giá</b>\n${lines.join('\n') || 'Không có chi tiết'}\n<i>${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</i>`;
      const sent = await sendTelegram(text);
      return send(res, 200, { ok: true, sent });
    }

    // Manifest 150 SKU
    if (u.pathname === '/manifest') {
      const m = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
      return send(res, 200, { ok: true, total: m.length, items: m });
    }

    return send(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    return send(res, 500, { ok: false, error: String(e).slice(0, 200) });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`[price-api] http://127.0.0.1:${PORT} (ttl ${CACHE_TTL_MS / 1000}s)`));

process.on('SIGTERM', async () => { await closeBrowser(); process.exit(0); });
process.on('SIGINT', async () => { await closeBrowser(); process.exit(0); });
