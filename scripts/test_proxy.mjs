// Test handler proxy trực tiếp (không cần Vercel deploy).
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

const env = fs.readFileSync('/Users/tan/tavy-korea/.env', 'utf8');
const key = env.split('\n').find((l) => l.startsWith('VITE_FIREBASE_API_KEY=')).split('=')[1].trim();
process.env.VITE_FIREBASE_API_KEY = key;

const mod = await import(pathToFileURL('/Users/tan/tavy-korea/api/price/[...path].js').href);
const handler = mod.default;

function call(query = {}, method = 'GET', body) {
  return new Promise((resolve) => {
    const req = { method, query, body, headers: {} };
    const chunks = [];
    const res = {
      statusCode: 0,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(txt) { chunks.push(txt); resolve({ status: this.statusCode, headers: this.headers, body: txt }); },
    };
    handler(req, res);
  });
}

for (const [label, q] of [
  ['health', { path: ['health'] }],
  ['manifest', { path: ['manifest'] }],
  ['prices', { path: ['prices'] }],
  ['price mall', { path: ['price'], url: 'https://www.lotteon.com/p/product/LO2599576855?sitmNo=LO2599576855_2599576856&mall_no=1' }],
  ['bad path', { path: ['admin'] }],
]) {
  const r = await call(q);
  let brief = '';
  try {
    const j = JSON.parse(r.body);
    brief = j.ok === undefined ? JSON.stringify(j).slice(0, 80)
      : `ok=${j.ok} keys=${Object.keys(j).slice(0, 4).join(',')}` + (j.items ? ` items=${Array.isArray(j.items) ? j.items.length : Object.keys(j.items).length}` : '') + (j.priceKrw ? ` price=${j.priceKrw}` : '');
  } catch { brief = r.body.slice(0, 60); }
  console.log(label.padEnd(10), r.status, brief);
}
