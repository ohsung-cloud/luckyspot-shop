import { formatWon, type MonthlySummary } from "./monthly";

/**
 * 점주 실마진(예상 순수익) — 화면·API·테스트가 같이 쓰는 순수 계산.
 *
 * 왜 필요한가
 *  - 매출만 보이면 "이번 달 얼마 벌었나"를 점주가 직접 계산해야 한다.
 *    매출 히어로 카드에 **한 줄 요약**만 얹고, 탭하면 계산 내역을 펼친다(기본 화면 과밀 없음).
 *
 * 계산식(사용자 지정, 2026-11-25)
 *   커피 매출 × 78%   (원가·변동비 22% 제외 — 카페 기준 공헌이익률 78%)
 * + 프린트 매출 × 75%  (변동비·로열티 25% 제외 — 프린트 매출 기준 공헌이익률 75%)
 * − 월 고정비 × (이번달은 경과일 비율, 저번달은 전액)
 * = 예상 순수익, 마진율 = 순수익 ÷ 매출
 *
 * 지켜야 할 것
 *  - 지점 숫자는 합산하지 않는다(이 파일도 지점 하나의 월 요약만 받는다).
 *  - 모르는 값은 0으로 채우지 않는다. 프린트가 '26일 정산 전'이면 프린트 몫을 빼고
 *    `partial`로 표시해 "확인된 항목만" 계산했음을 밝힌다.
 */

/**
 * 커피 원가·변동비 비율 — 매출 대비.
 * 사용자 확정(2026-11-25): 공헌이익률 78%, 원가·변동비 22%.
 *  - "매출에서 22프로정도를 가감하면 됨. 400만원 매출이면 88만원 정도를 빼면 되는거야." (400만 × 22% = 88만)
 */
export const COFFEE_MATERIAL_RATE = 0.22;

/**
 * 프린트 변동비 + 로열티 비율 — 매출 대비.
 * 사용자 확정(2026-11-25, 순수익 계산식 1안): 공헌이익률 75%, 변동비·로열티 25%.
 */
export const PRINT_VARIABLE_RATE = 0.25;

/** 화면 표기용 공헌이익률(%) — 커피 78 · 프린트 75 */
export const COFFEE_CONTRIBUTION_PCT = Math.round((1 - COFFEE_MATERIAL_RATE) * 100);
export const PRINT_CONTRIBUTION_PCT = Math.round((1 - PRINT_VARIABLE_RATE) * 100);

export type MonthlyFixedCost = {
  /** 임대료 */
  rent: number;
  /** 관리비 */
  maintenance: number;
  /** 인터넷·통신 */
  internet: number;
  /** POS·발주 솔루션 이용료 */
  solution: number;
};

export const EMPTY_FIXED_COST: MonthlyFixedCost = {
  rent: 0,
  maintenance: 0,
  internet: 0,
  solution: 0,
};

/**
 * 지점별 기본 고정비(월, 원).
 *  - 본사가 `/admin/stores`에서 언제든 고칠 수 있는 **초기값**이다.
 *  - 임대료는 대표가 확인한 2026-11 실제 월세다(6개 지점).
 *    관리비·인터넷·솔루션료는 지점별 실측이 들어오기 전까지 기존 값을 그대로 둔다.
 *  - 지점 코드는 `features/stores/registry.ts` 시드와 같다. 새 매장을 만들 때도
 *    이 표의 코드를 쓰면 같은 고정비로 시작한다.
 */
