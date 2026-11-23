import type { Metadata } from "next";

import AutoOrderClient from "@/components/auto-order/AutoOrderClient";

/**
 * /auto-order — 특허 1호 실증 화면.
 *
 * 공개 금지선: 이 화면의 구조 도해·분기 결과는 출원 전 외부 공개 대상이 아니다.
 *  - 검색 비노출(noindex, nofollow) + 캐시 금지로 두고, 링크를 홈페이지 메뉴에 걸지 않는다.
 *  - 화면에는 마스킹된 사업자번호만 보여준다(실제 번호는 서버·DB에만).
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
      <header className="bg-[#0F1412]">
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-[8px] bg-[#1DFF26] text-[13px] font-bold leading-none text-[#0F1412]"
            >
              L
            </span>
            <div className="leading-none">
              <p className="text-[13px] font-semibold tracking-[0.2em] text-white">LUCKY SPOT</p>
              <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-[#9AA39C]">자동발주 실증</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-[#2C3730] px-2.5 py-1 text-[10.5px] font-semibold text-[#9AA39C]">
              내부 · noindex
            </span>
            <a
              className="flex h-9 items-center rounded-full bg-[#1DFF26] px-3 text-[12.5px] font-bold text-[#0F1412]"
              href="/"
            >
              점주 발주
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[760px] px-4 py-5 sm:px-6 sm:py-7">
        <AutoOrderClient />
      </div>

      <footer className="mx-auto w-full max-w-[760px] px-4 pb-10 text-[11px] leading-[1.7] text-[#98A29B] sm:px-6">
        럭키스팟 특허 1호 실증 · 카페(점주) + 프린트(본사·샵인샵) 복합매장 소모품 조달·정산 연동 · 2026-11-23
      </footer>
    </main>
  );
}
