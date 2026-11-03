#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TAVY FULL OPTIONS AUDIT & SYNC ENGINE
Quét toàn bộ 121 SKU có phân loại trên Olive Young qua ChromeCoordinator VIP.
- Lưu checkpoint liên tục vào scripts/audited_options_data.json (tránh mất dữ liệu).
- Đồng bộ trực tiếp lên Cloud Firestore qua apply_audited_options_to_firestore.js mỗi 10 SKU.
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

DATA_FILE = BASE_DIR / "scripts" / "audited_options_data.json"
SKU_LIST_FILE = BASE_DIR / "scripts" / "all_option_skus.json"

def extract_oliveyoung_options(goods_no: str, tab_id: str):
    target_url = f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={goods_no}"
    ChromeTabManager.navigate_tab(tab_id, target_url)
    time.sleep(2.8)
    
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
    time.sleep(0.8)
    
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
        return {"hasOptions": False, "options": []}

def run_full_audit(batch_limit=30):
    if not SKU_LIST_FILE.exists():
        print("❌ Không tìm thấy all_option_skus.json")
        return

    skus_data = json.loads(SKU_LIST_FILE.read_text(encoding="utf-8"))
    
    existing_audited = {}
    if DATA_FILE.exists():
        try:
            existing_audited = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        except Exception:
            existing_audited = {}

    pending_skus = [s for s in skus_data if s["goodsNo"] not in existing_audited]
    print(f"📊 Tổng số SKU có options: {len(skus_data)} | Đã xong: {len(existing_audited)} | Còn lại: {len(pending_skus)}")

    if not pending_skus:
        print("✅ Toàn bộ SKU đã được kiểm định xong!")
        return

    target_batch = pending_skus[:batch_limit]
    print(f"⚡ Đang chạy đợt này: {len(target_batch)} SKU (batch limit {batch_limit})...")

    with ChromeCoordinator(bot_name="Tan_Full_Audit", task_name="audit_all_options", priority="VIP"):
        tab_id = ChromeTabManager.get_or_create_tab("oliveyoung.co.kr", "https://www.oliveyoung.co.kr")
        
        for idx, s in enumerate(target_batch):
            gno = s["goodsNo"]
            print(f"[{idx+1}/{len(target_batch)}] Quét {gno} ({s['name'][:30]})...", end=" ", flush=True)
            res = extract_oliveyoung_options(gno, tab_id)
            opts = res.get("options", [])
            
            existing_audited[gno] = opts
            # Lưu ngay lập tức
            DATA_FILE.write_text(json.dumps(existing_audited, ensure_ascii=False, indent=2), encoding="utf-8")
            
            if opts:
                min_p = min((o["priceKrw"] for o in opts if o.get("priceKrw")), default=0)
                print(f"✓ {len(opts)} options (Min: ₩{min_p:,})")
            else:
                print("⚠️ 0 options / đơn lẻ")
            
            time.sleep(2.0)

    # Đồng bộ ngay vào Firestore
    print("\n🔄 Đang đẩy dữ liệu đợt này lên Cloud Firestore...")
    subprocess.run(["node", str(BASE_DIR / "scripts" / "apply_audited_options_to_firestore.js")], check=False)
    print("✅ Hoàn tất đợt này!")

if __name__ == "__main__":
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    run_full_audit(limit)
