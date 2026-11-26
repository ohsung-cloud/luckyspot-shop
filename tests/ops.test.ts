import assert from "node:assert/strict";
import test from "node:test";

import {
  CALIBRATION_MAX,
  CALIBRATION_MIN,
  calibratedNote,
  calibrationFactors,
  nextCalibration,
  stapleCapacity,
} from "../src/features/auto-order/calibration";
import { forecastStore } from "../src/features/auto-order/forecast";
import { generateDemoSeries } from "../src/features/auto-order/demo-pos";
import {
  COFFEE_MATERIAL_RATE,
  PRINT_VARIABLE_RATE,
  defaultFixedCost,
  estimateProfit,
  fixedCostTotal,
  proratedRatio,
} from "../src/features/sales-report/profit";
import { monthlyForStore } from "../src/features/sales-report/monthly";
import { findStoreByCode, STORES, STORES_WITH_SNAPSHOT } from "../src/features/sales-report/stores";
import { storePulse } from "../src/features/sales-report/trend";
import { generatePin, hashStorePin, isValidPin, matchesStorePin, normalizePin } from "../src/features/stores/pin";
import { parseSalesCsv } from "../src/lib/vendors/generic-webhook";
import { getPrintVendorAdapter, normalizeVendorPayload, previewVendorCsv, vendorLabel } from "../src/lib/vendors";

/**
 * 점주 OS 4대 고도화 검증 — 실마진 · 교체완료 학습 · 멀티벤더 · PIN/PWA.
 * 실행: npm test (tsc → node --test)
 */

/* ------------------------------------------------------------------ */
/* 1) 실마진                                                           */
/* ------------------------------------------------------------------ */

test("예상 순수익 — 커피 공헌이익 78% · 프린트 공헌이익 75% · 고정비 차감", () => {
  const month = monthlyForStore("STORE_GNM", "2026-10");
  assert.ok(month);

  const profit = estimateProfit({ month, fixedCost: defaultFixedCost("STORE_GNM"), asOf: new Date("2026-11-23T12:00:00+09:00") });
  assert.ok(profit);

  const coffee = (month.coffee.amount ?? 0) * (1 - COFFEE_MATERIAL_RATE);
  const print = (month.print.amount ?? 0) * (1 - PRINT_VARIABLE_RATE);
  const fixed = fixedCostTotal(defaultFixedCost("STORE_GNM"));

  assert.equal(profit.coffeeProfit, Math.round(coffee));
  assert.equal(profit.printProfit, Math.round(print));
  assert.equal(profit.fixedCostApplied, fixed); // 저번달(확정)은 전액
  assert.equal(profit.net, Math.round(coffee) + Math.round(print) - fixed);
  // 강남구청역점은 실제 월세 170만(월 고정비 1,908,000)이라 10월은 마이너스 순수익이다.
  // 마진율은 순수익 ÷ 매출 — 부호가 있어도 그대로 계산된다.
  assert.equal(
    Math.round((profit.marginRate ?? 0) * 10) / 10,
    Math.round(((profit.net ?? 0) / (month.total ?? 1)) * 1000) / 10,
  );
});

test("예상 순수익 — 한예종점 10월은 실제 월세 170만 기준에서 4,242,352원 · 마진 52.6%", () => {
  // 커피 6,099,900 × 78% + 프린트 1,963,240 × 75% − 월 고정비 1,988,000 = 4,242,352
  // (월 고정비: 임대료 170만 + 관리비 20만 + 인터넷 3.3만 + 솔루션 5.5만)
  const month = monthlyForStore("STORE_HYJ", "2026-10");
  assert.ok(month);

  const profit = estimateProfit({
    month,
    fixedCost: defaultFixedCost("STORE_HYJ"),
    asOf: new Date("2026-11-25T00:20:00+09:00"),
  });
  assert.ok(profit);

  assert.equal(profit.coffeeProfit, Math.round(6_099_900 * 0.78));
  assert.equal(profit.printProfit, Math.round(1_963_240 * 0.75));
  assert.equal(profit.fixedCostApplied, 1_988_000);
  assert.equal(profit.net, 4_242_352);
  // 4,242,352 / 8,063,140 = 52.6141% — 소수 첫째 자리에서 반올림해 52.6%로 표시된다.
  assert.equal(Math.round((profit.marginRate ?? 0) * 10) / 10, 52.6);
});

