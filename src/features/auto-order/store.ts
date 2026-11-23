import { readSupabaseConfig, SUPABASE_TIMEOUT_MS, supabaseHeaders } from "../supabase/config";
import type {
  AutoOrderProposal,
  BeverageLine,
  DeviceTelemetry,
  MachineStatusSummary,
  PosDailySales,
  ProposalStatus,
  RevenueSnapshot,
  RevenueSummary,
  SplitResult,
} from "./types";

/**
 * 자동발주 저장소.
 *
 * 두 겹으로 둔다.
 *  1) Supabase `pos_daily_sales` · `auto_order_proposals` · `auto_order_ledger`
 *     — SQL(notes/supabase-patent1-auto-order-2026-11-23.sql)을 실행했을 때 원본이 된다.
 *  2) 인메모리 폴백 — SQL을 아직 실행하지 않았거나(테이블 없음), 키가 없어도
 *     화면·API·시뮬레이션이 100% 동작하게 한다. 서버리스 인스턴스가 살아 있는 동안 유효하다.
 *
 * Supabase 호출은 전부 best-effort다. 실패해도 예외를 던지지 않고, 경고는 한 번만 남긴다.
 * → 발주 승인·취소·확정은 DB 상태와 무관하게 항상 진행된다(기존 발주 흐름과 같은 원칙).
 */

export type StoredApproval = {
  approvalId: string;
  storeCode: string;
  storeLabel: string;
  status: ProposalStatus;
  asOfDate: string;
  approvedAt: string;
  expiresAt: string;
  proposals: AutoOrderProposal[];
  split: SplitResult;
  updatedAt: string;
};

type MemoryDb = {
  sales: Map<string, PosDailySales[]>;
  approvals: Map<string, StoredApproval>;
  /** 포털 스냅샷(최신이 뒤). 하루 3회 수집분을 그대로 보관한다. */
  telemetry: Map<string, DeviceTelemetry[]>;
  beverages: Map<string, BeverageLine[]>;
  revenue: Map<string, RevenueSnapshot[]>;
  machine: Map<string, MachineStatusSummary>;
};

const MEMORY_KEY = "__luckyspotAutoOrderMemoryV1";
const MAX_DAYS = 60;

function memory(): MemoryDb {
  const holder = globalThis as unknown as Record<string, MemoryDb | undefined>;

  if (!holder[MEMORY_KEY]) {
    holder[MEMORY_KEY] = {
      sales: new Map(),
      approvals: new Map(),
      telemetry: new Map(),
      beverages: new Map(),
      revenue: new Map(),
      machine: new Map(),
    };
  }

  return holder[MEMORY_KEY];
}

let warned = false;

function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn(`[auto-order] ${message}`);
}

