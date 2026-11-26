import assert from "node:assert/strict";
import test from "node:test";

import { monthlyForStore } from "../src/features/sales-report/monthly";
import {
  applyPaperPrintEstimate,
  elapsedDays,
  estimatePrintFromPaper,
  pricePerSheet,
  settlementPeriod,
  sheetsPerDayFromCounters,
  type PrintCounterReading,
} from "../src/features/sales-report/print-paper";
import { estimateProfit } from "../src/features/sales-report/profit";

/**
 * 프린트 매출 역산(종이 소모·기기 카운터) — 특허 1호 핵심 계산.
 *
 * 실행: npm test (tsc → node --test)
 */

const AS_OF = new Date("2026-11-25T08:44:00+09:00");

const GNM_READINGS: PrintCounterReading[] = [
  { capturedAt: "2026-11-23T12:10:00+09:00", cumulativePrintCount: 25_390, source: "test" },
  { capturedAt: "2026-11-24T16:58:00+09:00", cumulativePrintCount: 25_561, source: "test" },
];

test("정산 기간은 전월 26일 ~ 당월 25일(31일)", () => {
  const period = settlementPeriod("2026-11");
  assert.equal(period.start, "2026-10-26");
  assert.equal(period.end, "2026-11-25");
  assert.equal(period.days, 31);
  assert.equal(period.label, "10/26~11/25");

  const december = settlementPeriod("2026-12");
  assert.equal(december.start, "2026-11-26");
  assert.equal(december.days, 30);

  const january = settlementPeriod("2027-01");
  assert.equal(january.start, "2026-12-26");
});

test("경과일은 정산 시작일부터 오늘까지(오늘 부분 포함)", () => {
  assert.equal(elapsedDays("2026-10-26", AS_OF), 30.4);
  assert.equal(elapsedDays("2026-11-01", AS_OF), 24.4);
  assert.equal(elapsedDays("2026-11-26", AS_OF), 0);
});

test("장당 평균 단가는 요금표 가중 평균(흑백 70 · 컬러 250 · 컬러 18%)", () => {
  const gangnam = pricePerSheet("STORE_GNM");
  assert.equal(gangnam.value, 102);
  assert.match(gangnam.source, /요금표/);
});

test("카운터 두 점으로 하루 출력 매수를 낸다", () => {
  const result = sheetsPerDayFromCounters(GNM_READINGS);
  assert.equal(result.delta, 171);
  assert.equal(result.hours, 28.8);
  assert.equal(result.sheets, 143);
  assert.match(result.note ?? "", /\+171매/);
});

test("카운터 점이 하나뿐이거나 간격이 12~48시간 밖이면 계산하지 않는다", () => {
  assert.equal(sheetsPerDayFromCounters([GNM_READINGS[0]]).sheets, null);
  assert.equal(
    sheetsPerDayFromCounters([
      { capturedAt: "2026-11-24T08:00:00+09:00", cumulativePrintCount: 25_400, source: "test" },
      { capturedAt: "2026-11-24T12:00:00+09:00", cumulativePrintCount: 25_450, source: "test" },
    ]).sheets,
    null,
  );
  // 카운터가 줄면(장비 초기화·교체) 계산하지 않는다.
  assert.equal(
    sheetsPerDayFromCounters([
      { capturedAt: "2026-11-23T12:00:00+09:00", cumulativePrintCount: 25_500, source: "test" },
      { capturedAt: "2026-11-24T16:00:00+09:00", cumulativePrintCount: 25_100, source: "test" },
    ]).sheets,
    null,
  );
});

