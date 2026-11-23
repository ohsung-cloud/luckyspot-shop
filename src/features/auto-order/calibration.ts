/**
 * 원두·토너·용지 '교체 완료' 원터치 보정 — 자동 학습 피드백 루프.
 *
 * 점주가 실제로 소모품을 갈았을 때 버튼 한 번을 누르면
 *   ① 그 품목 잔량을 100%(가득)로 되돌리고
 *   ② **지난 교체일 → 오늘**의 실제 사용 일수와, 그 사이 예측이 말하던 소진 속도를 비교해
 *      지점별 보정 계수(calibrationFactor, 0.85x~1.25x)를 다시 학습한다.
 *
 * 왜 계수를 곱하는가
 *  - 예측은 POS 마감(잔수·출력 매수)에서 소진량을 역산한다. 그런데 실제로는
 *    컵 크기·원두 굵기·토너 절약 모드·용지 급지 습관 때문에 예측보다 빨리/늦게 떨어진다.
 *  - 실제 간격 ÷ 예측 간격 = 그 지점의 습관 계수다. 다음 예측의 일 소진량에 곱해 두면
 *    같은 실수가 반복되지 않는다(피드백 루프).
 *
 * 안전장치
 *  - 0.85 ~ 1.25 밖으로는 가지 않는다(한 번의 이상한 교체가 예측을 망가뜨리지 않게).
 *  - 첫 교체는 비교 대상이 없으므로 계수를 바꾸지 않고 '기준점'만 남긴다.
 *  - 이전 계수가 있으면 50%만 반영해 급격한 흔들림을 막는다(지수가중).
 */

export type CalibrationEntry = {
  sku: string;
  /** 이번에 갈아 끼운 시각(ISO) */
  lastReplacedAt: string;
  /** 그 전 교체 시각 — 학습 근거 */
  previousReplacedAt: string | null;
  /** 학습된 보정 계수 (1 = 보정 없음) */
  factor: number;
  /** 관측 표본 수(교체 횟수) */
  samples: number;
  /** 교체 직후 잔량(소모 단위) — 100%로 되돌린 값 */
  fullCapacity: number;
  /** 마지막 학습 한 줄 (화면 표시용) */
  note: string;
};

export type CalibrationStore = Record<string, CalibrationEntry>;

export const CALIBRATION_MIN = 0.85;
export const CALIBRATION_MAX = 1.25;
const SMOOTHING = 0.5;

/** 품목별 '가득' 용량 — 포털 % 신호가 있으면 그 용량, 없으면 BOM 기본값. */
const STAPLE_CAPACITY: Record<string, number> = {
  "bean-10kg": 10_000, // 원두 1박스 = 10kg
  "toner-black": 500, // 검정 토너 1개 = 500g
  "toner-color": 500,
  "a4-paper": 1_100, // A4 2트레이 = 1,100매
};

export function stapleCapacity(sku: string, fallback?: number | null): number {
  const known = STAPLE_CAPACITY[sku];
  if (typeof known === "number") return known;
  if (typeof fallback === "number" && fallback > 0) return fallback;
  return 0;
}

export function clampFactor(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(CALIBRATION_MAX, Math.max(CALIBRATION_MIN, Math.round(value * 1000) / 1000));
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return (to - from) / 86_400_000;
}

/**
 * 교체 1회를 기록하고 다음 계수를 계산한다.
 *
 * 예측이 "가득 → 바닥까지 10일"이라고 했는데 실제로 12일 만에 갈았다면
 * 소진이 예측보다 느렸다는 뜻 → 계수 12/10 = 1.2 (일 소진량을 20% 늘려 잡음).
 */
export function nextCalibration(input: {
  sku: string;
  previous?: CalibrationEntry | null;
  replacedAt: string;
  fullCapacity: number;
  /** 교체 전 예측 일 소진량 (단위/일) */
  predictedDailyConsumption: number;
}): CalibrationEntry {
  const { sku, previous, replacedAt, fullCapacity, predictedDailyConsumption } = input;

  const base: CalibrationEntry = {
    sku,
    lastReplacedAt: replacedAt,
    previousReplacedAt: previous?.lastReplacedAt ?? null,
    factor: previous?.factor ?? 1,
    samples: previous?.samples ?? 0,
    fullCapacity,
    note: "첫 교체 — 다음 교체 때 소진 속도를 학습합니다.",
  };

  if (!previous || predictedDailyConsumption <= 0 || fullCapacity <= 0) return base;

  const actualDays = daysBetween(previous.lastReplacedAt, replacedAt);
  if (actualDays <= 0.5 || actualDays > 120) {
    return { ...base, note: "교체 간격이 너무 짧거나 길어 이번 관측은 학습에서 제외했습니다." };
  }

  const expectedDays = fullCapacity / predictedDailyConsumption;
  if (expectedDays <= 0) return base;

  const observed = clampFactor(actualDays / expectedDays);
  const factor = clampFactor((previous.factor ?? 1) * (1 - SMOOTHING) + observed * SMOOTHING);

  return {
    ...base,
    factor,
    samples: (previous.samples ?? 0) + 1,
    note: `실제 ${actualDays.toFixed(1)}일 · 예측 ${expectedDays.toFixed(1)}일 → ${factor.toFixed(2)}x`,
  };
}

/** 화면·예측에 쓰는 가득 용량. 엔트리에 저장된 값이 있으면 그 값을 쓴다. */
export function fullCapacityOf(entry: CalibrationEntry | null | undefined, sku: string): number {
  if (entry && entry.fullCapacity > 0) return entry.fullCapacity;
  return stapleCapacity(sku);
}

/** 교체 직후 24시간 동안은 '가득'으로 본다 — 남은 잔량을 다시 계산할 필요가 없게. */
export function isFreshlyReplaced(entry: CalibrationEntry | null | undefined, now: Date = new Date()) {
  if (!entry) return false;
  const hours = (now.getTime() - new Date(entry.lastReplacedAt).getTime()) / 3_600_000;
  return Number.isFinite(hours) && hours >= -1 && hours <= 24;
}

export function calibrationFactors(store: CalibrationStore | null | undefined): Record<string, number> {
  const factors: Record<string, number> = {};
  if (!store) return factors;

  for (const [sku, entry] of Object.entries(store)) {
    if (entry && Number.isFinite(entry.factor) && entry.factor > 0) factors[sku] = entry.factor;
  }

  return factors;
}

export function calibratedNote(entry: CalibrationEntry | null | undefined): string | null {
  if (!entry) return null;
  const date = new Date(entry.lastReplacedAt);
  const label = Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
      }).format(date);
  return `${label} 교체 · 학습 ${entry.factor.toFixed(2)}x`;
}