async function supabaseRequest(path: string, init?: RequestInit): Promise<Response | null> {
  const config = readSupabaseConfig();
  if (!config) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    return await fetch(`${config.url}/rest/v1/${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        ...supabaseHeaders(config.secret),
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch {
    warnOnce("Supabase에 연결하지 못했습니다 — 데모 폴백으로 계속합니다.");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function rowToSales(row: Record<string, unknown>): PosDailySales | null {
  const salesDate = typeof row.sales_date === "string" ? row.sales_date.slice(0, 10) : null;
  const storeCode = typeof row.store_code === "string" ? row.store_code : null;
  if (!salesDate || !storeCode) return null;

  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

  return {
    storeCode,
    salesDate,
    cafeRevenue: number(row.cafe_revenue),
    drinksSold: number(row.drinks_sold),
    printRevenue: number(row.print_revenue),
    printSheets: number(row.print_sheets),
    colorSheets: number(row.color_sheets),
    beanGrams: typeof row.bean_grams === "number" ? row.bean_grams : undefined,
    cafeReported: row.cafe_reported !== false,
    printReported: row.print_reported !== false,
  };
}

function salesKey(storeCode: string) {
  return storeCode.trim().toUpperCase();
}

/** Supabase → 메모리 순으로 마감 데이터를 찾는다. 없으면 null(호출부가 데모로 폴백). */
export async function loadSales(
  storeCode: string,
): Promise<{ rows: PosDailySales[]; dataSource: "supabase" | "memory" } | null> {
  const key = salesKey(storeCode);
  const cached = memory().sales.get(key);

  // 1일치라도 있으면 실측으로 쓴다(데모로 덮지 않는다). 7일 미만이면 buildState가 sparse로 표시한다.
  if (cached && cached.length > 0) {
    return { rows: cached, dataSource: "memory" };
  }

  const response = await supabaseRequest(
    `pos_daily_sales?select=store_code,sales_date,cafe_revenue,drinks_sold,bean_grams,print_revenue,print_sheets,color_sheets,cafe_reported,print_reported&store_code=eq.${encodeURIComponent(
      key,
    )}&order=sales_date.desc&limit=28`,
  );

  if (!response || !response.ok) {
    if (response && response.status >= 400) {
      warnOnce("pos_daily_sales 테이블을 읽지 못했습니다 — SQL 미적용으로 보고 데모 폴백을 씁니다.");
    }
    return cached && cached.length > 0 ? { rows: cached, dataSource: "memory" } : null;
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown>[] | null;
  if (!Array.isArray(payload) || payload.length === 0) {
    return cached && cached.length > 0 ? { rows: cached, dataSource: "memory" } : null;
  }

  const rows = payload
    .map(rowToSales)
    .filter((row): row is PosDailySales => row !== null)
    .sort((a, b) => a.salesDate.localeCompare(b.salesDate));

  if (rows.length > 0) {
    memory().sales.set(key, rows);
    return { rows, dataSource: "supabase" };
  }

  return cached && cached.length > 0 ? { rows: cached, dataSource: "memory" } : null;
}

/** 마감 데이터를 메모리 + Supabase에 적재한다. Supabase 실패는 무시. */
export async function saveSales(rows: PosDailySales[]): Promise<void> {
  if (rows.length === 0) return;

  const key = salesKey(rows[0].storeCode);
  const merged = new Map<string, PosDailySales>();

  for (const row of memory().sales.get(key) ?? []) merged.set(row.salesDate, row);
  for (const row of rows) merged.set(row.salesDate, row);

  memory().sales.set(
    key,
    [...merged.values()].sort((a, b) => a.salesDate.localeCompare(b.salesDate)).slice(-MAX_DAYS),
  );

  const body = rows.map((row) => ({
    store_code: salesKey(row.storeCode),
    sales_date: row.salesDate,
    cafe_revenue: Math.round(row.cafeRevenue),
    drinks_sold: Math.round(row.drinksSold),
    print_revenue: Math.round(row.printRevenue),
    print_sheets: Math.round(row.printSheets),
    color_sheets: Math.round(row.colorSheets),
    bean_grams: typeof row.beanGrams === "number" ? Math.round(row.beanGrams) : null,
    cafe_reported: row.cafeReported !== false,
    print_reported: row.printReported !== false,
    source: "auto-order-ingest",
    updated_at: new Date().toISOString(),
  }));

  await supabaseRequest("pos_daily_sales?on_conflict=store_code,sales_date", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
  });
}

export async function saveApproval(approval: StoredApproval): Promise<void> {
  memory().approvals.set(approval.approvalId, approval);

  await supabaseRequest("auto_order_proposals?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: approval.approvalId,
      store_code: salesKey(approval.storeCode),
      store_label: approval.storeLabel,
      status: approval.status,
      as_of_date: approval.asOfDate || null,
      items: approval.proposals,
      split_result: approval.split,
      total_amount: approval.split.totalAmount,
      approved_at: approval.approvedAt,
      grace_expires_at: approval.expiresAt,
      updated_at: approval.updatedAt,
    }),
  });
}

export async function patchApproval(
  approvalId: string,
  status: ProposalStatus,
  patch: Record<string, unknown> = {},
): Promise<void> {
  const stored = memory().approvals.get(approvalId);
  if (stored) {
    memory().approvals.set(approvalId, { ...stored, status, updatedAt: new Date().toISOString() });
  }

  await supabaseRequest(`auto_order_proposals?id=eq.${encodeURIComponent(approvalId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status,
      ...patch,
      updated_at: new Date().toISOString(),
    }),
  });
}

