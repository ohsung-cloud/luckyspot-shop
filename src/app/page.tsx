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
      <header className="bg-[#0F1412]">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-[8px] bg-[#1DFF26] text-[13px] font-bold leading-none text-[#0F1412]"
            >
              L
            </span>
            <div className="leading-none">
              <p className="text-[13px] font-semibold tracking-[0.2em] text-white">LUCKY SPOT</p>
              <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-[#9AA39C]">
                점주 발주
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <a
              className="flex h-10 items-center rounded-full border border-[#2C3730] px-2.5 text-[12px] font-semibold text-[#C8D0CA] transition-colors hover:border-[#1DFF26] hover:text-white"
              href="/auto-order"
            >
              통합 현황
            </a>
            <a
              className="flex h-10 items-center gap-1 rounded-full bg-[#1DFF26] px-3.5 text-[13.5px] font-bold text-[#0F1412] transition-colors hover:bg-[#7CE785]"
              href="/orders"
            >
              내 발주 내역
            </a>
            <a
              aria-label={`주문 문의 ${ORDER_SUPPORT_PHONE}`}
              className="grid size-10 place-items-center rounded-full border border-[#2C3730] text-[#C8D0CA] transition-colors hover:border-[#1DFF26] hover:text-white"
              href={`tel:${ORDER_SUPPORT_PHONE.replace(/\D/g, "")}`}
            >
              <svg aria-hidden height="15" viewBox="0 0 12 12" width="15">
                <path
                  d="M3 1.5h2l.8 2.2-1.2.9a7 7 0 0 0 2.8 2.8l.9-1.2 2.2.8v2c0 .8-.6 1.5-1.4 1.4C5.6 11 1 6.4.6 2.9.5 2.1 1.1 1.5 2 1.5z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinejoin="round"
                  strokeWidth="1.2"
                />
              </svg>
            </a>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#0F1412] pb-6 pt-5 text-white sm:pb-9 sm:pt-7">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-[320px] rounded-full bg-[radial-gradient(closest-side,rgba(29,255,38,0.16),rgba(29,255,38,0))]"
        />
        <div className="relative mx-auto w-full max-w-[1200px] px-4 sm:px-6">
          <h1 className="break-keep text-[26px] font-bold leading-[1.2] tracking-[-0.04em] sm:text-[34px]">
            원두 발주, <span className="text-[#1DFF26]">세 번</span>이면 끝
          </h1>
          <p className="mt-2 max-w-[560px] break-keep text-[14.5px] leading-[1.6] text-[#D5DCD7] sm:text-[15.5px]">
            매장 고르고, 1·2·3박스 중 하나 누르고, 발주하기. 모두 부가세 포함 금액입니다.
          </p>
          {testMode ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#E5C86A]/50 bg-[#FFF7DD]/10 px-2.5 py-1 text-[12px] font-semibold text-[#FFE08A]">
              <span aria-hidden className="size-1.5 rounded-full bg-[#FFE08A]" />
              테스트 결제 모드 · 실제 금액이 청구되지 않습니다
            </p>
          ) : null}
        </div>
      </section>

      <div className="shop-content">
        <ShopApp testMode={testMode} />

        <footer className="mx-auto mt-8 w-full max-w-[1200px] px-4 pb-6 sm:px-6">
          <div className="border-t border-[var(--ls-line)] pt-4 text-[10.5px] leading-[1.7] text-[var(--ls-muted)]">
            <p className="font-semibold text-[#0F1412]">럭키스팟 본사 발주</p>
            <p className="mt-1">
              주문 문의 {ORDER_SUPPORT_PHONE} · 입금 확인 후 출고 · 단가는 부가세 포함
            </p>
            <p className="mt-1">
              원두 1박스(10kg) {formatPrice(200000)} · 더캐럿 파우더·농축 단가표 2026-11-19 기준
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
