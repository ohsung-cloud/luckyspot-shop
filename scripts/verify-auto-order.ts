/**
 * 특허 1호 엔진 자동 검증.
 *
 * 실행: npx tsc … (package.json의 verify:auto-order 스크립트가 컴파일 후 실행한다)
 *
 * 검증 항목
 *  1. BOM 규칙·카탈로그 단가 일치
 *  2. 데모 시계열 결정성
 *  3. 교차 보정 계수 공식(프린트 +40% → 컵 ×1.112)
 *  4. 단측 급감 이상 감지(카페 -70% → 보류)
 *  5. 잔여일·발주 수량·상한
 *  6. 사업자/세금계산서 분기(2장, 금액 항등, 부가세 분해)
 *  7. 5분 유예 상태 전이(서명·만료·위조)
 *  8. 제안 id 결정성
 */

import { generateDemoSeries } from "../src/features/auto-order/demo-pos";
import { splitProposals } from "../src/features/auto-order/entity-split";
import { forecastStore, normalizeSales, recentRatio } from "../src/features/auto-order/forecast";
import { buildProposals } from "../src/features/auto-order/proposal";
import { resolveRules } from "../src/features/auto-order/rules";
import { graceState, issueGrace, remainingSeconds, verifyGrace } from "../src/features/auto-order/state";
import type { PosDailySales } from "../src/features/auto-order/types";
import { getProductById } from "../src/data/products";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function near(actual: number, expected: number, tolerance: number) {
  return Math.abs(actual - expected) <= tolerance;
}

function section(title: string) {
  console.log(`\n[${title}]`);
}

function syntheticSeries(input: {
  days: number;
  drinks: (index: number) => number;
  sheets: (index: number) => number;
  colorSheets?: (index: number) => number;
  storeCode?: string;
}): PosDailySales[] {
  const rows: PosDailySales[] = [];

  for (let index = 0; index < input.days; index += 1) {
    const date = new Date(Date.UTC(2026, 10, 1 + index)).toISOString().slice(0, 10);
    rows.push({
      storeCode: input.storeCode ?? "STORE_TEST",
      salesDate: date,
      drinksSold: input.drinks(index),
      printSheets: input.sheets(index),
      colorSheets: input.colorSheets ? input.colorSheets(index) : Math.round(input.sheets(index) * 0.18),
      cafeRevenue: input.drinks(index) * 2300,
      printRevenue: input.sheets(index) * 100,
    });
  }

  return rows;
}

/* ------------------------------------------------------------------ */
section("1. BOM 규칙 · 카탈로그 단가");

const rules = resolveRules();
check("규칙 8종 로드", rules.length === 8, `${rules.length}종`);

for (const rule of rules) {
  const product = getProductById(rule.sku);
  check(
    `단가 일치 ${rule.sku}`,
    Boolean(product) && product?.price === rule.unitPrice,
    product ? `${rule.unitPrice.toLocaleString("ko-KR")}원` : "카탈로그 없음",
  );
}

check(
  "점주 사업자 5종 · 본사 사업자 3종",
  rules.filter((rule) => rule.ownerEntityType === "franchisee_cafe").length === 5 &&
    rules.filter((rule) => rule.ownerEntityType === "hq_print").length === 3,
);

/* ------------------------------------------------------------------ */
section("2. 데모 시계열 결정성");

const demoA = generateDemoSeries({ scenario: "print_surge" });
const demoB = generateDemoSeries({ scenario: "print_surge" });
check("21일 생성", demoA.length === 21, `${demoA.length}일`);
check("같은 입력 → 같은 값", JSON.stringify(demoA) === JSON.stringify(demoB));
check(
  "날짜 오름차순",
  demoA.every((row, index) => index === 0 || row.salesDate > demoA[index - 1].salesDate),
);
check("마지막 날짜 2026-11-22", demoA[demoA.length - 1].salesDate === "2026-11-22");

/* ------------------------------------------------------------------ */
section("3. 교차 보정 공식");

const steady = syntheticSeries({ days: 14, drinks: () => 100, sheets: () => 100 });
const surge = syntheticSeries({
  days: 14,
  drinks: () => 100,
  // 최근 3일만 140매 (직전 7일은 100매)
  sheets: (index) => (index >= 11 ? 140 : 100),
});

const steadyRun = forecastStore({ storeCode: "STORE_TEST", storeLabel: "테스트", rows: steady, dataSource: "demo" });
const surgeRun = forecastStore({ storeCode: "STORE_TEST", storeLabel: "테스트", rows: surge, dataSource: "demo" });

const steadyCup = steadyRun.forecasts.find((item) => item.sku === "cup-plastic-16");
const surgeCup = surgeRun.forecasts.find((item) => item.sku === "cup-plastic-16");
const surgeBean = surgeRun.forecasts.find((item) => item.sku === "bean-10kg");