export const DEFAULT_FIXED_COST: Record<string, MonthlyFixedCost> = {
  // 강남구청역점(1평 샵인샵) — 실제 월세 170만원.
  STORE_GNM: { rent: 1_700_000, maintenance: 120_000, internet: 33_000, solution: 55_000 },
  // 예전 코드(STORE_GNG, 강남구청점)도 같은 매장 — 같은 월세를 쓴다.
  STORE_GNG: { rent: 1_700_000, maintenance: 120_000, internet: 33_000, solution: 55_000 },
  // 한예종점(대학 상권 독립 매장) — 실제 월세 170만원.
  STORE_HYJ: { rent: 1_700_000, maintenance: 200_000, internet: 33_000, solution: 55_000 },
  // 평택점 — 실제 월세 30만원.
  STORE_PTK: { rent: 300_000, maintenance: 0, internet: 0, solution: 0 },
  // 예전 코드(STORE_PT)도 평택점 — 같은 월세를 쓴다.
  STORE_PT: { rent: 300_000, maintenance: 0, internet: 0, solution: 0 },
  // 충주점 — 실제 월세 30만원.
  STORE_CJ: { rent: 300_000, maintenance: 0, internet: 0, solution: 0 },
  // 선유로점 — 실제 월세 70만원.
  STORE_SYU: { rent: 700_000, maintenance: 0, internet: 0, solution: 0 },
  // 영등포시장역점 — 실제 월세 80만원.
  STORE_YDP: { rent: 800_000, maintenance: 0, internet: 0, solution: 0 },
};

export const FIXED_COST_LABELS: { key: keyof MonthlyFixedCost; label: string }[] = [
  { key: "rent", label: "임대료" },
  { key: "maintenance", label: "관리비" },
  { key: "internet", label: "인터넷" },
  { key: "solution", label: "솔루션료" },
];

export function normalizeFixedCost(input: Partial<MonthlyFixedCost> | null | undefined): MonthlyFixedCost {
  const pick = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

  return {
    rent: pick(input?.rent),
    maintenance: pick(input?.maintenance),
    internet: pick(input?.internet),
    solution: pick(input?.solution),
  };
}

export function fixedCostTotal(input: Partial<MonthlyFixedCost> | null | undefined): number {
  const cost = normalizeFixedCost(input);
  return cost.rent + cost.maintenance + cost.internet + cost.solution;
}

export function defaultFixedCost(code: string | null | undefined): MonthlyFixedCost {
  const key = (code ?? "").trim().toUpperCase();
  return normalizeFixedCost(DEFAULT_FIXED_COST[key] ?? EMPTY_FIXED_COST);
}

export type ProfitLine = {
  label: string;
  amount: number | null;
  note?: string;
  tone?: "plus" | "minus" | "total";
};

export type ProfitEstimate = {
  period: MonthlySummary["period"];
  role: MonthlySummary["role"];
  monthLabel: string;
  /** 확인된 매출 합(부분일 수 있음) */
  revenue: number | null;
  coffeeRevenue: number | null;
  printRevenue: number | null;
  /** 커피·프린트별 공헌이익(매출 − 원가·변동비) */
  coffeeProfit: number | null;
  printProfit: number | null;
  /** 공헌이익 합 */
  grossProfit: number | null;
  fixedCostTotal: number;
  /** 이번달은 경과일 비율만 반영 */
  fixedCostApplied: number;
  prorated: boolean;
  proratedRatio: number;
  /** 예상 순수익 */
  net: number | null;
  /** 월말까지 같은 속도면의 예상 순수익(투영). 확정 월은 net과 같다. */
  projectedNet: number | null;
  /** 순수익 ÷ 매출 × 100 */
  marginRate: number | null;
  partial: boolean;
  lines: ProfitLine[];
  /** 화면에 그대로 쓰는 한 줄 근거 */
  note: string;
};

