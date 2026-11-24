import gangnamJson from "@/data/sales-report/stores/gangnam-2026-11-23.json";
import hanyeojongJson from "@/data/sales-report/stores/hanyeojong-2026-11-23.json";
import type { SalesReportSnapshot } from "./types";

/**
 * 매출 리포트에 올라가는 지점 목록.
 *
 * 원칙(2026-11-23 사용자 지시): 지점 숫자는 **합산하지 않는다.**
 *  - 탭을 고르면 그 지점의 커피·프린트·재고·발주만 보여준다.
 *  - 두 지점을 함께 보고 싶을 때도 '나란히 비교'까지만 하고 합계 줄은 만들지 않는다.
 *  - 데이터 파일·API payload도 storeId로 완전히 갈라 둔다.
 *
 * snapshot은 두 사이트 수집기(two-site-collector)가 만든 재고·프린트 스냅샷이다.
 * 평택점은 로얄선즈 커피 매출만 실측으로 확보하고 프린트·재고 스냅샷이 없어 null로 둔다
 * — 없는 재고·토너 값을 0으로 채우지 않고 화면에서 '수집 전'이라고 밝힌다.
 */
export type StoreId = "gangnam" | "hanyeojong" | "pyeongtaek";

export type StoreEntry = {
  id: StoreId;
  code: string;
  label: string;
  shortLabel: string;
  region: string;
  badgeClass: string;
  accentClass: string;
  /** 이 화면이 지점 단독 기준임을 알리는 한 줄 */
  tagline: string;
  /** 재고·프린트 스냅샷. 아직 수집 전이면 null. */
  snapshot: SalesReportSnapshot | null;
};

export const STORES: StoreEntry[] = [
  {
    id: "gangnam",
    code: "STORE_GNM",
    label: "럭키스팟 강남구청역점",
    shortLabel: "강남구청역점",
    region: "서울 강남",
    badgeClass: "bg-[#EEF2FF] text-[#243B8F]",
    accentClass: "bg-[#0F1412] text-white",
    tagline: "1평대 · 프린트 중심 · 커피는 하루 몇 잔",
    snapshot: gangnamJson as unknown as SalesReportSnapshot,
  },
  {
    id: "hanyeojong",
    code: "STORE_HYJ",
    label: "럭키스팟 한예종점",
    shortLabel: "한예종점",
    region: "서울 성북",
    badgeClass: "bg-[#EDFBEF] text-[#0B5C2A]",
    accentClass: "bg-[#0F7A3E] text-white",
    tagline: "대학 상권 · 커피 하루 60잔대 · 프린트 월 200만",
    snapshot: hanyeojongJson as unknown as SalesReportSnapshot,
  },
  {
    id: "pyeongtaek",
    code: "STORE_PTK",
    label: "럭키스팟 평택점",
    shortLabel: "평택점",
    region: "경기 평택",
    badgeClass: "bg-[#FFF6E0] text-[#8A5A00]",
    accentClass: "bg-[#8A5A00] text-white",
    tagline: "아파트 상가 · 커피 하루 10건대 · 인쇄 메뉴 없음",
    snapshot: null,
  },
];

/** 스냅샷이 확보된 지점 — 재고·프린트 카드를 그리는 화면은 이 타입만 받는다. */
export type StoreEntryWithSnapshot = StoreEntry & { snapshot: SalesReportSnapshot };

/** 재고·프린트 스냅샷이 있는 지점 — '지점 비교'는 이 지점들끼리만 놓는다. */
export const STORES_WITH_SNAPSHOT = STORES.filter(
  (store): store is StoreEntryWithSnapshot => store.snapshot !== null,
);

export function findStore(id: string | null | undefined): StoreEntry {
  return STORES.find((store) => store.id === id) ?? STORES[0];
}

export function findStoreByCode(code: string | null | undefined): StoreEntry | null {
  if (!code) return null;
  const key = code.trim().toUpperCase();
  return STORES.find((store) => store.code.toUpperCase() === key) ?? null;
}

export function autoOrderHref(store: StoreEntry) {
  return `/auto-order?storeCode=${store.code}`;
}
