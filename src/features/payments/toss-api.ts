/**
 * 토스페이먼츠 코어 API (서버 전용).
 *
 *   POST https://api.tosspayments.com/v1/payments/confirm   결제 승인
 *   GET  https://api.tosspayments.com/v1/payments/{key}     결제 조회
 *   POST https://api.tosspayments.com/v1/payments/{key}/cancel  결제 취소
 *
 * 시크릿 키는 Basic 인증( `{SECRET_KEY}:` 를 base64 )으로만 쓰고, 로그·응답에 남기지 않는다.
 */

const TOSS_API_BASE = "https://api.tosspayments.com";
const REQUEST_TIMEOUT_MS = 10_000;

export type TossPaymentStatus =
  | "READY"
  | "IN_PROGRESS"
  | "WAITING_FOR_DEPOSIT"
  | "DONE"
  | "CANCELED"
  | "PARTIAL_CANCELED"
  | "ABORTED"
  | "EXPIRED";

export type TossVirtualAccount = {
  accountNumber?: string;
  bankCode?: string;
  customerName?: string;
  dueDate?: string;
  expiredAt?: string;
  settlementStatus?: string;
};

export type TossPayment = {
  approvedAt?: string | null;
  balanceAmount?: number;
  card?: { issuerCode?: string; acquirerCode?: string; number?: string; cardType?: string } | null;
  method?: string | null;
  orderId: string;
  orderName?: string | null;
  paymentKey: string;
  receipt?: { url?: string | null } | null;
  requestedAt?: string | null;
  status: TossPaymentStatus;
  totalAmount: number;
  virtualAccount?: TossVirtualAccount | null;
};

export type TossFailure = { ok: false; code: string; httpStatus: number; message: string };

function basicAuth(secretKey: string) {
  return `Basic ${Buffer.from(`${secretKey}:`, "utf8").toString("base64")}`;
}

function asPayment(value: unknown): TossPayment | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.paymentKey !== "string" || typeof candidate.orderId !== "string") {
    return null;
  }

  return candidate as unknown as TossPayment;
}

async function callToss(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  secretKey: string,
): Promise<{ ok: true; payment: TossPayment } | TossFailure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${TOSS_API_BASE}${path}`, {
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      headers: {
        Authorization: basicAuth(secretKey),
        "Content-Type": "application/json",
      },
      method: init.method,
      signal: controller.signal,
    });

    const text = await response.text();

    let parsed: unknown = null;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const error = (parsed ?? {}) as { code?: string; message?: string };

      return {
        code: typeof error.code === "string" ? error.code : `HTTP_${response.status}`,
        httpStatus: response.status,
        message: typeof error.message === "string" ? error.message : "결제 처리에 실패했습니다.",
        ok: false,
      };
    }

    const payment = asPayment(parsed);

    if (!payment) {
      return {
        code: "INVALID_RESPONSE",
        httpStatus: 502,
        message: "결제 응답을 확인하지 못했습니다.",
        ok: false,
      };
    }

    return { ok: true, payment };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";

    return {
      code: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
      httpStatus: 502,
      message: timedOut
        ? "결제 서버 응답이 늦어 확인하지 못했습니다."
        : "결제 서버와 통신하지 못했습니다.",
      ok: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function confirmTossPayment(
  input: { paymentKey: string; orderId: string; amount: number },
  secretKey: string,
) {
  return callToss(
    "/v1/payments/confirm",
    {
      body: { amount: input.amount, orderId: input.orderId, paymentKey: input.paymentKey },
      method: "POST",
    },
    secretKey,
  );
}

export function getTossPayment(paymentKey: string, secretKey: string) {
  return callToss(
    `/v1/payments/${encodeURIComponent(paymentKey)}`,
    { method: "GET" },
    secretKey,
  );
}

export function cancelTossPayment(
  input: { paymentKey: string; cancelReason: string; cancelAmount?: number },
  secretKey: string,
) {
  return callToss(
    `/v1/payments/${encodeURIComponent(input.paymentKey)}/cancel`,
    {
      body: {
        cancelReason: input.cancelReason,
        ...(input.cancelAmount ? { cancelAmount: input.cancelAmount } : {}),
      },
      method: "POST",
    },
    secretKey,
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  ALREADY_PROCESSED_PAYMENT: "이미 승인된 결제입니다.",
  AMOUNT_MISMATCH: "결제 금액이 주문 금액과 다릅니다.",
  EXCEED_MAX_AMOUNT: "결제 한도를 넘은 금액입니다.",
  INVALID_API_KEY: "결제 키 설정이 올바르지 않습니다. 본사로 문의해 주세요.",
  INVALID_CARD_EXPIRATION: "카드 유효기간을 다시 확인해 주세요.",
  INVALID_PASSWORD: "카드 비밀번호가 올바르지 않습니다.",
  INVALID_REQUEST: "결제 요청이 올바르지 않습니다.",
  NOT_FOUND_PAYMENT: "결제 정보를 찾지 못했습니다.",
  NOT_FOUND_PAYMENT_SESSION: "결제 시간이 만료됐습니다. 다시 시도해 주세요.",
  PAY_PROCESS_ABORTED: "결제가 중단됐습니다. 다시 시도해 주세요.",
  REJECT_CARD_COMPANY: "카드사가 결제를 거절했습니다. 다른 카드로 시도해 주세요.",
  REJECT_CARD_PAYMENT: "카드 결제가 거절됐습니다. 다른 결제수단을 이용해 주세요.",
  UNAUTHORIZED_KEY: "결제 키 인증에 실패했습니다. 본사로 문의해 주세요.",
  USER_CANCEL: "결제를 취소하셨습니다.",
};

export function describeTossError(code: string) {
  return ERROR_MESSAGES[code] ?? "결제를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

/** 승인 성공 응답에서 우리 주문 상태를 정한다. */
export function statusFromPayment(payment: TossPayment): "paid" | "awaiting_deposit" | "pending" {
  if (payment.status === "DONE") return "paid";
  if (payment.status === "WAITING_FOR_DEPOSIT") return "awaiting_deposit";
  return "pending";
}
