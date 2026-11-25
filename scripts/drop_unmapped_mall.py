#!/usr/bin/env python3
"""Archive 4 SKU mall không map được nguồn giá (user chốt bỏ).
Ghi status=archived, isPublished=false, isActive=false, isSellable=false.
--apply để ghi thật.
"""
import json
import subprocess
import sys
import urllib.request
import urllib.error

PROJECT = 'tavyorder'
BASE = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'
TARGETS = ['HE0000000052', 'HE0000000004', 'HE0000000003', 'HE0000000005']
REASON = 'mall_source_unmapped'


def token():
    return subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                    '/Users/tan/tavy-korea/scripts/adc_token.py'], text=True).strip()


def commit(writes, tok):
    req = urllib.request.Request(BASE + ':commit', data=json.dumps({'writes': writes}).encode(),
                                 method='POST', headers={'Authorization': f'Bearer {tok}',
                                                         'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return {'error': e.code, 'detail': e.read().decode()[:300]}


def main():
    apply = '--apply' in sys.argv
    tok = token()
    writes = []
    for pid in TARGETS:
        name = f'projects/{PROJECT}/databases/(default)/documents/products/{pid}'
        writes.append({'update': {'name': name, 'fields': {
            'status': {'stringValue': 'archived'},
            'isPublished': {'booleanValue': False},
            'isActive': {'booleanValue': False},
            'isSellable': {'booleanValue': False},
            'archivedReason': {'stringValue': REASON},
        }}, 'updateMask': {'fieldPaths': ['status', 'isPublished', 'isActive', 'isSellable', 'archivedReason']}})

    if not apply:
        print('DRY RUN', len(writes), TARGETS)
        return
    print(commit(writes, tok))
    print('archived', len(writes))


if __name__ == '__main__':
    main()