function kstParts(asOf: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(asOf);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** 그 달의 일수 */
export function daysInMonth(period: MonthlySummary["period"]): number {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 이번달 고정비 반영 비율 — 오늘이 그 달의 며칠인지 ÷ 그 달 일수.
 * 저번달(확정)은 1(전액). 다른 달이면 1로 둔다.
 */
export function proratedRatio(period: MonthlySummary["period"], asOf: Date): number {
  const total = daysInMonth(period);
  const today = kstParts(asOf);
  const [year, month] = period.split("-").map(Number);

  if (today.year !== year || today.month !== month) return 1;
  return Math.min(1, Math.max(0, today.day / total));
}

export function estimateProfit(input: {
  month: MonthlySummary | null;
  fixedCost?: Partial<MonthlyFixedCost> | null;
  asOf?: Date;
}): ProfitEstimate | null {
  const { month } = input;
  if (!month) return null;

  const asOf = input.asOf ?? new Date();
  const ratio = proratedRatio(month.period, asOf);
  const fixedTotal = fixedCostTotal(input.fixedCost);
  const fixedApplied = Math.round(fixedTotal * ratio);

  const coffeeRevenue = month.coffee.amount;
  const printRevenue = month.print.amount;

  const coffeeProfit =
    coffeeRevenue === null ? null : Math.round(coffeeRevenue * (1 - COFFEE_MATERIAL_RATE));
  const printProfit = printRevenue === null ? null : Math.round(printRevenue * (1 - PRINT_VARIABLE_RATE));

  const known = [coffeeProfit, printProfit].filter((value): value is number => value !== null);
  const grossProfit = known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null;
  const net = grossProfit === null ? null : grossProfit - fixedApplied;
  // 경과 비율로 월말까지 투영 — 이번 달은 "지금 속도면 월말 얼마"를 보여 준다.
  const projectedContribution = grossProfit === null ? null : ratio > 0 ? Math.round(grossProfit / ratio) : null;
  const projectedNet = projectedContribution === null ? null : projectedContribution - fixedTotal;
  const marginRate =
    net === null || month.total === null || month.total <= 0 ? null : (net / month.total) * 100;

  const lines: ProfitLine[] = [
    {
      label: `커피 매출 × 공헌이익 ${COFFEE_CONTRIBUTION_PCT}%`,
      amount: coffeeProfit,
      note:
        coffeeRevenue === null
          ? "이번 달 커피 미수집"
          : `${formatWon(coffeeRevenue)} · 원가·변동비 ${Math.round(COFFEE_MATERIAL_RATE * 100)}% 제외`,
      tone: "plus",
    },
    {
      label: `프린트 매출 × 공헌이익 ${PRINT_CONTRIBUTION_PCT}%`,
      amount: printProfit,
      note:
        printRevenue === null
          ? month.print.note ?? "정산 전"
          : `${formatWon(printRevenue)} · 변동비·로열티 ${Math.round(PRINT_VARIABLE_RATE * 100)}% 제외`,
      tone: "plus",
    },
    {
      label: ratio < 1 ? `월 고정비 ${fixedTotal.toLocaleString("ko-KR")}원 × ${Math.round(ratio * 100)}%` : "월 고정비",
      amount: -fixedApplied,
      note: ratio < 1 ? `이번 달 ${Math.round(ratio * daysInMonth(month.period))}일 경과분` : "전액",
      tone: "minus",
    },
    { label: "예상 순수익", amount: net, tone: "total" },
  ];

  const note =
    net === null
      ? "매출이 아직 없어 순수익을 계산하지 않았습니다."
      : month.partial
        ? "프린트는 26일 정산 전이라 커피만 계산에 넣었습니다."
        : ratio < 1
          ? "이번 달 진행 중 — 고정비는 경과일만큼만 반영했습니다."
          : "확정 매출 기준 예상 순수익입니다.";

  return {
    period: month.period,
    role: month.role,
    monthLabel: month.monthLabel,
    revenue: month.total,
    coffeeRevenue,
    printRevenue,
    coffeeProfit,
    printProfit,
    grossProfit,
    fixedCostTotal: fixedTotal,
    fixedCostApplied: fixedApplied,
    prorated: ratio < 1,
    proratedRatio: ratio,
    net,
    projectedNet,
    marginRate,
    partial: month.partial,
    lines,
    note,
  };
}

/**
 * 손익분기(BEP)와 자동발주 모드 — 특허 1호 종속항(이종 사업자 교차예측 → 발주)의 계산부.
 *
 * 왜 필요한가
 *  - 점주가 진짜 궁금한 건 "이번 달 언제부터 남는 장사인가"와 "지금 발주를 한 번에 넣어도 되나"다.
 *  - 매출은 커피(POS)와 프린트(복합기)로 사업자가 다르지만, 고정비(월세·관리비…)는 대표 한 사람 몫이다.
 *    그래서 두 사업자의 실소모 원가를 뺀 **공헌이익**을 합쳐 고정비와 비교한다.
 *    - 커피 공헌이익 = 커피 매출 × 78%  (원가·변동비 22% 제외)
 *    - 프린트 공헌이익 = 프린트 매출 × 75%  (변동비·로열티 25% 제외)
 *    - 월 고정비 = 일할(그 달 일수로 나눔)로 매일 조금씩 소진된다
 *  - BEP 도달일 = 누적 공헌이익이 월 고정비를 넘는 날.
 *  - 발주 모드 = 월말까지 남는 현금(예상 순수익)이 이번 발주액을 덮으면 `일괄 발주`,
 *    못 덮으면 `분할 최소 발주`(급한 품목만 최소 수량) — 점주 현금이 마르지 않게 한다.
 *
 * 지켜야 할 것
 *  - 지점 숫자는 합산하지 않는다(이 함수도 지점 하나의 월 요약만 받는다).
 *  - 모르는 값은 0으로 채우지 않는다. 프린트가 '26일 정산 전'이면 커피만으로 계산하고 `partial`로 밝힌다.
 *  - 이 결과는 메인 화면에 노출하지 않는다 — 접힘 패널(`교차측정 · 특허 근거 보기`) 안에서만 보여 준다.
 */

export type OrderMode = "bulk" | "split_min";

export const ORDER_MODE_LABELS: Record<OrderMode, string> = {
  bulk: "일괄 발주",
  split_min: "분할 최소 발주",
};

/**
 * 신규 매장의 순수익을 미리 보기 위한 참고 매출 구성(커피 7 : 프린트 3).
 *  기존 지점 실측 비중(강남구청역점 10월 커피 77.5% · 한예종점 10월 75.6%)을
 *  프린트가 조금 더 잡히는 쪽으로 보수적으로 잡은 **가정값**이다. 화면에도 '참고'라고 밝힌다.
 */
export const REFERENCE_MIX = { coffee: 0.7, print: 0.3 } as const;

/** 참고 매출 구성 기준 평균 공헌이익률(≈70.1%) */
export const REFERENCE_CONTRIBUTION_RATE =
  REFERENCE_MIX.coffee * (1 - COFFEE_MATERIAL_RATE) + REFERENCE_MIX.print * (1 - PRINT_VARIABLE_RATE);

export type BepAndOrderMode = {
  period: MonthlySummary["period"];
  monthLabel: string;
  /** 그 달 일수 */
  monthDays: number;
  /** 오늘까지 경과일 (확정 월이면 그 달 전체) */
  elapsedDays: number;
  /** 확인된 매출 합 */
  revenue: number | null;
  /** 확인된 공헌이익 합 */
  contribution: number | null;
  /** 매출 대비 평균 공헌이익률(0~1) */
  contributionRate: number | null;
  /** 월 고정비 전액 */
  fixedCostTotal: number;
  /** 일할 고정비 = 월 고정비 ÷ 그 달 일수 */
  dailyFixedCost: number;
  /** 하루 평균 매출 */
  dailyRevenue: number | null;
  /** 하루 공헌이익 */
  dailyContribution: number | null;
  /** 손익분기 일매출 = 일할 고정비 ÷ 공헌이익률 */
  bepDailyRevenue: number | null;
  /** BEP 도달일(그 달 며칠) — 그 달 안에 못 넘으면 null */
  bepDay: number | null;
  /** 화면에 그대로 쓰는 도달일 문구 */
  bepLabel: string;
  /** 달성률 % = 누적 공헌이익 ÷ 월 고정비 × 100 */
  progressPct: number;
  reached: boolean;
  /** 월말까지 같은 속도면의 예상 순수익 */
  projectedNet: number | null;
  /** 3종 발주 예정액 */
  orderAmount: number;
  /** 여유 현금흐름 추정 = 월말 예상 순수익 − 발주 예정액 */
  freeCashFlow: number | null;
  /** 추천 발주 모드 — 발주 예정액이 없으면 null */
  mode: OrderMode | null;
  modeLabel: string;
  /** 한 줄 근거(화면 표시용) */
  reason: string;
  /** 프린트 정산 전 등으로 일부만 계산했는지 */
  partial: boolean;
};

export function computeBepAndOrderMode(input: {
  month: MonthlySummary | null;
  fixedCost?: Partial<MonthlyFixedCost> | null;
  asOf?: Date;
  /** 3종(원두·토너·용지) 발주 예정액. 없으면 발주 모드는 null. */
  orderAmount?: number | null;
}): BepAndOrderMode | null {
  const { month } = input;
  if (!month) return null;

  const asOf = input.asOf ?? new Date();
  const monthDays = daysInMonth(month.period);
  const ratio = proratedRatio(month.period, asOf);
  const elapsedDays = Math.max(1, Math.min(monthDays, Math.round(ratio * monthDays)));

  const fixedTotal = fixedCostTotal(input.fixedCost);
  const dailyFixedCost = fixedTotal / monthDays;

  const profit = estimateProfit({ month, fixedCost: input.fixedCost, asOf });
  const revenue = month.total;
  const contribution = profit?.grossProfit ?? null;
  const contributionRate = revenue && revenue > 0 && contribution !== null ? contribution / revenue : null;
  const dailyRevenue = revenue === null ? null : revenue / elapsedDays;
  const dailyContribution = contribution === null ? null : contribution / elapsedDays;
  const bepDailyRevenue =
    contributionRate !== null && contributionRate > 0 ? dailyFixedCost / contributionRate : null;

  const progressPct = contribution === null || fixedTotal <= 0 ? 0 : (contribution / fixedTotal) * 100;
  const reached = contribution !== null && fixedTotal > 0 && contribution >= fixedTotal;

  let bepDay: number | null = null;
  if (dailyContribution !== null && dailyContribution > 0 && fixedTotal > 0) {
    const day = Math.ceil(fixedTotal / dailyContribution);
    if (day <= monthDays) bepDay = Math.max(1, day);
  }

  const bepLabel = fixedTotal <= 0
    ? "고정비 없음"
    : bepDay === null
      ? "이번 달 내 미도달"
      : reached
        ? `${month.monthLabel} ${bepDay}일경 달성`
        : `${month.monthLabel} ${bepDay}일 예상`;

  const projectedNet = profit?.projectedNet ?? null;
  const orderAmount = Math.max(0, Math.round(input.orderAmount ?? 0));
  const freeCashFlow = projectedNet === null ? null : projectedNet - orderAmount;

  let mode: OrderMode | null = null;
  if (orderAmount > 0 && freeCashFlow !== null) mode = freeCashFlow >= 0 ? "bulk" : "split_min";

  const reason = buildOrderReason({ mode, projectedNet, orderAmount, freeCashFlow, reached, partial: month.partial });

  return {
    period: month.period,
    monthLabel: month.monthLabel,
    monthDays,
    elapsedDays,
    revenue,
    contribution,
    contributionRate,
    fixedCostTotal: Math.round(fixedTotal),
    dailyFixedCost: Math.round(dailyFixedCost),
    dailyRevenue: dailyRevenue === null ? null : Math.round(dailyRevenue),
    dailyContribution: dailyContribution === null ? null : Math.round(dailyContribution),
    bepDailyRevenue: bepDailyRevenue === null ? null : Math.round(bepDailyRevenue),
    bepDay,
    bepLabel,
    progressPct,
    reached,
    projectedNet,
    orderAmount,
    freeCashFlow,
    mode,
    modeLabel: mode ? ORDER_MODE_LABELS[mode] : "발주 없음",
    reason,
    partial: month.partial,
  };
}

function buildOrderReason(input: {
  mode: OrderMode | null;
  projectedNet: number | null;
  orderAmount: number;
  freeCashFlow: number | null;
  reached: boolean;
  partial: boolean;
}): string {
  const tail = input.partial ? " 프린트는 26일 정산 전이라 커피만 반영했어요." : "";

  if (input.projectedNet === null) return `매출이 아직 없어 발주 모드를 정하지 않았어요.${tail}`;
  if (input.orderAmount <= 0) {
    return `이번 발주 예정 없음 — 월말 예상 순수익 ${formatWon(input.projectedNet)}은 그대로 현금으로 남아요.${tail}`;
  }
  if (input.mode === "bulk") {
    return `월말 예상 순수익 ${formatWon(input.projectedNet)}이 3종 발주 ${formatWon(input.orderAmount)}을 덮어요 — 한 번에 발주해 배송·결제를 한 번으로 끝내요.${tail}`;
  }
  return `월말 예상 순수익 ${formatWon(input.projectedNet)} < 발주 ${formatWon(input.orderAmount)} — 급한 품목만 최소 수량으로 나눠 발주하고 나머지는 정산 뒤로 미뤄요.${tail}`;
}

/**
 * 월세만 넣고도 순수익을 가늠하는 계산 — `/admin/stores` 신규 매장 폼 미리보기 전용.
 *  - 손익분기 월 매출 = 월 고정비 ÷ 참고 공헌이익률(≈70.1%)
 *  - 예상 순수익 = 매출 × 참고 공헌이익률 − 월 고정비
 *  실측 매출이 없는 신규 매장이므로 **가정값**임을 화면에 밝힌다.
 */
export function previewByFixedCost(
  fixedCost: Partial<MonthlyFixedCost> | null | undefined,
  referenceRevenue = 3_000_000,
) {
  const fixedTotal = fixedCostTotal(fixedCost);
  const rate = REFERENCE_CONTRIBUTION_RATE;

  return {
    fixedTotal,
    contributionRate: rate,
    bepRevenue: rate > 0 ? Math.round(fixedTotal / rate) : 0,
    referenceRevenue,
    referenceNet: Math.round(referenceRevenue * rate) - fixedTotal,
  };
}

/** [월간] 탭 전용 — 저번달(확정) vs 이번달(진행 중) 비교행. */
export type MonthlyCompareRow = {
  period: MonthlySummary["period"];
  label: string;
  revenue: number | null;
  net: number | null;
  marginRate: number | null;
  /** 이번달은 월말 투영, 확정달은 null */
  projectedNet: number | null;
  note: string;
};

function compareRow(profit: ProfitEstimate | null): MonthlyCompareRow | null {
  if (!profit) return null;

  const elapsed = Math.round(profit.proratedRatio * daysInMonth(profit.period));
  const isLive = profit.proratedRatio < 1;

  return {
    period: profit.period,
    label: isLive ? `${profit.monthLabel} 진행 중` : `${profit.monthLabel} 확정`,
    revenue: profit.revenue,
    net: profit.net,
    marginRate: profit.marginRate,
    projectedNet: isLive ? profit.projectedNet : null,
    note: isLive
      ? `${elapsed}일 경과${profit.partial ? " · 프린트 전" : ""}${
          profit.projectedNet === null
            ? ""
            : ` · 월말 ${Math.round(profit.projectedNet / 10_000).toLocaleString("ko-KR")}만`
        }`
      : "확정 매출 기준",
  };
}

/** 저번달·이번달 두 줄 — 지점 하나 안에서만 비교한다(합산 없음). */
export function monthlyComparison(input: {
  previous: ProfitEstimate | null;
  current: ProfitEstimate | null;
}): MonthlyCompareRow[] {
  return [compareRow(input.previous), compareRow(input.current)].filter(
    (row): row is MonthlyCompareRow => row !== null,
  );
}

/** 히어로 카드 한 줄 요약: "예상 순수익 1,240,000원 · 마진 41.2%" */
export function profitSummaryLine(profit: ProfitEstimate | null): string {
  if (!profit || profit.net === null) return "예상 순수익 —";
  const margin = profit.marginRate === null ? "" : ` · 마진 ${profit.marginRate.toFixed(1)}%`;
  return `예상 순수익 ${formatWon(profit.net)}${margin}`;
}
