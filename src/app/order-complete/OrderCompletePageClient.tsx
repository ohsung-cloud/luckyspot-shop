"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { formatPrice, splitVat } from "@/data/products";
import {
  ORDER_ACCOUNT_NUMBER,
  ORDER_BANK_NAME,
  ORDER_SUPPORT_PHONE,
  generateOrderId,
} from "@/features/order/utils";

type OrderCompletePageClientProps = {
  orderId: string | null;
  totalPrice: string | null;
  itemCount: string | null;
};

function extractAmount(value: string | null) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) return 0;

  return parsed;
}

function extractCount(value: string | null) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) return 0;

  return Math.round(parsed);
}

export function OrderCompletePageClient({
  orderId,
  totalPrice,
  itemCount,
}: OrderCompletePageClientProps) {
  const router = useRouter();
  const [fallbackOrderId] = React.useState(() => generateOrderId());
  const [copied, setCopied] = React.useState(false);

  const resolvedOrderId = orderId ?? fallbackOrderId;
  const amount = extractAmount(totalPrice);
  const count = extractCount(itemCount);
  const vat = splitVat(amount);

  const copyPayload = `${ORDER_BANK_NAME} ${ORDER_ACCOUNT_NUMBER} / ${formatPrice(amount)}`;
  const sharePayload = [
    `주문번호: ${resolvedOrderId}`,
    `입금은행: ${ORDER_BANK_NAME} ${ORDER_ACCOUNT_NUMBER}`,
    `주문 금액: ${formatPrice(amount)}`,
    `주문취소·기타문의 ${ORDER_SUPPORT_PHONE}`,
  ].join("\n");

  const handleCopyAccount = async () => {
    try {
      await navigator.clipboard?.writeText(copyPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: sharePayload, title: "럭키스팟 발주 정보" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        throw error;
      }
      return;
    }

    await navigator.clipboard?.writeText(sharePayload);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <main className="min-h-screen bg-[#F4F5F6] pb-10">
      <section className="relative overflow-hidden bg-[#0F1412] px-4 pb-10 pt-8 text-white sm:px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 size-[280px] rounded-full bg-[radial-gradient(closest-side,rgba(29,255,38,0.18),rgba(29,255,38,0))]"
        />
        <div className="relative mx-auto w-full max-w-[560px]">
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-full bg-[#1DFF26] text-[#0F1412]"
          >
            <svg height="22" viewBox="0 0 24 24" width="22">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.4"
              />
            </svg>
          </span>

          <p className="mt-4 text-[10.5px] font-semibold tracking-[0.2em] text-[#7CE785]">
            ORDER RECEIVED
          </p>
          <h1 className="mt-1.5 break-keep text-[27px] font-semibold leading-[1.2] tracking-[-0.04em]">
            주문이 접수되었어요
          </h1>
          <p className="mt-2 break-keep text-[13px] leading-[1.65] text-[#A9B4AC]">
            아래 계좌로 입금하시면 확인 후 출고됩니다.
            <br />
            주문번호를 함께 남겨주세요.
          </p>
        </div>
      </section>

      <section className="mx-auto -mt-5 w-full max-w-[560px] px-4 sm:px-6">
        <div className="rounded-[18px] bg-white p-5 shadow-[0_20px_50px_-30px_rgba(15,20,18,0.5)]">
          <dl className="space-y-2.5">
            <Row label="주문번호" value={resolvedOrderId} />
            <Row label="품목" value={count > 0 ? `${count}개` : "-"} />
            <Row label="입금은행" value={ORDER_BANK_NAME} />
            <Row label="계좌번호" value={ORDER_ACCOUNT_NUMBER} />
          </dl>

          <div className="mt-4 rounded-[14px] bg-[#F4F5F6] p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[12.5px] text-[var(--ls-muted)]">결제 필요 금액</p>
              <p className="text-[22px] font-semibold tabular-nums tracking-[-0.03em] text-[#0F1412]">
                {formatPrice(amount)}
              </p>
            </div>
            <div className="mt-2 flex justify-between border-t border-[var(--ls-line)] pt-2 text-[11.5px] text-[var(--ls-muted)]">
              <span>공급가액 {formatPrice(vat.supply)}</span>
              <span>부가세 {formatPrice(vat.vat)}</span>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button
              className="ls-focus flex h-[52px] w-full items-center justify-center gap-2 rounded-[13px] bg-[#0F1412] text-[14.5px] font-semibold text-[#1DFF26] transition-colors hover:bg-[#1B241F]"
              onClick={() => void handleCopyAccount()}
              type="button"
            >
              {copied ? "복사했어요" : "계좌번호와 금액 복사"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="ls-focus flex h-[46px] items-center justify-center rounded-[13px] border border-[var(--ls-line-strong)] text-[12.5px] font-medium text-[#0F1412] transition-colors hover:border-[#0F1412]"
                onClick={() => void handleShare()}
                type="button"
              >
                주문 정보 공유
              </button>
              <button
                className="ls-focus flex h-[46px] items-center justify-center rounded-[13px] border border-[var(--ls-line-strong)] text-[12.5px] font-medium text-[#0F1412] transition-colors hover:border-[#0F1412]"
                onClick={() => router.push("/")}
                type="button"
              >
                다시 발주하기
              </button>
            </div>
            <Link
              className="ls-focus flex h-[46px] w-full items-center justify-center rounded-[13px] bg-[#EDFBEF] text-[12.5px] font-semibold text-[#0B5C2A] transition-colors hover:bg-[#DDF6E4]"
              href="/orders"
            >
              내 발주 내역 조회
            </Link>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 px-1 text-[11.5px] leading-[1.7] text-[var(--ls-muted)]">
          <li>· 입금자명이 주문자와 다르면 고객센터로 알려주세요.</li>
          <li>· 주문취소·변경은 {ORDER_SUPPORT_PHONE}로 연락해 주세요.</li>
          <li>· 배송 일정은 입금 확인 후 순차적으로 안내드려요.</li>
        </ul>

        <div className="mt-4 rounded-[14px] border border-[var(--ls-line)] bg-white px-4 py-3 text-center">
          <a
            className="text-[11.5px] font-medium text-[var(--ls-muted)] underline underline-offset-2 hover:text-[#0F1412]"
            href={`tel:${ORDER_SUPPORT_PHONE.replace(/\D/g, "")}`}
          >
            계산서 발행·문의 {ORDER_SUPPORT_PHONE}
          </a>
        </div>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[12.5px] text-[var(--ls-muted)]">{label}</dt>
      <dd className="text-right text-[13px] font-medium tabular-nums text-[#0F1412]">{value}</dd>
    </div>
  );
}
