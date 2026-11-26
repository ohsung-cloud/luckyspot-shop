import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { TOSS_TEST_SECRET_KEY } from "@/features/payments/keys";

/**
 * 결제 의도(intent) 서명 — 결제창을 띄우기 전에 서버가 확정한 "무엇을 얼마에" 를
 * 브라우저를 거쳐 돌아왔을 때 그대로인지 확인한다.
 *
 * 왜 필요한가
 *   결제 성공 페이지로 돌아온 요청의 amount·items 는 모두 브라우저를 거친 값이다.
 *   서버는 카탈로그 단가로 금액을 다시 계산하고, 그 결과가 (1) 토스가 인증한 금액,
 *   (2) 서버가 처음 확정한 금액과 모두 같을 때만 승인 API 를 호출한다.
 *
 * 무엇을 서명하나
 *   { oid 주문번호, amt 금액, ih 품목(id·수량) 해시, ti 세금계산서 발급 요청 여부, exp 만료시각 }
 *   → 개인정보(이름·연락처·주소)는 토큰에 넣지 않는다. 주소창에도 싣지 않는다.
 *     ti 에는 "발급 요청함(true)" 하나만 담는다. 사업자등록번호·상호·대표자·이메일은
 *     2026-11-26부터 지점 코드로 서버(DB)가 채우므로 토큰에 실리지 않는다.
 */

const TTL_MS = 30 * 60 * 1000;

export type PaymentIntentClaims = {
  /** 토스 orderId */
  oid: string;
  /** 서버가 확정한 결제 금액(원) */
  amt: number;
  /** 품목(id·수량) 해시 */
  ih: string;
  /** 세금계산서 발급 요청 여부(요청한 경우에만). 사업자 정보는 여기에 넣지 않는다. */
  ti?: { requested: true };
  /** 만료 시각(ms) */
  exp: number;
};

function signingSecret() {
  return (
    process.env.PAYMENT_TOKEN_SECRET?.trim() ||
    process.env.TOSS_SECRET_KEY?.trim() ||
    TOSS_TEST_SECRET_KEY
  );
}

/** 키 순서가 달라도 같은 값이면 같은 문자열이 되도록 정렬한다. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

export function hashCanonical(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 32);
}

export function hashItems(items: { id: string; quantity: number }[]) {
  return hashCanonical(
    items
      .map((item) => ({ id: item.id, quantity: item.quantity }))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
  );
}

function sign(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

export function createIntentToken(input: {
  orderId: string;
  amount: number;
  items: { id: string; quantity: number }[];
  /** 발급을 요청했는가 — 사업자 정보 자체는 받지 않는다(서버가 지점 코드로 채운다). */
  taxInvoiceRequested?: boolean;
  now?: number;
}): string {
  const claims: PaymentIntentClaims = {
    amt: input.amount,
    exp: (input.now ?? Date.now()) + TTL_MS,
    ih: hashItems(input.items),
    oid: input.orderId,
    ...(input.taxInvoiceRequested ? { ti: { requested: true } } : {}),
  };

  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifyIntentToken(token: unknown, now = Date.now()): PaymentIntentClaims | null {
  if (typeof token !== "string" || token.length < 20 || token.length > 1024) return null;

  const separator = token.lastIndexOf(".");

  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = sign(payload);

  const givenBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (givenBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(givenBuffer, expectedBuffer)) return null;

  let claims: PaymentIntentClaims;

  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PaymentIntentClaims;
  } catch {
    return null;
  }

  if (!claims || typeof claims !== "object") return null;
  if (typeof claims.oid !== "string" || typeof claims.amt !== "number") return null;
  if (typeof claims.ih !== "string") return null;
  if (typeof claims.exp !== "number" || claims.exp < now) return null;

  // 서명은 맞지만 모양이 깨진 발급 정보는 조용히 버린다(발급 신청 안 함으로 처리).
  if (claims.ti !== undefined && claims.ti !== null && typeof claims.ti === "object") {
    if ((claims.ti as { requested?: unknown }).requested !== true) claims.ti = undefined;
  } else {
    claims.ti = undefined;
  }

  return claims;
}
