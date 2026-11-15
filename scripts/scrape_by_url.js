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

const targetUrl = process.env.PRODUCT_URL || process.argv[2] || 'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=A000000223414';

async function scrapeSingleProductByUrl(url) {
  console.log(`🚀 [Playwright Single URL Scraper v19.0] Đang mở đường dẫn: ${url}`);
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(1000);

    // Mở rộng thông tin
    await page.evaluate(() => {
      document.querySelectorAll('.artcDesc_more, .btn_detail_more, #btn_artcDescMore').forEach(b => { try { b.click(); } catch(e){} });
    }).catch(() => {});

    // Cuộn trang tải ảnh review GDAS
    await page.evaluate(() => window.scrollTo({ top: 2000, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('a, button, span')).filter(b => b.textContent && b.textContent.includes('포토리뷰'));
      btns.forEach(b => { try { b.click(); } catch(e){} });
    }).catch(() => {});
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo({ top: 3500, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(500);

    const goodsNoMatch = url.match(/goodsNo=([A-Z0-9]+)/i);
    const goodsNo = goodsNoMatch ? goodsNoMatch[1] : `SP_${Date.now()}`;

    const detailData = await page.evaluate(() => {
      let nameKr = document.title ? document.title.split('|')[0].trim() : 'Sản phẩm Olive Young';
      let brand = 'Olive Young';
      const brandEl = document.querySelector('#moveBrandShop, .prd_brand, .tx_brand, .brand_name');
      if (brandEl && brandEl.textContent) brand = brandEl.textContent.trim();

      // Bóc tách giá chuẩn
      let priceWon = 25000;
      let origPriceWon = 25000;
      const saleEl = document.querySelector('span.price-2 strong, span.tx_cur .tx_num, [class*="GoodsDetailInfo_price__"], .price-2, strong.price');
      const origEl = document.querySelector('span.price-1 strike, span.tx_org .tx_num, [class*="GoodsDetailInfo_price-before__"]');
      if (saleEl) {
        const num = (saleEl.textContent || '').replace(/[^0-9]/g, '');
        if (num) priceWon = parseInt(num, 10);
      }
      if (origEl) {
        const num = (origEl.textContent || '').replace(/[^0-9]/g, '');
        if (num) origPriceWon = parseInt(num, 10);
      }

      // Quét tất cả thẻ img sạch trên trang
      const upgradeUrl = (u) => (u || '').replace(/\?RS=\d+x\d+.*$/, '').replace(/\?.*$/, '');
      const isJunkImg = (src) => /\/display\/|\/event\/|\/banner\/|\/static\/|\/item\/|logo|icon|avatar|star_|btn_|badge|tag_|flag_/i.test(src);
      const cleanUrl = (s) => s.startsWith('//') ? 'https:' + s : (s.startsWith('/') ? 'https://www.oliveyoung.co.kr' + s : s);

      const allImgs = Array.from(document.querySelectorAll('img'))
        .map(img => cleanUrl(upgradeUrl(img.getAttribute('data-src') || img.src || '')))
        .filter(src => src && src.length > 10 && src.includes('oliveyoung') && !isJunkImg(src));

      // Phân loại: Ảnh review GDAS vs Ảnh sản phẩm HD (thumbnails / crop)
      const reviewImgs = allImgs.filter(src => src.includes('gdasEditor') || src.includes('review') || src.includes('gdas'));
      const albumImgs = allImgs.filter(src => !reviewImgs.includes(src) && (src.includes('thumbnails') || src.includes('/html/crop/') || src.includes('goods')));

      const finalMain = albumImgs[0] || (allImgs[0] || '');
      const finalAlbum = [...new Set([finalMain, ...albumImgs])].filter(Boolean);
      const finalReviews = [...new Set(reviewImgs)].filter(r => !finalAlbum.includes(r));

      return {
        brand,
        nameKr,
        foreignPrice: priceWon,
        originalPrice: origPriceWon >= priceWon ? origPriceWon : priceWon,
        mainImg: finalMain,
        albumImgs: finalAlbum.slice(0, 10),
        reviewImgs: finalReviews.slice(0, 12)
      };
    });

    const brandInfo = extractBrandFromTitleOrDom(detailData.nameKr, detailData.brand);
    const categoryInfo = classifyCosmeticsCategory(detailData.nameKr, '');

    const calculatedPrice = calculateDynamicVnd(detailData.foreignPrice);
    const productObj = {
      id: goodsNo,
      goodsNo: goodsNo,
      name: detailData.nameKr,
      nameKr: detailData.nameKr,
      brand: brandInfo.brand || detailData.brand,
      brandKr: brandInfo.brandKr || detailData.brand,
      category: categoryInfo.category,
      subCategory: categoryInfo.subCategory,
      foreignPrice: detailData.foreignPrice,
      price: calculatedPrice,
      originalPrice: calculateDynamicVnd(detailData.originalPrice),
      productImage: detailData.mainImg,
      images: detailData.albumImgs,
      photoReviews: detailData.reviewImgs,
      description: `Sản phẩm nhập khẩu chính hãng từ Olive Young Korea. Mã SP: ${goodsNo}`,
      origin: 'Store Olive Young Seoul, Hàn Quốc',
      rating: Number.isFinite(Number(detailData.rating)) ? Number(detailData.rating) : 0,
      reviewsCount: Number.isFinite(Number(detailData.reviewsCount)) ? Number(detailData.reviewsCount) : (detailData.reviewImgs?.length || 0),
      productUrl: url,
      inStock: true,
      source: 'PLAYWRIGHT_SINGLE_URL_SCRAPER',
      scrapedAt: new Date().toISOString()
    };

    console.log(`✅ [Playwright URL Scraper] Đã bóc tách thành công sản phẩm: ${productObj.name}`);
    console.log(`🖼️ Album ảnh: ${productObj.images.length} | 📸 Ảnh review: ${productObj.photoReviews.length}`);

    // Đồng bộ Firestore
    await setDoc(doc(db, "pending_products", productObj.id), productObj);
    console.log(`🔄 [Firestore] Đã đồng bộ trực tiếp sản phẩm ${productObj.id} vào pending_products!`);

    await browser.close();
    return productObj;
  } catch (err) {
    console.error('❌ Lỗi cào sản phẩm theo URL:', err);
    await browser.close();
    return null;
  }
}

scrapeSingleProductByUrl(targetUrl);
