/**
 * 발주 상태 — 화면과 서버가 함께 쓰는 값(클라이언트 번들에 안전한 모듈).
 * Supabase 접근 코드는 `features/admin/orders.ts`(서버 전용)에 있다.
 *
 *   pending          접수대기 — 계좌 입금 발주(입금 확인 전)
 *   paid             결제완료 — 카드·계좌이체로 결제가 끝난 발주
 *   awaiting_deposit 입금대기 — 가상계좌 발급, 입금 전
 *   confirmed        본사승인
 *   shipped          출고완료
 *   cancelled        취소
 */

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "awaiting_deposit",
  "confirmed",
  "shipped",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "접수대기",
  paid: "결제완료",
  awaiting_deposit: "입금대기",
  confirmed: "본사승인",
  shipped: "출고완료",
  cancelled: "취소",
};

/** 관리자 화면 탭 순서 */
export const ORDER_STATUS_TABS: { key: OrderStatus | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "pending", label: "접수대기" },
  { key: "paid", label: "결제완료" },
  { key: "awaiting_deposit", label: "입금대기" },
  { key: "confirmed", label: "본사승인" },
  { key: "shipped", label: "출고완료" },
  { key: "cancelled", label: "취소" },
];

/** 점주 조회 화면의 진행 단계(취소는 별도 표시). */
export const ORDER_STATUS_STEPS: { key: "pending" | "confirmed" | "shipped"; label: string }[] = [
  { key: "pending", label: "접수" },
  { key: "confirmed", label: "승인" },
  { key: "shipped", label: "출고" },
];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** 상태 배지 색(라이트 배경 기준). */
export const ORDER_STATUS_TONES: Record<OrderStatus, string> = {
  pending: "border-[#E5C86A] bg-[#FFF7DD] text-[#7A5A00]",
  paid: "border-[#9BD3B2] bg-[#EAF8EF] text-[#0B5C2A]",
  awaiting_deposit: "border-[#B7CBE8] bg-[#EEF4FD] text-[#1F4A8A]",
  confirmed: "border-[#9BD3B2] bg-[#EAF8EF] text-[#0B5C2A]",
  shipped: "border-[#0F1412] bg-[#0F1412] text-[#1DFF26]",
  cancelled: "border-[#D8DCDA] bg-[#F1F3F2] text-[#6B746D]",
};

/** 결제 단계(결제완료·입금대기)는 점주 화면에서 "접수" 단계로 보여준다. */
export function orderStepIndex(status: OrderStatus) {
  if (status === "shipped") return 2;
  if (status === "confirmed") return 1;
  return 0;
}
