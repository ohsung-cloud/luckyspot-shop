import { formatWon, type MonthlySummary } from "./monthly";

/**
 * 점주 실마진(예상 순수익) — 화면·API·테스트가 같이 쓰는 순수 계산.
 *
 * 왜 필요한가
 *  - 매출만 보이면 "이번 달 얼마 벌었나"를 점주가 직접 계산해야 한다.
 *    매출 히어로 카드에 **한 줄 요약**만 얹고, 탭하면 계산 내역을 펼친다(기본 화면 과밀 없음).
 *
 * 계산식(사용자 지정, 2026-11-23)
 *   커피 매출 × (1 − 원가율 15.8%)
 * + 프린트 매출 × (1 − 변동비·로열티 28%)
 * − 월 고정비 × (이번달은 경과일 비율, 저번달은 전액)
 * = 예상 순수익, 마진율 = 순수익 ÷ 매출
 *
 * 지켜야 할 것
 *  - 지점 숫자는 합산하지 않는다(이 파일도 지점 하나의 월 요약만 받는다).
 *  - 모르는 값은 0으로 채우지 않는다. 프린트가 '26일 정산 전'이면 프린트 몫을 빼고
 *    `partial`로 표시해 "확인된 항목만" 계산했음을 밝힌다.
 */

/** 커피 원재료 원가율 — 매출 대비. (사용자 지정값) */
export const COFFEE_MATERIAL_RATE = 0.158;

/** 프린트 변동비 + 로열티 비율 — 매출 대비. */
export const PRINT_VARIABLE_RATE = 0.28;

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
 *  - 처음부터 정확한 임대료를 알 수 없으므로 '예시값'이며 화면에도 그렇게 밝힌다.
 */
export const DEFAULT_FIXED_COST: Record<string, MonthlyFixedCost> = {
  // 1평 샵인샵(강남구청역점) — 임대료가 작은 대신 매출도 작다.
  STORE_GNM: { rent: 450_000, maintenance: 120_000, internet: 33_000, solution: 55_000 },
  // 대학 상권 독립 매장(한예종점).
  STORE_HYJ: { rent: 1_200_000, maintenance: 200_000, internet: 33_000, solution: 55_000 },
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
  const marginRate =
    net === null || month.total === null || month.total <= 0 ? null : (net / month.total) * 100;

  const lines: ProfitLine[] = [
    {
      label: `커피 매출 × (1 − 원가 ${(COFFEE_MATERIAL_RATE * 100).toFixed(1)}%)`,
      amount: coffeeProfit,
      note: coffeeRevenue === null ? "이번 달 커피 미수집" : formatWon(coffeeRevenue),
      tone: "plus",
    },
    {
      label: `프린트 매출 × (1 − 변동비·로열티 ${Math.round(PRINT_VARIABLE_RATE * 100)}%)`,
      amount: printProfit,
      note: printRevenue === null ? month.print.note ?? "정산 전" : formatWon(printRevenue),
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
    marginRate,
    partial: month.partial,
    lines,
    note,
  };
}

/** 히어로 카드 한 줄 요약: "예상 순수익 1,240,000원 · 마진 41.2%" */
export function profitSummaryLine(profit: ProfitEstimate | null): string {
  if (!profit || profit.net === null) return "예상 순수익 —";
  const margin = profit.marginRate === null ? "" : ` · 마진 ${profit.marginRate.toFixed(1)}%`;
  return `예상 순수익 ${formatWon(profit.net)}${margin}`;
}
