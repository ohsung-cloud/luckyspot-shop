/**
 * 교차 도메인 운영 엔진 (특허 후보 A~E의 계산 핵심)
 *
 * 입력  : two-site 스냅샷 (에스칼프린트 포털 + 로얄선즈 포털에서 화면으로 읽은 값)
 * 출력  : 통합 매출 뷰 · 레시피 기반 원료 수요 · 레시피↔실측 드리프트 ·
 *         학사일정 버스트 가중 · 잔여일/발주 제안(사업자 분리) · 복구 우선순위
 *
 * 설계 원칙
 *  1) 사이트에 없는 값을 만들어내지 않는다. 모르는 것은 null + assumptions[]에 남긴다.
 *  2) 단위가 확인되지 않은 값은 "기계 소모 단위"로 통일하고, 환산 가정을 명시한다.
 *     (보충 로그가 쌓이면 pct↔수량 환산계수를 자기학습하도록 확장 — patent C)
 *  3) 읽기 전용 계산만 한다. 발주·수정은 사람 승인 뒤 별도 단계.
 */

export const SCHEMA_VERSION = "two-site/1.0";

export const DEFAULT_CONFIG = {
  /**
   * 재고 % → 실제 단위 환산.
   *  - 연동 펌프: 보충 로그로 **확인됨** (2026-11-21 사과시럽 985% ↔ 9,853ml → 1% = 10ml)
   *  - 분말·범용 상자(원두): 같은 계열로 1% = 10g 가정(보충 로그 추가 확보 시 확인)
   *  - 컵: 1% = 1개
   */
  gramsPerPct: 10,
  cupsPerPct: 1,
  /** 분말 재료: 레시피 g → 기계 소모 단위 환산 (얼그레이 4.0g ↔ 로그 0.40 에서 역산) */
  powderUnitGrams: 10,
  /** 원두: 레시피 50ml 1샷 = 기계 로그 1.20 단위 */
  coffeeUnitPer50ml: 1.2,
  /** 안전재고 일수(재료별) — 발주 리드타임 포함 */
  safetyDays: {
    default: 3,
    원두: 4,
    우유: 3,
    초코: 3,
    얼그레이: 3,
    바닐라: 4,
    청포도시럽: 4,
    복숭아시럽: 4,
    사과시럽: 4,
    레몬시럽: 4,
    종이컵: 5,
    투명컵: 5,
    뚜껑: 4,
    어두: 3,
  },
  /**
   * 【사용자 확정】 음료 1잔당 원두 g — 운영 기준(2026-11-23 확정).
   * 레시피관리 화면의 커피 ml와 대조하되, 계산은 이 계수를 기준으로 한다.
   *   일반 아메리카노 9g · 투샷 아메리카노 15g · 카페라떼 7g · 아샷추 7g
   */
  beanGramsPerDrink: {
    americano: 9,
    doubleShot: 15,
    latte: 7,
    ashotchu: 7,
    default: 7,
  },
  /** 커피 수요가 학사 버스트를 따라가는 정도 (프린트 버스트의 40%만 전이) */
  coffeeBurstTransfer: 0.4,
  /** 드리프트 경고 임계 (실측/예상 비율 편차) */
  driftTolerance: 0.15,
  /** 발주 제안 최소 금액(무료배송 기준) */
  freeShippingThreshold: 200000,
  /** 투명컵 재고가 이 % 미만이면 ICED 메뉴 위험으로 본다 */
  cupRiskPct: 60,
};

/* ------------------------------------------------------------------ */
/* 날짜 유틸                                                           */
/* ------------------------------------------------------------------ */

