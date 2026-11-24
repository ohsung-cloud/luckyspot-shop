import type { MonthlySummary } from "./monthly";

/**
 * 프린트 매출 역산 — **종이 소모(기기 누적 출력 매수)** 에서 매출을 되돌려 계산한다.
 * (특허 1호 핵심: 이종 사업자 매출을 실소모량에서 교차 추정)
 *
 * 왜 필요한가
 *  - 에스칼프린트는 **전월 26일 ~ 당월 25일** 매출을 당월 26일에야 정산한다.
 *    그래서 매달 1~25일 동안 점주 화면의 프린트 매출은 늘 "정산 전" = 빈칸이었다.
 *  - 그런데 복합기는 누적 출력 매수(기기 카운터)를 실시간으로 보여 준다.
 *    카운터 증가분 ÷ 경과 시간 = 하루 출력 매수이고, 여기에 장당 평균 단가를 곱하면
 *    정산 전에도 이번 달 프린트 매출을 숫자로 되돌릴 수 있다.
 *
 * 계산(순서대로, 앞이 안 되면 다음으로)
 *  ① 실측 카운터: 누적 매수 두 점(12~48시간 간격)의 차이 → 하루 매수
 *     × 정산기간 경과일 × 장당 평균 단가 = 이번 달 프린트 예상 매출
 *  ② 카운터 두 점이 없으면: 직전 달 정산 매출의 일평균 × 경과일
 *     (정산은 매출을 이미 확정해 주므로, 그 속도가 이어졌다고 보는 보수적 추정)
 *  ③ 둘 다 없으면 null — 0원으로 채우지 않는다.
 *
 * 장당 평균 단가
 *  - 가맹점 공식 이용요금표(에스칼프린트 포털 `이용요금`)의 A4 기준값을 쓴다.
 *    흑백 70원 · 컬러 250원, 컬러 비중 18%(자동수집 기본 가정) → 102원/장.
 *
 * 지켜야 할 것
 *  - 지점 숫자는 합산하지 않는다(지점 코드 하나만 받는다).
 *  - 추정은 추정이라고 화면에 밝힌다 — 정산이 오면 정산값이 이긴다.
 */

/** 포털에서 읽은 기기 카운터 한 점. */
export type PrintCounterReading = {
  /** 읽은 시각 (ISO, KST 오프셋 포함) */
  capturedAt: string;
  /** 장비 누적 출력 매수 */
  cumulativePrintCount: number;
  /** 어디서 읽었나 — 화면 근거로 그대로 쓴다 */
  source: string;
};

/** A4 1장 기준 가격표. */
export type PrintPrice = {
  /** 흑백 A4 1페이지 */
  bw: number;
  /** 컬러 A4 1페이지 */
  color: number;
  /** 컬러 비중(%) — 장당 평균 단가 가중치 */
  colorSharePct: number;
  /** 근거 문구 */
  source: string;
};

/**
 * 가맹점 공식 이용요금표 (에스칼프린트 포털 → 매장 지원 → 이용요금, 2026-11-25 확인).
 *  - 강남구청역점(ESCAL_1011): 흑백 A4 70원 · 컬러 A4 250원 · 스캔 50원 · 웹팩스 500원
 *  - 한예종점: 포털 계정이 아직 연결되지 않아 같은 가맹점 요금표를 적용했다(보수적 동일 가정).
 */
export const PRINT_PRICE: Record<string, PrintPrice> = {
  STORE_GNM: { bw: 70, color: 250, colorSharePct: 18, source: "에스칼프린트 가맹점 요금표(A4 기준 · 컬러 18% 가정)" },
  STORE_HYJ: { bw: 70, color: 250, colorSharePct: 18, source: "럭키스팟 가맹점 요금표(A4 기준 · 컬러 18% 가정)" },
};

/**
 * 마지막으로 **정산이 끝난** 프린트 매출 — 카운터 두 점이 없을 때의 폴백 근거.
 *  - 에스칼프린트 로열티 청구서(2026-10, 9/26~10/25) 실측값.
 */
