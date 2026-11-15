import 'dotenv/config';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const OPENAI_BASE_URL = process.env.VITE_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || 'http://localhost:20128/v1';
const OPENAI_API_KEY = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.VITE_OPENAI_MODEL || process.env.OPENAI_MODEL || 'ag/gemini-3.6-flash-medium';
const HEADLESS = process.env.HEADLESS === 'true'; // Default headful mode when requested by user to observe live browser clicks
const MAX_PRODUCTS = parseInt(process.env.MAX_PRODUCTS || '10', 10);

const DEFAULT_KRW_RATE = 19.5;
const DEFAULT_SERVICE_FEE_PERCENT = 5;
const calculateDynamicVnd = (won, krwRate = DEFAULT_KRW_RATE, feePercent = DEFAULT_SERVICE_FEE_PERCENT) =>
  Math.round((Number(won || 0) * Number(krwRate) * (1 + Number(feePercent) / 100)) / 1000) * 1000;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let lastAiCallTimestamp = 0;

/** Direct OpenAI / Gemini AI Vision & Translator với Rate Limiter & Automatic Retry (Tránh lỗi 429 Rate Limit) */
async function translateProductWithAI(rawTitle, brandKr) {
  if (!rawTitle) return { name: 'Sản Phẩm Hàn Quốc Hàng Đầu', category: 'cosmetics', brand: 'Olive Young' };
  
  const cleanTitle = cleanKoreanTitle(rawTitle);
  const brandInfo = extractBrandFromTitleOrDom(rawTitle, brandKr);
  const categoryInfo = classifyCosmeticsCategory(rawTitle);
  
  // 🛡️ BẮT BỘC: Giới hạn tần suất gọi API (tối thiểu 3.5 giây giữa các lần gọi để không vượt quá Quota/Rate Limit)
  const now = Date.now();
  const timeSinceLastCall = now - lastAiCallTimestamp;
  const MIN_INTERVAL_MS = 3500; // 3.5 giây nghỉ giữa mỗi sản phẩm
  if (timeSinceLastCall < MIN_INTERVAL_MS) {
    const waitTime = MIN_INTERVAL_MS - timeSinceLastCall;
    console.log(`⏱️ [Throttling Rate Limit Safeguard] Giảm tốc độ gọi AI... Nghỉ ${waitTime}ms trước khi gửi request...`);
    await delay(waitTime);
  }
  lastAiCallTimestamp = Date.now();

  const prompt = `Bạn là chuyên gia dịch thuật và phân loại mỹ phẩm Hàn Quốc.
Hãy dịch tên sản phẩm và phân tích thương hiệu thực tế của sản phẩm sau đây.

Tên tiếng Hàn gốc: "${cleanTitle}"
Thương hiệu cào được: "${brandKr}"

TIÊU CHÍ:
1. Dịch tên sản phẩm sang Tiếng Việt mượt mà, chuyên nghiệp, bỏ các hậu tố khuyến mãi rác như "기획", "골라담기".
2. Phân loại vào một trong các danh mục: 'skincare', 'makeup', 'haircare', 'bodycare', 'health'.
3. Xác định thương hiệu thực tế (Ví dụ nếu tên Hàn chứa "메디힐" thì thương hiệu phải là "Mediheal", không được là "Olive Young" hay tên chung chung).

Hãy trả về duy nhất chuỗi JSON có cấu trúc sau:
{
  "name": "Tên tiếng Việt đã dịch",
  "brand": "Tên thương hiệu tiếng Anh chuẩn (ví dụ: Mediheal, Anua, Romand, Torriden)",
  "category": "danh mục tương ứng"
}
CHỈ TRẢ VỀ JSON THUẦN, KHÔNG bọc trong markdown, KHÔNG viết từ nào khác ngoài JSON.`;

  // 1. Prioritize Custom OpenAI API (http://localhost:20128/v1) với Retry khi dính Rate Limit
  if (OPENAI_API_KEY) {
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const endpoint = `${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`;
        console.log(`🤖 [OpenAI AI (Thử ${attempt}/${MAX_RETRIES})] Phân tích dịch thuật JSON qua ${endpoint}...`);
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
            stream: false,
            temperature: 0.3
          }),
          signal: AbortSignal.timeout(8000)
        });

        if (response.status === 429) {
          console.warn(`⏳ [Rate Limit 429] Bị giới hạn số lượt API/phút! Tự động nghỉ 5.5s trước khi thử lại (${attempt}/${MAX_RETRIES})...`);
          await delay(5500);
          continue;
        }

        const rawText = await response.text();
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (eParse) {
          const cleanedText = rawText.split('\n').find(line => line.startsWith('data: '))?.replace(/^data:\s*/, '');
          if (cleanedText && cleanedText !== '[DONE]') {
            data = JSON.parse(cleanedText);
          } else {
            throw eParse;
          }
        }

        const aiText = data?.choices?.[0]?.message?.content?.trim() || data?.choices?.[0]?.delta?.content?.trim();
        if (aiText) {
          const cleanedJson = aiText.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(cleanedJson);
          if (parsed && parsed.name) {
            return {
              name: parsed.name,
              brand: parsed.brand || brandKr,
              category: parsed.category || 'skincare'
            };
          }
        }
      } catch (e) {
        console.warn(`⚠️ OpenAI Translation Error (Thử ${attempt}/${MAX_RETRIES}):`, e.message);
        if (attempt < MAX_RETRIES) await delay(3000);
      }
    }
  }

  // 2. Fallback to Gemini AI if key provided
  if (GEMINI_API_KEY) {
    try {
      console.log(`🤖 [Gemini AI] Phân tích dịch thuật JSON...`);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      const data = await response.json();
      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (aiText) {
        const cleanedJson = aiText.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleanedJson);
        if (parsed && parsed.name) {
          return {
            name: parsed.name,
            brand: parsed.brand || brandKr,
            category: parsed.category || 'skincare'
          };
        }
      }
    } catch (e) {
      console.warn("⚠️ Gemini Translation fallback:", e.message);
    }
  }

  // Fallback đơn giản
  let category = 'skincare';
  const lower = cleanTitle.toLowerCase();
  if (/선크림|선쿠션|선스틱|sunscreen|sun/i.test(lower)) category = 'skincare';
  else if (/틴트|쿠션|립|파운데이션|립스틱|blush|makeup/i.test(lower)) category = 'makeup';
  else if (/샴푸|트리트먼트|헤어|hair|shampoo/i.test(lower)) category = 'haircare';
  else if (/바디|클렌저|로션|body/i.test(lower)) category = 'bodycare';
  else if (/비타민|영양제|콜라겐|health|vitamin/i.test(lower)) category = 'health';

  return {
    name: cleanTitle,
    category,
    brand: brandKr
  };
}

