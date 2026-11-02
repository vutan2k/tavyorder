#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))
from chrome_coordinator import ChromeCoordinator, ChromeTabManager
import json
import time

def extract_product_options(goods_no: str):
    target_url = f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={goods_no}"
    with ChromeCoordinator(bot_name="Tan_Direct_VIP", task_name=f"audit_options_{goods_no}", priority="VIP"):
        tab_id = ChromeTabManager.get_or_create_tab("oliveyoung.co.kr", target_url)
        ChromeTabManager.navigate_tab(tab_id, target_url)
        time.sleep(3.5)
        
        # Click option button if present
        js_click = """(() => {
            const btn = document.querySelector(".OptionSelector_btn-option__TkUrL, button[class*='btn-option'], .prd_option .btn_option");
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
        
        # Extract options
        js_extract = """(() => {
            const list = document.querySelector(".OptionSelector_option-list__9iV9W, ul[class*='option-list']");
            if (!list) {
                // If no ul list, check for single price or standard options
                return JSON.stringify({ hasOptions: false });
            }
            const items = Array.from(list.querySelectorAll(".OptionSelector_option-item__yMYbC, li[class*='option-item']")).map((li, idx) => {
                const titEl = li.querySelector(".OptionSelector_option-item-tit__8zEjW, [class*='item-tit']");
                const fullText = li.innerText.trim();
                const name = titEl ? titEl.innerText.trim() : fullText.split("\\n")[0].trim();
                const isSoldOut = fullText.includes("일시품절") || fullText.includes("품절") || li.className.includes("soldout");
                
                // Parse price using strict Korean currency regex
                let price = null;
                const priceMatch = fullText.match(/([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,})\s*원/);
                if (priceMatch) {
                    const clean = priceMatch[1].replace(/[.,]/g, '');
                    const p = parseInt(clean, 10);
                    if (p && p >= 1000) {
                        price = p;
                    }
                }
                const img = li.querySelector("img");
                const imgSrc = img ? (img.currentSrc || img.src) : null;
                return {
                    id: idx + 1,
                    nameKr: name,
                    fullText: fullText.replace(/\\n/g, ' | '),
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
            return {"error": str(e), "raw": raw}

if __name__ == "__main__":
    gno = sys.argv[1] if len(sys.argv) > 1 else "A000000158991"
    res = extract_product_options(gno)
    print(json.dumps(res, ensure_ascii=False, indent=2))