export function kstDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`잘못된 시각: ${iso}`);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(dateString, days) {
  const base = new Date(`${dateString}T00:00:00+09:00`);
  base.setUTCDate(base.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

function daysBetween(a, b) {
  const first = new Date(`${a}T00:00:00+09:00`).getTime();
  const second = new Date(`${b}T00:00:00+09:00`).getTime();
  return Math.round((second - first) / 86_400_000);
}

function round(value, digits = 1) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/* ------------------------------------------------------------------ */
/* 1. 학사일정 버스트                                                  */
/* ------------------------------------------------------------------ */

/**
 * 오늘 기준 학사일정 버스트 가중치.
 * 시험기간 중 1.35, 시작 3일 전부터 1.15, 시험기간 종료 후 2일 1.05.
 */
export function calendarBurst(calendar, today) {
  const events = [];
  let printWeight = 1;
  let active = null;

  for (const event of calendar ?? []) {
    const start = event.date;
    const end = event.end ?? event.date;
    const before = daysBetween(today, start); // 오늘 → 시작일
    const after = daysBetween(end, today); // 종료일 → 오늘

    let weight = 1;
    let phase = null;

    if (before <= 0 && after <= 0) {
      weight = event.demandWeight ?? 1.3;
      phase = "in-window";
    } else if (before > 0 && before <= 3) {
      weight = 1 + ((event.demandWeight ?? 1.3) - 1) * 0.45;
      phase = "pre-window";
    } else if (before === 0) {
      phase = "in-window";
    } else if (after > 0 && after <= 2) {
      weight = 1.05;
      phase = "post-window";
    }

    if (phase) {
      events.push({
        title: event.title,
        phase,
        daysToStart: before,
        daysSinceEnd: after,
        weight: round(weight, 3),
      });
      printWeight = Math.max(printWeight, weight);
      if (!active && phase === "in-window") active = event;
    }
  }

  const coffeeWeight = 1 + (printWeight - 1) * DEFAULT_CONFIG.coffeeBurstTransfer;

  return {
    today,
    printWeight: round(printWeight, 3),
    coffeeWeight: round(coffeeWeight, 3),
    activeWindow: active ? { title: active.title, end: active.end ?? active.date } : null,
    events,
  };
}

/* ------------------------------------------------------------------ */
/* 2. 레시피 기반 수요 (음료 1잔 → 재료)                                */
/* ------------------------------------------------------------------ */

function normalizeName(name) {
  return String(name ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/아이스/g, "ICED")
    .replace(/ICEDD/g, "ICED")
    .replace(/ICE(?![D])/g, "ICED");
}

/** 오늘 판매 구성을 "상품명 → 잔수"로 만든다. 베스트셀러·주문내역을 합쳐 최대값을 쓴다. */
export function todayMix(loyalsuns) {
  const mix = new Map();

  for (const item of loyalsuns?.bestsellers ?? []) {
    const key = normalizeName(item.name);
    mix.set(key, Math.max(mix.get(key) ?? 0, Number(item.quantity) || 0));
  }

  // 주문 라인은 복합 상품("바닐라밀크티 ICED + 아메리카노")이 있어 그대로 더하지 않는다.
  const drinkCount =
    Number(loyalsuns?.orders?.drinkCount) ||
    [...mix.values()].reduce((sum, value) => sum + value, 0);

  return { mix, drinkCount };
}

/** 레시피 1건 → 재료별 기대 소모(기계 단위, 기계 단위 g은 config로 환산) */
export function recipeConsumption(recipe, config = DEFAULT_CONFIG) {
  const out = [];
  const coffeeMl = Number(recipe.coffeeMl) || 0;

  if (coffeeMl > 0) {
    const shotMultiplier = recipe.doubleShot ? 2 : 1;
    out.push({
      material: "원두",
      slot: "범용 재료 상자1",
      units: round((coffeeMl / 50) * config.coffeeUnitPer50ml * shotMultiplier, 3),
      basis: `커피 ${coffeeMl}ml${recipe.doubleShot ? " × 2샷" : ""}`,
    });
  }

  for (const row of recipe.rows ?? []) {
    const powder = Number(row.powderG) || 0;
    if (powder <= 0) continue;
    out.push({
      material: row.material,
      slot: row.slot,
      units: round(powder / config.powderUnitGrams, 3),
      basis: `파우더 ${powder}g`,
    });
  }

  return out;
}

/**
 * 오늘 판매 믹스에 레시피를 적용해 재료별 기대 소모를 계산한다.
 *
 * 우선순위: ① 오늘 원료 소모 일지의 실측(그 상품·재료) → ② 같은 상품의 레시피
 *          → ③ 같은 메뉴의 반대 온도 레시피(변형 폴백, 명시적으로 표시)
 * 실측을 먼저 쓰는 이유: 포털 레시피는 HOT/ICED 변형이 일부만 등록되어 있고,
 * 실제 샷 구성은 기계가 기록한 값이 더 정확하다.
 */
export function expectedDemand(loyalsuns, config = DEFAULT_CONFIG) {
  const { mix, drinkCount } = todayMix(loyalsuns);
  const recipes = new Map(
    (loyalsuns?.recipes ?? []).map((recipe) => [normalizeName(recipe.product), recipe]),
  );
  const observed = new Map();
  for (const order of actualByOrder(loyalsuns)) {
    observed.set(normalizeName(order.product), order.materials);
  }

  const baseOf = (name) => normalizeName(name).replace("HOT", "").replace("ICED", "");
  const variantRecipe = (name) => {
    const base = baseOf(name);
    for (const [key, recipe] of recipes) {
      if (baseOf(key) === base) return { recipe, key };
    }
    return null;
  };

  const byMaterial = new Map();
  const covered = [];
  const uncovered = [];

  for (const [name, quantity] of mix) {
    const exact = recipes.get(name);
    const observedForProduct = observed.get(name);

    if (observedForProduct && Object.keys(observedForProduct).length > 0) {
      covered.push({ name, quantity, recipe: "원료 소모 일지(실측)", basis: "observed" });
      for (const [material, units] of Object.entries(observedForProduct)) {
        if (units <= 0) continue;
        const current = byMaterial.get(material) ?? { material, slot: null, units: 0, from: [] };
        current.units += units * quantity;
        current.from.push(`실측 ${units} × ${quantity}잔`);
        byMaterial.set(material, current);
      }
      continue;
    }

    const fallback = exact ? { recipe: exact, key: name } : variantRecipe(name);
    if (!fallback) {
      uncovered.push({ name, quantity });
      continue;
    }
    covered.push({
      name,
      quantity,
      recipe: fallback.recipe.product,
      basis: exact ? "recipe" : "variant-recipe",
    });
    for (const item of recipeConsumption(fallback.recipe, config)) {
      const current = byMaterial.get(item.material) ?? {
        material: item.material,
        slot: item.slot,
        units: 0,
        from: [],
      };
      current.units += item.units * quantity;
      current.from.push(`${item.basis} × ${quantity}잔${exact ? "" : " (변형 레시피)"}`);
      byMaterial.set(item.material, current);
    }
  }

  // 컵 소모: ICED는 투명컵, HOT은 종이컵 1개씩 (메뉴명으로 판정)
  for (const [name, quantity] of mix) {
    const cup = name.includes("ICED") ? "투명컵" : "종이컵";
    const slot = cup === "투명컵" ? "범용 재료 상자4" : "범용 재료 상자3";
    const current = byMaterial.get(cup) ?? { material: cup, slot, units: 0, from: [] };
    current.units += quantity * 1;
    current.from.push(`잔당 1개 × ${quantity}잔`);
    byMaterial.set(cup, current);
  }

  for (const item of byMaterial.values()) {
    item.units = round(item.units, 2);
    const isCup = /컵/.test(item.material);
    item.unit = isCup ? "개" : "g";
    // 로그 단위 × 10 = g/ml (얼그레이 0.40 ↔ 레시피 4.0g). 컵은 개 그대로.
    item.amount = round(isCup ? item.units * config.cupsPerPct : item.units * config.powderUnitGrams, 1);
  }

  return {
    mix: [...mix.entries()].map(([name, quantity]) => ({ name, quantity })),
    drinkCount,
    byMaterial: [...byMaterial.values()].sort((a, b) => b.units - a.units),
    covered,
    uncovered,
  };
}

/* ------------------------------------------------------------------ */
/* 3. 레시피 ↔ 실측 드리프트                                            */
/* ------------------------------------------------------------------ */

/** 원료 소모 일지 → 주문(시각)별 실측 소모 */
export function actualByOrder(loyalsuns) {
  const byOrder = new Map();

  for (const row of loyalsuns?.consumptionLog ?? []) {
    // 한 주문에 서로 다른 상품이 섞여 있으므로 주문번호+상품명으로 묶는다.
    const key = `${row.orderId ?? row.at}::${normalizeName(row.product)}`;
    const current = byOrder.get(key) ?? {
      orderId: key,
      at: row.at,
      product: row.product,
      materials: new Map(),
      // 잔수: 같은 음료를 여러 잔 내보내면 기록 시각이 잔마다 하나씩 생긴다.
      stamps: new Set(),
    };
    const amount = Number(row.amount) || 0;
    current.materials.set(row.material, (current.materials.get(row.material) ?? 0) + amount);
    current.stamps.add(row.at);
    byOrder.set(key, current);
  }

  return [...byOrder.values()].map((order) => ({
    orderId: order.orderId,
    at: order.at,
    product: order.product,
    cups: Math.max(1, order.stamps.size),
    materials: Object.fromEntries([...order.materials.entries()].map(([key, value]) => [key, round(value, 2)])),
  }));
}

/**
 * 같은 상품의 실측 소모가 주문마다 같은지, 레시피 기대와 맞는지 본다.
 *  - cross-variant : 같은 메뉴의 HOT/ICED가 서로 다른 소모를 기록하는 경우
 *  - recipe-mismatch: 레시피에 적힌 재료와 로그의 재료가 다른 경우(슬롯↔재료 매핑 오류)
 */
export function driftReport(snapshot, config = DEFAULT_CONFIG) {
  const loyalsuns = snapshot.loyalsuns ?? {};
  const orders = actualByOrder(loyalsuns);
  const findings = [];

  const recipes = new Map(
    (loyalsuns.recipes ?? []).map((recipe) => [normalizeName(recipe.product), recipe]),
  );

  // 재료별 실측 합계
  const actualTotals = {};
  for (const order of orders) {
    for (const [material, amount] of Object.entries(order.materials)) {
      actualTotals[material] = round((actualTotals[material] ?? 0) + amount, 2);
    }
  }

  // (a) 상품별 실측 재료 프로파일에서 기대와 다른 재료 찾기
  //
  // 로그가 모든 커피 음료의 원두를 같은 값으로 남기면(기계의 '1회' 카운트),
  // 잔당 g 비교는 의미가 없어 한 줄로만 보고한다.
  const coffeePerCup = orders
    .filter((order) => order.materials["원두"] !== undefined)
    .map((order) => order.materials["원두"] / Math.max(1, order.cups ?? 1));
  const uniformCoffeeLog =
    coffeePerCup.length > 1 && Math.max(...coffeePerCup) - Math.min(...coffeePerCup) < 0.001;

  if (uniformCoffeeLog) {
    findings.push({
      type: "coffee-log-uniform",
      severity: "medium",
      product: "커피 전체",
      material: "원두",
      detail: `모든 커피 음료가 원두 ${round(coffeePerCup[0] * config.powderUnitGrams, 1)}g/잔으로 동일하게 기록`,
      hint: "기계가 잔당 원두량을 구분해 기록하지 않습니다 — 진한·연한 차이는 커피 추출수량으로만 남고, 잔여일은 확정 계수로 계산합니다",
    });
  }

  for (const order of orders) {
    const recipe = recipes.get(normalizeName(order.product));
    if (!recipe) continue;

    const expected = new Map(recipeConsumption(recipe, config).map((item) => [item.material, item.units]));
    const cups = Math.max(1, order.cups ?? 1);
    const actual = new Map(
      Object.entries(order.materials)
        .filter(([, amount]) => amount > 0)
        .map(([material, amount]) => [material, round(amount / cups, 3)]),
    );

    for (const [material, units] of actual) {
      if (expected.has(material)) continue;
      const slotOfActual = (loyalsuns.recipes ?? [])
        .flatMap((entry) => entry.rows ?? [])
        .find((row) => row.material === material)?.slot;
      findings.push({
        type: "recipe-material-mismatch",
        severity: "high",
        product: order.product,
        material,
        expectedMaterials: [...expected.keys()],
        actualUnits: units,
        hint: slotOfActual
          ? `로그는 '${material}'로 기록되었지만 레시피의 같은 슬롯(${slotOfActual})은 다른 재료입니다 — 슬롯↔재료 매핑 확인 필요`
          : "레시피에 없는 재료가 소모되었습니다",
      });
    }

    for (const [material, units] of expected) {
      const actualUnits = actual.get(material);
      if (actualUnits === undefined) {
        findings.push({
          type: "missing-consumption",
          severity: "medium",
          product: order.product,
          material,
          expectedUnits: units,
          hint: "레시피에는 있으나 오늘 로그에 기록이 없습니다",
        });
        continue;
      }
      const deviation = units === 0 ? 0 : (actualUnits - units) / units;
      if (material === "원두" && uniformCoffeeLog) continue;
      if (Math.abs(deviation) > config.driftTolerance) {
        findings.push({
          type: "quantity-drift",
          severity: Math.abs(deviation) > 0.3 ? "high" : "medium",
          product: order.product,
          material,
          expectedUnits: units,
          actualUnits,
          deviationPct: round(deviation * 100, 1),
          hint: "레시피 정량과 실측 소모가 다릅니다 — 분말 습기·배출구 막힘·캘리브레이션 확인",
        });
      }
    }
  }

  // (b) 같은 메뉴명의 HOT/ICED 소모 비교
  const byMenu = new Map();
  for (const order of orders) {
    const base = normalizeName(order.product)
      .replace("HOT", "")
      .replace("ICED", "");
    const variant = normalizeName(order.product).includes("ICED") ? "ICED" : "HOT";
    const slots = byMenu.get(base) ?? new Map();
    const entry = slots.get(variant) ?? { units: new Map(), orders: 0, cups: 0 };
    for (const [material, amount] of Object.entries(order.materials)) {
      if (amount <= 0) continue;
      entry.units.set(material, round((entry.units.get(material) ?? 0) + amount, 2));
    }
    entry.orders += 1;
    entry.cups += Math.max(1, order.cups ?? 1);
    slots.set(variant, entry);
    byMenu.set(base, slots);
  }

  for (const [base, variants] of byMenu) {
    if (variants.size < 2) continue;
    const [first, second] = [...variants.entries()];
    const materials = new Set([...first[1].units.keys(), ...second[1].units.keys()]);
    for (const material of materials) {
      const perOrder = (entry) => (entry.units.get(material) ?? 0) / Math.max(entry.cups || entry.orders, 1);
      const a = perOrder(first[1]);
      const b = perOrder(second[1]);
      if (a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) > config.driftTolerance) {
        findings.push({
          type: "cross-variant-drift",
          severity: "high",
          product: base,
          material,
          detail: `${first[0]} ${round(a, 2)}/잔 vs ${second[0]} ${round(b, 2)}/잔`,
          hint: "같은 메뉴인데 온도별 구성이 다릅니다 — 메뉴 설정이 복제되지 않았을 수 있습니다",
        });
      }
    }
  }

  return {
    orders: orders.length,
    actualTotals,
    findings,
    summary:
      findings.length === 0
        ? "레시피와 실측 소모가 일치합니다"
        : `드리프트 ${findings.length}건 (high ${findings.filter((f) => f.severity === "high").length}건)`,
  };
}

/* ------------------------------------------------------------------ */
/* 3-1. 원두 소모율 (음료 판매 수량 × 잔당 소모 g)                        */
/* ------------------------------------------------------------------ */

/** 메뉴명 → 원두 계수 종류 (사용자 확정 계수표의 키) */
export function beanClass(productName) {
  const name = String(productName ?? "").toUpperCase();
  if (/아샷추|ASHOTCHU/.test(name)) return "ashotchu";
  if (/투샷|DOUBLE/.test(name)) return "doubleShot";
  // 한예종점 메뉴: '진한 아메리카노'는 투샷과 같은 두 배 구성(가격 2,400원 · 커피 추출수량 110ml)
  if (/진한/.test(name)) return "doubleShot";
  if (/라떼|LATTE/.test(name)) return "latte";
  if (/아메리카노|AMERICANO/.test(name)) return "americano";
  return "default";
}

/**
 * 사용자 질문("커피 판매 수에 따라 원두 소모율 측정 가능하지 않을까")에 대한 계산.
 *
 *  잔당 원두 g = 사용자 확정 계수(아메리카노 9 · 투샷 15 · 카페라떼 7 · 아샷추 7)
 *  일 원두 g   = Σ(음료별 판매 수량 × 잔당 g)
 *  잔여일      = 재고 g ÷ (일 원두 g × 버스트 계수),  재고 g = 잔량% × 10 (1% = 10g 가정)
 *  잔여 잔수   = 재고 g ÷ 평균 잔당 g
 *  함께 표시   : 기계 원료 소모 일지가 시사하는 g(로그×10)과의 차이 → 정량 드리프트
 */
export function beanConsumption(snapshot, burst, config = DEFAULT_CONFIG) {
  const loyalsuns = snapshot.loyalsuns ?? {};
  const mix = todayMix(loyalsuns);
  const recipes = new Map((loyalsuns.recipes ?? []).map((r) => [normalizeName(r.product), r]));

  // 음료별 실측 원두 단위 (로그가 없으면 레시피의 커피 ml로 환산)
  const perDrinkUnits = new Map();
  for (const order of actualByOrder(loyalsuns)) {
    const units = order.materials["원두"];
    if (!units) continue;
    const perCup = units / Math.max(1, order.cups ?? 1);
    perDrinkUnits.set(normalizeName(order.product), perCup);
  }

  const rows = [];
  let dailyUnits = 0;
  let dailyGrams = 0;
  let coffeeDrinks = 0;
  const deviated = [];

  for (const [name, quantity] of mix.mix) {
    const kind = beanClass(name);
    const recipe = recipes.get(name) ?? null;
    const isCoffee = kind !== "default" || Boolean(recipe && recipe.coffeeMl > 0);
    if (!isCoffee) continue; // 원두를 쓰지 않는 음료(밀크티·초코 등)

    const gramsPerDrink = config.beanGramsPerDrink[kind] ?? config.beanGramsPerDrink.default;
    // 기계 로그가 시사하는 값 — 한 주문에 여러 잔이면 잔수로 나눠 잔당으로 맞춘다.
    const machineUnits = perDrinkUnits.get(name) ?? null;
    const machineGrams = machineUnits === null ? null : round(machineUnits * config.powderUnitGrams, 1);
    const deviationPct =
      machineGrams === null ? null : round(((machineGrams - gramsPerDrink) / gramsPerDrink) * 100, 1);

    rows.push({
      product: name,
      kind,
      drinks: quantity,
      gramsPerDrink,
      totalGrams: round(gramsPerDrink * quantity, 1),
      machineGrams,
      deviationPct,
      source: "사용자 확정 계수",
    });
    if (deviationPct !== null && Math.abs(deviationPct) > config.driftTolerance * 100) {
      deviated.push({ name, deviationPct });
    }
    dailyGrams += gramsPerDrink * quantity;
    dailyUnits += machineUnits === null ? gramsPerDrink / config.powderUnitGrams : machineUnits * quantity;
    coffeeDrinks += quantity;
  }

  // 로그가 모든 커피 음료의 원두를 같은 값으로 기록하면, 로그는 '잔당 g'이 아니라 '1회' 카운트다.
  // 그때는 로그×10을 잔당 g으로 읽지 않고, 한 줄로 남긴다.
  const unresolved = [];
  if (rows.length > 1) {
    const values = rows.map((row) => row.machineGrams).filter((value) => value !== null);
    const uniform = values.length === rows.length && Math.max(...values) - Math.min(...values) < 0.01;
    if (uniform) {
      unresolved.push(
        `원료 소모 일지가 모든 커피 음료의 원두를 ${rows[0].machineGrams}g(1.00)으로 똑같이 기록했습니다 — 로그가 잔당 g이 아니라 '1회' 카운트라서 확정 계수와의 차이(${deviated
          .map((row) => `${row.name} ${row.deviationPct > 0 ? "+" : ""}${row.deviationPct}%`)
          .join(" · ")})는 캘리브레이션 판단 근거로 쓰지 않았습니다.`,
      );
    }
  }

  const bean = (loyalsuns.inventory ?? []).find((item) => item.material === "원두");
  const stockGrams = bean ? round(bean.pct * config.gramsPerPct, 1) : null;
  const avgGramsPerDrink = coffeeDrinks > 0 ? dailyGrams / coffeeDrinks : null;
  const dailyGramsWithBurst = dailyGrams * burst.coffeeWeight;

  return {
    method:
      "잔당 원두 g = 사용자 확정 계수(아메리카노 9g · 투샷 15g · 카페라떼 7g · 아샷추 7g). 일 소모 = Σ(음료별 판매 수량 × 잔당 g). 기계 로그 역산값(로그×10)과 나란히 표시.",
    rows,
    coffeeDrinks,
    dailyUnits: round(dailyUnits, 2),
    dailyGrams: round(dailyGrams, 1),
    avgGramsPerDrink: round(avgGramsPerDrink, 1),
    dailyGramsWithBurst: round(dailyGramsWithBurst, 1),
    stockPct: bean?.pct ?? null,
    stockGrams,
    daysLeftPlain: stockGrams && dailyGrams ? round(stockGrams / dailyGrams, 1) : null,
    daysLeftWithBurst: stockGrams && dailyGramsWithBurst ? round(stockGrams / dailyGramsWithBurst, 1) : null,
    servingsLeft: stockGrams && avgGramsPerDrink ? Math.floor(stockGrams / avgGramsPerDrink) : null,
    unitBasis: loyalsuns.unitBasis ?? null,
    refillLog: loyalsuns.refillLog ?? [],
    unresolved,
  };
}

/* ------------------------------------------------------------------ */
/* 4. 잔여일 · 안전재고                                                 */
/* ------------------------------------------------------------------ */

export function stockForecast(snapshot, demand, burst, config = DEFAULT_CONFIG, overrides = {}) {
  const inventory = snapshot.loyalsuns?.inventory ?? [];
  const rows = [];

  for (const item of inventory) {
    const isCup = /컵/.test(item.material);
    const demandEntry = demand.byMaterial.find((entry) => entry.material === item.material);
    const basePerDay = overrides[item.material] ?? demandEntry?.amount ?? 0;
    const perDay = basePerDay * burst.coffeeWeight;
    const onHand = item.pct * (isCup ? config.cupsPerPct : config.gramsPerPct);
    const safety = config.safetyDays[item.material] ?? config.safetyDays.default;
    const daysLeft = perDay > 0 ? onHand / perDay : null;

    rows.push({
      material: item.material,
      slot: item.slot,
      pct: item.pct,
      unit: isCup ? "개" : "g",
      units: round(onHand, 1),
      unitsPerDay: round(perDay, 1),
      daysLeft: round(daysLeft, 1),
      safetyDays: safety,
      status:
        item.pct <= 0
          ? "empty"
          : daysLeft !== null && daysLeft <= safety
            ? "below-safety"
            : item.pct <= config.cupRiskPct && /컵/.test(item.material)
              ? "watch"
              : "ok",
    });
  }

  return rows.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
}

/* ------------------------------------------------------------------ */
/* 5. 출력(프린트) 측 수요 — 토너/용지                                  */
/* ------------------------------------------------------------------ */

export function printForecast(snapshot, burst, config = DEFAULT_CONFIG) {
  const escal = snapshot.escalprint ?? {};
  const toner = escal.toner ?? {};
  const paper = escal.paper ?? {};

  const trayAvgPct = ((paper.tray1 ?? 0) + (paper.tray2 ?? 0)) / 2;
  const tonerAvgPct =
    [toner.k, toner.c, toner.m, toner.y].filter((value) => typeof value === "number").reduce((sum, v) => sum + v, 0) /
    Math.max([toner.k, toner.c, toner.m, toner.y].filter((value) => typeof value === "number").length, 1);

  // 하루 출력량은 누적 카운터 2점이 있어야 확정된다. 오늘은 1점뿐이므로 "추정 불가"로 남긴다.
  const hasCounterHistory = Array.isArray(escal.counterHistory) && escal.counterHistory.length >= 2;

  // 단가는 화면의 발주 카탈로그에서 읽는다(지점마다 모델·단가가 다르다).
  // 카탈로그에 없을 때만 아래 기본값을 쓴다.
  const catalog = escal.catalog ?? [];
  const freeThreshold = escal.shipping?.freeThreshold ?? config.freeShippingThreshold;
  const paperItem = catalog.find((item) => item.category === "용지" && /A4 75g/.test(item.name));
  const paperUnit = paperItem?.unit ?? "BOX";
  const boxPrice = paperItem?.price ?? 22800;
  const minBoxes = paperItem?.minQty ?? 5;

  const tonerSuffix = { k: "KK", c: "KC", m: "KM", y: "KY" };
  const tonerItem = (color) =>
    catalog.find((item) => item.category === "토너" && item.name.toUpperCase().includes(tonerSuffix[color]));
  const tonerFallback = { k: 127000, c: 209700, m: 209700, y: 209700 };
  const tonerPrice = (color) => tonerItem(color)?.price ?? tonerFallback[color];
  const tonerLabel = (color) => tonerItem(color)?.name ?? `토너 ${color.toUpperCase()}`;
  const colors = ["k", "c", "m", "y"];
  const allTonerLow = colors.every((color) => typeof toner[color] === "number" && toner[color] <= 10);

  const actions = [];
  if ((paper.tray1 ?? 100) <= 35 || (paper.tray2 ?? 100) <= 35) {
    const baseBoxes = minBoxes;
    const bestValueBoxes =
      baseBoxes * boxPrice >= freeThreshold
        ? baseBoxes
        : Math.ceil(freeThreshold / boxPrice);
    actions.push({
      sku: "A4 75g 2500매",
      owner: "hq_print",
      reason: `Tray1 ${paper.tray1}% · Tray2 ${paper.tray2}% (학사 버스트 ${burst.printWeight}배)`,
      options: [
        { boxes: baseBoxes, amount: baseBoxes * boxPrice, shipping: baseBoxes * boxPrice < freeThreshold },
        {
          boxes: bestValueBoxes,
          amount: bestValueBoxes * boxPrice,
          shipping: bestValueBoxes * boxPrice < freeThreshold,
        },
      ],
      recommendBoxes: bestValueBoxes,
      unit: paperUnit,
    });
  }

  if (allTonerLow) {
    // 4색이 모두 바닥이면 한 색씩 따로 사는 것보다 세트로 한 번에 채우는 편이 싸고 빠르다.
    const setPrice = colors.reduce((sum, color) => sum + tonerPrice(color), 0);
    actions.push({
      sku: "4색 정품토너 세트 (K+C+M+Y)",
      owner: "hq_print",
      reason: `토너 K ${toner.k}% · C ${toner.c}% · M ${toner.m}% · Y ${toner.y}% — 4색 동시 소진(학사 버스트 ${burst.printWeight}배)`,
      options: [
        { count: 1, amount: setPrice, shipping: setPrice < freeThreshold },
        { count: 2, amount: setPrice * 2, shipping: setPrice * 2 < freeThreshold },
      ],
      recommendCount: 1,
      labels: colors.map((color) => tonerLabel(color)),
      priceBasis: "발주 카탈로그 단가(VAT 별도)",
    });
  } else if ((toner.k ?? 100) <= 35) {
    const kPrice = tonerPrice("k");
    actions.push({
      sku: tonerLabel("k"),
      owner: "hq_print",
      reason: `검정 토너 ${toner.k}% — 시험기간 출력 증가 구간`,
      options: [{ count: 1, amount: kPrice, shipping: kPrice < freeThreshold }],
      recommendCount: 1,
      priceBasis: "발주 카탈로그 단가(VAT 별도)",
    });
  }

  return {
    toner,
    paper,
    trayAvgPct: round(trayAvgPct, 1),
    tonerAvgPct: round(tonerAvgPct, 1),
    hasCounterHistory,
    cumulativePrintCount: escal.device?.cumulativePrintCount ?? null,
    nextParts: (escal.parts ?? [])
      .filter((part) => part.name.includes("급지롤러"))
      .map((part) => ({
        ...part,
        note: `${part.note ?? ""} — 누적 ${escal.device?.cumulativePrintCount?.toLocaleString("ko-KR") ?? "?"}매 기준 잔여 ${
          part.replaceEvery ? Math.max(part.replaceEvery - (escal.device?.cumulativePrintCount ?? 0), 0).toLocaleString("ko-KR") : "?"
        }매`,
      })),
    actions,
  };
}

/* ------------------------------------------------------------------ */
/* 6. 발주 제안 (사업자 분리)                                           */
/* ------------------------------------------------------------------ */

const COFFEE_PACKS = {
  원두: { packLabel: "원두 1박스(1kg)", unitUnits: 1000, price: 165000, owner: "franchisee_cafe" },
  우유: { packLabel: "우유 파우더 1박스", unitUnits: 500, price: 78000, owner: "franchisee_cafe" },
  초코: { packLabel: "초코 파우더 1박스", unitUnits: 500, price: 82000, owner: "franchisee_cafe" },
  얼그레이: { packLabel: "얼그레이 파우더 1박스", unitUnits: 500, price: 85000, owner: "franchisee_cafe" },
  바닐라: { packLabel: "바닐라 파우더 1박스", unitUnits: 500, price: 84000, owner: "franchisee_cafe" },
  청포도시럽: { packLabel: "시럽 1병", unitUnits: 100, price: 12000, owner: "franchisee_cafe" },
  복숭아시럽: { packLabel: "시럽 1병", unitUnits: 100, price: 12000, owner: "franchisee_cafe" },
  사과시럽: { packLabel: "시럽 1병", unitUnits: 100, price: 12000, owner: "franchisee_cafe" },
  레몬시럽: { packLabel: "시럽 1병", unitUnits: 100, price: 12000, owner: "franchisee_cafe" },
  종이컵: { packLabel: "종이컵 1박스(1,000개)", unitUnits: 1000, price: 38000, owner: "franchisee_cafe" },
  투명컵: { packLabel: "투명컵 1박스(1,000개)", unitUnits: 1000, price: 42000, owner: "franchisee_cafe" },
};

/**
 * 잔여일 < 안전일수(또는 0%) 재료를 발주 제안으로 바꾼다.
 * pack 단위는 사내 발주 카탈로그 값을 쓰되, 카탈로그에 없는 커피 재료는
 * packLabel/price를 null 로 두고 "확인 필요"로 표시한다(값을 지어내지 않는다).
 */
export function orderProposals(snapshot, stock, print, config = DEFAULT_CONFIG) {
  const proposals = [];

  for (const row of stock) {
    const needsOrder = row.status === "empty" || row.status === "below-safety";
    if (!needsOrder) continue;
    const pack = COFFEE_PACKS[row.material] ?? null;
    const daily = row.unitsPerDay || 0;
    const targetDays = row.safetyDays + 7;
    const needUnits = Math.max(targetDays * daily - row.units, pack ? pack.unitUnits : 0);
    const packs = pack ? Math.max(1, Math.ceil(needUnits / pack.unitUnits)) : 1;

    const squash = (value) => String(value ?? "").replace(/\s+/g, "");
    const refill = (snapshot.loyalsuns?.refillLog ?? []).find((entry) => squash(entry.slot).includes(squash(row.material)));
    proposals.push({
      domain: "cafe",
      material: row.material,
      owner: pack?.owner ?? "franchisee_cafe",
      pct: row.pct,
      daysLeft: row.daysLeft,
      quantity: packs,
      packLabel: pack?.packLabel ?? null,
      amount: pack ? pack.price * packs : null,
      reason:
        (row.pct <= 0
          ? `${row.slot} ${row.material} 0.00% — 이미 판매 불가 상태`
          : `${row.material} ${row.pct}% · 잔여 ${row.daysLeft}일 (안전 ${row.safetyDays}일)`) +
        (refill ? ` · 보충 로그 ${refill.at.slice(5, 16)} 청산(${refill.beforePct}%→${refill.afterPct}%) — 리필 장입 여부 확인` : ""),
      needsQuote: true,
      priceBasis: "추정 단가 — 공급사 견적 확인 필요",
    });
  }

  for (const action of print.actions) {
    proposals.push({
      domain: "print",
      material: action.sku,
      owner: action.owner,
      quantity: action.recommendBoxes ?? action.recommendCount ?? 1,
      packLabel: action.recommendBoxes ? `BOX ${action.recommendBoxes}개` : "1개",
      amount:
        action.options?.find(
          (option) =>
            (option.boxes !== undefined && option.boxes === action.recommendBoxes) ||
            (option.count !== undefined && option.count === action.recommendCount),
        )?.amount ?? null,
      reason: action.reason,
      needsQuote: false,
      shippingNote:
        action.options?.find((option) => option.boxes !== undefined && option.boxes === action.recommendBoxes)?.shipping
          ? "20만원 미만 — 배송비 발생"
          : "무료배송 충족",
    });
  }

  const byOwner = {};
  for (const proposal of proposals) {
    byOwner[proposal.owner] = byOwner[proposal.owner] ?? { count: 0, amount: 0, unknownAmount: 0 };
    byOwner[proposal.owner].count += 1;
    if (proposal.amount === null) byOwner[proposal.owner].unknownAmount += 1;
    else byOwner[proposal.owner].amount += proposal.amount;
  }

  return { proposals, byOwner };
}

/* ------------------------------------------------------------------ */
/* 7. 매출 위험 · 복구 우선순위                                          */
/* ------------------------------------------------------------------ */

export function revenueAtRisk(snapshot) {
  const loyalsuns = snapshot.loyalsuns ?? {};
  const orders = loyalsuns.orders?.today ?? [];
  const icedRevenue = orders
    .filter((order) => /아이스|ICED/i.test(order.product))
    .reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
  const totalRevenue = orders.reduce((sum, order) => sum + (Number(order.amount) || 0), 0);
  const icedShare = totalRevenue > 0 ? icedRevenue / totalRevenue : null;

  const items = [];

  const recipes = loyalsuns.recipes ?? [];

  for (const shortage of loyalsuns.shortages ?? []) {
    const affectedMenus = recipes
      .filter((recipe) => (recipe.rows ?? []).some((row) => row.material === shortage.material))
      .map((recipe) => recipe.product);
    const directImpact =
      shortage.material === "투명컵" || shortage.material === "종이컵"
        ? icedRevenue
        : shortage.material === "원두"
          ? totalRevenue
          : null;

    items.push({
      material: shortage.material,
      slot: shortage.slot,
      pct: shortage.pct,
      affectedMenus,
      revenueAtRiskPerDay: directImpact,
      icedShare: round(icedShare, 2),
      priority: shortage.pct <= 0 ? 1 : 2,
      action: /컵|뚜껑/.test(shortage.material)
        ? "매장에서 직접 채우는 슬롯입니다 — 기계 재고 칸을 0%로 두면 주문마다 조기 경보가 쌓이니 '재고 정상'으로 맞춰 두세요"
        : affectedMenus.length === 0
          ? "레시피에 이 재료를 쓰는 메뉴가 확인되지 않음 — 재료명/슬롯 매핑 확인 후 판매중지 여부 결정"
          : `영향 메뉴 ${affectedMenus.join(", ")} — 즉시 보충 또는 판매 중지`,
    });
  }

  return {
    todayRevenue: totalRevenue,
    icedRevenue,
    icedShare: round(icedShare, 2),
    items: items.sort((a, b) => a.priority - b.priority),
  };
}

/* ------------------------------------------------------------------ */
/* 8. 통합 매출 뷰                                                     */
/* ------------------------------------------------------------------ */

export function unifiedRevenue(snapshot, today) {
  const coffee = snapshot.loyalsuns?.revenue ?? {};
  const print = snapshot.escalprint?.revenue ?? {};

  const coffeeMonth = Number(coffee.month) || 0;
  const dayOfMonth = Number(today.slice(8, 10));
  const coffeeDailyRate = coffeeMonth > 0 ? coffeeMonth / Math.max(dayOfMonth, 1) : null;

  const printMonths = print.history ?? [];
  const printLatest = printMonths.find((entry) => entry.month === print.month) ?? null;
  const printPrev = printMonths.find((entry) => entry.month === print.prevMonth?.month) ?? null;

  const blendedDailyRate =
    coffeeDailyRate !== null && printPrev?.total
      ? coffeeDailyRate + printPrev.total / 31
      : coffeeDailyRate;

  return {
    coffee: {
      today: coffee.today ?? null,
      yesterday: coffee.yesterday ?? null,
      month: coffee.month ?? null,
      cumulativeTotal: coffee.cumulativeTotal ?? null,
      dailyRate: round(coffeeDailyRate, 0),
      trendPct:
        coffee.today && coffee.yesterday
          ? round(((coffee.today - coffee.yesterday) / coffee.yesterday) * 100, 1)
          : null,
    },
    print: {
      month: print.month ?? null,
      total: print.total ?? null,
      prevMonth: printPrev,
      refund: print.refund ?? null,
      currentMonthPending: print.currentMonth === null,
      history: [...printMonths].sort((a, b) => (a.month < b.month ? 1 : -1)),
      trendPct: printLatest?.changePct ?? null,
    },
    blended: {
      dailyRate: round(blendedDailyRate, 0),
      monthlyRunRate: round((blendedDailyRate ?? 0) * 30, 0),
      basis:
        "커피는 당월 누적(1~23일)÷일수, 프린트는 직전 청구월 실매출÷31일로 일평균을 낸 뒤 합산 — 기간이 달라 방향성 지표로만 사용",
    },
  };
}

/* ------------------------------------------------------------------ */
/* 9. 전체 분석                                                        */
/* ------------------------------------------------------------------ */

export function analyze(snapshot, config = DEFAULT_CONFIG) {
  const today = kstDate(snapshot.capturedAt);
  const burst = calendarBurst(snapshot.escalprint?.calendar ?? [], today);
  const demand = expectedDemand(snapshot.loyalsuns ?? {}, config);
  const bean = beanConsumption(snapshot, burst, config);
  const drift = driftReport(snapshot, config);
  // 원두는 사용자 확정 계수로 계산한 일 소모를 재고 예측의 기준으로 삼는다.
  const stock = stockForecast(snapshot, demand, burst, config, { 원두: bean.dailyGrams });
  const print = printForecast(snapshot, burst, config);
  const orders = orderProposals(snapshot, stock, print, config);
  const revenue = unifiedRevenue(snapshot, today);
  const risk = revenueAtRisk(snapshot);

  const assumptions = [
    "재고 % → 실제 단위: 연동 펌프는 보충 로그로 1% = 10ml 확인(사과시럽 985% ↔ 9,853ml). 분말·원두는 같은 계열로 1% = 10g 가정, 컵은 1% = 1개.",
    "원두 잔당 g은 사용자 확정 계수(아메리카노 9 · 투샷 15 · 카페라떼 7 · 아샷추 7)를 씁니다. 기계 로그 역산값(로그×10)은 대조용으로만 표시합니다.",
    `분말 레시피 g → 기계 단위 환산은 ${config.powderUnitGrams}g = 1단위로 역산했습니다(얼그레이 4.0g ↔ 로그 0.40).`,
    "컵 소모는 잔당 1개로 가정했습니다.",
    "프린트 일일 출력량은 누적 카운터 2점이 필요합니다 — 현재 스냅샷 1점이라 확정하지 않았습니다.",
    "커피 재료 단가는 사내 추정값이며, 실제 발주 단가는 공급사 견적 확인이 필요합니다(needsQuote 표시).",
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    storeCode: snapshot.storeCode,
    storeLabel: snapshot.storeLabel,
    capturedAt: snapshot.capturedAt,
    today,
    burst,
    demand,
    bean,
    drift,
    stock,
    print,
    orders,
    revenue,
    risk,
    assumptions,
    
  };
}

/* ------------------------------------------------------------------ */
/* 10. 사람이 읽는 보고서                                               */
/* ------------------------------------------------------------------ */

const won = (value) => (value === null || value === undefined ? "—" : `${Number(value).toLocaleString("ko-KR")}원`);

export function renderReport(analysis, snapshot) {
  const lines = [];
  const push = (line = "") => lines.push(line);

  push(`# 두 사이트 통합 운영 리포트 — ${analysis.storeLabel ?? analysis.storeCode} (${analysis.today})`);
  push();

  push("## 1. 통합 매출");
  push(`- 커피: 오늘 ${won(analysis.revenue.coffee.today)} · 어제 ${won(analysis.revenue.coffee.yesterday)} (${analysis.revenue.coffee.trendPct ?? "—"}%) · 이번달 ${won(analysis.revenue.coffee.month)}`);
  push(`- 프린트: ${analysis.revenue.print.month ?? "—"} 실매출 ${won(analysis.revenue.print.total)} (전월 ${won(analysis.revenue.print.prevMonth?.total)}, ${analysis.revenue.print.trendPct ?? "—"}%)`);
  push(`- 합산 일평균 ${won(analysis.revenue.blended.dailyRate)} → 월 환산 ${won(analysis.revenue.blended.monthlyRunRate)} (${analysis.revenue.blended.basis})`);
  push();

  push("## 2. 학사일정 버스트");
  push(`- 프린트 ${analysis.burst.printWeight}배 · 커피 ${analysis.burst.coffeeWeight}배`);
  for (const event of analysis.burst.events) {
    push(`  - ${event.title} (${event.phase}, 시작 ${event.daysToStart >= 0 ? `${event.daysToStart}일 전` : `${-event.daysToStart}일 경과`}) → ${event.weight}배`);
  }
  push();

  push("## 3. 오늘 판매 → 재료 수요");
  push(`- 음료 ${analysis.demand.drinkCount}잔 · 레시피 매핑 ${analysis.demand.covered.length}종${analysis.demand.uncovered.length ? ` · 미매핑 ${analysis.demand.uncovered.map((u) => u.name).join(", ")}` : ""}`);
  for (const item of analysis.demand.byMaterial) {
    push(`  - ${item.material}: ${item.units} 단위/일 (${item.from.join(" + ")})`);
  }
  push();

  push("## 3-1. 원두 소모율 · 잔여일 (판매 수량 × 잔당 g)");
  push(`- ${analysis.bean.method}`);
  for (const row of analysis.bean.rows) {
    const dev = row.deviationPct === null ? "" : ` · 기계 로그 역산(×10 가정) ${row.machineGrams}g (${row.deviationPct > 0 ? "+" : ""}${row.deviationPct}%)`;
    push(`  - ${row.product} ${row.drinks}잔 × ${row.gramsPerDrink}g = ${row.totalGrams}g (${row.source})${dev}`);
  }
  push(`- 커피 ${analysis.bean.coffeeDrinks}잔 → 일 원두 ${analysis.bean.dailyGrams}g · 버스트 반영 ${analysis.bean.dailyGramsWithBurst}g (잔당 평균 ${analysis.bean.avgGramsPerDrink}g)`);
  push(`- 원두 재고 ${analysis.bean.stockPct}% = ${analysis.bean.stockGrams}g → **${analysis.bean.daysLeftWithBurst}일** (평시 ${analysis.bean.daysLeftPlain}일, 잔여 약 ${analysis.bean.servingsLeft}잔)`);
  push();
  push("## 4. 잔여일");
  for (const row of analysis.stock) {
    if (row.unitsPerDay === 0 && row.pct > 100) continue;
    push(`- ${row.material}(${row.slot}) ${row.pct}% → ${row.daysLeft === null ? "수요 없음" : `${row.daysLeft}일`} [${row.status}]`);
  }
  push();

  push("## 5. 드리프트");
  push(`- ${analysis.drift.summary}`);
  for (const finding of analysis.drift.findings) {
    push(`  - [${finding.severity}] ${finding.type} · ${finding.product}/${finding.material ?? finding.detail} — ${finding.hint ?? ""}`);
  }
  push();

  push("## 6. 발주 제안");
  for (const proposal of analysis.orders.proposals) {
    push(
      `- [${proposal.owner}] ${proposal.material} ${proposal.quantity}${proposal.packLabel ? ` (${proposal.packLabel})` : ""} ${won(proposal.amount)}${proposal.needsQuote ? " · 단가 확인 필요" : ""} — ${proposal.reason}${proposal.shippingNote ? ` · ${proposal.shippingNote}` : ""}`,
    );
  }
  push(
    `- 사업자 합계: ${Object.entries(analysis.orders.byOwner)
      .map(([owner, value]) => `${owner} ${value.count}건 ${won(value.amount)}${value.unknownAmount ? ` (미정 ${value.unknownAmount}건)` : ""}`)
      .join(" · ")}`,
  );
  push();

  push("## 7. 매출 위험 · 복구 우선순위");
  for (const item of analysis.risk.items) {
    const impact =
      item.revenueAtRiskPerDay === null ? "영향 매출 미산정" : `위험 매출 ${won(item.revenueAtRiskPerDay)}/일`;
    push(`- ${item.material}(${item.slot}) ${item.pct}% · ${impact} — ${item.action}`);
  }
  push();

  push("## 8. 가정과 미확인");
  for (const assumption of analysis.assumptions) push(`- ${assumption}`);

  return lines.join("\n");
}
