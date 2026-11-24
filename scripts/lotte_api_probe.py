import asyncio, json, re
from playwright.async_api import async_playwright

CHROME = '/Users/tan/Library/Caches/ms-playwright/chromium-1223/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
URL = 'https://www.lotteon.com/p/product/LE1217073670'

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, executable_path=CHROME)
        ctx = await b.new_context(locale='ko-KR', user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
        page = await ctx.new_page()
        hits = []
        async def on_resp(resp):
            u = resp.url
            if any(k in u for k in ('api', 'graphql', 'product')) and resp.request.resource_type in ('xhr', 'fetch'):
                try:
                    body = await resp.text()
                    if re.search(r'"(salePrice|discountPrice|price)"', body):
                        hits.append((resp.status, u[:160], len(body), body[:300]))
                except Exception:
                    pass
        page.on('response', lambda r: asyncio.create_task(on_resp(r)))
        await page.goto(URL, wait_until='domcontentloaded', timeout=30000)
        await page.wait_for_timeout(3500)
        txt = await page.inner_text('body')
        price = re.findall(r'([0-9][0-9,]{3,})\s*원', txt)
        print('DOM prices:', price[:6])
        print('title:', (await page.title())[:80])
        for h in hits[:6]:
            print('API', h[0], h[1], h[2], h[3][:150].replace('\n', ' '))
        if not hits:
            print('no price API captured')
        await b.close()

asyncio.run(main())