test("이번달은 고정비를 경과일만큼만 반영한다", () => {
  const month = monthlyForStore("STORE_GNM", "2026-11");
  assert.ok(month);

  const profit = estimateProfit({ month, fixedCost: defaultFixedCost("STORE_GNM"), asOf: new Date("2026-11-23T12:00:00+09:00") });
  assert.ok(profit);
  assert.ok(profit.prorated);
  assert.equal(profit.fixedCostApplied, Math.round(fixedCostTotal(defaultFixedCost("STORE_GNM")) * (23 / 30)));
  assert.equal(Math.round(proratedRatio("2026-11", new Date("2026-11-30T12:00:00+09:00")) * 100), 100);
  assert.equal(proratedRatio("2026-10", new Date("2026-11-23T12:00:00+09:00")), 1);
});

test("프린트가 정산 전이면 커피만으로 계산하고 부분값임을 밝힌다", () => {
  const month = monthlyForStore("STORE_GNM", "2026-11");
  const profit = estimateProfit({ month, fixedCost: defaultFixedCost("STORE_GNM") });
  assert.ok(profit);
  assert.equal(profit.printProfit, null);
  assert.equal(profit.partial, true);
  assert.match(profit.note, /프린트/);
});

test("한예종점 10·11월 커피는 로얄선즈 실측값으로 채워진다", () => {
  // 2026-11-24 로얄선즈 판매정보 직접 조회: 10/1~10/31 1,813건 6,099,900원
  const oct = monthlyForStore("STORE_HYJ", "2026-10");
  assert.ok(oct);
  assert.equal(oct.coffee.amount, 6_099_900);
  assert.equal(oct.coffee.orders, 1_813);
  assert.equal(oct.coffee.status, "final");
  assert.equal(oct.total, 6_099_900 + 1_963_240);
  assert.equal(oct.partial, false);

  // 11/1~11/26 4,493,800원(2026-11-26 16:08 기준) — 프린트는 26일 정산 전이라 부분값.
  // 건수는 1,242건이 11/1~11/24 실측이라 11/26 범위에 늘려 적지 않고 비워 둔다.
  const nov = monthlyForStore("STORE_HYJ", "2026-11");
  assert.ok(nov);
  assert.equal(nov.coffee.amount, 4_493_800);
  assert.equal(nov.coffee.orders, null);
  assert.equal(nov.coffee.range, "11/1~11/26");
  assert.equal(nov.total, 4_493_800);
  assert.equal(nov.partial, true);
});

test("영등포시장역점·선유로점 11월 매출은 11-26 포털 실측으로 채워진다", () => {
  // 메일빈(휴니크) 관리자웹 2026-11-26 22:35 — 당월 매출 931,200원, 건별 362건.
  const ydp = monthlyForStore("STORE_YDP", "2026-11");
  assert.ok(ydp);
  assert.equal(ydp.coffee.amount, 931_200);
  assert.equal(ydp.coffee.orders, 362);
  assert.equal(ydp.coffee.range, "11/1~11/26");
  assert.equal(ydp.total, 931_200);
  // 프린트 2대는 에스칼프린트 계정 미연결 — 0원이 아니라 미확보(null).
  assert.equal(ydp.print.amount, null);
  assert.equal(ydp.print.status, "missing");
  assert.equal(ydp.partial, true);

  // 10월은 개점 첫 달 — 6개월 월별 매출에서 9월까지 0원이었다.
  const ydpOct = monthlyForStore("STORE_YDP", "2026-10");
  assert.ok(ydpOct);
  assert.equal(ydpOct.coffee.amount, 274_000);
  assert.equal(ydpOct.print.amount, null);

  // 유로커피 VCMS 2026-11-26 22:37 — 이번달 1,810,709원(마일리지 26,591P).
  const syu = monthlyForStore("STORE_SYU", "2026-11");
  assert.ok(syu);
  assert.equal(syu.coffee.amount, 1_810_709);
  assert.equal(syu.total, 1_810_709);
  // 인쇄 메뉴가 없는 매장이라 프린트가 '빠진' 것이 아니다 — 부분 집계로 표시하지 않는다.
  assert.equal(syu.print.amount, null);
  assert.equal(syu.print.status, "missing");
  assert.equal(syu.partial, false);

  const syuOct = monthlyForStore("STORE_SYU", "2026-10");
  assert.ok(syuOct);
  assert.equal(syuOct.coffee.amount, 2_463_907);
  assert.equal(syuOct.partial, false);
});

