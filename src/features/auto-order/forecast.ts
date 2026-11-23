import {
  BASELINE_DAYS,
  COVER_EXTRA_DAYS,
  CROSS_CLAMP,
  FORECAST_WINDOW_DAYS,
  RECENT_DAYS,
  resolveRules,
} from "./rules";
import { beanGramsForDrinks } from "./menu";
import { type CalibrationEntry, fullCapacityOf, isFreshlyReplaced } from "./calibration";
import type {
  AnomalyFlag,
  DataSource,
  DriverField,
  DomainKey,
  ForecastRun,
  PosDailySales,
  SkuForecast,
} from "./types";

/**
 * 이종 매출 교차 소진 예측 계산기.
 *
 * 계산 순서 (특허 청구항 (c))
 *   ① 기본 이동평균 — 주 도메인 운전값(음료 잔수 또는 출력 매수)의 최근 14일
 *      지수가중평균(감쇠 0.9). 오래된 날일수록 가중치가 0.9씩 줄어든다.
 *   ② 교차 보정 — 반대 도메인의 "최근 3일 평균 ÷ 직전 주 같은 요일 3일 평균" 비율 r을 구해
 *      ±40%로 자른 뒤, SKU별 교차 상관계수 w로
 *          crossFactor = 1 + w × clamp(r − 1, −0.4, +0.4)
 *      를 만든다. 프린트가 급증하면 컵·원두 소진이 함께 늘어나는 신호를 반영한다.
 *   ③ 이상 감지 — 한쪽 도메인만 기준선 대비 50% 이상 급락하고 다른 쪽은 80% 이상
 *      유지되면, 소모품 소진이 줄어든 것이 아니라 장비·결제 이상일 수 있으므로
 *      자동발주를 보류한다(held_anomaly).
 *   ④ 잔여일 = 현재고 ÷ 보정 후 일 소진량. 리드타임 + 안전재고일 안으로 들어오면
 *      발주 제안 대상이다.
 */

const DOMAIN_LABEL: Record<DomainKey, string> = {
  cafe: "음료 판매",
  print: "프린트 출력",
};

const DECAY = 0.9;

const DRIVER_VALUE: Record<DriverField, (row: PosDailySales) => number> = {
  drinks: (row) => row.drinksSold,
  beanGrams: (row) => row.beanGrams ?? beanGramsForDrinks(row.drinksSold),
  sheets: (row) => row.printSheets,
  colorSheets: (row) => row.colorSheets,
};

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance);
}

/** 최근값에 무게를 더 주는 지수가중평균. values는 **오래된 → 최신** 순서. */
function weightedMean(values: number[], decay = DECAY) {
  if (values.length === 0) return 0;

  let weighted = 0;
  let weights = 0;

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const age = values.length - 1 - index;
    const weight = decay ** age;
    weighted += values[index] * weight;
    weights += weight;
  }

  return weights > 0 ? weighted / weights : 0;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * 최근 3일 ÷ **직전 주 같은 요일 3일**(7일 전).
 *
 * 단순히 직전 7일 평균과 비교하면 주말·월요일 패턴이 교차 보정을 왜곡한다
 * (예: 금·토·일 급증은 요일 효과인데 프린트 수요 급증으로 읽힌다).
 * 같은 요일끼리 비교하면 요일 효과가 상쇄되어 순수한 수요 변화만 남는다.
 * 데이터가 10일 미만이면 직전 7일 평균으로 대체하고, 그보다 짧으면 1(변화 없음)이다.
 */
export function recentRatio(values: number[]) {
  if (values.length < RECENT_DAYS + 1) return 1;

  const recent = values.slice(-RECENT_DAYS);
  const lastWeekSameDays = values.slice(-(RECENT_DAYS + 7), -7);
  const fallback = values.slice(Math.max(0, values.length - RECENT_DAYS - BASELINE_DAYS), -RECENT_DAYS);
  const baseline = lastWeekSameDays.length === RECENT_DAYS ? lastWeekSameDays : fallback;

  if (baseline.length === 0) return 1;

  const base = mean(baseline);
  if (base <= 0) return 1;

  return mean(recent) / base;
}

/** 정렬·중복 제거. 같은 날짜가 여러 번 오면 마지막 값을 쓴다. */
export function normalizeSales(rows: PosDailySales[]) {
  const byDate = new Map<string, PosDailySales>();

  for (const row of rows) {
    if (!row || typeof row.salesDate !== "string") continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.salesDate)) continue;
    byDate.set(row.salesDate, row);
  }

  return [...byDate.values()].sort((a, b) => a.salesDate.localeCompare(b.salesDate));
}

