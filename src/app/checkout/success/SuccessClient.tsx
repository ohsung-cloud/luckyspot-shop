"use client";

import * as React from "react";
import Link from "next/link";

import { formatPrice, getProductById, splitVat } from "@/data/products";
import { ORDER_SUPPORT_PHONE } from "@/features/order/utils";
import { bankName, formatDepositDue } from "@/features/payments/banks";
import { clearPaymentIntent, readPaymentIntent } from "@/features/payments/intent-storage";
import { writeLastOrder, writeRecentStore } from "@/features/shop/preferences";
import { useCartStore } from "@/stores/cartStore";

type ConfirmResult = {
  amount: number;
  approvedAt: string | null;
  count: number;
  items: { id: string; quantity: number }[];
  method: string;
  methodLabel: string;
  orderId: string;
  orderName: string;
  paymentStatus: string;
  receiptUrl: string | null;
  status: "paid" | "awaiting_deposit" | "pending";
  storeName: string | null;
  testMode: boolean;
  virtualAccount: {
    accountNumber: string | null;
    bankCode: string | null;
    customerName: string | null;
    dueDate: string | null;
  } | null;
};

type ViewState =
  | { kind: "checking" }
  | { kind: "done"; result: ConfirmResult }
  | { kind: "failed"; message: string; orderId: string | null };

