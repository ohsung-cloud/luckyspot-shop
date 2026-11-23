/**
 * 원두 소모 계수 — 대표 확정(2026-11-23).
 *
 *   일반 아메리카노(HOT/ICED)  9g/잔
 *   투샷 아메리카노(HOT/ICED) 15g/잔
 *   카페라떼(HOT/ICED)         7g/잔
 *   아샷추                    7g/잔
 *
 * 이 4개 주력 메뉴의 판매 잔수 합으로 핵심 원두 소모량을 계산하면 충분하다.
 * 포털(로얄선즈) 베스트셀러의 상품명칭별 판매량을 그대로 넣으면
 * `beanGramsForBestsellers()`가 하루 원두 사용량(g)을 돌려준다.
 *
 * 이름 매칭은 공백·대소문자·HOT/ICED 표기를 무시한다.
 * 위 4개에 없는 음료(밀크티·파우더 음료 등)는 원두를 쓰지 않는 것으로 보고 0g으로 둔다.
 * → 베스트셀러 Top10에 커피가 일부만 잡혀도, 커피 잔수만큼만 원두를 계산한다.
 */

export type MenuBeanRule = {
  key: string;
  label: string;
  gramsPerDrink: number;
  /** 이름 판정용 정규식 (정규화된 문자열 기준) */
  pattern: RegExp;
};

const MENU_RULES: MenuBeanRule[] = [
  {
    key: "two-shot-americano",
    label: "투샷 아메리카노",
    gramsPerDrink: 15,
    pattern: /투샷|더블샷|2샷|DOUBLESHOT|TWOSHOT/,
  },
  {
    key: "americano",
    label: "아메리카노",
    gramsPerDrink: 9,
    pattern: /아메리카노|AMERICANO/,
  },
  {
    key: "cafe-latte",
    label: "카페라떼",
    gramsPerDrink: 7,
    pattern: /카페라떼|카페라테|라떼|LATTE/,
  },
  {
    key: "ashot-chu",
    label: "아샷추",
    gramsPerDrink: 7,
    pattern: /아샷추|ASHOT/,
  },
];

/** 커피가 아닌 음료의 기본값 (원두 미사용) */
export const NON_COFFEE_BEAN_GRAMS = 0;

/**
 * 베스트셀러 이름을 정규화한다 — 공백 제거·대문자·HOT/ICED 표기 제거.
 * 예: "아메리카노 HOT" → "아메리카노", "Ice Cafe Latte" → "ICECAFELATTE"
 */
export function normalizeMenuName(name: string) {
  return name
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/HOT|ICED|ICE|핫|아이스/g, "");
}

/** 음료 1잔의 원두 g. 위 4개 메뉴가 아니면 0. */
export function beanGramsPerDrink(name: string): number {
  const normalized = normalizeMenuName(name);

  for (const rule of MENU_RULES) {
    if (rule.pattern.test(normalized)) return rule.gramsPerDrink;
  }

  return NON_COFFEE_BEAN_GRAMS;
}

export type MenuSaleLine = { name: string; quantity: number };

export type BeanEstimate = {
  grams: number;
  /** 원두를 쓰는 잔수 */
  coffeeDrinks: number;
  /** 원두를 쓰지 않는 잔수(밀크티·파우더 등) */
  otherDrinks: number;
  /** 메뉴별 기여 — 화면·명세서 실시예용 */
  breakdown: { name: string; quantity: number; gramsPerDrink: number; grams: number }[];
};

/** 베스트셀러 라인 → 하루 원두 사용량(g). */
export function beanGramsForBestsellers(lines: MenuSaleLine[]): BeanEstimate {
  let grams = 0;
  let coffeeDrinks = 0;
  let otherDrinks = 0;
  const breakdown: BeanEstimate["breakdown"] = [];

  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) continue;

    const perDrink = beanGramsPerDrink(line.name);
    const lineGrams = perDrink * line.quantity;

    grams += lineGrams;
    if (perDrink > 0) coffeeDrinks += line.quantity;
    else otherDrinks += line.quantity;

    breakdown.push({
      name: line.name,
      quantity: line.quantity,
      gramsPerDrink: perDrink,
      grams: lineGrams,
    });
  }

  return { grams: Math.round(grams), coffeeDrinks, otherDrinks, breakdown };
}

/**
 * 메뉴 구성비를 모를 때(포털 연동 전·수동 마감) 쓰는 기본 블렌드.
 *   아메리카노 50% × 9g + 투샷 15% × 15g + 라떼 25% × 7g + 아샷추 10% × 7g = 9.2g/잔
 */
export const DEFAULT_BEAN_GRAMS_PER_DRINK = 9.2;

export function beanGramsForDrinks(drinksSold: number) {
  return Math.max(0, Math.round(drinksSold * DEFAULT_BEAN_GRAMS_PER_DRINK));
}