export function findApproval(approvalId: string): StoredApproval | null {
  return memory().approvals.get(approvalId) ?? null;
}

/** 같은 지점에서 유예 중이거나 이미 확정·취소된 승인. 제안 상태 표시에 쓴다. */
export function listApprovals(storeCode: string): StoredApproval[] {
  const key = salesKey(storeCode);
  return [...memory().approvals.values()].filter((approval) => salesKey(approval.storeCode) === key);
}

/** 정산 귀속 원장(auto_order_ledger) — 사업자별 조달 원가를 남긴다. */
export async function saveLedger(split: SplitResult, settledAt: string): Promise<void> {
  const rows = split.slips.flatMap((slip) =>
    slip.suppliers.flatMap((group) =>
      group.lines.map((line) => {
        const supplyAmount = Math.round(line.amount / 1.1);
        return {
          approval_id: split.approvalId,
          store_code: salesKey(split.storeCode),
          entity_type: slip.entityType,
          entity_name: slip.entityName,
          supplier: group.supplier,
          sku: line.sku,
          quantity: line.quantity,
          amount: line.amount,
          supply_amount: supplyAmount,
          vat_amount: line.amount - supplyAmount,
          tax_invoice_issuer: group.taxInvoiceIssuer,
          tax_invoice_recipient: group.taxInvoiceRecipient,
          settled_at: settledAt,
        };
      }),
    ),
  );

  if (rows.length === 0) return;

  await supabaseRequest("auto_order_ledger", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
}


/* ------------------------------------------------------------------------- */
/* 포털 스냅샷 (에스칼프린트 장비 상태 · 로얄선즈 매출/베스트셀러)            */
/* ------------------------------------------------------------------------- */

const MAX_TELEMETRY = 24;

function telemetryKey(storeCode: string) {
  return salesKey(storeCode);
}

/** 장비 스냅샷 1건 저장. 같은 시각 스냅샷은 덮어쓴다(재수집 멱등). */
export async function saveTelemetry(telemetry: DeviceTelemetry): Promise<void> {
  const key = telemetryKey(telemetry.storeCode);
  const list = (memory().telemetry.get(key) ?? []).filter(
    (item) => item.capturedAt !== telemetry.capturedAt,
  );

  list.push(telemetry);
  list.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  memory().telemetry.set(key, list.slice(-MAX_TELEMETRY));

  await supabaseRequest(
    "device_telemetry_snapshots?on_conflict=store_code,source,captured_at",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        store_code: salesKey(telemetry.storeCode),
        source: telemetry.source,
        device_model: telemetry.deviceModel,
        device_serial: telemetry.deviceSerial,
        captured_at: telemetry.capturedAt,
        cumulative_print_count: telemetry.cumulativePrintCount,
        toner_k_pct: telemetry.tonerKPct,
        toner_c_pct: telemetry.tonerCPct,
        toner_m_pct: telemetry.tonerMPct,
        toner_y_pct: telemetry.tonerYPct,
        tray1_pct: telemetry.tray1Pct,
        tray2_pct: telemetry.tray2Pct,
      }),
    },
  );
}

function rowToTelemetry(row: Record<string, unknown>): DeviceTelemetry | null {
  const storeCode = typeof row.store_code === "string" ? row.store_code : null;
  const capturedAt = typeof row.captured_at === "string" ? row.captured_at : null;
  if (!storeCode || !capturedAt) return null;

  const nullNum = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  return {
    storeCode,
    source: row.source === "manual" ? "manual" : "escalprint",
    capturedAt,
    deviceModel: typeof row.device_model === "string" ? row.device_model : null,
    deviceSerial: typeof row.device_serial === "string" ? row.device_serial : null,
    cumulativePrintCount: nullNum(row.cumulative_print_count),
    tonerKPct: nullNum(row.toner_k_pct),
    tonerCPct: nullNum(row.toner_c_pct),
    tonerMPct: nullNum(row.toner_m_pct),
    tonerYPct: nullNum(row.toner_y_pct),
    tray1Pct: nullNum(row.tray1_pct),
    tray2Pct: nullNum(row.tray2_pct),
  };
}

