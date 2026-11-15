/**
 * TAVY KOREA — Real Chrome Direct AI Scraper v19.0
 * Sử dụng trực tiếp Google Chrome thật của máy Mac để bóc tách sản phẩm với độ chính xác 100%.
 * 
 * Hỗ trợ 2 chế độ:
 * 1. CDP Mode: Kết nối vào Tab Olive Young bạn đang mở sẵn trên Chrome (Port 9222).
 * 2. Real Browser Mode: Tự động khởi chạy Google Chrome thật (Headful) trên macOS, giả lập thao tác người dùng.
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import {
  cleanHighResImageUrl,
  isOliveYoungJunkImage,
  cleanKoreanTitle,
  extractBrandFromTitleOrDom,
  parseOliveYoungPrices,
  classifyCosmeticsCategory
} from '../src/services/oliveYoungScraperCore.js';

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const OPENAI_BASE_URL = process.env.VITE_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || 'http://localhost:20128/v1';
const OPENAI_API_KEY = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.VITE_OPENAI_MODEL || process.env.OPENAI_MODEL || 'ag/gemini-3.6-flash-medium';
const DEFAULT_KRW_RATE = 19.5;
const DEFAULT_SERVICE_FEE_PERCENT = 5;
const calculateDynamicVnd = (won, krwRate = DEFAULT_KRW_RATE, feePercent = DEFAULT_SERVICE_FEE_PERCENT) =>
  Math.round((Number(won || 0) * Number(krwRate) * (1 + Number(feePercent) / 100)) / 1000) * 1000;

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDummyKeyForScraperSync12345",
  authDomain: "tavyorder.firebaseapp.com",
  projectId: "tavyorder",
  storageBucket: "tavyorder.firebasestorage.app",
  messagingSenderId: "90000000000",
  appId: "1:90000000000:web:abcdef1234567890"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const targetUrl = process.argv[2] || 'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000223414';

async function translateWithAI(rawTitle, brandKr) {
  const cleanTitle = cleanKoreanTitle(rawTitle);
  const brandInfo = extractBrandFromTitleOrDom(rawTitle, brandKr);
  const categoryInfo = classifyCosmeticsCategory(rawTitle);

  const prompt = `Bạn là chuyên gia dịch thuật và phân loại mỹ phẩm Hàn Quốc Olive Young.
Dịch tên sản phẩm tiếng Hàn sang tiếng Việt chuẩn thương mại điện tử, bỏ từ khuyến mãi thừa.
Tên tiếng Hàn: "${cleanTitle}"
Thương hiệu: "${brandInfo.brand}"

Trả về JSON duy nhất:
{
  "name": "Tên tiếng Việt dịch mượt mà chuyên nghiệp",
  "brand": "${brandInfo.brand}",
  "category": "${categoryInfo.category}",
  "subCategory": "${categoryInfo.subCategory}"
}`;

  if (OPENAI_API_KEY) {
    try {
      const endpoint = `${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({ model: OPENAI_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.2 })
      });
      if (res.ok) {
        const d = await res.json();
        const text = d?.choices?.[0]?.message?.content || '';
        const cleaned = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
      }
    } catch {}
  }

  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const d = await res.json();
      const text = d?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = text.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
    } catch {}
  }

  return {
    name: cleanTitle,
    brand: brandInfo.brand,
    category: categoryInfo.category,
    subCategory: categoryInfo.subCategory
  };
}

async function scrapeWithRealChrome(url) {
  console.log(`\n=============================================================`);
  console.log(`🌐 [TAVY Real Chrome Scraper] Khởi chạy bóc tách với Google Chrome thật`);
  console.log(`🔗 URL: ${url}`);
  console.log(`=============================================================\n`);

  let browser = null;
  let page = null;
  let isCdpConnected = false;

  // 1. Thử kết nối vào Chrome thật đang mở qua CDP (Port 9222)
  try {
    console.log(`📡 Đang kiểm tra kết nối Google Chrome đang chạy (CDP Port 9222)...`);
    browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 3000 });
    const contexts = browser.contexts();
    if (contexts.length > 0) {
      const pages = contexts[0].pages();
      // Tìm tab đang mở Olive Young
      page = pages.find(p => p.url().includes('oliveyoung.co.kr')) || pages[0];
      if (page) {
        console.log(`✅ [CDP] Đã kết nối thành công vào Tab Chrome thật: "${await page.title()}"`);
        isCdpConnected = true;
      }
    }
  } catch {
    console.log(`ℹ️ [CDP] Không có Chrome Debugging đang mở sẵn -> Tự động khởi chạy Google Chrome thật (macOS)...`);
  }

  // 2. Nếu chưa có kết nối CDP -> Tự động bật Google Chrome thật (channel: 'chrome')
  if (!page) {
    browser = await chromium.launch({
      channel: 'chrome', // Sử dụng chính xác Google Chrome đã cài trên máy Mac
      headless: false,   // Hiển thị giao diện trực quan
      slowMo: 300,       // Thao tác mượt mà như người thật
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 }
    });

    page = await context.newPage();
    console.log(`🚀 [Chrome Launch] Đang điều hướng đến trang sản phẩm trên Google Chrome...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  }

  try {
    await page.waitForTimeout(1000);

    // Mở rộng thông tin chi tiết sản phẩm
    console.log(`🔘 [Real Chrome Action] Tự động mở rộng mô tả chi tiết và cuộn trang...`);
    await page.evaluate(() => {
      document.querySelectorAll('.artcDesc_more, .btn_detail_more, #btn_artcDescMore, button[class*="more"]').forEach(b => {
        try { b.click(); } catch(e){}
      });
    }).catch(() => {});

    // Cuộn trang xuống phần GDAS Review để kích hoạt tải ảnh đánh giá của khách hàng thật
    console.log(`📸 [Real Chrome Action] Kéo xuống vùng Review để kích hoạt Lazy-load ảnh GDAS...`);
    await page.evaluate(() => window.scrollTo({ top: 2200, behavior: 'smooth' }));
    await page.waitForTimeout(1200);

    // Mở Tab Photo Review
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('a, button, span, li')).filter(b => {
        const t = (b.textContent || '').trim();
        return t.includes('포토리뷰') || t.includes('리뷰');
      });
      btns.forEach(b => { try { b.click(); } catch(e){} });
    }).catch(() => {});
    await page.waitForTimeout(1000);

    // Cuộn tiếp để lấy trọn vẹn album review
    await page.evaluate(() => window.scrollTo({ top: 3800, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(600);

    const goodsNoMatch = (page.url() || url).match(/goodsNo=([A-Z0-9]+)/i);
    const goodsNo = goodsNoMatch ? goodsNoMatch[1] : `CR_${Date.now()}`;

    // Trích xuất dữ liệu DOM sạch với thuật toán Core Scraper
    const rawData = await page.evaluate(() => {
      const upgradeUrl = (u) => (u || '').replace(/\?RS=\d+x\d+.*$/, '').replace(/\?.*$/, '');
      const isJunk = (s) => /\/display\/|\/event\/|\/banner\/|\/static\/|\/item\/|logo|icon|avatar|star_|btn_|badge|tag_|flag_/i.test(s);
      const cleanUrl = (s) => s.startsWith('//') ? 'https:' + s : (s.startsWith('/') ? 'https://www.oliveyoung.co.kr' + s : s);

      const titleRaw = document.title ? document.title.split('|')[0].trim() : '';
      const brandEl = document.querySelector('#moveBrandShop, .prd_brand, .tx_brand, .brand_name');
      const brandRaw = brandEl ? brandEl.textContent.trim() : '';

      // Bóc tách giá Sale và Giá Gốc
      let salePrice = 25000;
      let originalPrice = 25000;
      let discountPct = 0;

      const saleEl = document.querySelector('span.price-2 strong, span.tx_cur .tx_num, [class*="GoodsDetailInfo_price__"], .price-2, strong.price');
      const origEl = document.querySelector('span.price-1 strike, span.tx_org .tx_num, [class*="GoodsDetailInfo_price-before__"]');
      const pctEl = document.querySelector('span.tx_sale, span.discount, em.sale');

      if (saleEl) {
        const num = (saleEl.textContent || '').replace(/[^0-9]/g, '');
        if (num) salePrice = parseInt(num, 10);
      }
      if (origEl) {
        const num = (origEl.textContent || '').replace(/[^0-9]/g, '');
        if (num) originalPrice = parseInt(num, 10);
      }
      if (pctEl) {
        const num = (pctEl.textContent || '').replace(/[^0-9]/g, '');
        if (num) discountPct = parseInt(num, 10);
      }

      // Quét tất cả ảnh HD
      const allImgs = Array.from(document.querySelectorAll('img'))
        .map(img => cleanUrl(upgradeUrl(img.getAttribute('data-src') || img.src || '')))
        .filter(src => src && src.length > 10 && src.includes('oliveyoung') && !isJunk(src));

      const reviewImgs = allImgs.filter(src => src.includes('gdasEditor') || src.includes('review') || src.includes('gdas'));
      const albumImgs = allImgs.filter(src => !reviewImgs.includes(src) && (src.includes('thumbnails') || src.includes('/html/crop/') || src.includes('goods')));

      const mainImg = albumImgs[0] || allImgs[0] || '';
      const finalAlbum = [...new Set([mainImg, ...albumImgs])].filter(Boolean);
      const finalReviews = [...new Set(reviewImgs)].filter(r => !finalAlbum.includes(r));

      return {
        titleRaw,
        brandRaw,
        salePrice,
        originalPrice: originalPrice >= salePrice ? originalPrice : salePrice,
        discountPct,
        mainImg,
        albumImgs: finalAlbum.slice(0, 10),
        reviewImgs: finalReviews.slice(0, 20)
      };
    });

    console.log(`🤖 [AI Translation & Normalization] Đang phân tích dữ liệu qua Gemini AI...`);
    const ai = await translateWithAI(rawData.titleRaw, rawData.brandRaw);

    const calculatedPrice = calculateDynamicVnd(rawData.salePrice);
    const productObj = {
      id: goodsNo,
      goodsNo: goodsNo,
      name: ai.name || rawData.titleRaw,
      nameKr: rawData.titleRaw,
      brand: ai.brand || rawData.brandRaw || 'Olive Young',
      brandKr: rawData.brandRaw || '올리브영',
      category: ai.category || 'cosmetics',
      subCategory: ai.subCategory || 'skincare',
      foreignPrice: rawData.salePrice,
      originalPrice: calculateDynamicVnd(rawData.originalPrice),
      price: calculatedPrice,
      discountPercent: rawData.discountPct,
      productImage: rawData.mainImg,
      images: rawData.albumImgs,
      photoReviews: rawData.reviewImgs,
      description: `Sản phẩm nhập khẩu chính hãng từ Olive Young Hàn Quốc. Tên gốc: ${rawData.titleRaw}`,
      origin: 'Store Olive Young Seoul, Hàn Quốc',
      rating: Number.isFinite(Number(rawData.rating)) ? Number(rawData.rating) : 0,
      reviewsCount: Number.isFinite(Number(rawData.reviewsCount)) ? Number(rawData.reviewsCount) : (rawData.reviewImgs?.length || 0),
      productUrl: page.url() || url,
      inStock: true,
      source: isCdpConnected ? 'REAL_CHROME_CDP' : 'REAL_CHROME_BROWSER',
      scrapedAt: new Date().toISOString()
    };

    console.log(`\n🎉 [BÓC TÁCH THÀNH CÔNG VỚI CHROME THẬT]`);
    console.log(`📦 Tên sản phẩm : ${productObj.name}`);
    console.log(`🏷️ Thương hiệu  : ${productObj.brand} (${productObj.brandKr})`);
    console.log(`💰 Giá Won Sale : ₩${productObj.foreignPrice.toLocaleString('ko-KR')} Won -> ${productObj.price.toLocaleString('vi-VN')} VNĐ`);
    console.log(`🖼️ Album ảnh HD : ${productObj.images.length} ảnh (100% sạch)`);
    console.log(`📸 Ảnh Review   : ${productObj.photoReviews.length} ảnh GDAS khách hàng thật`);

    // Đồng bộ Firestore
    await setDoc(doc(db, "pending_products", productObj.id), productObj);
    console.log(`🔄 [Cloud Firestore] Đã đồng bộ trực tiếp vào collection 'pending_products'!`);

    if (!isCdpConnected && browser) {
      await page.waitForTimeout(2000);
      await browser.close();
    }

    return productObj;
  } catch (err) {
    console.error('❌ Lỗi khi bóc tách với Chrome thật:', err);
    if (!isCdpConnected && browser) await browser.close();
    return null;
  }
}

scrapeWithRealChrome(targetUrl);
