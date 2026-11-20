import { getProductById } from "@/data/products";
import { readSupabaseConfig, SUPABASE_TIMEOUT_MS, supabaseHeaders } from "@/features/supabase/config";
import { isOrderStatus, type OrderStatus } from "@/features/admin/status";

/**
 * 발주 주문 조회·상태 변경 (서버 전용).
 *
 * 원본 테이블은 Supabase `shop_orders` 이고, 이 모듈은 Vercel 서버에서만 실행된다.
 *
 * 중요 — 스키마 호환
 *   `notes/supabase-luckyspot-schema.sql` 의 v1 컬럼만 읽고 쓴다.
 *     id · order_number · store_name · store_code · requester_name · requester_phone
 *     items · item_text · total_amount · address · status · created_at
 *   아직 DB에 없는 확장 컬럼(shipping_option 등)을 select 하면 PostgREST 가 400 을 내므로
 *   여기서는 절대 건드리지 않는다.
 *
 * 개인정보
 *   관리자 화면에서만 주문자 이름·연락처를 보여주고, 점주 조회 응답에는 절대 담지 않는다
 *   (`lookupStoreOrders` 는 선택한 지점의 발주번호·상태·품목·금액만 돌려준다).
 */

export { isOrderStatus };
export type { OrderStatus };
/**
 * 결제 기록 — 결제 컬럼(payment_key 등)이 아직 없는 DB 에서는 서버가 memo(JSON)에 남긴다.
 * 두 경우 모두 화면에 같은 정보를 보여주기 위해 여기로 모은다.
 */
export type AdminOrderPayment = {
  method: string | null;
  status: string | null;
  test: boolean;
};

export type AdminOrder = {
  createdAt: string;
  id: string;
  itemText: string | null;
  orderNumber: string;
  payment: AdminOrderPayment | null;
  requesterName: string | null;
  requesterPhone: string | null;
  status: OrderStatus;
  storeCode: string | null;
  storeName: string | null;
  totalAmount: number;
};

/**
 * 다시 담기용 품목 한 줄 — 카탈로그에 아직 있는 품목만 내려간다.
 * 단가는 싣지 않는다(담는 순간의 카탈로그 단가로 다시 계산).
 */
export type LookupOrderItem = {
  id: string;
  name: string;
  quantity: number;
};

/** 점주 조회 화면에 내려도 되는 값만 담는다. 이름·연락처·주소는 없다. */
export type LookupOrder = {
  createdAt: string;
  itemText: string | null;
  orderNumber: string;
  /** 결제 기록(있을 때만) — 결제완료 표시에 쓴다 */
  payment: AdminOrderPayment | null;
  status: OrderStatus;
  totalAmount: number;
  /** 원클릭 재주문 — 지금 카탈로그로 다시 담을 수 있는 구성 */
  items: LookupOrderItem[];
  /** 발주 당시 품목 종류 수(카탈로그에서 빠진 품목 포함) */
  lineCount: number;
};

const MAX_REORDER_LINES = 100;

export type OrderQueryFailure = {
  ok: false;
  reason: "not_configured" | "table_missing" | "request_failed" | "timeout";
  status: number;
};

export type AdminOrderListResult =
  | { ok: true; orders: AdminOrder[] }
  | OrderQueryFailure;

export type LookupOrderListResult =
  | { ok: true; orders: LookupOrder[] }
  | OrderQueryFailure;

export type UpdateStatusResult =
  | { ok: true; order: AdminOrder }
  | OrderQueryFailure
  | { ok: false; reason: "not_found"; status: 404 };

type OrderRow = {
  created_at?: string | null;
  id?: string | null;
  items?: unknown;
  item_text?: string | null;
  memo?: string | null;
  order_number?: string | null;
  requester_name?: string | null;
  requester_phone?: string | null;
  status?: string | null;
  store_code?: string | null;
  store_name?: string | null;
  total_amount?: number | null;
};

/** v1 컬럼만: 여기에 없는 컬럼을 추가하면 스키마가 없는 환경에서 400 이 난다. */
const ADMIN_SELECT_COLUMNS = "id,order_number,store_name,store_code,requester_name,requester_phone,item_text,total_amount,status,created_at";
const ADMIN_SELECT_COLUMNS_WITH_MEMO = `${ADMIN_SELECT_COLUMNS},memo`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOrderId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function toStatus(value: string | null | undefined): OrderStatus {
  return isOrderStatus(value) ? value : "pending";
}

