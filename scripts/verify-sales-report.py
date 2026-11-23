import asyncio, json, os, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE", "http://127.0.0.1:3210")
OUT = "/workspace/evidence/sales-report-multistore"
os.makedirs(OUT, exist_ok=True)

VIEWPORTS = [("mobile", 390, 844), ("desktop", 1440, 900)]

async def check(page, label, log):
    overflow = await page.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
    log[f"{label}.overflowPx"] = overflow
    return overflow

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
            await page.wait_for_timeout(400)

            # 기본 진입: 강남구청역점 단독
            log[f"{name}.defaultTab"] = await page.get_attribute('button[role="tab"][aria-selected="true"]', "data-on")
            selected_text = await page.inner_text('button[role="tab"][aria-selected="true"]')
            log[f"{name}.defaultTabText"] = selected_text.replace("\n", " ")
            body = await page.inner_text("main")
            log[f"{name}.defaultHasGangnamLabel"] = "럭키스팟 강남구청역점" in body
            log[f"{name}.defaultHasSingleStoreChip"] = "지점 단독 · 합산 없음" in body
            log[f"{name}.defaultHasHanyejongNumbers"] = "1,963,240" in body
            log[f"{name}.defaultGangnamToday"] = "14,600원" in body
            log[f"{name}.defaultNoCrossStore"] = ("55,600원" not in body) and ("3,984,400" not in body)
            log[f"{name}.defaultDonutCircles"] = await page.locator("section svg circle").count()
            await check(page, f"{name}.default", log)
            await page.screenshot(path=f"{OUT}/{name}-01-gangnam.png", full_page=True)

            # 한예종점 탭
            await page.get_by_role("tab", name="한예종점").click()
            await page.wait_for_timeout(400)
            body = await page.inner_text("main")
            log[f"{name}.hanyejongHasLabel"] = "럭키스팟 한예종점" in body
            log[f"{name}.hanyejongToday"] = "55,600원" in body
            log[f"{name}.hanyejongPrintMonth"] = "1,963,240원" in body
            log[f"{name}.hanyejongTonerAlert"] = "프린트 토너 4색 5%" in body
            log[f"{name}.hanyejongBeanDays"] = "1.5일" in body
            log[f"{name}.hanyejongOrderTotal"] = "577,700원" in body
            log[f"{name}.hanyejongUrlHasStore"] = "store=hanyeojong" in page.url
            log[f"{name}.hanyejongAutoOrderHref"] = await page.locator("a", has_text="한예종점 사업자별로 나눠 발주").first.get_attribute("href")
            log[f"{name}.hanyejongNoGangnamNumbers"] = "500,200" not in body and "14,600원" not in body
            await check(page, f"{name}.hanyejong", log)
            await page.screenshot(path=f"{OUT}/{name}-02-hanyejong.png", full_page=True)

            # 지점 비교 탭
            await page.get_by_role("tab", name="지점 비교").click()
            await page.wait_for_timeout(400)
            body = await page.inner_text("main")
            log[f"{name}.compareHasNoSumLabel"] = "합산하지 않음" in body
            log[f"{name}.compareMentionsNoTotal"] = ("합계 줄을 두지 않았습니다" in body)
            log[f"{name}.compareBothStores"] = ("럭키스팟 강남구청역점" in body and "럭키스팟 한예종점" in body)
            log[f"{name}.compareDistinctNumbers"] = ("25,390매" in body and "221,739매" in body)
            await check(page, f"{name}.compare", log)
            await page.screenshot(path=f"{OUT}/{name}-03-compare.png", full_page=True)

            log[f"{name}.consoleErrors"] = errors
            await ctx.close()
        await browser.close()
    print(json.dumps(log, ensure_ascii=False, indent=1))

asyncio.run(run())