export const LAST_SETTLEMENT: Record<
  string,
  { total: number; days: number; range: string; source: string }
> = {
  STORE_GNM: { total: 500_200, days: 30, range: "9/26~10/25", source: "에스칼프린트 10월 청구서" },
  STORE_HYJ: { total: 1_963_240, days: 30, range: "9/26~10/25", source: "에스칼프린트 10월 청구서" },
};

/**
 * 포털에서 직접 읽어 둔 기기 카운터(수집기가 아직 안 돈 기간의 실측값).
 *  - 수집기(Supabase `device_telemetry_snapshots`)에 값이 있으면 그쪽이 우선이다.
 *  - 2026-11-25 08:50 포털 확인: 강남구청역점 TASKalfa MZ3501ci S/N 1P26300591
 *    누적 25,561매(포털 최종 업데이트 11-24 16:58), 직전 수집 25,390매(11-23 12:10).
 *  - 한예종점 TASKalfa VFM251ci: 221,739매(11-23 15:50) 한 점뿐 — 두 점이 없어 폴백을 쓴다.
 */
export const PORTAL_COUNTER_READINGS: Record<string, PrintCounterReading[]> = {
  STORE_GNM: [
    { capturedAt: "2026-11-23T12:10:00+09:00", cumulativePrintCount: 25_390, source: "에스칼프린트 기기 카운터" },
    { capturedAt: "2026-11-24T16:58:00+09:00", cumulativePrintCount: 25_561, source: "에스칼프린트 기기 카운터" },
  ],
  STORE_HYJ: [
    { capturedAt: "2026-11-23T15:50:00+09:00", cumulativePrintCount: 221_739, source: "에스칼프린트 기기 카운터" },
  ],
};

export type PaperPrintEstimate = {
  storeCode: string;
  /** 정산 기간 "10/26~11/25" */
  range: string;
  periodStart: string;
  periodEnd: string;
  /** 정산기간 총일수(31) */
  periodDays: number;
  /** 경과일(소수 1자리) */
  elapsedDays: number;
  method: "counter" | "settlement-pace" | "none";
  /** 하루 출력 매수 */
  sheetsPerDay: number | null;
  /** 이번 달 누적 출력 매수(추정) */
  sheetsToDate: number | null;
  /** 장당 평균 단가(원) */
  pricePerSheet: number;
  priceSource: string;
  /** 프린트 예상 매출(원) */
  revenue: number | null;
  /** 계산 근거 한 줄 — 화면에 그대로 */
  basis: string;
  /** 카운터 실측 근거(있을 때만) */
  counterNote: string | null;
  /** 직전 정산 폴백 근거(있을 때만) */
  settlementNote: string | null;
  /** 화면용 짧은 라벨 */
  label: string;
};

function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

/** 추정 금액은 1,000원 단위로 — 추정의 정밀도를 실제보다 높게 보이지 않게 한다. */
function roundEstimate(value: number) {
  return Math.round(value / 1000) * 1000;
}

function shortStamp(iso: string) {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

/** "2026-11" → 정산 기간(전월 26일 ~ 당월 25일). */
export function settlementPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const startMonth = month === 1 ? 12 : month - 1;
  const startYear = month === 1 ? year - 1 : year;
  const start = `${startYear}-${String(startMonth).padStart(2, "0")}-26`;
  const end = `${year}-${String(month).padStart(2, "0")}-25`;
  const days = Math.round((Date.parse(`${end}T00:00:00+09:00`) - Date.parse(`${start}T00:00:00+09:00`)) / 86_400_000) + 1;
  return {
    start,
    end,
    days,
    label: `${startMonth}/${26}~${month}/${25}`,
  };
}

