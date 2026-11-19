"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { formatPrice } from "@/data/products";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STEPS,
  ORDER_STATUS_TONES,
  type OrderStatus,
} from "@/features/admin/status";
import { savePendingReorder } from "@/features/shop/preferences";

type StoreOption = { code: string; label: string };

type LookupOrder = {
  createdAt: string;
  itemText: string | null;
  /** 지금 카탈로그로 다시 담을 수 있는 구성 */
  items: { id: string; name: string; quantity: number }[];
  /** 발주 당시 품목 종류 수 */
  lineCount: number;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
};

type LookupResponse = {
  error?: string;
  ok?: boolean;
  orders?: LookupOrder[];
  store?: { code: string; label: string };
};

type Mode = "phone" | "order";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Seoul",
});

function formatOrderTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return dateFormatter.format(date);
}

function stepIndex(status: OrderStatus) {
  if (status === "cancelled") return -1;
  return ORDER_STATUS_STEPS.findIndex((step) => step.key === status);
}

export default function OrdersLookupClient({ stores }: { stores: StoreOption[] }) {
  const router = useRouter();
  const [storeCode, setStoreCode] = React.useState("");
  const [mode, setMode] = React.useState<Mode>("phone");
  const [phoneLast4, setPhoneLast4] = React.useState("");
  const [orderNumber, setOrderNumber] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ orders: LookupOrder[]; store: StoreOption } | null>(
    null,
  );
  const [reorderError, setReorderError] = React.useState<string | null>(null);

  /**
   * 원클릭 재주문 — 이 발주의 품목·수량을 그대로 넘기고 메인 화면으로 이동한다.
   * 넘기는 상자는 브라우저 저장소(localStorage)이고, 주소·서버에는 구성만 가지 않는다.
   */
  const handleReorder = (order: LookupOrder, store: StoreOption) => {
    if (!order.items.length) {
      setReorderError(
        "이 발주는 다시 담을 수 있는 품목이 없어요. 품목이 단종되었을 수 있으니 목록에서 담아 주세요.",
      );
      return;
    }

    setReorderError(null);

    const saved = savePendingReorder(order.items, store);

    if (!saved) {
      setReorderError("브라우저 저장 공간이 막혀 다시 담기를 쓸 수 없어요. 시크릿 모드를 끄고 다시 시도해 주세요.");
      return;
    }

    router.push("/?reorder=1");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;

    if (!storeCode) {
      setError("지점을 먼저 선택해 주세요.");
      return;
    }

    if (mode === "phone" && phoneLast4.length !== 4) {
      setError("주문자 휴대폰 뒤 4자리를 입력해 주세요.");
      return;
    }

    if (mode === "order" && orderNumber.trim().length < 6) {
      setError("주문번호를 입력해 주세요. 예) 261119-482K");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/orders/lookup", {
        body: JSON.stringify(
          mode === "phone"
            ? { phoneLast4, storeCode }
            : { orderNumber: orderNumber.trim(), storeCode },
        ),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as LookupResponse | null;

      if (!response.ok || payload?.ok !== true || !Array.isArray(payload.orders)) {
        setError(payload?.error ?? "발주 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setResult(null);
        return;
      }

      const store = stores.find((item) => item.code === storeCode) ?? payload.store;
      setResult({
        orders: payload.orders,
        store: store ?? { code: storeCode, label: "선택한 지점" },
      });
    } catch {
      setError("네트워크 오류로 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setResult(null);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F4F5F6] pb-16">
      <header className="bg-[#0F1412] text-white">
        <div className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <Link className="flex items-center gap-2.5" href="/">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-[8px] bg-[#1DFF26] text-[13px] font-bold leading-none text-[#0F1412]"
            >
              L
            </span>
            <div className="leading-none">
              <p className="text-[12px] font-semibold tracking-[0.2em]">LUCKY SPOT</p>
              <p className="mt-1 text-[9px] font-medium tracking-[0.18em] text-[#7C867E]">
                STORE ORDER
              </p>
            </div>
          </Link>

          <Link
            className="rounded-full border border-[#2C3730] px-3 py-1.5 text-[11px] font-medium text-[#C8D0CA] transition-colors hover:border-[#1DFF26] hover:text-white"
            href="/"
          >
            발주하러 가기
          </Link>
        </div>
      </header>

      <section className="bg-[#0F1412] px-4 pb-12 pt-4 text-white sm:px-6">
        <div className="mx-auto w-full max-w-[720px]">
          <p className="text-[10.5px] font-semibold tracking-[0.2em] text-[#7CE785]">
            ORDER LOOKUP
          </p>
          <h1 className="mt-2 break-keep text-[26px] font-semibold leading-[1.2] tracking-[-0.04em]">
            내 발주 내역 조회
          </h1>
          <p className="mt-2 break-keep text-[12.5px] leading-[1.7] text-[#A9B4AC]">
            지점을 고르고 휴대폰 뒤 4자리(또는 주문번호)를 넣으면 처리 상태를 바로 확인할 수
            있어요. 지난 발주는 <span className="font-semibold text-[#7CE785]">다시 담기</span> 한 번으로
            그 구성 그대로 장바구니에 들어갑니다.
          </p>
        </div>
      </section>

      <section className="mx-auto -mt-7 w-full max-w-[720px] px-4 sm:px-6">
        <form className="rounded-[18px] bg-white p-5 shadow-[0_20px_50px_-30px_rgba(15,20,18,0.5)]" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-[12px] font-semibold text-[#0F1412]">지점</span>
            <select
              className="ls-focus mt-1.5 h-12 w-full rounded-[12px] border border-[var(--ls-line-strong)] bg-white px-3 text-[14px] text-[#0F1412] outline-none"
              onChange={(event) => {
                setStoreCode(event.target.value);
                setResult(null);
              }}
              value={storeCode}
            >
              <option value="">지점을 선택해 주세요</option>
              {stores.map((store) => (
                <option key={store.code} value={store.code}>
                  {store.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4">
            <div className="flex gap-1.5">
              {(
                [
                  { key: "phone", label: "휴대폰 뒤 4자리" },
                  { key: "order", label: "주문번호" },
                ] as const
              ).map((tab) => (
                <button
                  aria-pressed={mode === tab.key}
                  className={`ls-focus h-8 rounded-full px-3 text-[11.5px] font-medium transition-colors ${
                    mode === tab.key
                      ? "bg-[#0F1412] text-[#1DFF26]"
                      : "border border-[var(--ls-line-strong)] text-[#0F1412] hover:border-[#0F1412]"
                  }`}
                  key={tab.key}
                  onClick={() => {
                    setMode(tab.key);
                    setError(null);
                  }}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {mode === "phone" ? (
              <label className="mt-2 block">
                <span className="sr-only">주문자 휴대폰 뒤 4자리</span>
                <input
                  autoComplete="off"
                  className="ls-focus mt-1.5 h-12 w-full rounded-[12px] border border-[var(--ls-line-strong)] px-3.5 text-[15px] tabular-nums tracking-[0.2em] outline-none placeholder:tracking-normal placeholder:text-[var(--ls-muted)]"
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(event) => setPhoneLast4(event.target.value.replace(/\D/g, ""))}
                  placeholder="예) 7189"
                  type="text"
                  value={phoneLast4}
                />
              </label>
            ) : (
              <label className="mt-2 block">
                <span className="sr-only">주문번호</span>
                <input
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="ls-focus mt-1.5 h-12 w-full rounded-[12px] border border-[var(--ls-line-strong)] px-3.5 font-mono text-[14px] uppercase outline-none placeholder:font-sans placeholder:normal-case placeholder:text-[var(--ls-muted)]"
                  maxLength={16}
                  onChange={(event) => setOrderNumber(event.target.value)}
                  placeholder="예) 261119-482K"
                  type="text"
                  value={orderNumber}
                />
              </label>
            )}
          </div>

          {error ? (
            <p aria-live="polite" className="mt-3 rounded-[10px] bg-[#FDECEC] px-3 py-2 text-[11.5px] leading-[1.6] text-[#9B1C1C]">
              {error}
            </p>
          ) : null}

          <button
            className="ls-focus mt-4 flex h-12 w-full items-center justify-center rounded-[12px] bg-[#0F1412] text-[14px] font-semibold text-[#1DFF26] transition-colors hover:bg-[#1B241F] disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? "조회 중…" : "발주 내역 조회"}
          </button>

          <p className="mt-3 text-[10.5px] leading-[1.6] text-[var(--ls-muted)]">
            선택한 지점의 발주만 보여드립니다. 다른 지점의 정보는 조회되지 않아요.
          </p>
        </form>

        {result ? (
          <section aria-live="polite" className="mt-5">
            <div className="flex items-end justify-between">
              <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#0F1412]">
                {result.store.label}
              </h2>
              <p className="text-[11px] tabular-nums text-[var(--ls-muted)]">
                {result.orders.length}건
              </p>
            </div>

            {reorderError ? (
              <p className="mt-2 rounded-[10px] bg-[#FDECEC] px-3 py-2 text-[11.5px] leading-[1.6] text-[#9B1C1C]">
                {reorderError}
              </p>
            ) : null}

            {result.orders.length === 0 ? (
              <div className="mt-2 rounded-[16px] border border-dashed border-[var(--ls-line-strong)] bg-white px-5 py-10 text-center">
                <p className="text-[13.5px] font-semibold text-[#0F1412]">조회된 발주가 없어요</p>
                <p className="mt-1 text-[11.5px] leading-[1.7] text-[var(--ls-muted)]">
                  지점과 번호를 다시 확인해 주세요.
                  <br />
                  최근 6개월 내 발주만 조회됩니다.
                </p>
              </div>
            ) : (
              <ul className="mt-2 space-y-2.5">
                {result.orders.map((order) => (
                  <li className="rounded-[16px] border border-[var(--ls-line)] bg-white p-4" key={order.orderNumber}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[12.5px] font-semibold text-[#0F1412]">
                        {order.orderNumber}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-[3px] text-[10.5px] font-semibold ${ORDER_STATUS_TONES[order.status]}`}
                      >
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                    </div>

                    <p className="mt-1 text-[11px] tabular-nums text-[var(--ls-muted)]">
                      {formatOrderTime(order.createdAt)}
                    </p>

                    {order.status === "cancelled" ? (
                      <p className="mt-2 rounded-[10px] bg-[#F1F3F2] px-3 py-2 text-[11.5px] text-[#6B746D]">
                        취소된 발주입니다. 다시 발주해 주세요.
                      </p>
                    ) : (
                      <ol className="mt-3 flex items-center gap-1">
                        {ORDER_STATUS_STEPS.map((step, index) => {
                          const current = stepIndex(order.status);
                          const done = index <= current;

                          return (
                            <li className="flex flex-1 items-center gap-1" key={step.key}>
                              <div className="flex-1">
                                <span
                                  className={`block h-[3px] rounded-full ${
                                    done ? "bg-[#0B5C2A]" : "bg-[#E6E9E7]"
                                  }`}
                                />
                                <span
                                  className={`mt-1 block text-[10px] ${
                                    done
                                      ? "font-semibold text-[#0B5C2A]"
                                      : "text-[var(--ls-muted-light)]"
                                  }`}
                                >
                                  {step.label}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}

                    <p className="mt-3 line-clamp-3 break-words text-[11.5px] leading-[1.65] text-[#3B4740]">
                      {order.itemText ?? "품목 정보 없음"}
                    </p>

                    <div className="mt-2 flex items-baseline justify-between border-t border-[var(--ls-line)] pt-2">
                      <span className="text-[11px] text-[var(--ls-muted)]">합계 (VAT 포함)</span>
                      <span className="text-[15px] font-semibold tabular-nums text-[#0F1412]">
                        {formatPrice(order.totalAmount)}
                      </span>
                    </div>

                    {order.status !== "cancelled" && order.items.length > 0 ? (
                      <button
                        className="ls-focus mt-2.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-[11px] bg-[#0F1412] text-[12.5px] font-semibold text-[#1DFF26] transition-colors hover:bg-[#1B241F]"
                        onClick={() => handleReorder(order, result.store)}
                        type="button"
                      >
                        <svg aria-hidden height="12" viewBox="0 0 14 14" width="12">
                          <path
                            d="M2.2 5.4A4.8 4.8 0 0 1 11 4.2M11.8 8.6A4.8 4.8 0 0 1 3 9.8"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeWidth="1.5"
                          />
                          <path
                            d="M9.6 1.6l1.6 2.6-2.9.5M4.4 12.4L2.8 9.8l2.9-.5"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                          />
                        </svg>
                        이 구성 그대로 다시 발주
                        <span className="font-normal text-[#7CE785]">
                          {order.items.length}종{" "}
                          {order.items.reduce((sum, item) => sum + item.quantity, 0)}개
                        </span>
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <ul className="mt-6 space-y-1.5 px-1 text-[11px] leading-[1.7] text-[var(--ls-muted)]">
          <li>· 접수대기 → 본사승인 → 출고완료 순서로 진행됩니다.</li>
          <li>· "다시 담기"는 그때의 품목·수량을 담고, 단가는 오늘 카탈로그 단가로 다시 계산됩니다.</li>
          <li>· 주문번호를 모르면 발주 완료 화면이나 완료 문자를 확인해 주세요.</li>
          <li>· 내역이 보이지 않으면 본사(1551-7157)로 문의해 주세요.</li>
        </ul>
      </section>
    </main>
  );
}
