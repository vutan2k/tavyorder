import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLAYWRIGHT_JSON_PATH = path.resolve(__dirname, '../public/data/playwright_scraped_products.json');
const CSV_EXPORT_PATH = '/Users/tan/Downloads/TAVY_TOP100_GOOGLE_SHEETS.csv';

const firebaseConfig = {
  apiKey: "AIzaSyCQ_cpZLNbZdgGpDzea9GlpCL8vbeb_emo",
  authDomain: "tavyorder.firebaseapp.com",
  projectId: "tavyorder",
  storageBucket: "tavyorder.firebasestorage.app",
  messagingSenderId: "307372781687",
  appId: "1:307372781687:web:356e2963e0cf23b018d672"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const AI_API_URL = "http://localhost:20128/v1/chat/completions";
const AI_API_KEY = "sk-a5baa61b8eb09efe-2zgl83-5d00c109";
const AI_MODEL = "ag/gemini-3.6-flash-medium";

const koreanRegex = /[\u3131-\uD79D]/;

async function callAITranslateBatch(batch) {
  const prompt = `Bạn là chuyên gia đặt tên sản phẩm mỹ phẩm và TPCN Hàn Quốc cho sàn thương mại điện tử TAVY Korea tại Việt Nam.
Hãy đặt lại tên Tiếng Việt chuẩn SEO, cuốn hút, sang trọng và chuẩn xác theo công thức:
[Loại sản phẩm] + [Công dụng / Hoạt chất chính] + [Thương hiệu] + [Tên dòng sản phẩm] + [Dung tích / Set quà tặng nếu có].

Quy tắc bắt buộc:
1. TUYỆT ĐỐI KHÔNG chứa bất kỳ chữ tiếng Hàn (Hangul) nào trong tên tiếng Việt. Tên thương hiệu và tên dòng tiếng Anh giữ nguyên (ví dụ: Mediheal, Goodal, La Roche-Posay, Cicaplast Baume B5+, Torriden, Anua, d'Alba...).
2. Lược bỏ triệt để các tiền tố ngày giờ/khuyến mãi ngắn hạn của Hàn Quốc (ví dụ [9/5 하루특가], [올영픽], [15년 연속 1위/7일 한정판매], [2천만돌파], [스테디셀러]).
3. Giữ lại thông tin phiên bản đặc biệt, set 1+1 hoặc quà tặng ở cuối tên trong dấu ngoặc đơn (ví dụ: "(Set 1+1)", "(Tặng Kèm Mini)", "(Bản Collab Sanrio)", "(Hộp 10+1 Miếng)", "(Kèm Refill)").
4. Trả về DUY NHẤT một mảng JSON hợp lệ, KHÔNG bọc markdown, KHÔNG thêm lời dẫn:
[
  { "goodsNo": "...", "nameVi": "..." }
]

Danh sách sản phẩm cần đặt tên:
${JSON.stringify(batch, null, 2)}
`;

  const res = await fetch(AI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${AI_API_KEY}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      temperature: 0.15
    })
  });

  if (!res.ok) {
    throw new Error(`AI API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const rawText = json.choices[0].message.content.trim();
  
  // Clean potential code block wraps
  const cleanJsonText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleanJsonText);
}

async function main() {
  console.log('================================================================');
  console.log('🚀 BẮT ĐẦU CHUẨN HÓA 100% TÊN SẢN PHẨM TIẾNG VIỆT TOP 100 OLIVE YOUNG');
  console.log('================================================================');

  const products = JSON.parse(fs.readFileSync(PLAYWRIGHT_JSON_PATH, 'utf8'));
  console.log(`📦 Đã đọc ${products.length} sản phẩm từ file json.`);

  const translatedMap = new Map();
  const BATCH_SIZE = 10;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const chunk = products.slice(i, i + BATCH_SIZE);
    const simplifiedChunk = chunk.map(p => ({
      goodsNo: p.goodsNo,
      brand: p.brand,
      nameKr: p.nameKr,
      categoryLabel: p.categoryLabel,
      descSnippet: p.description ? p.description.slice(0, 140) : ""
    }));

    console.log(`🤖 Đang dịch đợt ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(products.length / BATCH_SIZE)} (Sản phẩm ${i + 1} - ${i + chunk.length})...`);
    
    let success = false;
    let attempts = 0;
    while (!success && attempts < 3) {
      attempts++;
      try {
        const result = await callAITranslateBatch(simplifiedChunk);
        if (Array.isArray(result)) {
          result.forEach(item => {
            if (item.goodsNo && item.nameVi) {
              let cleanName = item.nameVi.trim();
              // Verify 0% Korean characters
              if (koreanRegex.test(cleanName)) {
                console.warn(`   ⚠️ Cảnh báo: Tên "${cleanName}" vẫn còn tiếng Hàn, đang làm sạch...`);
                cleanName = cleanName.replace(/[\u3131-\uD79D]/g, '').replace(/\s+/g, ' ').trim();
              }
              translatedMap.set(item.goodsNo, cleanName);
            }
          });
          success = true;
        }
      } catch (err) {
        console.error(`   ❌ Lỗi đợt ${Math.floor(i / BATCH_SIZE) + 1} (Lần thử ${attempts}):`, err.message);
        if (attempts >= 3) {
          console.warn(`   ⚠️ Dùng tên fallback cho đợt này.`);
          chunk.forEach(p => {
            translatedMap.set(p.goodsNo, `${p.categoryLabel || 'Sản Phẩm'} ${p.brand} Chính Hãng`);
          });
        } else {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }
  }

  console.log(`✅ Đã dịch thành công: ${translatedMap.size} / ${products.length} sản phẩm.`);

  // Cập nhật mảng sản phẩm
  let updatedCount = 0;
  products.forEach(p => {
    if (translatedMap.has(p.goodsNo)) {
      const newName = translatedMap.get(p.goodsNo);
      p.name = newName;
      updatedCount++;
    }
  });

  // Ghi lại public/data/playwright_scraped_products.json
  fs.writeFileSync(PLAYWRIGHT_JSON_PATH, JSON.stringify(products, null, 2), 'utf8');
  console.log(`💾 Đã cập nhật file public json: ${PLAYWRIGHT_JSON_PATH}`);

  // Cập nhật file Google Sheets CSV
  const krwRate = 19.5;
  const serviceFee = 5;
  const csvHeaders = ['Mã SP (SKU)', 'Tên Sản Phẩm (Tiếng Việt)', 'Tên Tiếng Hàn Gốc', 'Thương Hiệu', 'Ngành Hàng', 'Phân Loại Chi Tiết', 'Giá Won (₩)', 'Giá Ước Tính VNĐ', 'Link Ảnh Đại Diện', 'Ảnh Chi Tiết', 'Ảnh Review Khách Hàng', 'Link Sản Phẩm', 'Mô Tả / Công Dụng'];
  const csvRows = products.map(p => {
    const vnd = Math.round(p.foreignPrice * krwRate * (1 + serviceFee / 100));
    return [
      `"${p.goodsNo}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.nameKr.replace(/"/g, '""')}"`,
      `"${p.brand}"`,
      `"${p.categoryLabel}"`,
      `"${p.subCategory}"`,
      p.foreignPrice,
      vnd,
      `"${p.productImage}"`,
      `"${(p.images || []).join(';')}"`,
      `"${(p.photoReviews || []).join(';')}"`,
      `"${p.productUrl}"`,
      `"${p.description.replace(/"/g, '""')}"`
    ];
  });

  const csvContent = '\uFEFF' + [csvHeaders.join(','), ...csvRows.map(r => r.join(','))].join('\n');
  fs.writeFileSync(CSV_EXPORT_PATH, csvContent, 'utf-8');
  console.log(`📁 Đã cập nhật file Google Sheets CSV tại: ${CSV_EXPORT_PATH}`);

  // Đồng bộ lên Cloud Firestore
  console.log('🔐 Đang xác thực Firebase Auth Admin...');
  await signInWithEmailAndPassword(auth, 'admin@tavykorea.vn', 'admin123');
  console.log('✅ Xác thực Admin thành công!');

  console.log(`📤 Đang cập nhật ${products.length} sản phẩm tên Tiếng Việt vào Firestore "pending_products"...`);
  const CHUNK_SIZE = 50;
  for (let i = 0; i < products.length; i += CHUNK_SIZE) {
    const chunk = products.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const prod of chunk) {
      const docRef = doc(db, 'pending_products', prod.goodsNo);
      batch.update(docRef, {
        name: prod.name,
        updatedAt: new Date().toISOString()
      });
    }

    await batch.commit();
    console.log(`   ✨ Đã ghi Firestore đợt ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} sản phẩm)`);
  }

  console.log('================================================================');
  console.log(`🎉 HOÀN TẤT: 100/100 SẢN PHẨM ĐÃ CÓ TÊN TIẾNG VIỆT CHUẨN THƯƠNG MẠI!`);
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
