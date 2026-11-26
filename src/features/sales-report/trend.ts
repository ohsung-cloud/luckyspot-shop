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
 *  - 한예종점: 일별 실측이 아직 없어 월 커피 일평균으로만 그린다(추정 표시).
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

/** 포털 판매정보에서 확인된 강남구청역점 최근 7일 — 원 단위. */
const GANGNAM_DAILY = [
  { date: "2026-11-20", total: 50_800 },
  { date: "2026-11-21", total: 32_200 },
  { date: "2026-11-22", total: 57_800 },
  { date: "2026-11-23", total: 14_600 },
  { date: "2026-11-24", total: 58_900 },
  { date: "2026-11-25", total: 33_500 },
  { date: "2026-11-26", total: 25_100 },
];

/** 2026-11-25(수) 시간대 매출 — 합계 33,500원(포털 판매정보, 마지막으로 끝난 하루). */
const GANGNAM_HOURLY = [6_800, 2_100, 9_900, 6_900, 0, 7_800];
const GANGNAM_HOURLY_DATE = "2026-11-25";

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

  if (code === "STORE_GNM") {
    const daily = GANGNAM_DAILY.map((row) => ({ ...row, label: labelOf(row.date) }));
    const total = GANGNAM_HOURLY.reduce((sum, value) => sum + value, 0);

    return {
      daily,
      dailyAverage: Math.round(average(daily.map((row) => row.total))),
      dailySource: "measured",
      dailyNote: "포털 판매정보 실측 11/20~11/26 · 막대 숫자는 천원 단위 반올림",
      hourly: HOUR_LABELS.map((bucket, index) => ({
        key: bucket.key,
        label: bucket.label,
        range: bucket.range,
        amount: GANGNAM_HOURLY[index],
        share: total > 0 ? (GANGNAM_HOURLY[index] / total) * 100 : 0,
      })),
      hourlyDate: GANGNAM_HOURLY_DATE,
      hourlyTotal: total,
      hourlyNote: `포털 판매정보 ${labelOf(GANGNAM_HOURLY_DATE)} 실측(마지막으로 끝난 하루) · 합계 ${total.toLocaleString("ko-KR")}원`,
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
    hourlyNote: "시간대 매출은 이 지점 포털에 아직 없어요. 수집기가 읽으면 여기에 채워져요.",
  };
}

/** 만원·천원 표기 — 막대 위 숫자는 짧게. */
export function shortWon(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 10_000) return `${Math.round(value / 1_000).toLocaleString("ko-KR")}천`;
  return `${Math.round(value).toLocaleString("ko-KR")}`;
}
