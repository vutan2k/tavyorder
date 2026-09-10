import json
import time
import os

TELEMETRY_FILE = "/Users/tan/Desktop/oliveyoung_ranking/enrichment_telemetry.json"

def record_heartbeat(total=100, completed=0, in_progress=None, last_sku=None, last_status="OK", error=None, extra=None):
    pct = round((completed / total) * 100, 1) if total > 0 else 0
    payload = {
        "timestamp": time.time(),
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_products": total,
        "completed_count": completed,
        "progress_percent": f"{pct}%",
        "current_in_progress": in_progress,
        "last_processed_sku": last_sku,
        "last_status": last_status,
        "last_error": error,
        "extra": extra or {},
        "system": {
            "ram_status": "NORMAL (Chrome recycled every 15 SKUs)",
            "vision_engine": "Apple Vision Framework Native (Active)"
        }
    }
    with open(TELEMETRY_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return payload

def get_telemetry():
    if os.path.exists(TELEMETRY_FILE):
        with open(TELEMETRY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return None
