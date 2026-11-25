"""Tải ảnh gốc + 5 ảnh review Lotte cho SKU high-end, lưu local và cập nhật Firestore.

Chạy: python3 scripts/sync_highend_media.py [--apply]
"""
import io
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageFilter

REPO = Path('/Users/tan/tavy-korea')
FS = 'https://firestore.googleapis.com/v1/projects/tavyorder/databases/(default)/documents'
MEDIA = json.load(open('/tmp/highend_media.json'))
APPLY = '--apply' in sys.argv
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}
MAIN_OVERRIDE = {
    # Creed Silver Mountain Water: ảnh _2 nền trắng sạch hơn _1
    'HE0000000042': 'https://contents.lotteon.com/itemimage/20260825000157/LO/25/43/74/21/05/_2/54/37/42/10/6/LO2543742105_2543742106_2.jpg',
}


def token():
    return subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                    f'{REPO}/scripts/adc_token.py'], text=True).strip()


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def save_main(pid, url):
    data = fetch(url)
    im = Image.open(io.BytesIO(data)).convert('RGB')
    w, h = im.size
    if max(w, h) > 1200:
        im.thumbnail((1200, 1200), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=3))
    side = max(im.size)
    canvas = Image.new('RGB', (side, side), 'white')
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    dest = REPO / 'public/products' / f'{pid}.jpg'
    canvas.save(dest, 'JPEG', quality=92, optimize=True)
    return dest, canvas.size, len(data)


def dhash(im, size=8):
    g = im.convert('L').resize((size + 1, size), Image.LANCZOS)
    px = list(g.getdata())
    bits = []
    for row in range(size):
        for col in range(size):
            bits.append(px[row * (size + 1) + col] < px[row * (size + 1) + col + 1])
    return bits


def hamming(a, b):
    return sum(1 for x, y in zip(a, b) if x != y)


def save_reviews(pid, urls):
    outdir = REPO / 'public/reviews' / pid
    outdir.mkdir(parents=True, exist_ok=True)
    for old in outdir.glob('*.jpg'):
        old.unlink()
    saved, hashes = [], []
    for u in urls:
        try:
            im = Image.open(io.BytesIO(fetch(u))).convert('RGB')
        except Exception as e:
            print('  rev fail', str(e)[:60])
            continue
        h = dhash(im)
        if any(hamming(h, o) <= 6 for o in hashes):
            continue
        hashes.append(h)
        im.thumbnail((900, 900), Image.LANCZOS)
        p = outdir / f'{len(saved) + 1}.jpg'
        im.save(p, 'JPEG', quality=82, optimize=True)
        saved.append(f'/reviews/{pid}/{len(saved) + 1}.jpg')
        if len(saved) == 5:
            break
    return saved


def main():
    tok = token()
    writes, report = [], []
    for pid, m in MEDIA.items():
        if not m.get('main'):
            report.append((pid, 'no-main', 0))
            continue
        try:
            dest, size, raw = save_main(pid, MAIN_OVERRIDE.get(pid, m['main']))
        except Exception as e:
            print(pid, 'main fail', str(e)[:80])
            report.append((pid, 'main-fail', 0))
            continue
        revs = save_reviews(pid, m.get('reviews') or [])
        report.append((pid, size, len(revs)))
        print(pid, size, 'raw', raw // 1024, 'KB', 'rev', len(revs))
        writes.append({'update': {'name': f'projects/tavyorder/databases/(default)/documents/products/{pid}',
                                  'fields': {
                                      'productImage': {'stringValue': f'/products/{pid}.jpg'},
                                      'images': {'arrayValue': {'values': [{'stringValue': f'/products/{pid}.jpg'}]}},
                                      'photoReviews': {'arrayValue': {'values': [{'stringValue': x} for x in revs]}},
                                      'reviewsCount': {'integerValue': str(len(revs))},
                                  }},
                       'updateMask': {'fieldPaths': ['productImage', 'images', 'photoReviews', 'reviewsCount']}})
    less = [r for r in report if isinstance(r[1], tuple) and r[2] < 5]
    print('--- thiếu ảnh review (<5):', len(less))
    for r in less:
        print(' ', r[0], r[2])
    json.dump([{'id': r[0], 'size': r[1], 'reviews': r[2]} for r in report], open('/tmp/highend_media_report.json', 'w'), indent=1)
    if APPLY and writes:
        req = urllib.request.Request(FS + ':commit', data=json.dumps({'writes': writes}).encode(),
                                     method='POST', headers={'Authorization': 'Bearer ' + tok,
                                                             'Content-Type': 'application/json'})
        print('commit', urllib.request.urlopen(req, timeout=120).status, len(writes))
    else:
        print('dry-run, writes =', len(writes))


if __name__ == '__main__':
    main()
