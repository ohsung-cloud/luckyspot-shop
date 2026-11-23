/**
 * 엔진 검증 — 오늘(2026-11-23) 실제 포털 값으로 계산한 결과를 고정한다.
 *
 *   node --test tests/
 *
 * 값의 출처: 두 사이트 포털 실측 스냅샷 (fixtures/snapshots/2026-11-23T1210+0900.json)
 *   - 에스칼프린트: 토너 K46/C27/M38/Y40, Tray1 30%/Tray2 70%, 누적 25,390매,
 *     학사일정 11/21~25 논술시험기간, A4 75g 22,800원(5BOX 최소), 무료배송 20만원
 *   - 로얄선즈: 금일 14,600원·어제 57,800원·이달 1,059,700원,
 *     재료부족 = 사과시럽 0% · 어두 0%, 투명컵 53.6%, 원료 소모 일지 14행(총 12.8)
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  actualByOrder,
  beanClass,
  beanConsumption,
  analyze,
  calendarBurst,
  driftReport,
  expectedDemand,
  orderProposals,
  renderReport,
  revenueAtRisk,
  stockForecast,
  unifiedRevenue,
} from "../src/engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(
  await readFile(path.join(root, "fixtures/snapshots/2026-11-23T1210+0900.json"), "utf8"),
);

test("학사일정: 논술시험기간(11/21~25) 안이면 프린트 1.35배, 커피 1.14배", () => {
  const burst = calendarBurst(snapshot.escalprint.calendar, "2026-11-23");
  assert.equal(burst.printWeight, 1.35);
  assert.equal(burst.coffeeWeight, 1.14);
  assert.equal(burst.activeWindow.title, "대학 논술시험기간");
  assert.equal(burst.events[0].phase, "in-window");
});

test("학사일정: 시험 5일 전엔 버스트 없음(1.00), 2일 전엔 완만한 1.157", () => {
  const far = calendarBurst(snapshot.escalprint.calendar, "2026-11-15");
  assert.equal(far.printWeight, 1);
  const near = calendarBurst(snapshot.escalprint.calendar, "2026-11-19"); // 11/21 시작 2일 전
  assert.ok(near.printWeight > 1.1 && near.printWeight < 1.2, `예상 1.157, 실제 ${near.printWeight}`);
});

test("음료 7잔 → 재료별 수요(실측 우선): 원두 12.0 · 투명컵 5 · 종이컵 2", () => {
  const demand = expectedDemand(snapshot.loyalsuns);
  assert.equal(demand.drinkCount, 7);
  const map = Object.fromEntries(demand.byMaterial.map((item) => [item.material, item.units]));
  assert.equal(map["원두"], 12);
  assert.equal(map["투명컵"], 5);
  assert.equal(map["종이컵"], 2);
  assert.equal(map["얼그레이"], 0.4);
  assert.equal(demand.uncovered.length, 0);
});

test("원두 계수: 아메리카노 9g · 투샷 15g · 카페라떼 7g · 아샷추 7g (사용자 확정)", () => {
  assert.equal(beanClass("아메리카노 HOT"), "americano");
  assert.equal(beanClass("아이스 아메리카노"), "americano");
  assert.equal(beanClass("투샷 아메리카노 ICED"), "doubleShot");
  assert.equal(beanClass("카페라떼 HOT"), "latte");
  assert.equal(beanClass("아샷추 ICED"), "ashotchu");
  const burst = calendarBurst(snapshot.escalprint.calendar, "2026-11-23");
  const bean = beanConsumption(snapshot, burst);
  assert.equal(bean.dailyGrams, 66); // 2×9 + 2×15 + 2×9
  assert.equal(bean.dailyGramsWithBurst, 75.2);
  assert.equal(bean.stockGrams, 1308.4);
  assert.equal(bean.daysLeftWithBurst, 17.4);
  assert.equal(bean.daysLeftPlain, 19.8);
  assert.equal(bean.servingsLeft, 118);
});

test("레시피 폴백: ICED 레시피가 없으면 같은 메뉴 HOT 레시피를 쓰되 변형으로 표시", () => {
  const loyalsuns = {
    bestsellers: [{ name: "카페라떼 ICED", quantity: 1 }],
    recipes: snapshot.loyalsuns.recipes,
  };
  const demand = expectedDemand(loyalsuns);
  assert.equal(demand.covered[0].basis, "variant-recipe");
  const milk = demand.byMaterial.find((item) => item.material === "우유");
  assert.equal(milk.units, 0.9); // 9.0g ÷ 10g/단위
});

test("드리프트: 아메리카노 HOT(2.40) vs ICED(1.20) 교차 편차 검출", () => {
  const drift = driftReport(snapshot);
  const cross = drift.findings.find((finding) => finding.type === "cross-variant-drift");
  assert.ok(cross, "cross-variant-drift 를 찾지 못했습니다");
  assert.equal(cross.material, "원두");
  assert.match(cross.detail, /2\.4/);
  assert.match(cross.detail, /1\.2/);
});

test("드리프트: 한 주문에 두 상품이 섞여도 상품별로 분리 집계", () => {
  const orders = actualByOrder(snapshot.loyalsuns);
  const mixed = orders.find((order) => order.at === "2026-11-23 05:11:40");
  assert.ok(mixed);
  assert.equal(mixed.product, "바닐라밀크티 ICED");
  assert.deepEqual(mixed.materials, { 얼그레이: 0.4, 바닐라: 0.4 });
});

test("잔여일: 사과시럽·어두 0%는 empty, 투명컵 53.6%는 9.4일 watch", () => {
  const burst = calendarBurst(snapshot.escalprint.calendar, "2026-11-23");
  const bean = beanConsumption(snapshot, burst);
  const stock = stockForecast(snapshot, expectedDemand(snapshot.loyalsuns), burst, undefined, { 원두: bean.dailyGrams });
  const byName = Object.fromEntries(stock.map((row) => [row.material, row]));
  assert.equal(byName["사과시럽"].status, "empty");
  assert.equal(byName["어두"].status, "empty");
  assert.equal(byName["투명컵"].daysLeft, 9.4);
  assert.equal(byName["투명컵"].status, "watch");
  // 원두는 사용자 확정 계수(일 66g) 기준 → 1,308.4g ÷ 75.2g = 17.4일
  assert.equal(byName["원두"].daysLeft, 17.4);
});

test("발주 제안: A4는 최소 5BOX가 아니라 무료배송을 채우는 9BOX(205,200원)", () => {
  const burst = calendarBurst(snapshot.escalprint.calendar, "2026-11-23");
  const analysis = analyze(snapshot);
  const a4 = analysis.orders.proposals.find((proposal) => proposal.material.includes("A4"));
  assert.ok(a4);
  assert.equal(a4.quantity, 9);
  assert.equal(a4.amount, 205200);
  assert.equal(a4.owner, "hq_print");
  assert.equal(a4.shippingNote, "무료배송 충족");
});

test("발주 제안: 재료 부족 2건은 가맹점주 사업자로 분리, 커피 단가는 '확인 필요'", () => {
  const analysis = analyze(snapshot);
  const cafe = analysis.orders.proposals.filter((proposal) => proposal.owner === "franchisee_cafe");
  assert.equal(cafe.length, 2);
  assert.ok(cafe.every((proposal) => proposal.needsQuote));
  const hq = analysis.orders.byOwner.hq_print;
  assert.equal(hq.count, 1);
  assert.equal(hq.amount, 205200);
});

test("통합 매출: 커피 오늘 14,600 / 어제 -74.7% / 이달 1,059,700", () => {
  const revenue = unifiedRevenue(snapshot, "2026-11-23");
  assert.equal(revenue.coffee.today, 14600);
  assert.equal(revenue.coffee.yesterday, 57800);
  assert.equal(revenue.coffee.trendPct, -74.7);
  assert.equal(revenue.coffee.month, 1059700);
  assert.equal(revenue.print.total, 500200);
  assert.equal(revenue.print.trendPct, -44.5);
  assert.ok(revenue.blended.monthlyRunRate > 2_000_000);
});

test("매출 위험: 0% 재료가 레시피에 없으면 '영향 매출 미산정'으로 남긴다", () => {
  const risk = revenueAtRisk(snapshot);
  assert.equal(risk.todayRevenue, 14600);
  // 명세에 "아이스/ICED"가 있는 주문 합: 2,100 + 2,100 + 5,700(복합 주문) = 9,900
  assert.equal(risk.icedRevenue, 9900);
  assert.ok(risk.items.every((item) => item.revenueAtRiskPerDay === null));
  assert.ok(risk.items.every((item) => item.affectedMenus.length === 0));
});

test("리포트 렌더: 핵심 문구가 모두 들어간다", () => {
  const report = renderReport(analyze(snapshot), snapshot);
  for (const needle of ["통합 매출", "학사일정 버스트", "잔여일", "드리프트", "발주 제안", "가정과 미확인", "사과시럽", "205,200원"]) {
    assert.ok(report.includes(needle), `리포트에 '${needle}' 없음`);
  }
});