test("영등포·선유로 예상 순수익 — 등록된 월세(80만·70만)로 고정비를 빼고 계산한다", () => {
  const asOf = new Date("2026-11-26T22:40:00+09:00");
  // 영등포: 931,200 × 78% = 726,336 − (800,000 × 26/30 = 693,333) = 33,003
  const ydp = estimateProfit({ month: monthlyForStore("STORE_YDP", "2026-11"), fixedCost: defaultFixedCost("STORE_YDP"), asOf });
  assert.ok(ydp);
  assert.equal(ydp.coffeeProfit, 726_336);
  assert.equal(ydp.printProfit, null);
  assert.equal(ydp.fixedCostTotal, 800_000);
  assert.equal(ydp.fixedCostApplied, 693_333);
  assert.equal(ydp.net, 33_003);

  // 선유로: 1,810,709 × 78% = 1,412,353 − (700,000 × 26/30 = 606,667) = 805,686
  const syu = estimateProfit({ month: monthlyForStore("STORE_SYU", "2026-11"), fixedCost: defaultFixedCost("STORE_SYU"), asOf });
  assert.ok(syu);
  assert.equal(syu.coffeeProfit, 1_412_353);
  assert.equal(syu.fixedCostApplied, 606_667);
  assert.equal(syu.net, 805_686);
});

/* ------------------------------------------------------------------ */
/* 2) 교체완료 학습                                                    */
/* ------------------------------------------------------------------ */

test("교체완료 — 첫 교체는 계수를 바꾸지 않고 기준점만 남긴다", () => {
  const entry = nextCalibration({
    sku: "bean-10kg",
    previous: null,
    replacedAt: "2026-11-23T09:00:00+09:00",
    fullCapacity: 10_000,
    predictedDailyConsumption: 800,
  });

  assert.equal(entry.factor, 1);
  assert.equal(entry.samples, 0);
  assert.equal(entry.fullCapacity, 10_000);
  assert.equal(stapleCapacity("bean-10kg"), 10_000);
});

test("교체완료 — 실제 간격이 예측보다 길면 소진을 느리게(계수 ↑) 학습한다", () => {
  const previous = nextCalibration({
    sku: "bean-10kg",
    previous: null,
    replacedAt: "2026-11-01T09:00:00+09:00",
    fullCapacity: 10_000,
    predictedDailyConsumption: 1000, // 예측: 10일
  });

  const next = nextCalibration({
    sku: "bean-10kg",
    previous,
    replacedAt: "2026-11-13T09:00:00+09:00", // 실제 12일
    fullCapacity: 10_000,
    predictedDailyConsumption: 1000,
  });

  // 관측 1.2 → 0.5 가중 → (1 + 1.2)/2 = 1.1
  assert.ok(next.factor > 1);
  assert.ok(next.factor <= CALIBRATION_MAX);
  assert.equal(next.samples, 1);
  assert.match(next.note, /12.0일/);
});

