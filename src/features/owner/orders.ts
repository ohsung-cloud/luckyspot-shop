import { ORDER_STATUS_LABELS, isOrderStatus, type OrderStatus } from "@/features/admin/status";
import { readSupabaseConfig, SUPABASE_TIMEOUT_MS, supabaseHeaders } from "@/features/supabase/config";

/**
 * 점주 포털(`/owner`)의 "최근 발주내역" — **로그인한 지점의 주문만** 읽는다(서버 전용).
 *
 * 어디서 읽나
 *  - 원본은 Supabase `shop_orders`(발주 접수·결제가 남기는 표)다. v1 컬럼만 쓴다.
 *  - 지점 필터(`store_code=eq.<코드>`)를 쿼리에 넣고, 응답에서 한 번 더 확인한다.
 *    다른 지점 주문은 애초에 내려오지 않고, 개인정보(이름·연락처·주소)는 select 하지 않는다.
 *  - Supabase 키가 없는 환경(지금 프로덕션)에서는 `not_configured`로 끝난다 —
 *    화면은 "아직 발주 내역이 없어요"로 정직하게 비워 둔다.
 */

export type OwnerOrder = {
  orderNumber: string;
  createdAt: string;
  /** "A4 용지 1박스 외 2종" 같은 한 줄 요약 */
  summary: string;
  lineCount: number;
  totalAmount: number;
  status: OrderStatus;
  statusLabel: string;
  payment: { method: string | null; status: string | null; test: boolean } | null;
  /** 이 구성 그대로 다시 담기 — 카탈로그에 남아 있는 품목만 */
  items: { id: string; quantity: number }[];
};

export type OwnerOrderList =
  | { ok: true; orders: OwnerOrder[] }
  | { ok: false; reason: "not_configured" | "table_missing" | "request_failed" | "timeout" };

type OrderRow = {
  order_number?: string | null;
  item_text?: string | null;
  items?: unknown;
  total_amount?: number | null;
  status?: string | null;
  created_at?: string | null;
  store_code?: string | null;
  memo?: string | null;
};

const SELECT = "order_number,item_text,items,total_amount,status,created_at,store_code,memo";

function toPayment(memo: string | null | undefined): OwnerOrder["payment"] {
  if (!memo) return null;

  try {
    const parsed = JSON.parse(memo) as { payment?: Record<string, unknown> } | null;
    const payment = parsed?.payment;
    if (!payment || typeof payment !== "object") return null;

    return {
      method: typeof payment.method === "string" ? payment.method : null,
      status: typeof payment.status === "string" ? payment.status : null,
      test: payment.test === true,
    };
  } catch {
    return null;
  }
}

function toItems(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((line) => {
    if (!line || typeof line !== "object") return [];

    const candidate = line as { id?: unknown; quantity?: unknown };
    const id = typeof candidate.id === "string" ? candidate.id : "";
    const quantity = Number(candidate.quantity);

    if (!id || !Number.isFinite(quantity) || quantity < 1) return [];
    return [{ id, quantity: Math.round(quantity) }];
  });
}

function toOrder(row: OrderRow, storeCode: string): OwnerOrder | null {
  const orderNumber = row.order_number?.trim();
  if (!orderNumber) return null;
  // 서버 필터를 걸었지만, 응답에 다른 지점 행이 섞이면 버린다(이중 확인).
  if ((row.store_code ?? "").trim().toUpperCase() !== storeCode.toUpperCase()) return null;

  const items = toItems(row.items);
  const status: OrderStatus = isOrderStatus(row.status) ? row.status : "pending";
  const itemText = row.item_text?.trim() || null;
  const summary =
    itemText ??
    (items.length > 0 ? `${items.length}종 ${items.reduce((sum, item) => sum + item.quantity, 0)}개` : "품목 정보 없음");

  return {
    orderNumber,
    createdAt: row.created_at ?? new Date(0).toISOString(),
    summary,
    lineCount: items.length || (itemText ? itemText.split(",").length : 0),
    totalAmount: typeof row.total_amount === "number" && Number.isFinite(row.total_amount) ? row.total_amount : 0,
    status,
    statusLabel: ORDER_STATUS_LABELS[status],
    payment: toPayment(row.memo),
    items,
  };
}

function classifyFailure(status: number, body: string): OwnerOrderList {
  const tableMissing = status === 404 || body.includes("PGRST205") || body.includes("42P01");
  return { ok: false, reason: tableMissing ? "table_missing" : "request_failed" };
}

export async function listOwnerOrders(input: {
  storeCode: string;
  limit?: number;
}): Promise<OwnerOrderList> {
  const storeCode = input.storeCode.trim().toUpperCase();
  if (!storeCode) return { ok: true, orders: [] };

  const config = readSupabaseConfig();
  if (!config) return { ok: false, reason: "not_configured" };

  const limit = Math.min(20, Math.max(1, input.limit ?? 5));
  const query =
    `shop_orders?select=${SELECT}` +
    `&store_code=eq.${encodeURIComponent(storeCode)}` +
    `&order=created_at.desc&limit=${limit}`;

  try {
    const response = await fetch(`${config.url}/rest/v1/${query}`, {
      cache: "no-store",
      headers: supabaseHeaders(config.secret),
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
    });

    const body = await response.text();

    if (!response.ok) {
      console.error(`[owner] shop_orders 조회 실패 status=${response.status}: ${body.slice(0, 200)}`);
      return classifyFailure(response.status, body);
    }

    const rows = JSON.parse(body) as OrderRow[];
    if (!Array.isArray(rows)) return { ok: false, reason: "request_failed" };

    return {
      ok: true,
      orders: rows.flatMap((row) => {
        const order = toOrder(row, storeCode);
        return order ? [order] : [];
      }),
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error(`[owner] shop_orders 조회 오류:`, error instanceof Error ? error.message : error);
    return { ok: false, reason: timedOut ? "timeout" : "request_failed" };
  }
}