/** 최근 스냅샷(오름차순). 메모리 → Supabase 순. */
export async function loadTelemetryHistory(storeCode: string, limit = 12): Promise<DeviceTelemetry[]> {
  const key = telemetryKey(storeCode);
  const cached = memory().telemetry.get(key);

  if (cached && cached.length > 0) {
    return cached.slice(-limit);
  }

  const response = await supabaseRequest(
    `device_telemetry_snapshots?select=store_code,source,captured_at,device_model,device_serial,cumulative_print_count,toner_k_pct,toner_c_pct,toner_m_pct,toner_y_pct,tray1_pct,tray2_pct&store_code=eq.${encodeURIComponent(
      key,
    )}&order=captured_at.desc&limit=${Math.min(48, Math.max(2, limit))}`,
  );

  if (!response || !response.ok) {
    if (response && response.status >= 400) {
      warnOnce("device_telemetry_snapshots 테이블을 읽지 못했습니다 — SQL 미적용일 수 있습니다.");
    }
    return [];
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown>[] | null;
  if (!Array.isArray(payload)) return [];

  const rows = payload
    .map(rowToTelemetry)
    .filter((row): row is DeviceTelemetry => row !== null)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  if (rows.length > 0) memory().telemetry.set(key, rows.slice(-MAX_TELEMETRY));

  return rows.slice(-limit);
}

/** 베스트셀러 라인 저장(스냅샷 단위). */
export async function saveBeverages(input: {
  storeCode: string;
  capturedAt: string;
  salesDate: string;
  beverages: BeverageLine[];
}): Promise<void> {
  if (input.beverages.length === 0) return;

  const key = telemetryKey(input.storeCode);
  memory().beverages.set(key, input.beverages);

  await supabaseRequest("beverage_sales_snapshots", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(
      input.beverages.map((line) => ({
        store_code: salesKey(input.storeCode),
        source: "loyalsuns",
        captured_at: input.capturedAt,
        sales_date: input.salesDate,
        product_name: line.name,
        quantity: line.quantity,
        amount: line.amount,
      })),
    ),
  });
}

/** 일/월 매출 스냅샷 저장. 같은 (source, scope, 기간)은 최신값으로 대체한다. */
export async function saveRevenue(revenue: RevenueSnapshot, storeCode: string, capturedAt: string): Promise<void> {
  const key = telemetryKey(storeCode);
  const list = (memory().revenue.get(key) ?? []).filter(
    (item) =>
      !(
        item.source === revenue.source &&
        item.scope === revenue.scope &&
        item.periodStart === revenue.periodStart
      ),
  );

  list.push(revenue);
  memory().revenue.set(key, list.slice(-40));

  await supabaseRequest("portal_revenue_snapshots", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      store_code: salesKey(storeCode),
      source: revenue.source,
      scope: revenue.scope,
      period_start: revenue.periodStart || null,
      period_end: revenue.periodEnd || null,
      captured_at: capturedAt,
      gross_amount: Math.round(revenue.grossAmount),
      refund_amount: Math.round(revenue.refundAmount),
      net_amount: Math.round(revenue.netAmount),
      order_count: revenue.orderCount,
      refund_count: revenue.refundCount,
    }),
  });
}

/** 커피 머신 상태(온라인/재료 부족 알림) 저장. */
export async function saveMachineStatus(input: {
  storeCode: string;
  capturedAt: string;
  online: boolean | null;
  alerts: string[];
}): Promise<void> {
  const summary: MachineStatusSummary = {
    online: input.online,
    alerts: input.alerts.slice(0, 10),
    capturedAt: input.capturedAt,
  };

  memory().machine.set(telemetryKey(input.storeCode), summary);

  await supabaseRequest("coffee_machine_status_snapshots", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      store_code: salesKey(input.storeCode),
      source: "loyalsuns",
      captured_at: input.capturedAt,
      online: input.online,
      alerts: input.alerts.slice(0, 10),
    }),
  });
}

