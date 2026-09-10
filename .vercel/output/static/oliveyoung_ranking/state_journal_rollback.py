import os
import json
import shutil
import time

BASE_DIR = "/Users/tan/Desktop/oliveyoung_ranking"
STATE_FILE = os.path.join(BASE_DIR, "harness_state_enrichment_v2.json")
SNAPSHOT_DIR = os.path.join(BASE_DIR, ".snapshots")

os.makedirs(SNAPSHOT_DIR, exist_ok=True)

def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"created_at": time.time(), "products": {}}

def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

def create_product_snapshot(goods_no, folder_path):
    """Lưu bản snapshot dự phòng của 1 sản phẩm trước khi sửa đổi"""
    if not os.path.exists(folder_path):
        return None
    info_path = os.path.join(folder_path, "info.json")
    if os.path.exists(info_path):
        snap_path = os.path.join(SNAPSHOT_DIR, f"{goods_no}_info.json.bak")
        shutil.copy2(info_path, snap_path)
        return snap_path
    return None

def rollback_product(goods_no, folder_path=None):
    """Khôi phục lại trạng thái ban đầu của sản phẩm nếu gặp sự cố"""
    snap_path = os.path.join(SNAPSHOT_DIR, f"{goods_no}_info.json.bak")
    if not os.path.exists(snap_path):
        print(f"⚠️ Không tìm thấy bản snapshot của {goods_no}")
        return False
        
    if not folder_path or not os.path.exists(folder_path):
        # Tự động quét tìm folder của SKU
        for d in os.listdir(BASE_DIR):
            if goods_no in d and os.path.isdir(os.path.join(BASE_DIR, d)):
                folder_path = os.path.join(BASE_DIR, d)
                break

    if folder_path and os.path.exists(folder_path):
        target_info = os.path.join(folder_path, "info.json")
        shutil.copy2(snap_path, target_info)
        state = load_state()
        state["products"][goods_no] = {
            "status": "ROLLED_BACK",
            "timestamp": time.time(),
            "note": "Khôi phục thành công từ snapshot"
        }
        save_state(state)
        print(f"🔄 [ROLLBACK THÀNH CÔNG] Đã khôi phục sản phẩm {goods_no} về bản snapshot ban đầu.")
        return True
    return False

def update_product_state(goods_no, status, meta=None):
    state = load_state()
    state["products"][goods_no] = {
        "status": status,
        "timestamp": time.time(),
        "meta": meta or {}
    }
    save_state(state)

def is_product_completed(goods_no):
    state = load_state()
    prod_info = state["products"].get(goods_no)
    return prod_info and prod_info.get("status") == "QC_PASSED"

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == "--rollback":
        g_no = sys.argv[2]
        rollback_product(g_no)
    elif len(sys.argv) > 1 and sys.argv[1] == "--status":
        st = load_state()
        print(f"Tổng số sản phẩm đã ghi nhận: {len(st.get('products', {}))}")
        passed = sum(1 for p in st.get("products", {}).values() if p.get("status") == "QC_PASSED")
        print(f"  - QC_PASSED: {passed}")
