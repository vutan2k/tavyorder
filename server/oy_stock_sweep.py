#!/usr/bin/env python3
"""Sweep tồn kho OY luân phiên — phát hiện SKU hết hàng, cảnh báo Telegram.

Mỗi lần chạy quét BATCH SKU (mặc định 10) theo con trỏ vòng tròn.
- soldOut lần đầu: ghi is_sold_out=true + soldOutSeenAt, báo Telegram, KHÔNG ẩn ngay.
- soldOut kéo dài >= 12h và >= 2 lần kiểm tra: archive SKU (status archived, isActive=false).
- bán lại: xoá cờ.
"""
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

REPO = '/Users/tan/tavy-korea'
API = 'http://127.0.0.1:8787'
BATCH = int(os.environ.get('OY_SWEEP_BATCH', '10'))
CURSOR = os.path.expanduser('~/.config/tavy/oy-sweep-cursor.json')
FS = 'https://firestore.googleapis.com/v1/projects/tavyorder/databases/(default)/documents'
ARCHIVE_AFTER_SEC = 12 * 3600


def token():
    return subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                    f'{REPO}/scripts/adc_token.py'], text=True).strip()


def tg(msg):
    tok = chat = ''
    for line in open(f'{REPO}/.env', encoding='utf-8', errors='ignore'):
        if line.startswith('TELEGRAM_BOT_TOKEN='):
            tok = line.split('=', 1)[1].strip()
        elif line.startswith('TELEGRAM_CHAT_ID='):
            chat = line.split('=', 1)[1].strip()
    if not (tok and chat):
        return
    data = urllib.parse.urlencode({'chat_id': chat, 'parse_mode': 'HTML', 'text': msg}).encode()
    try:
        urllib.request.urlopen(f'https://api.telegram.org/bot{tok}/sendMessage', data=data, timeout=15)
    except Exception:
        pass


def get_doc(pid, tok):
    req = urllib.request.Request(f'{FS}/products/{pid}', headers={'Authorization': 'Bearer ' + tok})
    try:
        f = json.load(urllib.request.urlopen(req, timeout=30))['fields']
    except Exception:
        return {}
    out = {}
    for k, v in f.items():
        out[k] = list(v.values())[0]
    return out


def commit(writes, tok):
    if not writes:
        return
    req = urllib.request.Request(FS + ':commit', data=json.dumps({'writes': writes}).encode(),
                                 method='POST', headers={'Authorization': 'Bearer ' + tok,
                                                         'Content-Type': 'application/json'})
    urllib.request.urlopen(req, timeout=60)


def main():
    sellable = set(json.load(open(f'{REPO}/server/catalog-sellable.json'))['ids'])
    manifest = [x for x in json.load(open(f'{REPO}/server/catalog-150.json'))
                if x.get('source') == 'oy' and x['firestoreId'] in sellable]
    if not manifest:
        print('no oy items')
        return

    cur = {'i': 0}
    try:
        cur = json.load(open(CURSOR))
    except Exception:
        pass
    start = int(cur.get('i', 0)) % len(manifest)
    batch = [manifest[(start + k) % len(manifest)] for k in range(min(BATCH, len(manifest)))]
    json.dump({'i': (start + BATCH) % len(manifest)}, open(CURSOR, 'w'))

    payload = {'items': [{'goodsNo': x['goodsNo']} for x in batch]}
    req = urllib.request.Request(API + '/verify', data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    try:
        res = json.load(urllib.request.urlopen(req, timeout=300))
    except Exception as e:
        print('verify failed', e)
        return

    tok = token()
    writes = []
    sold_now, recovered, archived = [], [], []
    results = res.get('results', [])
    for item, r in zip(batch, results):
        pid = item['firestoreId']
        if not r.get('ok'):
            continue
        doc = get_doc(pid, tok)
        name = (doc.get('name_vi') or item.get('name') or pid)[:60]
        was = bool(doc.get('is_sold_out'))
        if r.get('soldOut'):
            seen = doc.get('soldOutSeenAt') or ''
            cnt = int(doc.get('soldOutCount') or 0) + 1
            old_enough = False
            if seen:
                try:
                    old_enough = (time.time() - float(doc.get('soldOutTs') or 0)) >= ARCHIVE_AFTER_SEC
                except Exception:
                    old_enough = False
            fields = {
                'is_sold_out': {'booleanValue': True},
                'isSoldOut': {'booleanValue': True},
                'soldOutSeenAt': {'stringValue': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())},
                'soldOutTs': {'doubleValue': time.time() if not seen else float(doc.get('soldOutTs') or time.time())},
                'soldOutCount': {'integerValue': str(cnt)},
            }
            mask = list(fields)
            if old_enough and cnt >= 2:
                fields.update({
                    'status': {'stringValue': 'archived'},
                    'isActive': {'booleanValue': False},
                    'isPublished': {'booleanValue': False},
                    'isSellable': {'booleanValue': False},
                    'archivedReason': {'stringValue': 'sold_out_oy'},
                })
                mask += ['status', 'isActive', 'isPublished', 'isSellable', 'archivedReason']
                archived.append(name)
            elif not was:
                sold_now.append(name)
            writes.append({'update': {'name': f'projects/tavyorder/databases/(default)/documents/products/{pid}',
                                      'fields': fields}, 'updateMask': {'fieldPaths': mask}})
        elif was:
            writes.append({'update': {
                'name': f'projects/tavyorder/databases/(default)/documents/products/{pid}',
                'fields': {'is_sold_out': {'booleanValue': False}, 'isSoldOut': {'booleanValue': False},
                           'soldOutCount': {'integerValue': '0'}}},
                'updateMask': {'fieldPaths': ['is_sold_out', 'isSoldOut', 'soldOutCount']}})
            recovered.append(name)

    commit(writes, tok)
    ts = time.strftime('%Y-%m-%d %H:%M:%S')
    print(f'{ts} batch={len(batch)} sold={len(sold_now)} recovered={len(recovered)} archived={len(archived)}')
    if sold_now or archived or recovered:
        lines = []
        if sold_now:
            lines.append('⚠️ <b>Hết hàng trên OY</b>\n' + '\n'.join('• ' + n for n in sold_now[:8]))
        if archived:
            lines.append('📦 <b>Đã ẩn SKU hết hàng >12h</b>\n' + '\n'.join('• ' + n for n in archived[:8]))
        if recovered:
            lines.append('✅ <b>Bán lại</b>\n' + '\n'.join('• ' + n for n in recovered[:8]))
        tg('\n\n'.join(lines) + f'\n<i>{ts}</i>')


if __name__ == '__main__':
    main()
