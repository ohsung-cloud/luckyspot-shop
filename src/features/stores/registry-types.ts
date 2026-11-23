/**
 * 매장·점주 어드민 레지스트리 타입.
 *
 * 이 파일은 **타입만** 담는다(클라이언트 컴포넌트에서도 import 가능).
 * 저장·조회·발급 로직은 `registry.ts`(서버 전용, node:crypto 사용)에 있다.
 *
 * 원칙
 *  - 포털 비밀번호는 어떤 필드에도 없다. 저장 자체가 금지다.
 *    (로얄선즈·에스칼프린트 로그인은 GitHub Actions Secrets + 수집기에서만 다룬다.)
 *  - 사업자번호는 서버·DB에만 두고, 화면에는 마스킹해서 보여준다.
 *  - 점주 접근 코드는 발급 시 한 번만 보여주고, DB에는 해시만 남긴다.
 */

export const STORE_TYPES = ["6평", "10평", "15평+", "1평 샵인샵", "미지정"] as const;
export type StoreType = (typeof STORE_TYPES)[number];

export const STORE_STATUSES = ["active", "paused", "deleted"] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export type StoreEntityProfile = {
  /** 사업자명 (예: 카페 럭키스팟 송도점) */
  name: string;
  /** 사업자등록번호 — 화면에는 마스킹만 내보낸다 */
  businessNo: string;
};

export type StorePortalLink = {
  /** 로얄선즈 매장 ID (아이디만. 비밀번호는 저장하지 않는다) */
  loyalsunsStoreId: string;
  /** 에스칼프린트 지점명 (아이디만. 비밀번호는 저장하지 않는다) */
  escalprintBranch: string;
};

export type StoreThresholds = {
  /** 원두 알림 기준일 — 잔여일이 이 값 이하이면 경보 */
  beanDays: number;
  /** 토너 알림 기준일 */
  tonerDays: number;
  /** 용지 알림 기준일 */
  paperDays: number;
};

/** 본사 화면에 내려가는 매장 정보(연락처는 마스킹). */
export type StoreRegistryRecord = {
  code: string;
  label: string;
  shortLabel: string;
  region: string;
  ownerName: string;
  /** 마스킹된 연락처. 원본은 서버 메모리·DB에만 있다. */
  phoneMasked: string;
  ownerPhone: string;
  storeType: StoreType;
  status: StoreStatus;
  coffeeEntity: StoreEntityProfile;
  printEntity: StoreEntityProfile;
  portals: StorePortalLink;
  thresholds: StoreThresholds;
  /** 점주 접근 코드가 설정돼 있는가(해시 존재 여부). 코드 원문은 어디에도 없다. */
  hasAdminCode: boolean;
  adminCodeSetAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 활성 매장이면 점주 어드민 링크가 열린다 */
  adminPath: string;
};

export type CreateStoreInput = {
  label: string;
  code?: string;
  ownerName: string;
  phone: string;
  storeType?: StoreType;
  region?: string;
  coffeeEntityName?: string;
  coffeeBusinessNo?: string;
  printEntityName?: string;
  printBusinessNo?: string;
  loyalsunsStoreId?: string;
  escalprintBranch?: string;
  thresholds?: Partial<StoreThresholds>;
};

export type CreatedStore = {
  store: StoreRegistryRecord;
  /** 발급 직후 한 번만 응답에 실린다. 이후에는 다시 볼 수 없다(재발급만 가능). */
  adminCode: string;
  adminUrl: string;
};

export type StoreValidationError = {
  field: string;
  message: string;
};

/** 본사 목록 화면으로 내려가는 값 — 연락처 원문(ownerPhone)은 서버에만 남긴다. */
export type StoreAdminListItem = Omit<StoreRegistryRecord, "ownerPhone"> & {
  secrets: {
    loyalsunsId: string;
    loyalsunsPassword: string;
    escalprintId: string;
    escalprintPassword: string;
  };
};
