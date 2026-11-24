import json
import os
import time

REPO = '/Users/tan/tavy-korea'
MANIFEST = os.path.join(REPO, 'server/catalog-150.json')
out = json.load(open('/tmp/reresolve_out.json'))
fixes = {r['id']: r['best'] for r in out if r.get('best')}

man = json.load(open(MANIFEST))
applied = 0
for m in man:
    f = fixes.get(m['firestoreId'])
    if not f:
        continue
    url = f['url'].split('&dp_infw')[0]
    m['url'] = url
    m['mallPriceKrwAtResolve'] = f['price']
    m['mallProductName'] = f['text'][:120]
    m['reresolvedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    applied += 1

json.dump(man, open(MANIFEST, 'w'), ensure_ascii=False, indent=1)
json.dump(fixes, open(os.path.expanduser('~/tavy-korea-backups/20261124_pre_upgrade/d1/d2b_reresolved.json'), 'w'),
          ensure_ascii=False, indent=1)
print('APPLIED', applied)
for k, v in fixes.items():
    print(k, v['price'], v['url'][:70])
