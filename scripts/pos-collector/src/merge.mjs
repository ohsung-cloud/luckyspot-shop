/**
 * 수집 조각(raw) → 표준 스냅샷
 *
 * 원본: two-site-collector/bin/merge.mjs
 *   - 파일 이름 규칙(loyalsuns.dashboard.json 등)은 그대로 두고, 파일 대신 객체를 받을 수 있게 바꿨다
 *     (자동 수집은 파일을 거치지 않고 메모리에서 바로 병합한다).
 *   - 지점 정보(storeCode/storeLabel)를 인자로 받는다. 지점 값을 합산하지 않는다.
 *   - 로얄선즈 지난달 매출(lastMonth)을 스냅샷에 남긴다(엔진 계산에는 쓰지 않고 보고용).
 *
 * 스냅샷의 값은 사이트에서 읽은 그대로다. 없는 값은 null 로 두고, 비어 있는 항목은
 * `missing` 에 이름만 남긴다(원인 추적용).
 */

const num = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return value.trim() === "" ? null : Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const pad2 = (value) => String(value).padStart(2, "0");

function calendarEvents(calendar) {
  const year = num(calendar?.year);
  const month = num(calendar?.month);
  const events = Array.isArray(calendar?.events) ? calendar.events : [];
  const today = new Date();

  return events
    .map((event) => {
      const isExam = /수능|논술|고사|시험/.test(String(event?.title ?? ""));
      const start = typeof event?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.date)
        ? event.date
        : null;
      const day = num(event?.day);

      if (!start && !day) return null;

      const useYear = year ?? today.getFullYear();
      const useMonth = month ?? today.getMonth() + 1;

      return {
        date: start ?? `${useYear}-${pad2(useMonth)}-${pad2(day)}`,
        end: typeof event?.end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.end) ? event.end : null,
        title: String(event.title ?? "").trim(),
        kind: isExam ? "exam" : /납부\s*마감/.test(String(event.title ?? "")) ? "deadline" : "event",
        demandWeight: isExam ? 1.35 : 1.0,
      };
    })
    .filter(Boolean);
}

function recipeFragments(fragments) {
  const recipes = [];
  for (const [key, value] of Object.entries(fragments)) {
    if (!key.startsWith("loyalsuns.recipe.")) continue;
    if (!value || value.error) continue;
    recipes.push(value);
  }
  return recipes;
}

/**
 * @param {object} input
 * @param {object} input.fragments 이름 → 추출기 출력(JSON)
 * @param {object} input.store     { storeCode, storeId, label }
 * @param {string} input.capturedAt ISO 시각
 * @param {"browser-automation"|"fixture"} [input.captureMode]
 */
