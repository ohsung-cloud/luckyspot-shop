import { readSupabaseConfig, SUPABASE_TIMEOUT_MS, supabaseHeaders } from "../supabase/config";
import type { AutoOrderProposal, PosDailySales, ProposalStatus, SplitResult } from "./types";

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
};

const MEMORY_KEY = "__luckyspotAutoOrderMemoryV1";
const MAX_DAYS = 60;

function memory(): MemoryDb {
  const holder = globalThis as unknown as Record<string, MemoryDb | undefined>;

  if (!holder[MEMORY_KEY]) {
    holder[MEMORY_KEY] = { sales: new Map(), approvals: new Map() };
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

  if (cached && cached.length >= 7) {
    return { rows: cached, dataSource: "memory" };
  }

  const response = await supabaseRequest(
    `pos_daily_sales?select=store_code,sales_date,cafe_revenue,drinks_sold,print_revenue,print_sheets,color_sheets&store_code=eq.${encodeURIComponent(
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

  if (rows.length >= 7) {
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
