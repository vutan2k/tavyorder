/**
 * Scraper lib dùng chung cho price-api và price-sync.
 * OY: curl_cffi (spawn python) — bị Akamai rate limit, cần throttle + backoff.
 * Mall: Playwright Chromium — client-side render, ~4s/trang.
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const OY_SCRIPT = new URL('../../scripts/oy_price_fetch.py', import.meta.url).pathname;
export const CHROME_PATH = '/Users/tan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

// ---------- OY ----------
const OY_MIN_GAP_MS = Number(process.env.OY_MIN_GAP_MS || 9000);
let oyChain = Promise.resolve();
let oyLastAt = 0;
export let oyStats = { requests: 0, ok: 0, rateLimited: 0, lastStatus: null };

function oyThrottle(fn) {
  const run = async () => {
    const wait = Math.max(0, oyLastAt + OY_MIN_GAP_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    oyLastAt = Date.now();
    return fn();
  };
  const p = oyChain.then(run, run);
  oyChain = p.catch(() => {});
  return p;
}

function fetchOYOnce(goodsNo) {
  return new Promise((resolve) => {
    const child = spawn('python3', [OY_SCRIPT, goodsNo], { env: { ...process.env, PYTHONPATH: '' } });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ ok: false, error: 'timeout', goodsNo }); }, 15000);
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve({ ok: false, error: err.slice(0, 150) || `exit ${code}`, goodsNo });
      try { resolve(JSON.parse(out)); } catch { resolve({ ok: false, error: 'bad json', goodsNo }); }
    });
  });
}

export async function fetchOY(goodsNo) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await oyThrottle(() => fetchOYOnce(goodsNo));
    oyStats.requests++;
    oyStats.lastStatus = last.status ?? null;
    if (last.ok) { oyStats.ok++; return last; }
    if (last.status === 429) {
      oyStats.rateLimited++;
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    return last;
  }
  return { ...last, error: last?.error || 'rate_limited', rateLimited: true };
}

// ---------- Mall ----------
let browserPromise = null;
export function getBrowser() {
  if (!browserPromise) browserPromise = chromium.launch({ headless: true, executablePath: CHROME_PATH });
  return browserPromise;
}

export async function closeBrowser() {
  if (browserPromise) { const b = await browserPromise; browserPromise = null; await b.close().catch(() => {}); }
}

export async function fetchMall(url) {
  const t0 = Date.now();
  let ctx;
  try {
    const browser = await getBrowser();
    ctx = await browser.newContext({
      locale: 'ko-KR',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1800);
    const data = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const m = text.match(/최종가\s*([0-9][0-9,]*)\s*원/) || text.match(/판매가\s*([0-9][0-9,]*)\s*원/) || text.match(/([0-9][0-9,]{3,})\s*원/);
      return {
        price: m ? Number(m[1].replace(/,/g, '')) : null,
        title: (document.title || '').replace(/\s*:\s*롯데ON$/, '').slice(0, 90),
        soldOut: /일시품절|SOLD\s*OUT/i.test(text.slice(0, 3000)),
      };
    });
    const ok = data.price != null;
    return {
      ok, source: 'lotteon', priceKrw: data.price, soldOut: ok ? data.soldOut : false,
      title: data.title, url, ms: Date.now() - t0, ...(ok ? {} : { error: 'price_not_found' }),
    };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 150), url, ms: Date.now() - t0 };
  } finally {
    if (ctx) await ctx.close().catch(() => {});
  }
}
