#!/usr/bin/env node
/**
 * generate_seo_prerender.js
 * -------------------------
 * Automated SEO & GEO (AI Search Engine Optimization) Pipeline for TAVY Korea.
 * 1. Prerenders 290+ product HTML pages with semantic tags, H1, pricing, OpenGraph and Schema.org JSON-LD.
 * 2. Generates canonical sitemap.xml and robots.txt (allowing Google, Bing, GPTBot, PerplexityBot, ClaudeBot).
 * 3. Generates llms.txt & llms-full.txt for Generative AI Search Discovery.
 * 4. Supports direct indexing by Googlebot, Bingbot, and rich link unfurling on Facebook/Zalo/Threads.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
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
  const rawName = product.name_vi || product.name || product.title || product.nameKr || id;
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

// 2. Load product catalogs - prioritize full catalog
let products = [];
const fullAuditedPath = '/Users/tan/Desktop/theasd_auto_bot/tavy_catalog_audited_variants.json';
const playwrightPath = join(PUBLIC_DIR, 'data', 'playwright_scraped_products.json');
const allCatalogPath = join(PUBLIC_DIR, 'data', 'all_products_catalog.json');

for (const pPath of [playwrightPath, fullAuditedPath, allCatalogPath]) {
  if (existsSync(pPath)) {
    try {
      const loaded = JSON.parse(readFileSync(pPath, 'utf8'));
      if (Array.isArray(loaded) && loaded.length > products.length) {
        products = loaded;
      }
    } catch (e) {
      // ignore
    }
  }
}

console.log(`[SEO Prerender] Đã nạp thành công ${products.length} sản phẩm để tối ưu SEO & GEO!`);

const baseHtml = readFileSync(DIST_INDEX, 'utf8');
const BASE_DOMAIN = 'https://tavyorder.web.app';

let prerenderCount = 0;
const sitemapUrls = [
  { loc: `${BASE_DOMAIN}/`, priority: '1.0', changefreq: 'daily' },
  { loc: `${BASE_DOMAIN}/products`, priority: '0.9', changefreq: 'daily' },
  { loc: `${BASE_DOMAIN}/policy`, priority: '0.6', changefreq: 'monthly' },
  { loc: `${BASE_DOMAIN}/orders`, priority: '0.7', changefreq: 'daily' },
  { loc: `${BASE_DOMAIN}/gio-hang`, priority: '0.5', changefreq: 'weekly' }
];

const llmsFullProducts = [];

for (const p of products) {
  if (!p || (!p.goodsNo && !p.id && !p.name)) continue;
  const gid = p.goodsNo || p.id;
  const slug = generateProductSlug(p);
  const productUrl = `${BASE_DOMAIN}/san-pham/${slug}`;

  // Dynamic price calculation respecting Firestore live rates
  const won = Number(p.foreignPrice ?? p.salePrice ?? p.priceKrw ?? p.priceWon ?? p.price) || 0;
  let priceVnd = p.priceVnd;
  if (!priceVnd || priceVnd <= 0) {
    const rate = Number(p.appliedKrwRate) || 20;
    const fee = Number(p.appliedServiceFeePercent) || 30;
    priceVnd = Math.round((won * rate * (1 + fee / 100)) / 1000) * 1000;
  }

  let originalPriceVnd = p.originalPriceVnd;
  const origWon = Number(p.originalPrice || p.originPrice || p.origin_price_krw) || 0;
  if (!originalPriceVnd && origWon > 0) {
    const rate = Number(p.appliedKrwRate) || 20;
    const fee = Number(p.appliedServiceFeePercent) || 30;
    originalPriceVnd = Math.round((origWon * rate * (1 + fee / 100)) / 1000) * 1000;
  }

  const productName = p.name_vi || p.name;
  const brandName = p.brand_vi || p.brand || 'Olive Young';
  const rankLabel = p.rank ? `[Top ${p.rank} Olive Young] ` : '';
  const pageTitle = `${rankLabel}${productName} - Mua Hộ Olive Young | TAVY KOREA`;
  
  const rawDesc = p.description || `Mua hộ ${productName} (${brandName}) chính hãng trực tiếp từ Olive Young Hàn Quốc với quy trình Order 8 Bước Minh Bạch. Giao tận nơi 3-5 ngày qua TAVY KOREA.`;
  const cleanDesc = rawDesc.replace(/\s+/g, ' ').slice(0, 160).trim();

  let imgUrl = p.productImage || (Array.isArray(p.images) && p.images[0]) || p.thumbnailUrl || '';
  if (imgUrl.startsWith('/')) {
    imgUrl = `${BASE_DOMAIN}${imgUrl}`;
  } else if (!imgUrl.startsWith('http')) {
    imgUrl = gid ? `${BASE_DOMAIN}/products/${gid}.jpg` : `${BASE_DOMAIN}/og-tavy-korea.png`;
  }

  // Schema.org Product + BreadcrumbList
  const schemaProduct = {
    '@context': 'https://schema.org/',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${productUrl}#product`,
        name: productName,
        image: [imgUrl],
        description: cleanDesc,
        sku: gid || 'TAVY-' + slug,
        mpn: gid,
        brand: {
          '@type': 'Brand',
          name: brandName
        },
        category: p.category_vi || p.category || 'Mỹ phẩm Hàn Quốc',
        offers: {
          '@type': 'Offer',
          url: productUrl,
          priceCurrency: 'VND',
          price: priceVnd,
          priceValidUntil: '2027-12-31',
          availability: p.is_sold_out || p.isSoldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          itemCondition: 'https://schema.org/NewCondition',
          seller: {
            '@type': 'Organization',
            name: 'TAVY KOREA',
            url: BASE_DOMAIN
          }
        }
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${productUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Trang chủ',
            item: `${BASE_DOMAIN}/`
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Mỹ phẩm Olive Young',
            item: `${BASE_DOMAIN}/products`
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: brandName,
            item: `${BASE_DOMAIN}/products?brand=${encodeURIComponent(brandName)}`
          },
          {
            '@type': 'ListItem',
            position: 4,
            name: productName,
            item: productUrl
          }
        ]
      }
    ]
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

  // Inject OpenGraph & Schema
  const ogTags = `<!-- Open Graph SEO & AI GEO Prerender -->
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

  const ogBlockRegex = /<!-- Open Graph -->[\s\S]*?<link rel="canonical" href=".*?" \/>/i;
  if (ogBlockRegex.test(html)) {
    html = html.replace(ogBlockRegex, ogTags);
  } else {
    html = html.replace('</head>', `${ogTags}\n  </head>`);
  }

  // Inject semantic readable HTML shell into <div id="root">
  const prerenderBody = `
    <div id="root">
      <div class="tavy-prerender-seo-shell" style="max-width:1100px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <nav style="font-size:0.85rem;color:#6B7280;margin-bottom:16px;">
          <a href="/" style="color:#7A4B9E;text-decoration:none;">Trang chủ</a> &gt; 
          <a href="/products" style="color:#7A4B9E;text-decoration:none;">Mỹ phẩm Olive Young</a> &gt; 
          <span>${escapeHtml(brandName)}</span>
        </nav>
        <div style="display:flex;flex-wrap:wrap;gap:32px;align-items:flex-start;">
          <div style="flex:1 1 350px;max-width:480px;">
            <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(productName)}" style="width:100%;border-radius:12px;border:1px solid #E5E7EB;object-fit:cover;" />
          </div>
          <div style="flex:1 1 350px;">
            ${p.rank ? `<span style="display:inline-block;background:#E11D48;color:#FFF;padding:4px 10px;border-radius:6px;font-size:0.8rem;font-weight:bold;margin-bottom:8px;">Top ${p.rank} Bán Chạy Olive Young</span><br/>` : ''}
            <span style="font-size:0.85rem;font-weight:bold;color:#7A4B9E;text-transform:uppercase;">${escapeHtml(brandName)}</span>
            <h1 style="font-size:1.6rem;font-weight:800;color:#111827;margin:8px 0 16px;line-height:1.3;">${escapeHtml(productName)}</h1>
            <div style="background:#FFF;padding:16px;border-radius:10px;border:1px solid #E5E7EB;margin-bottom:16px;">
              <div style="font-size:1.8rem;font-weight:800;color:#C5A059;">${priceVnd.toLocaleString('vi-VN')} đ</div>
              ${originalPriceVnd > priceVnd ? `<div style="text-decoration:line-through;color:#9CA3AF;font-size:0.95rem;">${originalPriceVnd.toLocaleString('vi-VN')} đ</div>` : ''}
              <div style="font-size:0.8rem;color:#6B7280;margin-top:4px;">Giá niêm yết Olive Young: ${won.toLocaleString()} KRW (Quy trình 8 Bước Minh Bạch)</div>
            </div>
            <div style="margin-top:16px;color:#374151;line-height:1.6;">
              <h2 style="font-size:1.1rem;font-weight:700;margin-bottom:8px;">Mô tả sản phẩm &amp; Công dụng</h2>
              <p>${escapeHtml(p.description || 'Sản phẩm mua hộ trực tiếp từ hệ thống Olive Young Hàn Quốc với bill thanh toán minh bạch.')}</p>
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

  // Write out prerender files (both directory and .html file to prevent 301 loops)
  const slugDir = join(DIST_DIR, 'san-pham', slug);
  mkdirSync(slugDir, { recursive: true });
  writeFileSync(join(slugDir, 'index.html'), html, 'utf8');
  writeFileSync(join(DIST_DIR, 'san-pham', `${slug}.html`), html, 'utf8');

  // Also support /product/ aliases
  const altDir = join(DIST_DIR, 'product', slug);
  mkdirSync(altDir, { recursive: true });
  writeFileSync(join(altDir, 'index.html'), html, 'utf8');

  sitemapUrls.push({
    loc: productUrl,
    priority: p.rank ? '0.9' : '0.8',
    changefreq: 'weekly'
  });

  llmsFullProducts.push({
    rank: p.rank || null,
    goodsNo: gid,
    name: productName,
    brand: brandName,
    category: p.category_vi || p.category || 'Mỹ phẩm',
    price_krw: won,
    price_vnd: priceVnd,
    url: productUrl
  });

  prerenderCount++;
}

console.log(`[SEO Prerender] Đã xuất bản thành công ${prerenderCount} trang sản phẩm tĩnh chuẩn SEO & GEO!`);

// 3. Generate llms-full.txt
let llmsFullContent = `# TAVY KOREA - Danh Mục Toàn Bộ Sản Phẩm Mua Hộ Olive Young Hàn Quốc

> Dữ liệu trích xuất tự động cho các mô hình AI (ChatGPT, Perplexity, Claude, Gemini) để tra cứu, trích dẫn và gợi ý sản phẩm.

- Website: https://tavyorder.web.app
- Hotline/Zalo: 0865868247
- Fanpage: https://www.facebook.com/122098145037531964
- Tổng số sản phẩm trong cơ sở dữ liệu: ${llmsFullProducts.length}

## Bảng Danh Sách Sản Phẩm (Kèm Giá Won & Giá VND Về Tay)
`;

for (const it of llmsFullProducts) {
  const rankStr = it.rank ? `[Top ${it.rank}] ` : '';
  llmsFullContent += `- **${rankStr}${it.name}**
  - Thương hiệu: ${it.brand} | Phân loại: ${it.category}
  - Mã hàng (goodsNo): ${it.goodsNo}
  - Giá Olive Young: ${it.price_krw.toLocaleString('vi-VN')} KRW (~${it.price_vnd.toLocaleString('vi-VN')} đ)
  - Link chi tiết: ${it.url}\n\n`;
}

writeFileSync(join(PUBLIC_DIR, 'llms-full.txt'), llmsFullContent, 'utf8');
writeFileSync(join(DIST_DIR, 'llms-full.txt'), llmsFullContent, 'utf8');
if (existsSync(join(PUBLIC_DIR, 'llms.txt'))) {
  copyFileSync(join(PUBLIC_DIR, 'llms.txt'), join(DIST_DIR, 'llms.txt'));
}
console.log(`[SEO Prerender] Đã tạo llms.txt và llms-full.txt với ${llmsFullProducts.length} sản phẩm cho AI Search.`);

// 4. Generate sitemap.xml
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

// 5. Generate robots.txt
const robotsContent = `# Robots.txt for TAVY KOREA (https://tavyorder.web.app)
# Designed for Google, Bing and Generative AI Search Engines (GEO)

User-agent: *
Allow: /
Disallow: /admin/
Disallow: /admin/*

# Authorized AI Search & LLM Crawlers
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: meta-externalagent
Allow: /

Sitemap: ${BASE_DOMAIN}/sitemap.xml
LLM-Reference: ${BASE_DOMAIN}/llms.txt
`;

writeFileSync(join(DIST_DIR, 'robots.txt'), robotsContent, 'utf8');
writeFileSync(join(PUBLIC_DIR, 'robots.txt'), robotsContent, 'utf8');
console.log(`[SEO Prerender] Đã tạo robots.txt cho cả Googlebot và AI Bots.`);
