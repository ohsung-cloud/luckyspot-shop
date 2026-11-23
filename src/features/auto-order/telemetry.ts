import { resolveRules } from "./rules";
import type { DeviceTelemetry, StockSignal, TelemetrySummary } from "./types";

/**
 * 포털 실측 잔량(%) → 소모 단위 환산.
 *
 * 프린트 포털(에스칼프린트)은 장비 상태를 **%로만** 준다.
 *   토너 K/C/M/Y % · 용지 Tray1/Tray2 %
 * 이 값을 그대로 '재고'로 쓰려면 100%일 때의 용량이 필요하다.
 *   검정토너 1개 = 500g, 컬러토너 1개 = 500g, A4 2트레이 = 1,100매
 * 용량은 BOM 규칙(`signalCapacity`)에 있으므로, 규칙을 돌면서 해당 신호만 환산한다.
 *
 *   현재고(g 또는 매) = pct / 100 × signalCapacity
 *
 * 컬러토너는 C/M/Y 중 **가장 적은 값**(병목)을 쓴다 — 하나라도 떨어지면 컬러 출력이 멈춘다.
 * 용지는 두 트레이 평균을 쓴다.
 */

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function signalPct(telemetry: DeviceTelemetry, signal: StockSignal): number | null {
  if (signal === "toner_black_pct") return telemetry.tonerKPct;

  if (signal === "toner_color_pct") {
    const colors = [telemetry.tonerCPct, telemetry.tonerMPct, telemetry.tonerYPct].filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    );
    return colors.length > 0 ? Math.min(...colors) : null;
  }

  const trays = [telemetry.tray1Pct, telemetry.tray2Pct].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return trays.length > 0 ? trays.reduce((sum, value) => sum + value, 0) / trays.length : null;
}

export function stockOverridesFromTelemetry(telemetry: DeviceTelemetry | null | undefined) {
  const overrides: Record<string, number> = {};
  if (!telemetry) return overrides;

  for (const rule of resolveRules()) {
    if (!rule.stockSignal || !rule.signalCapacity) continue;

    const pct = signalPct(telemetry, rule.stockSignal);
    if (pct === null || !Number.isFinite(pct)) continue;

    overrides[rule.sku] = round((Math.max(0, Math.min(100, pct)) / 100) * rule.signalCapacity, 1);
  }

  return overrides;
}

export function telemetrySummary(telemetry: DeviceTelemetry | null): TelemetrySummary | null {
  if (!telemetry) return null;

  return {
    capturedAt: telemetry.capturedAt,
    deviceModel: telemetry.deviceModel,
    cumulativePrintCount: telemetry.cumulativePrintCount,
    toner: {
      k: telemetry.tonerKPct,
      c: telemetry.tonerCPct,
      m: telemetry.tonerMPct,
      y: telemetry.tonerYPct,
    },
    paper: { tray1: telemetry.tray1Pct, tray2: telemetry.tray2Pct },
  };
}

/**
 * 누적 출력 카운터 두 스냅샷 사이의 차이로 하루 출력 매수를 추정한다.
 *
 * 3시간 간격 스냅샷을 그대로 24시간으로 환산하면 3,000매 같은 과대값이 나온다.
 * 그래서 **최근 스냅샷 기준 12~48시간 전**의 스냅샷을 골라 그 구간만 24시간으로 환산한다.
 * (하루 3회 수집이면 하루쯤 지나 자동으로 24시간 구간이 생긴다.)
 * 그런 구간이 아직 없으면 계산하지 않고, 직전 출력량(있다면)을 유지한다.
 */
export function sheetsFromCounters(history: DeviceTelemetry[]): { sheets: number | null; note: string } {
  const points = history
    .filter(
      (item) =>
        typeof item.cumulativePrintCount === "number" && Number.isFinite(item.cumulativePrintCount),
    )
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  if (points.length < 2) {
    return { sheets: null, note: "누적 카운터 스냅샷이 2개 미만 — 출력량은 다음 수집부터 계산됩니다." };
  }

  const latest = points[points.length - 1];
  const latestMs = new Date(latest.capturedAt).getTime();

  let previous: DeviceTelemetry | null = null;
  let bestGap = Number.POSITIVE_INFINITY;

  for (const point of points.slice(0, -1)) {
    const hours = (latestMs - new Date(point.capturedAt).getTime()) / 3600_000;
    if (hours < 12 || hours > 48) continue;

    const gap = Math.abs(hours - 24);
    if (gap < bestGap) {
      bestGap = gap;
      previous = point;
    }
  }

  if (!previous) {
    return {
      sheets: null,
      note: "스냅샷 간격이 12시간 미만이라 하루 출력량은 다음 수집에서 계산합니다(직전 값 유지).",
    };
  }

  const delta = (latest.cumulativePrintCount as number) - (previous.cumulativePrintCount as number);
  const hours = (latestMs - new Date(previous.capturedAt).getTime()) / 3600_000;

  if (!Number.isFinite(delta) || delta < 0) {
    return { sheets: null, note: "누적 카운터가 줄어 출력량을 계산하지 못했습니다(장비 초기화·교체 의심)." };
  }

  const perDay = Math.min(20000, (delta / hours) * 24);
  return {
    sheets: Math.max(0, Math.round(perDay)),
    note: `누적 카운터 ${delta.toLocaleString("ko-KR")}매 / ${hours.toFixed(1)}시간 → 하루 ${Math.round(perDay).toLocaleString("ko-KR")}매`,
  };
}
