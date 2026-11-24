/**
 * 월별 매출 요약 — `/sales-report` · `/store/[code]`가 같이 쓴다.
 *
 * 원칙
 *  - 지점 숫자는 **합산하지 않는다.** 함수는 지점 코드 하나만 받는다.
 *  - 모르는 값은 0으로 채우지 않고 null + status로 표시한다
 *    (예: 11월 프린트는 에스칼프린트가 매월 26일에 정산하므로 '정산 전').
 *  - 커피와 프린트의 기간 기준이 다르다(커피: 달력월 1일~오늘, 프린트: 전월 26일~당월 25일 정산).
 *    그래서 비중은 '참고'로만 쓰고 근거를 함께 적는다.
 */

export type MonthlyPeriod = "2026-11" | "2026-10";

export type MonthlySide = {
  amount: number | null;
  orders: number | null;
  /** 기간 표기 (예: "10/1~10/31") */
  range: string;
  status: "final" | "live" | "pending" | "missing";
  source: string;
  note?: string;
};

export type MonthlySummary = {
  period: MonthlyPeriod;
  /** "11월" */
  monthLabel: string;
  /** "이번달" / "저번달" */
  role: "이번달" | "저번달";
  coffee: MonthlySide;
  print: MonthlySide;
  /** 확인된 항목만 더한 값. 한쪽이 없으면 null이 아니라 부분 합계다. */
  total: number | null;
  partial: boolean;
  /** 화면에 그대로 쓰는 한 줄 설명 */
  note: string;
};

export const MONTHLY_PERIODS: { id: MonthlyPeriod; label: string; hint: string }[] = [
  { id: "2026-11", label: "이번달 (11월)", hint: "진행 중" },
  { id: "2026-10", label: "저번달 (10월)", hint: "확정" },
];

const PENDING_PRINT: MonthlySide = {
  amount: null,
  orders: null,
  range: "11/1~",
  status: "pending",
  source: "에스칼프린트",
  note: "매월 26일 정산 — 11월 프린트는 아직 집계 전",
};

/**
 * 프린트 정산본을 아직 받지 못한 지점 — 0원이 아니라 '미확보'로 둔다.
 */
const UNCOLLECTED_PRINT_OCT: MonthlySide = {
  amount: null,
  orders: null,
  range: "9/26~10/25",
  status: "missing",
  source: "에스칼프린트",
  note: "정산본 미확보 — 인쇄 메뉴가 없는 지점",
};

const UNCOLLECTED_PRINT_NOV: MonthlySide = {
  amount: null,
  orders: null,
  range: "10/26~11/25",
  status: "missing",
  source: "에스칼프린트",
  note: "정산본 미확보 — 인쇄 메뉴가 없는 지점",
};

const PYEONGTAEK_SUMMARY: Record<MonthlyPeriod, MonthlySummary> = {
  "2026-11": {
    period: "2026-11",
    monthLabel: "11월",
    role: "이번달",
    coffee: {
      amount: 586_500,
      orders: null,
      range: "11/1~11/24",
      status: "live",
      source: "로얄선즈",
      note: "실측 · 오늘 12,000원 포함(11-24 기준)",
    },
    print: UNCOLLECTED_PRINT_NOV,
    total: 586_500,
    partial: true,
    note: "커피만 확인된 값이에요. 프린트 매출은 아직 확보하지 못했어요.",
  },
  "2026-10": {
    period: "2026-10",
    monthLabel: "10월",
    role: "저번달",
    coffee: {
      amount: 601_000,
      orders: 304,
      range: "10/1~10/31",
      status: "final",
      source: "로얄선즈",
      note: "판매정보 직접 조회 304건",
    },
    print: UNCOLLECTED_PRINT_OCT,
    total: 601_000,
    partial: true,
    note: "10월 커피만 확정이에요. 프린트 정산본은 아직 확보하지 못했어요.",
  },
};

