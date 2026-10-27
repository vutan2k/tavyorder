import { db } from '../firebase.js';
import { doc, setDoc, increment, serverTimestamp } from 'firebase/firestore';

/**
 * Trả về mã tuần theo chuẩn ISO 8601 (VD: 2026-W43)
 */
function getIsoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const weekStr = weekNo < 10 ? `0${weekNo}` : `${weekNo}`;
  return `${d.getUTCFullYear()}-W${weekStr}`;
}

/**
 * Lấy các key thời gian hiện tại
 */
export function getCurrentTimeKeys(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return {
    dayKey: `${year}-${month}-${day}`,
    weekKey: getIsoWeekKey(date),
    monthKey: `${year}-${month}`,
    yearKey: `${year}`
  };
}

/**
 * Ghi nhận 1 lượt truy cập mới vào Firestore
 * Có cơ chế debounce theo sessionStorage để tránh F5 spam
 */
export async function trackSiteVisit() {
  if (typeof window === 'undefined') return;

  // Không đếm lượt truy cập khi đang ở các trang quản trị admin
  const currentPath = window.location.pathname || '';
  if (currentPath.startsWith('/admin')) {
    return;
  }

  // Chống F5 spam: Mỗi phiên làm việc chỉ đếm 1 lần
  const SESSION_KEY = 'tavy_visited_session';
  try {
    if (sessionStorage.getItem(SESSION_KEY)) {
      return;
    }
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Bỏ qua lỗi sessionStorage nếu bị chặn cookie/incognito
  }

  // Kiểm tra Firestore instance
  if (!db || !db.type) {
    return;
  }

  try {
    const { dayKey, weekKey, monthKey, yearKey } = getCurrentTimeKeys();
    const statsDocRef = doc(db, 'site_analytics', 'overview');

    await setDoc(
      statsDocRef,
      {
        allTime: increment(1),
        days: { [dayKey]: increment(1) },
        weeks: { [weekKey]: increment(1) },
        months: { [monthKey]: increment(1) },
        years: { [yearKey]: increment(1) },
        lastUpdated: serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    // Không làm gián đoạn trải nghiệm người dùng nếu gặp lỗi mạng
    console.debug('[Analytics] Ghi nhận lượt truy cập lỗi nhẹ:', error);
  }
}
