/** 발주 폼 드롭다운에 내려도 되는 지점 정보. 개인정보(실명·휴대폰)는 담지 않는다. */
export type StoreOption = {
  address: string;
  code: string;
  label: string;
  region: string | null;
};

/** 서버 안에서만 쓰는 지점 정보. 점주 이름·휴대폰은 클라이언트로 내보내지 않는다. */
export type StoreRecord = StoreOption & {
  ownerName: string | null;
  phone: string | null;
};

/**
 * 지점에 등록된 세금계산서 기본 사업자 정보 (선택).
 * Supabase `stores` 의 business_* · tax_email 컬럼에서 읽으며,
 * 마이그레이션 전에는 비어 있다(점주가 주문서에서 직접 입력).
 */
export type StoreTaxProfile = {
  businessNo: string;
  businessName: string;
  ceoName: string;
  email: string;
  businessType: string;
  businessItem: string;
};
