import json
import os
import time
import urllib.parse
import urllib.request

REPO = '/Users/tan/tavy-korea'
MANIFEST = os.path.join(REPO, 'server/catalog-150.json')
BACKUP = os.path.expanduser('~/tavy-korea-backups/20261124_pre_upgrade/d1')
KEY = open(os.path.expanduser('~/.config/tavy/price-api.key')).read().strip()

prods = {p['firestoreId']: p for p in json.load(open(f'{BACKUP}/firestore_products_before.json'))}
out = json.load(open('/tmp/reresolve_out2.json'))
man = json.load(open(MANIFEST))
byid = {m['firestoreId']: m for m in man}


def refs_of(p):
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


def live(url):
    q = urllib.parse.urlencode({'url': url, 'force': '1'})
    req = urllib.request.Request(f'http://127.0.0.1:8787/price?{q}', headers={'x-api-key': KEY})
    try:
        return json.load(urllib.request.urlopen(req, timeout=90))
    except Exception as e:
        return {'ok': False, 'error': str(e)[:80]}


fixed = []
for row in out:
    fid = row['id']
    m = byid.get(fid)
    if not m:
        continue
    r = refs_of(prods.get(fid, {}))
    if not r:
        continue
    lo, hi = min(r), max(r)
    for cand in (row.get('candidates') or []):
        url = cand['href'].split('&dp_infw')[0]
        d = live(url)
        price = d.get('priceKrw') or 0
        if d.get('ok') and lo * 0.7 <= price <= hi * 1.25:
            m['url'] = url
            m['mallPriceKrwAtResolve'] = price
            m['mallProductName'] = (d.get('title') or '')[:120]
            m['reresolvedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            fixed.append((fid, price, int(lo), int(hi), url))
            print(f"FIX {fid} live={price:,} band={int(lo):,}-{int(hi):,} | {(d.get('title') or '')[:55]}")
            break
        print(f"  skip {fid} live={price:,} band={int(lo):,}-{int(hi):,}")

json.dump(man, open(MANIFEST, 'w'), ensure_ascii=False, indent=1)
print('APPLIED', len(fixed))
