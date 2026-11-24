import assert from "node:assert/strict";
import test from "node:test";

import { monthlyForStore, type MonthlySummary } from "../src/features/sales-report/monthly";
import {
  ORDER_MODE_LABELS,
  REFERENCE_CONTRIBUTION_RATE,
  computeBepAndOrderMode,
  defaultFixedCost,
  estimateProfit,
  fixedCostTotal,
  monthlyComparison,
  previewByFixedCost,
} from "../src/features/sales-report/profit";

/**
 * 손익분기(BEP) · 동적 발주 모드 검증 — 특허 1호 종속항(이종 사업자 교차예측 → 발주).
 * 실행: npm test (tsc → node --test)
 *
 * 지켜야 할 선
 *  - 지점 하나의 월 요약만 받는다(합산 없음).
 *  - 프린트가 정산 전이면 커피만 계산하고 그 사실을 밝힌다.
 *  - BEP는 '누적 공헌이익 ≥ 월 고정비'로만 판정한다(매출 아님).
 */

const AS_OF_NOV_23 = new Date("2026-11-23T12:00:00+09:00");

function tinyMonth(): MonthlySummary {
  return {
    period: "2026-11",
    monthLabel: "11월",
    role: "이번달",
    coffee: {
      amount: 100_000,
      orders: 10,
      range: "11/1~11/10",
      status: "live",
      source: "로얄선즈",
    },
    print: {
      amount: null,
      orders: null,
      range: "11/1~",
      status: "pending",
      source: "에스칼프린트",
      note: "매월 26일 정산",
    },
    total: 100_000,
    partial: true,
    note: "커피만",
  };
}

test("BEP — 11월 강남구청역점은 새 공헌이익 기준(커피 48%)에서 월말 도달로 계산된다", () => {
  const month = monthlyForStore("STORE_GNM", "2026-11");
  assert.ok(month);

  const bep = computeBepAndOrderMode({ month, fixedCost: defaultFixedCost("STORE_GNM"), asOf: AS_OF_NOV_23, orderAmount: 217_200 });
  assert.ok(bep);

  const fixed = fixedCostTotal(defaultFixedCost("STORE_GNM"));
  const contribution = Math.round((month.coffee.amount ?? 0) * 0.48);

  assert.equal(contribution, 508_656);
  assert.equal(bep.monthDays, 30);
  assert.equal(bep.elapsedDays, 23);
  assert.equal(bep.fixedCostTotal, fixed);
  assert.equal(bep.dailyFixedCost, Math.round(fixed / 30));
  assert.equal(bep.contribution, contribution);
  // 508,656 < 658,000 — 23일 시점에는 아직 고정비를 못 넘고, 같은 속도면 30일경 도달한다.
  assert.ok(bep.progressPct > 0 && bep.progressPct < 100);
  assert.equal(bep.reached, false);
  assert.equal(bep.bepDay, 30);
  assert.match(bep.bepLabel, /예상/);
});

test("BEP — 일할 고정비 = 월 고정비 ÷ 그 달 일수, BEP 일매출 = 일할 고정비 ÷ 공헌이익률", () => {
  const month = monthlyForStore("STORE_HYJ", "2026-11");
  const fixed = defaultFixedCost("STORE_HYJ");
  const bep = computeBepAndOrderMode({ month, fixedCost: fixed, asOf: AS_OF_NOV_23 });
  assert.ok(bep);

  assert.equal(bep.dailyFixedCost, Math.round(fixedCostTotal(fixed) / 30));
  assert.ok(bep.bepDailyRevenue !== null);
  // BEP 일매출은 일할 고정비를 공헌이익률(커피만 있는 달은 48%)로 나눈 값이라 항상 더 크다.
  assert.ok((bep.bepDailyRevenue as number) > bep.dailyFixedCost);
});

test("발주 모드 — 여유 현금이 발주액을 덮으면 일괄, 못 덮으면 분할 최소", () => {
  const month = monthlyForStore("STORE_HYJ", "2026-11");
  const fixedCost = defaultFixedCost("STORE_HYJ");

  const bulk = computeBepAndOrderMode({ month, fixedCost, asOf: AS_OF_NOV_23, orderAmount: 1_072_700 });
  assert.ok(bulk);
  assert.equal(bulk.mode, "bulk");
  assert.equal(bulk.modeLabel, ORDER_MODE_LABELS.bulk);
  assert.ok((bulk.freeCashFlow ?? -1) >= 0);
  assert.match(bulk.reason, /한 번에/);

  const split = computeBepAndOrderMode({ month, fixedCost, asOf: AS_OF_NOV_23, orderAmount: 99_000_000 });
  assert.ok(split);
  assert.equal(split.mode, "split_min");
  assert.ok((split.freeCashFlow ?? 0) < 0);
  assert.match(split.reason, /나눠/);
});

