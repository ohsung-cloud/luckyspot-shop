"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, CardBody, CardHead, Chip } from "@/components/internal/card-ui";
import OrderSheet from "@/components/shop/OrderSheet";
import { readLastOrder, type LastOrder } from "@/features/shop/preferences";
import type { OwnerDashboardView } from "@/features/owner/data";
import { recommendedCartLines, type OwnerStockItem, type StockStatus } from "@/features/owner/stock";
import {
  COFFEE_CONTRIBUTION_PCT,
  PRINT_CONTRIBUTION_PCT,
  COFFEE_MATERIAL_RATE,
  PRINT_VARIABLE_RATE,
} from "@/features/sales-report/profit";
import { formatWon } from "@/features/sales-report/monthly";
import { useCartStore, cartCount, cartTotal, hydrateCart, resolveCart } from "@/stores/cartStore";
import type { StoreOption } from "@/features/stores/types";

/**
 * `/owner` 대시보드 — 점주가 한 화면에서 "매출 → 재고 → 발주 → 결제"를 끝낸다.
 *
 * 정보 구조(사용자 지정 2026-11-25)
 *   ① 이번 달 매출 + 예상 순이익(계산 근거 4단계)
 *   ② 원두·용지 재고 (부족하면 같은 자리에서 발주·결제로)
 *   ③ 최근 발주내역
 *
 * 데이터 경계
 *  - 이 화면은 **로그인한 지점 하나의 값**만 받는다(서버가 그렇게 내려준다).
 *    다른 지점 숫자를 더하거나 비교하지 않는다.
 *  - 발주는 기존 장바구니(`/stores/cartStore`)와 주문서(`/components/shop/OrderSheet`)를 그대로 쓴다.
 *    결제는 `/api/payments/prepare` → 토스 결제창 → `/checkout/success` 흐름이다.
 *  - 받는 곳은 로그인한 지점 하나로 고정한다(다른 지점 코드로 주문이 나가지 않게).
 */

type Tone = "out" | "low" | "ok" | "unknown";

const STATUS_CHIP: Record<StockStatus, { tone: "red" | "amber" | "green" | "gray"; label: string }> = {
  out: { tone: "red", label: "곧 없어요" },
  low: { tone: "amber", label: "발주할 때" },
  ok: { tone: "green", label: "넉넉해요" },
  unknown: { tone: "gray", label: "수집 전" },
};

const DOT: Record<Tone, string> = {
  out: "bg-[#B3261E]",
  low: "bg-[#E0A800]",
  ok: "bg-[#1D9F4C]",
  unknown: "bg-[#C9CFCB]",
};

function manwon(value: number) {
  if (!Number.isFinite(value) || value === 0) return "0원";
  if (value < 100_000) return `${value.toLocaleString("ko-KR")}원`;
  return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
}

function dateTimeLabel(iso: string) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

function statusTone(status: StockStatus): Tone {
  return status;
}

