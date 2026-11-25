"""Nạp danh sách 80 SKU chủ lực vào web (Firestore + manifest + ảnh).

- Đọc /tmp/catalog80.json
- Cào chi tiết OY: options, giá, og:image; tải ảnh về public/products/<id>.jpg
- Dịch tên sang tiếng Việt qua 9Router (batch 8), tính VND theo system_config/rates
- Ghi Firestore (REST, ADC), cập nhật server/catalog-150.json + catalog-sellable.json
  + public/data/all_products_catalog.json

Chạy thử: python3 scripts/ingest_catalog80.py
Ghi thật: python3 scripts/ingest_catalog80.py --apply
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

from curl_cffi import requests

REPO = '/Users/tan/tavy-korea'
PROJECT = 'tavyorder'
CAT80 = '/tmp/catalog80.json'
CACHE = '/tmp/ingest80_cache.json'
DETAIL = 'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo='
PRODUCTS_DIR = os.path.join(REPO, 'public', 'products')
MANIFEST = os.path.join(REPO, 'server', 'catalog-150.json')
SELLABLE = os.path.join(REPO, 'server', 'catalog-sellable.json')
ALLCAT = os.path.join(REPO, 'public', 'data', 'all_products_catalog.json')

CAT_VI = {'skincare': 'Chăm sóc da', 'makeup': 'Trang điểm', 'mask': 'Mặt nạ',
          'hair_body': 'Body & Hair', 'fragrance': 'Nước hoa'}
SUB_MAP = [
    ('토너|toner', 'Toner'), ('세럼|serum|앰플|ampoule', 'Serum'), ('크림|cream', 'Kem dưỡng'),
    ('클렌징|cleansing|폼|foam', 'Tẩy trang & Rửa mặt'), ('선크림|선케어|sunscreen', 'Chống nắng'),
    ('마스크|mask|팩', 'Mặt nạ'), ('샴푸|shampoo', 'Dầu gội'), ('바디|body', 'Body'),
    ('립|lip|틴트|tint|글로스|gloss', 'Son & Lip'), ('퍼퓸|향수|parfum', 'Nước hoa'),
    ('로션|lotion', 'Lotion / Sữa dưỡng'), ('에센스|essence', 'Essence'),
]


def token():
    return subprocess.check_output(['python3', os.path.join(REPO, 'scripts', 'adc_token.py')],
                                   text=True, env={**os.environ, 'PYTHONPATH': ''}).strip()


def r9(prompt, max_tokens=900):
    env = open('/Users/tan/.hermes/.env').read()
    key = re.search(r'OPENAI_API_KEY=(\S+)', env).group(1)
    req = urllib.request.Request(
        'http://127.0.0.1:20128/v1/chat/completions',
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
        data=json.dumps({'model': 'tanlam', 'stream': False, 'max_tokens': max_tokens,
                         'temperature': 0.1,
                         'messages': [{'role': 'user', 'content': prompt}]}).encode())
    d = json.load(urllib.request.urlopen(req, timeout=90))
    return d['choices'][0]['message']['content']


def translate(batch):
    """batch: [{goodsNo, brand, name}] -> {goodsNo: {name_vi, category, subCategory}}"""
    lines = '\n'.join(f"{i+1}. [{b['brand']}] {b['name']}" for i, b in enumerate(batch))
    prompt = (
        'Dịch tên sản phẩm mỹ phẩm Hàn Quốc sang tiếng Việt chuẩn shop order hộ. '
        'Giữ tên thương hiệu Latin, ghi rõ loại sản phẩm + dung tích, bỏ tag marketing trong ngoặc vuông, '
        'bỏ chữ 기획/증정. Trả về JSON array đúng thứ tự, mỗi item: '
        '{"i": số thứ tự, "name_vi": "...", "category": "skincare|makeup|mask|hair_body|fragrance", "subCategory": "..."}\n\n'
        + lines)
    txt = r9(prompt)
    m = re.search(r'\[.*\]', txt, re.DOTALL)
    out = {}
    if not m:
        return out
    try:
        arr = json.loads(m.group(0))
    except Exception:
        return out
    for o in arr:
        idx = o.get('i')
        if isinstance(idx, int) and 1 <= idx <= len(batch):
            out[batch[idx - 1]['goodsNo']] = o
    return out


def parse_detail(gid):
    last = None
    for attempt in range(3):
        r = requests.get(DETAIL + gid, impersonate='chrome124', timeout=35)
        if r.status_code == 200 and 'options' in r.text:
            break
        last = r.status_code
        time.sleep(20)
    else:
        raise RuntimeError(f'fetch fail {gid} {last}')

    t = r.text.replace('\\"', '"').replace('\\\\', '\\')
    i = t.find('"options":[')
    s = t.find('[', i)
    depth = 0
    end = -1
    for j in range(s, len(t)):
        if t[j] == '[':
            depth += 1
        elif t[j] == ']':
            depth -= 1
            if depth == 0:
                end = j
                break
    opts = json.loads(t[s:end + 1])
    og = re.search(r'<meta property="og:image" content="([^"]+)"', r.text)
    clean = []
    for o in opts:
        clean.append({'optionNumber': str(o.get('optionNumber') or len(clean) + 1),
                      'optionName': (o.get('optionName') or '').strip(),
                      'salePrice': int(o.get('salePrice') or 0),
                      'finalPrice': int(o.get('finalPrice') or o.get('salePrice') or 0),
                      'soldOut': bool(o.get('soldOutFlag'))})
    return {'options': clean, 'image': og.group(1) if og else None,
            'goodsName': (opts[0].get('goodsName') or '').strip() if opts else ''}


def download(url, gid):
    if not url:
        return False
    path = os.path.join(PRODUCTS_DIR, f'{gid}.jpg')
    r = requests.get(url, impersonate='chrome124', timeout=40)
    if r.status_code != 200 or len(r.content) < 3000:
        return False
    open(path, 'wb').write(r.content)
    return True


def calc_vnd(krw, rate, fee):
    return int(round(krw * rate * (1 + fee / 100) / 1000) * 1000)


def fs_value(v):
    if isinstance(v, bool):
        return {'booleanValue': v}
    if isinstance(v, int):
        return {'integerValue': str(v)}
    if isinstance(v, float):
        return {'doubleValue': v}
    if v is None:
        return {'nullValue': None}
    if isinstance(v, list):
        return {'arrayValue': {'values': [fs_value(x) for x in v]}}
    if isinstance(v, dict):
        return {'mapValue': {'fields': {k: fs_value(x) for k, x in v.items()}}}
    return {'stringValue': str(v)}


def patch_doc(tok, gid, doc):
    u = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/products/{gid}'
    body = json.dumps({'fields': {k: fs_value(v) for k, v in doc.items()}}).encode()
    req = urllib.request.Request(u, data=body, method='PATCH',
                                 headers={'Authorization': 'Bearer ' + tok,
                                          'Content-Type': 'application/json'})
    urllib.request.urlopen(req, timeout=60).read()


def get_rates(tok):
    u = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/system_config/rates'
    d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'Authorization': 'Bearer ' + tok})))
    f = d['fields']
    rate = float(f['KRW']['mapValue']['fields']['rate']['doubleValue'])
    fs = f['serviceFeePercent']
    fee = float(fs.get('stringValue') or fs.get('integerValue') or fs.get('doubleValue') or 20)
    return rate, fee


def main():
    apply = '--apply' in sys.argv
    products = json.load(open(CAT80))['products']
    existing_ids = set(json.load(open(SELLABLE))['ids'])
    todo = [p for p in products if p['goodsNo'] not in existing_ids]
    print('tổng 80, đã có', len(products) - len(todo), 'cần nạp', len(todo))

    cache = {}
    if os.path.exists(CACHE):
        cache = json.load(open(CACHE))
        print('cache', len(cache))

    for i, p in enumerate(todo, 1):
        gid = p['goodsNo']
        if gid in cache and cache[gid].get('options'):
            continue
        try:
            d = parse_detail(gid)
            cache[gid] = d
            print(f"[{i}/{len(todo)}] {gid} opts={len(d['options'])} img={'ok' if d['image'] else 'no'}")
        except Exception as e:
            print(f"[{i}/{len(todo)}] {gid} FAIL {str(e)[:80]}")
        json.dump(cache, open(CACHE, 'w'), ensure_ascii=False)
        time.sleep(9)

    # dịch theo lô 8
    trans = {}
    tc = '/tmp/ingest80_trans.json'
    if os.path.exists(tc):
        trans = json.load(open(tc))
    need = [p for p in todo if p['goodsNo'] not in trans and cache.get(p['goodsNo'])]
    for i in range(0, len(need), 8):
        batch = need[i:i + 8]
        try:
            got = translate(batch)
        except Exception as e:
            print('translate fail', str(e)[:80])
            got = {}
        trans.update(got)
        json.dump(trans, open(tc, 'w'), ensure_ascii=False)
        print(f'translate {i + len(batch)}/{len(need)}')

    if not apply:
        print('dry-run. mẫu:', json.dumps({k: trans.get(k) for k in list(trans)[:3]}, ensure_ascii=False))
        return

    tok = token()
    rate, fee = get_rates(tok)
    print('rates', rate, fee)

    manifest = json.load(open(MANIFEST))
    allcat = json.load(open(ALLCAT))
    now = time.strftime('%Y-%m-%dT%H:%M:%S.000Z')
    added = 0
    for p in todo:
        gid = p['goodsNo']
        d = cache.get(gid)
        if not d or not d['options']:
            print('skip (no detail)', gid)
            continue
        ok = download(d['image'], gid)
        tr = trans.get(gid) or {}
        name_vi = tr.get('name_vi') or d['goodsName'] or p['name']
        cat = tr.get('category') or p['category']
        if cat not in CAT_VI:
            cat = p['category']
        sub = tr.get('subCategory') or ''
        if not sub:
            for pat, val in SUB_MAP:
                if re.search(pat, (p['name'] or '') + ' ' + name_vi, re.I):
                    sub = val
                    break
        opts = []
        for idx, o in enumerate(d['options']):
            krw = o['finalPrice'] or o['salePrice']
            opts.append({'id': str(idx + 1), 'name': o['optionName'] or p['name'],
                         'name_vi': o['optionName'] or p['name'], 'name_kr': o['optionName'],
                         'price_krw': krw, 'price_vnd': calc_vnd(krw, rate, fee),
                         'isSoldOut': o['soldOut'], 'is_sold_out': o['soldOut'],
                         'imageUrl': f'/products/{gid}.jpg'})
        live = [o['price_krw'] for o in opts if not o['isSoldOut']] or [o['price_krw'] for o in opts]
        min_won = min(live)
        orig = max(o['salePrice'] for o in d['options']) or min_won
        doc = {
            'id': gid, 'goodsNo': gid, 'firestoreId': gid,
            'name': name_vi, 'name_vi': name_vi, 'name_kr': p['name'], 'nameKr': p['name'],
            'title': name_vi,
            'brand': p['brand'], 'brand_vi': p['brand'], 'brand_kr': p['brand'], 'brandKr': p['brand'],
            'category': cat, 'category_vi': CAT_VI.get(cat, ''), 'subCategory': sub,
            'categoryPath': p['category'],
            'rank': p.get('best_rank') or 0,
            'foreignPrice': min_won, 'price': min_won, 'originPrice': orig,
            'originalPrice': orig, 'originalPriceWon': orig, 'salePrice': min_won,
            'priceVnd': calc_vnd(min_won, rate, fee),
            'originalPriceVnd': calc_vnd(orig, rate, fee),
            'appliedKrwRate': rate, 'appliedServiceFeePercent': fee,
            'discountRate': f"{round((1 - min_won / orig) * 100)}%" if orig > min_won else '0%',
            'productImage': f'/products/{gid}.jpg', 'thumbnailUrl': f'/products/{gid}.jpg',
            'images': [f'/products/{gid}.jpg'], 'photoReviews': [],
            'options': opts, 'optionsCount': len(opts), 'hasOptions': True,
            'description': f"{name_vi} - {p['brand']} chính hãng, order tại Olive Young Hàn Quốc.",
            'usage': 'Sử dụng hàng ngày theo nhu cầu chăm sóc da.',
            'status': 'available', 'isAvailable': True, 'isSoldOut': False, 'is_sold_out': False,
            'isDiscontinued': False, 'isPublished': True, 'isHighEnd': False, 'isChallenge': False,
            'origin': 'KR', 'storageProvider': 'local',
            'productUrl': DETAIL + gid,
            'createdAt': now, 'updatedAt': now, 'lastAuditedAt': now,
        }
        patch_doc(tok, gid, doc)
        if not any(m.get('goodsNo') == gid for m in manifest):
            manifest.append({'firestoreId': gid, 'source': 'oy', 'goodsNo': gid,
                             'brand': p['brand'], 'name': name_vi})
        allcat.append(doc)
        added += 1
        print(f"commit {gid} {'img ok' if ok else 'IMG FAIL'} {name_vi[:50]}")

    json.dump(manifest, open(MANIFEST, 'w'), ensure_ascii=False, indent=2)
    ids = [m['goodsNo'] for m in manifest if m.get('source') == 'oy']
    json.dump({'ids': ids}, open(SELLABLE, 'w'), ensure_ascii=False, indent=1)
    json.dump(allcat, open(ALLCAT, 'w'), ensure_ascii=False, indent=2)
    print('ADDED', added, 'manifest', len(manifest), 'sellable', len(ids))


if __name__ == '__main__':
    main()