function anomalyFor(cafeRatio: number, printRatio: number): AnomalyFlag[] {
  if (cafeRatio <= 0.5 && printRatio >= 0.8) {
    return [
      {
        code: "cafe_one_sided_collapse",
        title: "카페 매출만 급감 — 자동발주 보류",
        message:
          "음료 판매가 기준선의 50% 아래로 떨어졌는데 프린트 출력은 평소 수준입니다. 소모품이 덜 나간 것이 아니라 커피머신·결제·재고 신호 이상일 수 있어 발주를 멈췄습니다.",
        cafeRatio,
        printRatio,
      },
    ];
  }

  if (printRatio <= 0.5 && cafeRatio >= 0.8) {
    return [
      {
        code: "print_one_sided_collapse",
        title: "프린트 출력만 급감 — 자동발주 보류",
        message:
          "프린트 출력이 기준선의 50% 아래인데 음료 판매는 평소 수준입니다. 복합기 고장·용지 걸림·결제 단절 가능성이 있어 발주를 멈췄습니다.",
        cafeRatio,
        printRatio,
      },
    ];
  }

  return [];
}

function evidenceLine(input: {
  crossDomain: DomainKey;
  crossRatio: number;
  crossFactor: number;
  weight: number;
  perUnit: number;
  stockUnit: string;
}) {
  const change = Math.round((input.crossRatio - 1) * 100);
  const changeText = `${change >= 0 ? "+" : ""}${change}%`;
  const label = DOMAIN_LABEL[input.crossDomain];

  if (Math.abs(input.crossFactor - 1) < 0.005) {
    return `${label} 최근 3일 ${changeText} → 교차 보정 없음 (×1.00)`;
  }

  return `${label} 최근 3일 ${changeText} → 소진 ×${input.crossFactor.toFixed(2)} (교차 가중 ${input.weight})`;
}

export type ForecastInput = {
  storeCode: string;
  storeLabel: string;
  rows: PosDailySales[];
  dataSource: DataSource;
  /**
   * 포털 실측 잔량(토너 K % · 용지 트레이 %)으로 덮어쓸 현재고.
   * 값이 있는 SKU만 실측을 쓰고, 없으면 BOM 기본 현재고를 쓴다.
   * 키는 SKU, 값은 소모 단위(g·매·개).
   */
  stockOverrides?: Record<string, number>;
  /**
   * 교체완료 피드백 루프 — SKU별 학습 계수와 마지막 교체 시각.
   * 교체 직후 24시간이면 현재고를 '가득'으로 되돌리고, 계수는 일 소진량에 곲한다.
   */
  calibration?: Record<string, CalibrationEntry>;
  /** 학습 판정 기준 시각(테스트 주입용). 기본은 지금. */
  now?: Date;
};