check("평소 교차 계수 = 1.000", Boolean(steadyCup) && near(steadyCup!.crossFactor, 1, 0.0005));
check("프린트 +40% → 컵 ×1.112", Boolean(surgeCup) && near(surgeCup!.crossFactor, 1.112, 0.001), `×${surgeCup?.crossFactor}`);
check(
  "컵 보정 후 61.16/일",
  Boolean(surgeCup) && near(surgeCup!.predictedDailyConsumption, 61.16, 0.02),
  `${surgeCup?.predictedDailyConsumption}`,
);
check(
  "원두 교차 ×1.048",
  Boolean(surgeBean) && near(surgeBean!.crossFactor, 1.048, 0.001),
  `×${surgeBean?.crossFactor}`,
);
check("교차 비율 1.4", Boolean(surgeCup) && near(surgeCup!.crossDriverRatio, 1.4, 0.001));
// 요일 효과 상쇄 — 최근 3일이 '직전 주 같은 요일'과 같으면 직전 7일 평균보다 낮아도 변화 없음으로 본다.
const weekdaySeries = Array.from({ length: 21 }, (_, index) =>
  index >= 18 || (index >= 11 && index < 14) ? 60 : 100,
);
check("요일 효과 상쇄(같은 요일 비교)", near(recentRatio(weekdaySeries), 1, 0.001), `${recentRatio(weekdaySeries).toFixed(3)}`);

check(
  "교차 한 줄 근거",
  Boolean(surgeCup) && surgeCup!.evidenceLine.includes("+40%") && surgeCup!.evidenceLine.includes("1.11"),
  surgeCup?.evidenceLine,
);

/* ------------------------------------------------------------------ */
section("4. 단측 급감 이상 감지");

const cafeDrop = syntheticSeries({
  days: 14,
  drinks: (index) => (index >= 11 ? 30 : 100),
  sheets: () => 100,
});
const cafeDropRun = forecastStore({ storeCode: "STORE_TEST", storeLabel: "테스트", rows: cafeDrop, dataSource: "demo" });
const cafeDropProposals = buildProposals(cafeDropRun);

check("이상 플래그 1건", cafeDropRun.anomalies.length === 1, cafeDropRun.anomalies[0]?.code);
check("보류 상태", cafeDropRun.hold === true);
check(
  "제안 전부 held_anomaly",
  cafeDropProposals.length > 0 && cafeDropProposals.every((proposal) => proposal.status === "held_anomaly"),
  `${cafeDropProposals.length}건`,
);

const printDrop = syntheticSeries({
  days: 14,
  drinks: () => 100,
  sheets: (index) => (index >= 11 ? 20 : 100),
});
const printDropRun = forecastStore({ storeCode: "STORE_TEST", storeLabel: "테스트", rows: printDrop, dataSource: "demo" });
check("프린트 단측 급감 감지", printDropRun.anomalies[0]?.code === "print_one_sided_collapse");

const bothDrop = syntheticSeries({
  days: 14,
  drinks: (index) => (index >= 11 ? 30 : 100),
  sheets: (index) => (index >= 11 ? 30 : 100),
});
const bothDropRun = forecastStore({ storeCode: "STORE_TEST", storeLabel: "테스트", rows: bothDrop, dataSource: "demo" });
check("양쪽 동시 급감은 이상 아님", bothDropRun.hold === false);

/* ------------------------------------------------------------------ */
section("5. 잔여일 · 발주 수량 · 상한");

const bean = surgeRun.forecasts.find((item) => item.sku === "bean-10kg")!;
check("잔여일 = 현재고 ÷ 일 소진", near(bean.remainingDays, 3300 / bean.predictedDailyConsumption, 0.06), `${bean.remainingDays}일`);
check("리드타임 안 진입 → 제안 대상", bean.due === true);
check("수량 = ceil((12일×소진 − 현재고) ÷ 10kg)", bean.suggestedQty === 2, `${bean.suggestedQty}박스`);
check("상한 3박스 이내", bean.suggestedQty <= 3);

const colorToner = surgeRun.forecasts.find((item) => item.sku === "toner-color")!;
check("컬러토너는 아직 정상", colorToner.due === false, `잔여 ${colorToner.remainingDays}일`);

const unlimited = syntheticSeries({ days: 14, drinks: () => 3000, sheets: () => 100 });
const unlimitedRun = forecastStore({ storeCode: "STORE_TEST", storeLabel: "테스트", rows: unlimited, dataSource: "demo" });
const cappedCup = unlimitedRun.forecasts.find((item) => item.sku === "cup-plastic-16")!;
check("최대 발주 상한 적용", cappedCup.suggestedQty === 6 && cappedCup.cappedByMax === true, `${cappedCup.suggestedQty}박스`);

/* ------------------------------------------------------------------ */
section("6. 사업자 · 세금계산서 분기");

