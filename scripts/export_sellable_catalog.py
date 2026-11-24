#!/usr/bin/env python3
"""Xuất catalog đang bán (published, isSellable != false) ra file cho SEO/build.

Ghi:
  server/catalog-sellable.json       — allowlist id + dữ liệu tối thiểu
  public/data/all_products_catalog.json
  public/data/playwright_scraped_products.json
"""
import json
import subprocess
import urllib.request

PROJECT = 'tavyorder'
BASE = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'


def token():
    return subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                    '/Users/tan/tavy-korea/scripts/adc_token.py'], text=True).strip()


def fetch():
    q = {"structuredQuery": {
        "from": [{"collectionId": "products"}],
        "where": {"fieldFilter": {"field": {"fieldPath": "isPublished"},
                                  "op": "EQUAL", "value": {"booleanValue": True}}},
        "limit": 1000}}
    req = urllib.request.Request(BASE + ':runQuery', data=json.dumps(q).encode(),
                                 headers={'Authorization': f'Bearer {token()}',
                                          'Content-Type': 'application/json'})
    out = []
    for row in json.load(urllib.request.urlopen(req, timeout=120)):
        doc = row.get('document')
        if not doc:
            continue
        f = doc['fields']

        def val(k, default=None):
            v = f.get(k)
            if not v:
                return default
            kind = list(v)[0]
            raw = v[kind]
            if kind in ('integerValue', 'doubleValue'):
                return float(raw) if kind == 'doubleValue' else int(raw)
            if kind == 'booleanValue':
                return bool(raw)
            if kind == 'arrayValue':
                return [x for x in raw.get('values', [])]
            return raw

        if val('status') == 'archived' or val('isSellable') is False:
            continue
        item = {
            'goodsNo': doc['name'].split('/')[-1],
            'id': doc['name'].split('/')[-1],
            'name': val('name', ''),
            'nameKr': val('nameKr', ''),
            'brand': val('brand', ''),
            'category': val('category', ''),
            'category_vi': val('category_vi', ''),
            'foreignPrice': val('foreignPrice', 0),
            'originalPrice': val('originalPrice', 0),
            'productImage': val('productImage', ''),
            'images': val('images', []),
            'options': val('options', []),
            'description': val('description', ''),
            'isHighEnd': val('isHighEnd', False),
        }
        out.append(item)
    return out


def main():
    items = fetch()
    items.sort(key=lambda x: x['goodsNo'])
    ids = [i['goodsNo'] for i in items]
    json.dump({'total': len(items), 'generatedAt': __import__('time').strftime('%Y-%m-%dT%H:%M:%S%z'),
               'ids': ids}, open('server/catalog-sellable.json', 'w'), ensure_ascii=False, indent=1)
    json.dump(items, open('public/data/all_products_catalog.json', 'w'), ensure_ascii=False)
    json.dump(items, open('public/data/playwright_scraped_products.json', 'w'), ensure_ascii=False)
    print('sellable:', len(items))


if __name__ == '__main__':
    main()
