import subprocess
import json
import time
import os

BASE_DIR = "/Users/tan/Desktop/oliveyoung_ranking"
TELEMETRY_FILE = os.path.join(BASE_DIR, "enrichment_telemetry.json")

def is_pipeline_running():
    res = subprocess.run(["ps", "aux"], capture_output=True, text=True)
    return "master_top100_pipeline.py" in res.stdout

def main():
    print("📊 [MONITOR] Bắt đầu theo dõi tiến độ đường ống 100 sản phẩm...")
    last_completed = -1

    while True:
        running = is_pipeline_running()
        if os.path.exists(TELEMETRY_FILE):
            try:
                with open(TELEMETRY_FILE, "r", encoding="utf-8") as f:
                    tel = json.load(f)
                completed = tel.get("completed_count", 0)
                pct = tel.get("progress_percent", "0%")
                last_sku = tel.get("last_processed_sku", "N/A")
                last_st = tel.get("last_status", "OK")

                if completed != last_completed:
                    print(f"[{time.strftime('%H:%M:%S')}] Tiến độ: {completed}/100 ({pct}) | SKU: {last_sku} [{last_st}] | PID active: {running}")
                    last_completed = completed

                if completed >= 100 or not running:
                    if not running:
                        print(f"🏁 [MONITOR] Tiến trình chính đã kết thúc. Hoàn tất: {completed}/100.")
                        break
            except Exception:
                pass
        
        if not running:
            break

        time.sleep(20)

if __name__ == "__main__":
    main()
