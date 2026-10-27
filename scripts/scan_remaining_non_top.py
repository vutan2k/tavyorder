#!/usr/bin/env python3
import json
import time
import os
import re
import subprocess

CHECKPOINT_FILE = "/tmp/live_price_scan_checkpoint.json"

def get_oliveyoung_tab():
    script = '''
    tell application "Google Chrome"
        tell front window
            set idx to 1
            repeat with t in tabs
                if (URL of t as string) contains "oliveyoung.co.kr" then
                    return idx
                end if
                set idx to idx + 1
            end repeat
            return 0
        end tell
    end tell
    '''
    res = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    try:
        return int(res.stdout.strip())
    except:
        return 0

def solve_cf_by_nav(tab_num, goods_no):
    print(f"   🛡️ Phát hiện Cloudflare Challenge! Đang điều hướng Tab {tab_num} để Chrome tự vượt qua...")
    nav_cmd = f'''
    tell application "Google Chrome"
        tell front window
            tell tab {tab_num}
                set URL to "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={goods_no}"
            end tell
        end tell
    end tell
    '''
    subprocess.run(["osascript", "-e", nav_cmd])
    for i in range(12):
        time.sleep(1.0)
        title_cmd = f'''
        tell application "Google Chrome"
            tell front window
                tell tab {tab_num}
                    return title
                end tell
            end tell
        end tell
        '''
        t = subprocess.run(["osascript", "-e", title_cmd], capture_output=True, text=True).stdout.strip()
        if t and "기다려" not in t and "Chờ" not in t:
            print(f"   ✅ Chrome đã vượt qua Cloudflare thành công! Tiêu đề: '{t[:40]}'")
            time.sleep(2.0)
            return True
    return False

def parse_price_text(text):
    if not text:
        return None, None, "0%"
    clean = text.replace(",", "").replace(".", "")
    nums = re.findall(r"(\d+)\s*원", clean)
    pcts = re.findall(r"(\d+)%", clean)
    
    if len(nums) >= 2:
        orig = int(nums[0])
        sale = int(nums[1])
        disc = f"{pcts[0]}%" if pcts else f"{round((1 - sale/orig)*100)}%"
        return orig, sale, disc
    elif len(nums) == 1:
        val = int(nums[0])
        return val, val, "0%"
    return None, None, "0%"

