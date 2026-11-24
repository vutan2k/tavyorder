#!/usr/bin/env python3
"""Tạo lại đơn test và đọc log chi tiết của priceGuard."""
import json
import subprocess
import time
import urllib.request

TOKEN = subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                 '/Users/tan/tavy-korea/scripts/adc_token.py'], text=True).strip()
BASE = 'https://firestore.googleapis.com/v1/projects/tavyorder/databases/(default)/documents'
DOC = 'TEST-PRICEGUARD-002'


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f'{BASE}{path}', data=data, method=method,
                                 headers={'Authorization': f'Bearer {TOKEN}',
                                          'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b'{}')
    except Exception as e:
        return {'error': str(e)[:200]}


fields = {'id': {'stringValue': DOC}, 'status': {'stringValue': 'pending'},
          'items': {'arrayValue': {'values': [{'mapValue': {'fields': {
              'goodsNo': {'stringValue': 'HE0000000017'},
              'name': {'stringValue': 'TEST2'},
              'foreignPrice': {'integerValue': '100000'}}}}]}}}
print('CREATE', call('PATCH', f'/orders/{DOC}', {'fields': fields}).get('name', 'ERR'))
time.sleep(25)
d = call('GET', f'/orders/{DOC}')
print('DOC FIELDS', list(d.get('fields', {}).keys()))
print('CLEANUP', call('DELETE', f'/orders/{DOC}'))
