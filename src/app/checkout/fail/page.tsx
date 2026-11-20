import type { Metadata } from "next";
import Link from "next/link";

import { ORDER_SUPPORT_PHONE } from "@/features/order/utils";
import { isTossTestMode } from "@/features/payments/keys";

export const metadata: Metadata = {
  title: "결제 실패 | 럭키스팟 발주",
  description: "럭키스팟 점주 발주 결제가 완료되지 않았습니다.",
};

/**
 * 결제 실패·취소 페이지 (/checkout/fail)
 *
 * 토스 결제창이 실패하면 code·message·orderId 를 붙여 이 페이지로 보낸다.
 * 이 시점에는 승인(capture)을 하지 않았으므로 금액은 청구되지 않는다.
 */

const MESSAGES: Record<string, string> = {
  PAY_PROCESS_ABORTED: "결제 과정이 중단됐습니다. 처음부터 다시 시도해 주세요.",
  REJECT_CARD_COMPANY: "카드사가 결제를 거절했습니다. 다른 카드나 다른 결제수단을 이용해 주세요.",
  INVALID_CARD_EXPIRATION: "카드 유효기간이 올바르지 않습니다.",
  INVALID_PASSWORD: "카드 비밀번호가 올바르지 않습니다.",
  EXCEED_MAX_AMOUNT: "1회 결제 한도를 넘은 금액입니다. 본사로 문의해 주세요.",
  NOT_FOUND_PAYMENT_SESSION: "결제 시간이 만료됐습니다. 다시 시도해 주세요.",
  USER_CANCEL: "결제를 취소하셨습니다. 장바구니는 그대로 남아 있어요.",
  TOSS_PAYMENT_FAIL: "결제수단 인증에 실패했습니다. 다시 시도해 주세요.",
};

function friendlyMessage(code: string | null, message: string | null) {
  if (code && MESSAGES[code]) return MESSAGES[code];

  const raw = (message ?? "").trim();

  if (/취소|cancel/i.test(raw)) return "결제를 취소하셨습니다. 장바구니는 그대로 남아 있어요.";
  if (raw.length > 0 && raw.length <= 120) return raw;

  return "결제를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export default async function CheckoutFailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first === "string" ? first : null;
  };

  const code = read("code");
  const message = read("message");
  const orderId = read("orderId");
  const testMode = isTossTestMode();

  return (
    <main className="min-h-screen bg-[#F4F5F6] pb-10">
      <section className="relative overflow-hidden bg-[#0F1412] px-4 pb-10 pt-7 text-white sm:px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 size-[280px] rounded-full bg-[radial-gradient(closest-side,rgba(255,120,120,0.16),rgba(255,120,120,0))]"
        />
        <div className="relative mx-auto w-full max-w-[560px]">
          {testMode ? (
            <p className="mb-3 inline-flex rounded-full border border-[#E5C86A]/60 px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-[#FFE08A]">
              테스트 결제 모드 · 실제 금액이 청구되지 않았습니다
            </p>
          ) : null}

          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-full bg-[#3A2A2A] text-[#FFB4B4]"
          >
            <svg height="20" viewBox="0 0 20 20" width="20">
              <path
                d="M5 5l10 10M15 5L5 15"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2.2"
              />
            </svg>
          </span>

          <p className="mt-4 text-[10.5px] font-semibold tracking-[0.2em] text-[#7CE785]">
            PAYMENT NOT COMPLETED
          </p>
          <h1 className="mt-1.5 break-keep text-[26px] font-semibold leading-[1.2] tracking-[-0.04em]">
            결제를 마치지 못했어요
          </h1>
          <p className="mt-2 break-keep text-[13px] leading-[1.65] text-[#A9B4AC]">
            담아 둔 품목은 그대로예요. 다시 결제하거나 다른 결제수단을 선택해 주세요.
          </p>
        </div>
      </section>

      <section className="mx-auto mt-4 w-full max-w-[560px] px-4 sm:px-6">
        <div className="rounded-[18px] bg-white p-5 shadow-[0_20px_50px_-30px_rgba(15,20,18,0.5)]">
          <p className="rounded-[12px] border border-[#E4B4B4] bg-[#FDF2F2] px-3.5 py-3 text-[12.5px] leading-[1.6] text-[#8A2323]">
            {friendlyMessage(code, message)}
          </p>

          <dl className="mt-4 space-y-2 border-t border-[var(--ls-line)] pt-4 text-[12px]">
            {orderId ? (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-[var(--ls-muted)]">주문번호</dt>
                <dd className="break-all text-right font-medium tabular-nums text-[#0F1412]">
                  {orderId}
                </dd>
              </div>
            ) : null}
            {code ? (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-[var(--ls-muted)]">오류 코드</dt>
                <dd className="break-all text-right font-medium text-[#0F1412]">{code}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-4 flex flex-col gap-2">
            <Link
              className="ls-focus flex h-[50px] w-full items-center justify-center rounded-[13px] bg-[#0F1412] text-[14px] font-semibold text-[#1DFF26] transition-colors hover:bg-[#1B241F]"
              href="/"
            >
              장바구니로 돌아가 다시 결제
            </Link>
            <div className="grid grid-cols-2 gap-2">
              <Link
                className="ls-focus flex h-[46px] items-center justify-center rounded-[13px] border border-[var(--ls-line-strong)] text-[12.5px] font-medium text-[#0F1412]"
                href="/orders"
              >
                발주 내역 조회
              </Link>
              <a
                className="ls-focus flex h-[46px] items-center justify-center rounded-[13px] border border-[var(--ls-line-strong)] text-[12.5px] font-medium text-[#0F1412]"
                href={`tel:${ORDER_SUPPORT_PHONE.replace(/\D/g, "")}`}
              >
                문의 {ORDER_SUPPORT_PHONE}
              </a>
            </div>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 px-1 text-[11.5px] leading-[1.7] text-[var(--ls-muted)]">
          <li>· 결제가 완료되지 않았으므로 금액은 청구되지 않습니다.</li>
          <li>· 카드 승인 문자를 받았다면 {ORDER_SUPPORT_PHONE} 로 바로 연락해 주세요.</li>
        </ul>
      </section>
    </main>
  );
}
