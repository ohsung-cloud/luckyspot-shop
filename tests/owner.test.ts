import assert from "node:assert/strict";
import test from "node:test";

import type { SkuForecast } from "../src/features/auto-order/types";
import { buildOwnerStock, emptyOnLabel, recommendedCartLines } from "../src/features/owner/stock";
import { DEFAULT_FIXED_COST, defaultFixedCost, fixedCostTotal } from "../src/features/sales-report/profit";
import {
  hashStorePassword,
  isValidLoginId,
  isValidPassword,
  normalizeLoginId,
  seedCodeForLoginId,
  seedGroupCodesForLoginId,
} from "../src/features/stores/login-id";
import { SEED_LOGINS } from "../src/features/stores/seed-logins";
import { issueOwnerToken, verifyOwnerToken } from "../src/features/stores/owner-session";

/**
 * /owner 점주 통합 포털의 계산 — 재고 카드·세션·지점별 실제 월세.
 *
 * 실행: npm test (tsc → node --test)
 */

function forecast(patch: Partial<SkuForecast> & { sku: string }): SkuForecast {
  return {
    sku: patch.sku,
    name: patch.name ?? patch.sku,
    spec: patch.spec ?? "1박스",
    ownerEntityType: patch.ownerEntityType ?? "franchisee_cafe",
    primaryDomain: patch.primaryDomain ?? "cafe",
    supplier: patch.supplier ?? "본사",
    baseDailyConsumption: patch.baseDailyConsumption ?? 100,
    crossFactor: patch.crossFactor ?? 1,
    crossDriverRatio: patch.crossDriverRatio ?? 1,
    predictedDailyConsumption: patch.predictedDailyConsumption ?? 100,
    stockOnHand: patch.stockOnHand ?? 1_000,
    stockUnit: patch.stockUnit ?? "g",
    remainingDays: patch.remainingDays ?? 10,
    leadTimeDays: patch.leadTimeDays ?? 2,
    safetyStockDays: patch.safetyStockDays ?? 3,
    reorderPointDays: patch.reorderPointDays ?? 5,
    due: patch.due ?? false,
    suggestedQty: patch.suggestedQty ?? 1,
    cappedByMax: patch.cappedByMax ?? false,
    packLabel: patch.packLabel ?? "1박스(10kg)",
    unitPrice: patch.unitPrice ?? 200_000,
    amount: patch.amount ?? 200_000,
    confidence: patch.confidence ?? 0.8,
    stockSource: patch.stockSource ?? "manual",
    stockNote: patch.stockNote,
    evidenceLine: patch.evidenceLine ?? "",
  };
}

test("지점별 실제 월세(2026-11 확인)가 고정비 기본값에 들어 있다", () => {
  assert.equal(DEFAULT_FIXED_COST.STORE_HYJ.rent, 1_700_000);
  assert.equal(DEFAULT_FIXED_COST.STORE_GNM.rent, 1_700_000);
  assert.equal(DEFAULT_FIXED_COST.STORE_PTK.rent, 300_000);
  assert.equal(DEFAULT_FIXED_COST.STORE_CJ.rent, 300_000);
  assert.equal(DEFAULT_FIXED_COST.STORE_SYU.rent, 700_000);
  assert.equal(DEFAULT_FIXED_COST.STORE_YDP.rent, 800_000);

  // 한예종점: 임대료 170만 + 관리비 20만 + 인터넷 3.3만 + 솔루션 5.5만
  assert.equal(fixedCostTotal(defaultFixedCost("STORE_HYJ")), 1_988_000);
  // 평택점은 임대료만 확인됨
  assert.equal(fixedCostTotal(defaultFixedCost("STORE_PTK")), 300_000);
});

test("재고 카드 — 원두·용지가 앞에 서고, 부족한 품목만 추천 수량으로 담긴다", () => {
  const view = buildOwnerStock({
    asOfDate: "2026-11-22",
    thresholds: { beanDays: 4, tonerDays: 5, paperDays: 4 },
    forecasts: [
      forecast({ sku: "bean-10kg", remainingDays: 1.8, stockOnHand: 1_400, due: true, suggestedQty: 1, stockUnit: "g" }),
      forecast({ sku: "a4-paper", remainingDays: 12, stockOnHand: 3_000, due: false, suggestedQty: 0, stockUnit: "매", unitPrice: 23_000 }),
      forecast({ sku: "toner-black", remainingDays: 4.3, due: true, suggestedQty: 1, stockUnit: "g", unitPrice: 99_800 }),
    ],
  });

  assert.deepEqual(
    view.core.map((item) => item.sku),
    ["bean-10kg", "a4-paper"],
  );

  const bean = view.core[0];
  assert.equal(bean.status, "out"); // 4일 기준의 절반(2일) 이하
  assert.equal(bean.daysText, "1.8일");
  assert.equal(bean.suggestedQty, 1);
  assert.equal(bean.emptyOnText, "11/23"); // 11/22 + 1.8일 → 11/23

  const paper = view.core[1];
  assert.equal(paper.status, "ok");
  assert.equal(paper.daysText, "12일");

  // 용지는 넉넉하지만(담기 버튼은 있음), 자동으로 담기는 건 부족한 품목만
  assert.deepEqual(recommendedCartLines(view), [
    { id: "bean-10kg", quantity: 1 },
    { id: "toner-black", quantity: 1 },
  ]);
  assert.equal(view.shortCount, 2);
});

