/**
 * 매출 카드 안의 '일간 / 주간 / 월간' 펄스 — 기존 POS 앱(비즐) 사용자가 익숙한 두 그림.
 *
 *   ① 주간: 최근 7일 일별 막대 + **평균 점선**
 *   ② 일간: 하루를 여섯 구간(새벽·아침·점심·오후·저녁·밤)으로 나눈 매출 비중
 *
 * 원칙
 *  - 화면을 세로로 늘리지 않는다. 카드 **내부 탭**으로 전환하고, 탭마다 높이를 같게 맞춘다.
 *  - 숫자의 출처를 숨기지 않는다. 실측(포털·기존 POS 리포트)과 추정(일평균)을 구분해 적는다.
 *  - 시간대 데이터가 없는 지점은 그림을 지어내지 않고 "수집 전"이라고 적는다.
 *
 * 출처
 *  - 강남구청역점 일별 7일·시간대 6구간: 로얄선즈 판매정보 기간조회(2026-11-20~11-26)의 주문 생성시간·실제 주문금액
 *    집계(2026-11-26 16:11 내보내기). 일별 50,800 / 32,200 / 57,800 / 14,600 / 58,900 / 33,500 / 25,100원,
 *    시간대는 마지막으로 끝난 하루인 11-25(33,500원)의 6구간 6,800 · 2,100 · 9,900 · 6,900 · 0 · 7,800원.
 *    (2026-11-23까지 이 자리에 있던 값은 사용자가 보내 준 기존 POS(비즐) 매출분석보고서 11/16~11/22였다.)
 *  - 영등포시장역점·선유로점: 각 포털 대시보드의 '일별 매출'(7일)을 2026-11-26 22:35·22:37에 직접 읽은 값.
 *    두 지점 모두 시간대 집계는 포털에 없어 비워 둔다(지어내지 않는다).
 *  - 한예종점·평택점: 일별 실측이 아직 없어 월 커피 일평균으로만 그린다(추정 표시).
 */

export type ChartDay = {
  /** YYYY-MM-DD */
  date: string;
  /** 11.16(월) */
  label: string;
  /** 그날 전체 매출(원) */
  total: number;
};

export type HourBucket = {
  key: "dawn" | "morning" | "lunch" | "afternoon" | "evening" | "night";
  label: string;
  range: string;
  amount: number;
  share: number;
};

export type StorePulse = {
  /** 최근 7일(오래된 → 최신) */
  daily: ChartDay[];
  dailyAverage: number;
  dailySource: "measured" | "estimated" | "none";
  dailyNote: string;
  /** 하루 시간대 6구간 — 없으면 null */
  hourly: HourBucket[] | null;
  hourlyDate: string | null;
  hourlyTotal: number | null;
  hourlyNote: string;
};

export const HOUR_LABELS: { key: HourBucket["key"]; label: string; range: string }[] = [
  { key: "dawn", label: "새벽", range: "00~06" },
  { key: "morning", label: "아침", range: "06~11" },
  { key: "lunch", label: "점심", range: "11~14" },
  { key: "afternoon", label: "오후", range: "14~17" },
  { key: "evening", label: "저녁", range: "17~21" },
  { key: "night", label: "밤", range: "21~24" },
];

/**
 * 포털 대시보드에서 확인된 지점별 최근 7일 — 원 단위.
 * 지점 코드별로 달을 함께 적어 둔다. 10월을 보는 화면에서 11월 막대를 그리지 않기 위해서다.
 */
type MeasuredDaily = {
  /** 이 시리즈가 속한 달 (YYYY-MM) */
  month: string;
  /** 화면에 그대로 쓰는 출처 한 줄 */
  note: string;
  days: { date: string; total: number }[];
};

const MEASURED_DAILY: Record<string, MeasuredDaily> = {
  STORE_GNM: {
    month: "2026-11",
    note: "포털 판매정보 실측 11/20~11/26 · 막대 숫자는 천원 단위 반올림",
    days: [
      { date: "2026-11-20", total: 50_800 },
      { date: "2026-11-21", total: 32_200 },
      { date: "2026-11-22", total: 57_800 },
      { date: "2026-11-23", total: 14_600 },
      { date: "2026-11-24", total: 58_900 },
      { date: "2026-11-25", total: 33_500 },
      { date: "2026-11-26", total: 25_100 },
    ],
  },
  // 2026-11-26 22:35 메일빈(휴니크) 관리자웹 → 대시보드 일별 매출(7일)
  STORE_YDP: {
    month: "2026-11",
    note: "메일빈 대시보드 실측 11/20~11/26",
    days: [
      { date: "2026-11-20", total: 31_500 },
      { date: "2026-11-21", total: 45_600 },
      { date: "2026-11-22", total: 39_500 },
      { date: "2026-11-23", total: 21_600 },
      { date: "2026-11-24", total: 26_700 },
      { date: "2026-11-25", total: 36_600 },
      { date: "2026-11-26", total: 18_800 },
    ],
  },
  // 2026-11-26 22:37 유로커피머신 VCMS → 대시보드 일별 매출
  STORE_SYU: {
    month: "2026-11",
    note: "유로커피 대시보드 실측 11/20~11/26",
    days: [
      { date: "2026-11-20", total: 49_900 },
      { date: "2026-11-21", total: 115_674 },
      { date: "2026-11-22", total: 59_600 },
      { date: "2026-11-23", total: 33_500 },
      { date: "2026-11-24", total: 66_938 },
      { date: "2026-11-25", total: 64_259 },
      { date: "2026-11-26", total: 53_500 },
    ],
  },
};

