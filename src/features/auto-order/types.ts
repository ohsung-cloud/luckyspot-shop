/**
 * 특허 1호 — 이기종 장비 교차예측 · 다중사업자 자동발주 엔진 타입.
 *
 * 설계 원칙
 *  - 이 파일은 **순수 타입**만 담는다. 클라이언트 컴포넌트도 이 파일만 import 한다.
 *    (서버 전용 모듈은 store.ts · state.ts 이며, 클라이언트 번들에 들어가지 않는다.)
 *  - DB(Supabase) 컬럼은 snake_case, 화면·엔진은 camelCase 로 다룬다.
 *    변환 지점은 store.ts 한 곳뿐이다.
 */

/** 소모품을 부담하는 사업자(장비 소유 주체). 특허 청구항 (b)의 '소유 사업자 식별자'. */
export type OwnerEntityType = "franchisee_cafe" | "hq_print";

/** 이기종 도메인. cafe = 커피머신·음료, print = 복합기 출력. */
export type DomainKey = "cafe" | "print";

/** POS 일일 마감표에서 소진량을 역산할 때 쓰는 계수 필드. */
export type DriverField = "drinks" | "sheets" | "colorSheets";

/** 재고·소모 단위. g(원두·토너), 개(컵·리드), 장(냅킨), 매(용지). */
export type StockUnit = "g" | "개" | "장" | "매";

/**
 * 제안 상태 전이.
 *
 *   pending_approval ──승인──▶ grace_cancel_window ──5분 경과──▶ confirmed_split
 *          │                          └────취소────▶ canceled
 *          └─(단측 급감 이상)──▶ held_anomaly
 */
export type ProposalStatus =
  | "pending_approval"
  | "grace_cancel_window"
  | "held_anomaly"
  | "confirmed_split"
  | "canceled";

/** POS/프린트 일일 마감 데이터 1행 = 1지점 1일. */
export type PosDailySales = {
  storeCode: string;
  /** KST 기준 날짜 (YYYY-MM-DD) */
  salesDate: string;
  cafeRevenue: number;
  drinksSold: number;
  printRevenue: number;
  printSheets: number;
  colorSheets: number;
};

/** 소모품 SKU별 소진 규칙(BOM). 특허 청구항 (b)의 장비ID↔사업자↔SKU↔환산계수↔리드타임 매핑. */
export type ConsumableBomRule = {
  sku: string;
  /** 이 소모품 값을 실제로 부담하는 사업자 */
  ownerEntityType: OwnerEntityType;
  /** 소진량을 직접 이끄는 도메인 */
  primaryDomain: DomainKey;
  driverField: DriverField;
  /** 교차 보정에 쓰는 반대편 도메인 */
  crossDomain: DomainKey;
  crossDriverField: DriverField;
  /** 교차 상관계수 (0~0.6). 반대 도메인 ±40%까지 반영한다. */
  crossDomainWeight: number;
  /** 운전 단위 1건당 소모량 (예: 1잔당 원두 12.5g) */
  consumptionPerDriverUnit: number;
  stockUnit: StockUnit;
  /** 발주 1단위에 들어 있는 소모 단위 수 (예: 컵 1박스 = 1,000개) */
  packSize: number;
  packLabel: string;
  leadTimeDays: number;
  safetyStockDays: number;
  /** 1회 자동발주 최대 수량(발주 단위). 초과하면 보류·재승인 대상. */
  maxOrderQty: number;
  /** 현재고(소모 단위). 실서비스에서는 입고 확인 신호로 갱신된다. */
  stockOnHand: number;
  /** 공급처(세금계산서 발행 주체) */
  supplier: string;
};

/** 카탈로그 단가·품명까지 붙은 규칙. */
export type ResolvedBomRule = ConsumableBomRule & {
  name: string;
  spec: string;
  /** 부가세 포함 발주 단가 */
  unitPrice: number;
};

/** SKU 1건의 예측 결과. */
export type SkuForecast = {
  sku: string;
  name: string;
  spec: string;
  ownerEntityType: OwnerEntityType;
  primaryDomain: DomainKey;
  supplier: string;
  /** ① 기본 이동평균 소진량(일) */
  baseDailyConsumption: number;
  /** ② 교차 보정 계수 (1.0 = 보정 없음) */
  crossFactor: number;
  /** 교차 도메인의 최근 3일 ÷ 직전 주 같은 요일 비율 */
  crossDriverRatio: number;
  /** ③ 보정 후 예상 일 소진량 */
  predictedDailyConsumption: number;
  stockOnHand: number;
  stockUnit: StockUnit;
  /** ④ 예상 잔여일 */
  remainingDays: number;
  leadTimeDays: number;
  safetyStockDays: number;
  reorderPointDays: number;
  /** 리드타임+안전재고 안으로 들어왔는가 */
  due: boolean;
  suggestedQty: number;
  /** 상한(maxOrderQty)에 걸렸는가 — 걸리면 재승인 필요 */
  cappedByMax: boolean;
  packLabel: string;
  unitPrice: number;
  /** 수량 × 단가 (VAT 포함) */
  amount: number;
  /** 예측 신뢰도 0~1 (최근 14일 변동계수 기반) */
  confidence: number;
  /** 화면에 한 줄로 보여줄 교차 근거 */
  evidenceLine: string;
};

