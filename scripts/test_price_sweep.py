#!/usr/bin/env python3
"""Test end-to-end: tạo đơn sai giá → gọi priceSweep → kiểm tra bị giữ."""
import json
import os
import subprocess
import time
import urllib.request

TOKEN = subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                 '/Users/tan/tavy-korea/scripts/adc_token.py'], text=True).strip()
BASE = 'https://firestore.googleapis.com/v1/projects/tavyorder/databases/(default)/documents'
DOC = 'TEST-PRICEGUARD-003'
SWEEP_URL = open(os.path.expanduser('~/.config/tavy/sweep.url')).read().strip()
SWEEP_KEY = open(os.path.expanduser('~/.config/tavy/sweep.key')).read().strip()


def call(method, path, body=None, url=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    h = headers or {'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'}
    req = urllib.request.Request(url or f'{BASE}{path}', data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read() or b'{}')
    except Exception as e:
        return {'error': str(e)[:200]}


fields = {'id': {'stringValue': DOC}, 'status': {'stringValue': 'pending'},
          'createdAt': {'stringValue': time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())},
          'items': {'arrayValue': {'values': [{'mapValue': {'fields': {
              'goodsNo': {'stringValue': 'HE0000000017'},
              'name': {'stringValue': 'TEST3'},
              'foreignPrice': {'integerValue': '100000'}}}}]}}}
print('CREATE', call('PATCH', f'/orders/{DOC}', {'fields': fields}).get('name', 'ERR')[-40:])
print('SWEEP', call('POST', '', {}, url=SWEEP_URL,
                    headers={'x-sweep-key': SWEEP_KEY, 'content-type': 'application/json'}))
d = call('GET', f'/orders/{DOC}')
f = d.get('fields', {})
def val(k):
    v = f.get(k)
    if not v: return None
    return list(v.values())[0]
print('RESULT priceCheck=', val('priceCheck'), '| priceVerified=', val('priceVerified'), '| status=', val('status'))
issues = f.get('priceIssues', {}).get('arrayValue', {}).get('values', [])
for it in issues:
    print('  issue', json.dumps(it)[:200])
print('CLEANUP', call('DELETE', f'/orders/{DOC}'))
