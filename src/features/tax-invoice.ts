/**
 * 세금계산서 발급 요청 값 — 화면(클라이언트)과 서버가 함께 쓰는 순수 모듈.
 *
 * 서버 전용 코드(Supabase·알림)는 여기에 넣지 않는다. 이 파일은 브라우저 번들에도 들어간다.
 *
 *  · requested   발급 요청 여부 (기본 ON, 점주가 끌 수 있다)
 *  · businessNo  사업자등록번호 10자리(숫자만). 화면에서는 123-45-67890 으로 보여준다.
 *  · businessName 상호(법인명)
 *  · ceoName     대표자명
 *  · email       세금계산서 수취 이메일
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

export const EMPTY_TAX_INVOICE: TaxInvoiceRequest = {
  requested: true,
  businessNo: "",
  businessName: "",
  ceoName: "",
  email: "",
  businessType: "",
  businessItem: "",
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

export const TAX_INVOICE_FIELD_LIMITS = {
  businessNo: 10,
  businessName: 60,
  ceoName: 30,
  email: 100,
  businessType: 40,
  businessItem: 40,
} as const;

/** 입력에서 숫자만 남긴다(하이픈·공백 제거, 10자리까지만). */
export function normalizeBusinessNo(value: string) {
  return value.replace(/\D/g, "").slice(0, TAX_INVOICE_FIELD_LIMITS.businessNo);
}

/** 1234567890 → 123-45-67890 */
export function formatBusinessNo(value: string) {
  const digits = normalizeBusinessNo(value);

  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;

  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/**
 * 사업자등록번호 검증 — 10자리 + 국세청 체크섬.
 * (가중치 1·3·7·1·3·7·1·3·5, 9번째 자리 ×5 의 십의 자리를 더해 마지막 자리와 비교)
 */
export function isValidBusinessNo(value: string) {
  const digits = normalizeBusinessNo(value);

  if (!/^\d{10}$/.test(digits)) return false;

  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;

  for (let index = 0; index < 9; index += 1) {
    sum += Number(digits[index]) * weights[index];
  }

  sum += Math.floor((Number(digits[8]) * 5) / 10);

  const checkDigit = (10 - (sum % 10)) % 10;

  return checkDigit === Number(digits[9]);
}

export function isValidTaxEmail(value: string) {
  const email = value.trim();

  if (email.length < 5 || email.length > TAX_INVOICE_FIELD_LIMITS.email) return false;

  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email);
}

export type TaxInvoiceValidation =
  | { ok: true; value: TaxInvoiceRequest }
  | { ok: false; message: string; field: keyof TaxInvoiceRequest | "requested" };

function text(value: string) {
  return value.trim();
}

/**
 * 발급 요청 검증. 요청을 끄면 나머지 값은 비워서 돌려준다
 * (발급하지 않는 주문에 이전 사업자 정보가 남아 저장되지 않게).
 */
export function validateTaxInvoice(input: TaxInvoiceRequest): TaxInvoiceValidation {
  if (!input.requested) {
    return { ok: true, value: { ...NO_TAX_INVOICE } };
  }

  const businessNo = normalizeBusinessNo(input.businessNo);

  if (!isValidBusinessNo(businessNo)) {
    return {
      field: "businessNo",
      message: "사업자등록번호 10자리를 정확히 입력해 주세요.",
      ok: false,
    };
  }

  const businessName = text(input.businessName);

  if (businessName.length < 1 || businessName.length > TAX_INVOICE_FIELD_LIMITS.businessName) {
    return { field: "businessName", message: "상호(법인명)를 입력해 주세요.", ok: false };
  }

  const ceoName = text(input.ceoName);

  if (ceoName.length < 1 || ceoName.length > TAX_INVOICE_FIELD_LIMITS.ceoName) {
    return { field: "ceoName", message: "대표자명을 입력해 주세요.", ok: false };
  }

  const email = text(input.email);

  if (!isValidTaxEmail(email)) {
    return {
      field: "email",
      message: "세금계산서를 받을 이메일 주소를 정확히 입력해 주세요.",
      ok: false,
    };
  }

  const businessType = text(input.businessType);
  const businessItem = text(input.businessItem);

  if (businessType.length > TAX_INVOICE_FIELD_LIMITS.businessType) {
    return { field: "businessType", message: "업태는 40자 이내로 입력해 주세요.", ok: false };
  }

  if (businessItem.length > TAX_INVOICE_FIELD_LIMITS.businessItem) {
    return { field: "businessItem", message: "종목은 40자 이내로 입력해 주세요.", ok: false };
  }

  return {
    ok: true,
    value: {
      businessItem,
      businessName,
      businessNo,
      businessType,
      ceoName,
      email,
      requested: true,
    },
  };
}

/** 화면·알림에 쓰는 한 줄 요약. 발급을 신청하지 않았으면 빈 문자열. */
export function taxInvoiceSummary(tax: TaxInvoiceRequest | null | undefined) {
  if (!tax?.requested) return "";

  return [
    tax.businessName,
    formatBusinessNo(tax.businessNo),
    tax.ceoName,
    tax.email,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** 점검·로그용 — 값이 비어 있어도 안전하게 읽는다. */
export function isTaxInvoiceRequest(value: unknown): value is TaxInvoiceRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;

  return typeof candidate.requested === "boolean";
}