test("교체완료 — 한 번의 이상한 교체가 계수를 0.85~1.25 밖으로 밀지 않는다", () => {
  const base = nextCalibration({
    sku: "a4-paper",
    previous: null,
    replacedAt: "2026-11-01T00:00:00+09:00",
    fullCapacity: 1100,
    predictedDailyConsumption: 100,
  });

  const extreme = nextCalibration({
    sku: "a4-paper",
    previous: { ...base, factor: 1.24 },
    replacedAt: "2026-11-20T00:00:00+09:00", // 19일 (예측 11일 → 1.7배)
    fullCapacity: 1100,
    predictedDailyConsumption: 100,
  });

  assert.ok(extreme.factor <= CALIBRATION_MAX);
  assert.ok(extreme.factor >= CALIBRATION_MIN);

  const tooShort = nextCalibration({
    sku: "a4-paper",
    previous: base,
    replacedAt: "2026-11-01T06:00:00+09:00",
    fullCapacity: 1100,
    predictedDailyConsumption: 100,
  });
  assert.equal(tooShort.factor, 1);
  assert.match(tooShort.note, /제외/);
});

test("교체완료 — 학습 계수가 예측 잔여일에 바로 적용된다", () => {
  const rows = generateDemoSeries({ storeCode: "STORE_TEST", scenario: "normal", days: 21 });
  const plain = forecastStore({ storeCode: "STORE_TEST", storeLabel: "테스트", rows, dataSource: "demo" });
  const beanPlain = plain.forecasts.find((item) => item.sku === "bean-10kg");
  assert.ok(beanPlain);

  const entry = {
    sku: "bean-10kg",
    lastReplacedAt: "2026-11-01T09:00:00+09:00",
    previousReplacedAt: null,
    factor: 1.2,
    samples: 1,
    fullCapacity: 10_000,
    note: "",
  };

  const calibrated = forecastStore({
    storeCode: "STORE_TEST",
    storeLabel: "테스트",
    rows,
    dataSource: "demo",
    calibration: { "bean-10kg": entry },
    now: new Date("2026-11-23T12:00:00+09:00"),
  });
  const beanCalibrated = calibrated.forecasts.find((item) => item.sku === "bean-10kg");
  assert.ok(beanCalibrated);

  assert.equal(beanCalibrated.calibrationFactor, 1.2);
  // 소진을 1.2배로 잡으므로 잔여일은 짧아진다.
  assert.ok(beanCalibrated.remainingDays < beanPlain.remainingDays);
  assert.deepEqual(calibrationFactors({ "bean-10kg": entry }), { "bean-10kg": 1.2 });
  assert.match(calibratedNote(entry) ?? "", /학습 1\.20x/);
});

test("교체완료 직후 24시간은 잔량을 가득으로 되돌린다", () => {
  const rows = generateDemoSeries({ storeCode: "STORE_TEST", scenario: "normal", days: 21 });
  const entry = {
    sku: "bean-10kg",
    lastReplacedAt: "2026-11-23T09:00:00+09:00",
    previousReplacedAt: null,
    factor: 1,
    samples: 0,
    fullCapacity: 10_000,
    note: "",
  };

  const run = forecastStore({
    storeCode: "STORE_TEST",
    storeLabel: "테스트",
    rows,
    dataSource: "demo",
    calibration: { "bean-10kg": entry },
    now: new Date("2026-11-23T18:00:00+09:00"),
  });
  const bean = run.forecasts.find((item) => item.sku === "bean-10kg");
  assert.ok(bean);
  assert.equal(bean.stockOnHand, 10_000);
});

/* ------------------------------------------------------------------ */
/* 3) 멀티벤더 어댑터                                                  */
/* ------------------------------------------------------------------ */

test("벤더 레지스트리 — 세 벤더를 고르고 라벨을 돌려준다", () => {
  assert.equal(getPrintVendorAdapter("escalprint").id, "escalprint");
  assert.equal(getPrintVendorAdapter("yupisoft").id, "yupisoft");
  assert.equal(getPrintVendorAdapter("generic_webhook").id, "generic_webhook");
  assert.equal(getPrintVendorAdapter("unknown").id, "escalprint");
  assert.equal(vendorLabel("yupisoft"), "유피소프트");
  assert.equal(vendorLabel("generic_webhook"), "타사 복합기(공용)");
});

