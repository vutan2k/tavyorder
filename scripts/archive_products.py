#!/usr/bin/env python3
"""Archive 389 SKU ngoài catalog 150.

Mặc định dry-run: chỉ in kế hoạch + ghi file snapshot để revert.
--apply: ghi Firestore theo batch (status=archived, isPublished=false, isActive=false).
--revert <file>: khôi phục trạng thái cũ từ snapshot.
"""
import argparse
import json
import subprocess
import sys
import time
import urllib.request

PROJECT = 'tavyorder'
BASE = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'
SELECTION = '/Users/tan/tavy-korea-backups/20261124_pre_upgrade/d1/d1_selection.json'
SNAPSHOT_DIR = '/Users/tan/tavy-korea-backups/20261124_pre_upgrade'
REASON = 'catalog_150_20261125'


def token():
    return subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                    '/Users/tan/tavy-korea/scripts/adc_token.py'], text=True).strip()


def api(method, path, body=None, tok=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={'Authorization': f'Bearer {tok or token()}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        return {'error': e.code, 'detail': e.read().decode()[:300]}


def load_targets():
    d = json.load(open(SELECTION))
    keep = []
    for group in ('oyBeauty', 'highEnd', 'other'):
        keep += d['keep'][group]
    archive = d['archive']
    assert len(keep) == 150, len(keep)
    assert len(archive) == 389, len(archive)
    assert not (set(keep) & set(archive)), 'keep/archive overlap'
    return set(keep), archive


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--revert', metavar='SNAPSHOT')
    args = ap.parse_args()

    if args.revert:
        snap = json.load(open(args.revert))
        tok = token()
        writes = []
        for row in snap['docs']:
            writes.append({'update': {
                'name': f"projects/{PROJECT}/databases/(default)/documents/products/{row['id']}",
                'fields': {
                    'status': {'stringValue': row['status']},
                    'isPublished': {'booleanValue': row['isPublished']},
                    'isActive': {'booleanValue': row['isActive']},
                }}, 'updateMask': {'fieldPaths': ['status', 'isPublished', 'isActive']}})
        for i in range(0, len(writes), 200):
            r = api('POST', ':commit', {'writes': writes[i:i + 200]}, tok)
            print('revert batch', i, 'err' if 'error' in r else 'ok')
        print('reverted', len(writes), 'docs')
        return

    keep, archive = load_targets()
    tok = token()
    print(f'targets: keep={len(keep)} archive={len(archive)}')

    # Đọc trạng thái hiện tại của các SKU sẽ archive
    docs = {}
    for i in range(0, len(archive), 200):
        chunk = archive[i:i + 200]
        r = api('POST', ':batchGet', {'documents': [
            f'projects/{PROJECT}/databases/(default)/documents/products/{x}' for x in chunk]}, tok)
        entries = r if isinstance(r, list) else r.get('found')
        for item in entries or []:
            name = item.get('found', {}).get('name') or item.get('name')
            if not name:
                continue
            f = (item.get('found') or {}).get('fields', {})
            pid = name.split('/')[-1]

            def plain(k, default):
                v = f.get(k)
                if not v:
                    return default
                kk = list(v)[0]
                if kk == 'booleanValue':
                    return bool(v[kk])
                return v[kk]

            docs[pid] = {'id': pid, 'status': plain('status', 'available'),
                         'isPublished': plain('isPublished', True),
                         'isActive': plain('isActive', True)}

    missing = [x for x in archive if x not in docs]
    print('docs found:', len(docs), '| missing:', len(missing))
    if missing:
        print('MISSING sample:', missing[:5])

    counts = {}
    for d in docs.values():
        counts[d['status']] = counts.get(d['status'], 0) + 1
    print('status before:', counts)

    snap_path = f"{SNAPSHOT_DIR}/archive_snapshot_{time.strftime('%Y%m%d_%H%M%S')}.json"
    json.dump({'reason': REASON, 'createdAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
               'docs': list(docs.values())}, open(snap_path, 'w'), ensure_ascii=False, indent=1)
    print('snapshot:', snap_path)

    if not args.apply:
        print('DRY RUN — thêm --apply để ghi.')
        return

    now = time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())
    writes = []
    for d in docs.values():
        writes.append({'update': {
            'name': f"projects/{PROJECT}/databases/(default)/documents/products/{d['id']}",
            'fields': {
                'status': {'stringValue': 'archived'},
                'isPublished': {'booleanValue': False},
                'isActive': {'booleanValue': False},
                'archivedAt': {'timestampValue': now},
                'archivedReason': {'stringValue': REASON},
                'prevStatus': {'stringValue': d['status']},
            }}, 'updateMask': {'fieldPaths': [
                'status', 'isPublished', 'isActive', 'archivedAt', 'archivedReason', 'prevStatus']}})

    ok = 0
    for i in range(0, len(writes), 150):
        r = api('POST', ':commit', {'writes': writes[i:i + 150]}, tok)
        if 'error' in r:
            print('batch', i, 'FAILED', r)
            break
        ok += len(writes[i:i + 150])
        print('batch', i, 'ok')
    print('archived:', ok)


if __name__ == '__main__':
    sys.exit(main())
