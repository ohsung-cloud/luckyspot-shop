/**
 * 소모품 소진 주기 가이드 — "언제, 얼마나 시킬지"를 점주가 고민하지 않게 만드는 값.
 *
 * 기준(2026-11-20 럭키스팟 점주 발주 기획안 `3-4 절`):
 *   · 매장 규모별 하루 판매 잔 수 → 하루 소모량 → 판매 단위 1개가 며칠 가는지
 *   · 리드타임(발주 후 도착까지) 기본 3일을 빼고 "권장 발주 주기"를 잡는다
 *   · 원두는 잔당 12.5g, 테이크아웃 비중 80% 기준
 *
 * 여기 숫자는 **처음 쓰는 점주를 위한 기본값**이다. 점주가 3번만 발주하면
 * 실제 소모 속도로 보정하는 것이 다음 단계(L2 잔량 예측)의 몫이고,
 * 그 전까지는 이 표가 "빈 장바구니 앞에서 멈추는 일"을 없앤다.
 *
 * 값을 바꾸면 이 파일만 고치면 된다(화면 배지·담기 수량·일수 계산이 모두 여기서 나온다).
 */

export type StoreScale = "small" | "medium" | "large";

export type StoreScaleOption = {
  key: StoreScale;
  label: string;
  /** 하루 판매 잔 수 기준 한 줄 */
  hint: string;
};

export const storeScales: StoreScaleOption[] = [
  { key: "small", label: "소형", hint: "하루 30잔 · 8평 이하" },
  { key: "medium", label: "중형", hint: "하루 60잔 · 10~15평" },
  { key: "large", label: "대형", hint: "하루 120잔 · 20평 이상" },
];

export const DEFAULT_STORE_SCALE: StoreScale = "medium";

export function isStoreScale(value: unknown): value is StoreScale {
  return value === "small" || value === "medium" || value === "large";
}

export function storeScaleLabel(scale: StoreScale) {
  return storeScales.find((option) => option.key === scale)?.label ?? "중형";
}

export type ConsumptionGuide = {
  productId: string;
  /** 매장 규모별 권장 발주 주기(일) — 리드타임 3일을 뺀 값 */
  cycleDays: Record<StoreScale, number>;
  /** 판매 단위 1개를 다 쓰는 데 걸리는 일수 */
  daysPerUnit: Record<StoreScale, number>;
  /** 왜 이 주기인지 한 줄 */
  reason: string;
};

const beanNote = "잔당 원두 12.5g · 리드타임 3일 기준";
const cupNote = "테이크아웃 비중 80% · 1,000개들이 1박스 기준";
const printNote = "프린트 카페 기준 인쇄량(하루 60~200매) 가정";

export const consumptionGuides: ConsumptionGuide[] = [
  {
    productId: "bean-10kg",
    cycleDays: { small: 30, medium: 14, large: 7 },
    daysPerUnit: { small: 25, medium: 13, large: 7 },
    reason: `10kg 1박스는 중형 매장 약 13일치 — 도착 3일을 빼면 2주마다 1박스가 맞습니다. ${beanNote}`,
  },
  {
    productId: "cup-plastic-16",
    cycleDays: { small: 30, medium: 21, large: 14 },
    daysPerUnit: { small: 42, medium: 21, large: 10 },
    reason: `1박스(1,000개)가 중형 매장 약 3주치입니다. ${cupNote}`,
  },
  {
    productId: "cup-paper-16",
    cycleDays: { small: 30, medium: 21, large: 14 },
    daysPerUnit: { small: 42, medium: 21, large: 10 },
    reason: `종이컵도 컵과 같은 속도로 나갑니다. 두 종류를 쓰면 각각 절반으로 잡으세요. ${cupNote}`,
  },
  {
    productId: "lid-white-16",
    cycleDays: { small: 30, medium: 21, large: 14 },
    daysPerUnit: { small: 42, medium: 21, large: 10 },
    reason: `컵과 1:1로 소모됩니다. 컵과 같은 주기로 함께 발주하세요. ${cupNote}`,
  },
  {
    productId: "lid-clear-16",
    cycleDays: { small: 30, medium: 21, large: 14 },
    daysPerUnit: { small: 42, medium: 21, large: 10 },
    reason: `컵과 1:1로 소모됩니다. 컵과 같은 주기로 함께 발주하세요. ${cupNote}`,
  },
  {
    productId: "cup-holder",
    cycleDays: { small: 30, medium: 21, large: 14 },
    daysPerUnit: { small: 42, medium: 21, large: 10 },
    reason: `테이크아웃 잔 수만큼 나갑니다. 컵·리드와 같은 주기로 묶어 발주하세요. ${cupNote}`,
  },
  {
    productId: "a4-paper",
    cycleDays: { small: 30, medium: 21, large: 14 },
    daysPerUnit: { small: 42, medium: 25, large: 12 },
    reason: `2,500매 1박스가 중형 매장 약 3~4주치입니다. ${printNote}`,
  },
  {
    productId: "toner-black",
    cycleDays: { small: 90, medium: 60, large: 30 },
    daysPerUnit: { small: 120, medium: 60, large: 30 },
    reason: `검정 토너 1개는 보통 3,000~4,000매 — 용지 1~2박스마다 한 번씩 나갑니다. ${printNote}`,
  },
  {
    productId: "toner-color",
    cycleDays: { small: 120, medium: 90, large: 45 },
    daysPerUnit: { small: 180, medium: 90, large: 45 },
    reason: "컬러 인쇄 비중이 낮아 검정보다 2배 오래 갑니다. 재고 1개를 항상 남겨 두세요.",
  },
];

