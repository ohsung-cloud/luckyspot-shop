/**
 * 병합 검증 — 추출기 출력(조각) → 스냅샷
 *
 * 값은 목(mock) 포털에서 실제로 읽히는 값과 같은 모양으로 넣었다.
 * 병합이 값을 만들지 않고, 없는 값은 null 로 남기는지 확인한다.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSnapshot } from "../src/merge.mjs";
import { STORES } from "../src/stores.mjs";

const fragments = {
  "escalprint.home": {
    capturedAt: "2026-11-23T08:30:00+09:00",
    toner: { k: 46, c: 27, m: 38, y: 40 },
    paper: { tray1: 30, tray2: 70 },
    cumulativePrintCount: 25394,
    deviceModel: "TASKalfa MZ3501ci",
    deviceSerial: "1P26300591",
    deviceName: "에스칼_럭키스팟_강남구청역점_1번 [KSPC]",
    reorderHint: "Tray1 용지 30% 남음",
    lowStockWarning: true,
  },
  "escalprint.revenue": {
    current: { month: "2026-10", total: 500200 },
    history: [
      { month: "2026-10", total: 500200, changePct: -44.5 },
      { month: "2026-09", total: 901360, changePct: -14.4 },
    ],
    refunds: [{ month: "2026-10", count: 1, total: 250 }],
  },
  "escalprint.spend": { month: "2026-08", total: 125400, rows: [["용지", "114,000원"]] },
  "escalprint.catalog": {
    freeShippingThreshold: 200000,
    items: [
      { name: "한솔제지 A4 75g 2500매", price: 22800, unit: "BOX", minQty: 5 },
      { name: "한국제지 A3 75g 1250매", price: 36800, unit: "BOX", minQty: 2 },
    ],
  },
  "escalprint.calendar": { year: 2026, month: 11, events: [{ day: 21, title: "대학 논술시험기간" }] },
  "loyalsuns.dashboard": {
    revenue: { today: 14600, yesterday: 57800, month: 1059700, lastMonth: 1214300, cumulativeTotal: 18728900 },
    orders: { totalCount: 6007, refundCount: 0 },
    bestsellers: [
      { name: "아메리카노 HOT", quantity: 2, amount: 4800 },
      { name: "투샷 아메리카노 ICED", quantity: 2, amount: 5600 },
    ],
    shortage: true,
  },
  "loyalsuns.orders": {
    rows: [
      ["1", "2026-11-23 09:54", "아메리카노 ICED", "카드", "2,100"],
      ["2", "2026-11-23 05:11", "바닐라밀크티 ICED", "카드", "0"],
    ],
  },
  "loyalsuns.inventory.api": {
    source: "portal-json",
    items: [
      { group: "연동 펌프 재료", slot: "연동 펌프3", material: "사과시럽", pct: 0 },
      { group: "범용 상자 재료", slot: "범용 재료 상자2", material: "어두", pct: 0 },
      { group: "범용 상자 재료", slot: "컵 슬롯1", material: "투명컵", pct: 53.6 },
    ],
  },
  "loyalsuns.consumption": {
    total: 12.8,
    rows: [["1", "2124749206537687042", "아메리카노 ICED", "원두", "1.20", "2026-11-23 09:54:10"]],
  },
  "loyalsuns.recipe.아메리카노 HOT": {
    product: "아메리카노 HOT",
    coffeeMl: 50,
    doubleShot: true,
    rows: [["1", "분말 박스1", "원두", "9", "0", "50"]],
  },
};

test("병합: 두 포털 값을 지점 단위 스냅샷으로 만든다", () => {
  const snapshot = buildSnapshot({
    fragments,
    store: STORES.STORE_GNM,
    capturedAt: "2026-11-23T08:30:00+09:00",
  });

  assert.equal(snapshot.storeCode, "STORE_GNM");
  assert.equal(snapshot.storeLabel, "럭키스팟 강남구청역점");
  assert.equal(snapshot.captureMode, "browser-automation");

  assert.deepEqual(snapshot.escalprint.toner, { k: 46, c: 27, m: 38, y: 40 });
  assert.deepEqual(snapshot.escalprint.paper, { tray1: 30, tray2: 70 });
  assert.equal(snapshot.escalprint.device.cumulativePrintCount, 25394);
  assert.equal(snapshot.escalprint.device.serial, "1P26300591");
  assert.equal(snapshot.escalprint.revenue.total, 500200);
  assert.equal(snapshot.escalprint.revenue.refund, 250);
  assert.equal(snapshot.escalprint.shipping.freeThreshold, 200000);
  assert.equal(snapshot.escalprint.catalog.length, 2);
  assert.equal(snapshot.escalprint.calendar[0].demandWeight, 1.35);

  assert.equal(snapshot.loyalsuns.revenue.today, 14600);
  assert.equal(snapshot.loyalsuns.revenue.lastMonth, 1214300);
  assert.equal(snapshot.loyalsuns.orders.todayCount, 2);
  assert.equal(snapshot.loyalsuns.orders.today[1].amount, 0);
  assert.equal(snapshot.loyalsuns.inventorySource, "api");
  assert.equal(snapshot.loyalsuns.inventory.length, 3);
  assert.equal(snapshot.loyalsuns.shortages.length, 2);
  assert.equal(snapshot.loyalsuns.lowStock[0].material, "투명컵");
  assert.equal(snapshot.loyalsuns.recipes.length, 1);
  assert.equal(snapshot.loyalsuns.recipes[0].doubleShot, true);
  assert.equal(snapshot.loyalsuns.consumptionLog.length, 1);
  assert.equal(snapshot.loyalsuns.machine.bodyCode, null);
  assert.equal(snapshot.missing.length, 0);
});

test("병합: 읽지 못한 화면은 값을 만들지 않고 missing 에 이름만 남긴다", () => {
  const snapshot = buildSnapshot({
    fragments: { "escalprint.home": fragments["escalprint.home"] },
    store: STORES.STORE_HYJ,
    capturedAt: "2026-11-23T08:30:00+09:00",
  });

  assert.equal(snapshot.storeId, "hanyeojong");
  assert.equal(snapshot.loyalsuns.revenue.today, null);
  assert.equal(snapshot.escalprint.revenue, null);
  assert.deepEqual(snapshot.escalprint.catalog, []);
  assert.ok(snapshot.missing.includes("loyalsuns.dashboard"));
  assert.ok(snapshot.missing.includes("escalprint.revenue"));
});

test("병합: 재고 정보는 vision 판독이 JSON 보다 우선한다", () => {
  const snapshot = buildSnapshot({
    fragments: {
      ...fragments,
      "loyalsuns.inventory.vision": {
        source: "dom-text",
        items: [{ group: "분말 상자 재료", slot: "파우더 박스1", material: "바닐라", pct: 970.86 }],
      },
    },
    store: STORES.STORE_GNM,
    capturedAt: "2026-11-23T08:30:00+09:00",
  });

  assert.equal(snapshot.loyalsuns.inventorySource, "vision");
  assert.equal(snapshot.loyalsuns.inventory.length, 1);
  assert.equal(snapshot.loyalsuns.shortages.length, 0);
});
