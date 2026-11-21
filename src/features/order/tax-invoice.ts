import {
  NO_TAX_INVOICE,
  TAX_INVOICE_FIELD_LIMITS,
  normalizeBusinessNo,
  validateTaxInvoice,
  type TaxInvoiceRequest,
} from "@/features/tax-invoice";

/**
 * API 본문에서 세금계산서 발급 요청을 읽는다 (서버 전용).
 *
 * 받는 모양 (둘 다 허용 — 예전 화면·다른 앱이 평평한 키로 보내도 주문이 막히지 않게)
 *   { taxInvoice: { requested, businessNo, businessName, ceoName, email, businessType, businessItem } }
 *   { taxInvoiceRequested, taxBusinessNo, taxBusinessName, taxCeoName, taxEmail, ... }
 *
 * 원칙
 *  · 값이 없으면 "발급 신청 안 함"으로 본다(기존 클라이언트의 주문을 막지 않는다).
 *  · requested: true 인데 필수 값이 틀리면 400으로 막는다(발급 정보가 빈 채로 접수되면
 *    본사가 세금계산서를 보낼 수 없기 때문).
 *  · 저장·전송에는 항상 숫자만 남긴 사업자번호를 쓴다.
 */

export type TaxInvoiceParseResult =
  | { ok: true; value: TaxInvoiceRequest; taxText: string }
  | { ok: false; message: string };

function text(value: unknown, max: number) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();

  if (trimmed.length > max) return trimmed.slice(0, max);

  return trimmed;
}

function readRawObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return value as Record<string, unknown>;
}

export function readTaxInvoice(candidate: Record<string, unknown>): TaxInvoiceParseResult {
  const raw = readRawObject(candidate.taxInvoice);

  const requested =
    raw?.requested === true ||
    candidate.taxInvoiceRequested === true ||
    (raw === null && candidate.taxInvoice === true);

  if (!requested) {
    return { ok: true, value: { ...NO_TAX_INVOICE }, taxText: "" };
  }

  const source: Record<string, unknown> = raw ?? candidate;

  const pick = (rawKey: string, flatKey: string) =>
    source[rawKey] !== undefined ? source[rawKey] : candidate[flatKey];

  const input: TaxInvoiceRequest = {
    businessItem: text(pick("businessItem", "taxBusinessItem"), TAX_INVOICE_FIELD_LIMITS.businessItem),
    businessName: text(pick("businessName", "taxBusinessName"), TAX_INVOICE_FIELD_LIMITS.businessName),
    businessNo: normalizeBusinessNo(text(pick("businessNo", "taxBusinessNo"), 20)),
    businessType: text(pick("businessType", "taxBusinessType"), TAX_INVOICE_FIELD_LIMITS.businessType),
    ceoName: text(pick("ceoName", "taxCeoName"), TAX_INVOICE_FIELD_LIMITS.ceoName),
    email: text(pick("email", "taxEmail"), TAX_INVOICE_FIELD_LIMITS.email),
    requested: true,
  };

  const verdict = validateTaxInvoice(input);

  if (!verdict.ok) return { ok: false, message: verdict.message };

  const value = verdict.value;
  const taxText = [value.businessName, value.businessNo, value.ceoName, value.email]
    .filter(Boolean)
    .join(" · ");

  return { ok: true, value, taxText };
}