export default function OwnerDashboard({
  data,
  testMode,
  storeOption,
}: {
  data: OwnerDashboardView;
  testMode: boolean;
  storeOption: StoreOption;
}) {
  const lines = useCartStore((state) => state.lines);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<LastOrder | null>(null);

  useEffect(() => {
    hydrateCart();
    const last = readLastOrder();
    if (last && (!last.storeCode || last.storeCode === data.store.code)) setLocalOrder(last);
  }, [data.store.code]);

  const entries = useMemo(() => resolveCart(lines), [lines]);
  const total = cartTotal(entries);
  const count = cartCount(entries);

  /**추천 수량을 장바구니에 "맞춘다"(이미 더 많이 담겨 있으면 그대로 둔다). */
  const ensureLines = useCallback((items: { id: string; quantity: number }[]) => {
    const store = useCartStore.getState();

    for (const item of items) {
      const existing = store.lines.find((line) => line.id === item.id);
      if (!existing) store.addItem(item.id, item.quantity);
      else if (existing.quantity < item.quantity) store.setQuantity(item.id, item.quantity);
    }
  }, []);

  const orderItem = (item: OwnerStockItem) => {
    if (!item.orderable) return;
    ensureLines([{ id: item.sku, quantity: item.suggestedQty }]);
    setNotice(`${item.label} ${item.suggestedText}을 담았어요.`);
    setCheckoutOpen(true);
  };

  const orderRecommended = (items: OwnerStockItem[]) => {
    const cartLines = items.filter((item) => item.orderable).map((item) => ({ id: item.sku, quantity: item.suggestedQty }));
    if (cartLines.length === 0) return;

    ensureLines(cartLines);
    setNotice(`${cartLines.length}종을 추천 수량대로 담았어요.`);
    setCheckoutOpen(true);
  };

  const logout = async () => {
    try {
      await fetch("/api/owner/logout", { method: "POST" });
    } finally {
      window.location.replace("/owner?switch=1");
    }
  };

  const month = data.current.month;
  const profit = data.current.profit;
  const fixed = data.current.fixedCost;
  const fixedTotal = fixed.rent + fixed.maintenance + fixed.internet + fixed.solution;

  const coffee = month?.coffee.amount ?? null;
  const print = month?.print.amount ?? null;
  const materialCost =
    (coffee ?? 0) * COFFEE_MATERIAL_RATE + (print ?? 0) * PRINT_VARIABLE_RATE;
  const fixedText = [
    fixed.rent > 0 ? `임대료 ${manwon(fixed.rent)}` : null,
    fixed.maintenance > 0 ? `관리비 ${manwon(fixed.maintenance)}` : null,
    fixed.internet > 0 ? `인터넷 ${manwon(fixed.internet)}` : null,
    fixed.solution > 0 ? `솔루션 ${manwon(fixed.solution)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const stock = data.stock.view;
  const shortItems = stock
    ? [...stock.core, ...stock.extras].filter((item) => item.status === "out" || item.status === "low")
    : [];

  const orders = data.orders.ok ? data.orders.orders : [];
  const localOrderVisible =
    localOrder && !orders.some((order) => order.orderNumber === localOrder.orderNumber) ? localOrder : null;

  return (
    <main className="min-h-screen bg-[#F4F5F6] pb-28">
      <header className="sticky top-0 z-30 border-b border-[#EBEEF0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-[#0F1412] text-[15px] font-bold leading-none text-[#1DFF26]"
            >
              L
            </span>
            <span className="min-w-0 leading-none">
              <span className="block text-[9.5px] font-bold tracking-[0.18em] text-[#0B5C2A]">LUCKY SPOT</span>
              <span className="mt-1 block truncate text-[15.5px] font-bold tracking-[-0.015em] text-[#0F1412]">
                {data.store.shortLabel}
              </span>
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <a
              className="flex h-9 items-center rounded-full bg-[#F2F4F6] px-3 text-[11.5px] font-bold text-[#3B4740]"
              href="/owner?switch=1"
            >
              지점 전환
            </a>
            <button
              className="flex h-9 items-center rounded-full bg-[#0F1412] px-3 text-[11.5px] font-bold text-white"
              onClick={() => void logout()}
              type="button"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[560px] px-4 pt-4">
        <p className="px-1 text-[11px] font-medium leading-[1.55] text-[#8B948D]">
          {data.store.label}
          {data.store.region ? ` · ${data.store.region}` : ""} · 이 지점 데이터만 보여요
        </p>

        {/* ① 이번 달 매출 + 예상 순이익 */}
        <Card className="mt-2 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#6B746D]">
                {month ? `${month.monthLabel} 매출` : "이번 달 매출"}
              </p>
              <p className="mt-2 text-[32px] font-bold leading-none tabular-nums tracking-[0.03em] text-[#0F1412]">
                {month ? formatWon(month.total) : "—"}
              </p>
            </div>
            <Chip tone={month && !month.partial ? "green" : "gray"}>
              {month ? (month.partial ? "확인된 항목" : "확정") : "수집 전"}
            </Chip>
          </div>

          {month ? (
            <>
              <p className="mt-2 text-[11px] font-medium text-[#A7AFA9]">
                커피 {month.coffee.range} · 프린트 {month.print.range}
                {month.print.status === "pending" ? " (26일 정산 전)" : ""}
              </p>

              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[#EFF1F0]">
                {coffee && month.total ? (
                  <span className="h-full bg-[#0F1412]" style={{ width: `${(coffee / month.total) * 100}%` }} />
                ) : null}
                {print && month.total ? (
                  <span className="h-full bg-[#1DFF26]" style={{ width: `${(print / month.total) * 100}%` }} />
                ) : null}
              </div>
              <div className="mt-1.5 flex justify-between text-[10.5px] font-semibold text-[#8B948D]">
                <span>
                  커피 {coffee ? formatWon(coffee) : "—"}
                  {coffee && month.total ? ` · ${Math.round((coffee / month.total) * 100)}%` : ""}
                </span>
                <span>
                  프린트 {print ? formatWon(print) : "정산 전"}
                  {print && month.total ? ` · ${Math.round((print / month.total) * 100)}%` : ""}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-2 break-keep rounded-[12px] bg-[#F7F8F9] px-3 py-2.5 text-[11.5px] leading-[1.55] text-[#8B948D]">
              이 지점은 아직 매출 수집 전이에요. 본사에서 매출이 들어오면 여기에 바로 보여요.
            </p>
          )}

          {/* 계산 근거 — 매출 → 변동비 → 월세·고정비 → 예상 순이익 */}
          {month ? (
          <div className="mt-4 rounded-[16px] bg-[#F7F8F9] px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-semibold text-[#3B4740]">① 이번 달 매출</span>
              <span className="text-[14px] font-bold tabular-nums tracking-[0.02em] text-[#0F1412]">
                {formatWon(month?.total ?? null)}
              </span>
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-medium text-[#6B746D]">
                ② 원가·변동비 제외
                <span className="mt-0.5 block text-[10px] text-[#A7AFA9]">
                  커피 {COFFEE_CONTRIBUTION_PCT}%·프린트 {PRINT_CONTRIBUTION_PCT}% 공헌이익
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums tracking-[0.02em] text-[#3B4740]">
                {month ? `−${formatWon(Math.round(materialCost))}` : "—"}
              </span>
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-[#E6E9E7] pt-2">
              <span className="text-[12px] font-semibold text-[#3B4740]">= 공헌이익</span>
              <span className="text-[13px] font-bold tabular-nums tracking-[0.02em] text-[#0F1412]">
                {formatWon(profit?.grossProfit ?? null)}
              </span>
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-medium text-[#6B746D]">
                ③ 월세·고정비 제외
                <span className="mt-0.5 block text-[10px] text-[#A7AFA9]">
                  {fixedText || "월 고정비 미등록"}
                  {profit?.prorated ? ` · ${Math.round(profit.proratedRatio * 100)}% (경과일)` : ""}
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums tracking-[0.02em] text-[#3B4740]">
                {profit ? `−${formatWon(profit.fixedCostApplied)}` : "—"}
              </span>
            </div>

            <div className="mt-2.5 flex items-baseline justify-between gap-3 rounded-[12px] bg-[#EDFBEF] px-3 py-2.5">
              <span className="text-[12.5px] font-bold text-[#0B5C2A]">④ 예상 순이익</span>
              <span className="text-right">
                <span className="block text-[19px] font-bold leading-none tabular-nums tracking-[0.02em] text-[#0B5C2A]">
                  {formatWon(profit?.net ?? null)}
                </span>
                <span className="mt-1 block text-[10.5px] font-semibold text-[#3B4740]">
                  {profit?.marginRate !== null && profit?.marginRate !== undefined
                    ? `마진 ${profit.marginRate.toFixed(1)}%`
                    : fixedTotal === 0
                      ? "월 고정비를 넣으면 정확해져요"
                      : "계산 전"}
                </span>
              </span>
            </div>

            {profit?.projectedNet !== null && profit?.projectedNet !== undefined && profit.prorated ? (
              <p className="mt-2 text-[10.5px] font-medium leading-[1.55] text-[#8B948D]">
                지금 속도면 {month?.monthLabel} 말 예상 순이익 {formatWon(profit.projectedNet)}
                {profit.partial ? " (프린트 정산 전이라 커피만 반영)" : ""}
              </p>
            ) : null}
          </div>
          ) : (
            <div className="mt-4 rounded-[16px] bg-[#F7F8F9] px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-semibold text-[#3B4740]">월 고정비(임대료 등)</span>
                <span className="text-[14px] font-bold tabular-nums tracking-[0.02em] text-[#0F1412]">
                  {formatWon(fixedTotal)}
                </span>
              </div>
              <p className="mt-1.5 break-keep text-[10.5px] leading-[1.6] text-[#8B948D]">
                {fixedText || "월 고정비가 아직 등록되지 않았어요."} · 매출이 들어오면 ①매출 → ②변동비 → ③고정비 → ④예상
                순이익 순서로 계산해 보여 드려요.
              </p>
            </div>
          )}

          {data.previous.profit?.net !== null && data.previous.profit?.net !== undefined ? (
            <p className="mt-2.5 px-1 text-[11px] font-medium text-[#8B948D]">
              지난달({data.previous.month?.monthLabel ?? "10월"}) 확정 순이익{" "}
              <span className="font-bold text-[#3B4740]">{formatWon(data.previous.profit.net)}</span>
            </p>
          ) : null}
        </Card>

        {/* ② 원두 · 용지 재고 */}
        <Card className="mt-3">
          <CardHead
            right={
              <Chip tone={stock && shortItems.length > 0 ? "amber" : "gray"}>
                {stock ? (shortItems.length > 0 ? `${shortItems.length}종 발주` : "재고 충분") : "수집 전"}
              </Chip>
            }
            sub={
              stock
                ? `${stock.asOfDate} 마감 예측 · ${data.stock.dataSource === "demo" ? "데모 데이터" : "실측 데이터"}`
                : "예측을 불러오는 중이에요"
            }
            title="원두 · 용지 재고"
          />
          <CardBody className="pt-3">
            {data.stock.error ? (
              <p className="rounded-[12px] bg-[#FFF2F2] px-3 py-2.5 text-[11.5px] leading-[1.55] text-[#B3261E]">
                {data.stock.error}
              </p>
            ) : stock ? (
              <>
                <div className="grid gap-2.5">
                  {stock.core.map((item) => {
                    const chip = STATUS_CHIP[item.status];

                    return (
                      <div className="rounded-[18px] bg-[#F7F8F9] px-4 py-3.5" key={item.sku}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-[14px] font-bold text-[#0F1412]">
                              <span aria-hidden className={`size-2 rounded-full ${DOT[statusTone(item.status)]}`} />
                              {item.label}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] font-medium text-[#8B948D]">{item.name}</p>
                          </div>
                          <Chip tone={chip.tone}>{chip.label}</Chip>
                        </div>

                        <div className="mt-2 flex items-end justify-between gap-3">
                          <p className="text-[26px] font-bold leading-none tabular-nums tracking-[0.02em] text-[#0F1412]">
                            {item.daysText}
                            <span className="ml-1 text-[11px] font-semibold text-[#8B948D]">남음</span>
                          </p>
                          <p className="text-right text-[10.5px] font-medium leading-[1.5] text-[#8B948D]">
                            잔량 {item.stockText} · {item.dailyText}
                            <br />
                            {item.emptyOnText ? `${item.emptyOnText} 소진 예상` : "소진 예측 전"}
                          </p>
                        </div>

                        <button
                          className={`mt-3 flex h-11 w-full items-center justify-center rounded-[13px] text-[13px] font-bold transition-colors ${
                            item.status === "out" || item.status === "low"
                              ? "bg-[#1DFF26] text-[#0F1412] hover:bg-[#3BE93F]"
                              : "bg-white text-[#3B4740] hover:bg-[#F1F3F2]"
                          }`}
                          disabled={!item.orderable}
                          onClick={() => orderItem(item)}
                          type="button"
                        >
                          {item.status === "out" || item.status === "low"
                            ? `${item.label} ${item.suggestedText} 담고 결제`
                            : `${item.label} 담기`}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {shortItems.length > 0 ? (
                  <button
                    className="mt-2.5 flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[#0F1412] text-[14px] font-bold text-white"
                    onClick={() => orderRecommended(shortItems)}
                    type="button"
                  >
                    부족한 {shortItems.length}종 한 번에 담기 · {formatWon(stock.recommendedTotal)}
                  </button>
                ) : null}

                <details className="mt-3 rounded-[16px] bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-1 py-2 text-[12px] font-bold text-[#3B4740] [&::-webkit-details-marker]:hidden">
                    기타 소모품 {stock.extras.length}종
                    <span aria-hidden className="text-[#A7AFA9]">
                      ⌄
                    </span>
                  </summary>
                  <ul className="mt-1 divide-y divide-[#F1F3F2] rounded-[14px] bg-[#F7F8F9] px-3">
                    {stock.extras.map((item) => (
                      <li className="flex items-center justify-between gap-2 py-2.5" key={item.sku}>
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold text-[#0F1412]">{item.label}</p>
                          <p className="truncate text-[10.5px] text-[#8B948D]">
                            {item.stockText} · {item.daysText}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Chip tone={STATUS_CHIP[item.status].tone}>{STATUS_CHIP[item.status].label}</Chip>
                          <button
                            className="flex h-8 items-center rounded-full bg-white px-2.5 text-[11px] font-bold text-[#3B4740]"
                            disabled={!item.orderable}
                            onClick={() => orderItem(item)}
                            type="button"
                          >
                            담기
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>

                {data.stock.dataSource === "demo" ? (
                  <p className="mt-2.5 px-1 text-[10px] leading-[1.6] text-[#A7AFA9]">
                    포털 실측이 들어오기 전이라 데모 판매량으로 계산한 값이에요. 교체완료를 누르면 소진 속도를 학습해요.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="rounded-[12px] bg-[#F7F8F9] px-3 py-2.5 text-[11.5px] text-[#8B948D]">
                재고 예측을 불러오지 못했어요.
              </p>
            )}
          </CardBody>
        </Card>

        {/* ③ 최근 발주내역 */}
        <Card className="mt-3">
          <CardHead
            right={<Chip tone="gray">{orders.length > 0 ? `${orders.length}건` : "내역"}</Chip>}
            sub="이 지점으로 들어온 발주·결제 기록이에요"
            title="최근 발주내역"
          />
          <CardBody className="pt-2">
            {orders.length === 0 && !localOrderVisible ? (
              <div className="rounded-[14px] bg-[#F7F8F9] px-3.5 py-4">
                <p className="text-[12.5px] font-semibold text-[#3B4740]">아직 발주 내역이 없어요.</p>
                <p className="mt-1 text-[11px] leading-[1.55] text-[#8B948D]">
                  {data.orders.ok
                    ? "위에서 원두나 용지를 발주하면 여기에 쌓여요."
                    : data.orders.reason === "not_configured" || data.orders.reason === "table_missing"
                      ? "발주 기록 저장소가 아직 연결되지 않았어요. 지금 발주해도 본사에는 그대로 접수돼요."
                      : "발주 기록을 불러오지 못했어요. 잠시 후 새로고침해 주세요."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#F1F3F2]">
                {localOrderVisible ? (
                  <li className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[#0F1412]">
                        {localOrderVisible.orderNumber}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#8B948D]">
                        {dateTimeLabel(localOrderVisible.createdAt)} · {localOrderVisible.count}개 · 이 기기 기록
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[14px] font-bold tabular-nums text-[#0F1412]">
                        {formatWon(localOrderVisible.totalAmount)}
                      </p>
                      <Chip tone="green">접수</Chip>
                    </div>
                  </li>
                ) : null}

                {orders.map((order) => (
                  <li className="flex items-start justify-between gap-3 py-3" key={order.orderNumber}>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[#0F1412]">{order.summary}</p>
                      <p className="mt-0.5 text-[11px] text-[#8B948D]">
                        {dateTimeLabel(order.createdAt)} · {order.orderNumber}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[14px] font-bold tabular-nums tracking-[0.02em] text-[#0F1412]">
                        {formatWon(order.totalAmount)}
                      </p>
                      <Chip
                        tone={
                          order.status === "cancelled"
                            ? "gray"
                            : order.status === "shipped"
                              ? "ink"
                              : order.status === "paid" || order.status === "confirmed"
                                ? "green"
                                : "amber"
                        }
                      >
                        {order.statusLabel}
                      </Chip>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <p className="mt-4 px-1 text-[10px] leading-[1.7] text-[#A7AFA9]">
          럭키스팟 점주 포털(내부용) · 매출 기준 {month ? month.coffee.range : "수집 전"} · 재고 기준{" "}
          {stock?.asOfDate ?? "수집 전"}
        </p>
      </div>

      {lines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EBEEF0] bg-white/95 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[560px] items-center gap-3 px-4">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-[#3B4740]">
                담은 {count}개 · <span className="font-bold text-[#0F1412]">{formatWon(total)}</span>
              </p>
              <p className="mt-0.5 truncate text-[10.5px] text-[#8B948D]">받는 곳 {data.store.shortLabel}</p>
            </div>
            <button
              className="flex h-12 shrink-0 items-center rounded-[14px] bg-[#1DFF26] px-5 text-[14px] font-bold text-[#0F1412]"
              onClick={() => {
                setNotice(null);
                setCheckoutOpen(true);
              }}
              type="button"
            >
              결제하기
            </button>
          </div>
        </div>
      ) : null}

      <OrderSheet
        initialStoreCode={data.store.code}
        lockedStores={[storeOption]}
        notice={notice}
        onClose={() => setCheckoutOpen(false)}
        open={checkoutOpen}
        testMode={testMode}
      />
    </main>
  );
}
