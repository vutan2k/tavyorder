#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CHROME MUTEX LOCK & SCHEDULER HELPER
Dùng chung cho toàn bộ dàn bot Tavy Korea (Web, Media, CSKH)
Quy chuẩn:
- Lock file: /tmp/tavy_chrome.lock
- Max lock time: 300s (Tự động giải phóng nếu treo)
- Xếp hàng văn minh: Thử lại mỗi 15s nếu đang bận
"""

import os
import time
import json
import sys
from pathlib import Path

LOCK_FILE = Path("/tmp/tavy_chrome.lock")
MAX_LOCK_SECONDS = 300  # 5 phút

class ChromeMutex:
    def __init__(self, bot_name: str, task_name: str):
        self.bot_name = bot_name
        self.task_name = task_name
        self.acquired = False

    def acquire(self, timeout_seconds: int = 180) -> bool:
        start_time = time.time()
        while time.time() - start_time < timeout_seconds:
            if not LOCK_FILE.exists():
                # Tạo lock mới
                data = {
                    "bot": self.bot_name,
                    "task": self.task_name,
                    "timestamp": time.time(),
                    "time_str": time.strftime("%Y-%m-%d %H:%M:%S")
                }
                LOCK_FILE.write_text(json.dumps(data))
                self.acquired = True
                print(f"🔒 [CHROME_LOCK] '{self.bot_name}' đã chiếm Chrome thành công để '{self.task_name}'!")
                return True
            else:
                try:
                    data = json.loads(LOCK_FILE.read_text())
                    elapsed = time.time() - data.get("timestamp", 0)
                    if elapsed > MAX_LOCK_SECONDS:
                        print(f"⚠️ [CHROME_LOCK] Bot '{data.get('bot')}' giữ Chrome quá {MAX_LOCK_SECONDS}s! Tự động bẻ khóa giải cứu...")
                        LOCK_FILE.unlink(missing_ok=True)
                        continue
                    else:
                        print(f"⏳ [CHROME_LOCK] Chrome đang bận bởi '{data.get('bot')}' ({data.get('task')}). Chờ 15s...")
                        time.sleep(15)
                except Exception:
                    LOCK_FILE.unlink(missing_ok=True)
        print(f"❌ [CHROME_LOCK] Hết thời gian chờ cấp phép Chrome cho '{self.bot_name}'!")
        return False

    def release(self):
        if LOCK_FILE.exists():
            try:
                data = json.loads(LOCK_FILE.read_text())
                if data.get("bot") == self.bot_name:
                    LOCK_FILE.unlink(missing_ok=True)
                    print(f"🔓 [CHROME_LOCK] '{self.bot_name}' đã trả Chrome cho hệ thống!")
            except Exception:
                LOCK_FILE.unlink(missing_ok=True)
        self.acquired = False

    def __enter__(self):
        if not self.acquire():
            raise RuntimeError(f"Không thể chiếm quyền Chrome cho bot {self.bot_name}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()

if __name__ == "__main__":
    bot = sys.argv[1] if len(sys.argv) > 1 else "test_bot"
    task = sys.argv[2] if len(sys.argv) > 2 else "test_task"
    with ChromeMutex(bot, task):
        print("Đang thực hiện công việc trên Chrome...")
        time.sleep(3)
        print("Hoàn tất việc!")
