import type { DeviceTelemetry, RevenueSnapshot } from "../types";

import {
  asNumber,
  asPct,
  asText,
  kstDate,
  type NormalizedSnapshot,
  normalizeCapturedAt,
} from "./types";

/**
 * 에스칼프린트 포털(`escalprint-portal.com`) 스냅샷 어댑터.
 *
 * 포털 화면에서 확인된 실제 필드
 *   장비      : TASKalfa MZ3501ci (강남구청역점), 누적 출력 매수
 *   토너      : K / C / M / Y 잔량 %   (일 3회 업데이트)
 *   용지      : Tray1 / Tray2 잔량 %
 *   청구·정산 : 월별 실매출액(카드+티머니+키오스크−환불), 발주 지출 분석
 *
 * 수집기(🔬 작업)는 **화면에서 읽은 값을 그대로** 아래 형태로 보내면 된다.
 *   { escalprint: { capturedAt, device: { model, serial, cumulativePrintCount },
 *                   toner: { k, c, m, y }, paper: { tray1, tray2 },
 *                   revenue: { month: "2026-11", total, card, tmoney, kiosk, refund } } }
 *
 * 이 어댑터는 별칭(cumulative_print_count, tonerKPct 등)도 받아 준다.
 * 출력 매수는 스냅샷 하나로는 알 수 없으므로 patch에 넣지 않고,
 * 누적 카운터 두 점의 차이로 텔레메트리 계층이 계산한다(telemetry.sheetsFromCounters).
 */

export type EscalprintSnapshotInput = {
  capturedAt?: string;
  device?: {
    model?: string;
    serial?: string;
    cumulativePrintCount?: number | string;
    cumulative_print_count?: number | string;
  };
  cumulativePrintCount?: number | string;
  toner?: { k?: number | string; c?: number | string; m?: number | string; y?: number | string };
  tonerKPct?: number | string;
  tonerCPct?: number | string;
  paper?: { tray1?: number | string; tray2?: number | string };
  tray1Pct?: number | string;
  tray2Pct?: number | string;
  revenue?: {
    month?: string;
    total?: number | string;
    card?: number | string;
    tmoney?: number | string;
    kiosk?: number | string;
    refund?: number | string;
  };
  /** 화면에 '오늘 출력 매수'가 따로 있으면 그대로 보낸다. */
  todaySheets?: number | string;
  /** 컬러 출력 매수(있으면) — 없으면 어댑터가 비중을 가정한다. */
  colorSheets?: number | string;
  notes?: string[];
};

export type EscalprintNormalizeOptions = {
  storeCode: string;
  capturedAtFallback?: string;
};

function monthRange(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;

  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const end = `${year}-${String(monthNumber).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  return { start, end };
}

export function normalizeEscalprintSnapshot(
  input: EscalprintSnapshotInput,
  options: EscalprintNormalizeOptions,
): NormalizedSnapshot {
  const capturedAt = normalizeCapturedAt(input.capturedAt, options.capturedAtFallback);
  const warnings: string[] = [];
  const notes: string[] = [];

  const cumulativePrintCount = asNumber(
    input.device?.cumulativePrintCount ?? input.device?.cumulative_print_count ?? input.cumulativePrintCount,
  );
  const deviceModel = asText(input.device?.model, 60);
  const deviceSerial = asText(input.device?.serial, 40);

  const tonerKPct = asPct(input.toner?.k ?? input.tonerKPct);
  const tonerCPct = asPct(input.toner?.c ?? input.tonerCPct);
  const tonerMPct = asPct(input.toner?.m);
  const tonerYPct = asPct(input.toner?.y);
  const tray1Pct = asPct(input.paper?.tray1 ?? input.tray1Pct);
  const tray2Pct = asPct(input.paper?.tray2 ?? input.tray2Pct);

  const telemetry: DeviceTelemetry = {
    storeCode: options.storeCode,
    source: "escalprint",
    capturedAt,
    deviceModel,
    deviceSerial,
    cumulativePrintCount,
    tonerKPct,
    tonerCPct,
    tonerMPct,
    tonerYPct,
    tray1Pct,
    tray2Pct,
  };

  if (cumulativePrintCount === null) {
    warnings.push("누적 출력 매수가 없어 출력량(매/일)을 카운터로 계산할 수 없습니다.");
  }
  if (tonerKPct === null && tonerCPct === null) {
    warnings.push("토너 잔량 %가 없어 토너 현재고를 실측으로 바꾸지 못했습니다.");
  }
  if (tray1Pct === null && tray2Pct === null) {
    warnings.push("용지 트레이 %가 없어 A4 현재고를 실측으로 바꾸지 못했습니다.");
  }

  const month = typeof input.revenue?.month === "string" ? input.revenue.month : null;
  const monthTotal = asNumber(input.revenue?.total);
  const refund = asNumber(input.revenue?.refund) ?? 0;

  let revenue: RevenueSnapshot | null = null;
  const range = month ? monthRange(month) : null;

  if (range && monthTotal !== null) {
    revenue = {
      source: "escalprint",
      scope: "month",
      periodStart: range.start,
      periodEnd: range.end,
      grossAmount: monthTotal,
      refundAmount: refund,
      netAmount: monthTotal - refund,
      orderCount: null,
      refundCount: null,
    };
    notes.push(`${month} 프린트 실매출 ${(monthTotal - refund).toLocaleString("ko-KR")}원(환불 차감)`);
  }

  const todaySheets = asNumber(input.todaySheets);
  const colorSheets = asNumber(input.colorSheets);

  const patch: NormalizedSnapshot["patch"] = {};
  if (todaySheets !== null) {
    patch.printSheets = Math.max(0, Math.round(todaySheets));
    if (colorSheets !== null) {
      patch.colorSheets = Math.max(0, Math.round(colorSheets));
    } else {
      patch.colorSheets = Math.round(patch.printSheets * 0.18);
      warnings.push("컬러 출력 매수가 없어 18%로 가정했습니다(장비 컬러 카운터 확인 필요).");
    }
  }

  if (deviceModel) notes.push(`장비 ${deviceModel}${deviceSerial ? ` (${deviceSerial})` : ""}`);
  if (input.notes?.length) notes.push(...input.notes.slice(0, 5));

  return {
    source: "escalprint",
    capturedAt,
    salesDate: kstDate(capturedAt),
    patch,
    telemetry,
    beverages: [],
    revenues: revenue ? [revenue] : [],
    machine: null,
    notes,
    warnings,
  };
}
