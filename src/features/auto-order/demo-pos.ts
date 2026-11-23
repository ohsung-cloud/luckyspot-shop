import type { PosDailySales } from "./types";

/**
 * 데모 POS·프린트 마감 데이터.
 *
 * Supabase에 특허 1호 SQL이 아직 실행되지 않았거나(테이블 없음),
 * POS 마감 데이터가 한 건도 없을 때 화면·API가 그대로 동작하도록 쓰는 폴백이다.
 *
 * 값의 성격
 *  - 하루 음료 88잔 · 출력 128매: 럭키스팟 중형 매장 실측 범위(하루 60~120잔,
 *    60~200매)의 중앙값을 기준선으로 잡았다. 지점별 기준선만 바꾸면 다른 규모도 된다.
 *  - 요일 계수: 주말 카페 -13~-26%, 월요일 프린트 +28% (사무 수요).
 *  - 난수는 시드 고정(mulberry32)이라 새로고침해도 같은 값이 나온다 — 화면·테스트 재현용.
 *  - 마지막 날짜는 2026-11-22(데모 기준일)로 고정한다.
 */

export type DemoScenario = "normal" | "print_surge" | "cafe_drop";

export type DemoStore = {
  code: string;
  label: string;
  cafeBase: number;
  printBase: number;
};

export const DEMO_STORES: DemoStore[] = [
  { code: "STORE_YDP", label: "럭키스팟 영등포시장역점", cafeBase: 88, printBase: 128 },
  { code: "STORE_GNG", label: "럭키스팟 강남구청점", cafeBase: 104, printBase: 156 },
];

export const DEFAULT_DEMO_STORE_CODE = DEMO_STORES[0].code;
export const DEFAULT_SCENARIO: DemoScenario = "print_surge";

/** 데모 기준일 (마지막 POS 마감일) */
export const DEMO_AS_OF_DATE = "2026-11-22";

export const SCENARIO_LABELS: Record<DemoScenario, string> = {
  normal: "평소 (교차 보정 없음)",
  print_surge: "최근 3일 프린트 +35%",
  cafe_drop: "카페 매출만 -65% (이상 감지)",
};

export function isDemoScenario(value: unknown): value is DemoScenario {
  return value === "normal" || value === "print_surge" || value === "cafe_drop";
}

export function resolveDemoStore(code?: string | null): DemoStore {
  return DEMO_STORES.find((store) => store.code === code) ?? DEMO_STORES[0];
}

/** FNV-1a — 시드 고정용. 암호학적 용도가 아니다. */
function hashSeed(text: string) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAFE_WEEKDAY = [0.72, 1.02, 1.0, 1.03, 1.05, 1.14, 0.85];
const PRINT_WEEKDAY = [0.5, 1.18, 1.05, 1.02, 1.0, 1.08, 0.62];

/** 요일 계수의 평균을 1로 맞춘다 — 기준선(하루 평균)이 곧 일 평균이 되게. */
function normalized(factors: number[]) {
  const mean = factors.reduce((sum, value) => sum + value, 0) / factors.length;
  return factors.map((value) => value / mean);
}

const CAFE_FACTOR = normalized(CAFE_WEEKDAY);
const PRINT_FACTOR = normalized(PRINT_WEEKDAY);

function isoDateDaysAgo(endDate: string, daysAgo: number) {
  const base = new Date(`${endDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() - daysAgo);
  return base.toISOString().slice(0, 10);
}

function weekdayIndex(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export type GenerateSeriesOptions = {
  storeCode?: string;
  storeLabel?: string;
  scenario?: DemoScenario;
  days?: number;
  cafeBase?: number;
  printBase?: number;
  /** 프린트 급증 폭 (0.35 = +35%) */
  printSurge?: number;
  /** 카페 급감 폭 (0.35 = 정상의 35%로 급감) */
  cafeDrop?: number;
};

function scenarioOf(options: GenerateSeriesOptions): DemoScenario {
  return options.scenario ?? DEFAULT_SCENARIO;
}

/** 21일치 POS·프린트 마감 시계열을 만든다(오름차순). */
export function generateDemoSeries(options: GenerateSeriesOptions = {}): PosDailySales[] {
  const store = resolveDemoStore(options.storeCode);
  const storeCode = options.storeCode && options.storeCode.trim() ? options.storeCode.trim() : store.code;
  const days = Math.min(60, Math.max(7, Math.round(options.days ?? 21)));
  const cafeBase = clampNumber(options.cafeBase ?? store.cafeBase, 1, 3000);
  const printBase = clampNumber(options.printBase ?? store.printBase, 1, 8000);
  const scenario = scenarioOf(options);
  const printSurge = clampNumber(options.printSurge ?? 0.35, 0, 1.5);
  const cafeDrop = clampNumber(options.cafeDrop ?? 0.35, 0, 1);

  const random = mulberry32(hashSeed(`${storeCode}|${days}|${cafeBase}|${printBase}`));
  const rows: PosDailySales[] = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const salesDate = isoDateDaysAgo(DEMO_AS_OF_DATE, index);
    const weekday = weekdayIndex(salesDate);
    const recent = index < 3;

    let drinks = cafeBase * CAFE_FACTOR[weekday] * (0.92 + random() * 0.16);
    let sheets = printBase * PRINT_FACTOR[weekday] * (0.9 + random() * 0.2);

    if (recent && scenario === "print_surge") {
      sheets *= 1 + printSurge;
    }

    if (recent && scenario === "cafe_drop") {
      drinks *= cafeDrop;
    }

    const drinksSold = Math.max(0, Math.round(drinks));
    const printSheets = Math.max(0, Math.round(sheets));
    const colorSheets = Math.round(printSheets * (0.16 + random() * 0.04));

    rows.push({
      storeCode,
      salesDate,
      drinksSold,
      printSheets,
      colorSheets,
      cafeRevenue: drinksSold * 2300,
      printRevenue: colorSheets * 500 + (printSheets - colorSheets) * 100,
    });
  }

  return rows;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
