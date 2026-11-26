import type { Metadata } from "next";

import { SalesReportShell } from "@/features/sales-report/SalesReportShell";
import type { StoreFixedCost } from "@/features/stores/registry-types";
import { listStoreRecords } from "@/features/stores/registry";
import { STORES } from "@/features/sales-report/stores";

/**
 * 지점별 매출 리포트 — 에스칼프린트(프린트) + 로얄선즈(커피) 실수집 스냅샷.
 *
 * 데이터: two-site-collector가 두 포털 화면에서 읽은 값(2026-11-23 15:50 KST).
 *  - 지점마다 파일이 따로 있고(src/data/sales-report/stores), 화면에서도 합산하지 않는다.
 *  - 상단 탭에서 지점을 고르면 그 지점의 매출·파이차트·재고·발주만 바뀐다.
 *  - '지점 비교'는 좌우 비교만 하고 합계 숫자를 만들지 않는다.
 *
 * 내부용: 검색 비노출(noindex). 홈페이지 메뉴에는 걸지 않는다.
 */

export const metadata: Metadata = {
  title: "지점별 매출 리포트 | 럭키스팟",
  description: "강남구청역점·한예종점·평택점·영등포시장역점·선유로점의 매출과 소모품·발주 리포트(내부용). 지점별로 따로 집계합니다.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const dynamic = "force-dynamic";

export default async function SalesReportPage() {
  const latest = STORES.map((store) => store.snapshot?.capturedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  // 지점별 월 고정비 — 본사(/admin/stores)에서 고친 값이 그대로 순수익 계산에 쓰인다.
  const fixedCosts: Record<string, StoreFixedCost> = {};
  try {
    for (const record of await listStoreRecords()) fixedCosts[record.code] = record.monthlyFixedCost;
  } catch {
    // 레지스트리를 못 읽어도 매출 리포트는 그대로 보여 준다(고정비는 지점 기본값으로).
  }

  return (
    <>
      <SalesReportShell fixedCosts={fixedCosts} />
      <p className="sr-only">수집 시각 {latest}</p>
    </>
  );
}
