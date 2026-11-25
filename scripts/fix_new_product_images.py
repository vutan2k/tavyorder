"""Lấy gallery chính thức từ trang OY cho 2 SKU mới và ghi lại images/photoReviews."""
import json
import re
import subprocess
import urllib.request

from curl_cffi import requests

REPO = '/Users/tan/tavy-korea'
FS = 'https://firestore.googleapis.com/v1/projects/tavyorder/databases/(default)/documents'
SKUS = ['A000000223414', 'A000001002386']


def token():
    return subprocess.check_output(['env', '-u', 'PYTHONPATH', 'python3',
                                    f'{REPO}/scripts/adc_token.py'], text=True).strip()


def fetch_images(goods):
    url = f'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={goods}'
    h = requests.get(url, impersonate='chrome124', timeout=25).text
    imgs = []
    og = re.search(r'<meta property="og:image" content="([^"]+)"', h)
    if og:
        imgs.append(og.group(1).split('?')[0])
    for m in re.findall(r'https://image\.oliveyoung\.co\.kr/cfimages/cf-goods/uploads/images/thumbnails/[^"\'\s]+', h):
        c = m.split('?')[0]
        if c not in imgs:
            imgs.append(c)
    # chỉ giữ ảnh thuộc đúng goods
    imgs = [i for i in imgs if goods in i] or imgs[:1]
    return imgs[:6]


def main():
    tok = token()
    writes = []
    for goods in SKUS:
        imgs = fetch_images(goods)
        print(goods, len(imgs), imgs[:2])
        if not imgs:
            continue
        name = f'projects/tavyorder/databases/(default)/documents/products/{goods}'
        writes.append({'update': {'name': name, 'fields': {
            'images': {'arrayValue': {'values': [{'stringValue': i} for i in imgs]}},
            'photoReviews': {'arrayValue': {'values': [{'stringValue': i} for i in imgs]}},
        }}, 'updateMask': {'fieldPaths': ['images', 'photoReviews']}})
    if writes:
        req = urllib.request.Request(FS + ':commit', data=json.dumps({'writes': writes}).encode(),
                                     method='POST', headers={'Authorization': 'Bearer ' + tok,
                                                             'Content-Type': 'application/json'})
        print('commit', urllib.request.urlopen(req, timeout=60).status)


if __name__ == '__main__':
    main()