const demoRun = forecastStore({
  storeCode: "STORE_YDP",
  storeLabel: "럭키스팟 영등포시장역점",
  rows: generateDemoSeries({ scenario: "print_surge" }),
  dataSource: "demo",
});
const demoProposals = buildProposals(demoRun);
const split = splitProposals({
  approvalId: "APR-TEST",
  storeCode: "STORE_YDP",
  storeLabel: "럭키스팟 영등포시장역점",
  proposals: demoProposals,
});

check("분기 전표 2장", split.slips.length === 2, split.slips.map((slip) => slip.entityType).join(" · "));
check(
  "전표 합계 = 제안 합계",
  split.totalAmount === demoProposals.reduce((sum, proposal) => sum + proposal.amount, 0),
  `${split.totalAmount.toLocaleString("ko-KR")}원`,
);
check(
  "점주 전표는 카페 소모품만",
  split.slips
    .find((slip) => slip.entityType === "franchisee_cafe")
    ?.lines.every((line) => ["bean-10kg", "cup-plastic-16", "cup-paper-16", "lid-white-16", "napkin"].includes(line.sku)) === true,
);
check(
  "본사 전표는 프린트 소모품만",
  split.slips
    .find((slip) => slip.entityType === "hq_print")
    ?.lines.every((line) => ["a4-paper", "toner-black", "toner-color"].includes(line.sku)) === true,
);
check(
  "부가세 분해 항등",
  split.slips.every((slip) => slip.supplyAmount + slip.vatAmount === slip.totalAmount),
);
check(
  "공급가액 = round(합계÷1.1)",
  split.slips.every((slip) => slip.supplyAmount === Math.round(slip.totalAmount / 1.1)),
);
check(
  "세금계산서 발행 주체 = 공급처",
  split.routing.every((route) => route.taxInvoiceIssuer === route.supplier),
);
check(
  "세금계산서 수신 = 각 사업자",
  split.slips.every((slip) => slip.suppliers.every((group) => group.taxInvoiceRecipient === slip.entityName)),
);
check(
  "점주 사업자명에 지점명",
  split.slips.find((slip) => slip.entityType === "franchisee_cafe")?.entityName.includes("영등포시장역점") === true,
);
check(
  "결제 귀속 분리",
  split.slips[0].paymentOwner !== split.slips[1].paymentOwner,
);

/* ------------------------------------------------------------------ */
section("7. 5분 유예 상태 전이");

const t0 = new Date("2026-11-23T10:00:00.000Z");
const issued = issueGrace({
  approvalId: "APR-STATE",
  storeCode: "STORE_YDP",
  storeLabel: "럭키스팟 영등포시장역점",
  proposals: demoProposals,
  now: t0,
});

check("만료 = 승인 + 300초", new Date(issued.payload.expiresAt).getTime() - t0.getTime() === 300_000);
check("서명 검증 통과", verifyGrace(issued.token)?.approvalId === "APR-STATE");
check("유예 중 표시", issued.payload.proposals.every((proposal) => proposal.status === "grace_cancel_window"));
check("t+299초: 취소 가능", graceState(issued.payload, new Date(t0.getTime() + 299_000)).expired === false);
check("t+300초: 만료", graceState(issued.payload, new Date(t0.getTime() + 300_000)).expired === true);
check("남은 초 0", remainingSeconds(issued.payload.expiresAt, new Date(t0.getTime() + 301_000)) === 0);

const tampered = `${issued.token.slice(0, -3)}AAA`;
check("위조 토큰 거부", verifyGrace(tampered) === null);
check("빈 토큰 거부", verifyGrace("") === null);
check("문자열 아닌 토큰 거부", verifyGrace(123 as unknown as string) === null);

/* ------------------------------------------------------------------ */
section("8. 제안 id 결정성 · 정렬");

const again = buildProposals(demoRun);
check("같은 데이터 → 같은 id", JSON.stringify(demoProposals.map((item) => item.id)) === JSON.stringify(again.map((item) => item.id)));
check("id 형식 AOP-XXXXXXXX", demoProposals.every((proposal) => /^AOP-[0-9A-F]{8}$/.test(proposal.id)));
check(
  "잔여일 오름차순",
  demoProposals.every((proposal, index) => index === 0 || demoProposals[index - 1].remainingDays <= proposal.remainingDays),
);
check(
  "중복 id 없음",
  new Set(demoProposals.map((proposal) => proposal.id)).size === demoProposals.length,
);

const shuffled = [...generateDemoSeries({ scenario: "print_surge" })].reverse();
const shuffledRun = forecastStore({
  storeCode: "STORE_YDP",
  storeLabel: "럭키스팟 영등포시장역점",
  rows: normalizeSales(shuffled),
  dataSource: "demo",
});
check(
  "행 순서를 뒤집어도 같은 예측",
  shuffledRun.cafeDailyAvg === demoRun.cafeDailyAvg && shuffledRun.printDailyAvg === demoRun.printDailyAvg,
);

/* ------------------------------------------------------------------ */
console.log(`\n결과: ${passed} PASS / ${failed} FAIL`);

if (failed > 0) {
  process.exitCode = 1;
}
