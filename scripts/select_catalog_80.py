"""Chọn 80 SKU ổn định từ ranking OY bằng Gemini (Vertex, batch, 1 lần).

- Cào top 100 trang 판매랭킹 OY (rank, brand, tên Hàn, giá, rating).
- Lọc sơ bộ SKU là set/quà tặng/flash sale bằng regex.
- Gọi gemini-2.5-flash phân loại ngành + chấm điểm, 25 SKU/request.
- Chọn 80 theo quota ngành, xuất /tmp/catalog80.json + bảng markdown.

Chạy: env -u PYTHONPATH python3.11 scripts/select_catalog_80.py
"""
import json
import re
import subprocess
import sys
import urllib.request

from curl_cffi import requests

REPO = '/Users/tan/tavy-korea'
LIST_URL = 'https://www.oliveyoung.co.kr/store/main/getBestList.do?dispCatNo=900000100000001'
PROJECT = 'tavyorder'
LOC = 'us-central1'
MODEL = 'gemini-2.5-flash'
QUOTA = {'skincare': 42, 'makeup': 20, 'mask': 8, 'hair_body': 6, 'fragrance': 4}
PROMO_RE = re.compile(r'1\+1|2\+1|1\+2|더블|세트|증정|리필|패키지|기획팩')


def token():
    return subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                    f'{REPO}/scripts/adc_token.py'], text=True).strip()


def scrape():
    html = requests.get(LIST_URL, impersonate='chrome124', timeout=30).text
    rows = []
    for part in html.split('<div class="prd_info ">')[1:]:
        m = re.search(r'data-ref-goodsNo="([A-Z0-9]{13})"', part)
        if not m:
            continue
        brand = re.search(r'class="tx_brand">([^<]*)<', part)
        name = re.search(r'class="tx_name">([^<]*)<', part)
        price = re.search(r'class="tx_cur"><span class="tx_num">([\d,]+)<', part)
        rank = re.search(r'thumb_flag best">(\d+)<', part)
        rating = re.search(r'10점만점에\s*([\d.]+)점', part)
        if not rank:
            continue
        rows.append({
            'goodsNo': m.group(1),
            'rank': int(rank.group(1)),
            'brand': brand.group(1) if brand else '',
            'name': name.group(1) if name else '',
            'price': int(price.group(1).replace(',', '')) if price else None,
            'rating': float(rating.group(1)) if rating else None,
            'pre_promo': bool(PROMO_RE.search(name.group(1) if name else '')),
        })
    rows.sort(key=lambda x: x['rank'])
    return rows


def ask(tok, items):
    prompt = (
        'Bạn phân loại sản phẩm mỹ phẩm Hàn Quốc cho một shop order hộ. '
        'Với mỗi sản phẩm trong danh sách JSON, trả về đúng một object:\n'
        '{"goodsNo": "...", "category": "skincare|makeup|mask|hair_body|fragrance|other", '
        '"is_promo": true/false, "score": 1-10, "reason": "<=12 từ tiếng Việt"}\n'
        'is_promo=true nếu tên là set quà tặng, bản giới hạn theo mùa, bundle 1+1/2+1, '
        'hoặc sản phẩm chỉ tồn tại trong đợt khuyến mãi. '
        'score cao nếu đây là sản phẩm chủ lực, bán lâu dài, nhiều người mua. '
        'Chỉ trả về JSON array, không giải thích.\n\n'
        + json.dumps(items, ensure_ascii=False)
    )
    body = {'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
            'generationConfig': {'temperature': 0.2, 'maxOutputTokens': 8192,
                                 'responseMimeType': 'application/json'}}
    req = urllib.request.Request(
        f'https://{LOC}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{LOC}/publishers/google/models/{MODEL}:generateContent',
        data=json.dumps(body).encode(),
        headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.load(r)
    cand = d['candidates'][0]
    text = cand['content']['parts'][0]['text']
    print('   finish', cand.get('finishReason'), 'chars', len(text))
    return json.loads(text)


def ask_batch(tok, items, depth=0):
    try:
        return ask(tok, items)
    except Exception as e:
        if len(items) > 4 and depth < 3:
            mid = len(items) // 2
            print('  split', len(items), '->', mid, str(e)[:60])
            return ask_batch(tok, items[:mid], depth + 1) + ask_batch(tok, items[mid:], depth + 1)
        print('  drop batch', len(items), str(e)[:80])
        return []


def main():
    rows = scrape()
    print('scraped', len(rows))
    tok = token()
    try:
        verdict = json.load(open('/tmp/catalog80_verdict.json'))
        print('verdict cache', len(verdict))
    except Exception:
        verdict = {}
    for i in range(0, len(rows), 10):
        batch = rows[i:i + 10]
        if all(r['goodsNo'] in verdict for r in batch):
            print('batch', i, 'cached')
            continue
        payload = [{'goodsNo': r['goodsNo'], 'brand': r['brand'], 'name': r['name'],
                    'rank': r['rank'], 'price': r['price'], 'rating': r['rating']} for r in batch]
        out = ask_batch(tok, payload)
        for o in out:
            if isinstance(o, dict) and o.get('goodsNo') in {r['goodsNo'] for r in batch}:
                verdict[o['goodsNo']] = o
        print('batch', i, 'got', len(out))
        json.dump(verdict, open('/tmp/catalog80_verdict.json', 'w'), ensure_ascii=False)

    merged = []
    for r in rows:
        v = verdict.get(r['goodsNo'], {})
        r = dict(r)
        r['category'] = v.get('category', 'other')
        r['is_promo'] = bool(r['pre_promo'])
        r['score'] = v.get('score', 0)
        r['reason'] = v.get('reason', '')
        merged.append(r)

    # chọn theo quota
    pool = [r for r in merged if not r['is_promo'] and r['category'] in QUOTA]
    chosen = []
    for cat, n in QUOTA.items():
        cand = sorted([r for r in pool if r['category'] == cat],
                      key=lambda x: (-(x['score'] or 0), x['rank']))
        chosen += cand[:n]
    # nếu thiếu, bù bằng SKU điểm cao còn lại
    if len(chosen) < 80:
        rest = sorted([r for r in merged if not r['is_promo'] and r not in chosen],
                      key=lambda x: (-(x['score'] or 0), x['rank']))
        chosen += rest[:80 - len(chosen)]
    chosen.sort(key=lambda x: (-(x['score'] or 0), x['rank']))
    chosen = chosen[:80]

    json.dump({'snapshotDate': '2026-11-25', 'source': LIST_URL, 'products': chosen},
              open('/tmp/catalog80.json', 'w'), ensure_ascii=False, indent=1)

    lines = ['| # | goodsNo | Brand | Tên | Ngành | Giá KRW | Rank | Điểm | Lý do |',
             '|---|---|---|---|---|---|---|---|---|']
    for i, r in enumerate(chosen, 1):
        lines.append(f"| {i} | {r['goodsNo']} | {r['brand']} | {r['name'][:48]} | {r['category']} | "
                     f"{r['price']} | {r['rank']} | {r['score']} | {r['reason']} |")
    open('/tmp/catalog80.md', 'w').write('\n'.join(lines))
    print('chosen', len(chosen))
    from collections import Counter
    print(Counter(r['category'] for r in chosen))
    print('/tmp/catalog80.json /tmp/catalog80.md')


if __name__ == '__main__':
    main()
