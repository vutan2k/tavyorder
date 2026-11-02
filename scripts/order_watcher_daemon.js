import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, query, limit, orderBy } from 'firebase/firestore';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '/Users/tan/tavy-korea/.env' });

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

const TELEGRAM_BOT_TOKEN = '8887086946:AAGQ6xm1KA4fH9Ibd1In0tkLUnH7etKWbzA';
const TELEGRAM_CHAT_ID = '8575761420';
const SEEN_ORDERS_FILE = '/Users/tan/tavy-korea/scripts/.seen_orders.json';

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
    fs.writeFileSync(SEEN_ORDERS_FILE, JSON.stringify(Array.from(seenSet)), 'utf8');
  } catch (e) {
    console.error('Error saving seen orders:', e);
  }
}

async function sendTelegramAlert(htmlText) {
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
    return data.ok;
  } catch (err) {
    console.error('Failed to send Telegram alert:', err.message);
    return false;
  }
}

function formatOrderNotification(orderId, order) {
  const customer = order.customer || {};
  const name = customer.name || order.shippingAddress?.fullName || 'Khách vãng lai';
  const phone = customer.phone || order.shippingAddress?.phone || 'Chưa cung cấp';
  const address = customer.address || order.shippingAddress?.fullAddress || order.address || 'Chưa có địa chỉ';
  
  const totalVnd = Number(order.totalVnd || order.totalAmount) || 0;
  const paymentMethod = order.paymentMethod || 'Chuyển khoản / VietQR';
  const createdAt = order.createdAt ? (new Date(order.createdAt.seconds ? order.createdAt.seconds * 1000 : order.createdAt)).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Vừa xong';

  const items = order.items || [];
  let itemsListHtml = '';
  items.forEach((it, idx) => {
    const itName = it.name || it.title || 'Sản phẩm';
    const optName = it.selectedOption?.name_vi || it.selectedOption?.name || it.variant || it.option || '';
    const qty = it.qty || it.quantity || 1;
    const priceVnd = Number(it.priceVnd || it.price) || 0;
    const gid = it.goodsNo || it.id || '';
    const oyLink = gid ? `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${gid}` : null;

    itemsListHtml += `\n${idx + 1}. <b>${itName}</b>`;
    if (optName) itemsListHtml += `\n   • Phân loại: <i>${optName}</i>`;
    itemsListHtml += `\n   • SL: <b>x${qty}</b> | Giá: <b>${priceVnd.toLocaleString('vi-VN')}đ</b>`;
    if (oyLink) itemsListHtml += `\n   • 🔗 <a href="${oyLink}">Kệ Olive Young</a>`;
  });

  return `🚨 <b>CÓ ĐƠN HÀNG MỚI TRÊN WEB TAVY!</b>
━━━━━━━━━━━━━━━━━━
🛒 <b>Mã đơn:</b> <code>#${orderId}</code>
⏰ <b>Thời gian:</b> ${createdAt}
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
  const adminPass = process.env.FIREBASE_ADMIN_PASSWORD || 'admin123';
  await signInWithEmailAndPassword(auth, adminEmail, adminPass);
  console.log('✓ Đã đăng nhập Firebase Admin thành công.');

  const seenOrders = getSeenOrders();
  console.log(`📦 Đã ghi nhận ${seenOrders.size} đơn hàng lịch sử.`);

  let isFirstLoad = true;

  const ordersRef = collection(db, 'orders');
  onSnapshot(ordersRef, (snapshot) => {
    if (isFirstLoad) {
      // First load: seed all existing order IDs into seenOrders
      snapshot.forEach(docSnap => {
        seenOrders.add(docSnap.id);
      });
      saveSeenOrders(seenOrders);
      isFirstLoad = false;
      console.log(`✓ Đồng bộ xong khởi điểm: ${seenOrders.size} đơn hiện có.`);
      return;
    }

    // Subsequent updates: check added docs
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const orderId = change.doc.id;
        if (!seenOrders.has(orderId)) {
          seenOrders.add(orderId);
          saveSeenOrders(seenOrders);

          const orderData = change.doc.data();
          console.log(`🔥 [ĐƠN HÀNG MỚI] #${orderId} - Khách: ${orderData.customer?.name || 'Vãng lai'}`);
          
          const alertMsg = formatOrderNotification(orderId, orderData);
          const sent = await sendTelegramAlert(alertMsg);
          if (sent) {
            console.log(`✓ Đã bắn thông báo Telegram đơn #${orderId} thành công!`);
          } else {
            console.error(`❌ Gửi thông báo Telegram đơn #${orderId} thất bại.`);
          }
        }
      }
    });
  }, (err) => {
    console.error('Lỗi onSnapshot Firestore:', err);
  });
}

startWatcher().catch(err => {
  console.error('Lỗi fatal khởi động Order Watcher:', err);
  process.exit(1);
});
