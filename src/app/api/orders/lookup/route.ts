import { NextResponse } from "next/server";

import { lookupStoreOrders } from "@/features/admin/orders";
import { resolveStoreByCode } from "@/features/stores/directory";
import { boundedText, clientIp, jsonError, noStoreHeaders, readJsonObject, takeRateLimit } from "@/features/http/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/orders/lookup — 점주 발주 내역 조회
 *
 *   { storeCode: "STORE_GNG", phoneLast4: "1234" }
 *   { storeCode: "STORE_GNG", orderNumber: "261119-482K" }
 *
 * 원칙
 *  - 지점을 반드시 고르게 하고, 그 지점의 발주만 돌려준다(타 지점 노출 차단).
 *  - 응답에는 주문번호·접수시각·상태·품목·금액만 담는다.
 *    주문자 이름·연락처·주소·다른 지점 정보는 절대 싣지 않는다.
 *  - IP 기준 10분에 8회로 제한한다(뒤 4자리 무작위 대입 비용을 높인다).
 */

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 8;
const ORDER_NUMBER_PATTERN = /^\d{6}-[0-9A-Z]{2,6}$/i;

const FAILURE_MESSAGES = {
  not_configured: "발주 내역 조회가 아직 준비되지 않았습니다. 본사로 문의해 주세요.",
  table_missing: "발주 내역 조회가 아직 준비되지 않았습니다. 본사로 문의해 주세요.",
  request_failed: "발주 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  timeout: "발주 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

export async function POST(request: Request) {
  const verdict = takeRateLimit(request, `order-lookup:${clientIp(request)}`, LIMIT, WINDOW_MS);

  if (!verdict.ok) {
    return jsonError("조회 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
      retryAfter: verdict.retryAfter,
    });
  }

  const parsed = await readJsonObject(request, 2048);

  if (!parsed.ok) return parsed.response;

  const storeCode = boundedText(parsed.data.storeCode, 1, 40);

  if (!storeCode) {
    return jsonError("지점을 선택해 주세요.", 400);
  }

  const store = await resolveStoreByCode(storeCode);

  if (!store) {
    return jsonError("지점 정보를 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요.", 400);
  }

  const rawOrderNumber = boundedText(parsed.data.orderNumber, 3, 30);
  const rawPhone = boundedText(parsed.data.phoneLast4, 1, 20);
  const phoneLast4 = rawPhone ? rawPhone.replace(/\D/g, "") : "";

  let orderNumber: string | null = null;

  if (rawOrderNumber) {
    const normalized = rawOrderNumber.replace(/\s/g, "").toUpperCase();

    if (!ORDER_NUMBER_PATTERN.test(normalized)) {
      return jsonError("주문번호 형식을 확인해 주세요. 예) 261119-482K", 400);
    }

    orderNumber = normalized;
  } else if (phoneLast4.length !== 4) {
    return jsonError("주문자 휴대폰 뒤 4자리를 입력해 주세요.", 400);
  }

  const result = await lookupStoreOrders({
    orderNumber,
    phoneLast4: orderNumber ? null : phoneLast4,
    storeCode: store.code,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: FAILURE_MESSAGES[result.reason] },
      { status: result.status, headers: noStoreHeaders },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      orders: result.orders,
      store: { code: store.code, label: store.label },
    },
    { headers: noStoreHeaders },
  );
}

export function GET() {
  return jsonError("method not allowed", 405);
}
