import type { OrderLine } from "@/features/order/utils";
import {
  readSupabaseConfig,
  SUPABASE_TIMEOUT_MS,
  supabaseHeaders,
} from "@/features/supabase/config";
import type { TaxInvoiceRequest } from "@/features/tax-invoice";

/**
 * 결제가 끝난 발주를 Supabase `shop_orders` 에 남긴다 (서버 전용).
 *
 * 기록 순서(스키마가 아직 결제·세금계산서 컬럼을 모르더라도 사실을 잃지 않게)
 *   1) payment_* · tax_* 컬럼 + status(paid/awaiting_deposit) + memo(JSON)
 *   2) payment_* · status + memo(JSON — 세금계산서 정보 포함)
 *   3) v1 컬럼 + memo(JSON) + status='pending'
 *   4) v1 컬럼만
 *
 * 2)·3)·4) 로 떨어졌다는 것은 마이그레이션을 아직 실행하지 않았다는 뜻이다.
 * 결제 자체는 정상 완료된 상태이며 주문은 500 없이 남는다.
 */

export type PaidOrderInput = {
  address: string;
  approvedAt: string | null;
  createdAt: string;
  fulfillmentType: string;
  itemText: string;
  items: OrderLine[];
  methodKey: string;
  methodLabel: string;
  orderNumber: string;
  paymentKey: string;
  paymentStatus: string;
  pickupLocation: string;
  requesterName: string;
  requesterPhone: string;
  shippingOption: string;
  status: "paid" | "awaiting_deposit" | "pending";
  storeCode: string | null;
  storeName: string | null;
  /** 세금계산서 발급 요청 — 없으면 발급 신청 안 함 */
  taxInvoice?: TaxInvoiceRequest;
  testMode: boolean;
  totalAmount: number;
  virtualAccount?: {
    accountNumber?: string;
    bankCode?: string;
    customerName?: string;
    dueDate?: string;
  } | null;
};

export type PaidOrderSaveResult =
  | { saved: true; id: string | null; degraded: boolean }
  | {
      saved: false;
      reason: "not_configured" | "duplicate" | "request_failed" | "timeout";
    };

function baseRecord(input: PaidOrderInput) {
  return {
    address: input.address,
    created_at: input.createdAt,
    fulfillment_type: input.fulfillmentType,
    item_text: input.itemText,
    items: input.items,
    order_number: input.orderNumber,
    pickup_location: input.pickupLocation,
    requester_name: input.requesterName,
    requester_phone: input.requesterPhone,
    shipping_option: input.shippingOption,
    store_code: input.storeCode,
    store_name: input.storeName,
    total_amount: input.totalAmount,
  };
}

function memoText(input: PaidOrderInput) {
  const tax = input.taxInvoice;
  const taxRequested = tax?.requested === true;

  return JSON.stringify({
    payment: {
      approvedAt: input.approvedAt,
      method: input.methodLabel,
      methodKey: input.methodKey,
      paymentKey: input.paymentKey,
      status: input.paymentStatus,
      test: input.testMode,
      ...(input.virtualAccount
        ? {
            bankCode: input.virtualAccount.bankCode ?? null,
            accountNumber: input.virtualAccount.accountNumber ?? null,
            dueDate: input.virtualAccount.dueDate ?? null,
          }
        : {}),
    },
    taxInvoice: {
      businessItem: taxRequested ? tax?.businessItem || null : null,
      businessName: taxRequested ? tax?.businessName || null : null,
      businessNo: taxRequested ? tax?.businessNo || null : null,
      businessType: taxRequested ? tax?.businessType || null : null,
      ceoName: taxRequested ? tax?.ceoName || null : null,
      email: taxRequested ? tax?.email || null : null,
      requested: taxRequested,
    },
    note: "결제·세금계산서 기록 컬럼이 없을 때 memo에 보관",
  });
}

