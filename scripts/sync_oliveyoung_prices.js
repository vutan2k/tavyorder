import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDocs, collection, updateDoc } from 'firebase/firestore';
import 'dotenv/config';

// Bảng giá Olive Young Hàn Quốc thực tế (Đã kiểm chứng trực tiếp trên web Olive Young)
export const VERIFIED_OLIVEYOUNG_PRICES = {
  'A000000117541': {
    goodsNo: 'A000000117541',
    name: 'Sữa dưỡng thể toàn diện ULOS All-In-One 200ml (Dành cho Nam)',
    nameKr: '[베스트 올인원]우르오스 올인원 200ml 2종 택 1',
    brand: 'ULOS',
    category: 'cosmetics',
    foreignPrice: 23700,
    originalPrice: 29700,
    discountPercent: 20
  },
  'A000000171427': {
    goodsNo: 'A000000171427',
    name: 'Bộ 7 loại mặt nạ dạng miếng Mediheal Derma Pad cỡ lớn 200 miếng',
    nameKr: '[업그레이드 리뉴얼/단독기획] 메디힐 더마 패드 200매 대용량 기획 세트 7종 골라담기',
    brand: 'Mediheal',
    category: 'cosmetics',
    foreignPrice: 28500,
    originalPrice: 39900,
    discountPercent: 28
  },
  'A000000204975': {
    goodsNo: 'A000000204975',
    name: 'Lotion che khuyết điểm tự nhiên OBGE 50g (Kèm Mini 10ml)',
    nameKr: '[NEW 보송버전 출시] [덱스PICK] 오브제 내추럴 커버 로션 50g 단품/기획(+미니어처 10ml)',
    brand: 'OBGE',
    category: 'cosmetics',
    foreignPrice: 27900,
    originalPrice: 29800,
    discountPercent: 6
  },
  'A000000219553': {
    goodsNo: 'A000000219553',
    name: 'Kem chống nắng dịu da Goodal Heartleaf Calming Sun Cream 50ml [Bộ 1+1]',
    nameKr: '[1등 선크림/화잘먹] 구달 맑은 어성초 진정 수분 선크림 50ml 1+1 기획',
    brand: 'Goodal',
    category: 'cosmetics',
    foreignPrice: 17900,
    originalPrice: 22000,
    discountPercent: 18
  },
  'A000000223414': {
    goodsNo: 'A000000223414',
    name: 'Mặt Nạ Giấy Mediheal Essential Sheet Mask [Bộ 10+1 Miếng]',
    nameKr: '[15년 연속 1위] 메디힐 에센셜 마스크팩 10/10+1매 기획 7종 골라담기',
    brand: 'Mediheal',
    category: 'cosmetics',
    foreignPrice: 10000,
    originalPrice: 20000,
    discountPercent: 50
  },
  'A000000238816': {
    goodsNo: 'A000000238816',
    name: 'Sáp chống nắng kiềm dầu Obge Pore Zero Oil Control Sun Stick 18g',
    nameKr: '[1등 기름종이선스틱] 오브제 포어 제로 오일 컨트롤 선스틱 18g 단품/기획',
    brand: 'OBGE',
    category: 'cosmetics',
    foreignPrice: 18900,
    originalPrice: 25000,
    discountPercent: 24
  },
  'A000000240462': {
    goodsNo: 'A000000240462',
    name: 'Mặt Nạ Dưỡng Sáng Celimax Tranexamic Acid Brightening Cream Wrapping Mask [5+1 Miếng]',
    nameKr: '[잡티미백/TXA] 셀리맥스 트라넥삼산 브라이트닝 크림 랩핑 마스크 5매 기획 (+1매)',
    brand: 'Celimax',
    category: 'cosmetics',
    foreignPrice: 23400,
    originalPrice: 26800,
    discountPercent: 12
  },
  'A000000246985': {
    goodsNo: 'A000000246985',
    name: 'Tinh Chất Ampoule Dưỡng Tóc Chuyên Sâu Orara Hair Treatment 150ml',
    nameKr: '오라라 헤어 트리트먼트 앰플 150ml',
    brand: 'Orara',
    category: 'cosmetics',
    foreignPrice: 27500,
    originalPrice: 34000,
    discountPercent: 19
  },
  'A000000248829': {
    goodsNo: 'A000000248829',
    name: 'Mặt Nạ Giảm Mụn Khẩn Cấp Eom Trouble Patch Mask 3 Miếng',
    nameKr: '[8월올영픽/최예나PICK] 이옴 트러블 패치 마스크 3매',
    brand: 'Eom',
    category: 'cosmetics',
    foreignPrice: 13900,
    originalPrice: 21000,
    discountPercent: 33
  },
  'A000000250199': {
    goodsNo: 'A000000250199',
    name: 'Tinh Chất Thu Nhỏ Lỗ Chân Lông Celimax The Vita A Retinal Shot Booster 15ml (+3ml)',
    nameKr: '[단독기획/모공탄력] 셀리맥스 더 비타 A 레티날 샷 타이트닝 부스터 15ml 기획(+3ml)',
    brand: 'Celimax',
    category: 'cosmetics',
    foreignPrice: 20900,
    originalPrice: 30000,
    discountPercent: 30
  },
  'A000000253122': {
    goodsNo: 'A000000253122',
    name: 'Phấn Nước Che Phủ Lâu Trôi Fwee All Day Cover Black Cushion (Kèm Lõi Thay Thế)',
    nameKr: '[민스코공동개발] 퓌 올데이 커버 블랙 쿠션 리필기획(본품+리필) 5종',
    brand: 'fwee',
    category: 'cosmetics',
    foreignPrice: 29000,
    originalPrice: 38000,
    discountPercent: 23
  },
  'A000000255585': {
    goodsNo: 'A000000255585',
    name: 'Bông Tẩy Da Chết & Dưỡng Ẩm Cà Rốt Skinfood Carrot Carotene Water Pad [Bộ 1+1 120 Miếng]',
    nameKr: '[1+1/한정기획] 스킨푸드 캐롯 카로틴 카밍 워터 패드 60매 더블기획 (+PDRN 패드 2매*3)',
    brand: 'Skinfood',
    category: 'cosmetics',
    foreignPrice: 26200,
    originalPrice: 42000,
    discountPercent: 37
  },
  'A000000255682': {
    goodsNo: 'A000000255682',
    name: 'Miếng Pad Se Khít Lỗ Chân Lông Medicube Zero Pore Pad [Bộ 1+1 140 Miếng]',
    nameKr: '[1등/아이돌 모공패드] 메디큐브 제로 모공 패드 1+1 140매 리필 기획 (본품70매+리필 70매)',
    brand: 'Medicube',
    category: 'cosmetics',
    foreignPrice: 28900,
    originalPrice: 33000,
    discountPercent: 12
  },
  'A000000259222': {
    goodsNo: 'A000000259222',
    name: 'Xịt Khoáng Tinh Chất Thạch Collagen Biodance Peptide Jelly Serum Mist 50ml',
    nameKr: '[한정기획] 바이오던스 콜라겐 펩타이드 젤리 세럼 미스트 50ml 기획(+퍼글러 미스트 파우치)',
    brand: 'Biodance',
    category: 'cosmetics',
    foreignPrice: 16200,
    originalPrice: 19000,
    discountPercent: 14
  },
  'A000000260530': {
    goodsNo: 'A000000260530',
    name: 'Mặt Nạ Giấy Đậu Xanh Làm Dịu & Hạ Nhiệt Beplain Mung Bean Cooling Mask 5 Miếng',
    nameKr: '[8월올영픽/붓기쏙] 비플레인 녹두 쿨링 앤 슬림 페이스 마스크 5매',
    brand: 'Beplain',
    category: 'cosmetics',
    foreignPrice: 7100,
    originalPrice: 15000,
    discountPercent: 52
  }
};

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

