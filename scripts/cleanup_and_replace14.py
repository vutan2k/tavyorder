"""Dọn 14 SKU không phải mỹ phẩm khỏi web + nạp 14 SKU thay thế.

- Archive (mềm) 14 SKU: thực phẩm/bổ sung, men vi sinh, dầu gội trị rụng tóc,
  mi giả/cọ trang điểm, mặt nạ bán lẻ 1 miếng.
- Nạp 14 SKU mỹ phẩm thật từ pool OY: cào chi tiết, ảnh, dịch VI, ghi Firestore.
- Cập nhật manifest + sellable + all_products_catalog.

Chạy thử: python3 scripts/cleanup_and_replace14.py
Ghi thật: python3 scripts/cleanup_and_replace14.py --apply
"""
import json
import os
import re
import sys
import time
import urllib.request

sys.path.insert(0, '/Users/tan/tavy-korea/scripts')
import ingest_catalog80 as ing

REPO = '/Users/tan/tavy-korea'
REMOVE = ['A000000190168', 'A000000202771', 'A000000208162', 'A000000265728', 'A000000268499',
          'A000000217101', 'A000000244929', 'A000000116991', 'A000000149501', 'A000000201277',
          'A000000213569', 'A000000219331', 'A000000225250', 'A000000217620']
REPLACE = ['A000000255859', 'A000000205979', 'A000000221807', 'A000000189875', 'A000000171650',
           'A000000206826', 'A000000245091', 'A000000232081', 'A000000248498', 'A000000148549',
           'A000000138140', 'A000000230510', 'A000000171113', 'A000000243535']


def fs_get(tok, gid):
    u = f'https://firestore.googleapis.com/v1/projects/tavyorder/databases/(default)/documents/products/{gid}'
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'Authorization': 'Bearer ' + tok})))