function taxColumns(input: PaidOrderInput) {
  const tax = input.taxInvoice;
  const requested = tax?.requested === true;

  return {
    tax_business_item: requested ? tax?.businessItem ?? null : null,
    tax_business_name: requested ? tax?.businessName ?? null : null,
    tax_business_no: requested ? tax?.businessNo ?? null : null,
    tax_business_type: requested ? tax?.businessType ?? null : null,
    tax_ceo_name: requested ? tax?.ceoName ?? null : null,
    tax_email: requested ? tax?.email ?? null : null,
    tax_invoice_requested: requested,
  };
}

async function postOrder(
  config: { secret: string; url: string },
  body: Record<string, unknown>,
): Promise<{ ok: true; id: string | null } | { ok: false; status: number; text: string }> {
  const response = await fetch(`${config.url}/rest/v1/shop_orders`, {
    body: JSON.stringify(body),
    cache: "no-store",
    headers: {
      ...supabaseHeaders(config.secret),
      Prefer: "return=representation",
    },
    method: "POST",
    signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
  });

  const text = await response.text();

  if (!response.ok) return { ok: false, status: response.status, text };

  let id: string | null = null;

  try {
    const rows = JSON.parse(text) as { id?: string }[];
    id = rows[0]?.id ?? null;
  } catch {
    id = null;
  }

  return { id, ok: true };
}

export async function savePaidOrder(input: PaidOrderInput): Promise<PaidOrderSaveResult> {
  const config = readSupabaseConfig();

  if (!config) {
    console.warn(
      `[payments] SUPABASE_URL·SUPABASE_SECRET_KEY가 없어 결제 발주를 적재하지 못했습니다 order=${input.orderNumber}`,
    );
    return { saved: false, reason: "not_configured" };
  }

  const paymentColumns = {
    approved_at: input.approvedAt,
    payment_key: input.paymentKey,
    payment_method: input.methodKey,
    payment_status: input.paymentStatus,
    status: input.status,
    test_mode: input.testMode,
  };

  const attempts: { body: Record<string, unknown>; degraded: boolean }[] = [
    {
      body: {
        ...baseRecord(input),
        ...paymentColumns,
        ...taxColumns(input),
        memo: memoText(input),
      },
      degraded: false,
    },
    {
      body: { ...baseRecord(input), ...paymentColumns, memo: memoText(input) },
      degraded: true,
    },
    {
      body: { ...baseRecord(input), memo: memoText(input), status: "pending" },
      degraded: true,
    },
    { body: { ...baseRecord(input), status: "pending" }, degraded: true },
  ];

  try {
    let lastFailure: { status: number; text: string } | null = null;

    for (const attempt of attempts) {
      const result = await postOrder(config, attempt.body);

      if (result.ok) {
        if (attempt.degraded) {
          console.warn(
            `[payments] 결제·세금계산서 정보를 memo 로만 저장했습니다 order=${input.orderNumber} ` +
              "— notes/supabase-payments-migration-2026-11-20.sql, notes/supabase-shop-tax-invoice-migration.sql 을 Supabase SQL Editor에서 실행하세요.",
          );
        }

        console.log(
          `[payments] shop_orders 적재 완료 order=${input.orderNumber} status=${attempt.body.status} id=${result.id ?? "-"}`,
        );

        return { degraded: attempt.degraded, id: result.id, saved: true };
      }

      lastFailure = { status: result.status, text: result.text };

      const duplicate = result.status === 409 || result.text.includes("23505");

      if (duplicate) {
        console.warn(`[payments] 이미 적재된 주문번호입니다 order=${input.orderNumber}`);
        return { saved: false, reason: "duplicate" };
      }
    }

    console.error(
      `[payments] shop_orders 적재 실패 order=${input.orderNumber} status=${lastFailure?.status}: ${lastFailure?.text.slice(0, 300)}`,
    );

    return { saved: false, reason: "request_failed" };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";

    console.error(
      `[payments] shop_orders 적재 ${timedOut ? "시간 초과" : "오류"} order=${input.orderNumber}:`,
      error instanceof Error ? error.message : error,
    );

    return { saved: false, reason: timedOut ? "timeout" : "request_failed" };
  }
}