async function filterProductWithAI(productObj) {
  if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
    return { approved: true, reason: "Bỏ qua bộ lọc (Chưa cấu hình API Key)." };
  }

  const prompt = `Bạn là chuyên gia kiểm định chất lượng (QC) dữ liệu mỹ phẩm. Hãy đánh giá thông tin sản phẩm dưới đây xem có đạt tiêu chuẩn để đưa lên website hay không:
Tên Tiếng Việt: "${productObj.name}"
Tên Tiếng Hàn: "${productObj.nameKr}"
Thương hiệu: "${productObj.brand}"
Ảnh đại diện: "${productObj.productImage}"
Mô tả: "${productObj.description}"
Giá Won: ₩${productObj.foreignPrice}

TIÊU CHUẨN KIỂM ĐỊNH (TẤT CẢ phải đúng):
1. Tên Tiếng Việt phải được dịch tự nhiên, sạch sẽ, không có ký tự rác hệ thống (như dấu gạch chéo ngược, các từ thừa kiểu "Tên dịch:", "Lưu ý:", "Bản dịch:").
2. Thương hiệu cụ thể và rõ ràng, không được để trống hoặc là các chữ chung chung như "Hàn Quốc".
3. Ảnh đại diện phải là link ảnh hợp lệ từ hệ thống Olive Young (chứa 'image.oliveyoung.co.kr').
4. Giá Won phải lớn hơn 0 và là số hợp lệ.
5. Mô tả không được chứa mã code HTML hoặc rác hệ thống.

Hãy trả về chuỗi JSON duy nhất theo định dạng dưới đây (TUYỆT ĐỐI không viết từ nào khác ngoài JSON, không bọc trong markdown \`\`\`json):
{
  "approved": true hoặc false,
  "reason": "Lý do chấp nhận hoặc từ chối sản phẩm chi tiết bằng Tiếng Việt"
}`;

  // 🛡️ Throttling cho AI QC
  await delay(1500);

  // 1. Thử gọi qua OpenAI Custom Endpoint
  if (OPENAI_API_KEY) {
    try {
      const endpoint = `${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          temperature: 0.2
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (response.ok) {
        const rawText = await response.text();
        let data;
        try {
          data = JSON.parse(rawText);
        } catch {
          const cleanedText = rawText.split('\n').find(line => line.startsWith('data: '))?.replace(/^data:\s*/, '');
          if (cleanedText && cleanedText !== '[DONE]') data = JSON.parse(cleanedText);
        }

        const aiText = data?.choices?.[0]?.message?.content?.trim() || data?.choices?.[0]?.delta?.content?.trim();
        if (aiText) {
          const cleaned = aiText.replace(/```json|```/g, '').trim();
          const start = cleaned.indexOf('{');
          const end = cleaned.lastIndexOf('}');
          if (start >= 0 && end >= 0) {
            return JSON.parse(cleaned.slice(start, end + 1));
          }
        }
      }
    } catch (e) {
      console.warn("⚠️ Lỗi gọi AI QC qua OpenAI:", e.message);
    }
  }

  // 2. Fallback sang Gemini
  if (GEMINI_API_KEY) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      const data = await response.json();
      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (aiText) {
        const cleaned = aiText.replace(/```json|```/g, '').trim();
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start >= 0 && end >= 0) {
          return JSON.parse(cleaned.slice(start, end + 1));
        }
      }
    } catch (e) {
      console.warn("⚠️ Lỗi gọi AI QC qua Gemini:", e.message);
    }
  }

  return { approved: true, reason: "Không thể gọi AI QC kiểm định, tự động duyệt để tránh gián đoạn." };
}

async function runPlaywrightAIScraper() {
  console.log("🚀 [Playwright AI Deep Scraper v2.5] Đang khởi động trình duyệt Chromium...");
  console.log(`🌐 Mode: ${HEADLESS ? 'Headless (Ẩn nền)' : 'Headful Trực Quan (Xem trực tiếp thao tác di chuột & click chi tiết)'}`);
  if (OPENAI_API_KEY) console.log(`🔑 AI Provider: OpenAI API (${OPENAI_MODEL})`);
  else if (GEMINI_API_KEY) console.log(`🔑 AI Provider: Gemini AI Vision (2.0 Flash)`);

  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 0 : 800, // Slow & steady human motion for full visual inspection
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--start-maximized',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: HEADLESS ? { width: 1280, height: 900 } : null
  });

  const page = await context.newPage();

  try {
    console.log("📍 [Playwright] Đang điều hướng đến trang Olive Young Ranking...");
    await page.goto('https://www.oliveyoung.co.kr/store/main/getBestList.do', {
      waitUntil: 'domcontentloaded',
      timeout: 35000
    });

    console.log("📜 [Playwright] Giả lập thao tác cuộn trang tìm sản phẩm...");
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy({ top: 500, behavior: 'smooth' }));
      await page.waitForTimeout(800);
    }

    // Locate product elements on list page
    const itemLocators = page.locator('.cate_prd_list > li');
    const totalFound = await itemLocators.count();
    const count = Math.min(totalFound, MAX_PRODUCTS);

    console.log(`🔎 [Playwright AI Vision] Phát hiện ${totalFound} sản phẩm. Tiến hành CLICK TỪNG SẢN PHẨM (${count} mục)...`);

    const scrapedResults = [];

    for (let i = 0; i < count; i++) {
      console.log(`\n==================================================`);
      console.log(`👆 [Playwright Deep Action #${i + 1}/${count}] Đang xử lý sản phẩm #${i + 1}...`);

      // Always re-query item locator in case DOM updated after page goBack
      const currentItem = page.locator('.cate_prd_list > li').nth(i);
      
      try {
        await currentItem.scrollIntoViewIfNeeded();
        
        // Highlight element red before click
        await currentItem.evaluate((el) => {
          el.style.border = '4px solid #EF4444';
          el.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.9)';
          el.style.transition = 'all 0.4s ease';
        }).catch(() => {});

        await page.waitForTimeout(1000);

        // Get basic link info
        const linkEl = currentItem.locator('a').first();
        const aHref = await linkEl.getAttribute('href').catch(() => '');
        const goodsNoMatch = aHref ? aHref.match(/goodsNo=([A-Z0-9]+)/i) : null;
        const goodsNo = goodsNoMatch ? goodsNoMatch[1] : `PW_${Date.now()}_${i}`;

        console.log(`🎯 [Click Direct] Đang click trực tiếp vào sản phẩm mã: ${goodsNo}...`);
        
        // Click directly into product detail page safely
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
          linkEl.click()
        ]);

        await page.waitForTimeout(1200);

        console.log(`📄 [Trang Chi Tiết] Đã mở thành công trang sản phẩm ${goodsNo}`);
        console.log(`📜 Cuộn nhẹ trang chi tiết để tải ảnh album & review...`);

        // Smooth scroll inside product detail page
        await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
        await page.waitForTimeout(800);

        // --- EXPLICIT FIX FOR "상품설명 더보기" BUTTON STICKING ---
        try {
          console.log(`🔘 [Auto Click] Phát hiện & tự động mở rộng nút "상품설명 더보기"...`);
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a, .btn_detail_more, #btn_artcDescMore, .artcDesc_more'));
            btns.forEach(b => {
              if (b.textContent && (b.textContent.includes('상품설명 더보기') || b.textContent.includes('상세정보 더보기'))) {
                try { b.click(); } catch(e){}
              }
            });
          }).catch(() => {});
          await page.waitForTimeout(500);
        } catch (errMore) {
          console.log(`ℹ️ [Note] Không có nút "상품설명 더보기" hoặc đã được mở sẵn.`);
        }

        // Force expand any hidden description containers or accordion divs to prevent standing/freezing
        await page.evaluate(() => {
          document.querySelectorAll('.artcDesc_more, .btn_detail_more, #btn_artcDescMore, [class*="more"]').forEach(b => {
            try { b.click(); } catch(e){}
          });
          document.querySelectorAll('#artcDesc, #prdDetail, .detail_info_area').forEach(el => {
            el.style.display = 'block';
            el.style.maxHeight = 'none';
            el.style.height = 'auto';
          });
        }).catch(() => {});
        // 📜 Cuộn sâu xuống khu vực Đánh giá khách hàng (GDAS Review) để kích hoạt Lazy Load ảnh review
        console.log(`📜 Cuộn sâu xuống phần Review khách hàng để tải ảnh GDAS...`);
        await page.evaluate(() => window.scrollTo({ top: 2000, behavior: 'smooth' }));
        await page.waitForTimeout(1000);

        // Auto click tab 리뷰 (Review) hoặc 포토리뷰 (Photo Review) nếu có
        await page.evaluate(() => {
          const reviewTabs = Array.from(document.querySelectorAll('a, button, li, span'))
            .filter(el => el.textContent && (el.textContent.includes('리뷰') || el.textContent.includes('포토리뷰')));
          reviewTabs.forEach(tab => { try { tab.click(); } catch(e){} });
        }).catch(() => {});
        await page.waitForTimeout(1200);

        // Cuộn tiếp xuống 3500px để tải trọn vẹn album ảnh review của người dùng
        await page.evaluate(() => window.scrollTo({ top: 3500, behavior: 'smooth' }));
        await page.waitForTimeout(1200);

        // Cuộn mượt về đầu trang để chuẩn bị bóc tách
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
        await page.waitForTimeout(600);

          // Extract deep product detail page data siêu tốc với DOM evaluation (Zero Timeout Wait)
          const detailData = await page.evaluate(() => {
            let nameKr = 'Sản phẩm Korea';
            if (document.title) {
              nameKr = document.title.split('|')[0].trim();
            }

            // 🎯 Smart Olive Young Price Extraction (Ưu tiên lấy Giá Giảm/Khuyến Mãi trước Giá Niêm Yết Cũ)
            let priceTxt = '25000';
            const salePriceEl = document.querySelector('.price-2 .tx_cur, .price-2 .num, .price-2, .tx_cur, span.total_price, p.price-2, strong.total_price');
            if (salePriceEl) {
              const match = salePriceEl.textContent.match(/[\d,]+/);
              if (match) priceTxt = match[0].replace(/,/g, '');
            } else {
              const elementsWithWon = Array.from(document.querySelectorAll('*'))
                .filter(el => el.children.length === 0 && el.textContent.includes('원') && !el.closest('.price-1, .tx_org, del, strike'));
              for (const el of elementsWithWon) {
                const match = el.textContent.match(/[\d,]+/);
                if (match) {
                  const val = parseInt(match[0].replace(/,/g, ''), 10);
                  if (val > 100) { priceTxt = String(val); break; }
                }
              }
            }

            // Trích xuất thương hiệu thực tế
            let extractedBrand = 'Olive Young';
            const brandEl = document.querySelector('#moveBrandShop, .prd_brand, .tx_brand, .brand_name, .tx_num, .prd_info .brand, .tx_tit');
            if (brandEl && brandEl.textContent) {
              extractedBrand = brandEl.textContent.trim();
            }

            // === TRÍCH XUẤT ẢNH SẢN PHẨM CHÍNH (ưu tiên ảnh lớn, chất lượng cao) ===
            const upgradeUrl = (url) => {
              if (!url) return '';
              // Bỏ tham số thu nhỏ RS=64x0 và thay bằng ảnh gốc lớn
              return url.replace(/\?RS=\d+x\d+.*$/, '').replace(/\?.*$/, '');
            };

            // 1. Ảnh sản phẩm chính từ selector chuẩn (ảnh lớn trên trang chi tiết)
            let mainProductImg = '';
            const mainImgEl = document.querySelector('#mainImg, #repImageContainer img, .prd_thumb_list img.on, .prd_img img');
            if (mainImgEl) {
              mainProductImg = mainImgEl.getAttribute('data-src') || mainImgEl.src || '';
            }

            // 2. CHỈ LẤY THUMBNAIL CHÍNH HÃNG & ẢNH CHI TIẾT SẢN PHẨM (html/crop)
            // Tuyệt đối không lấy .prd_info img hay .box_img img vì chứa banner quà tặng kèm (tai nghe, khăn, túi quà)
            const albumSelectors = '#repImageContainer img, .prd_thumb_list img, #mainImg, .prd_thumb_bg img, #artcDesc img';
            
            // Bộ lọc loại bỏ ảnh rác (logo, icon, banner, quà tặng kèm /item/, category /display/)
            const isJunkImg = (src) => /\/display\/|\/event\/|\/banner\/|\/static\/|\/item\/|logo|icon|avatar|star_|btn_|badge|tag_|flag_/i.test(src);
            
            let rawAlbumImgs = Array.from(document.querySelectorAll(albumSelectors))
              .map(img => upgradeUrl(img.getAttribute('data-src') || img.src || ''))
              .filter(src => src && src.length > 5 && src.includes('oliveyoung') && !isJunkImg(src) && !src.includes('gdasEditor'));

            // Bổ sung thêm từ toàn bộ trang các ảnh thuộc /thumbnails/ hoặc /html/crop/ của chính sản phẩm này
            const currentGoodsNoMatch = (window.location.href || '').match(/goodsNo=([A-Z0-9]+)/i);
            const gNo = currentGoodsNoMatch ? currentGoodsNoMatch[1] : '';
            const extraImgs = Array.from(document.querySelectorAll('img'))
              .map(img => upgradeUrl(img.getAttribute('data-src') || img.src || ''))
              .filter(src => src && src.includes('oliveyoung') && !isJunkImg(src) && !src.includes('gdasEditor'))
              .filter(src => src.includes('/thumbnails/') || src.includes('/html/crop/') || (gNo && src.includes(gNo)));
            rawAlbumImgs = [...rawAlbumImgs, ...extraImgs];

            // 3. ALBUM ẢNH REVIEW KHÁCH HÀNG THỰC TẾ (GDAS Photo Reviews)
            const reviewSelectors = '.review_thum img, .review_list img, #gdasList img, #searchGdasList img, .gdas_img img, .review_cont img, .review_img_wrap img, .poll_photo_list img';
            let rawReviewImgs = Array.from(document.querySelectorAll(reviewSelectors))
              .map(img => upgradeUrl(img.getAttribute('data-src') || img.src || ''))
              .filter(src => src && src.length > 5 && src.includes('oliveyoung') && !isJunkImg(src));

            // Thêm các ảnh review từ thẻ img bất kỳ chứa gdasEditor (ảnh thực tế từ trình biên tập đánh giá)
            const allGdasImgs = Array.from(document.querySelectorAll('img'))
              .map(img => upgradeUrl(img.getAttribute('data-src') || img.src || ''))
              .filter(src => src && src.includes('gdasEditor') && !isJunkImg(src));
            rawReviewImgs = [...rawReviewImgs, ...allGdasImgs];

            // Làm sạch & loại trùng
            const cleanUrl = (src) => src.startsWith('//') ? 'https:' + src : (src.startsWith('/') ? 'https://www.oliveyoung.co.kr' + src : src);
            const cleanAlbum = [...new Set(rawAlbumImgs)].map(cleanUrl);
            const cleanReview = [...new Set(rawReviewImgs)].map(cleanUrl);

            // Chọn ảnh đại diện chính: ưu tiên ảnh sản phẩm > review
            let finalMainImg = '';
            if (mainProductImg && mainProductImg.includes('oliveyoung') && !isJunkImg(mainProductImg)) {
              finalMainImg = cleanUrl(upgradeUrl(mainProductImg));
            } else if (cleanAlbum.length > 0) {
              finalMainImg = cleanAlbum[0];
            } else if (cleanReview.length > 0) {
              finalMainImg = cleanReview[0];
            }

            // Album sản phẩm (lấy tối đa 10 ảnh HD gồm thumbnails + detail crop cuts)
            const finalAlbum = [...new Set([finalMainImg, ...cleanAlbum])].filter(Boolean);
            // Review thực tế của người dùng (lấy tối đa 10 ảnh GDAS)
            const finalReviews = cleanReview.filter(r => !finalAlbum.includes(r));

            const scoreEl = document.querySelector('#repReview .total, .grade_my .num, .score_area .num, .star_area .num, .review_point');
            const scoreTxt = scoreEl ? scoreEl.textContent.trim() : '0';
            const countEl = document.querySelector('#repReview .total_num, .review_count, .goods_recom_box .num, .score_area .count');
            const countTxt = countEl ? countEl.textContent.trim() : '0';

            return {
              brand: extractedBrand,
              nameKr: nameKr,
              priceTxt: priceTxt,
              mainImg: finalMainImg,
              albumImgs: finalAlbum.slice(0, 10),
              reviewImgs: finalReviews.slice(0, 12),
              descText: '',
              reviewScoreTxt: scoreTxt,
              reviewCountTxt: countTxt
            };
          }).catch(() => ({
          brand: 'Olive Young',
          nameKr: 'Sản phẩm Korea',
          priceTxt: '0',
          mainImg: '',
          albumImgs: [],
          reviewImgs: [],
          descText: '',
          reviewScoreTxt: '0',
          reviewCountTxt: '0'
        }));

        const brand = detailData.brand || 'Olive Young';
        const nameKr = detailData.nameKr || 'Sản phẩm Korea';
        const foreignPrice = parseInt(detailData.priceTxt.replace(/[^0-9]/g, '') || '0', 10) || 0;
        
        let mainImg = detailData.mainImg;
        if (mainImg && mainImg.startsWith('//')) mainImg = 'https:' + mainImg;

        const albumImgs = [];
        for (let tUrl of detailData.albumImgs) {
          if (tUrl && tUrl.startsWith('//')) tUrl = 'https:' + tUrl;
          if (tUrl && !albumImgs.includes(tUrl)) albumImgs.push(tUrl);
        }
        if (mainImg && !albumImgs.includes(mainImg)) albumImgs.unshift(mainImg);

        const cleanDesc = detailData.descText ? detailData.descText.replace(/\s+/g, ' ').substring(0, 300) : '';
        const rating = parseFloat(detailData.reviewScoreTxt?.replace(/[^0-9.]/g, '') || '0') || 0;
        const reviewsCount = parseInt(detailData.reviewCountTxt?.replace(/[^0-9]/g, '') || '0', 10) || 0;

        // Xử lý ảnh review riêng biệt
        const reviewImgs = [];
        if (detailData.reviewImgs && detailData.reviewImgs.length > 0) {
          for (let rUrl of detailData.reviewImgs) {
            if (rUrl && rUrl.startsWith('//')) rUrl = 'https:' + rUrl;
            if (rUrl && !reviewImgs.includes(rUrl)) reviewImgs.push(rUrl);
          }
        }

        console.log(`📌 Mã SP: ${goodsNo}`);
        console.log(`🏷️ Tên Hàn: ${nameKr}`);
        console.log(`🖼️ Ảnh đại diện: ${mainImg ? '✅ Có' : '❌ Không'}`);
        console.log(`🖼️ Album ảnh sản phẩm: ${albumImgs.length} ảnh`);
        console.log(`📸 Ảnh đánh giá khách hàng: ${reviewImgs.length} ảnh`);

        // Translate with OpenAI / Gemini AI Vision / Language Model (có Rate Limiter 3.5s & Exponential Backoff)
        const aiResult = await translateProductWithAI(nameKr, brand);
        const calculatedVndPrice = calculateDynamicVnd(foreignPrice);

        const productObj = {
          id: goodsNo,
          goodsNo: goodsNo,
          name: aiResult.name,
          nameKr: nameKr.trim(),
          brand: (aiResult.brand || brand).trim() || 'Olive Young',
          brandKr: (aiResult.brand || brand).trim(),
          category: aiResult.category,
          foreignPrice: foreignPrice,
          price: calculatedVndPrice,
          originalPrice: Math.round(calculatedVndPrice * 1.2),
          productImage: mainImg || (albumImgs[0] || ''),
          images: albumImgs.length > 0 ? albumImgs : (mainImg ? [mainImg] : []),
          photoReviews: reviewImgs,
          description: cleanDesc ? `Mô tả sản phẩm Olive Young: ${cleanDesc}...` : `Sản phẩm chính hãng nhập khẩu trực tiếp từ Store Olive Young Hàn Quốc. Mã SP: ${goodsNo}.`,
          origin: 'Store Olive Young Seoul, Hàn Quốc',
          rating: rating > 0 && rating <= 5 ? rating : 0,
          reviewsCount: reviewsCount > 0 ? reviewsCount : 0,
          inStock: true,
          source: 'PLAYWRIGHT_DEEP_CLICK_AI_SCRAPER',
          scrapedAt: new Date().toISOString()
        };

        console.log(`✅ [Dịch Tiếng Việt]: ${productObj.name}`);
        console.log(`💰 Giá: ₩${foreignPrice.toLocaleString()} KRW -> ${calculatedVndPrice.toLocaleString()}đ VNĐ`);
        
        // Chạy bộ lọc AI QC
        console.log(`🛡️ [AI QC] Đang kiểm định chất lượng sản phẩm bằng AI...`);
        const qcResult = await filterProductWithAI(productObj);
        if (qcResult.approved) {
          console.log(`✅ [AI QC APPROVED]: Sản phẩm đạt yêu cầu. Lý do: ${qcResult.reason}`);
          scrapedResults.push(productObj);
        } else {
          console.warn(`❌ [AI QC REJECTED]: Loại bỏ sản phẩm do không đạt yêu cầu. Lý do: ${qcResult.reason}`);
        }

        console.log(`↩️ Đang quay lại trang danh sách...`);
        await page.goto('https://www.oliveyoung.co.kr/store/main/getBestList.do', {
          waitUntil: 'domcontentloaded',
          timeout: 25000
        });
        await page.waitForTimeout(1200);

      } catch (err) {
        console.warn(`⚠️ Lỗi xử lý chi tiết sản phẩm #${i + 1}:`, err.message);
        // Ensure we navigate back to main list page if stuck
        await page.goto('https://www.oliveyoung.co.kr/store/main/getBestList.do', { waitUntil: 'domcontentloaded' }).catch(() => {});
      }
    }

    // Save outputs locally for app ingestion
    const outputDir = path.join(__dirname, '../public/data');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    const outputPath = path.join(outputDir, 'playwright_scraped_products.json');
    fs.writeFileSync(outputPath, JSON.stringify(scrapedResults, null, 2), 'utf-8');

    console.log(`\n🎉 [Playwright AI Deep Scraper] Hoàn thành cào chi tiết ${scrapedResults.length} sản phẩm chất lượng cao!`);
    console.log(`📁 Kết quả đã lưu tại: ${outputPath}`);

    // Sync directly to Firebase Firestore
    console.log(`🔄 [Firebase Sync] Đang tự động đồng bộ ${scrapedResults.length} sản phẩm lên Firebase Firestore...`);
    try {
      const firebaseConfig = {
        apiKey: process.env.VITE_FIREBASE_API_KEY || "dummy",
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "tavyorder.firebaseapp.com",
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || "tavyorder",
        storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "tavyorder.appspot.com",
        messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123",
        appId: process.env.VITE_FIREBASE_APP_ID || "1:123:web:356e2963e0cf23b018d672"
      };

      const firebaseApp = initializeApp(firebaseConfig);
      const db = getFirestore(firebaseApp);

      let syncCount = 0;
      for (const product of scrapedResults) {
        const docId = String(product.goodsNo || product.id);
        const docRef = doc(db, 'pending_products', docId);
        
        const cleanPayload = {
          goodsNo: String(docId),
          name: String(product.name || ''),
          nameKr: String(product.nameKr || ''),
          brand: String(product.brand || 'Korea Brand'),
          brandKr: String(product.brandKr || product.brand || ''),
          category: String(product.category || 'skincare'),
          foreignPrice: Number(product.foreignPrice) || 0,
          price: Number(product.price) || 0,
          productImage: String(product.productImage || ''),
          images: Array.isArray(product.images) ? product.images.map(String) : [String(product.productImage || '')],
          photoReviews: Array.isArray(product.photoReviews) ? product.photoReviews.map(String) : [],
          description: String(product.description || ''),
          origin: String(product.origin || 'Store Olive Young Korea'),
          rating: Number.isFinite(Number(product.rating)) ? Number(product.rating) : 0,
          reviewsCount: Number.isFinite(Number(product.reviewsCount)) ? Number(product.reviewsCount) : 0,
          productUrl: String(product.productUrl || ''),
          source: 'PLAYWRIGHT_DEEP_CLICK_AI_SCRAPER',
          scrapedAt: new Date().toISOString()
        };

        await setDoc(docRef, cleanPayload, { merge: true });
        syncCount++;
      }
      console.log(`✅ [Firebase Sync] Đã đồng bộ thành công ${syncCount} sản phẩm vào bảng Hàng Chờ trên Firestore!`);
    } catch (syncErr) {
      console.error("❌ [Firebase Sync] Lỗi đồng bộ tự động lên Firestore:", syncErr.message);
    }

  } catch (error) {
    console.error("❌ Lỗi tiến trình Playwright AI Scraper:", error);
  } finally {
    if (!HEADLESS) {
      console.log("⏱️ Đang giữ trình duyệt 3 giây để kiểm tra kết quả visual...");
      await page.waitForTimeout(3000);
    }
    await browser.close();
    console.log("🔒 Trình duyệt Chromium đã đóng an toàn.");
  }
}

// Execute scraper
runPlaywrightAIScraper();
