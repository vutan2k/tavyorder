#!/usr/bin/env python3
"""Mô phỏng đúng payload handleResolvePrice để kiểm tra đường ghi Firestore."""
import json
import subprocess
import urllib.request

TOKEN = subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                 '/Users/tan/tavy-korea/scripts/adc_token.py'], text=True).strip()
B = 'https://firestore.googleapis.com/v1/projects/tavyorder/databases/(default)/documents'
TEST = 'TEST-ADMIN-PRICE-1'


def call(method, path, body=None):
    req = urllib.request.Request(f'{B}{path}', data=json.dumps(body).encode() if body else None,
                                 method=method, headers={'Authorization': f'Bearer {TOKEN}',
                                                         'Content-Type': 'application/json'})
    try:
        return json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        return {'err': e.read().decode()[:200]}


def plain(v):
    kind = list(v.keys())[0]
    val = v[kind]
    if kind == 'integerValue':
        return int(val)
    if kind == 'booleanValue':
        return bool(val)
    return val


doc = call('GET', f'/orders/{TEST}')
f = doc['fields']
issues = []
for it in f['priceIssues']['arrayValue'].get('values', []):
    issues.append({k: plain(v) for k, v in it['mapValue']['fields'].items()})

live = {i['name']: int(i['liveWon']) for i in issues
        if i.get('reason') == 'price_changed' and i.get('liveWon')}

items = []
for it in f['items']['arrayValue']['values']:
    fl = it['mapValue']['fields']
    nm = fl.get('name', {}).get('stringValue', '')
    if nm in live:
        fl['foreignPrice'] = {'integerValue': str(live[nm])}
        print('set price:', nm, '->', live[nm])
    items.append({'mapValue': {'fields': fl}})

patch = {'fields': {
    'items': {'arrayValue': {'values': items}},
    'status': {'stringValue': 'pending'},
    'priceVerified': {'booleanValue': True},
    'priceCheck': {'stringValue': 'admin_ok'},
    'priceIssues': {'arrayValue': {'values': []}},
    'adminNote': {'stringValue': 'Admin xác nhận giá thủ công'},
}}
mask = '&'.join(f'updateMask.fieldPaths={k}' for k in patch['fields'])
print('write ok:', 'name' in call('PATCH', f'/orders/{TEST}?{mask}', patch))

v = call('GET', f'/orders/{TEST}')['fields']
print('AFTER status=', v['status']['stringValue'],
      '| verified=', v['priceVerified']['booleanValue'],
      '| check=', v['priceCheck']['stringValue'],
      '| issues=', len(v['priceIssues']['arrayValue'].get('values', [])))
print('item0 foreignPrice=', v['items']['arrayValue']['values'][0]['mapValue']['fields']['foreignPrice']['integerValue'])