const guideById = new Map(consumptionGuides.map((guide) => [guide.productId, guide]));

export function getConsumptionGuide(productId: string) {
  return guideById.get(productId) ?? null;
}

/** 14 → "2주", 21 → "3주", 30 → "월 1회" */
export function cycleLabel(days: number) {
  if (days <= 7) return "주 1회";
  if (days <= 10) return "10일";
  if (days <= 14) return "2주";
  if (days <= 21) return "3주";
  if (days <= 31) return "월 1회";
  if (days <= 45) return "6주";
  if (days <= 62) return "2개월";
  if (days <= 95) return "분기 1회";
  return `${days}일`;
}

export function cycleBadge(productId: string, scale: StoreScale) {
  const guide = getConsumptionGuide(productId);
  if (!guide) return null;
  return `${cycleLabel(guide.cycleDays[scale])} 권장`;
}

export function cycleDays(productId: string, scale: StoreScale) {
  return getConsumptionGuide(productId)?.cycleDays[scale] ?? null;
}

/**
 * 이 수량이면 며칠 버티는지. 소모 주기 정보가 없는 품목은 null.
 * 예) 원두 10kg × 1박스, 중형 → 13
 */
export function daysCovered(productId: string, quantity: number, scale: StoreScale) {
  const guide = getConsumptionGuide(productId);

  if (!guide || quantity <= 0) return null;

  const days = Math.round(guide.daysPerUnit[scale] * quantity);

  return Math.max(1, days);
}

/** "약 2주치" / "약 13일치" / "약 2개월치" */
export function coverageLabel(days: number | null) {
  if (!days) return null;
  if (days >= 60) return `약 ${Math.round(days / 30)}개월치`;
  if (days >= 21) return `약 ${Math.round(days / 7)}주치`;
  return `약 ${days}일치`;
}

/** 담은 소모품 전체가 며칠 버티는지(가장 짧게 떨어지는 품목 기준). */
export function shortestCoverage(
  entries: { id: string; quantity: number }[],
  scale: StoreScale,
) {
  const coverages = entries
    .map((entry) => daysCovered(entry.id, entry.quantity, scale))
    .filter((days): days is number => typeof days === "number");

  return coverages.length ? Math.min(...coverages) : null;
}

/**
 * 메인 화면 "필수 소모품" 퀵 타일.
 *  · productId: 타일에서 바로 담는 대표 품목
 *  · quantity: 매장 규모별 1회 발주 권장 수량(판매 단위 기준)
 */
export type EssentialItem = {
  key: string;
  label: string;
  /** 타일 한 줄 설명 */
  hint: string;
  productId: string;
  quantity: Record<StoreScale, number>;
  /** 같은 용도로 함께 보여줄 품목(필터·대체 안내) */
  relatedIds: string[];
};

export const essentialItems: EssentialItem[] = [
  {
    key: "bean",
    label: "원두",
    hint: "10kg 박스 기준",
    productId: "bean-10kg",
    quantity: { small: 1, medium: 1, large: 2 },
    relatedIds: ["bean-10kg"],
  },
  {
    key: "cup",
    label: "테이크아웃 컵",
    hint: "1,000개 1박스",
    productId: "cup-plastic-16",
    quantity: { small: 1, medium: 1, large: 2 },
    relatedIds: ["cup-plastic-16", "cup-paper-16"],
  },
  {
    key: "lid",
    label: "컵리드",
    hint: "1,000개 1박스",
    productId: "lid-clear-16",
    quantity: { small: 1, medium: 1, large: 2 },
    relatedIds: ["lid-white-16", "lid-clear-16"],
  },
  {
    key: "holder",
    label: "컵홀더",
    hint: "1박스",
    productId: "cup-holder",
    quantity: { small: 1, medium: 1, large: 2 },
    relatedIds: ["cup-holder"],
  },
  {
    key: "paper",
    label: "A4 용지",
    hint: "2,500매 1박스",
    productId: "a4-paper",
    quantity: { small: 1, medium: 1, large: 2 },
    relatedIds: ["a4-paper"],
  },
  {
    key: "toner",
    label: "복합기 토너",
    hint: "검정 토너 1개",
    productId: "toner-black",
    quantity: { small: 1, medium: 1, large: 1 },
    relatedIds: ["toner-black", "toner-color"],
  },
];

/** "필수 소모품만 보기" 필터에 쓰는 품목 id 모음 */export const essentialProductIds = Array.from(
  new Set(essentialItems.flatMap((item) => item.relatedIds)),
);

export function isEssentialProduct(productId: string) {
  return essentialProductIds.includes(productId);
}

/**
 * "1회 1박스" 처럼 판매 단위의 숫자를 두 번 쓰지 않게 만든다.
 *  · unit "1박스" + 수량 1 → "1박스", 수량 2 → "2박스"
 *  · unit "1개" + 수량 1 → "1개", 수량 2 → "2개"
 *  · unit 이 "3박스" 처럼 1이 아닌 숫자로 시작하면 단위를 그대로 두고 "2 × 3박스"
 */
export function recommendedQuantityLabel(unit: string, quantity: number) {
  const match = /^(\d[\d,]*)\s*(.*)$/.exec(unit.trim());

  if (!match) return `${quantity}${unit}`;

  const [, base, noun] = match;

  if (Number(base.replace(/,/g, "")) !== 1) return `${quantity} × ${unit}`;

  return `${quantity}${noun || "개"}`;
}