/** 한 지점의 예측 1회 실행. */
export function forecastStore(input: ForecastInput): ForecastRun {
  const allRows = normalizeSales(input.rows);
  const rules = resolveRules();

  // 도메인별로 '보고된 날'만 시계열로 쓴다. 한쪽 포털만 들어온 날을 0으로 읽지 않기 위함.
  const cafeRows = allRows.filter((row) => row.cafeReported !== false);
  const printRows = allRows.filter((row) => row.printReported !== false);

  const windowRows = allRows.slice(-FORECAST_WINDOW_DAYS);
  const drinks = cafeRows.slice(-FORECAST_WINDOW_DAYS).map((row) => row.drinksSold);
  const beanGrams = cafeRows
    .slice(-FORECAST_WINDOW_DAYS)
    .map((row) => (typeof row.beanGrams === "number" ? row.beanGrams : beanGramsForDrinks(row.drinksSold)));
  const sheets = printRows.slice(-FORECAST_WINDOW_DAYS).map((row) => row.printSheets);
  const colorSheets = printRows.slice(-FORECAST_WINDOW_DAYS).map((row) => row.colorSheets);

  const seriesByDriver: Record<DriverField, number[]> = { drinks, beanGrams, sheets, colorSheets };

  const driverWindow: Record<DriverField, number[]> = {
    drinks,
    beanGrams,
    sheets,
    colorSheets,
  };

  const baseByDriver: Record<DriverField, number> = {
    drinks: weightedMean(driverWindow.drinks),
    beanGrams: weightedMean(driverWindow.beanGrams),
    sheets: weightedMean(driverWindow.sheets),
    colorSheets: weightedMean(driverWindow.colorSheets),
  };

  const ratioByDriver: Record<DriverField, number> = {
    drinks: recentRatio(seriesByDriver.drinks),
    beanGrams: recentRatio(seriesByDriver.beanGrams),
    sheets: recentRatio(seriesByDriver.sheets),
    colorSheets: recentRatio(seriesByDriver.colorSheets),
  };

  const cafeRatio = ratioByDriver.drinks;
  const printRatio = ratioByDriver.sheets;
  const anomalies = anomalyFor(cafeRatio, printRatio);

  const asOfDate = allRows.length > 0 ? allRows[allRows.length - 1].salesDate : "";
  const totalSheets = mean(sheets);
  const colorShare = totalSheets > 0 ? mean(colorSheets) / totalSheets : 0;

  const forecasts: SkuForecast[] = rules.map((rule) => {
    const baseDriver = baseByDriver[rule.driverField];
    const crossRatio = ratioByDriver[rule.crossDriverField];
    const crossFactor = round(1 + rule.crossDomainWeight * Math.max(-CROSS_CLAMP, Math.min(CROSS_CLAMP, crossRatio - 1)), 3);

    const override = input.stockOverrides?.[rule.sku];
    const hasOverride = typeof override === "number" && Number.isFinite(override);
    const calibration = input.calibration?.[rule.sku] ?? null;
    const calibrationFactor =
      calibration && Number.isFinite(calibration.factor) && calibration.factor > 0
        ? calibration.factor
        : 1;

    // 교체 직후에는 포털 실측(%)이 낡은 값이다. 가득으로 되돌린 값을 우선한다.
    const freshlyReplaced = isFreshlyReplaced(calibration, input.now);
    const stockOnHand = freshlyReplaced
      ? fullCapacityOf(calibration, rule.sku)
      : hasOverride
        ? Math.max(0, override as number)
        : rule.stockOnHand;
    const stockSource: "manual" | "telemetry" = freshlyReplaced
      ? "manual"
      : hasOverride
        ? "telemetry"
        : "manual";

    const baseDailyConsumption = round(baseDriver * rule.consumptionPerDriverUnit, 3);
    const predictedDailyConsumption = round(baseDailyConsumption * crossFactor * calibrationFactor, 3);
    const remainingDays =
      predictedDailyConsumption > 0 ? round(stockOnHand / predictedDailyConsumption, 1) : 999;
    const reorderPointDays = rule.leadTimeDays + rule.safetyStockDays;
    const due = remainingDays <= reorderPointDays;

    const targetDays = rule.leadTimeDays + rule.safetyStockDays + COVER_EXTRA_DAYS;
    const need = targetDays * predictedDailyConsumption - stockOnHand;
    const rawQty = need > 0 ? Math.ceil(need / rule.packSize) : 0;
    const suggestedQty = Math.min(rule.maxOrderQty, rawQty);
    const cappedByMax = rawQty > rule.maxOrderQty;

    const cv = baseDriver > 0 ? stdev(seriesByDriver[rule.driverField]) / baseDriver : 1;
    const windowFactor = windowRows.length >= 7 ? 1 : 0.5;
    const confidence = round(Math.max(0.3, Math.min(0.97, (1 - cv * 2) * windowFactor)), 2);

    return {
      sku: rule.sku,
      name: rule.name,
      spec: rule.spec,
      ownerEntityType: rule.ownerEntityType,
      primaryDomain: rule.primaryDomain,
      supplier: rule.supplier,
      baseDailyConsumption,
      crossFactor,
      crossDriverRatio: round(crossRatio, 3),
      predictedDailyConsumption,
      stockOnHand: round(stockOnHand, 1),
      stockUnit: rule.stockUnit,
      remainingDays,
      leadTimeDays: rule.leadTimeDays,
      safetyStockDays: rule.safetyStockDays,
      reorderPointDays,
      due,
      suggestedQty,
      cappedByMax,
      packLabel: rule.packLabel,
      unitPrice: rule.unitPrice,
      amount: suggestedQty * rule.unitPrice,
      confidence,
      stockSource,
      stockNote: freshlyReplaced
        ? `교체완료 ${new Date(calibration?.lastReplacedAt ?? Date.now()).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" })} · 가득 ${Math.round(stockOnHand).toLocaleString("ko-KR")}${rule.stockUnit}`
        : hasOverride
          ? `실측 ${Math.round(stockOnHand).toLocaleString("ko-KR")}${rule.stockUnit} (포털 ${rule.stockSignal ?? "신호"})`
          : undefined,
      evidenceLine: evidenceLine({
        crossDomain: rule.crossDomain,
        crossRatio,
        crossFactor,
        weight: rule.crossDomainWeight,
        perUnit: rule.consumptionPerDriverUnit,
        stockUnit: rule.stockUnit,
      }),
      calibrationFactor,
      lastReplacedAt: calibration?.lastReplacedAt ?? null,
    };
  });

  return {
    storeCode: input.storeCode,
    storeLabel: input.storeLabel,
    asOfDate,
    windowDays: windowRows.length,
    rowCount: allRows.length,
    cafeDailyAvg: round(mean(seriesByDriver.drinks), 1),
    printDailyAvg: round(mean(seriesByDriver.sheets), 1),
    colorSheetShare: round(colorShare, 3),
    cafeRecentRatio: round(cafeRatio, 3),
    printRecentRatio: round(printRatio, 3),
    anomalies,
    hold: anomalies.length > 0,
    forecasts,
    dataSource: input.dataSource,
  };
}

export { DRIVER_VALUE, DOMAIN_LABEL };
