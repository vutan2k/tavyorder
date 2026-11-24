/**
 * TAVY KOREA — Price Sync Worker (phương án A)
 * Quét tuần tự 150 SKU, ghi cache qua price-api, nghỉ tới khi cache hết hạn rồi quét lại.
 *
 *   node server/price-sync.mjs            # chạy liên tục
 *   node server/price-sync.mjs --once     # quét 1 lượt
 *   node server/price-sync.mjs --only=mall|oy
 */
import fs from 'node:fs';

const API = process.env.PRICE_API || 'http://127.0.0.1:8787';
const MANIFEST = JSON.parse(fs.readFileSync(new URL('./catalog-150.json', import.meta.url), 'utf8'));
const TTL_MS = Number(process.env.PRICE_CACHE_TTL_MS || 15 * 60 * 1000);
const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1];

async function hit(item) {
  const q = item.source === 'oy'
    ? `goodsNo=${encodeURIComponent(item.goodsNo)}`
    : `url=${encodeURIComponent(item.url)}`;
  const t0 = Date.now();
  try {
    const r = await fetch(`${API}/price?${q}&force=1`, { signal: AbortSignal.timeout(60000) });
    const d = await r.json();
    return { ...d, wallMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 120), wallMs: Date.now() - t0 };
  }
}

async function sweep() {
  const t0 = Date.now();
  const stats = { oy: [0, 0], mall: [0, 0], skipped: 0 };
  const ONLY_SET = ONLY ? ONLY.split(',') : ['mall']; // mặc định chỉ sweep mall; OY cào on-demand vì rate limit
  const items = MANIFEST.filter((x) => x.source !== 'none' && ONLY_SET.includes(x.source));
  for (const item of items) {
    const r = await hit(item);
    const bucket = stats[item.source];
    bucket[r.ok ? 0 : 1]++;
    console.log(`${r.ok ? 'OK ' : 'ERR'} ${item.source} ${item.firestoreId} ${item.brand} ${r.ok ? (r.salePrice || r.priceKrw) : r.error} ${r.wallMs}ms`);
  }
  const sec = Math.round((Date.now() - t0) / 1000);
  console.log(`[sweep] done in ${sec}s | oy ok=${stats.oy[0]} err=${stats.oy[1]} | mall ok=${stats.mall[0]} err=${stats.mall[1]}`);
  return sec;
}

(async () => {
  do {
    const sec = await sweep();
    if (ONCE) break;
    const wait = Math.max(30000, TTL_MS - sec * 1000);
    console.log(`[sweep] next in ${Math.round(wait / 1000)}s`);
    await new Promise((r) => setTimeout(r, wait));
  } while (true);
})();
