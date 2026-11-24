#!/usr/bin/env python3
"""Fetch live Olive Young price for one goodsNo. Prints JSON.

Session + cookie warmup là bắt buộc: request stateless bị Akamai 429 sau ~5 lần.
Cookie lưu tại ~/.cache/tavy/oy_cookies.json để tái sử dụng giữa các lần spawn.
"""
import json
import os
import re
import sys
import time

from curl_cffi import requests

COOKIE_FILE = os.path.expanduser("~/.cache/tavy/oy_cookies.json")
WARMUP_URL = "https://www.oliveyoung.co.kr/store/main/main.do"
BASE = "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo="
HDR = {"Accept-Language": "ko-KR,ko;q=0.9", "Referer": WARMUP_URL}


def load_cookies(session):
    try:
        for c in json.load(open(COOKIE_FILE)):
            session.cookies.set(c["name"], c["value"], domain=c.get("domain") or None, path=c.get("path") or "/")
        return True
    except Exception:
        return False


def save_cookies(session):
    try:
        os.makedirs(os.path.dirname(COOKIE_FILE), exist_ok=True)
        data = []
        for c in session.cookies.jar:
            data.append({"name": c.name, "value": c.value, "domain": c.domain, "path": c.path})
        json.dump(data, open(COOKIE_FILE, "w"))
    except Exception:
        pass


def parse(html):
    sale = re.search(r'text-product-discount-price[^>]*><span>([0-9,]+)</span>', html)
    orig = re.search(r'text-product-original-price[^>]*><span>([0-9,]+)</span>', html)
    title = re.search(r'<meta property="og:title" content="([^"]+)"', html)
    sale_price = int(sale.group(1).replace(",", "")) if sale else None
    origin_price = int(orig.group(1).replace(",", "")) if orig else None
    if origin_price and not sale_price:
        sale_price = origin_price
    sold_out = bool(re.search(r"(품절|일시품절|SOLD\s*OUT)", html[:120000])) and sale_price is None
    title_txt = title.group(1).replace(" | 올리브영", "").strip()[:80] if title else ""
    return sale_price, origin_price, sold_out, title_txt


def fetch(goods_no: str) -> dict:
    t0 = time.time()
    url = BASE + goods_no
    s = requests.Session(impersonate="chrome124")
    had_cookie = load_cookies(s)
    try:
        if not had_cookie:
            s.get(WARMUP_URL, timeout=12, headers=HDR)
        r = s.get(url, timeout=12, headers=HDR)
        if r.status_code == 429:
            s.get(WARMUP_URL, timeout=12, headers=HDR)
            time.sleep(1.5)
            r = s.get(url, timeout=12, headers=HDR)
    except Exception as e:
        return {"ok": False, "error": str(e)[:120], "goodsNo": goods_no}

    if r.status_code != 200:
        return {"ok": False, "status": r.status_code, "goodsNo": goods_no, "ms": int((time.time() - t0) * 1000)}

    save_cookies(s)
    sale_price, origin_price, sold_out, title = parse(r.text)
    if sale_price is None:
        return {
            "ok": False,
            "error": "sold_out" if sold_out else "price_not_found",
            "goodsNo": goods_no,
            "soldOut": sold_out,
            "ms": int((time.time() - t0) * 1000),
            "url": url,
        }

    return {
        "ok": True,
        "source": "oliveyoung",
        "goodsNo": goods_no,
        "salePrice": sale_price,
        "originPrice": origin_price,
        "soldOut": sold_out,
        "title": title,
        "ms": int((time.time() - t0) * 1000),
        "url": url,
    }


if __name__ == "__main__":
    out = fetch(sys.argv[1]) if len(sys.argv) > 1 else {"ok": False, "error": "goodsNo required"}
    print(json.dumps(out, ensure_ascii=False))
