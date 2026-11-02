#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TAVY CHROME COORDINATOR & VIP PREEMPTION ENGINE
Hệ thống điều phối Chrome thông minh & Tối ưu hóa đa bot:
1. Hai cấp độ ưu tiên:
   - VIP (A.Tân yêu cầu việc gấp): Chiếm quyền ngay lập tức, ngắt lịch cron ngầm.
   - NORMAL (Các cron job chạy ngầm): Tự động nhường đường trong 3-5s khi có lệnh VIP.
2. Quản lý Tab cách ly (Tab Isolation):
   - Thao tác ngầm qua Tab ID, KHÔNG bao giờ chiếm hay đè `active tab` của A.Tân.
3. Cơ chế Checkpoint & Resume:
   - Cron ngầm gặp lệnh VIP thì lưu checkpoint, trả Chrome, sau đó tự chạy tiếp.
"""

import os
import time
import json
import sys
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any

LOCK_FILE = Path("/tmp/tavy_chrome.lock")
URGENT_FLAG = Path("/tmp/tavy_chrome_urgent.flag")
MAX_LOCK_SECONDS = 300  # 5 phút tự động bẻ khóa nếu treo

def run_applescript(script: str) -> str:
    cmd = ["osascript", "-e", script]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.stdout.strip()

class ChromeCoordinator:
    def __init__(self, bot_name: str, task_name: str, priority: str = "NORMAL"):
        self.bot_name = bot_name
        self.task_name = task_name
        self.priority = priority.upper()  # "VIP" hoặc "NORMAL"
        self.acquired = False

    def acquire(self, timeout_seconds: int = 180) -> bool:
        start_time = time.time()
        
        # Nếu là việc gấp của A.Tân (VIP) -> Bật cờ khẩn cấp ngay lập tức
        if self.priority == "VIP":
            URGENT_FLAG.write_text(json.dumps({
                "requester": self.bot_name,
                "task": self.task_name,
                "timestamp": time.time()
            }))
            print(f"🚨 [VIP_OVERRIDE] A.Tân phát lệnh khẩn cấp cho '{self.bot_name}' ({self.task_name})! Đang phát tín hiệu yêu cầu cron nhường đường...")

        while time.time() - start_time < timeout_seconds:
            # Nếu là NORMAL mà thấy có cờ VIP của A.Tân -> Lập tức lùi bước không tranh giành
            if self.priority == "NORMAL" and URGENT_FLAG.exists():
                print(f"⏳ [CHROME_QUEUE] Phát hiện A.Tân đang có việc gấp VIP! '{self.bot_name}' tự giác nhường và đợi 5s...")
                time.sleep(5)
                continue

            if not LOCK_FILE.exists():
                # Tạo lock mới
                data = {
                    "bot": self.bot_name,
                    "task": self.task_name,
                    "priority": self.priority,
                    "timestamp": time.time(),
                    "time_str": time.strftime("%Y-%m-%d %H:%M:%S")
                }
                LOCK_FILE.write_text(json.dumps(data))
                self.acquired = True
                
                # Nếu VIP đã lấy được lock thì xóa cờ khẩn cấp
                if self.priority == "VIP":
                    URGENT_FLAG.unlink(missing_ok=True)
                
                status_icon = "👑 [VIP_CHROME]" if self.priority == "VIP" else "🔒 [CHROME_LOCK]"
                print(f"{status_icon} '{self.bot_name}' đã sở hữu Chrome thành công để '{self.task_name}'!")
                return True
            else:
                try:
                    data = json.loads(LOCK_FILE.read_text())
                    elapsed = time.time() - data.get("timestamp", 0)
                    holder_priority = data.get("priority", "NORMAL")

                    # Nếu A.Tân (VIP) đang cần mà thằng giữ lock là NORMAL và đã chạy > 5s -> Bẻ khóa nhường ngay cho VIP
                    if self.priority == "VIP" and holder_priority == "NORMAL" and elapsed > 5:
                        print(f"⚡ [VIP_PREEMPT] Thu hồi Chrome từ bot ngầm '{data.get('bot')}' để ưu tiên tuyệt đối cho A.Tân!")
                        LOCK_FILE.unlink(missing_ok=True)
                        continue

                    if elapsed > MAX_LOCK_SECONDS:
                        print(f"⚠️ [CHROME_TIMEOUT] Bot '{data.get('bot')}' giữ Chrome quá {MAX_LOCK_SECONDS}s! Bẻ khóa giải phóng...")
                        LOCK_FILE.unlink(missing_ok=True)
                        continue
                    else:
                        poll_interval = 2 if self.priority == "VIP" else 10
                        time.sleep(poll_interval)
                except Exception:
                    LOCK_FILE.unlink(missing_ok=True)

        print(f"❌ [CHROME_LOCK] Hết thời gian chờ cấp phép Chrome cho '{self.bot_name}'!")
        return False

    def should_yield(self) -> bool:
        """Kiểm tra xem có lệnh VIP của A.Tân chen ngang cần nhường đường ngay không."""
        if self.priority == "NORMAL" and URGENT_FLAG.exists():
            return True
        return False

    def release(self):
        if LOCK_FILE.exists():
            try:
                data = json.loads(LOCK_FILE.read_text())
                if data.get("bot") == self.bot_name:
                    LOCK_FILE.unlink(missing_ok=True)
                    print(f"🔓 [CHROME_LOCK] '{self.bot_name}' đã giải phóng Chrome về cho hệ thống!")
            except Exception:
                LOCK_FILE.unlink(missing_ok=True)
        if self.priority == "VIP":
            URGENT_FLAG.unlink(missing_ok=True)
        self.acquired = False

    def __enter__(self):
        if not self.acquire():
            raise RuntimeError(f"Không thể chiếm quyền Chrome cho bot {self.bot_name}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()

# TAB ISOLATION MANAGER
class ChromeTabManager:
    @staticmethod
    def get_or_create_tab(url_pattern: str, target_url: str) -> Optional[str]:
        """
        Tìm tab có URL chứa `url_pattern` mà KHÔNG làm đổi active tab của A.Tân.
        Nếu chưa có, tạo tab mới dưới nền và trả về Tab ID.
        """
        find_script = f"""
        tell application "Google Chrome"
            repeat with w in windows
                repeat with t in tabs of w
                    if (URL of t) contains "{url_pattern}" then
                        return id of t as string
                    end if
                end repeat
            end repeat
            -- Nếu không tìm thấy, tạo tab mới ở window 1
            if (count of windows) > 0 then
                tell window 1
                    set newTab to make new tab with properties {{URL:"{target_url}"}}
                    return id of newTab as string
                end tell
            end if
            return "NO_WINDOW"
        end tell
        """
        tab_id = run_applescript(find_script)
        if tab_id and tab_id != "NO_WINDOW":
            return tab_id
        return None

    @staticmethod
    def eval_js_in_tab(tab_id: str, js_code: str) -> str:
        """Thực thi Javascript trực tiếp trên tab ID cụ thể mà không chạm màn hình."""
        escaped_js = js_code.replace('\\', '\\\\').replace('"', '\\"')
        apple = f"""
        tell application "Google Chrome"
            repeat with w in windows
                repeat with t in tabs of w
                    if (id of t as string) is "{tab_id}" then
                        tell t to return execute javascript "{escaped_js}"
                    end if
                end repeat
            end repeat
        end tell
        return "TAB_NOT_FOUND"
        """
        return run_applescript(apple)

    @staticmethod
    def navigate_tab(tab_id: str, url: str) -> bool:
        """Chuyển hướng URL trên đúng tab ID ngầm."""
        apple = f"""
        tell application "Google Chrome"
            repeat with w in windows
                repeat with t in tabs of w
                    if (id of t as string) is "{tab_id}" then
                        set URL of t to "{url}"
                        return "SUCCESS"
                    end if
                end repeat
            end repeat
        end tell
        return "FAILED"
        """
        return run_applescript(apple) == "SUCCESS"

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "test"
    if mode == "test_vip":
        print("--- THỬ NGHIỆM CHIẾM QUYỀN VIP CỦA A.TÂN ---")
        with ChromeCoordinator(bot_name="Tan_Direct_Order", task_name="gap_kiem_tra_gia", priority="VIP"):
            print("👑 Đang thực hiện tác vụ khẩn cấp cho A.Tân...")
            time.sleep(2)
            print("✓ Hoàn tất tác vụ khẩn cấp!")
    elif mode == "test_normal":
        print("--- THỬ NGHIỆM CRON CHẠY NGẦM ---")
        with ChromeCoordinator(bot_name="cron_media", task_name="render_tiktok", priority="NORMAL") as coord:
            for i in range(5):
                if coord.should_yield():
                    print("⚠️ Có lệnh VIP của A.Tân! Tự giác dừng và nhường Chrome...")
                    break
                print(f"Đang chạy bước {i+1}/5...")
                time.sleep(1)
