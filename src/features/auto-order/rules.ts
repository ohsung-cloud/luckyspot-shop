import { getProductById } from "../../data/products";
import type { ConsumableBomRule, ResolvedBomRule } from "./types";

/**
 * 소모품 BOM(단위 소모량) 규칙 — 특허 1호의 (b) 귀속 프로파일.
 *
 * 숫자의 근거
 *  - 원두 12.5g/잔: 발주 기획안(2026-11-20) · 매장 규모별 소진 주기표와 같은 값.
 *  - 컵 1,000개/박스, 리드 1,000개/박스, A4 2,500매/박스: `src/data/products.ts` 규격.
 *  - 리드타임: 원두·컵 2~3일, 프린트 소모품 2~3일(본사 기존 발주 기준).
 *  - 단가: 전부 `src/data/products.ts`의 **부가세 포함 발주 단가**를 그대로 읽는다
 *    (resolveRules가 카탈로그에서 채운다 — 여기에 가격을 따로 적지 않는다).
 *  - 토너는 '개' 대신 g으로 다룬다. 정품 검정토너 1개 ≈ 500g ≈ 2만매(흑백 5% 피복)
 *    → 1매당 0.025g. 컬러는 0.06g/매, 컬러 출력 비중은 POS 행의 colorSheets를 쓴다.
 *
 * 교차 상관계수(crossDomainWeight)
 *  - 0.28: 프린트를 쓰러 온 손님이 음료·컵을 함께 쓰는 비중이 큰 품목(컵·리드).
 *  - 0.12: 원두 — 교차 유입은 있으나 잔당 소모가 고정이라 보정 폭을 작게 둔다.
 *  - 0.10: 프린트 소모품 — 카페 대기 손님이 출력을 곁들이는 역방향 보정.
 *  - 교차 도메인 변화율은 ±40%로 자른다(급증·급감이 수량을 과도하게 흔들지 않게).
 */

const BASE_RULES: ConsumableBomRule[] = [
  {
    sku: "bean-10kg",
    ownerEntityType: "franchisee_cafe",
    primaryDomain: "cafe",
    // 원두는 '잔수'가 아니라 메뉴 구성으로 계산한 '하루 원두 g'을 운전값으로 쓴다.
    // (아메리카노 9g · 투샷 15g · 카페라떼 7g · 아샷추 7g — menu.ts)
    driverField: "beanGrams",
    crossDomain: "print",
    crossDriverField: "sheets",
    crossDomainWeight: 0.12,
    consumptionPerDriverUnit: 1,
    stockUnit: "g",
    packSize: 10000,
    packLabel: "1박스(10kg)",
    leadTimeDays: 2,
    safetyStockDays: 3,
    maxOrderQty: 3,
    stockOnHand: 3300,
    supplier: "제이웨이브",
  },
  {
    sku: "cup-plastic-16",
    ownerEntityType: "franchisee_cafe",
    primaryDomain: "cafe",
    driverField: "drinks",
    crossDomain: "print",
    crossDriverField: "sheets",
    crossDomainWeight: 0.28,
    consumptionPerDriverUnit: 0.55,
    stockUnit: "개",
    packSize: 1000,
    packLabel: "1박스(1,000개)",
    leadTimeDays: 3,
    safetyStockDays: 4,
    maxOrderQty: 6,
    stockOnHand: 90,
    supplier: "로얄선스",
  },
  {
    sku: "cup-paper-16",
    ownerEntityType: "franchisee_cafe",
    primaryDomain: "cafe",
    driverField: "drinks",
    crossDomain: "print",
    crossDriverField: "sheets",
    crossDomainWeight: 0.28,
    consumptionPerDriverUnit: 0.35,
    stockUnit: "개",
    packSize: 1000,
    packLabel: "1박스(1,000개)",
    leadTimeDays: 3,
    safetyStockDays: 4,
    maxOrderQty: 6,
    stockOnHand: 60,
    supplier: "로얄선스",
  },
  {
    sku: "lid-white-16",
    ownerEntityType: "franchisee_cafe",
    primaryDomain: "cafe",
    driverField: "drinks",
    crossDomain: "print",
    crossDriverField: "sheets",
    crossDomainWeight: 0.28,
    consumptionPerDriverUnit: 0.6,
    stockUnit: "개",
    packSize: 1000,
    packLabel: "1박스(1,000개)",
    leadTimeDays: 3,
    safetyStockDays: 4,
    maxOrderQty: 6,
    stockOnHand: 80,
    supplier: "로얄선스",
  },
  {
    sku: "a4-paper",
    ownerEntityType: "hq_print",
    primaryDomain: "print",
    driverField: "sheets",
    crossDomain: "cafe",
    crossDriverField: "drinks",
    crossDomainWeight: 0.1,
    consumptionPerDriverUnit: 1,
    stockUnit: "매",
    packSize: 2500,
    packLabel: "1박스(2,500매)",
    leadTimeDays: 2,
    safetyStockDays: 3,
    maxOrderQty: 4,
    stockOnHand: 420,
    supplier: "본사 지정 공급처",
    stockSignal: "paper_tray_pct",
    signalCapacity: 1100,
  },
  {
    sku: "toner-black",
    ownerEntityType: "hq_print",
    primaryDomain: "print",
    driverField: "sheets",
    crossDomain: "cafe",
    crossDriverField: "drinks",
    crossDomainWeight: 0.1,
    consumptionPerDriverUnit: 0.025,
    stockUnit: "g",
    packSize: 500,
    packLabel: "1개(500g·약 2만매)",
    leadTimeDays: 3,
    safetyStockDays: 4,
    maxOrderQty: 2,
    stockOnHand: 14,
    supplier: "본사 지정 공급처",
    stockSignal: "toner_black_pct",
    signalCapacity: 500,
  },
  {
    sku: "toner-color",
    ownerEntityType: "hq_print",
    primaryDomain: "print",
    driverField: "colorSheets",
    crossDomain: "cafe",
    crossDriverField: "drinks",
    crossDomainWeight: 0.1,
    consumptionPerDriverUnit: 0.06,
    stockUnit: "g",
    packSize: 500,
    packLabel: "1개(500g·약 8천매)",
    leadTimeDays: 3,
    safetyStockDays: 4,
    maxOrderQty: 2,
    stockOnHand: 12,
    supplier: "본사 지정 공급처",
    stockSignal: "toner_color_pct",
    signalCapacity: 500,
  },
];

