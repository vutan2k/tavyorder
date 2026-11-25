"""Chốt 80 SKU chủ lực: merge bảng xếp hạng OY + danh sách ngành (theo độ phổ biến).

Nguồn:
- /tmp/catalog100_raw.json  (top 100 toàn sàn, đã cào)
- getMCategoryList.do các ngành, pageIdx 1..6 (24 SP/trang)

Loại: set quà/1+1/기획, thực phẩm, đồ dùng không phải mỹ phẩm.
Chọn theo quota ngành. Xuất /tmp/catalog80.json + /tmp/catalog80.md
"""
import json
import re
import time
from collections import Counter

from curl_cffi import requests

CAT_URL = 'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo={}&pageIdx={}'
REMOVE_CATS = {'10000010006'}
FEED = '10000010001'
CODES = ['10000010001', '10000010002', '10000010003', '10000010004', '10000010005', '10000010009']
QUOTA = {'skincare': 40, 'makeup': 20, 'mask': 8, 'hair_body': 7, 'fragrance': 5}
PROMO_RE = re.compile(r'1\+1|2\+1|1\+2|더블|세트|증정|리필|패키지|기획팩|샘플|미니어처')
BLACK_RE = re.compile(r'단백질쉐이크|베이글칩|부각|초콜릿|치약|콘돔|식단|간식|영양제|비타민|탈취제|세탁|주방세제')
CAT_MAP = {
    '10000010001': 'skincare', '10000010002': 'makeup', '10000010003': 'hair_body',
    '10000010004': 'hair_body', '10000010005': 'fragrance', '10000010009': 'mask',
}


def parse(html, cat):
    rows = []
    for part in html.split('<div class="prd_info ">')[1:]:
        m = re.search(r'data-ref-goodsNo="([A-Z0-9]{13})"', part)
        if not m:
            continue
        brand = re.search(r'class="tx_brand">([^<]*)<', part)
        name = re.search(r'class="tx_name">([^<]*)<', part)
        price = re.search(r'class="tx_cur"><span class="tx_num">([\d,]+)<', part)
        rank = re.search(r'thumb_flag best">(\d+)<', part)
        rows.append({'goodsNo': m.group(1), 'brand': brand.group(1) if brand else '',
                     'name': name.group(1) if name else '',
                     'price': int(price.group(1).replace(',', '')) if price else None,
                     'category': cat, 'pos': len(rows) + 1,
                     'rank': int(rank.group(1)) if rank else None})
    return rows


def fetch_category(code, pages=6):
    out = []
    for p in range(1, pages + 1):
        r = None
        for _ in range(3):
            r = requests.get(CAT_URL.format(code, p), impersonate='chrome124', timeout=30)
            if r.status_code == 200 and 'prd_info' in r.text:
                break
            time.sleep(15)
        if not r or r.status_code != 200 or 'prd_info' not in r.text:
            print('  skip', code, p, r.status_code if r else 'ERR')
            break
        rows = parse(r.text, CAT_MAP[code])
        if not rows:
            break
        out += rows
        print('  ', code, 'page', p, len(rows))
        time.sleep(9)
    return out


def main():
    try:
        rows = json.load(open('/tmp/catalog_cats_raw.json'))
        print('cat cache', len(rows))
    except Exception:
        rows = []
        for code in CODES:
            rows += fetch_category(code)
        json.dump(rows, open('/tmp/catalog_cats_raw.json', 'w'), ensure_ascii=False)

    try:
        best = json.load(open('/tmp/catalog100_raw.json'))
    except Exception:
        best = []
    best_rank = {r['goodsNo']: r['rank'] for r in best if r.get('rank')}

    seen = {}
    for r in rows:
        if BLACK_RE.search(r['name']):
            continue
        gid = r['goodsNo']
        if gid not in seen:
            seen[gid] = r
            seen[gid]['best_rank'] = best_rank.get(gid)
        else:
            seen[gid]['best_rank'] = seen[gid].get('best_rank') or best_rank.get(gid)

    pool = []
    for r in seen.values():
        r['is_promo'] = bool(PROMO_RE.search(r['name']))
        base = (200 if r['best_rank'] else 0) + (200 - r['pos']) / 2
        r['score'] = round(base - (80 if r['is_promo'] else 0), 2)
        pool.append(r)
    print('pool', len(pool), Counter(r['category'] for r in pool))

    chosen = []
    for cat, n in QUOTA.items():
        cand = sorted([r for r in pool if r['category'] == cat], key=lambda x: -x['score'])
        chosen += cand[:n]
    if len(chosen) < 80:
        rest = sorted([r for r in pool if r not in chosen], key=lambda x: -x['score'])
        chosen += rest[:80 - len(chosen)]
    chosen = sorted(chosen, key=lambda x: -x['score'])[:80]

    json.dump({'snapshotDate': '2026-11-26', 'products': chosen},
              open('/tmp/catalog80.json', 'w'), ensure_ascii=False, indent=1)
    lines = ['| # | goodsNo | Brand | Tên | Ngành | Giá | Top100 | Promo |',
             '|---|---|---|---|---|---|---|---|']
    for i, r in enumerate(chosen, 1):
        lines.append(f"| {i} | {r['goodsNo']} | {r['brand']} | {r['name'][:50]} | {r['category']} | "
                     f"{r['price']} | {r['best_rank'] or ''} | {'Y' if r['is_promo'] else ''} |")
    open('/tmp/catalog80.md', 'w').write('\n'.join(lines))
    print('chosen', len(chosen), Counter(r['category'] for r in chosen),
          'promo', sum(r['is_promo'] for r in chosen))


if __name__ == '__main__':
    main()
