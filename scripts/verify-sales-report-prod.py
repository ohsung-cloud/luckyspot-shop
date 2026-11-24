import asyncio, json, os
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE", "https://luckyspot-shop.vercel.app")
OUT = "/workspace/evidence/sales-report-multistore"
os.makedirs(OUT, exist_ok=True)

VIEWPORTS = [("prod-mobile", 390, 844), ("prod-desktop", 1440, 900)]

async def overflow(page):
    return await page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")

async def run():
    log = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for name, w, h in VIEWPORTS:
            ctx = await browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
            page = await ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))

            await page.goto(f"{BASE}/sales-report", wait_until="networkidle")
            await page.wait_for_timeout(600)

            log[f"{name}.url"] = page.url
            log[f"{name}.robots"] = await page.evaluate(
                "() => (document.querySelector('meta[name=robots]')||{}).content || ''"
            )
            log[f"{name}.defaultTab"] = (await page.inner_text('button[role="tab"][aria-selected="true"]')).replace("\n", " ")
            body = await page.inner_text("main")
            log[f"{name}.defaultSingleStore"] = "지점 단독 · 합산 없음" in body
            log[f"{name}.defaultGangnamToday"] = "14,600원" in body
            log[f"{name}.defaultNoHanyejongNumbers"] = ("55,600원" not in body) and ("4,112,000" not in body)
            log[f"{name}.defaultDonut"] = await page.locator("section svg circle").count()
            log[f"{name}.defaultOverflowPx"] = await overflow(page)
            await page.screenshot(path=f"{OUT}/{name}-01-gangnam.png", full_page=True)

            await page.get_by_role("tab", name="한예종점").click()
            await page.wait_for_timeout(600)
            body = await page.inner_text("main")
            log[f"{name}.hanyejong"] = {
                "label": "럭키스팟 한예종점" in body,
                "today": "55,600원" in body,
                "printOct": "1,963,240원" in body,
                "coffeeNov": "4,112,000원" in body,
                "tonerAll5": "프린트 토너 4색 5%" in body,
                "beanDays": "1.5일" in body,
                "tonerSet": "577,700원" in body,
                "noGangnamNumbers": "500,200" not in body and "105,970" not in body,
                "donut": await page.locator("section svg circle").count(),
                "overflowPx": await overflow(page),
                "autoOrderHref": await page.locator("a", has_text="한예종점 사업자별로 나눠 발주").first.get_attribute("href"),
            }
            await page.screenshot(path=f"{OUT}/{name}-02-hanyejong.png", full_page=True)

            await page.get_by_role("tab", name="지점 비교").click()
            await page.wait_for_timeout(600)
            body = await page.inner_text("main")
            log[f"{name}.compare"] = {
                "noSumChip": "합산하지 않음" in body,
                "noTotalRow": "합계 줄을 두지 않았습니다" in body,
                "bothStores": ("럭키스팟 강남구청역점" in body and "럭키스팟 한예종점" in body),
                "distinctNumbers": ("25,390매" in body and "221,739매" in body),
                "overflowPx": await overflow(page),
            }
            await page.screenshot(path=f"{OUT}/{name}-03-compare.png", full_page=True)

            log[f"{name}.consoleErrors"] = errors

            # 자동발주 연계(지점 코드 유지)
            resp = await page.goto(f"{BASE}/auto-order?storeCode=STORE_HYJ", wait_until="networkidle")
            log[f"{name}.autoOrderStatus"] = resp.status if resp else None
            await ctx.close()
        await browser.close()
    print(json.dumps(log, ensure_ascii=False, indent=1))

asyncio.run(run())
