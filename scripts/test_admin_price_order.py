#!/usr/bin/env python3
"""Tạo / xoá đơn test cho màn admin xác nhận giá."""
import json
import sys
import time
import subprocess
import urllib.request

TOKEN = subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                 '/Users/tan/tavy-korea/scripts/adc_token.py'], text=True).strip()
BASE = 'https://firestore.googleapis.com/v1/projects/tavyorder/databases/(default)/documents'
TEST_ID = 'TEST-ADMIN-PRICE-1'
SRC = 'ORD-1795107603775-4979'


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f'{BASE}{path}', data=data, method=method,
                                 headers={'Authorization': f'Bearer {TOKEN}',
                                          'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return {'error': e.read().decode()[:300]}


if sys.argv[1:] == ['cleanup']:
    print(call('DELETE', f'/orders/{TEST_ID}'))
    raise SystemExit

src = call('GET', f'/orders/{SRC}')
f = src['fields']
items = f['items']['arrayValue']['values']
first = items[0]['mapValue']['fields']
first['foreignPrice'] = {'integerValue': '45000'}
first['name'] = {'stringValue': 'La Mer Crème de la Mer 30ml (TEST)'}

f['id'] = {'stringValue': TEST_ID}
f['status'] = {'stringValue': 'pending_price_check'}
f['customerName'] = {'stringValue': 'TEST Admin Duyệt Giá'}
f['customerPhone'] = {'stringValue': '010-0000-0000'}
f['createdAt'] = {'stringValue': time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())}
f['priceVerified'] = {'booleanValue': False}
f['priceCheck'] = {'stringValue': 'failed'}
f['priceIssues'] = {'arrayValue': {'values': [
    {'mapValue': {'fields': {
        'name': {'stringValue': 'La Mer Crème de la Mer 30ml (TEST)'},
        'reason': {'stringValue': 'price_changed'},
        'cartWon': {'integerValue': '45000'},
        'liveWon': {'integerValue': '52000'}}}},
    {'mapValue': {'fields': {
        'name': {'stringValue': 'Sulwhasoo First Care Serum (TEST)'},
        'reason': {'stringValue': 'sold_out'}}}},
]}}

r = call('PATCH', f'/orders/{TEST_ID}', {'fields': f})
print('created:', r.get('name', r)[-45:] if isinstance(r, dict) else r)