/** memo 에 남긴 결제 기록(JSON)을 읽는다. 결제와 무관한 memo 는 null. */
function toPayment(memo: string | null | undefined): AdminOrderPayment | null {
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

function toAdminOrder(row: OrderRow): AdminOrder | null {
  const id = row.id?.trim();
  const orderNumber = row.order_number?.trim();

  if (!id || !orderNumber) return null;

  return {
    createdAt: row.created_at ?? new Date(0).toISOString(),
    id,
    itemText: row.item_text?.trim() || null,
    orderNumber,
    payment: toPayment(row.memo),
    requesterName: row.requester_name?.trim() || null,
    requesterPhone: row.requester_phone?.trim() || null,
    status: toStatus(row.status),
    storeCode: row.store_code?.trim() || null,
    storeName: row.store_name?.trim() || null,
    totalAmount: Number.isFinite(row.total_amount) ? Number(row.total_amount) : 0,
  };
}

type RawOrderItem = {
  id?: unknown;
  name?: unknown;
  quantity?: unknown;
};

/**
 * shop_orders.items(jsonb) → 다시 담기용 목록.
 *  · 지금 카탈로그에 있는 품목만 남긴다(단종·오타 id 로 장바구니가 깨지지 않게)
 *  · 같은 id 가 두 번 들어 있으면 수량을 합친다
 *  · 수량은 1~999로 다듬고, 줄 수는 100개까지만
 */
function toReorderItems(value: unknown): { items: LookupOrderItem[]; lineCount: number } {
  if (!Array.isArray(value)) return { items: [], lineCount: 0 };

  const merged = new Map<string, number>();
  let lineCount = 0;

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;

    const candidate = raw as RawOrderItem;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    const quantity = Number(candidate.quantity);

    if (!id) continue;

    lineCount += 1;

    if (!name || !Number.isFinite(quantity) || quantity < 1) continue;
    if (!getProductById(id)) continue;

    const next = Math.min(999, Math.round(quantity));
    merged.set(id, Math.min(999, (merged.get(id) ?? 0) + next));
  }

  const items = Array.from(merged, ([id, quantity]) => ({
    id,
    name: getProductById(id)?.name ?? id,
    quantity,
  })).slice(0, MAX_REORDER_LINES);

  return { items, lineCount };
}

function toLookupOrder(row: OrderRow): LookupOrder | null {
  const orderNumber = row.order_number?.trim();

  if (!orderNumber) return null;

  const reorder = toReorderItems(row.items);

  return {
    createdAt: row.created_at ?? new Date(0).toISOString(),
    itemText: row.item_text?.trim() || null,
    orderNumber,
    payment: toPayment(row.memo),
    status: toStatus(row.status),
    totalAmount: Number.isFinite(row.total_amount) ? Number(row.total_amount) : 0,
    items: reorder.items,
    lineCount: reorder.lineCount || reorder.items.length,
  };
}

/** 실패 응답을 원인별로 나눈다(테이블 없음은 안내 문구를 바꾸기 위해 구분한다). */
function classifyFailure(status: number, body: string): OrderQueryFailure {
  const tableMissing =
    status === 404 || body.includes("PGRST205") || body.includes("42P01");

  return {
    ok: false,
    reason: tableMissing ? "table_missing" : "request_failed",
    status: tableMissing ? 503 : 502,
  };
}

async function requestOrders(path: string, init?: RequestInit) {
  const config = readSupabaseConfig();

  if (!config) {
    console.warn("[admin] SUPABASE_URL·SUPABASE_SECRET_KEY가 없어 발주 조회를 건너뜁니다.");
    return { ok: false as const, failure: { ok: false as const, reason: "not_configured" as const, status: 503 } };
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      cache: "no-store",
      ...init,
      headers: {
        ...supabaseHeaders(config.secret),
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
    });

    const body = await response.text();

    if (!response.ok) {
      console.error(`[admin] shop_orders ${init?.method ?? "GET"} 실패 status=${response.status}: ${body.slice(0, 300)}`);
      return { ok: false as const, failure: classifyFailure(response.status, body) };
    }

    return { ok: true as const, body };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";

    console.error(
      `[admin] shop_orders ${init?.method ?? "GET"} 오류:`,
      error instanceof Error ? error.message : error,
    );

    return {
      ok: false as const,
      failure: {
        ok: false as const,
        reason: timedOut ? ("timeout" as const) : ("request_failed" as const),
        status: 504,
      },
    };
  }
}