export function buildSnapshot({ fragments, store, capturedAt, captureMode = "browser-automation" }) {
  const f = fragments ?? {};
  const home = f["escalprint.home"] ?? null;
  const calendar = f["escalprint.calendar"] ?? null;
  const calendarNext = f["escalprint.calendar.next"] ?? null;
  const revenue = f["escalprint.revenue"] ?? null;
  const refundsFragment = f["escalprint.refunds"] ?? null;
  const spend = f["escalprint.spend"] ?? null;
  const catalog = f["escalprint.catalog"] ?? null;
  const dashboard = f["loyalsuns.dashboard"] ?? null;
  const loyalRevenue = f["loyalsuns.revenue"] ?? null;
  const orders = f["loyalsuns.orders"] ?? null;
  const products = f["loyalsuns.products"] ?? null;
  const consumption = f["loyalsuns.consumption"] ?? null;
  const refill = f["loyalsuns.refill"] ?? null;
  const shortageFragment = f["loyalsuns.shortage"] ?? null;
  const inventoryVision = f["loyalsuns.inventory.vision"] ?? null;
  const inventoryApi = f["loyalsuns.inventory.api"] ?? null;

  const missing = [];
  if (!home) missing.push("escalprint.home");
  if (!revenue) missing.push("escalprint.revenue");  if (!dashboard && !loyalRevenue) missing.push("loyalsuns.dashboard");
  if (!orders) missing.push("loyalsuns.orders");

  const history = (revenue?.history ?? []).map((row) => ({
    month: row.month,
    total: num(row.total),
    changePct: row.changePct ?? null,
  }));

  const inventoryRaw = inventoryVision?.items?.length
    ? inventoryVision.items
    : visionGroups(inventoryVision).length
      ? visionGroups(inventoryVision)
      : (inventoryApi?.items ?? []);
  const inventory = inventoryRaw
    .map((item) => ({
      group: item.group ?? null,
      slot: item.slot ?? null,
      material: item.material ?? null,
      pct: num(item.pct),
    }))
    .filter((item) => item.pct !== null);

  const shortages = inventory.filter((item) => item.pct === 0);
  const lowStock = inventory.filter((item) => item.pct > 0 && item.pct <= 60);

  const alerts = [];
  if (shortages.length > 0) {
    for (const item of shortages) {
      alerts.push({ type: "material_shortage", message: `${item.material ?? item.slot ?? "재료"} ${item.pct}%` });
    }
  } else if (dashboard?.shortage || shortageFragment?.shortage) {
    alerts.push({ type: "material_shortage", message: "재료 부족 알림(목록 미확인)" });
  }

  const revenueNow = revenue
    ? {
        month: revenue.current?.month ?? history[0]?.month ?? null,
        total: num(revenue.current?.total ?? history[0]?.total),
        refund: incomeRefund(
          { refunds: refundsFragment?.refunds?.length ? refundsFragment.refunds : revenue.refunds },
          revenue.current?.month ?? history[0]?.month,
        ),
        currentMonth: revenue.current?.month ?? history[0]?.month ?? null,
        history,
      }
    : null;

  const loyalsunsRevenue = {
    today: num(dashboard?.revenue?.today ?? loyalRevenue?.today),
    yesterday: num(dashboard?.revenue?.yesterday ?? loyalRevenue?.yesterday),
    month: num(dashboard?.revenue?.month ?? loyalRevenue?.month),
    lastMonth: num(dashboard?.revenue?.lastMonth ?? loyalRevenue?.lastMonth),
    cumulativeTotal: num(dashboard?.revenue?.cumulativeTotal),
  };

  const snapshot = {
    schemaVersion: "two-site/1.0",
    capturedAt,
    storeId: store.storeId,
    storeCode: store.storeCode,
    storeLabel: store.label,
    captureMode,
    escalprint: {
      portal: "https://escalprint-portal.com/",
      device: {
        name: home?.deviceName ?? home?.device?.name ?? null,
        model: home?.deviceModel ?? home?.device?.model ?? null,
        serial: home?.deviceSerial ?? home?.device?.serial ?? null,
        cumulativePrintCount: num(home?.cumulativePrintCount ?? home?.device?.cumulativePrintCount),
      },
      toner: {
        k: num(home?.toner?.k),
        c: num(home?.toner?.c),
        m: num(home?.toner?.m),
        y: num(home?.toner?.y),
      },
      paper: { tray1: num(home?.paper?.tray1), tray2: num(home?.paper?.tray2) },
      reorderHint: home?.reorderHint ?? null,
      lowStockWarning: Boolean(home?.lowStockWarning),
      revenue: revenueNow,
      spend: spend ? { month: spend.month, total: num(spend.total), rows: spend.rows ?? [] } : null,
      catalog: catalog?.items ?? [],
      shipping: catalog?.freeShippingThreshold ? { freeThreshold: catalog.freeShippingThreshold } : null,
      calendar: dedupeEvents([...calendarEvents(calendar), ...calendarEvents(calendarNext)]),
    },
    loyalsuns: {
      portal: "http://coffee.loyalsuns.com:8090/",
      machine: {
        serial: shortageFragment?.items?.[0]?.serial ?? null,
        bodyCode: shortageFragment?.items?.[0]?.bodyCode ?? null,
        online: dashboard?.onlineMachines === 0 ? false : true,
        shortage: Boolean(dashboard?.shortage || shortageFragment?.shortage || shortages.length > 0),
        alerts,
      },
      revenue: loyalsunsRevenue,
      orders: {
        todayCount: orders?.rows ? orders.rows.length : null,
        totalCount: num(dashboard?.orders?.totalCount),
        refundCount: num(dashboard?.orders?.refundCount),
        today: (orders?.rows ?? []).map((cells) => ({
          time: cells[1],
          product: cells[2],
          method: cells[3],
          amount: num(cells[4]),
        })),
      },
      bestsellers: (dashboard?.bestsellers ?? []).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        amount: item.amount ?? null,
      })),
      inventory,
      inventorySource: inventoryVision?.items?.length || visionGroups(inventoryVision).length ? "vision" : inventoryApi?.items?.length ? "api" : "none",
      shortages,
      lowStock,
      products: (products?.rows ?? []).map((cells) => ({ name: cells[1], price: num(cells[2]) })),
      recipes: recipeFragments(f).map((recipe) => ({
        product: recipe.product,
        coffeeMl: num(recipe.coffeeMl),
        doubleShot: Boolean(recipe.doubleShot),
        rows: (recipe.rows ?? []).map((cells) => ({
          slot: cells[1],
          material: cells[2],
          powderG: num(cells[3]),
          waterMl: num(cells[5]),
        })),
      })),
      refillLog: (refill?.rows ?? []).slice(0, 50),
      consumptionLog: (consumption?.rows ?? []).map((cells) => ({
        orderId: cells[2] ?? cells[1],
        at: cells[6] ?? null,
        product: cells[3] ?? null,
        material: cells[4] ?? null,
        amount: num(cells[5]),
      })),
      consumptionTotal: num(consumption?.total),
    },
    missing,
  };

  return snapshot;
}

function dedupeEvents(events) {
  const seen = new Set();
  const out = [];
  for (const event of events) {
    const key = `${event.date}|${event.end ?? ""}|${event.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function incomeRefund(revenue, month) {  if (!month) return null;
  const row = (revenue.refunds ?? []).find((entry) => entry.month === month);
  return row ? num(row.total) : null;
}

/** 예전 수집 형식({groups:{그룹:[{slot,material,pct}]}})도 받아 준다. */
function visionGroups(vision) {
  const groups = vision?.groups;
  if (!groups || typeof groups !== "object") return [];
  const items = [];
  for (const [group, list] of Object.entries(groups)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) items.push({ group, ...item });
  }
  return items;
}

/** 폴더의 조각 파일들을 읽어 병합한다(로컬 디버깅용). */
export async function mergeFromDir(dir, { store, capturedAt }) {
  const { readFile, readdir } = await import("node:fs/promises");
  const path = await import("node:path");
  const files = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  const fragments = {};
  for (const file of files) {
    const key = file.replace(/\.json$/, "");
    try {
      fragments[key] = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    } catch {
      // 깨진 조각은 없는 것으로 본다.
    }
  }
  return buildSnapshot({
    fragments,
    store,
    capturedAt: capturedAt ?? new Date().toISOString(),
    captureMode: "fixture",
  });
}