test("재고 0이면 '곧 없어요'이고, 예측이 없으면 0으로 채우지 않고 '수집 전'이다", () => {
  const view = buildOwnerStock({
    asOfDate: "2026-11-22",
    thresholds: { beanDays: 4, tonerDays: 5, paperDays: 4 },
    forecasts: [forecast({ sku: "bean-10kg", stockOnHand: 0, remainingDays: 0, due: true })],
  });

  assert.equal(view.core[0].status, "out");
  assert.equal(view.core[0].stockText, "0g");

  const paper = view.core[1];
  assert.equal(paper.status, "unknown");
  assert.equal(paper.stockText, "—");
  assert.equal(paper.daysText, "—");
  assert.ok(!recommendedCartLines(view).some((line) => line.id === "a4-paper"));
});

test("소진 예상일은 기준일 + 남은 일수로 계산한다", () => {
  assert.equal(emptyOnLabel("2026-11-22", 4.2), "11/26");
  assert.equal(emptyOnLabel("2026-11-30", 2), "12/2");
  assert.equal(emptyOnLabel("", 3), null);
  assert.equal(emptyOnLabel("2026-11-22", null), null);
});

test("점주 로그인 — 지점별 아이디와 초기 비밀번호(123456) 해시가 맞는다", () => {
  assert.equal(SEED_LOGINS.STORE_HYJ.loginId, "luckyspot-hyj");
  assert.equal(SEED_LOGINS.STORE_CJ.loginId, "luckyspot98");
  assert.equal(SEED_LOGINS.STORE_PTK.loginId, "luckyspot5");
  assert.equal(SEED_LOGINS.STORE_GNM.loginId, "luckyspot-gangnam");
  assert.equal(SEED_LOGINS.STORE_YDP.loginId, "luckyspot-ydp");
  assert.equal(SEED_LOGINS.STORE_SYU.loginId, "luckyspot-seonyu");

  // 저장된 것은 해시뿐 — 같은 비밀번호라도 지점코드가 섞여 지점마다 다른 해시가 된다.
  for (const code of Object.keys(SEED_LOGINS)) {
    assert.equal(SEED_LOGINS[code].passwordHash, hashStorePassword(code, "123456"));
    assert.notEqual(SEED_LOGINS[code].passwordHash, hashStorePassword(code, "123457"));
  }
  assert.notEqual(hashStorePassword("STORE_HYJ", "123456"), hashStorePassword("STORE_GNM", "123456"));
});

test("점주 로그인 — 아이디 별칭과 본계정 묶음이 같은 지점으로 이어진다", () => {
  assert.equal(seedCodeForLoginId("luckyspot-hyj"), "STORE_HYJ");
  assert.equal(seedCodeForLoginId("Luckyspot-HYJ@naver.com"), "STORE_HYJ");
  assert.equal(seedCodeForLoginId(" luckyspot-ydp "), "STORE_YDP");
  assert.equal(seedCodeForLoginId("luckyspot-yeongdeungpo"), "STORE_YDP");
  assert.equal(seedCodeForLoginId("없는아이디"), null);

  assert.deepEqual(seedGroupCodesForLoginId("kwonohsungdesign"), ["STORE_GNM", "STORE_YDP", "STORE_SYU"]);
  assert.equal(seedGroupCodesForLoginId("luckyspot-hyj"), null);

  assert.equal(normalizeLoginId("  LuckySpot-HYJ "), "luckyspot-hyj");
  assert.equal(isValidLoginId("luckyspot-hyj"), true);
  assert.equal(isValidLoginId("a"), false);
  assert.equal(isValidPassword("123456"), true);
  assert.equal(isValidPassword("12345"), false);
  assert.equal(isValidPassword("1234 56"), false);
});

test("포털 세션 토큰 — 지점 코드·만료·서명만 담고, 변조하면 열리지 않는다", () => {
  const token = issueOwnerToken("STORE_HYJ", new Date("2026-11-25T00:00:00+09:00"));
  assert.equal(token.split(".").length, 3);
  assert.ok(token.startsWith("STORE_HYJ."));

  assert.equal(verifyOwnerToken(token, new Date("2026-11-26T00:00:00+09:00")), "STORE_HYJ");

  // 만료(30일 뒤)
  assert.equal(verifyOwnerToken(token, new Date("2026-12-26T00:00:00+09:00")), null);

  // 서명 변조
  const parts = token.split(".");
  assert.equal(verifyOwnerToken(`${parts[0]}.${parts[1]}.AAAA`, new Date("2026-11-26T00:00:00+09:00")), null);

  // 다른 지점 코드로 바꿔 치기
  assert.equal(verifyOwnerToken(token.replace("STORE_HYJ", "STORE_GNM"), new Date("2026-11-26T00:00:00+09:00")), null);
});