def main():
    apply = '--apply' in sys.argv
    pool = {r['goodsNo']: r for r in json.load(open('/tmp/catalog_cats_v3.json'))}
    targets = [pool[g] for g in REPLACE]
    print('archive', len(REMOVE), 'replace', len(targets))

    cache = {}
    for i, p in enumerate(targets, 1):
        d = ing.parse_detail(p['goodsNo'])
        cache[p['goodsNo']] = d
        print(f'[{i}/{len(targets)}] {p["goodsNo"]} opts={len(d["options"])}')
        time.sleep(9)

    trans = {}
    for i in range(0, len(targets), 8):
        got = ing.translate(targets[i:i + 8])
        trans.update(got)
    print('trans', len(trans))

    if not apply:
        print('dry-run ok')
        return

    tok = ing.token()
    rate, fee = ing.get_rates(tok)
    manifest = json.load(open(ing.MANIFEST))
    allcat = json.load(open(ing.ALLCAT))
    byid = {m.get('goodsNo'): m for m in manifest}
    now = time.strftime('%Y-%m-%dT%H:%M:%S.000Z')

    # 1. archive
    for gid in REMOVE:
        try:
            doc = fs_get(tok, gid)
            fields = doc['fields']
            fields['status'] = {'stringValue': 'archived'}
            fields['isPublished'] = {'booleanValue': False}
            fields['isAvailable'] = {'booleanValue': False}
            fields['archivedAt'] = {'stringValue': now}
            fields['archivedReason'] = {'stringValue': 'not_cosmetics_cleanup_20261126'}
            u = f'https://firestore.googleapis.com/v1/projects/tavyorder/databases/(default)/documents/products/{gid}'
            urllib.request.urlopen(urllib.request.Request(
                u, data=json.dumps({'fields': fields}).encode(), method='PATCH',
                headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'}), timeout=60).read()
            manifest = [m for m in manifest if m.get('goodsNo') != gid]
            allcat = [x for x in allcat if x.get('goodsNo') != gid]
            print('archived', gid)
        except Exception as e:
            print('archive FAIL', gid, str(e)[:80])

    # 2. add replacements
    for p in targets:
        gid = p['goodsNo']
        d = cache[gid]
        ok = ing.download(d['image'], gid)
        tr = trans.get(gid) or {}
        name_vi = tr.get('name_vi') or p['name']
        cat = tr.get('category') if tr.get('category') in ing.CAT_VI else p['category']
        sub = tr.get('subCategory') or ''
        opts = []
        for idx, o in enumerate(d['options']):
            krw = o['finalPrice'] or o['salePrice']
            opts.append({'id': str(idx + 1), 'name': o['optionName'] or p['name'],
                         'name_vi': o['optionName'] or p['name'], 'name_kr': o['optionName'],
                         'price_krw': krw, 'price_vnd': ing.calc_vnd(krw, rate, fee),
                         'isSoldOut': o['soldOut'], 'is_sold_out': o['soldOut'],
                         'imageUrl': f'/products/{gid}.jpg'})
        live = [o['price_krw'] for o in opts if not o['isSoldOut']] or [o['price_krw'] for o in opts]
        min_won = min(live)
        orig = max(o['salePrice'] for o in d['options']) or min_won
        doc = {
            'id': gid, 'goodsNo': gid, 'firestoreId': gid, 'name': name_vi, 'name_vi': name_vi,
            'name_kr': p['name'], 'nameKr': p['name'], 'title': name_vi,
            'brand': p['brand'], 'brand_vi': p['brand'], 'brand_kr': p['brand'], 'brandKr': p['brand'],
            'category': cat, 'category_vi': ing.CAT_VI.get(cat, ''), 'subCategory': sub,
            'categoryPath': p['category'], 'rank': 0,
            'foreignPrice': min_won, 'price': min_won, 'originPrice': orig, 'originalPrice': orig,
            'originalPriceWon': orig, 'salePrice': min_won,
            'priceVnd': ing.calc_vnd(min_won, rate, fee),
            'originalPriceVnd': ing.calc_vnd(orig, rate, fee),
            'appliedKrwRate': rate, 'appliedServiceFeePercent': fee,
            'discountRate': f"{round((1 - min_won / orig) * 100)}%" if orig > min_won else '0%',
            'productImage': f'/products/{gid}.jpg', 'thumbnailUrl': f'/products/{gid}.jpg',
            'images': [f'/products/{gid}.jpg'], 'photoReviews': [],
            'options': opts, 'optionsCount': len(opts), 'hasOptions': True,
            'description': f'{name_vi} - {p["brand"]} chính hãng, order tại Olive Young Hàn Quốc.',
            'usage': 'Sử dụng hàng ngày theo nhu cầu chăm sóc da.',
            'status': 'available', 'isAvailable': True, 'isSoldOut': False, 'is_sold_out': False,
            'isDiscontinued': False, 'isPublished': True, 'isHighEnd': False, 'isChallenge': False,
            'origin': 'KR', 'storageProvider': 'local', 'productUrl': ing.DETAIL + gid,
            'createdAt': now, 'updatedAt': now, 'lastAuditedAt': now,
        }
        ing.patch_doc(tok, gid, doc)
        manifest.append({'firestoreId': gid, 'source': 'oy', 'goodsNo': gid,
                         'brand': p['brand'], 'name': name_vi})
        allcat.append(doc)
        print('added', gid, 'img ok' if ok else 'IMG FAIL', name_vi[:50])

    json.dump(manifest, open(ing.MANIFEST, 'w'), ensure_ascii=False, indent=2)
    ids = [m['goodsNo'] for m in manifest if m.get('source') == 'oy']
    json.dump({'ids': ids}, open(ing.SELLABLE, 'w'), ensure_ascii=False, indent=1)
    json.dump(allcat, open(ing.ALLCAT, 'w'), ensure_ascii=False, indent=2)
    print('DONE manifest', len(manifest), 'sellable', len(ids))


if __name__ == '__main__':
    main()
