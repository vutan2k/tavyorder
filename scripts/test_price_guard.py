#!/usr/bin/env python3
"""Tạo đơn test để kiểm tra Cloud Function priceGuard, rồi xoá."""
import json
import subprocess
import time
import urllib.request

PROJECT = 'tavyorder'
BASE = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'
TOKEN = subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                 '/Users/tan/tavy-korea/scripts/adc_token.py'], text=True).strip()
DOC = 'TEST-PRICEGUARD-001'


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f'{BASE}{path}', data=data, method=method,
                                 headers={'Authorization': f'Bearer {TOKEN}',
                                          'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return {'error': e.code, 'body': e.read().decode()[:300]}


fields = {
    'id': {'stringValue': DOC},
    'status': {'stringValue': 'pending'},
    'totalVnd': {'integerValue': '500000'},
    'items': {'arrayValue': {'values': [
        {'mapValue': {'fields': {
            'goodsNo': {'stringValue': 'HE0000000017'},
            'name': {'stringValue': 'TEST Jo Malone'},
            'qty': {'integerValue': '1'},
            'foreignPrice': {'integerValue': '100000'},
        }}},
    ]}},
}
print('CREATE', call('PATCH', f'/orders/{DOC}', {'fields': fields}))
for i in range(12):
    time.sleep(5)
    d = call('GET', f'/orders/{DOC}')
    f = d.get('fields', {})
    state = {k: list(v.values())[0] for k, v in f.items() if k in ('priceCheck', 'priceVerified', 'status')}
    issues = f.get('priceIssues', {}).get('arrayValue', {}).get('values', [])
    print(i, state, len(issues), 'issues')
    if state.get('priceCheck') in ('ok', 'failed', 'unmapped_items', 'verify_unreachable', 'config_missing'):
        break
print('CLEANUP', call('DELETE', f'/orders/{DOC}'))