test("타사 공용 표준 JSON — 장비 %·매출을 표준 스냅샷으로 바꾼다", () => {
  const { snapshot, vendor } = normalizeVendorPayload({
    vendor: "generic_webhook",
    storeCode: "STORE_X",
    raw: {
      vendor: "generic_webhook",
      capturedAt: "2026-11-23T15:00:00+09:00",
      device: { model: "MFP-900", cumulativePrintCount: 1234567 },
      consumables: [
        { sku: "toner-black", levelPct: 62 },
        { sku: "toner-c", level: 0.41 },
        { sku: "a4-paper", levelPct: 38 },
      ],
      sales: { date: "2026-11-23", printRevenue: 250000, printSheets: 1200, colorSheets: 90 },
    },
  });

  assert.equal(vendor, "generic_webhook");
  assert.ok(snapshot);
  assert.equal(snapshot.telemetry?.source, "generic_webhook");
  assert.equal(snapshot.telemetry?.tonerKPct, 62);
  assert.equal(snapshot.telemetry?.tonerCPct, 41); // 0.41 → 41%
  assert.equal(snapshot.telemetry?.tray1Pct, 38);
  assert.equal(snapshot.patch.printRevenue, 250000);
  assert.equal(snapshot.patch.printSheets, 1200);
  assert.equal(snapshot.salesDate, "2026-11-23");
});

test("유피소프트 스키마 — 급지함·소모품 레벨을 읽는다", () => {
  const { snapshot, vendor } = normalizeVendorPayload({
    storeCode: "STORE_Y",
    raw: {
      yupisoft: {
        capturedAt: "2026-11-23T15:00:00+09:00",
        machine: { model: "YP-1", counterTotal: 5000, online: true, errors: [] },
        supplies: [{ code: "K", level: 70 }, { code: "C", level: 55 }],
        trays: [{ name: "Tray1", level: 35 }, { name: "Tray2", level: 45 }],
        sales: { day: "2026-11-23", amount: 100000, prints: 800, colorPrints: 40, month: "2026-11", monthAmount: 2100000 },
      },
    },
  });

  assert.equal(vendor, "yupisoft");
  assert.equal(snapshot?.telemetry?.tonerKPct, 70);
  assert.equal(snapshot?.telemetry?.tray1Pct, 35);
  assert.equal(snapshot?.revenues.find((row) => row.scope === "month")?.netAmount, 2100000);
});

test("CSV 미리보기 — 열 이름을 알아보고, 날짜가 틀린 행은 건너뛴다", () => {
  const csv = [
    "날짜,커피매출,음료잔수,프린트매출,출력매수,컬러매수",
    "2026-11-21,120000,30,240000,1100,80",
    "2026.11.22,130000,32,250000,1200,90",
    "엉뚱한날짜,1,1,1,1,1",
  ].join("\n");

  const result = parseSalesCsv(csv, { storeCode: "STORE_CSV" });
  assert.equal(result.accepted, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.rows[0].salesDate, "2026-11-21");
  assert.equal(result.rows[1].salesDate, "2026-11-22");
  assert.equal(result.rows[1].printRevenue, 250000);
  assert.equal(result.rows[1].cafeReported, true);
  assert.ok(result.warnings.some((warning) => warning.includes("건너뛰었습니다")));
});

test("CSV 미리보기 — 에스칼프린트 벤더는 CSV를 받지 않는다", () => {
  const result = previewVendorCsv({ vendor: "escalprint", storeCode: "STORE_GNM", csv: "date,printRevenue\n2026-11-22,1" });
  assert.equal(result.accepted, 0);
  assert.match(result.warnings[0], /CSV/);
});

/* ------------------------------------------------------------------ */
/* 4) PIN · PWA                                                        */
/* ------------------------------------------------------------------ */

test("PIN — 4자리만 받고, 해시는 지점마다 다르며 원문을 담지 않는다", () => {
  assert.equal(normalizePin("12-34"), "1234");
  assert.ok(isValidPin("0000"));
  assert.ok(!isValidPin("123"));
  assert.ok(!isValidPin("12345"));

  const pin = generatePin();
  assert.match(pin, /^\d{4}$/);

  const hashA = hashStorePin("STORE_GNM", "0000");
  const hashB = hashStorePin("STORE_HYJ", "0000");
  assert.notEqual(hashA, hashB);
  assert.ok(!hashA.includes("0000"));
  assert.ok(matchesStorePin(hashA, "STORE_GNM", "0000"));
  assert.ok(!matchesStorePin(hashA, "STORE_GNM", "1111"));
  assert.ok(!matchesStorePin(null, "STORE_GNM", "0000"));
  assert.equal(hashA, "a496ce652cf88d82ba5585fe7f1a60695599a2558e14fc7b3eedbd7de9ae5e31");
});

