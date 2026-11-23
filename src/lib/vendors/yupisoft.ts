import type { NormalizedSnapshot } from "../../features/auto-order/adapters";
import type { BeverageLine, DeviceTelemetry, RevenueSnapshot } from "../../features/auto-order/types";

import { asNumber, asPct, asText, kstDateOf, type PrintVendorAdapter, type VendorNormalizeOptions } from "./types";

/**
 * 유피소프트 — 타사 복합기 포털/API 어댑터.
 *
 * 유피소프트는 아직 화면 구조가 확정되지 않았으므로 **스키마 계약**을 먼저 고정한다.
 * 수집기(또는 유피소프트 API 연동)는 아래 모양으로만 보내면 되고, 앱은 표준 스냅샷으로 받는다.
 *
 *   {
 *     "yupisoft": {
 *       "capturedAt": "2026-11-23T15:50:00+09:00",
 *       "branch": "SONGDO5",
 *       "machine":  { "model": "...", "serial": "...", "counterTotal": 1234567, "online": true, "errors": [] },
 *       "supplies": [ { "code": "K", "level": 62 }, { "code": "C", "level": 0.41 } ],
 *       "trays":    [ { "name": "Tray1", "level": 35 }, { "name": "Tray2", "level": 41 } ],
 *       "sales":    { "day": "2026-11-23", "amount": 250000, "refund": 2000,
 *                     "prints": 1200, "colorPrints": 90,
 *                     "month": "2026-11", "monthAmount": 4200000 }
 *     }
 *   }
 *
 * 별칭도 받는다: tonerK/tonerC..., tray1/tray2, counter(누적), monthTotal.
 *  - 레벨은 62(%)도 0.62(비율)도 모두 받는다.
 *  - 값이 없으면 null — 0%로 읽어 '바닥' 경보를 내지 않는다.
 */

type YupisoftSupply = { code?: string; name?: string; level?: number | string; pct?: number | string };

export type YupisoftSnapshotInput = {
  capturedAt?: string;
  branch?: string;
  machine?: {
    model?: string;
    serial?: string;
    counterTotal?: number | string;
    counter?: number | string;
    online?: boolean;
    errors?: string[];
  };
  supplies?: YupisoftSupply[];
  tonerK?: number | string;
  tonerC?: number | string;
  tonerM?: number | string;
  tonerY?: number | string;
  trays?: { name?: string; level?: number | string }[];
  tray1?: number | string;
  tray2?: number | string;
  sales?: {
    day?: string;
    amount?: number | string;
    refund?: number | string;
    prints?: number | string;
    colorPrints?: number | string;
    month?: string;
    monthAmount?: number | string;
    monthTotal?: number | string;
  };
  notes?: string[];
};

function supplyPct(input: YupisoftSnapshotInput, code: "K" | "C" | "M" | "Y") {
  const direct = input[`toner${code}` as const];
  if (direct !== undefined) return asPct(direct);

  const supply = (input.supplies ?? []).find(
    (item) => (item.code ?? item.name ?? "").trim().toUpperCase().startsWith(code),
  );

  return supply ? asPct(supply.level ?? supply.pct) : null;
}

function monthRange(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;

  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function normalizeYupisoftSnapshot(
  input: YupisoftSnapshotInput,
  options: VendorNormalizeOptions,
): NormalizedSnapshot | null {
  if (!input || typeof input !== "object") return null;

  const capturedAt = (() => {
    const value = input.capturedAt ?? options.capturedAt;
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  })();

  const trayLevels = (input.trays ?? []).map((tray) => asPct(tray.level));
  const tray1Pct = asPct(input.tray1) ?? trayLevels[0] ?? null;
  const tray2Pct = asPct(input.tray2) ?? trayLevels[1] ?? null;

  const warnings: string[] = [];
  const notes: string[] = [];

  const machine = input.machine;
  const counter = asNumber(machine?.counterTotal ?? machine?.counter);

  const telemetry: DeviceTelemetry = {
    storeCode: options.storeCode,
    source: "yupisoft",
    capturedAt,
    deviceModel: asText(machine?.model, 60),
    deviceSerial: asText(machine?.serial, 40),
    cumulativePrintCount: counter,
    tonerKPct: supplyPct(input, "K"),
    tonerCPct: supplyPct(input, "C"),
    tonerMPct: supplyPct(input, "M"),
    tonerYPct: supplyPct(input, "Y"),
    tray1Pct,
    tray2Pct,
  };

  if (counter === null) warnings.push("유피소프트 누적 출력(카운터)이 없어 출력량을 계산하지 못했습니다.");
  if (telemetry.tonerKPct === null) warnings.push("유피소프트 검정 토너 잔량이 없습니다.");
  if (tray1Pct === null && tray2Pct === null) warnings.push("유피소프트 용지 트레이 잔량이 없습니다.");

  const sales = input.sales;
  const salesDate = kstDateOf(sales?.day ?? capturedAt);
  const prints = asNumber(sales?.prints);
  const colorPrints = asNumber(sales?.colorPrints);
  const printRevenue = asNumber(sales?.amount);
  const refund = asNumber(sales?.refund) ?? 0;

  if (prints === null) notes.push("일 출력 매수는 카운터 차이로 계산합니다(수집 2회 이상 필요).");

  const revenues: RevenueSnapshot[] = [];
  const monthAmount = asNumber(sales?.monthAmount ?? sales?.monthTotal);
  const monthRangeValue = sales?.month ? monthRange(sales.month) : null;

  if (monthAmount !== null && monthRangeValue) {
    revenues.push({
      source: "yupisoft",
      scope: "month",
      periodStart: monthRangeValue.start,
      periodEnd: monthRangeValue.end,
      grossAmount: monthAmount + refund,
      refundAmount: refund,
      netAmount: monthAmount,
      orderCount: null,
      refundCount: null,
    });
  }

  if (printRevenue !== null) {
    revenues.push({
      source: "yupisoft",
      scope: "day",
      periodStart: salesDate,
      periodEnd: salesDate,
      grossAmount: printRevenue + refund,
      refundAmount: refund,
      netAmount: printRevenue,
      orderCount: prints,
      refundCount: null,
    });
  }

  const beverages: BeverageLine[] = [];

  const machineStatus = machine
    ? { online: typeof machine.online === "boolean" ? machine.online : null, alerts: (machine.errors ?? []).slice(0, 5) }
    : null;

  return {
    source: "yupisoft",
    capturedAt,
    salesDate,
    patch: {
      ...(printRevenue !== null ? { printRevenue } : {}),
      ...(prints !== null ? { printSheets: prints } : {}),
      ...(colorPrints !== null ? { colorSheets: colorPrints } : {}),
    },
    telemetry,
    beverages,
    revenues,
    machine: machineStatus,
    notes: [
      `유피소프트 지점 ${asText(input.branch, 30) ?? "-"} · ${notes.join(" ") || "장비 상태·매출 정규화 완료"}`,
      ...(input.notes ?? []).slice(0, 3),
    ],
    warnings,
  };
}

export const yupisoftAdapter: PrintVendorAdapter = {
  id: "yupisoft",
  label: "유피소프트",
  capabilities: { telemetry: true, revenue: true, csv: false, jsonWebhook: true },

  detect(raw) {
    if (!raw || typeof raw !== "object") return false;
    if ("yupisoft" in raw) return true;
    return "supplies" in raw || ("trays" in raw && "machine" in raw);
  },

  normalize(raw, options) {
    const payload = (raw.yupisoft ?? raw) as YupisoftSnapshotInput;
    return normalizeYupisoftSnapshot(payload, options);
  },
};
