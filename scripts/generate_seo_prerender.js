#!/usr/bin/env node
/**
 * generate_seo_prerender.js
 * -------------------------
 * Automated SEO Static Site Generation (SSG) & Prerender Pipeline for TAVY Korea.
 * 1. Prerenders 200+ product HTML pages with semantic tags, H1, pricing, OpenGraph and JSON-LD.
 * 2. Generates canonical sitemap.xml and robots.txt.
 * 3. Supports direct indexing by Googlebot, Bingbot, and rich link unfurling on Facebook/Zalo.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = process.cwd();
const DIST_DIR = join(PROJECT_ROOT, 'dist');
const PUBLIC_DIR = join(PROJECT_ROOT, 'public');
const DIST_INDEX = join(DIST_DIR, 'index.html');

if (!existsSync(DIST_INDEX)) {
  console.error('[SEO Prerender] dist/index.html not found. Run vite build first.');
  process.exit(1);
}

// 1. Slugify helper
function removeVietnameseTones(str) {
  if (!str || typeof str !== 'string') return '';
  let res = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  res = res.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  res = res.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  res = res.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  res = res.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  res = res.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  res = res.replace(/đ/g, 'd');
  res = res.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'a');
  res = res.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'e');
  res = res.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'i');
  res = res.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'o');
  res = res.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'u');
  res = res.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'y');
  res = res.replace(/Đ/g, 'd');
  return res.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function generateProductSlug(product) {
  if (!product) return '';
  const id = product.goodsNo || product.id || '';
  const rawName = product.name || product.title || product.nameKr || id;
  const cleanName = removeVietnameseTones(rawName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleanName) return id ? String(id).toLowerCase() : 'san-pham';
  return id ? `${cleanName}-${String(id).toLowerCase()}` : cleanName;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 2. Load product catalogs
let products = [];
const fullCatalogPath = join(PUBLIC_DIR, 'data', 'all_products_catalog.json');
const fallbackCatalogPath = join(PUBLIC_DIR, 'data', 'playwright_scraped_products.json');

if (existsSync(fullCatalogPath)) {
  try {
    products = JSON.parse(readFileSync(fullCatalogPath, 'utf8'));
    console.log(`[SEO Prerender] Đã nạp ${products.length} sản phẩm từ all_products_catalog.json`);
  } catch (e) {
    console.warn('[SEO Prerender] Lỗi đọc all_products_catalog.json:', e.message);
  }
}

if (!products.length && existsSync(fallbackCatalogPath)) {
  try {
    products = JSON.parse(readFileSync(fallbackCatalogPath, 'utf8'));
    console.log(`[SEO Prerender] Đã nạp ${products.length} sản phẩm từ playwright_scraped_products.json`);
  } catch (e) {
    console.warn('[SEO Prerender] Lỗi đọc fallback catalog:', e.message);
  }
}

const baseHtml = readFileSync(DIST_INDEX, 'utf8');
const BASE_DOMAIN = 'https://tavyorder.web.app';
const KRW_RATE = 19.5 * 1.05; // 20.475 VND / Won

let prerenderCount = 0;
const sitemapUrls = [
  { loc: `${BASE_DOMAIN}/`, priority: '1.0', changefreq: 'daily' },
  { loc: `${BASE_DOMAIN}/products`, priority: '0.9', changefreq: 'daily' },
  { loc: `${BASE_DOMAIN}/policy`, priority: '0.6', changefreq: 'monthly' },
  { loc: `${BASE_DOMAIN}/gio-hang`, priority: '0.5', changefreq: 'weekly' }
];

for (const p of products) {
  if (!p || (!p.goodsNo && !p.id && !p.name)) continue;
  const slug = generateProductSlug(p);
  const productUrl = `${BASE_DOMAIN}/san-pham/${slug}`;

  const won = Number(p.foreignPrice ?? p.priceKrw ?? p.priceWon ?? p.price) || 0;
  const priceVnd = Math.round(won * KRW_RATE);
  const originalWon = Number(p.originalPrice || p.origin_price_krw) || 0;
  const originalPriceVnd = originalWon > 0 ? Math.round(originalWon * KRW_RATE) : 0;

  const pageTitle = `${p.name} - Mua Hộ Olive Young Hàn Quốc | TAVY KOREA`;
  const rawDesc = p.description || `Mua hộ ${p.name} chính hãng tại Olive Young Hàn Quốc với quy trình Order 8 Bước Minh Bạch. Giao tận nơi 3-5 ngày qua TAVY Korea.`;
  const cleanDesc = rawDesc.replace(/\s+/g, ' ').slice(0, 160).trim();

  let imgUrl = p.productImage || (Array.isArray(p.images) && p.images[0]) || '';
  if (imgUrl.startsWith('/')) {
    imgUrl = `${BASE_DOMAIN}${imgUrl}`;
  } else if (!imgUrl.startsWith('http')) {
    imgUrl = p.goodsNo ? `${BASE_DOMAIN}/products/${p.goodsNo}.jpg` : `${BASE_DOMAIN}/og-tavy-korea.png`;
  }

  // Schema.org Product
  const schemaProduct = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: p.name,
    image: [imgUrl],
    description: cleanDesc,
    sku: p.goodsNo || 'TAVY-' + (p.id || slug),
    mpn: p.goodsNo,
    brand: {
      '@type': 'Brand',
      name: p.brand || 'Olive Young'
    },
    offers: {
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'VND',
      price: priceVnd,
      priceValidUntil: '2027-12-31',
      availability: p.is_sold_out || p.isSoldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition'
    }
  };

  // Modify HTML head
  let html = baseHtml;

  // Replace Title
  html = html.replace(/<title>.*?<\/title>/gi, `<title>${escapeHtml(pageTitle)}</title>`);

  // Replace or inject Meta Description
  if (html.includes('<meta name="description"')) {
    html = html.replace(/<meta name="description" content=".*?" \/>/gi, `<meta name="description" content="${escapeHtml(cleanDesc)}" />`);
  } else {
    html = html.replace('</head>', `  <meta name="description" content="${escapeHtml(cleanDesc)}" />\n</head>`);
  }

  // Inject or replace OpenGraph
  const ogTags = `<!-- Open Graph SEO Prerender -->
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(cleanDesc)}" />
    <meta property="og:image" content="${escapeHtml(imgUrl)}" />
    <meta property="og:url" content="${escapeHtml(productUrl)}" />
    <meta property="og:type" content="product" />
    <meta property="og:site_name" content="TAVY KOREA" />
    <meta property="og:locale" content="vi_VN" />
    <link rel="canonical" href="${escapeHtml(productUrl)}" />
    <script type="application/ld+json">
${JSON.stringify(schemaProduct, null, 2)}
    </script>`;

  const ogBlockRegex = /<!-- Open Graph -->[\s\S]*?<meta property="og:locale" content="vi_VN" \/>/i;
  if (ogBlockRegex.test(html)) {
    html = html.replace(ogBlockRegex, ogTags);
  } else {
    html = html.replace('</head>', `${ogTags}\n  </head>`);
  }

  // Inject semantic readable HTML into <div id="root">
  const prerenderBody = `
    <div id="root">
      <div class="tavy-prerender-seo-shell" style="max-width:1100px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <nav style="font-size:0.85rem;color:#6B7280;margin-bottom:16px;">
          <a href="/" style="color:#7A4B9E;text-decoration:none;">Trang chủ</a> &gt; 
          <a href="/products" style="color:#7A4B9E;text-decoration:none;">Mỹ phẩm Olive Young</a> &gt; 
          <span>${escapeHtml(p.brand || 'Hàn Quốc')}</span>
        </nav>
        <div style="display:flex;flex-wrap:wrap;gap:32px;align-items:flex-start;">
          <div style="flex:1 1 350px;max-width:480px;">
            <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(p.name)}" style="width:100%;border-radius:12px;border:1px solid #E5E7EB;object-fit:cover;" />
          </div>
          <div style="flex:1 1 350px;">
            <span style="font-size:0.8rem;font-weight:bold;color:#7A4B9E;text-transform:uppercase;">${escapeHtml(p.brand || 'Olive Young')}</span>
            <h1 style="font-size:1.6rem;font-weight:800;color:#111827;margin:8px 0 16px;line-height:1.3;">${escapeHtml(p.name)}</h1>
            <div style="background:#FFF;padding:16px;border-radius:10px;border:1px solid #E5E7EB;margin-bottom:16px;">
              <div style="font-size:1.8rem;font-weight:800;color:#C5A059;">${priceVnd.toLocaleString('vi-VN')} đ</div>
              ${originalPriceVnd > priceVnd ? `<div style="text-decoration:line-through;color:#9CA3AF;font-size:0.95rem;">${originalPriceVnd.toLocaleString('vi-VN')} đ</div>` : ''}
              <div style="font-size:0.8rem;color:#6B7280;margin-top:4px;">Giá niêm yết Olive Young: ${won.toLocaleString()} KRW</div>
            </div>
            <div style="margin-top:16px;color:#374151;line-height:1.6;">
              <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:8px;">Mô tả sản phẩm &amp; Công dụng</h2>
              <p>${escapeHtml(p.description || 'Sản phẩm mua hộ trực tiếp từ Olive Young Hàn Quốc với bill thanh toán minh bạch.')}</p>
            </div>
            <div style="margin-top:20px;">
              <a href="/san-pham/${slug}" style="display:inline-block;background:#7A4B9E;color:#FFFFFF;padding:12px 28px;border-radius:8px;font-weight:bold;text-decoration:none;">
                Đặt Mua Hộ Tại TAVY KOREA
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  html = html.replace('<div id="root"></div>', prerenderBody);

  // Write out prerender files
  const slugDir = join(DIST_DIR, 'san-pham', slug);
  mkdirSync(slugDir, { recursive: true });
  writeFileSync(join(slugDir, 'index.html'), html, 'utf8');

  // Also write direct .html for servers that don't auto-resolve folders
  writeFileSync(join(DIST_DIR, 'san-pham', `${slug}.html`), html, 'utf8');

  // Also support /product/ aliases
  const altDir = join(DIST_DIR, 'product', slug);
  mkdirSync(altDir, { recursive: true });
  writeFileSync(join(altDir, 'index.html'), html, 'utf8');

  sitemapUrls.push({
    loc: productUrl,
    priority: '0.8',
    changefreq: 'weekly'
  });

  prerenderCount++;
}

console.log(`[SEO Prerender] Đã xuất bản thành công ${prerenderCount} trang sản phẩm tĩnh chuẩn SEO!`);

// 3. Generate sitemap.xml
const today = new Date().toISOString().split('T')[0];
let sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

for (const u of sitemapUrls) {
  sitemapContent += `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>\n`;
}

sitemapContent += `</urlset>`;

writeFileSync(join(DIST_DIR, 'sitemap.xml'), sitemapContent, 'utf8');
writeFileSync(join(PUBLIC_DIR, 'sitemap.xml'), sitemapContent, 'utf8');
console.log(`[SEO Prerender] Đã tạo sitemap.xml với ${sitemapUrls.length} liên kết tại dist/sitemap.xml và public/sitemap.xml`);

// 4. Generate robots.txt
const robotsContent = `# Robots.txt for TAVY Korea (https://tavyorder.web.app)
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /admin/*

Sitemap: ${BASE_DOMAIN}/sitemap.xml
`;

writeFileSync(join(DIST_DIR, 'robots.txt'), robotsContent, 'utf8');
writeFileSync(join(PUBLIC_DIR, 'robots.txt'), robotsContent, 'utf8');
console.log(`[SEO Prerender] Đã tạo robots.txt tại dist/robots.txt và public/robots.txt`);
