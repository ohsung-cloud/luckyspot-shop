/**
 * 세금계산서 발급 요청 값 — 화면과 서버가 함께 쓰는 순수 모듈.
 *
 * 2026-11-26부터 화면은 **발급 요청 여부(requested)** 하나만 고른다.
 * 사업자등록번호·상호·대표자·수취 이메일은 지점별로 서버(DB·환경변수)에만 있고,
 * 주문 API 가 지점 코드로 찾아 채운다(`features/orders/tax-invoice.ts`, `features/stores/tax-profiles.ts`).
 *
 * 서버 전용 코드(Supabase·알림)는 여기에 넣지 않는다. 이 파일은 브라우저 번들에도 들어간다.
 *
 *  · requested                  발급 요청 여부 (기본 ON, 점주가 끌 수 있다)
 *  · businessNo                 사업자등록번호 10자리(숫자만). 화면에서는 123-45-67890 으로 보여준다.
 *  · businessName               상호(법인명)
 *  · ceoName                    대표자명
 *  · email                      세금계산서 수취 이메일
 *  · businessType / businessItem  업태·종목(선택)
 */

export type TaxInvoiceRequest = {
  requested: boolean;
  businessNo: string;
  businessName: string;
  ceoName: string;
  email: string;
  businessType: string;
  businessItem: string;
};

export const NO_TAX_INVOICE: TaxInvoiceRequest = {
  requested: false,
  businessNo: "",
  businessName: "",
  ceoName: "",
  email: "",
  businessType: "",
  businessItem: "",
};

/** 입력에서 숫자만 남긴다(하이픈·공백 제거, 10자리까지만). */
export function normalizeBusinessNo(value: string) {
  return value.replace(/\D/g, "").slice(0, 10);
}

/** 1234567890 → 123-45-67890 */
export function formatBusinessNo(value: string) {
  const digits = normalizeBusinessNo(value);

  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;

  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}
