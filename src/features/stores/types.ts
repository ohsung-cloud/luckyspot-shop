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

/*
 * 지점별 세금계산서 사업자 정보 타입은 `tax-profiles.ts`(서버 전용)에만 있다.
 * 예전에는 이 파일에 두어 주문서로 내려보냈지만, 이제 브라우저에는 아무 값도 보내지 않는다.
 */
