import { NextResponse } from "next/server";

import {
  boundedText,
  clientIp,
  jsonError,
  noStoreHeaders,
  readJsonObject,
  takeRateLimit,
} from "@/features/http/guard";
import { resolveOrderRecipient } from "@/features/order/intake";
import { relayOrderToGas } from "@/features/order/gas";
import { buildTaxInvoice } from "@/features/order/tax-invoice";
import { queueAdminAlert } from "@/features/order/admin-alert";
import { formatWon, queueHqBoardAlert } from "@/features/notifications/hq-board";
import { queueOrderNotification } from "@/features/order/solapi";
import {
  buildOrderLines,
  calculateOrderTotalPrice,
  createOrderCreatedAt,
  createOrderSheetPayload,
} from "@/features/order/utils";
import { savePaidOrder } from "@/features/payments/order-record";
import { resolveTossKeys, shouldSuppressOperations } from "@/features/payments/keys";
import { findStoreTaxProfile } from "@/features/stores/tax-profiles";
import {
  paymentMethodKeyFromToss,
  paymentMethodLabel,
  type PaymentMethodKey,
} from "@/features/payments/methods";
import {
  confirmTossPayment,
  describeTossError,
  getTossPayment,
  statusFromPayment,
  type TossPayment,
} from "@/features/payments/toss-api";
import { hashItems, verifyIntentToken } from "@/features/payments/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/confirm — 결제 승인 + 발주 기록 (서버 전용)
 *
 *   요청: { paymentKey, orderId, amount, token, items, recipient }
 *   응답: { ok, status, orderId, amount, method, methodLabel, virtualAccount?, receiptUrl, items, testMode }
 *
 * 금액 검증(핵심)
 *  1. 브라우저가 보낸 items 가 결제 준비 때 서명한 품목과 같은지(해시) 확인한다.
 *  2. 카탈로그 단가로 합계를 다시 계산해 서명된 금액·토스가 인증한 금액과 모두 같은지 확인한다.
 *  3. 셋 중 하나라도 다르면 토스 승인 API 를 호출하지 않는다(돈이 잡히지 않는다).
 *
 * 테스트 모드
 *  - 테스트 키로 결제하면 승인은 가상으로 이뤄지고, 구글시트 전달·알림톡은 보내지 않는다
 *    (실제 카톡 오발송·운영 시트 오염 방지). 발주 기록에는 테스트 표시가 남는다.
 */

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const ORDER_ID_PATTERN = /^[0-9A-Za-z_-]{6,64}$/;

type ConfirmBody = Record<string, unknown>;

function readRecipientCandidate(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return value as Record<string, unknown>;
}

function normalizeItems(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;

  const items: { id: string; quantity: number }[] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;

    const candidate = raw as Record<string, unknown>;
    const id = boundedText(candidate.id, 1, 40);
    const quantity = Number(candidate.quantity);

    if (!id || !Number.isFinite(quantity) || quantity < 1 || quantity > 999) return null;

    items.push({ id, quantity: Math.round(quantity) });
  }

  return items;
}

function successResponse(body: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...body }, { headers: noStoreHeaders });
}

async function resolveAlreadyProcessed(
  input: { paymentKey: string; orderId: string; amount: number; secretKey: string },
): Promise<TossPayment | null> {
  const lookup = await getTossPayment(input.paymentKey, input.secretKey);

  if (!lookup.ok) return null;
  if (lookup.payment.orderId !== input.orderId) return null;
  if (lookup.payment.totalAmount !== input.amount) return null;
  if (lookup.payment.status !== "DONE" && lookup.payment.status !== "WAITING_FOR_DEPOSIT") {
    return null;
  }

  return lookup.payment;
}

