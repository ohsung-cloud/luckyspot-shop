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
export type DriverField = "drinks" | "beanGrams" | "sheets" | "colorSheets";

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
  /**
   * 그날 원두 사용량(g) — 베스트셀러 메뉴 구성으로 계산한 실측값.
   * 없으면 drinksSold × 기본 블렌드(9.2g)로 대체한다.
   */
  beanGrams?: number;
  /**
   * 그날 그 도메인 값이 실제로 보고되었는가.
   * 포털 두 곳이 따로 들어오면 한쪽만 있는 날이 생기는데, 없는 쪽을 0으로 읽으면
   * '매출 급감'으로 오인된다. undefined는 true(수동 rows·데모)로 본다.
   */
  cafeReported?: boolean;
  printReported?: boolean;
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
  /**
   * 실측 잔량 신호 — 포털이 %로 주는 값을 현재고로 환산할 때 쓴다.
   *  toner_black_pct : 에스칼프린트 토너 K %
   *  toner_color_pct : 토너 C/M/Y 중 최소 %
   *  paper_tray_pct  : 용지 Tray1/Tray2 평균 %
   */
  stockSignal?: StockSignal;
  /** 신호 100%일 때의 소모 단위 수 (토너 1개=500g, A4 2트레이=1,100매) */
  signalCapacity?: number;
};

export type StockSignal = "toner_black_pct" | "toner_color_pct" | "paper_tray_pct";

/** 프린트 장비 벤더 출처 — 에스칼프린트·유피소프트·타사 공용 웹훅. */
export type PrintVendorSource = "escalprint" | "yupisoft" | "generic_webhook" | "manual";

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
  /** 현재고의 출처 — manual(기본값) | telemetry(포털 실측 %) */
  stockSource: "manual" | "telemetry";
  /** 실측 신호 한 줄 (예: "토너 K 62% · 500g 중 310g") */
  stockNote?: string;
  /** 화면에 한 줄로 보여줄 교차 근거 */
  evidenceLine: string;
  /** 교체완료 학습으로 보정된 지점 계수 (1 = 보정 없음) */
  calibrationFactor?: number;
  /** 이 품목을 마지막으로 갈아 끼운 시각(ISO) — 교체완료 버튼이 남긴 기록 */
  lastReplacedAt?: string | null;
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

/** 프린트 포털(에스칼프린트) 장비 스냅샷 — 2시간마다(08~22시) + 00:05 마감에 수집된다. */
export type DeviceTelemetry = {
  storeCode: string;
  source: PrintVendorSource;
  capturedAt: string;
  deviceModel: string | null;
  deviceSerial: string | null;
  cumulativePrintCount: number | null;
  tonerKPct: number | null;
  tonerCPct: number | null;
  tonerMPct: number | null;
  tonerYPct: number | null;
  tray1Pct: number | null;
  tray2Pct: number | null;
};

/** 음료 포털(로얄선즈) 베스트셀러 라인 — 상품명칭별 판매량. */
export type BeverageLine = {
  name: string;
  quantity: number;
  amount: number | null;
};

/** 포털 매출 스냅샷 (일/월 스코프). */
export type RevenueSnapshot = {
  source: "loyalsuns" | "escalprint" | "yupisoft" | "generic_webhook" | "manual";
  scope: "day" | "month";
  periodStart: string;
  periodEnd: string;
  grossAmount: number;
  refundAmount: number;
  netAmount: number;
  orderCount: number | null;
  refundCount: number | null;
};

/** ingest-pos가 포털 스냅샷을 받았을 때 돌려주는 요약. */
export type SnapshotIngestSummary = {
  source: "escalprint" | "loyalsuns" | "yupisoft" | "generic_webhook" | "both";
  capturedAt: string;
  salesDate: string;
  derived: {
    drinksSold: number | null;
    printSheets: number | null;
    colorSheets: number | null;
    stockOverrides: Record<string, number>;
  };
  notes: string[];
  warnings: string[];
};

/** 통합 매출 요약 — 카페(로얄선즈)와 프린트(에스칼프린트)를 한 카드에 모은다. */
export type RevenueSummary = {
  source: "portal" | "demo";
  cafeToday: number | null;
  cafeYesterday: number | null;
  cafeMonth: number | null;
  printMonth: number | null;
  capturedAt: string | null;
};

export type MachineStatusSummary = {
  online: boolean | null;
  alerts: string[];
  capturedAt: string | null;
};

export type TelemetrySummary = {
  capturedAt: string;
  deviceModel: string | null;
  cumulativePrintCount: number | null;
  toner: { k: number | null; c: number | null; m: number | null; y: number | null };
  paper: { tray1: number | null; tray2: number | null };
};

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
  /** 포털 실측 신호가 있으면 화면에 그대로 보여준다. */
  telemetry: TelemetrySummary | null;
  /** 통합 매출·기계 상태 (통합 현황 탭) */
  overview: {
    revenue: RevenueSummary | null;
    machine: MachineStatusSummary | null;
  };
  /** 실측 일수 — 7일 미만이면 sparse(예측이 흔들릴 수 있음) */
  dataQuality: { days: number; sparse: boolean };
};
