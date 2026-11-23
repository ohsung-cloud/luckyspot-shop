import type { Metadata } from "next";

import AutoOrderClient from "@/components/auto-order/AutoOrderClient";
import HqTabs from "@/components/internal/HqTabs";
import InternalHeader from "@/components/internal/InternalHeader";

/**
 * /auto-order — 특허 1호 실증 화면.
 *
 * 공개 금지선: 이 화면의 구조 도해·분기 결과는 출원 전 외부 공개 대상이 아니다.
 *  - 검색 비노출(noindex, nofollow) + 캐시 금지로 두고, 링크를 홈페이지 메뉴에 걸지 않는다.
 *  - 화면에는 마스킹된 사업자번호만 보여준다(실제 번호는 서버·DB에만).
 *  - 첫 화면은 원두·토너·용지 3종과 원터치 승인(2026-11-23 사용자 지시).
 */

export const metadata: Metadata = {
  title: "자동발주 실증",
  description: "카페·프린트 매출 교차예측과 사업자별 발주·세금계산서 분기 실증 화면(내부용).",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export const dynamic = "force-dynamic";

export default function AutoOrderPage() {
  return (
    <main className="min-h-screen bg-[#F4F5F6]">
      <InternalHeader action={{ href: "/sales-report", label: "매출" }} subtitle="자동발주 실증" />

      <div className="mx-auto w-full max-w-[760px] px-4 py-4 sm:px-6 sm:py-5">
        <HqTabs active="/auto-order" />
        <div className="mt-3">
          <AutoOrderClient />
        </div>
      </div>

      <footer className="mx-auto w-full max-w-[760px] px-4 pb-10 text-[10.5px] leading-[1.7] text-[#98A29B] sm:px-6">
        럭키스팟 특허 1호 실증 · 카페(점주) + 프린트(본사·샵인샵) 복합매장 소모품 조달·정산 연동 · 2026-11-23
      </footer>
    </main>
  );
}
