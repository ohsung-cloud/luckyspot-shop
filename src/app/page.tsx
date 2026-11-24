import type { Metadata } from "next";

import ShopApp from "@/components/shop/ShopApp";
import { formatPrice } from "@/data/products";
import { ORDER_SUPPORT_PHONE } from "@/features/order/utils";
import { isTossTestMode } from "@/features/payments/keys";

export const metadata: Metadata = {
  title: "점주 발주 | 럭키스팟",
  description:
    "럭키스팟 점주 발주 페이지. 원두는 1박스(10봉·10kg) 단위로 매장·박스·발주 세 번이면 끝나고, 파우더·시럽·컵·부자재까지 2026년 11월 최신 단가로 한 번에 발주할 수 있습니다.",
};

export default function HomePage() {
  // 토스페이먼츠 실키가 설정되기 전에는 테스트 결제 모드다 — 화면 상단에 분명히 알린다.
  const testMode = isTossTestMode();

  return (
    <main className="min-h-screen bg-[#F4F5F6]">
      <header className="border-b border-[#EBEEF0] bg-white">
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a className="flex min-h-11 min-w-0 items-center gap-2.5" href="/">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-[#0F1412] text-[15px] font-bold leading-none text-[#1DFF26]"
            >
              L
            </span>
            <span className="min-w-0 leading-none">
              <span className="block text-[9.5px] font-bold tracking-[0.18em] text-[#0B5C2A]">LUCKY SPOT</span>
              <span className="mt-1 block truncate text-[15.5px] font-bold tracking-[-0.015em] text-[#0F1412]">
                점주 발주
              </span>
            </span>
          </a>

          <div className="flex shrink-0 items-center gap-1.5">
            <a
              className="flex h-10 items-center rounded-full bg-[#F2F4F6] px-3 text-[12.5px] font-bold text-[#3B4740] transition-colors hover:bg-[#E9ECEB]"
              href="/sales-report"
            >
              매출 리포트
            </a>
            <a
              className="flex h-10 items-center rounded-full bg-[#0F1412] px-3.5 text-[12.5px] font-bold text-white transition-colors hover:bg-[#232B26]"
              href="/orders"
            >
              내 발주 내역
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[760px] px-4 pt-5 sm:px-6">
        <header className="px-1">
          <p className="text-[12px] font-bold text-[#0B5C2A]">럭키스팟 본사 발주</p>
          <h1 className="mt-1.5 break-keep text-[25px] font-bold leading-[1.3] tracking-[-0.03em] text-[#0F1412] sm:text-[28px]">
            원두 발주, 세 번이면 끝나요
          </h1>
          <p className="mt-1.5 break-keep text-[12.5px] font-medium leading-[1.55] text-[#8B948D]">
            매장 고르고, 박스 고르고, 발주하기. 모두 부가세 포함 금액이에요.
          </p>
          {testMode ? (
            <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#FFF6E0] px-2.5 py-1 text-[11px] font-bold text-[#8A5A00]">
              <span aria-hidden className="size-1.5 rounded-full bg-[#E5A700]" />
              테스트 결제 모드 · 실제 금액이 청구되지 않아요
            </p>
          ) : null}
        </header>

        <div className="shop-content">
          <ShopApp testMode={testMode} />

          <footer className="mt-6 px-1 pb-4 text-[10.5px] leading-[1.7] text-[#98A29B]">
            <p className="font-semibold text-[#3B4740]">럭키스팟 본사 발주</p>
            <p className="mt-1">
              주문 문의 {ORDER_SUPPORT_PHONE} · 입금 확인 후 출고 · 단가는 부가세 포함이에요
            </p>
            <p className="mt-1">
              원두 1박스(10kg) {formatPrice(200000)} · 더캐럿 파우더·농축 단가표 2026-11-19 기준이에요
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}
