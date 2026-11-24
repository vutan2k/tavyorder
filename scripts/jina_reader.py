#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JINA READER ENGINE (ZERO-RAM FAST WEB SCRAPER)
Bóc tách bất kỳ trang web nào (Threads, tin tức, blog, review, sản phẩm)
thành LLM-friendly Markdown với 0MB RAM trên máy cục bộ.
"""

import sys
import urllib.request
import urllib.error
import json

def read_url(target_url: str, timeout: int = 25) -> dict:
    jina_endpoint = f"https://r.jina.ai/{target_url}"
    req = urllib.request.Request(
        jina_endpoint,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "X-Return-Format": "markdown"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            content = response.read().decode("utf-8", errors="ignore")
            return {
                "success": True,
                "url": target_url,
                "content": content
            }
    except Exception as e:
        return {
            "success": False,
            "url": target_url,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 jina_reader.py <URL>")
        sys.exit(1)
    res = read_url(sys.argv[1])
    if res["success"]:
        print(res["content"][:500])
        print(f"\n[OK] Đã bóc tách thành công {len(res['content'])} ký tự.")
    else:
        print(f"[FAIL] {res['error']}")
