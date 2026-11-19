import type { Metadata } from "next";

import ShopApp from "@/components/shop/ShopApp";
import { formatPrice, shopCategories } from "@/data/products";
import { ORDER_SUPPORT_PHONE } from "@/features/order/utils";

export const metadata: Metadata = {
  title: "점주 발주 | 럭키스팟",
  description:
    "럭키스팟 점주 발주 페이지. 원두·파우더·시럽·컵·부자재·가구까지 2026년 11월 최신 단가로 한 번에 발주하세요.",
};

const productCount = shopCategories.reduce(
  (sum, category) => sum + category.products.length,
  0,
);

export default function HomePage() {
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
              <p className="mt-1 text-[9.5px] font-medium tracking-[0.18em] text-[#7C867E]">
                STORE ORDER
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <a
              className="flex items-center gap-1 rounded-full bg-[#1DFF26] px-3 py-1.5 text-[11px] font-semibold text-[#0F1412] transition-colors hover:bg-[#7CE785]"
              href="/orders"
            >
              내 발주 내역 조회
            </a>
            <a
              className="hidden items-center gap-1.5 rounded-full border border-[#2C3730] px-3 py-1.5 text-[11px] font-medium text-[#C8D0CA] transition-colors hover:border-[#1DFF26] hover:text-white sm:flex"
              href={`tel:${ORDER_SUPPORT_PHONE.replace(/\D/g, "")}`}
            >
              <svg aria-hidden height="11" viewBox="0 0 12 12" width="11">
                <path
                  d="M3 1.5h2l.8 2.2-1.2.9a7 7 0 0 0 2.8 2.8l.9-1.2 2.2.8v2c0 .8-.6 1.5-1.4 1.4C5.6 11 1 6.4.6 2.9.5 2.1 1.1 1.5 2 1.5z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinejoin="round"
                  strokeWidth="1.1"
                />
              </svg>
              주문 문의 {ORDER_SUPPORT_PHONE}
            </a>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#0F1412] pb-7 pt-6 text-white sm:pb-9 sm:pt-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-[320px] rounded-full bg-[radial-gradient(closest-side,rgba(29,255,38,0.16),rgba(29,255,38,0))]"
        />
        <div className="relative mx-auto w-full max-w-[1200px] px-4 sm:px-6">
          <p className="text-[10.5px] font-semibold tracking-[0.2em] text-[#7CE785]">
            STORE ORDER · 2026.11 단가
          </p>
          <h1 className="mt-2.5 break-keep text-[28px] font-semibold leading-[1.15] tracking-[-0.04em] sm:text-[38px]">
            필요한 것만,
            <br className="sm:hidden" /> <span className="text-[#1DFF26]">정확한 단가</span>로
            발주하세요
          </h1>
          <p className="mt-3 max-w-[560px] break-keep text-[13px] leading-[1.65] text-[#A9B4AC] sm:text-[14px]">
            원두·파우더·시럽부터 컵·부자재·가구·식물까지 한 화면에 모았습니다. 모든 금액은
            부가세 포함이고, 수량을 담으면 합계가 바로 계산됩니다.
          </p>

          <dl className="mt-5 grid grid-cols-3 gap-2 sm:max-w-[520px]">
            {[
              { label: "발주 품목", value: `${productCount}종` },
              { label: "단가 기준", value: "11.19" },
              { label: "표시 금액", value: "VAT 포함" },
            ].map((item) => (
              <div
                className="rounded-[12px] border border-[#252E28] bg-[#131A16] px-3 py-2.5"
                key={item.label}
              >
                <dt className="text-[9.5px] font-medium tracking-[0.06em] text-[#7C867E]">
                  {item.label}
                </dt>
                <dd className="mt-1 text-[13px] font-semibold text-white">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="shop-content">
        <ShopApp />

        <footer className="mx-auto mt-8 w-full max-w-[1200px] px-4 pb-6 sm:px-6">
          <div className="border-t border-[var(--ls-line)] pt-4 text-[10.5px] leading-[1.7] text-[var(--ls-muted)]">
            <p className="font-semibold text-[#0F1412]">럭키스팟 본사 발주</p>
            <p className="mt-1">
              주문 문의 {ORDER_SUPPORT_PHONE} · 입금 확인 후 출고 · 단가는 부가세 포함
            </p>
            <p className="mt-1">
              원두 {formatPrice(20000)}/kg · 더캐럿 파우더·농축 단가표 2026-11-19 기준
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
