import type { OrderLine } from "@/features/order/utils";
import {
  readSupabaseConfig,
  SUPABASE_TIMEOUT_MS,
  supabaseHeaders,
} from "@/features/supabase/config";

/**
 * 발주 주문을 Supabase `shop_orders` 테이블에 적재한다.
 *
 * 원본 경로는 여전히 Google Apps Script 웹훅(구글시트 order_requests)이고,
 * 이 적재는 그 뒤에 붙는 사본이다. 설정이 없거나 테이블이 아직 없어도
 * 주문 접수 자체는 절대 실패하지 않는다 — 경고 로그만 남기고 넘어간다.
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
  totalAmount: number;
};

export type ShopOrderSaveResult =
  | { saved: true; id: string | null }
  | {
      saved: false;
      reason: "not_configured" | "table_missing" | "duplicate" | "request_failed" | "timeout";
    };

export async function saveShopOrder(record: ShopOrderRecord): Promise<ShopOrderSaveResult> {
  const config = readSupabaseConfig();

  if (!config) {
    console.warn(
      "[orders] SUPABASE_URL·SUPABASE_SECRET_KEY가 없어 shop_orders 적재를 건너뜁니다 (주문은 구글시트로만 전달됨).",
    );
    return { saved: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(`${config.url}/rest/v1/shop_orders`, {
      body: JSON.stringify({
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
      }),
      cache: "no-store",
      headers: {
        ...supabaseHeaders(config.secret),
        Prefer: "return=representation",
      },
      method: "POST",
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
    });

    const responseText = await response.text();

    if (!response.ok) {
      const tableMissing =
        response.status === 404 || responseText.includes("PGRST205") || responseText.includes("42P01");
      const duplicate = response.status === 409 || responseText.includes("23505");

      console.error(
        `[orders] shop_orders 적재 실패 order=${record.orderNumber} status=${response.status}` +
          (tableMissing
            ? " — shop_orders 테이블이 없습니다. notes/supabase-luckyspot-schema.sql 을 Supabase SQL Editor에서 실행하세요."
            : "") +
          (duplicate ? " — 이미 적재된 주문번호입니다." : "") +
          `: ${responseText.slice(0, 300)}`,
      );

      return {
        saved: false,
        reason: tableMissing ? "table_missing" : duplicate ? "duplicate" : "request_failed",
      };
    }

    let id: string | null = null;

    try {
      const rows = JSON.parse(responseText) as { id?: string }[];
      id = rows[0]?.id ?? null;
    } catch {
      id = null;
    }

    return { saved: true, id };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";

    console.error(
      `[orders] shop_orders 적재 ${timedOut ? "시간 초과" : "오류"} order=${record.orderNumber}:`,
      error instanceof Error ? error.message : error,
    );

    return { saved: false, reason: timedOut ? "timeout" : "request_failed" };
  }
}