test("발주 모드 — 발주 예정이 없으면 모드 없음, 매출 미수집이면 판단 보류", () => {
  const month = monthlyForStore("STORE_GNM", "2026-11");
  const fixedCost = defaultFixedCost("STORE_GNM");

  const none = computeBepAndOrderMode({ month, fixedCost, asOf: AS_OF_NOV_23, orderAmount: 0 });
  assert.ok(none);
  assert.equal(none.mode, null);
  assert.equal(none.modeLabel, "발주 없음");

  const empty = computeBepAndOrderMode({ month: null, fixedCost });
  assert.equal(empty, null);
});

test("BEP — 매출이 적은 달은 미도달로 표시하고 분할 발주를 권한다", () => {
  const month = tinyMonth();
  const fixedCost = defaultFixedCost("STORE_GNM");
  const bep = computeBepAndOrderMode({ month, fixedCost, asOf: new Date("2026-11-10T12:00:00+09:00"), orderAmount: 217_200 });
  assert.ok(bep);

  assert.equal(bep.elapsedDays, 10);
  assert.equal(bep.reached, false);
  assert.equal(bep.bepDay, null);
  assert.equal(bep.bepLabel, "이번 달 내 미도달");
  assert.ok(bep.progressPct < 100);
  assert.equal(bep.partial, true);
  assert.equal(bep.mode, "split_min");
  assert.match(bep.reason, /커피만 반영/);
});

test("월별 비교행 — 저번달(확정)과 이번달(진행 중) 두 줄, 이번달만 월말 투영값을 가진다", () => {
  const fixedCost = defaultFixedCost("STORE_HYJ");
  const rows = monthlyComparison({
    previous: estimateProfit({ month: monthlyForStore("STORE_HYJ", "2026-10"), fixedCost, asOf: AS_OF_NOV_23 }),
    current: estimateProfit({ month: monthlyForStore("STORE_HYJ", "2026-11"), fixedCost, asOf: AS_OF_NOV_23 }),
  });

  assert.equal(rows.length, 2);
  assert.match(rows[0].label, /확정/);
  assert.equal(rows[0].projectedNet, null);
  assert.match(rows[1].label, /진행 중/);
  assert.ok(rows[1].projectedNet !== null);
  assert.match(rows[1].note, /경과/);
});

test("예상 순수익 — 이번달은 월말 투영(projectedNet)을 함께 낸다", () => {
  const month = monthlyForStore("STORE_GNM", "2026-11");
  const profit = estimateProfit({ month, fixedCost: defaultFixedCost("STORE_GNM"), asOf: AS_OF_NOV_23 });
  assert.ok(profit);
  assert.ok(profit.projectedNet !== null);
  assert.ok(profit.net !== null);
  assert.ok((profit.projectedNet as number) > (profit.net as number));

  const final = estimateProfit({ month: monthlyForStore("STORE_GNM", "2026-10"), fixedCost: defaultFixedCost("STORE_GNM"), asOf: AS_OF_NOV_23 });
  assert.ok(final);
  assert.equal(final.projectedNet, final.net);
});

test("신규 매장 미리보기 — 월세만 넣어도 손익분기 매출과 예상 순수익이 나온다", () => {
  const onlyRent = previewByFixedCost({ rent: 800_000, maintenance: 0, internet: 0, solution: 0 });
  assert.equal(onlyRent.fixedTotal, 800_000);
  assert.equal(onlyRent.contributionRate, REFERENCE_CONTRIBUTION_RATE);
  assert.equal(onlyRent.bepRevenue, Math.round(800_000 / REFERENCE_CONTRIBUTION_RATE));
  assert.equal(onlyRent.referenceNet, Math.round(3_000_000 * REFERENCE_CONTRIBUTION_RATE) - 800_000);

  // 기본 세부 고정비(관리비 15만·인터넷 3.3만·솔루션 5.5만)를 더해도 계산식은 그대로.
  const withDefaults = previewByFixedCost({ rent: 800_000, maintenance: 150_000, internet: 33_000, solution: 55_000 });
  assert.equal(withDefaults.fixedTotal, 1_038_000);
  assert.ok(withDefaults.bepRevenue > onlyRent.bepRevenue);
  assert.ok(withDefaults.referenceNet < onlyRent.referenceNet);
});
