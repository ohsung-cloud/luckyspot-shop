import assert from "node:assert/strict";
import test from "node:test";

import { generateDemoSeries } from "../src/features/auto-order/demo-pos";
import { splitProposals } from "../src/features/auto-order/entity-split";
import { forecastStore } from "../src/features/auto-order/forecast";
import { buildProposals } from "../src/features/auto-order/proposal";
import { GRACE_SECONDS, issueGrace, remainingSeconds, verifyGrace } from "../src/features/auto-order/state";

/**
 * 특허 1호 엔진 회귀 검증 — 3종(원두·토너·용지) 교차예측과 사업자 분리.
 */

function series(options: { printSurge?: number; cafeDrop?: boolean } = {}) {
  return generateDemoSeries({
    storeCode: "STORE_TEST",
    cafeBase: 88,
    printBase: 128,
    scenario: options.cafeDrop ? "cafe_drop" : options.printSurge ? "print_surge" : "normal",
    printSurge: options.printSurge ?? 0,
    cafeDrop: options.cafeDrop ? 0.3 : 1,
    days: 21,
  });
}

test("프린트 급증은 원두·컵 소진을 교차 보정한다(±40% 상한)", () => {
  const normal = forecastStore({ storeCode: "STORE_TEST", storeLabel: "테스트", rows: series(), dataSource: "demo" });
  const surge = forecastStore({
    storeCode: "STORE_TEST",
    storeLabel: "테스트",
    rows: series({ printSurge: 0.35 }),
    dataSource: "demo",
  });

  const cupNormal = normal.forecasts.find((item) => item.sku === "cup-plastic-16");
  const cupSurge = surge.forecasts.find((item) => item.sku === "cup-plastic-16");
  const beanNormal = normal.forecasts.find((item) => item.sku === "bean-10kg");
  const beanSurge = surge.forecasts.find((item) => item.sku === "bean-10kg");

  assert.ok(cupNormal && cupSurge && beanNormal && beanSurge);
  assert.ok(cupSurge.crossFactor > cupNormal.crossFactor);
  assert.ok(cupSurge.crossFactor <= 1.4);
  assert.ok(beanSurge.crossFactor > 1);
  assert.ok(Math.abs(beanSurge.crossFactor - 1) < Math.abs(cupSurge.crossFactor - 1));
});

test("카페 단측 급감은 발주를 보류한다(held_anomaly)", () => {
  const run = forecastStore({
    storeCode: "STORE_TEST",
    storeLabel: "테스트",
    rows: series({ cafeDrop: true }),
    dataSource: "demo",
  });

  assert.equal(run.hold, true);
  assert.equal(run.anomalies[0]?.code, "cafe_one_sided_collapse");

  const proposals = buildProposals(run);
  assert.ok(proposals.length === 0 || proposals.every((proposal) => proposal.status === "held_anomaly"));
});

test("3종(원두·토너·용지)은 항상 예측 대상이고 잔여일·발주량이 계산된다", () => {
  const run = forecastStore({ storeCode: "STORE_TEST", storeLabel: "테스트", rows: series(), dataSource: "demo" });

  for (const sku of ["bean-10kg", "toner-black", "a4-paper"]) {
    const forecast = run.forecasts.find((item) => item.sku === sku);
    assert.ok(forecast, `${sku} 예측 누락`);
    assert.ok(forecast.predictedDailyConsumption > 0);
    assert.ok(Number.isFinite(forecast.remainingDays));
    assert.ok(forecast.evidenceLine.length > 0);
  }
});

test("사업자 분리 — 점주(카페)와 본사(프린트) 전표가 각각 생기고 금액이 맞는다", () => {
  const run = forecastStore({ storeCode: "STORE_TEST", storeLabel: "럭키스팟 테스트점", rows: series(), dataSource: "demo" });
  const proposals = buildProposals(run);

  // 발주 대상이 없으면 인위적으로 3종 제안을 만든다(수량·단가는 예측값).
  const items = proposals.length > 0
    ? proposals
    : ["bean-10kg", "toner-black", "a4-paper"].map((sku) => {
        const forecast = run.forecasts.find((item) => item.sku === sku);
        assert.ok(forecast);
        return {
          id: `T-${sku}`,
          storeCode: run.storeCode,
          storeLabel: run.storeLabel,
          sku,
          name: forecast.name,
          spec: forecast.spec,
          ownerEntityType: forecast.ownerEntityType,
          quantity: 1,
          packLabel: forecast.packLabel,
          unitPrice: forecast.unitPrice,
          amount: forecast.unitPrice,
          supplier: forecast.supplier,
          remainingDays: forecast.remainingDays,
          leadTimeDays: forecast.leadTimeDays,
          safetyStockDays: forecast.safetyStockDays,
          crossFactor: forecast.crossFactor,
          evidenceLine: forecast.evidenceLine,
          status: "pending_approval" as const,
          reason: "테스트",
          createdAt: new Date().toISOString(),
        };
      });

  const split = splitProposals({ approvalId: "APR-TEST", storeCode: run.storeCode, storeLabel: run.storeLabel, proposals: items });

  assert.ok(split.slips.length >= 1);
  const sum = split.slips.reduce((total, slip) => total + slip.totalAmount, 0);
  assert.equal(sum, split.totalAmount);

  for (const slip of split.slips) {
    assert.equal(slip.supplyAmount + slip.vatAmount, slip.totalAmount);
    assert.ok(slip.entityName.includes(slip.entityType === "hq_print" ? "럭키스팟" : "점주 사업자"));
    for (const group of slip.suppliers) {
      assert.equal(group.taxInvoiceIssuer, group.supplier);
      assert.equal(group.taxInvoiceRecipient, slip.entityName);
    }
  }
});

test("5분 취소 유예 — 서명 토큰은 위조·만료를 구분한다", () => {
  const run = forecastStore({ storeCode: "STORE_TEST", storeLabel: "테스트", rows: series(), dataSource: "demo" });
  const proposals = buildProposals(run);
  const now = new Date("2026-11-23T12:00:00Z");

  const { payload, token } = issueGrace({
    approvalId: "APR-TEST",
    storeCode: run.storeCode,
    storeLabel: run.storeLabel,
    proposals,
    now,
  });

  assert.equal(remainingSeconds(payload.expiresAt, now), GRACE_SECONDS);
  assert.equal(remainingSeconds(payload.expiresAt, new Date(now.getTime() + GRACE_SECONDS * 1000)), 0);

  const verified = verifyGrace(token);
  assert.ok(verified);
  assert.equal(verified?.approvalId, "APR-TEST");

  const [body, signature] = token.split(".");
  const tampered = `${body.slice(0, -2)}AA.${signature}`;
  assert.equal(verifyGrace(tampered), null);
  assert.equal(verifyGrace("not-a-token"), null);
});