/** 본사 관리자 목록 — 최근 발주를 최신순으로 읽는다. */
export async function listAdminOrders(options?: {
  limit?: number;
  status?: OrderStatus | null;
}): Promise<AdminOrderListResult> {
  const limit = Math.min(300, Math.max(1, options?.limit ?? 200));
  const statusFilter = options?.status ? `&status=eq.${options.status}` : "";
  const query = `shop_orders?select=${ADMIN_SELECT_COLUMNS_WITH_MEMO}&order=created_at.desc&limit=${limit}${statusFilter}`;
  let result = await requestOrders(query);

  // memo 컬럼이 없는 아주 오래된 스키마면 결제 기록 없이 읽는다.
  if (!result.ok && result.failure.reason === "request_failed") {
    console.warn("[admin] memo 컬럼을 읽지 못해 결제 기록 없이 발주 목록을 읽습니다.");
    result = await requestOrders(
      `shop_orders?select=${ADMIN_SELECT_COLUMNS}&order=created_at.desc&limit=${limit}${statusFilter}`,
    );
  }

  if (!result.ok) return result.failure;

  try {
    const rows = JSON.parse(result.body) as OrderRow[];

    if (!Array.isArray(rows)) return { ok: false, reason: "request_failed", status: 502 };

    return {
      ok: true,
      orders: rows.flatMap((row) => {
        const order = toAdminOrder(row);
        return order ? [order] : [];
      }),
    };
  } catch {
    return { ok: false, reason: "request_failed", status: 502 };
  }
}

/** 한 건의 상태를 바꾼다. 바뀐 행을 다시 돌려받아 실제 반영을 확인한다. */
export async function updateOrderStatus(id: string, status: OrderStatus): Promise<UpdateStatusResult> {
  if (!isOrderId(id)) return { ok: false, reason: "not_found", status: 404 };

  const result = await requestOrders(`shop_orders?id=eq.${id}`, {
    body: JSON.stringify({ status }),
    headers: { Prefer: "return=representation" },
    method: "PATCH",
  });

  if (!result.ok) return result.failure;

  try {
    const rows = JSON.parse(result.body) as OrderRow[];
    const order = Array.isArray(rows) && rows[0] ? toAdminOrder(rows[0]) : null;

    if (!order) return { ok: false, reason: "not_found", status: 404 };

    return { ok: true, order };
  } catch {
    return { ok: false, reason: "request_failed", status: 502 };
  }
}

const LOOKUP_WINDOW_DAYS = 180;
const LOOKUP_MAX_ORDERS = 20;

/**
 * 점주 조회 — 고른 지점의 최근 발주 중에서
 *   ① 주문자 휴대폰 뒤 4자리가 같은 건, 또는 ② 주문번호가 정확히 같은 건만 돌려준다.
 * 다른 지점의 주문·개인정보(이름·연락처·주소)는 응답에 담지 않는다.
 */
export async function lookupStoreOrders(input: {
  orderNumber?: string | null;
  phoneLast4?: string | null;
  storeCode: string;
}): Promise<LookupOrderListResult> {
  const since = new Date(Date.now() - LOOKUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const storeFilter = `store_code=eq.${encodeURIComponent(input.storeCode)}`;
  // items 는 v1 스키마 컬럼이다 — 점주가 "이 구성 그대로" 다시 담는 데 쓴다.
  const select = "order_number,item_text,items,total_amount,status,created_at,memo";

  if (input.orderNumber) {
    const query = `shop_orders?select=${select}&${storeFilter}&order_number=eq.${encodeURIComponent(input.orderNumber)}&limit=1`;
    const result = await requestOrders(query);

    if (!result.ok) return result.failure;

    try {
      const rows = JSON.parse(result.body) as OrderRow[];

      if (!Array.isArray(rows)) return { ok: false, reason: "request_failed", status: 502 };

      return {
        ok: true,
        orders: rows.flatMap((row) => {
          const order = toLookupOrder(row);
          return order ? [order] : [];
        }),
      };
    } catch {
      return { ok: false, reason: "request_failed", status: 502 };
    }
  }

  const last4 = input.phoneLast4;
  if (!last4) return { ok: true, orders: [] };

  // 휴대폰 뒤 4자리로 좁힌 뒤(서버 필터) 한 번 더 검증한다.
  const query =
    `shop_orders?select=${select},requester_phone&${storeFilter}` +
    `&created_at=gte.${encodeURIComponent(since)}` +
    `&requester_phone=like.${encodeURIComponent(`*${last4}`)}` +
    `&order=created_at.desc&limit=${LOOKUP_MAX_ORDERS}`;

  const result = await requestOrders(query);

  if (!result.ok) return result.failure;

  try {
    const rows = JSON.parse(result.body) as OrderRow[];

    if (!Array.isArray(rows)) return { ok: false, reason: "request_failed", status: 502 };

    return {
      ok: true,
      orders: rows
        .filter((row) => (row.requester_phone ?? "").replace(/\D/g, "").endsWith(last4))
        .flatMap((row) => {
          const order = toLookupOrder(row);
          return order ? [order] : [];
        }),
    };
  } catch {
    return { ok: false, reason: "request_failed", status: 502 };
  }
}