/** 하루 시간대 6구간 실측 — 포털에 시간대가 있는 지점만 둔다. */
const MEASURED_HOURLY: Record<string, { date: string; amounts: number[]; note: string }> = {
  // 2026-11-25(수) 시간대 매출 — 합계 33,500원(포털 판매정보, 마지막으로 끝난 하루).
  STORE_GNM: {
    date: "2026-11-25",
    amounts: [6_800, 2_100, 9_900, 6_900, 0, 7_800],
    note: "포털 판매정보 11.25(수) 실측(마지막으로 끝난 하루)",
  },
};

const NO_HOURLY_NOTE = "시간대 매출은 이 지점 포털에 아직 없어요. 수집기가 읽으면 여기에 채워져요.";

function labelOf(date: string) {
  const value = new Date(`${date}T12:00:00+09:00`);
  const month = value.getMonth() + 1;
  const day = value.getDate();
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][value.getDay()];
  return `${month}.${String(day).padStart(2, "0")}(${weekday})`;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 최근 7일 날짜(YYYY-MM-DD) — 기준일 포함 7일, KST. */
export function lastSevenDays(asOf: string): string[] {
  const base = new Date(`${asOf}T12:00:00+09:00`);
  const days: string[] = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(base.getTime() - offset * 86_400_000);
    days.push(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date),
    );
  }

  return days;
}

/**
 * 지점의 매출 펄스.
 * @param input.code 지점 코드
 * @param input.asOf 기준일(스냅샷 today)
 * @param input.dailyRate 그 지점 커피 일평균(스냅샷 revenue.coffee.dailyRate) — 추정에만 쓴다
 */
export function storePulse(input: { code: string; asOf: string; dailyRate?: number | null }): StorePulse {
  const code = input.code.toUpperCase();
  const month = input.asOf.slice(0, 7);
  const measured = MEASURED_DAILY[code];
  const hourly = MEASURED_HOURLY[code];

  // 실측 일별이 있고, 보고 있는 달이 그 시리즈의 달과 같을 때만 실측으로 그린다.
  if (measured && measured.month === month) {
    const daily = measured.days.map((row) => ({ ...row, label: labelOf(row.date) }));
    const hourlySeries = hourly && hourly.date.slice(0, 7) === month ? hourly : null;
    const hourlyTotal = hourlySeries
      ? hourlySeries.amounts.reduce((sum, value) => sum + value, 0)
      : null;

    return {
      daily,
      dailyAverage: Math.round(average(daily.map((row) => row.total))),
      dailySource: "measured",
      dailyNote: measured.note,
      hourly:
        hourlySeries && hourlyTotal !== null
          ? HOUR_LABELS.map((bucket, index) => ({
              key: bucket.key,
              label: bucket.label,
              range: bucket.range,
              amount: hourlySeries.amounts[index],
              share: hourlyTotal > 0 ? (hourlySeries.amounts[index] / hourlyTotal) * 100 : 0,
            }))
          : null,
      hourlyDate: hourlySeries?.date ?? null,
      hourlyTotal,
      hourlyNote:
        hourlySeries && hourlyTotal !== null ? `${hourlySeries.note} · 합계 ${hourlyTotal.toLocaleString("ko-KR")}원` : NO_HOURLY_NOTE,
    };
  }

  const rate = typeof input.dailyRate === "number" && Number.isFinite(input.dailyRate) ? input.dailyRate : 0;
  const days = lastSevenDays(input.asOf);

  const daily = days.map((date) => ({
    date,
    label: labelOf(date),
    total: Math.round(rate),
  }));

  return {
    daily,
    dailyAverage: Math.round(rate),
    dailySource: rate > 0 ? "estimated" : "none",
    dailyNote:
      rate > 0
        ? "일별 실측이 아직 없어 커피 일평균으로 그린 값이에요(추정). 하루씩 쌓이면 실측으로 바뀌어요."
        : "일별 매출이 아직 수집되지 않았어요.",
    hourly: null,
    hourlyDate: null,
    hourlyTotal: null,
    hourlyNote: NO_HOURLY_NOTE,
  };
}

/** 만원·천원 표기 — 막대 위 숫자는 짧게. */
export function shortWon(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 10_000) return `${Math.round(value / 1_000).toLocaleString("ko-KR")}천`;
  return `${Math.round(value).toLocaleString("ko-KR")}`;
}