export async function POST(request: Request) {
  const keys = resolveTossKeys();

  if (!keys.ok) {
    return jsonError("결제 설정이 완료되지 않았습니다. 본사(1551-7157)로 문의해 주세요.", 503);
  }

  const verdict = takeRateLimit(request, `pay-confirm:${clientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS);

  if (!verdict.ok) {
    return jsonError("결제 확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
      retryAfter: verdict.retryAfter,
    });
  }

  const parsed = await readJsonObject(request, 32 * 1024);

  if (!parsed.ok) return parsed.response;

  const body: ConfirmBody = parsed.data;
  const paymentKey = boundedText(body.paymentKey, 6, 200);
  const orderId = boundedText(body.orderId, 6, 64);
  const amount = Number(body.amount);

  if (!paymentKey || !orderId || !ORDER_ID_PATTERN.test(orderId) || !Number.isFinite(amount)) {
    return jsonError("결제 정보가 올바르지 않습니다.", 400);
  }

  const claims = verifyIntentToken(body.token);

  if (!claims || claims.oid !== orderId) {
    return jsonError(
      "주문 확인 정보가 만료됐거나 일치하지 않습니다. 장바구니에서 다시 결제해 주세요.",
      400,
    );
  }

  const items = normalizeItems(body.items);

  if (!items || hashItems(items) !== claims.ih) {
    return jsonError("주문 품목이 결제 준비 때와 다릅니다. 장바구니에서 다시 결제해 주세요.", 400);
  }

  // 1) 서버 카탈로그 단가로 다시 계산
  const orderLines = buildOrderLines(items);

  if (!orderLines.length) {
    return jsonError("주문 품목을 찾을 수 없습니다.", 400);
  }

  const serverTotal = calculateOrderTotalPrice(orderLines);

  // 2) 서버 확정 금액 · 토스 인증 금액 · 재계산 금액이 모두 같아야 한다.
  if (serverTotal !== claims.amt || serverTotal !== Math.round(amount)) {
    console.warn(
      `[payments] 금액 불일치로 승인 중단 order=${orderId} server=${serverTotal} token=${claims.amt} request=${amount}`,
    );
    return jsonError(
      "결제 금액이 주문 금액과 일치하지 않아 승인하지 않았습니다. 장바구니에서 다시 시도해 주세요.",
      400,
      { code: "AMOUNT_MISMATCH" },
    );
  }

  // 3) 받는 곳 — 지점 코드가 있으면 서버가 지점 정보로 다시 채운다.
  const recipientCandidate = readRecipientCandidate(body.recipient);

  if (!recipientCandidate) {
    return jsonError("받는 곳 정보가 없습니다. 주문서에서 다시 시도해 주세요.", 400);
  }

  const resolved = await resolveOrderRecipient(recipientCandidate);

  if (!resolved.ok) {
    return jsonError(resolved.message, resolved.status);
  }

  const recipient = resolved.recipient;

  // 3-1) 세금계산서 — 결제 준비 때 서명한 "요청 여부"만 믿고, 사업자 정보는 지점 코드로 서버가 다시 채운다.
  //  (토큰에는 사업자 정보가 실리지 않는다. 브라우저 사본·토큰의 위조 여지도 없다.)
  const tax = buildTaxInvoice({
    profile: await findStoreTaxProfile(recipient.storeCode),
    requested: claims.ti?.requested === true,
  });

  const taxInvoice = tax.tax;

  // 4) 토스 승인
  let confirmed = await confirmTossPayment(
    { amount: serverTotal, orderId, paymentKey },
    keys.secretKey,
  );

  if (!confirmed.ok && confirmed.code === "ALREADY_PROCESSED_PAYMENT") {
    const existing = await resolveAlreadyProcessed({
      amount: serverTotal,
      orderId,
      paymentKey,
      secretKey: keys.secretKey,
    });

    if (existing) confirmed = { ok: true, payment: existing };
  }

  if (!confirmed.ok) {
    console.error(
      `[payments] 토스 승인 실패 order=${orderId} code=${confirmed.code} status=${confirmed.httpStatus}`,
    );

    return jsonError(describeTossError(confirmed.code), 402, { code: confirmed.code });
  }

  const payment = confirmed.payment;

  // 승인 응답이 우리 주문과 다르면 결제를 되돌린다(잘못된 금액으로 잡히는 것을 막는다).
  if (payment.orderId !== orderId || payment.totalAmount !== serverTotal) {
    console.error(
      `[payments] 승인 응답 불일치 order=${orderId} tossOrder=${payment.orderId} tossAmount=${payment.totalAmount}`,
    );

    await fetch(
      `https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}/cancel`,
      {
        body: JSON.stringify({ cancelReason: "주문 정보 불일치 — 자동 취소" }),
        headers: {
          Authorization: `Basic ${Buffer.from(`${keys.secretKey}:`, "utf8").toString("base64")}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    ).catch(() => undefined);

    return jsonError("결제를 확인하지 못해 자동 취소했습니다. 고객센터로 문의해 주세요.", 502);
  }

  const status = statusFromPayment(payment);
  const methodKey: PaymentMethodKey = paymentMethodKeyFromToss(payment.method);
  const methodLabel =
    status === "awaiting_deposit"
      ? paymentMethodLabel("virtual_account", payment.method)
      : paymentMethodLabel(methodKey, payment.method);
  const suppress = shouldSuppressOperations(keys.testMode);
  const createdAt = createOrderCreatedAt();

  // 5) 발주 기록 (Supabase shop_orders)
  const orderSheet = createOrderSheetPayload(
    {
      address: recipient.address,
      items: orderLines,
      name: recipient.name,
      phone: recipient.phone,
      shippingOption: recipient.shippingOption,
      taxInvoice,
    },
    { createdAt, orderId },
  );

  const saved = await savePaidOrder({
    address: orderSheet.address,
    approvedAt: payment.approvedAt ?? null,
    createdAt,
    fulfillmentType: orderSheet.fulfillment_type,
    itemText: orderSheet.item_text,
    items: orderLines,
    methodKey,
    methodLabel,
    orderNumber: orderId,
    paymentKey,
    paymentStatus: payment.status,
    pickupLocation: orderSheet.pickup_location,
    requesterName: recipient.name,
    requesterPhone: recipient.phone,
    shippingOption: recipient.shippingOption,
    status,
    storeCode: recipient.storeCode,
    storeName: recipient.storeName,
    taxInvoice,
    testMode: keys.testMode,
    totalAmount: serverTotal,
    virtualAccount: payment.virtualAccount
      ? {
          accountNumber: payment.virtualAccount.accountNumber,
          bankCode: payment.virtualAccount.bankCode,
          customerName: payment.virtualAccount.customerName,
          dueDate: payment.virtualAccount.dueDate,
        }
      : null,
  });

  console.log(
    `[payments] 승인 완료 order=${orderId} status=${status} method=${methodKey} test=${keys.testMode} saved=${saved.saved}`,
  );

  // 6) 운영 연결 — 실결제일 때만 구글시트 전달·알림톡. 테스트 결제는 조용히 넘어간다.
  if (suppress) {
    console.log(`[payments] 테스트 결제라 구글시트 전달·알림톡을 건너뜁니다 order=${orderId}`);
  } else {
    const relay = await relayOrderToGas(orderSheet);

    if (!relay.ok && relay.reason !== "not_configured") {
      console.error(`[payments] 구글시트 전달 실패 order=${orderId} (${relay.reason})`);
    }

    queueAdminAlert({
      amount: serverTotal,
      kind: "order",
      orderNumber: orderId,
      requesterName: recipient.name,
      storeName: recipient.storeName,
      taxInvoiceRequested: taxInvoice.requested,
      taxInvoiceText: tax.text,
    });

    // 본사 실시간 알림 보드(Notion · 디스코드/슬랙 웹훅).
    //  · 카드·계좌이체로 돈이 실제로 빠져나간 건 → `결제완료`
    //  · 가상계좌는 아직 입금 전 → `점주발주`(입금대기)로 남기고, 입금 확인은 후속 작업
    //  · 테스트 결제는 이 블록에 오지 않는다(suppress) — 보드에 가짜 매출을 남기지 않는다
    const virtualAccount = payment.virtualAccount;
    const depositNote =
      status === "awaiting_deposit"
        ? [
            "가상계좌 입금대기",
            virtualAccount?.bankCode ? `은행코드 ${virtualAccount.bankCode}` : "",
            virtualAccount?.accountNumber ? `계좌 ${virtualAccount.accountNumber}` : "",
            virtualAccount?.dueDate ? `입금기한 ${virtualAccount.dueDate}` : "",
          ]
            .filter(Boolean)
            .join(" · ")
        : null;

    queueHqBoardAlert({
      amount: serverTotal,
      contact: recipient.phone || null,
      detail: [
        `주문번호 ${orderId}`,
        orderSheet.item_text,
        `결제 ${methodLabel}${keys.testMode ? " (테스트)" : ""}`,
        taxInvoice.requested
          ? tax.missingProfile
            ? "세금계산서 발급 요청 — 지점 사업자 정보 미등록(본사 확인 필요)"
            : tax.emailMissing
              ? `세금계산서 발급 요청 — ${tax.text} (수취 이메일 미등록)`
              : `세금계산서 발급 요청 — ${tax.text}`
          : "세금계산서 미신청",
        depositNote,
      ]
        .filter(Boolean)
        .join("\n"),
      eventKey: `${status === "awaiting_deposit" ? "order" : "payment"}:${orderId}`,
      kind: status === "awaiting_deposit" ? "점주발주" : "결제완료",
      occurredAt: payment.approvedAt ? new Date(payment.approvedAt) : new Date(),
      sourceUrl: payment.receipt?.url ?? null,
      target: recipient.storeName ?? recipient.name,
      title:
        status === "awaiting_deposit"
          ? `점주발주 · ${recipient.storeName ?? "개인 주문"} · ${formatWon(serverTotal)} (입금대기)`
          : `결제완료 · ${recipient.storeName ?? "개인 주문"} · ${formatWon(serverTotal)}`,
    });

    if (orderSheet.phone) {
      queueOrderNotification({
        orderNumber: orderId,
        storeName: recipient.storeName,
        to: orderSheet.phone,
        totalAmount: serverTotal,
      });
    }
  }

  return successResponse({
    amount: serverTotal,
    approvedAt: payment.approvedAt ?? null,
    count: orderLines.reduce((sum, line) => sum + line.quantity, 0),
    createdAt,
    items: orderLines.map((line) => ({ id: line.id, quantity: line.quantity })),
    method: methodKey,
    methodLabel,
    orderId,
    orderName: payment.orderName ?? "",
    paymentStatus: payment.status,
    receiptUrl: payment.receipt?.url ?? null,
    saved: saved.saved,
    status,
    storeName: recipient.storeName,
    taxInvoiceRequested: taxInvoice.requested,
    testMode: keys.testMode,
    virtualAccount: payment.virtualAccount
      ? {
          accountNumber: payment.virtualAccount.accountNumber ?? null,
          bankCode: payment.virtualAccount.bankCode ?? null,
          customerName: payment.virtualAccount.customerName ?? null,
          dueDate: payment.virtualAccount.dueDate ?? null,
        }
      : null,
  });
}
