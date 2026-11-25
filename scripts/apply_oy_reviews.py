"""Ghi photoReviews (ảnh khách thật từ OY) vào Firestore cho các SKU vừa thu.

Chỉ PATCH field photoReviews + reviewsCount, giữ nguyên các field khác.
Chạy: python3 scripts/apply_oy_reviews.py [--apply]
"""
import json
import subprocess
import sys
import urllib.request

REPO = '/Users/tan/tavy-korea'
REV = '/tmp/oy_reviews.json'
PROJECT = 'tavyorder'


def token():
    return subprocess.check_output(['python3', f'{REPO}/scripts/adc_token.py'],
                                   text=True, env={'PATH': '/usr/bin:/bin:/usr/local/bin', 'HOME': '/Users/tan'}).strip()


def main():
    apply = '--apply' in sys.argv
    data = {k: v for k, v in json.load(open(REV)).items() if v}
    print('SKU có ảnh review', len(data))
    if not apply:
        print('dry-run')
        return
    tok = token()
    ok = 0
    for gid, urls in data.items():
        u = (f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/products/{gid}'
             f'?updateMask.fieldPaths=photoReviews&updateMask.fieldPaths=reviewsCount')
        body = json.dumps({'fields': {
            'photoReviews': {'arrayValue': {'values': [{'stringValue': x} for x in urls[:5]]}},
            'reviewsCount': {'integerValue': str(len(urls[:5]))},
        }}).encode()
        req = urllib.request.Request(u, data=body, method='PATCH',
                                     headers={'Authorization': 'Bearer ' + tok,
                                              'Content-Type': 'application/json'})
        try:
            urllib.request.urlopen(req, timeout=60).read()
            ok += 1
        except Exception as e:
            print('FAIL', gid, str(e)[:80])
    print('updated', ok, '/', len(data))


if __name__ == '__main__':
    main()