export default function SuccessClient({
  amount,
  code,
  message,
  orderId,
  paymentKey,
}: {
  amount: string | null;
  code: string | null;
  message: string | null;
  orderId: string | null;
  paymentKey: string | null;
}) {
  const clearItems = useCartStore((state) => state.clearItems);
  const [state, setState] = React.useState<ViewState>({ kind: "checking" });
  const [copied, setCopied] = React.useState(false);
  const startedRef = React.useRef(false);

  const confirm = React.useCallback(async () => {
    if (code) {
      setState({
        kind: "failed",
        message: message?.trim() || "결제가 완료되지 않았습니다.",
        orderId,
      });
      return;
    }

    if (!paymentKey || !orderId || !amount) {
      setState({
        kind: "failed",
        message: "결제 정보가 주소에 없습니다. 발주 내역에서 상태를 확인해 주세요.",
        orderId,
      });
      return;
    }

    const intent = readPaymentIntent(orderId);

    if (!intent) {
      setState({
        kind: "failed",
        message:
          "이 브라우저에서 결제 준비 정보를 찾지 못했습니다. 결제가 승인되지 않았다면 금액은 청구되지 않습니다. 장바구니에서 다시 결제해 주세요.",
        orderId,
      });
      return;
    }

    try {
      const response = await fetch("/api/payments/confirm", {
        body: JSON.stringify({
          amount: Number(amount),
          items: intent.items,
          orderId,
          paymentKey,
          recipient: intent.recipient,
          token: intent.token,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const payload = (await response.json().catch(() => null)) as
        | ({ ok: true } & ConfirmResult)
        | { ok: false; error?: string; code?: string }
        | null;

      if (!response.ok || !payload || payload.ok !== true) {
        setState({
          kind: "failed",
          message:
            (payload && "error" in payload && payload.error) ||
            "결제를 확인하지 못했습니다. 잠시 후 발주 내역에서 상태를 확인해 주세요.",
          orderId,
        });
        return;
      }

      clearItems();
      clearPaymentIntent(orderId);

      writeLastOrder({
        count: payload.count,
        createdAt: new Date().toISOString(),
        items: payload.items,
        orderNumber: payload.orderId,
        storeCode: intent.recipient.storeCode,
        storeName: payload.storeName,
        totalAmount: payload.amount,
      });

      if (intent.recipient.storeCode && payload.storeName) {
        writeRecentStore({ code: intent.recipient.storeCode, label: payload.storeName });
      }

      setState({ kind: "done", result: payload });
    } catch {
      setState({
        kind: "failed",
        message: "네트워크 오류로 결제 확인에 실패했습니다. 잠시 후 발주 내역에서 상태를 확인해 주세요.",
        orderId,
      });
    }
  }, [amount, clearItems, code, message, orderId, paymentKey]);

  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void confirm();
  }, [confirm]);

  const result = state.kind === "done" ? state.result : null;
  const total = result?.amount ?? Number(amount ?? 0);
  const vat = splitVat(Number.isFinite(total) ? total : 0);
  const deposit = result?.virtualAccount ?? null;

  const copyAccount = async () => {
    if (!deposit) return;

    const text = `${bankName(deposit.bankCode)} ${deposit.accountNumber ?? ""} (예금주 ${deposit.customerName ?? ""}) ${formatPrice(total)}`;
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const headline =
    state.kind === "checking"
      ? "결제를 확인하고 있어요"
      : state.kind === "failed"
        ? "결제를 마치지 못했어요"
        : result?.status === "awaiting_deposit"
          ? "가상계좌가 발급됐어요"
          : "결제가 완료됐어요";

  const description =
    state.kind === "checking"
      ? "잠시만 기다려 주세요. 결제 승인을 확인하는 중입니다."
      : state.kind === "failed"
        ? "아래 안내를 확인하고 다시 시도해 주세요."
        : result?.status === "awaiting_deposit"
          ? "아래 계좌로 입금하시면 확인 후 출고됩니다."
          : "발주가 접수됐어요. 본사 확인 후 출고됩니다.";

  const summary = result
    ? result.items
        .map((item) => {
          const product = getProductById(item.id);
          return product ? `${product.name} ×${item.quantity}` : null;
        })
        .filter((text): text is string => Boolean(text))
    : [];

  return (
    <main className="min-h-screen bg-[#F4F5F6] pb-10">
      <section className="relative overflow-hidden bg-[#0F1412] px-4 pb-10 pt-7 text-white sm:px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 size-[280px] rounded-full bg-[radial-gradient(closest-side,rgba(29,255,38,0.18),rgba(29,255,38,0))]"
        />
        <div className="relative mx-auto w-full max-w-[560px]">
          {result?.testMode ? (
            <p className="mb-3 inline-flex rounded-full border border-[#E5C86A]/60 bg-[#FFF7DD]/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-[#FFE08A]">
              테스트 결제 모드 · 실제 금액이 청구되지 않았습니다
            </p>
          ) : null}

          <span
            aria-hidden
            className={`grid size-11 place-items-center rounded-full ${
              state.kind === "failed" ? "bg-[#3A2A2A] text-[#FFB4B4]" : "bg-[#1DFF26] text-[#0F1412]"
            }`}
          >
            {state.kind === "failed" ? (
              <svg height="20" viewBox="0 0 20 20" width="20">
                <path
                  d="M5 5l10 10M15 5L5 15"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2.2"
                />
              </svg>
            ) : (
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
            )}
          </span>

          <p className="mt-4 text-[10.5px] font-semibold tracking-[0.2em] text-[#7CE785]">
            {state.kind === "failed" ? "PAYMENT NOT COMPLETED" : "PAYMENT · ORDER"}
          </p>
          <h1 className="mt-1.5 break-keep text-[26px] font-semibold leading-[1.2] tracking-[-0.04em]">
            {headline}
          </h1>
          <p className="mt-2 break-keep text-[13px] leading-[1.65] text-[#A9B4AC]">{description}</p>
        </div>
      </section>

      <section className="mx-auto mt-4 w-full max-w-[560px] px-4 sm:px-6">
        <div className="rounded-[18px] bg-white p-5 shadow-[0_20px_50px_-30px_rgba(15,20,18,0.5)]">
          {state.kind === "checking" ? (
            <div className="space-y-3">
              <div className="h-4 w-24 animate-pulse rounded bg-[#EEF1EF]" />
              <div className="h-7 w-40 animate-pulse rounded bg-[#EEF1EF]" />
              <div className="h-3 w-full animate-pulse rounded bg-[#F4F5F6]" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-[#F4F5F6]" />
            </div>
          ) : null}

          {state.kind === "failed" ? (
            <div>
              <p
                className="rounded-[12px] border border-[#E4B4B4] bg-[#FDF2F2] px-3.5 py-3 text-[12.5px] leading-[1.6] text-[#8A2323]"
                role="alert"
              >
                {state.message}
              </p>
              {state.orderId ? (
                <p className="mt-3 text-[11.5px] text-[var(--ls-muted)]">
                  주문번호 <span className="font-semibold text-[#0F1412]">{state.orderId}</span>
                </p>
              ) : null}
              <p className="mt-3 text-[11.5px] leading-[1.65] text-[var(--ls-muted)]">
                결제가 완료되지 않았다면 금액은 청구되지 않습니다. 승인 여부가 불확실하면 발주 내역에서
                상태를 확인하시고, 문의는 {ORDER_SUPPORT_PHONE} 로 주세요.
              </p>
            </div>
          ) : null}

          {result ? (
            <>
              <div className="flex items-baseline justify-between">
                <p className="text-[12.5px] text-[var(--ls-muted)]">
                  {result.status === "awaiting_deposit" ? "입금할 금액" : "결제 금액"}
                </p>
                <p className="text-[24px] font-semibold tabular-nums tracking-[-0.03em] text-[#0F1412]">
                  {formatPrice(result.amount)}
                </p>
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-[var(--ls-muted)]">
                <span>공급가액 {formatPrice(vat.supply)}</span>
                <span>부가세 {formatPrice(vat.vat)}</span>
              </div>

              <dl className="mt-4 space-y-2.5 border-t border-[var(--ls-line)] pt-4">
                {result.status === "awaiting_deposit" && result.virtualAccount ? (
                  <>
                    <Row label="입금 은행" value={bankName(result.virtualAccount.bankCode)} />
                    <Row label="계좌번호" value={result.virtualAccount.accountNumber ?? "-"} />
                    <Row label="예금주" value={result.virtualAccount.customerName ?? "-"} />
                    <Row
                      label="입금 기한"
                      value={formatDepositDue(result.virtualAccount.dueDate) ?? "발급 후 24시간"}
                    />
                  </>
                ) : null}
                <Row label="결제수단" value={result.methodLabel} />
                <Row label="주문번호" value={result.orderId} />
                {result.storeName ? <Row label="받는 곳" value={result.storeName} /> : null}
                <Row label="품목" value={result.count > 0 ? `${result.items.length}종 ${result.count}개` : "-"} />
              </dl>

              {summary.length ? (
                <p className="mt-3 break-keep rounded-[10px] bg-[#F4F5F6] px-3 py-2.5 text-[11px] leading-[1.6] text-[var(--ls-muted)]">
                  {summary.slice(0, 3).join(" · ")}
                  {summary.length > 3 ? ` 외 ${summary.length - 3}종` : ""}
                </p>
              ) : null}

              <div className="mt-4 flex flex-col gap-2">
                {result.status === "awaiting_deposit" && result.virtualAccount ? (
                  <button
                    className="ls-focus flex h-[50px] w-full items-center justify-center rounded-[13px] bg-[#0F1412] text-[14px] font-semibold text-[#1DFF26] transition-colors hover:bg-[#1B241F]"
                    onClick={() => void copyAccount()}
                    type="button"
                  >
                    {copied ? "복사했어요" : "계좌번호와 금액 복사"}
                  </button>
                ) : null}

                {result.receiptUrl ? (
                  <a
                    className="ls-focus flex h-[46px] w-full items-center justify-center rounded-[13px] border border-[var(--ls-line-strong)] text-[12.5px] font-medium text-[#0F1412] transition-colors hover:border-[#0F1412]"
                    href={result.receiptUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    결제 영수증 보기
                  </a>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <Link
                    className="ls-focus flex h-[46px] items-center justify-center rounded-[13px] bg-[#EDFBEF] text-[12.5px] font-semibold text-[#0B5C2A] transition-colors hover:bg-[#DDF6E4]"
                    href="/orders"
                  >
                    내 발주 내역
                  </Link>
                  <Link
                    className="ls-focus flex h-[46px] items-center justify-center rounded-[13px] border border-[var(--ls-line-strong)] text-[12.5px] font-medium text-[#0F1412] transition-colors hover:border-[#0F1412]"
                    href="/"
                  >
                    다시 발주하기
                  </Link>
                </div>
              </div>
            </>
          ) : null}

          {state.kind === "failed" ? (
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
          ) : null}
        </div>

        <ul className="mt-4 space-y-1.5 px-1 text-[11.5px] leading-[1.7] text-[var(--ls-muted)]">
          {result?.status === "awaiting_deposit" ? (
            <li>· 입금 기한이 지나면 가상계좌가 닫힙니다. 기한 안에 입금해 주세요.</li>
          ) : null}
          <li>· 결제·취소·환불 문의는 {ORDER_SUPPORT_PHONE} 로 연락해 주세요.</li>
          <li>· 배송 일정은 본사 확인 후 순차적으로 안내드려요.</li>
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
      <dt className="shrink-0 text-[12.5px] text-[var(--ls-muted)]">{label}</dt>
      <dd className="break-all text-right text-[13px] font-medium tabular-nums text-[#0F1412]">
        {value}
      </dd>
    </div>
  );
}
