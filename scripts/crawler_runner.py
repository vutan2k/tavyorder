#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CRAWL4AI RUNNER ENGINE (AGENT-NATIVE CRAWLER)
Tự động hóa cào web sâu, render JS, trích xuất dữ liệu cho AI Agent
Sử dụng môi trường ảo CPython 3.11 cách ly (/Users/tan/.crawler_venv)
"""

import sys
import asyncio
from crawl4ai import AsyncWebCrawler

async def crawl(url: str):
    async with AsyncWebCrawler(verbose=False) as crawler:
        result = await crawler.arun(url=url)
        return {
            "success": result.success,
            "url": url,
            "markdown": result.markdown
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: /Users/tan/.crawler_venv/bin/python3 crawler_runner.py <URL>")
        sys.exit(1)
    res = asyncio.run(crawl(sys.argv[1]))
    if res["success"]:
        print(f"[OK] Crawled {len(res['markdown'])} chars.")
        print(res["markdown"][:300])
    else:
        print("[FAIL] Could not crawl URL.")
