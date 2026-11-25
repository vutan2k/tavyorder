"""Chốt 80 SKU chủ lực OY (v3): 9 ngành thật, 96 SP/ngành, ưu tiên top-100 toàn sàn.

Loại set quà/1+1/기획 (trừ khi nằm top-100), thực phẩm, đồ dùng không phải mỹ phẩm.
Xuất /tmp/catalog80.json, /tmp/catalog80.md
"""
import json
import re
import time
from collections import Counter

from curl_cffi import requests

CODES = {
    '10000010001': 'skincare',   # 스킨/토너
    '10000010008': 'skincare',   # 더모 코스메틱 스킨케어
    '10000010010': 'skincare',   # 클렌징폼/젤
    '10000010011': 'skincare',   # 선케어 선크림
    '10000010009': 'mask',       # 시트팩
    '10000010002': 'makeup',     # 립
    '10000010003': 'hair_body',  # 샤워/입욕
    '10000010004': 'hair_body',  # 샴푸
    '10000010005': 'fragrance',  # 향수
}
QUOTA = {'skincare': 38, 'makeup': 20, 'mask': 8, 'hair_body': 8, 'fragrance': 6}
PROMO_RE = re.compile(r'1\+1|2\+1|1\+2|더블|세트|증정|리필|패키지|기획팩|샘플|미니어처')
BLACK_RE = re.compile(r'단백질쉐이크|베이글칩|부각|초콜릿|치약|콘돔|식단|간식|영양제|비타민|탈취제|세탁|주방세제|속눈썹|네일')


def parse(html, cat):
    rows = []
    for part in html.split('<div class="prd_info ">')[1:]:
        m = re.search(r'data-ref-goodsNo="([A-Z0-9]{13})"', part)
        if not m:
            continue
        brand = re.search(r'class="tx_brand">([^<]*)<', part)
        name = re.search(r'class="tx_name">([^<]*)<', part)
        price = re.search(r'class="tx_cur"><span class="tx_num">([\d,]+)<', part)
        rows.append({'goodsNo': m.group(1), 'brand': brand.group(1) if brand else '',
                     'name': name.group(1) if name else '',
                     'price': int(price.group(1).replace(',', '')) if price else None,
                     'category': cat, 'pos': len(rows) + 1})
    return rows


def main():
    try:
        rows = json.load(open('/tmp/catalog_cats_v3.json'))
        print('cache', len(rows))
    except Exception:
        rows = []
        for code, cat in CODES.items():
            r = None
            for _ in range(3):
                r = requests.get(
                    f'https://www.oliveyoung.co.kr/store/display/getMCategoryList.do?dispCatNo={code}',
                    impersonate='chrome124', timeout=30)
                if r.status_code == 200 and 'prd_info' in r.text:
                    break
                time.sleep(15)
            if not r or 'prd_info' not in r.text:
                print('skip', code, r.status_code if r else 'ERR')
                continue
            got = parse(r.text, cat)
            print(code, cat, len(got))
            rows += got
            time.sleep(9)
        json.dump(rows, open('/tmp/catalog_cats_v3.json', 'w'), ensure_ascii=False)

    best = {r['goodsNo']: r['rank'] for r in json.load(open('/tmp/catalog100_raw.json')) if r.get('rank')}

    seen = {}
    for r in rows:
        if BLACK_RE.search(r['name']):
            continue
        if r['goodsNo'] not in seen:
            seen[r['goodsNo']] = r
    pool = []
    for r in seen.values():
        r['is_promo'] = bool(PROMO_RE.search(r['name']))
        r['best_rank'] = best.get(r['goodsNo'])
        score = (300 if r['best_rank'] else 0) + (100 - min(r['pos'], 100)) / 2
        if r['is_promo']:
            score -= 70
        r['score'] = round(score, 2)
        pool.append(r)
    print('pool', len(pool), Counter(r['category'] for r in pool))

    chosen = []
    for cat, n in QUOTA.items():
        cand = sorted([r for r in pool if r['category'] == cat and not r['is_promo']],
                      key=lambda x: -x['score'])
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
