import { NO_TAX_INVOICE, formatBusinessNo, type TaxInvoiceRequest } from "@/features/tax-invoice";
import { isIssuableProfile, type StoreTaxProfile } from "@/features/stores/tax-profiles";

/**
 * 주문서의 세금계산서 "발급 요청" 하나만 읽고, 지점에 등록된 사업자 정보를 붙인다 (서버 전용).
 *
 * 바뀐 점(2026-11-26)
 *  - 화면은 체크박스만 보낸다. 사업자등록번호·상호·대표자·이메일은 브라우저에서 오지 않는다.
 *  - 받는 모양(셋 다 허용 — 예전 화면·다른 앱의 주문을 막지 않는다)
 *      { taxInvoiceRequested: true }
 *      { taxInvoice: { requested: true } }
 *      { taxInvoice: true }
 *  - 발급 여부(requested)만 서버가 그대로 받아들이고, 나머지 값은 지점 코드로 서버가 채운다.
 *    값을 클라이언트가 보내와도 쓰지 않는다(위조된 사업자 정보로 계산서가 나가지 않게).
 */

export function readTaxInvoiceRequest(candidate: Record<string, unknown>): boolean {
  const raw = candidate.taxInvoice;

  if (raw === true) return true;

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    if ((raw as Record<string, unknown>).requested === true) return true;
  }

  return candidate.taxInvoiceRequested === true;
}

export type BuiltTaxInvoice = {
  /** 주문·알림·시트에 쓰는 값. 요청이 없으면 전부 빈 값 */
  tax: TaxInvoiceRequest;
  /** 요청은 했는데 지점 사업자 정보가 없거나 부족한가(본사 확인 필요) */
  missingProfile: boolean;
  /** 수취 이메일이 비어 있는가(발급은 되지만 보낼 곳이 없다) */
  emailMissing: boolean;
  /** 알림·화면에 쓰는 한 줄 */
  text: string;
};

/**
 * 요청 여부 + 지점 사업자 정보 → 주문에 남길 발급 정보.
 *
 * 요청을 껐으면 빈 값(NO_TAX_INVOICE)을 돌려준다.
 * 요청했는데 지점 정보가 없으면 requested=true 인 채로 두고 missingProfile=true 로 알린다
 * (주문 자체는 막지 않는다 — 사업자 정보는 본사가 채워 발급한다).
 */
export function buildTaxInvoice(input: {
  requested: boolean;
  profile: StoreTaxProfile | null | undefined;
}): BuiltTaxInvoice {
  if (!input.requested) {
    return { emailMissing: false, missingProfile: false, tax: { ...NO_TAX_INVOICE }, text: "" };
  }

  const profile = input.profile ?? null;
  const issuable = isIssuableProfile(profile);

  const tax: TaxInvoiceRequest = {
    businessItem: profile?.businessItem.trim() ?? "",
    businessName: profile?.businessName.trim() ?? "",
    businessNo: profile?.businessNo.trim() ?? "",
    businessType: profile?.businessType.trim() ?? "",
    ceoName: profile?.ceoName.trim() ?? "",
    email: profile?.email.trim() ?? "",
    requested: true,
  };

  const text = [
    tax.businessName,
    formatBusinessNo(tax.businessNo),
    tax.ceoName,
    tax.email,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    emailMissing: tax.email.length === 0,
    missingProfile: !issuable,
    tax,
    text,
  };
}
