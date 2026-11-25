#!/usr/bin/env python3
"""Thay 2 SKU ngừng bán bằng 2 SKU viral top ranking OY (đang archive sẵn).

- Archive: A000000263036 (Abib TECA serum), A000000267477 (Zeroid Pimprove)
- Unarchive: A000001002386 (AESTURA Atobarrier365 set đôi), A000000223414 (Mediheal mask 10+1)
Dùng --apply để ghi. Không có --apply = dry run.
"""
import json
import subprocess
import sys
import urllib.request
import urllib.error

PROJECT = 'tavyorder'
DOCS = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'
KRW_RATE = 19.5
FEE = 1.2

ARCHIVE = {
    'A000000263036': 'discontinued_on_oy',
    'A000000267477': 'discontinued_on_oy',
}
RESTORE = {
    'A000001002386': 43400,
    'A000000223414': 10000,
}


def token():
    return subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                    '/Users/tan/tavy-korea/scripts/adc_token.py'], text=True).strip()


def get_doc(pid, tok):
    req = urllib.request.Request(f'{DOCS}/products/{pid}', headers={'Authorization': 'Bearer ' + tok})
    return json.load(urllib.request.urlopen(req, timeout=40))


def commit(writes, tok):
    req = urllib.request.Request(DOCS + ':commit', data=json.dumps({'writes': writes}).encode(),
                                 method='POST', headers={'Authorization': 'Bearer ' + tok,
                                                         'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return {'error': e.code, 'detail': e.read().decode()[:400]}


def vnd(krw):
    return int(krw * KRW_RATE * FEE // 1000 * 1000)


def main():
    apply = '--apply' in sys.argv
    tok = token()
    writes = []

    for pid, reason in ARCHIVE.items():
        name = f'projects/{PROJECT}/databases/(default)/documents/products/{pid}'
        writes.append({'update': {'name': name, 'fields': {
            'status': {'stringValue': 'archived'},
            'isPublished': {'booleanValue': False},
            'isActive': {'booleanValue': False},
            'isSellable': {'booleanValue': False},
            'archivedReason': {'stringValue': reason},
        }}, 'updateMask': {'fieldPaths': ['status', 'isPublished', 'isActive', 'isSellable', 'archivedReason']}})

    for pid, krw in RESTORE.items():
        doc = get_doc(pid, tok)
        f = doc['fields']
        name = f'projects/{PROJECT}/databases/(default)/documents/products/{pid}'
        opts = f.get('options', {}).get('arrayValue', {}).get('values', [])
        pv = vnd(krw)
        new_opts = []
        for o in opts:
            of = o.get('mapValue', {}).get('fields', {})
            of['price_krw'] = {'stringValue': str(krw)}
            of['price_vnd'] = {'stringValue': str(pv)}
            of['isSoldOut'] = {'booleanValue': False}
            of['is_sold_out'] = {'booleanValue': False}
            new_opts.append({'mapValue': {'fields': of}})
        fields = {
            'status': {'stringValue': 'published'},
            'isPublished': {'booleanValue': True},
            'isActive': {'booleanValue': True},
            'isSellable': {'booleanValue': True},
            'isDiscontinued': {'booleanValue': False},
            'is_sold_out': {'booleanValue': False},
            'foreignPrice': {'stringValue': str(krw)},
            'salePrice': {'stringValue': str(krw)},
            'originPrice': {'stringValue': str(krw)},
            'priceVnd': {'stringValue': str(pv)},
            'discountRate': {'stringValue': '0%'},
        }
        mask = ['status', 'isPublished', 'isActive', 'isSellable', 'isDiscontinued',
                'is_sold_out', 'foreignPrice', 'salePrice', 'originPrice', 'priceVnd', 'discountRate']
        if new_opts:
            fields['options'] = {'arrayValue': {'values': new_opts}}
            mask.append('options')
        writes.append({'update': {'name': name, 'fields': fields}, 'updateMask': {'fieldPaths': mask}})
        print(pid, f.get('name_vi', {}).get('stringValue', '')[:50], krw, '->', pv)

    print('writes', len(writes))
    if not apply:
        print('DRY RUN — thêm --apply')
        return
    print(commit(writes, tok))


if __name__ == '__main__':
    main()
