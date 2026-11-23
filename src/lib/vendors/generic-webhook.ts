import type { NormalizedSnapshot } from "../../features/auto-order/adapters";
import type { DeviceTelemetry, PosDailySales, RevenueSnapshot } from "../../features/auto-order/types";

import {
  asNumber,
  asPct,
  asText,
  kstDateOf,
  type PrintVendorAdapter,
  type VendorCsvResult,
  type VendorNormalizeOptions,
} from "./types";

/**
 * 타사 복합기 공용 어댑터(`generic_webhook`).
 *
 * 두 입구를 받는다.
 *  1) 표준 JSON 웹훅 — `POST /api/auto-order/ingest-pos`
 *       { "vendor": "generic_webhook", "storeCode": "STORE_X", "capturedAt": "ISO",
 *         "device": { "model": "…", "serial": "…", "cumulativePrintCount": 1234567 },
 *         "consumables": [ { "sku": "toner-black", "levelPct": 62 },
 *                          { "sku": "toner-c", "levelPct": 41 },
 *                          { "sku": "a4-paper", "levelPct": 38 } ],
 *         "sales": { "date": "2026-11-23", "printRevenue": 250000, "printSheets": 1200,
 *                    "colorSheets": 90, "cafeRevenue": 0, "drinksSold": 0 },
 *         "machine": { "online": true, "alerts": [] } }
 *  2) CSV 업로드 — `POST /api/auto-order/ingest-pos/csv` (미리보기 → 적용)
 *       날짜,커피매출,음료잔수,프린트매출,출력매수,컬러매수,원두g
 *       2026-11-23,0,0,250000,1200,90,0
 *
 * 왜 '공용'인가
 *  - 신규 타사 복합기는 포털 구조가 제각각이라 크롤러를 매번 만들 수 없다.
 *    표준 JSON 한 가지 + CSV 한 가지면 새 벤더도 당일에 붙는다.
 */

const TONER_KEYS: Record<string, "k" | "c" | "m" | "y"> = {
  "toner-black": "k",
  k: "k",
  black: "k",
  "toner-c": "c",
  cyan: "c",
  c: "c",
  "toner-m": "m",
  magenta: "m",
  m: "m",
  "toner-y": "y",
  yellow: "y",
  y: "y",
};

const PAPER_KEYS = new Set(["a4-paper", "a4", "paper", "용지", "a4용지"]);

type GenericConsumable = {
  sku?: string;
  name?: string;
  levelPct?: number | string;
  level?: number | string;
  pct?: number | string;
};

export type GenericWebhookPayload = {
  vendor?: string;
  storeCode?: string;
  capturedAt?: string;
  device?: { model?: string; serial?: string; cumulativePrintCount?: number | string; counter?: number | string };
  consumables?: GenericConsumable[];
  supplies?: GenericConsumable[];
  sales?: {
    date?: string;
    cafeRevenue?: number | string;
    drinksSold?: number | string;
    beanGrams?: number | string;
    printRevenue?: number | string;
    printSheets?: number | string;
    colorSheets?: number | string;
    month?: string;
    monthRevenue?: number | string;
  };
  machine?: { online?: boolean; alerts?: string[] };
  notes?: string[];
};

function consumableKey(item: GenericConsumable) {
  return (item.sku ?? item.name ?? "").trim().toLowerCase();
}

