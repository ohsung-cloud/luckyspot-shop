/**
 * 지점 1곳 수집 흐름 — 두 포털에 각각 로그인해 화면 값을 읽는다.
 *
 * 한 단계가 실패해도 같은 포털의 다른 단계와 다른 포털 수집은 계속한다.
 * 실패는 `steps` 에 이름과 사유만 남기고, 값이 없으면 null 로 둔다.
 */

import {
  attachJsonCapture,
  clickByText,
  clickFirstRowButton,
  closeDialog,
  inventoryFromCaptures,
  loginEscalprint,
  loginLoyalsuns,
  newStoreContext,
  pageLocation,
  runExtractor,
  settle,
  waitForAnyText,
} from "./session.mjs";

const INVENTORY_API = [/inventory/i, /stock/i, /material/i, /reagent/i, /재고/i, /slot/i];

async function step(list, key, fn) {
  const startedAt = Date.now();
  try {
    await fn();
    list.push({ key, ok: true, ms: Date.now() - startedAt });
    return true;
  } catch (error) {
    list.push({
      key,
      ok: false,
      ms: Date.now() - startedAt,
      error: String(error?.message ?? error).replace(/\s+/g, " ").slice(0, 180),
    });
    return false;
  }
}

export async function collectStore(browser, store, options) {
  const {
    credentials,
    baseUrls = {},
    portals = ["loyalsuns", "escalprint"],
    onStep = () => {},
  } = options;

  const fragments = {};
  const result = {
    store,
    fragments,
    portals: {},
    routes: {},
  };

  const wanted = (portal) => portals.includes(portal);
  const creds = credentials ?? {};

  /* ---------------- 로얄선즈(커피) ---------------- */
  if (wanted("loyalsuns")) {
    if (!creds.loyalsuns) {
      result.portals.loyalsuns = { ok: false, skipped: true, reason: "자격증명 없음", steps: [] };
    } else {
      const steps = [];
      const context = await newStoreContext(browser);
      try {
        const page = await context.newPage();
        const captures = attachJsonCapture(page, INVENTORY_API);

        const loginOk = await step(steps, "loyalsuns.login", () =>
          loginLoyalsuns(page, creds.loyalsuns, { baseUrl: baseUrls.loyalsuns }),
        );
        onStep(store, "loyalsuns.login", loginOk);

        if (loginOk) {
          result.routes.loyalsuns = await pageLocation(page);

          await step(steps, "loyalsuns.dashboard", async () => {
            fragments["loyalsuns.dashboard"] = await runExtractor(page, "loyalsuns.dashboard");
          });
          await step(steps, "loyalsuns.revenue.main", async () => {
            const revenue = await runExtractor(page, "loyalsuns.revenue");
            if (revenue.today !== null || revenue.month !== null || revenue.lastMonth !== null) {
              fragments["loyalsuns.revenue"] = revenue;
            }
          });

          await step(steps, "loyalsuns.orders", async () => {
            const clicked = await clickByText(page, ["판매수익", "판매 관리", "판매정보"]);
            if (!clicked) throw new Error("판매수익 메뉴를 찾지 못했습니다");
            await clickByText(page, ["판매정보", "판매정보 조회", "거래내역"], { timeout: 4000 });
            await settle(page, 1000);
            fragments["loyalsuns.orders"] = await runExtractor(page, "loyalsuns.orders");
            result.routes.loyalsunsOrders = await pageLocation(page);
          });

          await step(steps, "loyalsuns.inventory", async () => {
            const clicked = await clickByText(page, ["재고 관리", "재고관리"]);
            if (!clicked) throw new Error("재고 관리 메뉴를 찾지 못했습니다");
            const opened = await clickFirstRowButton(page, ["보기", "재고정보", "상세"]);
            if (!opened) throw new Error("재고정보 [보기] 버튼을 찾지 못했습니다");
            await settle(page, 1200);

            const inventory = await runExtractor(page, "loyalsuns.inventory");
            const textItems = [
              ...(inventory.items ?? []),
              ...(inventory.named ?? []),
              ...(inventory.textItems ?? []).map((item) => ({ group: item.group, slot: null, material: null, pct: item.pct })),
            ].filter((item) => typeof item.pct === "number");

            if (textItems.length >= 3) {
              fragments["loyalsuns.inventory.vision"] = {
                capturedAt: new Date().toISOString(),
                source: "dom-text",
                items: textItems,
              };
            } else {
              // 캔버스로만 그려지는 화면 → 같은 화면이 부른 JSON 에서 값을 뽑는다.
              const fromApi = inventoryFromCaptures(captures);
              if (fromApi.length >= 3) {
                fragments["loyalsuns.inventory.api"] = {
                  capturedAt: new Date().toISOString(),
                  source: "portal-json",
                  items: fromApi,
                };
              } else if (inventory.canvasCount > 0) {
                throw new Error("재고 %가 캔버스로만 표시되고 대체 JSON도 찾지 못했습니다");
              } else {
                throw new Error("재고 값을 읽지 못했습니다");
              }
            }
            await closeDialog(page);
          });

          await step(steps, "loyalsuns.consumption", async () => {
            const clicked = await clickByText(page, ["기계 로그 정보", "기계로그정보", "로그 정보"]);
            if (!clicked) throw new Error("기계 로그 정보 메뉴를 찾지 못했습니다");
            await clickByText(page, ["원료 소모 일지", "원료소모일지", "소모 일지"], { timeout: 4000 });
            await settle(page, 1200);
            fragments["loyalsuns.consumption"] = await runExtractor(page, "loyalsuns.consumption");
            result.routes.loyalsunsLog = await pageLocation(page);
          });

          await step(steps, "loyalsuns.refill", async () => {
            const clicked = await clickByText(page, ["보충 로그", "보충로그"], { timeout: 4000 });
            if (!clicked) throw new Error("보충 로그 탭을 찾지 못했습니다");
            await settle(page, 1000);
            fragments["loyalsuns.refill"] = await runExtractor(page, "loyalsuns.refill");
          });

          await step(steps, "loyalsuns.shortage", async () => {
            const clicked = await clickByText(page, ["재료부족 기계", "재료 부족 기계", "부족 기계"], { timeout: 4000 });
            if (!clicked) throw new Error("재료부족 기계 탭을 찾지 못했습니다");
            await settle(page, 800);
            fragments["loyalsuns.shortage"] = await runExtractor(page, "loyalsuns.shortage");
          });

          await step(steps, "loyalsuns.recipes", async () => {
            const clicked = await clickByText(page, ["레시피관리", "레시피 관리"]);
            if (!clicked) throw new Error("레시피관리 메뉴를 찾지 못했습니다");
            await settle(page, 1000);
            fragments["loyalsuns.products"] = await runExtractor(page, "loyalsuns.products").catch(() => null);

            const viewButtons = page.locator('button:has-text("보기"), a:has-text("보기")');
            const total = Math.min(await viewButtons.count().catch(() => 0), 4);
            let saved = 0;
            for (let i = 0; i < total; i += 1) {
              try {
                await viewButtons.nth(i).click({ timeout: 4000 });
                await settle(page, 800);
                const recipe = await runExtractor(page, "loyalsuns.recipeDialog");
                const name = (recipe.product || `product-${i + 1}`).toString().trim().slice(0, 24);
                fragments[`loyalsuns.recipe.${name}`] = recipe;
                saved += 1;
                await closeDialog(page);
              } catch {
                await closeDialog(page);
              }
            }
            if (saved === 0) throw new Error("레시피 상세를 하나도 읽지 못했습니다");
          });
        }
      } catch (error) {
        steps.push({ key: "loyalsuns.portal", ok: false, error: String(error?.message ?? error).slice(0, 180) });
      } finally {
        await context.close().catch(() => {});
      }

      const ok = Boolean(fragments["loyalsuns.dashboard"] || fragments["loyalsuns.orders"]);
      result.portals.loyalsuns = { ok, steps };
    }
  }

  /* ---------------- 에스칼프린트(프린트) ---------------- */
  if (wanted("escalprint")) {
    if (!creds.escalprint) {
      result.portals.escalprint = { ok: false, skipped: true, reason: "자격증명 없음", steps: [] };
    } else {
      const steps = [];
      const context = await newStoreContext(browser);
      try {
        const page = await context.newPage();
        const loginOk = await step(steps, "escalprint.login", () =>
          loginEscalprint(page, creds.escalprint, { baseUrl: baseUrls.escalprint }),
        );
        onStep(store, "escalprint.login", loginOk);

        if (loginOk) {
          result.routes.escalprint = await pageLocation(page);

          await step(steps, "escalprint.home", async () => {
            fragments["escalprint.home"] = await runExtractor(page, "escalprint.home");
          });

          await step(steps, "escalprint.revenue", async () => {
            const clicked = await clickByText(page, ["청구·정산", "청구 · 정산", "청구정산"]);
            if (!clicked) throw new Error("청구·정산 탭을 찾지 못했습니다");
            await clickByText(page, ["매출 분석"], { timeout: 4000 });
            await settle(page, 1000);
            fragments["escalprint.revenue"] = await runExtractor(page, "escalprint.revenue");
            result.routes.escalprintRevenue = await pageLocation(page);
          });

          await step(steps, "escalprint.spend", async () => {
            const clicked = await clickByText(page, ["발주 지출 분석"], { timeout: 4000 });
            if (!clicked) throw new Error("발주 지출 분석 탭을 찾지 못했습니다");
            await settle(page, 1000);
            fragments["escalprint.spend"] = await runExtractor(page, "escalprint.spend");
          });

          await step(steps, "escalprint.refunds", async () => {
            const clicked = await clickByText(page, ["환불 내역"], { timeout: 4000 });
            if (!clicked) throw new Error("환불 내역 탭을 찾지 못했습니다");
            await settle(page, 800);
            fragments["escalprint.refunds"] = await runExtractor(page, "escalprint.refunds");
          });

          await step(steps, "escalprint.catalog", async () => {
            const clicked = await clickByText(page, ["발주하기"]);
            if (!clicked) throw new Error("발주하기 탭을 찾지 못했습니다");
            // 카탈로그는 수십 개 상품을 지연 로딩한다 — 가격 문구가 나올 때까지 기다린다.
            await waitForAnyText(page, ["VAT 별도", "원 /"], 20000);
            await settle(page, 800);
            const catalog = await runExtractor(page, "escalprint.catalog");
            if ((catalog.items ?? []).length === 0) throw new Error("카탈로그 상품을 하나도 읽지 못했습니다");
            fragments["escalprint.catalog"] = catalog;
          });

          await step(steps, "escalprint.calendar", async () => {
            const clicked = await clickByText(page, ["일정", "학사일정"]);
            if (!clicked) throw new Error("일정 탭을 찾지 못했습니다");
            await settle(page, 1000);
            fragments["escalprint.calendar"] = await runExtractor(page, "escalprint.calendar");
          });

          // 다음 달 일정까지 보면 예열·발주 계획을 미리 세울 수 있다(기간이 있으면 그대로 쓴다).
          await step(steps, "escalprint.calendar.next", async () => {
            const moved = await clickByText(page, ["다음달"], { timeout: 4000 });
            if (!moved) throw new Error("다음달 버튼을 찾지 못했습니다");
            await settle(page, 1000);
            fragments["escalprint.calendar.next"] = await runExtractor(page, "escalprint.calendar");
          });
        }
      } catch (error) {
        steps.push({ key: "escalprint.portal", ok: false, error: String(error?.message ?? error).slice(0, 180) });
      } finally {
        await context.close().catch(() => {});
      }

      const ok = Boolean(fragments["escalprint.home"] || fragments["escalprint.revenue"]);
      result.portals.escalprint = { ok, steps };
    }
  }

  return result;
}