/** 단측 급감 이상 플래그 — 소진이 아니라 장비·결제 이상일 수 있다. */
export type AnomalyFlag = {
  code: "cafe_one_sided_collapse" | "print_one_sided_collapse";
  title: string;
  message: string;
  cafeRatio: number;
  printRatio: number;
};

/** 한 번의 예측 실행 결과. */
export type ForecastRun = {
  storeCode: string;
  storeLabel: string;
  asOfDate: string;
  windowDays: number;
  rowCount: number;
  cafeDailyAvg: number;
  printDailyAvg: number;
  colorSheetShare: number;
  /** 최근 3일 / 직전 7일 */
  cafeRecentRatio: number;
  printRecentRatio: number;
  anomalies: AnomalyFlag[];
  /** 이상 감지로 자동발주 전체를 보류했는가 */
  hold: boolean;
  forecasts: SkuForecast[];
  dataSource: DataSource;
};

export type DataSource = "supabase" | "memory" | "demo";

/** 발주 제안 1건 = SKU 1건. */
export type AutoOrderProposal = {
  id: string;
  storeCode: string;
  storeLabel: string;
  sku: string;
  name: string;
  spec: string;
  ownerEntityType: OwnerEntityType;
  quantity: number;
  packLabel: string;
  unitPrice: number;
  amount: number;
  supplier: string;
  remainingDays: number;
  leadTimeDays: number;
  safetyStockDays: number;
  crossFactor: number;
  evidenceLine: string;
  status: ProposalStatus;
  /** 리드타임 안으로 들어온 이유 한 줄 */
  reason: string;
  createdAt: string;
};

/** 사업자별로 분리된 발주 전표 1장. */
export type EntityOrderSlip = {
  entityType: OwnerEntityType;
  entityName: string;
  businessNoMasked: string;
  /** 결제 귀속(누가 돈을 내는가) */
  paymentOwner: string;
  /** 변동비 부담 기준 한 줄 */
  costShareNote: string;
  lines: SplitLine[];
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  suppliers: SplitSupplierGroup[];
};

export type SplitLine = {
  sku: string;
  name: string;
  quantity: number;
  packLabel: string;
  unitPrice: number;
  amount: number;
  supplier: string;
};

/** 같은 사업자 안에서도 공급처가 다르면 세금계산서 발행 주체가 다르다. */
export type SplitSupplierGroup = {
  supplier: string;
  taxInvoiceIssuer: string;
  taxInvoiceRecipient: string;
  recipientBusinessNoMasked: string;
  lines: SplitLine[];
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
};

export type SplitResult = {
  approvalId: string;
  storeCode: string;
  storeLabel: string;
  slips: EntityOrderSlip[];
  totalAmount: number;
  /** 발주 전표 라우팅 요약 (청구항 (e)) */
  routing: {
    entityType: OwnerEntityType;
    entityName: string;
    supplier: string;
    taxInvoiceIssuer: string;
    taxInvoiceRecipient: string;
    amount: number;
  }[];
};

/** 5분 유예 구간의 서명 토큰 페이로드. */
export type GracePayload = {
  v: 1;
  approvalId: string;
  storeCode: string;
  storeLabel: string;
  approvedAt: string;
  expiresAt: string;
  proposals: AutoOrderProposal[];
};

export type ApprovalView = {
  approvalId: string;
  token: string;
  status: ProposalStatus;
  approvedAt: string;
  expiresAt: string;
  graceSeconds: number;
  remainingSeconds: number;
  proposals: AutoOrderProposal[];
  splitPreview: SplitResult;
  storeCode: string;
  storeLabel: string;
};

export type ProposalListResponse = {
  ok: true;
  storeCode: string;
  storeLabel: string;
  asOfDate: string;
  serverTime: string;
  graceSeconds: number;
  dataSource: DataSource;
  hold: boolean;
  anomalies: AnomalyFlag[];
  proposals: AutoOrderProposal[];
  totals: {
    count: number;
    cafeAmount: number;
    hqAmount: number;
    totalAmount: number;
  };
  splitPreview: SplitResult | null;
  run: ForecastRun;
};