export function normalizeGenericWebhook(
  input: GenericWebhookPayload,
  options: VendorNormalizeOptions,
): NormalizedSnapshot | null {
  if (!input || typeof input !== "object") return null;

  const capturedAt = (() => {
    const value = input.capturedAt ?? options.capturedAt;
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  })();

  const warnings: string[] = [];
  const notes: string[] = [];
  const toner: Record<"k" | "c" | "m" | "y", number | null> = { k: null, c: null, m: null, y: null };
  let tray1: number | null = null;
  let tray2: number | null = null;

  for (const item of [...(input.consumables ?? []), ...(input.supplies ?? [])]) {
    const key = consumableKey(item);
    const value = asPct(item.levelPct ?? item.level ?? item.pct);
    if (value === null) continue;

    const tonerKey = TONER_KEYS[key];
    if (tonerKey) {
      toner[tonerKey] = value;
      continue;
    }

    if (PAPER_KEYS.has(key)) {
      tray1 = value;
      tray2 = value;
    }
  }

  const counter = asNumber(input.device?.cumulativePrintCount ?? input.device?.counter);
  if (counter === null) warnings.push("누적 출력 카운터가 없어 출력량(매/일)을 계산할 수 없습니다.");
  if (Object.values(toner).every((value) => value === null)) warnings.push("토너 잔량(%)이 없습니다.");

  const telemetry: DeviceTelemetry = {
    storeCode: options.storeCode,
    source: "generic_webhook",
    capturedAt,
    deviceModel: asText(input.device?.model, 60),
    deviceSerial: asText(input.device?.serial, 40),
    cumulativePrintCount: counter,
    tonerKPct: toner.k,
    tonerCPct: toner.c,
    tonerMPct: toner.m,
    tonerYPct: toner.y,
    tray1Pct: tray1,
    tray2Pct: tray2,
  };

  const sales = input.sales ?? {};
  const salesDate = kstDateOf(sales.date ?? capturedAt);
  const printRevenue = asNumber(sales.printRevenue);
  const printSheets = asNumber(sales.printSheets);
  const colorSheets = asNumber(sales.colorSheets);
  const cafeRevenue = asNumber(sales.cafeRevenue);
  const drinksSold = asNumber(sales.drinksSold);
  const beanGrams = asNumber(sales.beanGrams);

  const revenues: RevenueSnapshot[] = [];
  const monthRevenue = asNumber(sales.monthRevenue);
  if (monthRevenue !== null && sales.month && /^\d{4}-\d{2}$/.test(sales.month)) {
    const [year, monthNumber] = sales.month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    revenues.push({
      source: "generic_webhook",
      scope: "month",
      periodStart: `${sales.month}-01`,
      periodEnd: `${sales.month}-${String(lastDay).padStart(2, "0")}`,
      grossAmount: monthRevenue,
      refundAmount: 0,
      netAmount: monthRevenue,
      orderCount: null,
      refundCount: null,
    });
  }

  if (printRevenue !== null) {
    revenues.push({
      source: "generic_webhook",
      scope: "day",
      periodStart: salesDate,
      periodEnd: salesDate,
      grossAmount: printRevenue,
      refundAmount: 0,
      netAmount: printRevenue,
      orderCount: printSheets,
      refundCount: null,
    });
  }

  if (printSheets === null && counter !== null) {
    notes.push("출력 매수는 누적 카운터 두 스냅샷의 차이로 계산합니다.");
  }

  return {
    source: "generic_webhook",
    capturedAt,
    salesDate,
    patch: {
      ...(printRevenue !== null ? { printRevenue } : {}),
      ...(printSheets !== null ? { printSheets } : {}),
      ...(colorSheets !== null ? { colorSheets } : {}),
      ...(cafeRevenue !== null ? { cafeRevenue } : {}),
      ...(drinksSold !== null ? { drinksSold } : {}),
      ...(beanGrams !== null ? { beanGrams } : {}),
    },
    telemetry,
    beverages: [],
    revenues,
    machine: input.machine
      ? { online: typeof input.machine.online === "boolean" ? input.machine.online : null, alerts: (input.machine.alerts ?? []).slice(0, 5) }
      : null,
    notes: [
      "타사 복합기 공용 표준 JSON으로 정규화했습니다.",
      ...(input.notes ?? []).slice(0, 3),
    ],
    warnings,
  };
}

/* ------------------------------------------------------------------------- */
/* CSV — 업로드·미리보기                                                        */
/* ------------------------------------------------------------------------- */

/** 날짜 열 이름(소문자·공백 제거 후 비교) */
const DATE_KEYS = ["date", "salesdate", "날짜", "일자", "마감일"];
const COLUMN_ALIASES: Record<keyof Omit<PosDailySales, "storeCode" | "salesDate"> | "beanGrams", string[]> = {
  cafeRevenue: ["caferevenue", "커피매출", "커피", "카페매출"],
  drinksSold: ["drinkssold", "음료잔수", "잔수", "음료"],
  beanGrams: ["beanngrams", "beangrams", "원두g", "원두"],
  printRevenue: ["printrevenue", "프린트매출", "프린트", "출력매출"],
  printSheets: ["printsheets", "출력매수", "매수", "출력"],
  colorSheets: ["colorsheets", "컬러매수", "컬러"],
  cafeReported: [],
  printReported: [],
};

function splitLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[\s_\-()]/g, "");
}

function parseDate(value: string): string | null {
  const text = value.trim().replace(/[./]/g, "-");
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const koreanCompact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (koreanCompact) return `${koreanCompact[1]}-${koreanCompact[2]}-${koreanCompact[3]}`;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : kstDateOf(parsed);
}

export function parseSalesCsv(csv: string, options: { storeCode: string }): VendorCsvResult {
  const warnings: string[] = [];
  const lines = csv
    .replace(/^\ufeff/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { rows: [], accepted: 0, skipped: 0, warnings: ["CSV가 비어 있습니다."], headers: {} };
  }

  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const header = splitLine(lines[0], delimiter).map(normalizeHeader);

  const findColumn = (aliases: string[]) => header.findIndex((cell) => aliases.includes(cell));
  const dateIndex = findColumn(DATE_KEYS.map(normalizeHeader));

  if (dateIndex === -1) {
    return {
      rows: [],
      accepted: 0,
      skipped: 0,
      warnings: ["날짜 열을 찾지 못했습니다. 첫 줄에 date(또는 날짜) 열이 있어야 합니다."],
      headers: {},
    };
  }

  const indexOf: Record<string, number> = { date: dateIndex };
  const headers: Record<string, string> = { date: lines[0].split(delimiter)[dateIndex]?.trim() ?? "date" };

  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (key === "cafeReported" || key === "printReported") continue;
    const index = findColumn(aliases.map(normalizeHeader));
    if (index >= 0) {
      indexOf[key] = index;
      const raw = splitLine(lines[0], delimiter)[index] ?? key;
      headers[key] = raw;
    }
  }

  const rows: PosDailySales[] = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delimiter);
    const salesDate = parseDate(cells[dateIndex] ?? "");
    if (!salesDate) {
      skipped += 1;
      continue;
    }

    const value = (key: string) => (indexOf[key] === undefined ? null : asNumber(cells[indexOf[key]]));

    const row: PosDailySales = {
      storeCode: options.storeCode,
      salesDate,
      cafeRevenue: Math.max(0, Math.round(value("cafeRevenue") ?? 0)),
      drinksSold: Math.max(0, Math.round(value("drinksSold") ?? 0)),
      printRevenue: Math.max(0, Math.round(value("printRevenue") ?? 0)),
      printSheets: Math.max(0, Math.round(value("printSheets") ?? 0)),
      colorSheets: Math.max(0, Math.round(value("colorSheets") ?? 0)),
      cafeReported: indexOf.cafeRevenue !== undefined || indexOf.drinksSold !== undefined,
      printReported: indexOf.printRevenue !== undefined || indexOf.printSheets !== undefined,
    };

    const bean = value("beanGrams");
    if (bean !== null) row.beanGrams = Math.max(0, Math.round(bean));

    rows.push(row);
  }

  rows.sort((a, b) => a.salesDate.localeCompare(b.salesDate));

  if (rows.length === 0) warnings.push("읽을 수 있는 데이터 행이 없습니다.");
  if (skipped > 0) warnings.push(`날짜를 읽지 못한 ${skipped}행은 건너뛰었습니다.`);
  if (Object.keys(headers).length <= 1) {
    warnings.push("매출·출력 열을 찾지 못했습니다. 커피매출·프린트매출·출력매수 등의 열 이름을 확인해 주세요.");
  }
  if (rows.length > 60) warnings.push("60일을 넘는 행은 앞에서 60일만 반영됩니다.");

  return { rows: rows.slice(-60), accepted: Math.min(rows.length, 60), skipped, warnings, headers };
}

export const genericWebhookAdapter: PrintVendorAdapter = {
  id: "generic_webhook",
  label: "타사 복합기(공용)",
  capabilities: { telemetry: true, revenue: true, csv: true, jsonWebhook: true },

  detect(raw) {
    if (!raw || typeof raw !== "object") return false;
    if (raw.vendor === "generic_webhook") return true;
    return "consumables" in raw || ("sales" in raw && "device" in raw);
  },

  normalize(raw, options) {
    return normalizeGenericWebhook(raw as GenericWebhookPayload, options);
  },

  parseCsv(csv, options) {
    return parseSalesCsv(csv, { storeCode: options.storeCode });
  },
};
