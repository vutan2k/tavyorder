#!/usr/bin/env python3
"""Test server priceGuard sau khi sửa: không chặn oan giá phân loại, không tua trạng thái."""
import json
import os
import subprocess
import time
import urllib.request

TOKEN = subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                 '/Users/tan/tavy-korea/scripts/adc_token.py'], text=True).strip()
BASE = 'https://firestore.googleapis.com/v1/projects/tavyorder/databases/(default)/documents'
SWEEP = open(os.path.expanduser('~/.config/tavy/sweep.url')).read().strip()
KEY = open(os.path.expanduser('~/.config/tavy/sweep.key')).read().strip()


def call(method, path, body=None, url=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    h = headers or {'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'}
    req = urllib.request.Request(url or f'{BASE}{path}', data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return {'error': e.read().decode()[:200]}


def make(order_id, status, cart_won, opt_prices):
    fields = {
        'id': {'stringValue': order_id},
        'status': {'stringValue': status},
        'createdAt': {'stringValue': time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())},
        'items': {'arrayValue': {'values': [{'mapValue': {'fields': {
            'goodsNo': {'stringValue': 'A000000149501'},
            'name': {'stringValue': 'Monchichi Shampoo (test)'},
            'foreignPrice': {'integerValue': str(cart_won)},
            'productWon': {'integerValue': '37000'},
            'optionPrices': {'arrayValue': {'values': [{'integerValue': str(p)} for p in opt_prices]}},
        }}}]}},
    }
    return call('PATCH', f'/orders/{order_id}', {'fields': fields})


make('TEST-OPTION-1', 'pending', 26900, [26900, 36000, 36000])
make('TEST-ADVANCED-1', 'deposit_paid', 1000, [1000])
print('SWEEP', call('POST', '', {}, url=SWEEP, headers={'x-sweep-key': KEY,
                                                       'content-type': 'application/json'}).get('results'))

for oid in ('TEST-OPTION-1', 'TEST-ADVANCED-1'):
    f = call('GET', f'/orders/{oid}').get('fields', {})
    def v(k):
        x = f.get(k)
        return list(x.values())[0] if x else None
    print(oid, '| status=', v('status'), '| verified=', v('priceVerified'), '| check=', v('priceCheck'))
    print('  issues=', json.dumps(f.get('priceIssues', {}), ensure_ascii=False)[:200])
    print('  cleanup=', bool(call('DELETE', f'/orders/{oid}')))
