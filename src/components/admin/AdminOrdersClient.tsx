"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { AdminOrder } from "@/features/admin/orders";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TABS,
  ORDER_STATUS_TONES,
  type OrderStatus,
} from "@/features/admin/status";
import { formatPrice } from "@/data/products";

type LoadErrorReason = "not_configured" | "table_missing" | "request_failed" | "timeout" | null;

type Filter = OrderStatus | "all";

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

function nextActionLabel(status: OrderStatus) {
  if (status === "pending" || status === "paid" || status === "awaiting_deposit") return "승인";
  if (status === "confirmed") return "출고 완료";
  return null;
}

const LOAD_ERRORS: Record<Exclude<LoadErrorReason, null>, string> = {
  not_configured: "Supabase 환경변수(SUPABASE_URL·SUPABASE_SECRET_KEY)가 없어 발주를 불러오지 못했습니다.",
  table_missing:
    "shop_orders 테이블이 아직 없습니다. notes/supabase-luckyspot-schema.sql 을 Supabase SQL Editor에서 실행해 주세요.",
  request_failed: "발주 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.",
  timeout: "Supabase 응답이 느려 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.",
};

export default function AdminOrdersClient({
  initialOrders,
  loadError,
}: {
  initialOrders: AdminOrder[];
  loadError: LoadErrorReason;
}) {
  const router = useRouter();
  const [orders, setOrders] = React.useState<AdminOrder[]>(initialOrders);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [notice, setNotice] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const counts = React.useMemo(() => {
    const base: Record<OrderStatus, number> = {
      awaiting_deposit: 0,
      cancelled: 0,
      confirmed: 0,
      paid: 0,
      pending: 0,
      shipped: 0,
    };
    orders.forEach((order) => {
      base[order.status] += 1;
    });
    return base;
  }, [orders]);

  const visible = filter === "all" ? orders : orders.filter((order) => order.status === filter);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/orders?limit=200", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; orders?: AdminOrder[]; error?: string }
        | null;

      if (!response.ok || payload?.ok !== true || !Array.isArray(payload.orders)) {
        setNotice({ kind: "error", text: payload?.error ?? "목록을 불러오지 못했습니다." });
        return;
      }

      setOrders(payload.orders);
    } catch {
      setNotice({ kind: "error", text: "네트워크 오류로 목록을 불러오지 못했습니다." });
    } finally {
      setRefreshing(false);
    }
  }, []);

  const changeStatus = React.useCallback(async (order: AdminOrder, status: OrderStatus) => {
    setBusyId(order.id);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/orders", {
        body: JSON.stringify({ id: order.id, status }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; order?: AdminOrder; error?: string }
        | null;

      if (!response.ok || payload?.ok !== true || !payload.order) {
        setNotice({ kind: "error", text: payload?.error ?? "상태를 바꾸지 못했습니다." });
        return;
      }

      const updated = payload.order;
      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice({
        kind: "ok",
        text: `${updated.orderNumber} → ${ORDER_STATUS_LABELS[updated.status]}(으)로 바꿨습니다.`,
      });
    } catch {
      setNotice({ kind: "error", text: "네트워크 오류로 상태를 바꾸지 못했습니다." });
    } finally {
      setBusyId(null);
    }
  }, []);

  const logout = async () => {
    try {
      await fetch("/api/admin/auth", {
        body: JSON.stringify({ logout: true }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  };

  return (
    <main className="min-h-screen bg-[#F4F5F6] pb-16">
      <header className="bg-[#0F1412] text-white">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-[8px] bg-[#1DFF26] text-[13px] font-bold leading-none text-[#0F1412]"
            >
              L
            </span>
            <div className="leading-none">
              <p className="text-[12px] font-semibold tracking-[0.2em]">LUCKY SPOT</p>
              <p className="mt-1 text-[9px] font-medium tracking-[0.18em] text-[#7C867E]">
                HEADQUARTERS · ORDER ADMIN
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              className="rounded-full border border-[#2C3730] px-3 py-1.5 text-[11px] font-medium text-[#C8D0CA] transition-colors hover:border-[#1DFF26] hover:text-white"
              href="/orders"
            >
              점주 조회 화면
            </a>
            <button
              className="ls-focus rounded-full border border-[#2C3730] px-3 py-1.5 text-[11px] font-medium text-[#C8D0CA] transition-colors hover:border-[#1DFF26] hover:text-white"
              onClick={() => void logout()}
              type="button"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1100px] px-4 pt-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[0.18em] text-[var(--ls-green-ink)]">
              ORDER MANAGEMENT
            </p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.04em] text-[#0F1412]">
              발주 관리
            </h1>
            <p className="mt-1 text-[12px] text-[var(--ls-muted)]">
              최근 발주 200건 · 승인하면 점주 조회 화면에 바로 반영됩니다.
            </p>
          </div>
          <button
            className="ls-focus flex h-10 items-center gap-1.5 rounded-[11px] border border-[var(--ls-line-strong)] bg-white px-3.5 text-[12px] font-semibold text-[#0F1412] transition-colors hover:border-[#0F1412] disabled:opacity-60"
            disabled={refreshing}
            onClick={() => void refresh()}
            type="button"
          >
            <svg aria-hidden height="12" viewBox="0 0 12 12" width="12">
              <path
                d="M10 6a4 4 0 1 1-1.2-2.8M10 1.5V4H7.5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.4"
              />
            </svg>
            {refreshing ? "불러오는 중…" : "새로고침"}
          </button>
        </div>

        {loadError ? (
          <div className="mt-4 rounded-[14px] border border-[#E5C86A] bg-[#FFF7DD] px-4 py-3 text-[12px] leading-[1.7] text-[#7A5A00]">
            {LOAD_ERRORS[loadError]}
          </div>
        ) : null}

        {notice ? (
          <p
            aria-live="polite"
            className={`mt-4 rounded-[12px] px-4 py-2.5 text-[12px] font-medium ${
              notice.kind === "ok"
                ? "bg-[#EAF8EF] text-[#0B5C2A]"
                : "bg-[#FDECEC] text-[#9B1C1C]"
            }`}
          >
            {notice.text}
          </p>
        ) : null}

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(
            [
              "pending",
              "paid",
              "awaiting_deposit",
              "confirmed",
              "shipped",
              "cancelled",
            ] as const
          ).map((status) => (
            <div
              className="rounded-[14px] border border-[var(--ls-line)] bg-white px-4 py-3"
              key={status}
            >
              <dt className="text-[10.5px] font-medium text-[var(--ls-muted)]">
                {ORDER_STATUS_LABELS[status]}
              </dt>
              <dd className="mt-1 text-[22px] font-semibold tabular-nums tracking-[-0.03em] text-[#0F1412]">
                {counts[status]}
                <span className="ml-1 text-[11px] font-medium text-[var(--ls-muted)]">건</span>
              </dd>
            </div>
          ))}
        </dl>

        <div className="no-scrollbar -mx-4 mt-5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {ORDER_STATUS_TABS.map((tab) => {
            const active = filter === tab.key;
            const count = tab.key === "all" ? orders.length : counts[tab.key];

            return (
              <button
                aria-pressed={active}
                className={`ls-focus flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium transition-colors ${
                  active
                    ? "bg-[#0F1412] text-[#1DFF26]"
                    : "border border-[var(--ls-line-strong)] bg-white text-[#0F1412] hover:border-[#0F1412]"
                }`}
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                type="button"
              >
                {tab.label}
                <span
                  className={`text-[10.5px] tabular-nums ${
                    active ? "text-[#8CF695]" : "text-[var(--ls-muted)]"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <section className="mt-4 space-y-2.5">
          {visible.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-[var(--ls-line-strong)] bg-white px-5 py-14 text-center">
              <p className="text-[14px] font-semibold text-[#0F1412]">
                {orders.length === 0 ? "아직 들어온 발주가 없어요" : "이 상태의 발주가 없어요"}
              </p>
              <p className="mt-1 text-[11.5px] leading-[1.7] text-[var(--ls-muted)]">
                {orders.length === 0
                  ? "점주가 발주 페이지에서 주문하면 여기에 바로 쌓입니다."
                  : "다른 탭을 눌러 전체 발주를 확인해 보세요."}
              </p>
            </div>
          ) : (
            visible.map((order) => {
              const busy = busyId === order.id;
              const actionLabel = nextActionLabel(order.status);

              return (
                <article
                  className="rounded-[16px] border border-[var(--ls-line)] bg-white p-4"
                  key={order.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-[3px] text-[10.5px] font-semibold ${ORDER_STATUS_TONES[order.status]}`}
                      >
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                      <span className="font-mono text-[12.5px] font-semibold text-[#0F1412]">
                        {order.orderNumber}
                      </span>
                    </div>
                    <span className="text-[11px] tabular-nums text-[var(--ls-muted)]">
                      {formatOrderTime(order.createdAt)}
                    </span>
                  </div>

                  <div className="mt-2.5 grid gap-2.5 md:grid-cols-[1fr_auto] md:items-start">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold tracking-[-0.01em] text-[#0F1412]">
                        {order.storeName ?? "개인 주문"}
                        {order.storeCode ? (
                          <span className="ml-1.5 font-mono text-[10.5px] font-medium text-[var(--ls-muted)]">
                            {order.storeCode}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-[11.5px] text-[var(--ls-muted)]">
                        {order.requesterName ?? "-"}
                        {order.requesterPhone ? (
                          <>
                            <span className="mx-1.5 text-[#C9D0CB]">·</span>
                            <a
                              className="tabular-nums underline underline-offset-2 hover:text-[#0F1412]"
                              href={`tel:${order.requesterPhone.replace(/\D/g, "")}`}
                            >
                              {order.requesterPhone}
                            </a>
                          </>
                        ) : null}
                      </p>
                      <p className="mt-2 line-clamp-2 break-words text-[12px] leading-[1.6] text-[#3B4740]">
                        {order.itemText ?? "품목 정보 없음"}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 md:flex-col md:items-end">
                      <p className="text-[16px] font-semibold tabular-nums tracking-[-0.02em] text-[#0F1412]">
                        {formatPrice(order.totalAmount)}
                      </p>
                      <div className="flex gap-1.5">
                        {actionLabel ? (
                          <button
                            className="ls-focus h-9 rounded-[10px] bg-[#0F1412] px-3 text-[11.5px] font-semibold text-[#1DFF26] transition-colors hover:bg-[#1B241F] disabled:opacity-50"
                            disabled={busy}
                            onClick={() =>
                              void changeStatus(
                                order,
                                order.status === "pending" ? "confirmed" : "shipped",
                              )
                            }
                            type="button"
                          >
                            {busy ? "처리 중…" : actionLabel}
                          </button>
                        ) : null}

                        {order.status === "shipped" || order.status === "cancelled" ? (
                          <button
                            className="ls-focus h-9 rounded-[10px] border border-[var(--ls-line-strong)] px-3 text-[11.5px] font-medium text-[var(--ls-muted)] transition-colors hover:border-[#0F1412] hover:text-[#0F1412] disabled:opacity-50"
                            disabled={busy}
                            onClick={() => void changeStatus(order, "pending")}
                            type="button"
                          >
                            {busy ? "처리 중…" : "접수대기로"}
                          </button>
                        ) : (
                          <button
                            className="ls-focus h-9 rounded-[10px] border border-[var(--ls-line-strong)] px-3 text-[11.5px] font-medium text-[var(--ls-muted)] transition-colors hover:border-[#B42318] hover:text-[#B42318] disabled:opacity-50"
                            disabled={busy}
                            onClick={() => void changeStatus(order, "cancelled")}
                            type="button"
                          >
                            {busy ? "처리 중…" : "취소"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>

        <p className="mt-6 text-[10.5px] leading-[1.7] text-[var(--ls-muted)]">
          · 주문 원본은 구글시트(order_requests)이고, 이 화면은 Supabase shop_orders 사본을 읽습니다.
          <br />· 상태 변경은 즉시 저장되며 점주 조회 화면에 반영됩니다.
        </p>
      </section>
    </main>
  );
}