test("강남구청역점: 기기 카운터 실측으로 이번 달 프린트 매출을 역산한다", () => {
  const estimate = estimatePrintFromPaper({
    storeCode: "STORE_GNM",
    period: "2026-11",
    asOf: AS_OF,
    readings: GNM_READINGS,
  });

  assert.equal(estimate.method, "counter");
  assert.equal(estimate.sheetsPerDay, 143);
  assert.equal(estimate.elapsedDays, 30.4);
  assert.equal(estimate.pricePerSheet, 102);
  assert.equal(estimate.sheetsToDate, Math.round(143 * 30.4));
  assert.equal(estimate.revenue, Math.round((Math.round(143 * 30.4) * 102) / 1000) * 1000);
  assert.match(estimate.basis, /하루 143매/);
  assert.match(estimate.counterNote ?? "", /25,390매/);
});

test("한예종점: 카운터 두 점이 없으면 직전 정산 일평균으로 추정한다", () => {
  const estimate = estimatePrintFromPaper({ storeCode: "STORE_HYJ", period: "2026-11", asOf: AS_OF });

  assert.equal(estimate.method, "settlement-pace");
  assert.equal(estimate.revenue, Math.round((1_963_240 / 30) * 30.4 / 1000) * 1000);
  assert.equal(estimate.revenue, 1_989_000);
  assert.equal(estimate.counterNote, null);
  assert.match(estimate.settlementNote ?? "", /1,963,240원/);
});

test("근거가 하나도 없는 지점은 0원이 아니라 null로 둔다", () => {
  const estimate = estimatePrintFromPaper({ storeCode: "STORE_UNKNOWN", period: "2026-11", asOf: AS_OF });
  assert.equal(estimate.method, "none");
  assert.equal(estimate.revenue, null);
});

test("정산 전(pending) 달만 추정값으로 채우고, 확정·인쇄 없는 지점은 건드리지 않는다", () => {
  const estimate = estimatePrintFromPaper({
    storeCode: "STORE_GNM",
    period: "2026-11",
    asOf: AS_OF,
    readings: GNM_READINGS,
  });

  const nov = applyPaperPrintEstimate(monthlyForStore("STORE_GNM", "2026-11"), estimate);
  assert.equal(nov?.print.status, "estimated");
  assert.equal(nov?.print.amount, estimate.revenue);
  assert.equal(nov?.printEstimated, true);
  assert.equal(nov?.coffee.amount, 1_177_200);
  assert.equal(nov?.total, 1_177_200 + (estimate.revenue as number));

  // 10월은 이미 확정 — 추정이 덮어쓰면 안 된다.
  const oct = applyPaperPrintEstimate(monthlyForStore("STORE_GNM", "2026-10"), estimate);
  assert.equal(oct?.print.status, "final");
  assert.equal(oct?.print.amount, 500_200);
  assert.equal(oct?.printEstimated, undefined);

  // 평택점은 인쇄 메뉴가 없어 정산본 자체가 없다(missing) — 추정 금지.
  const pyeongtaek = applyPaperPrintEstimate(monthlyForStore("STORE_PTK", "2026-11"), estimate);
  assert.equal(pyeongtaek?.print.status, "missing");
  assert.equal(pyeongtaek?.print.amount, null);
});

test("추정 프린트 매출이 공헌이익 75%·예상 순이익에 그대로 합산된다", () => {
  const staticMonth = monthlyForStore("STORE_HYJ", "2026-11");
  const estimate = estimatePrintFromPaper({ storeCode: "STORE_HYJ", period: "2026-11", asOf: AS_OF });
  const month = applyPaperPrintEstimate(staticMonth, estimate);

  const before = estimateProfit({ month: staticMonth, fixedCost: { rent: 1_700_000 }, asOf: AS_OF });
  const after = estimateProfit({ month, fixedCost: { rent: 1_700_000 }, asOf: AS_OF });

  const printRevenue = estimate.revenue as number;
  assert.equal(after?.printRevenue, printRevenue);
  assert.equal(after?.printProfit, Math.round(printRevenue * 0.75));
  assert.equal(
    (after?.grossProfit as number) - (before?.grossProfit as number),
    Math.round(printRevenue * 0.75),
  );
  assert.equal(
    (after?.net as number) - (before?.net as number),
    Math.round(printRevenue * 0.75),
  );
});
