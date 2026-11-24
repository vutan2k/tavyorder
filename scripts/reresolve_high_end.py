#!/usr/bin/env python3
"""Re-resolve URL Lotte ON cho các SKU high-end bị lệch giá nguồn.

Dùng search HTML server-side của Lotte ON, chấm điểm theo token tên + brand + dung tích,
và bắt buộc giá nằm trong dải giá catalog (0.7–1.25x) để tránh khớp sai size/set.

  python3 scripts/reresolve_high_end.py            # dry-run, in ứng viên
  python3 scripts/reresolve_high_end.py --apply    # ghi vào server/catalog-150.json
"""
import gzip
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP = os.path.expanduser('~/tavy-korea-backups/20261124_pre_upgrade/d1')
MANIFEST = os.path.join(REPO, 'server/catalog-150.json')
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
SIZE_RE = re.compile(r'(\d+)\s*(ml|g)\b', re.I)


def http_get(url, timeout=25):
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Accept': 'text/html,application/xhtml+xml',
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        if r.headers.get('Content-Encoding') == 'gzip':
            raw = gzip.decompress(raw)
        return r.status, raw.decode('utf-8', 'ignore')


def parse_products(html):
    out = []
    for m in re.finditer(r'"productId":\s*\n?\s*"(LE\d+|LO\d+)"(.*?)"productLink":\s*\n?\s*"([^"]+)"', html, re.S):
        pid, mid, link = m.group(1), m.group(2), m.group(3)
        nm = re.search(r'"productName":\s*\n?\s*"([^"]*)"', mid) or re.search(r'"spdNm":\s*\n?\s*"([^"]*)"', mid)
        pr = re.search(r'"discountPrice":\s*\n?\s*(\d+)', mid) or re.search(r'"price":\s*\n?\s*(\d+)', mid)
        brand = re.search(r'"brandName":\s*\n?\s*"([^"]*)"', mid)
        out.append({
            'pid': pid,
            'name': re.sub(r'\\n|\\"', ' ', nm.group(1)).strip() if nm else '',
            'price': int(pr.group(1)) if pr else 0,
            'brand': re.sub(r'\\n|\\"', ' ', brand.group(1)).strip() if brand else '',
            'link': link.replace('\\/', '/'),
        })
    seen, uniq = set(), []
    for p in out:
        if p['pid'] in seen:
            continue
        seen.add(p['pid'])
        uniq.append(p)
    return uniq


def tokens(s):
    s = re.sub(r'\[[^\]]*\]|\([^)]*\)', ' ', s or '')
    s = SIZE_RE.sub(' ', s)
    return [t for t in re.split(r'[\s/+,&|]+', s) if len(t) >= 2]


def sizes_of(*texts):
    found = set()
    for t in texts:
        for m in SIZE_RE.finditer(t or ''):
            found.add(f'{int(m.group(1))}{m.group(2).lower()}')
    return found


def price_refs(product):
    vals = []
    for k in ('price_krw', 'price', 'foreignPrice', 'priceKrw', 'priceWon'):
        v = product.get(k)
        if isinstance(v, (int, float)) and v > 0:
            vals.append(float(v))
    for o in (product.get('options') or []):
        for k in ('price_krw', 'price', 'sale_price'):
            v = o.get(k)
            if isinstance(v, (int, float)) and v > 0:
                vals.append(float(v))
    return vals


def score(item, cand, refs, want_sizes):
    name = (cand['name'] + ' ' + cand['brand'])
    tk = tokens(item.get('name_kr'))
    hits = sum(1 for t in tk if t in name)
    brand = str(item.get('brand') or '').lower()[:5]
    bhit = 1 if brand and brand in name.lower() else 0
    cand_sizes = sizes_of(cand['name'])
    sizehit = 0
    if want_sizes:
        if want_sizes & cand_sizes:
            sizehit = 1
        elif cand_sizes:
            sizehit = -2  # khác dung tích → phạt nặng
    s = hits * 2 + bhit * 2 + sizehit * 4
    inband = False
    if refs and cand['price']:
        lo, hi = min(refs), max(refs)
        if lo * 0.7 <= cand['price'] <= hi * 1.25:
            inband = True
            s += 3
        else:
            s -= 4
    return s, inband, sizehit


def main():
    apply = '--apply' in sys.argv
    prods = {p['firestoreId']: p for p in json.load(open(f'{BACKUP}/firestore_products_before.json'))}
    manifest = json.load(open(MANIFEST))

    # xác định SKU lệch: so giá đã resolve lúc D2b với dải giá catalog
    flagged = []
    for m in manifest:
        if m['source'] != 'mall':
            continue
        p = prods.get(m['firestoreId'])
        if not p:
            continue
        refs = price_refs(p)
        resolved = m.get('mallPriceKrwAtResolve')
        if not refs or not resolved:
            continue
        lo, hi = min(refs), max(refs)
        if resolved > hi * 1.25 or resolved < lo * 0.7:
            flagged.append((m, p, refs))

    print(f'FLAGGED {len(flagged)} SKU')
    fixes = []
    for m, p, refs in flagged:
        want = sizes_of(p.get('name_vi'), p.get('name'), p.get('name_kr'),
                        *(o.get('name_vi') or o.get('name') or '' for o in (p.get('options') or [])))
        q = ' '.join(filter(None, [
            str(p.get('brand') or ''),
            re.sub(r'\[[^\]]*\]|\([^)]*\)', ' ', p.get('name_kr') or ''),
        ]))
        q = re.sub(r'\s+', ' ', q).strip()
        url = f'https://www.lotteon.com/search/search/search.ecn?render=search&q={urllib.parse.quote(q)}'
        print(f"\n[{m['firestoreId']}] {p.get('brand')} | {q[:60]} | sizes={sorted(want)}")
        try:
            code, html = http_get(url)
            cands = parse_products(html)
        except Exception as e:
            print('   ERR', e)
            continue
        ranked = []
        for c in cands:
            if not c['link']:
                continue
            s, inband, sizehit = score(p, c, refs, want)
            ranked.append((s, inband, sizehit, c))
        ranked.sort(key=lambda x: -x[0])
        print(f'   http {code}, {len(cands)} cards')
        for s, inband, sizehit, c in ranked[:3]:
            print(f"   s={s:>3} band={int(inband)} size={sizehit} {c['price']:>9,}원 | {c['name'][:60]} | {c['link'][:80]}")
        best = ranked[0] if ranked else None
        if not best or best[0] < 6 or not best[1] or best[2] <= 0:
            print('   -> KHÔNG đủ tin cậy, giữ nguyên')
            continue
        s, inband, sizehit, c = best
        link = c['link'].replace('&dp_infw', '')
        fixes.append((m['firestoreId'], link, c['price'], c['name']))
        print(f"   -> FIX {link} | {c['price']:,}원")
        time.sleep(1)

    print(f'\nFIXED {len(fixes)}/{len(flagged)}')
    if apply and fixes:
        byid = {f[0]: f for f in fixes}
        for m in manifest:
            f = byid.get(m['firestoreId'])
            if f:
                m['url'] = f[1]
                m['mallPriceKrwAtResolve'] = f[2]
                m['mallProductName'] = f[3]
                m['reresolvedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        json.dump(manifest, open(MANIFEST, 'w'), ensure_ascii=False, indent=1)
        json.dump([{'firestoreId': f[0], 'url': f[1], 'priceKrw': f[2], 'mallProductName': f[3]} for f in fixes],
                  open(f'{BACKUP}/d2b_reresolved.json', 'w'), ensure_ascii=False, indent=1)
        print('APPLIED →', MANIFEST)


if __name__ == '__main__':
    main()
