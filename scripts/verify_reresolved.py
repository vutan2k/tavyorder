import json
import os
import urllib.parse
import urllib.request

REPO = '/Users/tan/tavy-korea'
KEY = open(os.path.expanduser('~/.config/tavy/price-api.key')).read().strip()
BACKUP = os.path.expanduser('~/tavy-korea-backups/20261124_pre_upgrade/d1')

prods = {p['firestoreId']: p for p in json.load(open(f'{BACKUP}/firestore_products_before.json'))}
man = json.load(open(os.path.join(REPO, 'server/catalog-150.json')))
fixed_ids = set(json.load(open(f'{BACKUP}/d2b_reresolved.json')).keys())

def refs(p):
    vals = []
    for k in ('price_krw', 'price', 'foreignPrice', 'priceKrw', 'priceWon'):
        v = p.get(k)
        if isinstance(v, (int, float)) and v > 0:
            vals.append(float(v))
    for o in (p.get('options') or []):
        for k in ('price_krw', 'price', 'sale_price'):
            v = o.get(k)
            if isinstance(v, (int, float)) and v > 0:
                vals.append(float(v))
    return vals

for m in man:
    if m['firestoreId'] not in fixed_ids:
        continue
    q = urllib.parse.urlencode({'url': m['url'], 'force': '1'})
    req = urllib.request.Request(f'http://127.0.0.1:8787/price?{q}', headers={'x-api-key': KEY})
    try:
        d = json.load(urllib.request.urlopen(req, timeout=90))
    except Exception as e:
        print(m['firestoreId'], 'ERR', e)
        continue
    live = d.get('priceKrw') or 0
    r = refs(prods[m['firestoreId']])
    lo, hi = (min(r), max(r)) if r else (0, 0)
    flag = 'OK ' if live and lo * 0.7 <= live <= hi * 1.25 else 'BAD'
    print(f"{flag} {m['firestoreId']} live={live:,} band={int(lo):,}-{int(hi):,} | {(d.get('title') or '')[:60]}")