/* ------------------------------------------------------------------ */
/* 5) 매출 펄스(일간·주간·월간)                                        */
/* ------------------------------------------------------------------ */

test("주간 막대 — 강남구청역점은 포털 판매정보 실측 7일을 쓴다", () => {
  const pulse = storePulse({ code: "STORE_GNM", asOf: "2026-11-26", dailyRate: 25100 });
  assert.equal(pulse.daily.length, 7);
  assert.equal(pulse.dailySource, "measured");
  assert.equal(pulse.daily[0].date, "2026-11-20");
  assert.equal(pulse.daily[6].total, 25_100);
  assert.equal(pulse.dailyAverage, 38_986);

  assert.ok(pulse.hourly);
  assert.equal(pulse.hourlyTotal, 33_500);
  assert.equal(pulse.hourly?.[0].amount, 6_800);
  assert.equal(Math.round(pulse.hourly?.[2].share ?? 0), 30);
});

test("주간 막대 — 실측이 없는 지점은 추정임을 밝히고 시간대는 비워 둔다", () => {
  const pulse = storePulse({ code: "STORE_HYJ", asOf: "2026-11-23", dailyRate: 173235 });
  assert.equal(pulse.dailySource, "estimated");
  assert.equal(pulse.daily[6].total, 173235);
  assert.equal(pulse.hourly, null);
  assert.match(pulse.hourlyNote, /수집/);

  const empty = storePulse({ code: "STORE_NEW", asOf: "2026-11-23", dailyRate: null });
  assert.equal(empty.dailySource, "none");
});

test("주간 막대 — 영등포·선유로는 각 포털 대시보드 실측 7일을 쓴다", () => {
  const ydp = storePulse({ code: "STORE_YDP", asOf: "2026-11-26", dailyRate: null });
  assert.equal(ydp.dailySource, "measured");
  assert.equal(ydp.daily[0].date, "2026-11-20");
  assert.equal(ydp.daily[6].total, 18_800);
  assert.equal(ydp.dailyAverage, 31_471);
  assert.match(ydp.dailyNote, /메일빈/);
  assert.equal(ydp.hourly, null);

  const syu = storePulse({ code: "STORE_SYU", asOf: "2026-11-26", dailyRate: null });
  assert.equal(syu.dailySource, "measured");
  assert.equal(syu.daily[1].total, 115_674);
  assert.equal(syu.dailyAverage, 63_339);
  assert.equal(syu.hourly, null);

  // 10월을 보는 화면에서는 11월 막대를 그리지 않고 월 일평균으로 추정한다.
  const october = storePulse({ code: "STORE_SYU", asOf: "2026-10-31", dailyRate: 79_481 });
  assert.equal(october.dailySource, "estimated");
});

test("지점 탭 — 매출 리포트는 5개 지점을 싣고, 재고 스냅샷이 있는 지점만 비교에 놓는다", () => {
  assert.deepEqual(
    STORES.map((store) => store.code),
    ["STORE_GNM", "STORE_HYJ", "STORE_PTK", "STORE_YDP", "STORE_SYU"],
  );
  assert.deepEqual(
    STORES_WITH_SNAPSHOT.map((store) => store.code),
    ["STORE_GNM", "STORE_HYJ"],
  );
  // 새 지점은 스냅샷 대신 '마지막 조회 시각'을 남긴다 — 오래된 값을 오늘 값으로 읽지 않게.
  assert.equal(findStoreByCode("STORE_YDP")?.snapshot, null);
  assert.equal(findStoreByCode("STORE_YDP")?.latestReadAt, "2026-11-26T22:35:00+09:00");
  assert.equal(findStoreByCode("STORE_SYU")?.latestReadAt, "2026-11-26T22:37:00+09:00");
});