export async function loadMachineStatus(storeCode: string): Promise<MachineStatusSummary | null> {
  const cached = memory().machine.get(telemetryKey(storeCode));
  if (cached) return cached;

  const response = await supabaseRequest(
    `coffee_machine_status_snapshots?select=captured_at,online,alerts&store_code=eq.${encodeURIComponent(
      salesKey(storeCode),
    )}&order=captured_at.desc&limit=1`,
  );

  if (!response || !response.ok) return null;

  const payload = (await response.json().catch(() => null)) as Record<string, unknown>[] | null;
  const row = Array.isArray(payload) ? payload[0] : null;
  if (!row) return null;

  const summary: MachineStatusSummary = {
    online: typeof row.online === "boolean" ? row.online : null,
    alerts: Array.isArray(row.alerts) ? (row.alerts as unknown[]).filter((item): item is string => typeof item === "string") : [],
    capturedAt: typeof row.captured_at === "string" ? row.captured_at : null,
  };

  memory().machine.set(telemetryKey(storeCode), summary);
  return summary;
}

function kstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function kstYesterday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - 24 * 3600_000));
}

function rowToRevenue(row: Record<string, unknown>): RevenueSnapshot | null {
  const source = row.source === "loyalsuns" || row.source === "escalprint" ? row.source : "manual";
  const scope = row.scope === "month" ? "month" : "day";
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  if (typeof row.captured_at !== "string") return null;

  return {
    source,
    scope,
    periodStart: typeof row.period_start === "string" ? row.period_start : "",
    periodEnd: typeof row.period_end === "string" ? row.period_end : "",
    grossAmount: num(row.gross_amount),
    refundAmount: num(row.refund_amount),
    netAmount: num(row.net_amount),
    orderCount: typeof row.order_count === "number" ? row.order_count : null,
    refundCount: typeof row.refund_count === "number" ? row.refund_count : null,
  };
}

/** 통합 매출 요약(카페 오늘·어제·이달 / 프린트 이달). 메모리 → Supabase. */
export async function loadRevenueSummary(storeCode: string): Promise<RevenueSummary | null> {
  const key = telemetryKey(storeCode);
  let rows = memory().revenue.get(key) ?? [];

  if (rows.length === 0) {
    const response = await supabaseRequest(
      `portal_revenue_snapshots?select=source,scope,period_start,period_end,gross_amount,refund_amount,net_amount,order_count,refund_count,captured_at&store_code=eq.${encodeURIComponent(
        key,
      )}&order=captured_at.desc&limit=40`,
    );

    if (response && response.ok) {
      const payload = (await response.json().catch(() => null)) as Record<string, unknown>[] | null;
      if (Array.isArray(payload)) {
        rows = payload
          .map(rowToRevenue)
          .filter((row): row is RevenueSnapshot => row !== null);
        memory().revenue.set(key, rows.slice(0, 40));
      }
    }
  }

  if (rows.length === 0) return null;

  const today = kstToday();
  const yesterday = kstYesterday();
  const month = today.slice(0, 7);

  const pick = (source: RevenueSnapshot["source"], scope: RevenueSnapshot["scope"], period?: string) => {
    const candidates = rows.filter(
      (row) =>
        row.source === source &&
        row.scope === scope &&
        (period === undefined || row.periodStart === period) &&
        (scope !== "month" || row.periodStart.slice(0, 7) === month),
    );

    return candidates.length > 0 ? candidates[candidates.length - 1].netAmount : null;
  };

  const summary: RevenueSummary = {
    source: "portal",
    cafeToday: pick("loyalsuns", "day", today),
    cafeYesterday: pick("loyalsuns", "day", yesterday),
    cafeMonth: pick("loyalsuns", "month"),
    printMonth: pick("escalprint", "month"),
    capturedAt: memory().machine.get(key)?.capturedAt ?? null,
  };

  if (
    summary.cafeToday === null &&
    summary.cafeYesterday === null &&
    summary.cafeMonth === null &&
    summary.printMonth === null
  ) {
    return null;
  }

  return summary;
}
