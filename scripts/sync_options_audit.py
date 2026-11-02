#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TAVY OPTIONS SYNC & AUDIT BOT (VIP CHROME COORDINATOR)
Đồng bộ giá Won độc lập cho từng phân loại (Options) từ Olive Young lên Firestore.
- Bóc tách đúng giá Won (KRW) của từng option (Set to, chai lớn, phụ thu).
- Đánh dấu chuẩn xác trạng thái Tồn Kho (is_sold_out) của từng option.
- Cập nhật giá sản phẩm cha = Giá thấp nhất của option còn hàng (Starting Price).
"""

import sys
import os
import json
import time
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(Path(__file__).parent))
from chrome_coordinator import ChromeCoordinator, ChromeTabManager

def extract_oliveyoung_options(goods_no: str, tab_id: str):
    target_url = f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={goods_no}"
    ChromeTabManager.navigate_tab(tab_id, target_url)
    time.sleep(3.2)
    
    # 1. Trigger open option selector
    js_click = """(() => {
        const btn = document.querySelector(".OptionSelector_btn-option__TkUrL, button[class*='btn-option'], .prd_option .btn_option, #option_btn");
        if (btn) {
            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(evt => {
                btn.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
            });
            return "CLICKED";
        }
        return "NO_BUTTON";
    })()"""
    ChromeTabManager.eval_js_in_tab(tab_id, js_click)
    time.sleep(1.2)
    
    # 2. Extract options details
    js_extract = """(() => {
        const list = document.querySelector(".OptionSelector_option-list__9iV9W, ul[class*='option-list']");
        if (!list) return JSON.stringify({ hasOptions: false, options: [] });
        
        const items = Array.from(list.querySelectorAll(".OptionSelector_option-item__yMYbC, li[class*='option-item']")).map((li, idx) => {
            const titEl = li.querySelector(".OptionSelector_option-item-tit__8zEjW, [class*='item-tit']");
            const fullText = li.innerText.trim();
            const name = titEl ? titEl.innerText.trim() : fullText.split("\\n")[0].trim();
            const isSoldOut = fullText.includes("일시품절") || fullText.includes("품절") || li.className.includes("soldout");
            
            let price = null;
            const priceMatch = fullText.match(/([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,})\\s*원/);
            if (priceMatch) {
                const clean = priceMatch[1].replace(/[.,]/g, '');
                const p = parseInt(clean, 10);
                if (p && p >= 1000) { price = p; }
            }
            const img = li.querySelector("img");
            const imgSrc = img ? (img.currentSrc || img.src) : null;
            return {
                id: idx + 1,
                nameKr: name,
                isSoldOut: isSoldOut,
                priceKrw: price,
                imageUrl: imgSrc
            };
        });
        return JSON.stringify({ hasOptions: true, options: items });
    })()"""
    
    raw = ChromeTabManager.eval_js_in_tab(tab_id, js_extract)
    try:
        return json.loads(raw)
    except Exception as e:
        print(f"Error parsing json for {goods_no}: {e}")
        return {"hasOptions": False, "options": []}

def run_sync_for_products(goods_list):
    print(f"🚀 Bắt đầu quét & đồng bộ options cho {len(goods_list)} SKU...")
    results = {}
    
    with ChromeCoordinator(bot_name="Tan_Options_Sync", task_name="audit_options_pricing", priority="VIP"):
        tab_id = ChromeTabManager.get_or_create_tab("oliveyoung.co.kr", "https://www.oliveyoung.co.kr")
        if not tab_id or tab_id == "NO_WINDOW":
            print("❌ Không tìm thấy tab Chrome!")
            return
            
        for idx, gno in enumerate(goods_list):
            print(f"[{idx+1}/{len(goods_list)}] Đang bóc tách SKU {gno}...")
            res = extract_oliveyoung_options(gno, tab_id)
            if res.get("hasOptions") and res.get("options"):
                results[gno] = res["options"]
                print(f"  ✓ Tìm thấy {len(res['options'])} options (Giá Won từ {min(o['priceKrw'] for o in res['options'] if o['priceKrw'])}₩)")
            else:
                print(f"  ⚠️ Không có options selector hoặc lỗi.")
            time.sleep(2.5)  # Giãn nhịp người thật chống bot

    # Lưu kết quả ra file tạm
    out_file = BASE_DIR / "scripts" / "audited_options_data.json"
    out_file.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n💾 Đã lưu dữ liệu bóc tách vào {out_file} ({len(results)} SKU thành công)!")

if __name__ == "__main__":
    test_skus = [
        "A000000158991", # Clinique Cheek Pop
        "A000000213943", # Yunjak Base Prep
        "A000000174439", # Dung dịch vệ sinh phụ nữ
        "A000000250243", # Xịt khóa nền
        "A000000185903", # Phấn nước VDL
        "A000000186409"  # Sữa rửa mặt Blanc Nature
    ]
    target_skus = sys.argv[1:] if len(sys.argv) > 1 else test_skus
    run_sync_for_products(target_skus)