/**
 * 지점 코드별 월 요약.
 *
 * 강남구청역점 10월 커피는 로얄선즈 판매정보에서 직접 조회한 값이다
 * (2026-10-01~10-31 624건 1,720,600원 / 로열티 기준 09-26~10-25 616건 1,691,100원).
 * 한예종점 커피는 2026-11-24 계정 로그인 후 로얄선즈 판매정보에서 직접 조회했다
 * (10월 10-01~10-31 1,813건 6,099,900원 / 11월 11-01~11-24 1,242건 4,112,000원, 11-24 10:25 기준).
 * 평택점 커피는 2026-11-24 로얄선즈 판매정보(바디코드 2021092321)에서 직접 조회했다
 * (10월 10-01~10-31 304건 601,000원 / 11월 11-01~11-24 586,500원, 오늘 12,000원·어제 34,500원 포함).
 *   누적 실주문 10,030,100원·4,900건·환불 0건.
 *   프린트는 이 지점의 정산본을 아직 받지 못해 null + missing으로 둔다(0원으로 채우지 않는다).
 */
const SUMMARY: Record<string, Record<MonthlyPeriod, MonthlySummary>> = {
  STORE_PTK: PYEONGTAEK_SUMMARY,
  STORE_GNM: {
    "2026-11": {
      period: "2026-11",
      monthLabel: "11월",
      role: "이번달",
      coffee: {
        amount: 1_059_700,
        orders: null,
        range: "11/1~11/23",
        status: "live",
        source: "로얄선즈",
        note: "실시간 집계 · 12:10 기준",
      },
      print: PENDING_PRINT,
      total: 1_059_700,
      partial: true,
      note: "커피는 실시간, 프린트는 26일 정산 전이라 커피만 더한 값이에요.",
    },
    "2026-10": {
      period: "2026-10",
      monthLabel: "10월",
      role: "저번달",
      coffee: {
        amount: 1_720_600,
        orders: 624,
        range: "10/1~10/31",
        status: "final",
        source: "로얄선즈",
        note: "로열티 기준(9/26~10/25)은 616건 · 1,691,100원",
      },
      print: {
        amount: 500_200,
        orders: null,
        range: "9/26~10/25",
        status: "final",
        source: "에스칼프린트",
        note: "환불 250원 차감 전 · 11-23 12:10 정산본",
      },
      total: 2_220_800,
      partial: false,
      note: "10월 확정 — 커피 10/1~31 + 프린트 9/26~10/25 정산이에요.",
    },
  },
  STORE_HYJ: {
    "2026-11": {
      period: "2026-11",
      monthLabel: "11월",
      role: "이번달",
      coffee: {
        amount: 4_112_000,
        orders: 1_242,
        range: "11/1~11/24",
        status: "live",
        source: "로얄선즈",
        note: "실측 1,242건 · 오늘 30,800원 포함(10:25 기준)",
      },
      print: PENDING_PRINT,
      total: 4_112_000,
      partial: true,
      note: "커피는 실시간, 프린트는 26일 정산 전이라 커피만 더한 값이에요.",
    },
    "2026-10": {
      period: "2026-10",
      monthLabel: "10월",
      role: "저번달",
      coffee: {
        amount: 6_099_900,
        orders: 1_813,
        range: "10/1~10/31",
        status: "final",
        source: "로얄선즈",
        note: "판매정보 직접 조회 1,813건",
      },
      print: {
        amount: 1_963_240,
        orders: null,
        range: "9/26~10/25",
        status: "final",
        source: "에스칼프린트",
        note: "환불 없음 · 11-23 15:50 정산본",
      },
      total: 8_063_140,
      partial: false,
      note: "10월 확정 — 커피 10/1~31 + 프린트 9/26~10/25 정산이에요.",
    },
  },
};

export function monthlyForStore(code: string, period: MonthlyPeriod): MonthlySummary | null {
  const table = SUMMARY[code.toUpperCase()];
  return table ? table[period] : null;
}

/** 월별 데이터가 준비된 지점인가 — 새로 만든 매장은 false(수집 전). */
export function hasMonthlyData(code: string) {
  return Boolean(SUMMARY[code.toUpperCase()]);
}

export function formatWon(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatManwon(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만`;
}

/** 두 달을 비교한 증감률(확인된 합계 기준). 한쪽이라도 없으면 null. */
export function monthOverMonth(code: string): number | null {
  const current = monthlyForStore(code, "2026-11");
  const previous = monthlyForStore(code, "2026-10");
  if (!current?.total || !previous?.total) return null;
  if (previous.partial || current.partial) return null;
  return (current.total / previous.total - 1) * 100;
}
