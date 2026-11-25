"""Chọn 80 SKU chủ lực từ nhiều bảng xếp hạng OY (không dùng LLM).

Tín hiệu "mua thật, bền": xuất hiện ở nhiều bảng (toàn sàn + ngành), rank cao,
rating cao. Loại set/quà tặng/1+1. Chọn theo quota ngành.

Chạy: env -u PYTHONPATH python3 scripts/build_catalog_80.py
Xuất: /tmp/catalog80.json, /tmp/catalog80.md
"""
import json
import re
import time
from collections import Counter

from curl_cffi import requests

CODES = ['900000100000001', '900000100000002', '900000100000003',
         '900000100000005', '900000100000007', '900000100000008']
BASE = 'https://www.oliveyoung.co.kr/store/main/getBestList.do?dispCatNo='
PROMO_RE = re.compile(r'1\+1|2\+1|1\+2|더블|세트|증정|리필|패키지|기획팩|샘플|미니어처')
QUOTA = {'skincare': 40, 'makeup': 20, 'mask': 8, 'hair_body': 6, 'fragrance': 3, 'other': 0}

CAT_MAP = [
    ('마스크팩|마스크|팩', 'mask'),
    ('향수|퍼퓸|코롱|오 드', 'fragrance'),
    ('헤어|샴푸|컨디셔너|트리트먼트|바디|핸드|풋', 'hair_body'),
    ('메이크업|립|아이|치크|블러셔|파운데이션|쿠션|컨실러|아이브로우|마스카라|섀도|하이라이터|립스틱|틴트', 'makeup'),
    ('스킨|로션|크림|세럼|앰플|에센스|토너|클렌징|선크림|선케어|미스트|패드', 'skincare'),
]


def classify(cat_text, name):
    s = (cat_text or '') + ' ' + (name or '')
    for pat, cat in CAT_MAP:
        if re.search(pat, s):
            return cat
    return 'other'


def scrape():
    seen = {}
    for code in CODES:
        r = None
        for attempt in range(3):
            r = requests.get(BASE + code, impersonate='chrome124', timeout=30)
            if r.status_code == 200 and 'prd_info' in r.text:
                break
            time.sleep(15)
        if not r or r.status_code != 200 or 'prd_info' not in r.text:
            print('skip', code, r.status_code if r else 'ERR')
            continue
        html = r.text
        n = 0
        for part in html.split('<div class="prd_info ">')[1:]:
            m = re.search(r'data-ref-goodsNo="([A-Z0-9]{13})"', part)
            if not m:
                continue
            brand = re.search(r'class="tx_brand">([^<]*)<', part)
            name = re.search(r'class="tx_name">([^<]*)<', part)
            price = re.search(r'class="tx_cur"><span class="tx_num">([\d,]+)<', part)
            rank = re.search(r'thumb_flag best">(\d+)<', part)
            rating = re.search(r'10점만점에\s*([\d.]+)점', part)
            cat = re.search(r'data-ref-goodscategory="([^"]*)"', part)
            if not rank:
                continue
            gid = m.group(1)
            nm = name.group(1) if name else ''
            row = {'goodsNo': gid, 'brand': brand.group(1) if brand else '', 'name': nm,
                   'price': int(price.group(1).replace(',', '')) if price else None,
                   'rating': float(rating.group(1)) if rating else None,
                   'rank': int(rank.group(1)), 'category': classify(cat.group(1) if cat else '', nm),
                   'lists': 1}
            if gid in seen:
                seen[gid]['lists'] += 1
                seen[gid]['rank'] = min(seen[gid]['rank'], row['rank'])
            else:
                seen[gid] = row
            n += 1
        print('list', code, n, 'unique total', len(seen))
        time.sleep(10)
    return list(seen.values())


BLACK_RE = re.compile(r'단백질쉐이크|베이글칩|부각|초콜릿|치약|콘돔|식단|간식|영양제|비타민|탈취제|세탁|주방세제')


def main():
    try:
        rows = json.load(open('/tmp/catalog100_raw.json'))
        print('raw cache', len(rows))
    except Exception:
        rows = scrape()
        json.dump(rows, open('/tmp/catalog100_raw.json', 'w'), ensure_ascii=False)
    print('candidates', len(rows))
    try:
        verdict = json.load(open('/tmp/catalog80_verdict.json'))
    except Exception:
        verdict = {}
    pool = []
    for r in rows:
        v = verdict.get(r['goodsNo']) or {}
        if v.get('category'):
            r['category'] = v['category']
        if BLACK_RE.search(r['name'] or ''):
            continue
        r['is_promo'] = bool(PROMO_RE.search(r['name']))
        r['score'] = round((r['lists'] * 100 + (101 - r['rank'])) * ((r['rating'] or 4.0) / 5), 2)
        if r['is_promo']:
            r['score'] = round(r['score'] - 60, 2)
        pool.append(r)
    print('candidates', len(pool), 'non-promo', sum(1 for r in pool if not r['is_promo']))

    chosen = []
    for cat, n in QUOTA.items():
        cand = sorted([r for r in pool if r['category'] == cat], key=lambda x: -x['score'])
        chosen += cand[:n]
    if len(chosen) < 80:
        rest = sorted([r for r in pool if r not in chosen], key=lambda x: -x['score'])
        chosen += rest[:80 - len(chosen)]
    chosen = sorted(chosen, key=lambda x: -x['score'])[:80]

    json.dump({'snapshotDate': '2026-11-26', 'lists': CODES, 'products': chosen},
              open('/tmp/catalog80.json', 'w'), ensure_ascii=False, indent=1)
    lines = ['| # | goodsNo | Brand | Tên | Ngành | Giá | Rank | Bảng | Rating | Điểm |',
             '|---|---|---|---|---|---|---|---|---|---|']
    for i, r in enumerate(chosen, 1):
        lines.append(f"| {i} | {r['goodsNo']} | {r['brand']} | {r['name'][:46]} | {r['category']} | "
                     f"{r['price']} | {r['rank']} | {r['lists']} | {r['rating']} | {r['score']} |")
    open('/tmp/catalog80.md', 'w').write('\n'.join(lines))
    print('chosen', len(chosen), Counter(r['category'] for r in chosen))
    print('brands', len({r['brand'] for r in chosen}))


if __name__ == '__main__':
    main()
