import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, onSnapshot } from 'firebase/firestore';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '/Users/tan/.hermes/.env' });
dotenv.config({ path: '/Users/tan/tavy-korea/.env', override: true });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: 'tavyorder.firebaseapp.com',
  projectId: 'tavyorder',
  storageBucket: 'tavyorder.firebasestorage.app',
  messagingSenderId: '307372781687',
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8575761420';
const SEEN_ORDERS_FILE = '/Users/tan/tavy-korea/scripts/.seen_orders.json';
const BACKLOG_WINDOW_MS = 48 * 60 * 60 * 1000;

const hadSeenFileOnStartup = fs.existsSync(SEEN_ORDERS_FILE);

function getSeenOrders() {
  try {
    if (fs.existsSync(SEEN_ORDERS_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(SEEN_ORDERS_FILE, 'utf8')));
    }
  } catch (e) {}
  return new Set();
}

function saveSeenOrders(seenSet) {
  try {
    fs.writeFileSync(SEEN_ORDERS_FILE, JSON.stringify(Array.from(seenSet), null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving seen orders:', e);
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseCreatedMs(order) {
  if (!order?.createdAt) return 0;
  if (typeof order.createdAt?.toMillis === 'function') return order.createdAt.toMillis();
  if (typeof order.createdAt?.seconds === 'number') return order.createdAt.seconds * 1000;
  const parsed = new Date(order.createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

async function sendTelegramAlert(htmlText) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('❌ [OrderWatcher] Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID trong .env');
    return false;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      console.error('❌ [OrderWatcher] Telegram API từ chối:', data.description || res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to send Telegram alert:', err.message);
    return false;
  }
}

function formatOrderNotification(orderId, order) {
  const customer = order.customer || {};
  const name = escapeHtml(order.customerName || customer.name || order.shippingAddress?.fullName || 'Khách vãng lai');
  const phone = escapeHtml(order.customerPhone || customer.phone || order.shippingAddress?.phone || 'Chưa cung cấp');
  const address = escapeHtml(order.customerAddress || customer.address || order.shippingAddress?.fullAddress || order.address || 'Chưa có địa chỉ');
  
  const totalVnd = Number(order.totalVnd || order.totalAmount) || 0;
  const paymentMethod = escapeHtml(order.paymentMethod || 'Chuyển khoản / VietQR');
  const createdAt = order.createdAt ? (new Date(order.createdAt.seconds ? order.createdAt.seconds * 1000 : order.createdAt)).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Vừa xong';

  const items = order.items || [];
  let itemsListHtml = '';
  items.forEach((it, idx) => {
    const itName = escapeHtml(it.name || it.title || 'Sản phẩm');
    const optName = escapeHtml(it.selectedOption?.name_vi || it.selectedOption?.name || it.options || it.variant || it.option || '');
    const qty = Number(it.qty || it.quantity || 1);
    const priceVnd = Number(it.priceVnd || it.price) || 0;
    const gid = String(it.goodsNo || it.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const oyLink = gid ? `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${gid}` : null;

    itemsListHtml += `\n${idx + 1}. <b>${itName}</b>`;
    if (optName) itemsListHtml += `\n   • Phân loại: <i>${optName}</i>`;
    itemsListHtml += `\n   • SL: <b>x${qty}</b> | Giá: <b>${priceVnd.toLocaleString('vi-VN')}đ</b>`;
    if (oyLink) itemsListHtml += `\n   • 🔗 <a href="${oyLink}">Kệ Olive Young</a>`;
  });

  return `🚨 <b>CÓ ĐƠN HÀNG MỚI TRÊN WEB TAVY!</b>
━━━━━━━━━━━━━━━━━━
🛒 <b>Mã đơn:</b> <code>#${escapeHtml(orderId)}</code>
⏰ <b>Thời gian:</b> ${escapeHtml(createdAt)}
👤 <b>Khách:</b> <b>${name}</b> (<code>${phone}</code>)
📍 <b>Địa chỉ:</b> ${address}
💵 <b>Tổng thanh toán:</b> <b>${totalVnd.toLocaleString('vi-VN')} VNĐ</b>
💳 <b>Phương thức:</b> ${paymentMethod}

📦 <b>Chi tiết món hàng (${items.length} món):</b>${itemsListHtml || '\n(Không có danh sách món)'}
━━━━━━━━━━━━━━━━━━
👉 Đăng nhập Admin Tavy Korea để xử lý!`;
}

async function startWatcher() {
  console.log('🚀 Đang khởi động Order Watcher Daemon cho Tavy Korea...');
  const adminEmail = process.env.VITE_ADMIN_EMAIL || 'admin@tavykorea.vn';
  const adminPass = process.env.FIREBASE_ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD;
  if (!adminPass) {
    console.error('❌ [OrderWatcher] Thiếu FIREBASE_ADMIN_PASSWORD trong .env');
    process.exit(1);
  }
  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  console.log('✓ Đã đăng nhập Firebase Admin thành công.');

  const seenOrders = getSeenOrders();
  console.log(`📦 Đã ghi nhận ${seenOrders.size} đơn hàng lịch sử.`);

  let isFirstLoad = true;

  const ordersRef = collection(db, 'orders');
  onSnapshot(ordersRef, async (snapshot) => {
    if (isFirstLoad) {
      if (!hadSeenFileOnStartup) {
        snapshot.forEach(docSnap => {
          seenOrders.add(docSnap.id);
        });
        saveSeenOrders(seenOrders);
        isFirstLoad = false;
        console.log(`✓ Đồng bộ xong khởi điểm lần đầu: ${seenOrders.size} đơn hiện có.`);
        return;
      }

      // Nếu đã có .seen_orders.json, quét các đơn tồn mới phát sinh trong lúc daemon tắt (< 48h)
      const now = Date.now();
      let backlogSent = 0;
      for (const docSnap of snapshot.docs) {
        const orderId = docSnap.id;
        if (seenOrders.has(orderId)) continue;
        const orderData = docSnap.data();
        const createdMs = parseCreatedMs(orderData);
        if (createdMs > 0 && (now - createdMs) <= BACKLOG_WINDOW_MS) {
          console.log(`🔥 [ĐƠN TỒN KHI RESTART] #${orderId}`);
          const sent = await sendTelegramAlert(formatOrderNotification(orderId, orderData));
          if (sent) {
            seenOrders.add(orderId);
            saveSeenOrders(seenOrders);
            backlogSent++;
          }
        } else {
          seenOrders.add(orderId);
          saveSeenOrders(seenOrders);
        }
      }
      isFirstLoad = false;
      console.log(`✓ Đồng bộ xong khởi điểm: ${seenOrders.size} đơn (bắn bù ${backlogSent} đơn tồn).`);
      return;
    }

    // Subsequent updates: check added and modified docs sequentially
    for (const change of snapshot.docChanges()) {
      const orderId = change.doc.id;
      const orderData = change.doc.data();

      if (change.type === 'added' && !seenOrders.has(orderId)) {
        console.log(`🔥 [ĐƠN HÀNG MỚI] #${orderId} - Khách: ${orderData.customerName || orderData.customer?.name || 'Vãng lai'}`);
        const alertMsg = formatOrderNotification(orderId, orderData);
        const sent = await sendTelegramAlert(alertMsg);
        if (sent) {
          seenOrders.add(orderId);
          saveSeenOrders(seenOrders);
          console.log(`✓ Đã bắn thông báo Telegram đơn #${orderId} thành công!`);
        } else {
          console.error(`❌ Gửi thông báo Telegram đơn #${orderId} thất bại (chưa ghi seenOrders để thử lại).`);
        }
      } else if (change.type === 'modified') {
        const paidKey = `${orderId}_paid`;
        const proofKey = `${orderId}_proof`;
        const isDepositPaid = orderData.paymentStatus === 'paid' || orderData.status === 'deposit_paid';
        const hasUploadedProof = Boolean(orderData.depositProofImage || orderData.customerReportedPaid);

        if (isDepositPaid && !seenOrders.has(paidKey)) {
          const totalVnd = Number(orderData.totalVnd || orderData.totalAmount || 0).toLocaleString('vi-VN');
          const paidMsg = [
            `💸 <b>[TAVY KOREA] ĐƠN HÀNG ĐÃ THANH TOÁN THÀNH CÔNG!</b>`,
            `• <b>Mã đơn:</b> <code>#${escapeHtml(orderId)}</code>`,
            `• <b>Khách hàng:</b> ${escapeHtml(orderData.customerName || orderData.customer?.name || 'Khách')}`,
            `• <b>Số tiền:</b> <b>${totalVnd} VNĐ</b>`,
            `• <b>Trạng thái:</b> Đã xác nhận tiền về (PayOS / Admin)`
          ].join('\n');
          const sent = await sendTelegramAlert(paidMsg);
          if (sent) {
            seenOrders.add(paidKey);
            saveSeenOrders(seenOrders);
          }
        } else if (hasUploadedProof && !seenOrders.has(proofKey) && !isDepositPaid) {
          const totalVnd = Number(orderData.totalVnd || orderData.totalAmount || 0).toLocaleString('vi-VN');
          const proofMsg = [
            `🧾 <b>[TAVY KOREA] KHÁCH VỪA BÁO ĐÃ CHUYỂN KHOẢN / UP BILL!</b>`,
            `• <b>Mã đơn:</b> <code>#${escapeHtml(orderId)}</code>`,
            `• <b>Khách hàng:</b> ${escapeHtml(orderData.customerName || orderData.customer?.name || 'Khách')} (<code>${escapeHtml(orderData.customerPhone || '')}</code>)`,
            `• <b>Số tiền đơn:</b> <b>${totalVnd} VNĐ</b>`,
            `👉 <a href="https://tavyorder.web.app/admin">Vào Web Admin kiểm tra bill & duyệt đơn</a>`
          ].join('\n');
          const sent = await sendTelegramAlert(proofMsg);
          if (sent) {
            seenOrders.add(proofKey);
            saveSeenOrders(seenOrders);
          }
        }
      }
    }
  }, (err) => {
    console.error('❌ Lỗi onSnapshot Firestore, thoát tiến trình để tự động kết nối lại:', err);
    process.exit(1);
  });
}

startWatcher().catch(err => {
  console.error('Lỗi fatal khởi động Order Watcher:', err);
  process.exit(1);
});