/** 정산기간 시작부터 지금까지 경과일(오늘 부분 포함, 소수 1자리). */
export function elapsedDays(startDate: string, asOf: Date) {
  const startMs = Date.parse(`${startDate}T00:00:00+09:00`);
  const raw = (asOf.getTime() - startMs) / 86_400_000;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.round(raw * 10) / 10;
}

/** 장당 평균 단가 — 요금표 가중 평균(A4 기준). */
export function pricePerSheet(storeCode: string) {
  const price = PRINT_PRICE[storeCode.toUpperCase()];
  if (!price) return { value: 0, source: "이용요금표 미등록" };
  const share = Math.max(0, Math.min(100, price.colorSharePct)) / 100;
  return {
    value: Math.round(price.bw * (1 - share) + price.color * share),
    source: price.source,
  };
}

/**
 * 카운터 두 점으로 하루 출력 매수 — 앱의 텔레메트리 규칙과 같다.
 *  - 최근 점 기준 **12~48시간** 전 점을 골라 그 구간만 24시간으로 환산한다.
 *  - 그런 구간이 없으면 null(다음 수집을 기다린다).
 */
export function sheetsPerDayFromCounters(readings: PrintCounterReading[]): {
  sheets: number | null;
  delta: number;
  hours: number;
  from: PrintCounterReading | null;
  to: PrintCounterReading | null;
  note: string | null;
} {
  const points = readings
    .filter((item) => Number.isFinite(item.cumulativePrintCount))
    .slice()
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  const empty = { sheets: null, delta: 0, hours: 0, from: null, to: null, note: null };
  if (points.length < 2) return empty;

  const latest = points[points.length - 1];
  const latestMs = Date.parse(latest.capturedAt);

  let previous: PrintCounterReading | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const point of points.slice(0, -1)) {
    const hours = (latestMs - Date.parse(point.capturedAt)) / 3_600_000;
    if (!Number.isFinite(hours) || hours < 12 || hours > 48) continue;
    const gap = Math.abs(hours - 24);
    if (gap < bestGap) {
      bestGap = gap;
      previous = point;
    }
  }

  if (!previous) return empty;

  const delta = latest.cumulativePrintCount - previous.cumulativePrintCount;
  const hours = (latestMs - Date.parse(previous.capturedAt)) / 3_600_000;
  if (!Number.isFinite(delta) || delta < 0 || hours <= 0) return empty;

  const perDay = Math.min(20_000, (delta / hours) * 24);
  const rounded = Math.max(0, Math.round(perDay));
  return {
    sheets: rounded,
    delta,
    hours: Math.round(hours * 10) / 10,
    from: previous,
    to: latest,
    note: `${shortStamp(previous.capturedAt)} ${previous.cumulativePrintCount.toLocaleString("ko-KR")}매 → ${shortStamp(latest.capturedAt)} ${latest.cumulativePrintCount.toLocaleString("ko-KR")}매 (+${delta.toLocaleString("ko-KR")}매 / ${Math.round(hours)}시간)`,
  };
}

