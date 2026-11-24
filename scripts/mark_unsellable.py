#!/usr/bin/env python3
"""Đánh dấu SKU chưa có nguồn giá đúng để ẩn khỏi web (không archive).

--apply  : ghi isSellable=false + lý do
--revert : bỏ 2 field trên
"""
import json
import subprocess
import sys
import urllib.request

PROJECT = 'tavyorder'
BASE = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'
TARGETS = {
    'HE0000000006': 'no_price_source',
    'HE0000000052': 'price_source_mismatch',
    'HE0000000004': 'price_source_mismatch',
    'HE0000000003': 'price_source_mismatch',
    'HE0000000005': 'price_source_mismatch',
}


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
        return {'error': e.code, 'detail': e.read().decode()[:200]}


def main():
    apply = '--apply' in sys.argv
    revert = '--revert' in sys.argv
    tok = token()
    writes = []
    for pid, reason in TARGETS.items():
        name = f'projects/{PROJECT}/databases/(default)/documents/products/{pid}'
        if revert:
            writes.append({'update': {'name': name, 'fields': {}},
                           'updateMask': {'fieldPaths': ['isSellable', 'sellableReason']}})
        else:
            writes.append({'update': {'name': name, 'fields': {
                'isSellable': {'booleanValue': False},
                'sellableReason': {'stringValue': reason},
            }}, 'updateMask': {'fieldPaths': ['isSellable', 'sellableReason']}})

    if not apply:
        print('DRY RUN —', len(writes), 'docs;', 'thêm --apply')
        for p, r in TARGETS.items():
            print(' ', p, r)
        return
    print(commit(writes, tok))
    print('done', len(writes))


if __name__ == '__main__':
    main()
