/**
 * 발주 결제수단 — 화면과 서버가 함께 쓰는 값(클라이언트 번들에 안전한 모듈).
 *
 * 토스페이먼츠 SDK v2 의 requestPayment(method) 값과 1:1로 맞춘다.
 *  - CARD            카드
 *  - TRANSFER        계좌이체(실시간 이체)
 *  - VIRTUAL_ACCOUNT 가상계좌(무통장입금)
 */

export const PAYMENT_METHODS = [
  {
    key: "card",
    label: "카드",
    tossMethod: "CARD",
    hint: "신용·체크카드, 간편결제(토스페이·네이버페이 등)",
  },
  {
    key: "transfer",
    label: "계좌이체",
    tossMethod: "TRANSFER",
    hint: "은행 계좌에서 바로 이체 · 즉시 결제 완료",
  },
  {
    key: "virtual_account",
    label: "가상계좌",
    tossMethod: "VIRTUAL_ACCOUNT",
    hint: "발급된 전용 계좌로 입금 · 입금 확인 후 출고",
  },
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]["key"];

export type TossPaymentMethod = (typeof PAYMENT_METHODS)[number]["tossMethod"];

export const DEFAULT_PAYMENT_METHOD: PaymentMethodKey = "card";

export function isPaymentMethodKey(value: unknown): value is PaymentMethodKey {
  return (
    typeof value === "string" && PAYMENT_METHODS.some((method) => method.key === value)
  );
}

export function paymentMethodMeta(key: PaymentMethodKey) {
  return PAYMENT_METHODS.find((method) => method.key === key) ?? PAYMENT_METHODS[0];
}

/** 토스 응답의 method(한글)와 우리 key 를 맞춘다. */
export function paymentMethodKeyFromToss(method: string | null | undefined): PaymentMethodKey {
  const label = (method ?? "").trim();

  if (label.includes("가상계좌")) return "virtual_account";
  if (label.includes("계좌이체") || label.includes("계좌")) return "transfer";
  return "card";
}

export function paymentMethodLabel(
  key: PaymentMethodKey,
  methodFromToss?: string | null,
): string {
  if (key === "virtual_account") return "가상계좌(무통장입금)";
  return paymentMethodMeta(key).label;
}
