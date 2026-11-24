import importlib.util
import json
import os
import re
import sys

REPO = '/Users/tan/tavy-korea'
sys.path.insert(0, os.path.join(REPO, 'scripts'))
spec = importlib.util.spec_from_file_location('rr', os.path.join(REPO, 'scripts/reresolve_high_end.py'))
rr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rr)

BACKUP = os.path.expanduser('~/tavy-korea-backups/20261124_pre_upgrade/d1')
prods = {p['firestoreId']: p for p in json.load(open(f'{BACKUP}/firestore_products_before.json'))}
man = json.load(open(os.path.join(REPO, 'server/catalog-150.json')))

IDS = None
for a in sys.argv[1:]:
    if a.startswith('--ids='):
        IDS = set(a.split('=', 1)[1].split(','))

jobs = []
for m in man:
    if m['source'] != 'mall':
        continue
    if IDS and m['firestoreId'] not in IDS:
        continue
    p = prods.get(m['firestoreId'])
    if not p:
        continue
    refs = rr.price_refs(p)
    resolved = m.get('mallPriceKrwAtResolve')
    if not refs or not resolved:
        continue
    lo, hi = min(refs), max(refs)
    if not IDS and not (resolved > hi * 1.25 or resolved < lo * 0.7):
        continue
    want = rr.sizes_of(p.get('name_vi'), p.get('name'), p.get('name_kr'),
                       *(o.get('name_vi') or o.get('name') or '' for o in (p.get('options') or [])))
    name_kr = re.sub(r'\[[^\]]*\]|\([^)]*\)', ' ', p.get('name_kr') or '')
    brand_raw = p.get('brand') or ''
    BRAND_KR = {
        'dior': '디올', 'ysl': '입생로랑', 'lancôme': '랑콤', 'lancome': '랑콤',
        'jo malone london': '조말론', 'maison margiela': '메종 마르지엘라',
        'clé de peau beauté': '끌레드뽀 보떼', 'cle de peau beaute': '끌레드뽀 보떼',
        'la mer': '라메르', 'chanel': '샤넬', 'sulwhasoo': '설화수',
    }
    brand_q = BRAND_KR.get(brand_raw.strip().lower(), brand_raw)
    name_sizes = sorted(rr.sizes_of(p.get('name_vi'), p.get('name'), p.get('name_kr')))
    opt0 = (p.get('options') or [{}])[0]
    opt0_sizes = sorted(rr.sizes_of(opt0.get('name_vi') or '', opt0.get('name') or ''))
    target = (name_sizes or opt0_sizes or [None])[0]
    jobs.append({
        'id': m['firestoreId'], 'brand': brand_q, 'targetSize': target,
        'name_kr': name_kr.strip(),
        'tokens': rr.tokens(p.get('name_kr')), 'sizes': sorted(want),
        'lo': lo, 'hi': hi, 'oldUrl': m['url'],
    })

json.dump(jobs, open('/tmp/reresolve_jobs.json', 'w'), ensure_ascii=False, indent=1)
print('jobs', len(jobs))
for j in jobs:
    print(j['id'], j['sizes'], round(j['lo']), round(j['hi']), j['name_kr'][:50])
