"""Thay ảnh đại diện bị banner/quảng cáo bằng ảnh packshot thật (optionImage) từ OY.

Áp dụng cho các SKU vừa nạp (68 + 14). Ghi đè public/products/<id>.jpg.
Chạy: env -u PYTHONPATH python3 scripts/fix_main_images.py
"""
import json
import os
import re
import time

from curl_cffi import requests

REPO = '/Users/tan/tavy-korea'
OUT = '/tmp/fiximg_report.json'
IDS = sorted(set(list(json.load(open('/tmp/ingest80_cache.json')).keys())
                 + ['A000000255859', 'A000000205979', 'A000000221807', 'A000000189875',
                    'A000000171650', 'A000000206826', 'A000000245091', 'A000000232081',
                    'A000000248498', 'A000000148549', 'A000000138140', 'A000000230510',
                    'A000000171113', 'A000000243535']))


def main():
    rep = []
    for i, gid in enumerate(IDS, 1):
        try:
            r = requests.get(f'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={gid}',
                             impersonate='chrome124', timeout=35)
            u = r.text.replace('\\"', '"').replace('\\\\', '\\')
            imgs = re.findall(r'"optionImage":\{"url":"([^"]+)","path":"([^"]+)"\}', u)
            og = re.search(r'<meta property="og:image" content="([^"]+)"', r.text)
            cand = [imgs[0][0] + imgs[0][1]] if imgs else []
            if og:
                cand.append(og.group(1))
            saved = None
            for url in cand:
                try:
                    b = requests.get(url, impersonate='chrome124', timeout=40)
                    if b.status_code == 200 and len(b.content) > 15000:
                        open(os.path.join(REPO, 'public', 'products', f'{gid}.jpg'), 'wb').write(b.content)
                        saved = url
                        break
                except Exception:
                    continue
            rep.append({'id': gid, 'img': saved, 'candidates': cand})
            print(f'[{i}/{len(IDS)}] {gid} {"OK" if saved else "FAIL"} {(saved or "")[-60:]}')
        except Exception as e:
            rep.append({'id': gid, 'img': None, 'err': str(e)[:80]})
            print(f'[{i}/{len(IDS)}] {gid} ERR {str(e)[:60]}')
        json.dump(rep, open(OUT, 'w'), ensure_ascii=False, indent=1)
        time.sleep(9)
    print('done', sum(1 for x in rep if x.get('img')), '/', len(IDS))


if __name__ == '__main__':
    main()