/** 단가·품명을 카탈로그에서 채운 규칙 목록. 카탈로그에 없는 SKU는 조용히 건너뛴다. */
export function resolveRules(): ResolvedBomRule[] {
  const resolved: ResolvedBomRule[] = [];

  for (const rule of BASE_RULES) {
    const product = getProductById(rule.sku);
    if (!product) continue;

    resolved.push({
      ...rule,
      name: product.name,
      spec: product.spec,
      unitPrice: product.price,
    });
  }

  return resolved;
}

/** SKU 1건의 규칙. 없으면 null. */
export function resolveRule(sku: string): ResolvedBomRule | null {
  return resolveRules().find((rule) => rule.sku === sku) ?? null;
}

/** 교차 보정 상한 — 반대 도메인 변화율을 ±40%로 자른다. */
export const CROSS_CLAMP = 0.4;

/** 예측 창(일). */
export const FORECAST_WINDOW_DAYS = 14;

/** 최근 구간(일) — 이상 감지·교차 비율의 분자. */
export const RECENT_DAYS = 3;

/** 직전 구간(일) — 분모. */
export const BASELINE_DAYS = 7;

/** 안전재고일을 더한 목표 커버일(발주 후 다시 발주 없이 버티는 일수). */
export const COVER_EXTRA_DAYS = 7;

/** 사업자(장비 소유 주체) 정의. 실제 사업자번호는 지점 세금계산서 프로필에서 읽고, 화면에는 마스킹만 보여준다. */
export const BUSINESS_ENTITIES = {
  franchisee_cafe: {
    type: "franchisee_cafe" as const,
    name: "점주 사업자 (카페)",
    businessNoMasked: "***-**-*****",
    paymentOwner: "점주 사업자 — 지점 정산 계좌",
    costShareNote: "음료 원가·변동비 32% · 카페 소모품 원가 100% 점주 부담",
  },
  hq_print: {
    type: "hq_print" as const,
    name: "주식회사 럭키스팟 (본사·샵인샵 프린트)",
    businessNoMasked: "***-**-*****",
    paymentOwner: "본사 사업자 — 샵인샵 프린트 정산 계좌",
    costShareNote: "프린트 변동비·로열티 25% · 프린트 소모품 원가 100% 본사 부담",
  },
};