def main():
    tab_num = get_oliveyoung_tab()
    if tab_num == 0:
        print("❌ Không tìm thấy tab Olive Young trên Chrome!")
        return

    fs_prods = json.load(open("/tmp/firestore_products.json"))
    live_top100 = json.load(open("/tmp/live_top100_oliveyoung.json"))
    top_gids = set(x["goodsNo"] for x in live_top100 if x.get("goodsNo"))
    non_top_gids = [p.get("goodsNo") or p.get("firestoreId") for p in fs_prods if (p.get("goodsNo") or p.get("firestoreId")) not in top_gids]

    checkpoint = {}
    if os.path.exists(CHECKPOINT_FILE):
        try:
            checkpoint = json.load(open(CHECKPOINT_FILE))
            print(f"🔄 Đã nạp checkpoint trước đó: {len(checkpoint)} sản phẩm.")
        except:
            pass

    # Filter out items already successfully scanned
    to_scan = [g for g in non_top_gids if g not in checkpoint or checkpoint[g].get("isChallenge") or not checkpoint[g].get("title")]
    print(f"📋 Cần quét {len(to_scan)}/{len(non_top_gids)} sản phẩm chưa có dữ liệu...")

    batch_size = 5
    idx = 0
    while idx < len(to_scan):
        chunk = to_scan[idx:idx+batch_size]
        print(f"\n-> Đang quét lô {idx//batch_size + 1}/{(len(to_scan)+batch_size-1)//batch_size} ({len(chunk)} SP: {', '.join(chunk)})...")
        
        js_code = f"""(() => {{
            window.__scanSeq = null;
            const list = {json.dumps(chunk)};
            const delay = (ms) => new Promise(res => setTimeout(res, ms));
            (async () => {{
                const results = [];
                for (const g of list) {{
                    try {{
                        const r = await fetch("/store/goods/getGoodsDetail.do?goodsNo=" + g);
                        const html = await r.text();
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, "text/html");
                        const priceWrap = doc.querySelector(".price, .price_wrap, .goods_price, [class*='price']");
                        const priceText = priceWrap ? priceWrap.innerText.trim() : "";
                        
                        const isChallenge = doc.title.includes("기다려") || doc.title.includes("Chờ");
                        const isDiscontinued = !isChallenge && (
                            html.includes("존재하지 않는") || 
                            html.includes("판매가 중단") || 
                            html.includes("판매종료") || 
                            doc.title === "올리브영 온라인몰" || 
                            doc.title.includes("오류") || 
                            doc.title.includes("Error")
                        );
                        const isSoldOut = isDiscontinued || 
                                          html.includes("btnSoldout") || 
                                          html.includes("일시품절") || 
                                          html.includes("품절된 상품");
                                          
                        results.push({{
                            goodsNo: g,
                            status: r.status,
                            title: doc.title,
                            priceText: priceText,
                            isChallenge: isChallenge,
                            isDiscontinued: isDiscontinued,
                            isSoldOut: isSoldOut
                        }});
                        
                        if (isChallenge) {{
                            break;
                        }}
                    }} catch (err) {{
                        results.push({{ goodsNo: g, error: err.message }});
                    }}
                    await delay(1200);
                }}
                window.__scanSeq = JSON.stringify(results);
            }})();
        }})()"""
        
        with open("/tmp/temp_scan_seq.js", "w") as f:
            f.write(js_code)
            
        script_run = f'''
        tell application "Google Chrome"
            tell front window
                tell tab {tab_num}
                    set js to read POSIX file "/tmp/temp_scan_seq.js"
                    execute javascript js
                end tell
            end tell
        end tell
        '''
        subprocess.run(["osascript", "-e", script_run])
        
        # Max wait for chunk: len(chunk) * 1.5s + 5s
        wait_limit = len(chunk) * 2 + 6
        raw_res = ""
        for _ in range(wait_limit):
            time.sleep(1.0)
            script_poll = f'''
            tell application "Google Chrome"
                tell front window
                    tell tab {tab_num}
                        return execute javascript "window.__scanSeq"
                    end tell
                end tell
            end tell
            '''
            poll = subprocess.run(["osascript", "-e", script_poll], capture_output=True, text=True).stdout.strip()
            if poll and poll != "missing value" and poll != "null":
                raw_res = poll
                break
                
        hit_challenge = False
        challenge_gid = None
        if raw_res:
            try:
                results = json.loads(raw_res)
                for item in results:
                    g = item["goodsNo"]
                    if item.get("isChallenge"):
                        hit_challenge = True
                        challenge_gid = g
                        break
                    origin, sale, pct = parse_price_text(item.get("priceText", ""))
                    item["originPrice"] = origin
                    item["salePrice"] = sale
                    item["discountRate"] = pct
                    checkpoint[g] = item
                    
                    st = "SOLD" if item.get("isDiscontinued") else ("HẾT HÀNG" if item.get("isSoldOut") else f"₩{sale:,}" if sale else "K RÕ")
                    print(f"   [{st}] {g}: {item.get('title', '')[:35]}")
            except Exception as e:
                print(f"   ⚠️ Lỗi parse JSON: {e}")
        else:
            print("   ⚠️ Chunk timeout!")
            
        # Save checkpoint
        with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
            json.dump(checkpoint, f, ensure_ascii=False, indent=2)

        if hit_challenge:
            solve_cf_by_nav(tab_num, challenge_gid)
            # do not increment idx, re-scan from where it stopped
            # re-calculate to_scan
            to_scan = [g for g in non_top_gids if g not in checkpoint or checkpoint[g].get("isChallenge") or not checkpoint[g].get("title")]
            idx = 0
            continue

        # advance idx by number of items successfully added
        to_scan = [g for g in non_top_gids if g not in checkpoint or checkpoint[g].get("isChallenge") or not checkpoint[g].get("title")]
        idx = 0
        time.sleep(1.0)

    print(f"\n🎉 HOÀN THÀNH TOÀN BỘ! Đã quét đủ {len(checkpoint)}/{len(non_top_gids)} sản phẩm thường!")

if __name__ == "__main__":
    main()
