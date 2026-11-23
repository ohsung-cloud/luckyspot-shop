import type { BeverageLine, DeviceTelemetry, PosDailySales, RevenueSnapshot } from "../types";

/** 포털 스냅샷을 일일 마감 행으로 바꾼 결과(부분 패치). */
export type NormalizedPatch = Partial<
  Pick<PosDailySales, "cafeRevenue" | "drinksSold" | "printRevenue" | "printSheets" | "colorSheets">
>;

export type NormalizedSnapshot = {
  source: "escalprint" | "loyalsuns";
  capturedAt: string;
  /** KST 기준 날짜 */
  salesDate: string;
  patch: NormalizedPatch;
  telemetry: DeviceTelemetry | null;
  beverages: BeverageLine[];
  revenues: RevenueSnapshot[];
  machine: { online: boolean | null; alerts: string[] } | null;
  notes: string[];
  warnings: string[];
};

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[,\s원%매잔건]/g, "");
    if (cleaned === "" || cleaned === "-") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function asPct(value: unknown): number | null {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  return Math.max(0, Math.min(100, parsed));
}

export function asText(value: unknown, max = 80): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text.length === 0 ? null : text.slice(0, max);
}

/** ISO 문자열 → KST 날짜(YYYY-MM-DD). 잘못된 값이면 오늘(KST). */
export function kstDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function normalizeCapturedAt(value: unknown, fallback = new Date().toISOString()) {
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return fallback;
}
