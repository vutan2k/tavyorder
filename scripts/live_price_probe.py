import re, json, time, sys
from curl_cffi import requests

def oy(goods_no):
    url = f"https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo={goods_no}"
    t0 = time.time()
    r = requests.get(url, impersonate="chrome124", timeout=15)
    html = r.text
    sale = re.search(r'text-product-discount-price[^>]*><span>([0-9,]+)</span>', html)
    orig = re.search(r'text-product-original-price[^>]*><span>([0-9,]+)</span>', html)
    title = re.search(r'<meta property="og:title" content="([^"]+)"', html)
    sold = ('품절' in html[:20000])
    return {'ok': r.status_code == 200, 'status': r.status_code, 'ms': int((time.time()-t0)*1000),
            'sale': int(sale.group(1).replace(',', '')) if sale else None,
            'origin': int(orig.group(1).replace(',', '')) if orig else None,
            'title': (title.group(1)[:40] if title else ''), 'soldout_flag': sold}

def lotte(url):
    t0 = time.time()
    r = requests.get(url, impersonate="chrome124", timeout=15, headers={'Accept-Language': 'ko-KR'})
    h = r.text
    prices = re.findall(r'"salePrice"\s*:\s*"?([0-9]{3,})', h) + re.findall(r'"discountPrice"\s*:\s*"?([0-9]{3,})', h)
    return {'ok': r.status_code == 200, 'status': r.status_code, 'ms': int((time.time()-t0)*1000),
            'bytes': len(h), 'prices': prices[:5],
            'has_product_name': bool(re.search(r'"productName"', h))}

if __name__ == '__main__':
    for g in ['A000000012157', 'A000000013194', 'A000000130319']:
        print('OY', g, oy(g))
    for u in ['https://www.lotteon.com/p/product/LE1217073670',
              'https://www.lotteon.com/p/product/LE1200978175']:
        print('LOTTE', u, lotte(u))