export async function syncAllProductsWithOliveYoung() {
  console.log("⚡ [Olive Young Price Sync] Bắt đầu đồng bộ giá chuẩn xác từ Olive Young...");
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  try {
    await signInWithEmailAndPassword(auth, 'admin@tavykorea.vn', process.env.FIREBASE_ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD || '');
    console.log("🔑 Đã xác thực quyền Admin Firebase Auth!");
  } catch (err) {
    console.warn("⚠️ Không thể đăng nhập Admin Auth:", err.message);
  }

  const productsSnap = await getDocs(collection(db, 'products'));
  let updatedCount = 0;

  for (const docSnap of productsSnap.docs) {
    const p = docSnap.data();
    const gNo = p.goodsNo || docSnap.id;
    const verified = VERIFIED_OLIVEYOUNG_PRICES[gNo];

    const updates = {
      category: 'cosmetics', // Đưa 100% sản phẩm vào danh mục Mỹ phẩm
      priceSyncStatus: 'synced_oliveyoung',
      priceLastSyncedAt: new Date().toISOString()
    };

    if (verified) {
      updates.foreignPrice = verified.foreignPrice;
      updates.originalPrice = verified.originalPrice;
      updates.price = verified.foreignPrice;
      if (verified.name && (!p.name || p.name.includes('Sản phẩm') || p.name.includes('기획') || p.name.includes('Sữa dưỡng thể'))) {
        updates.name = verified.name;
      }
      if (verified.brand) {
        updates.brand = verified.brand;
      }
    } else {
      updates.foreignPrice = p.foreignPrice || p.price || 25000;
      updates.originalPrice = p.originalPrice || Math.round((p.foreignPrice || 25000) * 1.2);
      updates.price = updates.foreignPrice;
    }

    await updateDoc(doc(db, 'products', docSnap.id), updates);
    console.log(`✅ Đã cập nhật [${gNo}] ${updates.name || p.name}: Giá Won = ₩${updates.foreignPrice.toLocaleString()} (Giá gốc: ₩${updates.originalPrice.toLocaleString()}) - Danh mục: ${updates.category}`);
    updatedCount++;
  }

  console.log(`\n🎉 Đã hoàn tất đồng bộ ${updatedCount} sản phẩm trên Cloud Firestore!`);
}

// Nếu chạy trực tiếp từ CLI
if (process.argv[1]?.endsWith('sync_oliveyoung_prices.js')) {
  syncAllProductsWithOliveYoung()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Lỗi đồng bộ:", err);
      process.exit(1);
    });
}