function mergeReadings(list: PrintCounterReading[][]) {
  const byTime = new Map<string, PrintCounterReading>();
  for (const group of list) {
    for (const reading of group) {
      if (!reading || !Number.isFinite(reading.cumulativePrintCount)) continue;
      if (!byTime.has(reading.capturedAt)) byTime.set(reading.capturedAt, reading);
    }
  }
  return [...byTime.values()].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

/**
 * 이번 달 프린트 예상 매출 — 위 ①→②→③ 순서.
 * `readings`에는 수집기 텔레메트리를 넣으면 그 값이 포털 수기 스냅샷보다 우선한다.
 */
export function estimatePrintFromPaper(input: {
  storeCode: string;
  period: string;
  asOf?: Date;
  readings?: PrintCounterReading[];
}): PaperPrintEstimate {
  const code = input.storeCode.trim().toUpperCase();
  const asOf = input.asOf ?? new Date();
  const period = settlementPeriod(input.period);
  const elapsed = Math.min(period.days, elapsedDays(period.start, asOf));
  const price = pricePerSheet(code);
  const settlement = LAST_SETTLEMENT[code] ?? null;

  // 수집기 텔레메트리(있으면) + 포털에서 직접 읽어 둔 값. 같은 시각이면 수집기 값이 이긴다.
  const readings = mergeReadings([input.readings ?? [], PORTAL_COUNTER_READINGS[code] ?? []]);
  const counter = sheetsPerDayFromCounters(readings);

  const base = {
    storeCode: code,
    range: period.label,
    periodStart: period.start,
    periodEnd: period.end,
    periodDays: period.days,
    elapsedDays: elapsed,
    pricePerSheet: price.value,
    priceSource: price.source,
  };

  if (counter.sheets !== null && counter.sheets > 0) {
    const sheetsToDate = Math.round(counter.sheets * elapsed);
    const revenue = roundEstimate(sheetsToDate * price.value);
    return {
      ...base,
      method: "counter",
      sheetsPerDay: counter.sheets,
      sheetsToDate,
      revenue,
      basis: `하루 ${counter.sheets.toLocaleString("ko-KR")}매 × ${elapsed}일 × 장당 ${price.value}원`,
      counterNote: counter.note,
      settlementNote: settlement
        ? `직전 정산(${settlement.range}) ${won(settlement.total)} · 하루 ${won(settlement.total / settlement.days)}`
        : null,
      label: "용지 소모(기기 카운터) 기준 추정",
    };
  }

  if (settlement && elapsed > 0) {
    const revenue = roundEstimate((settlement.total / settlement.days) * elapsed);
    const sheetsToDate = price.value > 0 ? Math.round(revenue / price.value) : null;
    return {
      ...base,
      method: "settlement-pace",
      sheetsPerDay: Math.round(settlement.total / settlement.days / Math.max(1, price.value)),
      sheetsToDate,
      revenue,
      basis: `직전 정산 ${won(settlement.total)} ÷ ${settlement.days}일 × ${elapsed}일`,
      counterNote: null,
      settlementNote: `${settlement.source}(${settlement.range}) ${won(settlement.total)} ÷ ${settlement.days}일 = 하루 ${won(settlement.total / settlement.days)}`,
      label: "직전 정산 일평균 기준 추정",
    };
  }

  return {
    ...base,
    method: "none",
    sheetsPerDay: null,
    sheetsToDate: null,
    revenue: null,
    basis: "카운터·정산 근거가 아직 없어 추정하지 않았습니다.",
    counterNote: null,
    settlementNote: null,
    label: "추정 근거 없음",
  };
}

/**
 * 월 요약의 프린트 칸을 추정값으로 채운다.
 *  - 이미 확정(final)이거나 인쇄 메뉴가 없는 지점(missing)은 건드리지 않는다.
 *  - 정산 전(pending)일 때만, 추정이 있을 때만 바꾼다.
 */
export function applyPaperPrintEstimate(
  month: MonthlySummary | null,
  estimate: PaperPrintEstimate | null,
): MonthlySummary | null {
  if (!month || !estimate || estimate.revenue === null) return month;
  if (month.print.status !== "pending") return month;

  const print = {
    amount: estimate.revenue,
    orders: estimate.sheetsToDate,
    range: estimate.range,
    status: "estimated" as const,
    source: "에스칼프린트(추정)",
    note: `${estimate.label} — ${estimate.basis}`,
  };

  const coffee = month.coffee.amount;
  const total = coffee === null ? estimate.revenue : coffee + estimate.revenue;

  return {
    ...month,
    print,
    total,
    partial: true,
    printEstimated: true,
    printEstimate: estimate,
    note:
      estimate.method === "counter"
        ? "프린트는 26일 정산 전이라 기기 카운터(용지 소모)로 추정해 더했어요."
        : "프린트는 26일 정산 전이라 직전 정산 일평균으로 추정해 더했어요.",
  };
}
