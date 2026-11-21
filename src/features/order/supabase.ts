import type { OrderLine } from "@/features/order/utils";
import {
  readSupabaseConfig,
  SUPABASE_TIMEOUT_MS,
  supabaseHeaders,
} from "@/features/supabase/config";
import type { TaxInvoiceRequest } from "@/features/tax-invoice";

/**
 * 발주 주문을 Supabase `shop_orders` 테이블에 적재한다.
 *
 * 원본 경로는 여전히 Google Apps Script 웹훅(구글시트 order_requests)이고,
 * 이 적재는 그 뒤에 붙는 사본이다. 설정이 없거나 테이블이 아직 없어도
 * 주문 접수 자체는 절대 실패하지 않는다 — 경고 로그만 남기고 넘어간다.
 *
 * 세금계산서 컬럼
 *   `notes/supabase-shop-tax-invoice-migration.sql` 을 실행하기 전에는 tax_* 컬럼이 없다.
 *   그때는 memo(JSON) 에 발급 정보를 남기고, 컬럼이 생기면 컬럼으로 저장한다.
 *   어느 경우에도 주문은 500 없이 접수된다.
 *
 * 필요한 환경변수 (Vercel → Project Settings → Environment Variables)
 *   SUPABASE_URL           예) https://koqkvlmnltbpuxoifxpp.supabase.co
 *   SUPABASE_SECRET_KEY    sb_secret_... (서버 전용)
 */

export type ShopOrderRecord = {
  address: string;
  createdAt: string;
  fulfillmentType: string;
  items: OrderLine[];
  itemText: string;
  orderNumber: string;
  pickupLocation: string;
  requesterName: string;
  requesterPhone: string;
  shippingOption: string;
  storeCode: string | null;
  storeName: string | null;
  /** 세금계산서 발급 요청 — 없으면 발급 신청 안 함 */
  taxInvoice?: TaxInvoiceRequest;
  totalAmount: number;
};

export type ShopOrderSaveResult =
  | { saved: true; id: string | null; degraded?: boolean }
  | {
      saved: false;
      reason: "not_configured" | "table_missing" | "duplicate" | "request_failed" | "timeout";
    };

function baseRecord(record: ShopOrderRecord) {
  return {
    address: record.address,
    created_at: record.createdAt,
    fulfillment_type: record.fulfillmentType,
    items: record.items,
    item_text: record.itemText,
    order_number: record.orderNumber,
    pickup_location: record.pickupLocation,
    requester_name: record.requesterName,
    requester_phone: record.requesterPhone,
    shipping_option: record.shippingOption,
    status: "pending",
    store_code: record.storeCode,
    store_name: record.storeName,
    total_amount: record.totalAmount,
  };
}

/** 발급 정보를 memo(JSON)에 남기는 사본 — 마이그레이션 전 폴백. */
function memoText(record: ShopOrderRecord) {
  const tax = record.taxInvoice;

  return JSON.stringify({
    taxInvoice: {
      businessItem: tax?.requested ? tax.businessItem || null : null,
      businessName: tax?.requested ? tax.businessName || null : null,
      businessNo: tax?.requested ? tax.businessNo || null : null,
      businessType: tax?.requested ? tax.businessType || null : null,
      ceoName: tax?.requested ? tax.ceoName || null : null,
      email: tax?.requested ? tax.email || null : null,
      requested: tax?.requested === true,
    },
  });
}

function taxColumns(record: ShopOrderRecord) {
  const tax = record.taxInvoice;
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

export async function saveShopOrder(record: ShopOrderRecord): Promise<ShopOrderSaveResult> {
  const config = readSupabaseConfig();

  if (!config) {
    console.warn(
      "[orders] SUPABASE_URL·SUPABASE_SECRET_KEY가 없어 shop_orders 적재를 건너뜁니다 (주문은 구글시트로만 전달됨).",
    );
    return { saved: false, reason: "not_configured" };
  }

  // 1) 세금계산서 컬럼 + memo  2) memo 만  3) v1 컬럼만 — 스키마가 낡아도 주문은 남긴다.
  const attempts: { body: Record<string, unknown>; degraded: boolean }[] = [
    {
      body: { ...baseRecord(record), ...taxColumns(record), memo: memoText(record) },
      degraded: false,
    },
    {
      body: { ...baseRecord(record), memo: memoText(record) },
      degraded: true,
    },
    {
      body: { ...baseRecord(record) },
      degraded: true,
    },
  ];

  try {
    let lastFailure: { status: number; text: string } | null = null;

    for (const attempt of attempts) {
      const response = await fetch(`${config.url}/rest/v1/shop_orders`, {
        body: JSON.stringify(attempt.body),
        cache: "no-store",
        headers: {
          ...supabaseHeaders(config.secret),
          Prefer: "return=representation",
        },
        method: "POST",
        signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
      });

      const responseText = await response.text();

      if (response.ok) {
        let id: string | null = null;

        try {
          const rows = JSON.parse(responseText) as { id?: string }[];
          id = rows[0]?.id ?? null;
        } catch {
          id = null;
        }

        if (attempt.degraded) {
          console.warn(
            `[orders] 세금계산서 정보를 memo 로만 저장했습니다 order=${record.orderNumber} ` +
              "— notes/supabase-shop-tax-invoice-migration.sql 을 Supabase SQL Editor에서 실행하세요.",
          );
        }

        return { degraded: attempt.degraded, id, saved: true };
      }

      lastFailure = { status: response.status, text: responseText };

      const duplicate = response.status === 409 || responseText.includes("23505");

      if (duplicate) {
        console.warn(`[orders] 이미 적재된 주문번호입니다 order=${record.orderNumber}`);
        return { saved: false, reason: "duplicate" };
      }
    }

    const tableMissing =
      lastFailure?.status === 404 ||
      Boolean(
        lastFailure &&
          (lastFailure.text.includes("PGRST205") || lastFailure.text.includes("42P01")),
      );

    console.error(
      `[orders] shop_orders 적재 실패 order=${record.orderNumber} status=${lastFailure?.status}` +
        (tableMissing
          ? " — shop_orders 테이블이 없습니다. notes/supabase-luckyspot-schema.sql 을 Supabase SQL Editor에서 실행하세요."
          : "") +
        `: ${lastFailure?.text.slice(0, 300) ?? ""}`,
    );

    return {
      saved: false,
      reason: tableMissing ? "table_missing" : "request_failed",
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";

    console.error(
      `[orders] shop_orders 적재 ${timedOut ? "시간 초과" : "오류"} order=${record.orderNumber}:`,
      error instanceof Error ? error.message : error,
    );

    return { saved: false, reason: timedOut ? "timeout" : "request_failed" };
  }
}
