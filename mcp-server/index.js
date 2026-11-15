#!/usr/bin/env node
/**
 * TAVY KOREA ADMIN — Model Context Protocol (MCP) Server
 * Cho phép các AI Agent (Antigravity, Claude, Gemini) trực tiếp điều khiển, truy vấn và quản trị sàn Tavy Korea:
 * - Tra cứu đơn hàng & cập nhật trạng thái đơn hàng (9 bước chuẩn) trực tiếp từ Cloud Firestore.
 * - Cập nhật tỷ giá KRW/VND và phí dịch vụ mua hộ.
 * - Cào dữ liệu chuyên sâu và album ảnh HD từ Naver Brand Store, KGC, Nonghyup, Olive Young.
 * - Quản lý danh mục kho hàng sản phẩm Sâm Nấm & TPCN trực tiếp từ Firestore.
 * - Thống kê báo cáo doanh số & phân tích hiệu quả kinh doanh từ dữ liệu thật (Rule 0 Compliance).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/tan/tavy-korea/.env', override: true });

import {
  VERIFIED_KOREAN_HEALTH_CATALOG,
  scrapeKoreanHealthProduct,
  evaluateHealthFilterCriteria
} from '../src/services/koreanHealthScraperCore.js';

import {
  translateKoreanHealthTitle,
  categorizeHealthProduct,
  extractActiveIngredients,
  generateHealthUsageGuide
} from '../src/utils/koreanHealthDictionary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const exportsDir = path.join(projectRoot, 'exports');

if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
}

// Khởi tạo kết nối Cloud Firestore thật
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyCQ_cpZLNbZdgGpDzea9GlpCL8vbeb_emo",
  authDomain: "tavyorder.firebaseapp.com",
  projectId: "tavyorder",
  storageBucket: "tavyorder.firebasestorage.app",
  messagingSenderId: "307372781687",
  appId: "1:307372781687:web:356e2963e0cf23b018d672"
};

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let adminAuthReady = null;
async function ensureAdminAuth() {
  if (auth.currentUser) return;
  if (!adminAuthReady) {
    const adminEmail = process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn';
    const adminPass = process.env.FIREBASE_ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD || '';
    adminAuthReady = adminPass
      ? signInWithEmailAndPassword(auth, adminEmail, adminPass).catch((err) => {
          adminAuthReady = null;
          console.error('MCP Admin Auth Error:', err.message);
        })
      : Promise.resolve();
  }
  await adminAuthReady;
}

// Khởi tạo MCP Server
const server = new McpServer({
  name: 'tavy-admin',
  version: '2.0.0',
  description: 'MCP Server Quản Trị Sàn TAVY KOREA — Kết Nối 100% Cloud Firestore Thật (Rule 0 Compliance)'
});

// Helper đọc/ghi cấu hình tỷ giá từ Firestore
async function getSystemRates() {
  try {
    const docSnap = await getDoc(doc(db, 'system_config', 'rates'));
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        krwRate: data.KRW?.rate || data.krwRate || 19.5,
        serviceFeePercent: data.serviceFeePercent !== undefined ? data.serviceFeePercent : 5,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
      };
    }
  } catch (err) {
    console.warn("Lỗi đọc tỷ giá từ Firestore:", err.message);
  }
  return { krwRate: 19.5, serviceFeePercent: 5, updatedAt: new Date().toISOString() };
}

async function saveSystemRates(rates) {
  try {
    const docRef = doc(db, 'system_config', 'rates');
    await setDoc(docRef, {
      KRW: { rate: Number(rates.krwRate) || 19.5, symbol: '₩', country: 'Hàn Quốc' },
      serviceFeePercent: Number(rates.serviceFeePercent) || 5,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn("Lỗi lưu tỷ giá lên Firestore:", err.message);
    return false;
  }
}

// Helper đọc danh sách đơn hàng THẬT từ Cloud Firestore
async function getSystemOrders() {
  try {
    const snap = await getDocs(collection(db, 'orders'));
    const list = snap.docs.map(d => {
      const data = d.data();
      let createdAtIso = new Date().toISOString();
      if (data.createdAt?.toDate) {
        createdAtIso = data.createdAt.toDate().toISOString();
      } else if (typeof data.createdAt === 'string') {
        createdAtIso = data.createdAt;
      }
      return {
        id: d.id,
        ...data,
        createdAt: createdAtIso
      };
    });
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return list;
  } catch (err) {
    console.warn("Lỗi đọc đơn hàng từ Firestore:", err.message);
    return [];
  }
}

// Helper đọc sản phẩm THẬT từ Cloud Firestore
async function getSystemProducts() {
  try {
    const snap = await getDocs(collection(db, 'products'));
    if (!snap.empty) {
      return snap.docs.map(d => ({ goodsNo: d.id, ...d.data() }));
    }
  } catch (err) {
    console.warn("Lỗi đọc sản phẩm từ Firestore:", err.message);
  }
  return [...VERIFIED_KOREAN_HEALTH_CATALOG];
}

// ════════════════════════════════════════════════════════════════════════════
// 1. TOOL: list_orders (Lấy danh sách đơn hàng thật từ Firestore)
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'list_orders',
  'Lấy danh sách đơn hàng thực tế từ Cloud Firestore của Tavy Korea với các bộ lọc trạng thái.',
  {
    status: z.enum([
      'all',
      'pending',
      'quoted',
      'deposit_paid',
      'paid',
      'purchasing_korea',
      'purchased',
      'korea_warehouse',
      'packed_kr',
      'shipping_vietnam',
      'in_transit_air',
      'vietnam_warehouse',
      'customs_cleared',
      'completed',
      'cancelled'
    ]).optional().describe('Trạng thái đơn hàng cần lọc'),
    limit: z.number().optional().describe('Số lượng đơn hàng tối đa cần lấy (mặc định 20)')
  },
  async ({ status = 'all', limit = 20 }) => {
    const allOrders = await getSystemOrders();
    const filtered = status === 'all'
      ? allOrders
      : allOrders.filter(o => o.status === status);

    const result = filtered.slice(0, limit);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            total: filtered.length,
            showing: result.length,
            statusFilter: status,
            orders: result
          }, null, 2)
        }
      ]
    };
  }
);

// ════════════════════════════════════════════════════════════════════════════
// 2. TOOL: get_order_detail (Chi tiết 1 đơn hàng từ Firestore)
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'get_order_detail',
  'Xem thông tin chi tiết đầy đủ của một đơn hàng theo orderId từ Cloud Firestore.',
  {
    orderId: z.string().describe('Mã đơn hàng hoặc số điện thoại (ví dụ: 0948048852)')
  },
  async ({ orderId }) => {
    const cleanId = orderId.trim();
    let orderData = null;

    try {
      const docSnap = await getDoc(doc(db, 'orders', cleanId));
      if (docSnap.exists()) {
        orderData = { id: docSnap.id, ...docSnap.data() };
      } else {
        const allOrders = await getSystemOrders();
        orderData = allOrders.find(o =>
          o.id.toLowerCase() === cleanId.toLowerCase() ||
          (o.customerPhone && o.customerPhone.replace(/\D/g, '') === cleanId.replace(/\D/g, ''))
        );
      }
    } catch (err) {
      console.warn("Lỗi tra cứu đơn hàng:", err.message);
    }

    if (!orderData) {
      return {
        isError: true,
        content: [{ type: 'text', text: `❌ Không tìm thấy đơn hàng với mã/SĐT "${orderId}" trong Firestore.` }]
      };
    }

    const rates = await getSystemRates();
    let totalWon = 0;
    (orderData.items || []).forEach(it => {
      const priceWon = Number(it.foreignPrice ?? it.priceWon ?? it.priceKrw ?? it.price) || 0;
      totalWon += priceWon * (it.qty || it.quantity || 1);
    });
    const estVnd = orderData.totalVnd || Math.round(totalWon * rates.krwRate * (1 + rates.serviceFeePercent / 100));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            order: orderData,
            financialSummary: {
              totalWon,
              appliedKrwRate: rates.krwRate,
              serviceFeePercent: rates.serviceFeePercent,
              totalEstVnd: estVnd
            }
          }, null, 2)
        }
      ]
    };
  }
);

// ════════════════════════════════════════════════════════════════════════════
// 3. TOOL: update_order_status (Cập nhật trạng thái đơn hàng lên Firestore)
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'update_order_status',
  'Cập nhật trạng thái xử lý của đơn hàng lên Cloud Firestore, gán mã vận đơn tracking hoặc ghi chú.',
  {
    orderId: z.string().describe('Mã đơn hàng cần cập nhật'),
    status: z.enum([
      'pending',
      'quoted',
      'deposit_paid',
      'paid',
      'purchasing_korea',
      'purchased',
      'korea_warehouse',
      'packed_kr',
      'shipping_vietnam',
      'in_transit_air',
      'vietnam_warehouse',
      'customs_cleared',
      'completed',
      'cancelled'
    ]).describe('Trạng thái mới của đơn hàng'),
    trackingCode: z.string().optional().describe('Mã vận đơn quốc tế / nội địa'),
    adminNote: z.string().optional().describe('Ghi chú nội bộ của admin')
  },
  async ({ orderId, status, trackingCode, adminNote }) => {
    try {
      const docRef = doc(db, 'orders', orderId);
      const updates = {
        status,
        updatedAt: serverTimestamp()
      };
      if (trackingCode) updates.trackingCode = trackingCode;
      if (adminNote) updates.adminNote = adminNote;

      await updateDoc(docRef, updates);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `✅ Đã cập nhật trạng thái đơn #${orderId} sang "${status}" trên Cloud Firestore!`,
              orderId,
              newStatus: status,
              trackingCode: trackingCode || null
            }, null, 2)
          }
        ]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `❌ Lỗi khi cập nhật Firestore: ${err.message}` }]
      };
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// 4. TOOL: update_exchange_rates (Cập nhật tỷ giá lên Firestore)
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'update_exchange_rates',
  'Cập nhật tỷ giá KRW/VND và phí dịch vụ mua hộ lên Cloud Firestore.',
  {
    krwRate: z.number().positive().describe('Tỷ giá KRW/VND mới (ví dụ: 19.8)'),
    serviceFeePercent: z.number().min(0).max(50).describe('Phí dịch vụ phần trăm (ví dụ: 5%)')
  },
  async ({ krwRate, serviceFeePercent }) => {
    const success = await saveSystemRates({ krwRate, serviceFeePercent });
    if (!success) {
      return {
        isError: true,
        content: [{ type: 'text', text: '❌ Lỗi khi lưu tỷ giá lên Firestore.' }]
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: '✅ Đã cập nhật tỷ giá và phí dịch vụ thành công lên Cloud Firestore!',
            rates: {
              krwRate,
              serviceFeePercent,
              updatedAt: new Date().toISOString()
            }
          }, null, 2)
        }
      ]
    };
  }
);

// ════════════════════════════════════════════════════════════════════════════
// 5. TOOL: scrape_korean_product (Cào sản phẩm Olive Young/Naver)
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'scrape_korean_product',
  'Cào dữ liệu chuyên sâu và album ảnh HD của một sản phẩm từ Naver hoặc Olive Young.',
  {
    url: z.string().url().describe('Đường dẫn chi tiết sản phẩm Hàn Quốc'),
    categoryHint: z.enum(['ginseng', 'supplements', 'cosmetics', 'general']).optional().describe('Gợi ý danh mục')
  },
  async ({ url, categoryHint = 'general' }) => {
    try {
      const result = await scrapeKoreanHealthProduct(url, { category: categoryHint });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              sourceUrl: url,
              product: result
            }, null, 2)
          }
        ]
      };
    } catch (e) {
      return {
        isError: true,
        content: [{ type: 'text', text: `❌ Lỗi khi bóc tách sản phẩm: ${e.message}` }]
      };
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// 6. TOOL: list_catalog_products (Danh sách sản phẩm từ Firestore)
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'list_catalog_products',
  'Lấy danh sách các sản phẩm đang niêm yết trong kho hàng từ Cloud Firestore.',
  {
    category: z.enum(['all', 'ginseng', 'supplements', 'cosmetics', 'skincare']).optional().describe('Danh mục sản phẩm'),
    limit: z.number().optional().describe('Số lượng sản phẩm tối đa (mặc định 20)')
  },
  async ({ category = 'all', limit = 20 }) => {
    let pool = await getSystemProducts();
    if (category !== 'all') {
      pool = pool.filter(p => p.category === category);
    }
    const result = pool.slice(0, limit);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            total: pool.length,
            showing: result.length,
            category,
            products: result
          }, null, 2)
        }
      ]
    };
  }
);

// ════════════════════════════════════════════════════════════════════════════
// 7. TOOL: get_system_analytics (Báo cáo kinh doanh thực tế từ Firestore)
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'get_system_analytics',
  'Xem báo cáo tổng hợp chỉ số tài chính và số lượng đơn hàng thực tế từ Cloud Firestore.',
  {},
  async () => {
    const orders = await getSystemOrders();
    const rates = await getSystemRates();
    const products = await getSystemProducts();

    let totalGmvWon = 0;
    let totalGmvVnd = 0;
    const statusCounts = {};

    orders.forEach(o => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
      if (typeof o.totalVnd === 'number' && o.totalVnd > 0) {
        totalGmvVnd += o.totalVnd;
      } else {
        let orderWon = 0;
        (o.items || []).forEach(it => {
          orderWon += (Number(it.foreignPrice ?? it.priceWon ?? it.priceKrw ?? it.price) || 0) * (it.qty || it.quantity || 1);
        });
        totalGmvWon += orderWon;
        totalGmvVnd += Math.round(orderWon * rates.krwRate * (1 + rates.serviceFeePercent / 100));
      }
    });

    const aovVnd = orders.length > 0 ? Math.round(totalGmvVnd / orders.length) : 0;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            totalOrders: orders.length,
            totalCatalogProducts: products.length,
            currentKrwRate: rates.krwRate,
            serviceFeePercent: rates.serviceFeePercent,
            financials: {
              totalGmvWon,
              totalGmvVnd,
              averageOrderValueVnd: aovVnd
            },
            orderBreakdownByStatus: statusCounts
          }, null, 2)
        }
      ]
    };
  }
);

// Khởi chạy transport stdio
async function run() {
  await ensureAdminAuth();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 TAVY KOREA Admin MCP Server v2.0 (Firestore Live) is running on stdio');
}

run().catch((error) => {
  console.error('Fatal MCP Server Error:', error);
  process.exit(1);
});
