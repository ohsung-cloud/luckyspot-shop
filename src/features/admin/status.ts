/**
 * 발주 상태 — 화면과 서버가 함께 쓰는 값(클라이언트 번들에 안전한 모듈).
 * Supabase 접근 코드는 `features/admin/orders.ts`(서버 전용)에 있다.
 */

export const ORDER_STATUSES = ["pending", "confirmed", "shipped", "cancelled"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "접수대기",
  confirmed: "본사승인",
  shipped: "출고완료",
  cancelled: "취소",
};

/** 관리자 화면 탭 순서 */
export const ORDER_STATUS_TABS: { key: OrderStatus | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "pending", label: "접수대기" },
  { key: "confirmed", label: "본사승인" },
  { key: "shipped", label: "출고완료" },
  { key: "cancelled", label: "취소" },
];

/** 점주 조회 화면의 진행 단계(취소는 별도 표시). */
export const ORDER_STATUS_STEPS: { key: Exclude<OrderStatus, "cancelled">; label: string }[] = [
  { key: "pending", label: "접수대기" },
  { key: "confirmed", label: "본사승인" },
  { key: "shipped", label: "출고완료" },
];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** 상태 배지 색(라이트 배경 기준). */
export const ORDER_STATUS_TONES: Record<OrderStatus, string> = {
  pending: "border-[#E5C86A] bg-[#FFF7DD] text-[#7A5A00]",
  confirmed: "border-[#9BD3B2] bg-[#EAF8EF] text-[#0B5C2A]",
  shipped: "border-[#0F1412] bg-[#0F1412] text-[#1DFF26]",
  cancelled: "border-[#D8DCDA] bg-[#F1F3F2] text-[#6B746D]",
};
