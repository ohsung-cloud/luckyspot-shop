import { NextResponse } from "next/server";

import { orderQuantityIssue, splitVat } from "@/data/products";
import {
  boundedText,
  clientIp,
  jsonError,
  noStoreHeaders,
  readJsonObject,
  takeRateLimit,
} from "@/features/http/guard";
import {
  MAX_BODY_BYTES,
  MAX_ORDER_TOTAL,
  readItems,
  resolveOrderRecipient,
} from "@/features/order/intake";
import { readTaxInvoice } from "@/features/order/tax-invoice";
import {
  buildOrderLines,
  calculateOrderTotalPrice,
  createOrderCreatedAt,
  generateOrderId,
} from "@/features/order/utils";
import { resolveTossKeys } from "@/features/payments/keys";
import { isPaymentMethodKey, paymentMethodMeta } from "@/features/payments/methods";
import { createIntentToken } from "@/features/payments/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/prepare — 결제창을 띄우기 전 주문 확정 (서버 전용 계산)
 *
 *   요청: { items:[{id,quantity}], storeCode | (name·phone·address·shippingOption), method, taxInvoice }
 *   응답: { orderId, amount, orderName, clientKey, testMode, token, items, count, storeName, vat, taxInvoice }
 *
 * 원칙
 *  - 금액은 클라이언트가 보낸 값이 아니라 카탈로그 단가로 서버가 계산한다.
 *  - 받는 곳도 서버가 지점 코드로 확정한다(점주 이름·연락처는 응답에 싣지 않는다).
 *  - 확정한 내용은 서명 토큰으로 묶어 돌려주고, 결제 승인 때 이 토큰과 대조한다.
 *  - 이 단계에서는 DB·시트·알림톡에 아무것도 남기지 않는다(결제 전 주문이 발주 목록을 오염시키지 않게).
 */

const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function buildOrderName(lines: { name: string }[]) {
  const first = lines[0]?.name ?? "럭키스팟 발주";
  const rest = lines.length - 1;
  const name = rest > 0 ? `${first} 외 ${rest}건` : first;

  return name.length > 90 ? `${name.slice(0, 88)}…` : name;
}

export async function POST(request: Request) {
  const keys = resolveTossKeys();

  if (!keys.ok) {
    console.error(
      "[payments] NEXT_PUBLIC_TOSS_CLIENT_KEY·TOSS_SECRET_KEY 중 하나만 설정되어 결제를 열 수 없습니다.",
    );
    return jsonError(
      "결제 설정이 완료되지 않았습니다. 본사(1551-7157)로 문의해 주세요.",
      503,
    );
  }

  const verdict = takeRateLimit(request, `pay-prepare:${clientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS);

  if (!verdict.ok) {
    return jsonError("결제 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
      retryAfter: verdict.retryAfter,
    });
  }

  const parsed = await readJsonObject(request, MAX_BODY_BYTES);

  if (!parsed.ok) return parsed.response;

  const items = readItems(parsed.data.items);

  if (!items) return jsonError("주문 품목을 확인할 수 없습니다.", 400);

  // 원두는 1~3박스까지만 — 화면을 거치지 않은 요청도 같은 규칙으로 막는다.
  const quantityIssue = orderQuantityIssue(items);

  if (quantityIssue) return jsonError(quantityIssue, 400);

  const methodRaw = boundedText(parsed.data.method, 1, 20) ?? "card";

  if (!isPaymentMethodKey(methodRaw)) {
    return jsonError("지원하지 않는 결제수단입니다.", 400);
  }

  const orderLines = buildOrderLines(items);

  if (!orderLines.length) {
    return jsonError(
      "장바구니에 담긴 품목을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.",
      400,
    );
  }

  const amount = calculateOrderTotalPrice(orderLines);

  if (amount <= 0 || amount > MAX_ORDER_TOTAL) {
    return jsonError("주문 금액을 확인해 주세요.", 400);
  }

  const resolved = await resolveOrderRecipient(parsed.data);

  if (!resolved.ok) {
    return jsonError(resolved.message, resolved.status);
  }

  // 세금계산서 발급 요청 — 결제창을 다녀온 뒤에도 같은 정보로 기록하도록 토큰에 함께 서명한다.
  const tax = readTaxInvoice(parsed.data);

  if (!tax.ok) {
    return jsonError(tax.message, 400);
  }

  const recipient = resolved.recipient;
  const orderId = generateOrderId();
  const createdAt = createOrderCreatedAt();
  const token = createIntentToken({
    amount,
    items: orderLines.map((line) => ({ id: line.id, quantity: line.quantity })),
    orderId,
    taxInvoice: tax.value,
  });

  console.log(
    `[payments] 결제 준비 order=${orderId} amount=${amount} method=${methodRaw} tax=${tax.value.requested} test=${keys.testMode}`,
  );

  return NextResponse.json(
    {
      amount,
      clientKey: keys.clientKey,
      count: orderLines.reduce((sum, line) => sum + line.quantity, 0),
      createdAt,
      items: orderLines.map((line) => ({ id: line.id, quantity: line.quantity })),
      method: methodRaw,
      methodLabel: paymentMethodMeta(methodRaw).label,
      ok: true,
      orderId,
      orderName: buildOrderName(orderLines),
      storeName: recipient.storeName,
      taxInvoice: tax.value,
      testMode: keys.testMode,
      token,
      vat: splitVat(amount),
    },
    { headers: noStoreHeaders },
  );
}
