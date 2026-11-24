"use client";

import { useEffect, useState } from "react";

import InternalHeader from "@/components/internal/InternalHeader";

import type { StoreFixedCost } from "@/features/stores/registry-types";

import { capturedLabel, won } from "./format";
import { MONTHLY_PERIODS, monthlyForStore, type MonthlyPeriod } from "./monthly";
import { defaultFixedCost, estimateProfit } from "./profit";
import { storePulse } from "./trend";
import { StoreCompare } from "./StoreCompare";
import { StoreReport } from "./StoreReport";
import { StoreSalesOnly } from "./StoreSalesOnly";
import { STORES, autoOrderHref, findStore, type StoreId } from "./stores";

/**
 * 매출 리포트 화면 틀.
 *
 * 조작부는 두 줄뿐이다.
 *  1) 기간: [이번달 11월] [저번달 10월]
 *  2) 지점: [강남구청역점] [한예종점] [평택점] [지점 비교]
 * 고른 지점·고른 달의 숫자만 아래에 그린다(지점별 완전 분리, 합산 없음).
 */

type Tab = StoreId | "compare";

/** 지점 탭은 STORES 목록에서 그대로 만든다 — 지점을 늘리면 탭도 같이 늘어난다. */
const STORE_SUB: Record<StoreId, string> = {
  gangnam: "프린트 중심",
  hanyeojong: "대학 상권",
  pyeongtaek: "아파트 상가",
};

const STORE_TAB_CLASS: Record<StoreId, string> = {
  gangnam: "data-[on=true]:bg-[#0F1412] data-[on=true]:text-white",
  hanyeojong: "data-[on=true]:bg-[#0F7A3E] data-[on=true]:text-white",
  pyeongtaek: "data-[on=true]:bg-[#8A5A00] data-[on=true]:text-white",
};

const TABS: { id: Tab; label: string; sub: string; className: string }[] = [
  ...STORES.map((store) => ({
    id: store.id as Tab,
    label: store.shortLabel,
    sub: STORE_SUB[store.id],
    className: STORE_TAB_CLASS[store.id],
  })),
  { id: "compare", label: "지점 비교", sub: "합산 없음", className: "data-[on=true]:bg-[#243B8F] data-[on=true]:text-white" },
];

export function SalesReportShell({ fixedCosts = {} }: { fixedCosts?: Record<string, StoreFixedCost> }) {
  const [tab, setTab] = useState<Tab>("gangnam");
  const [period, setPeriod] = useState<MonthlyPeriod>("2026-11");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storeParam = params.get("store");
    const periodParam = params.get("period");
    if (storeParam === "compare" || STORES.some((store) => store.id === storeParam)) setTab(storeParam as Tab);
    if (periodParam === "2026-10" || periodParam === "2026-11") setPeriod(periodParam);
  }, []);

  const store = findStore(tab === "compare" ? null : tab);
  const snapshot = store.snapshot;
  const month = monthlyForStore(store.code, period);
  const fixedCost = fixedCosts[store.code] ?? defaultFixedCost(store.code);
  const profit = estimateProfit({ month, fixedCost });
  const pulse = storePulse({
    code: store.code,
    asOf: snapshot?.today ?? "2026-11-24",
    dailyRate: snapshot?.revenue.coffee.dailyRate ?? null,
  });
  const coreAmount = (snapshot?.orders.proposals ?? [])
    .filter((proposal) => /원두|토너|A4|용지/i.test(proposal.material) && proposal.amount !== null)
    .reduce((sum, proposal) => sum + (proposal.amount ?? 0), 0);

  const select = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("store", next);
    window.history.replaceState(null, "", url.toString());
  };

  const selectPeriod = (next: MonthlyPeriod) => {
    setPeriod(next);
    const url = new URL(window.location.href);
    url.searchParams.set("period", next);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <main className="min-h-screen bg-[#F4F5F6]">
      <InternalHeader action={{ href: autoOrderHref(store), label: "자동발주" }} subtitle="지점별 매출 리포트" />

      <div className="sticky top-0 z-20 border-b border-[#E6E9E7] bg-[#F4F5F6]/95 backdrop-blur">
        <div className="mx-auto w-full max-w-[760px] px-4 py-2 sm:px-6">
          <div className="grid grid-cols-2 gap-1.5" role="tablist" aria-label="기간 선택">
            {MONTHLY_PERIODS.map((item) => (
              <button
                key={item.id}
                aria-selected={period === item.id}
                className={`flex h-11 items-center justify-center gap-1.5 rounded-[12px] border text-[12.5px] font-bold transition-colors ${
                  period === item.id
                    ? "border-[#0F1412] bg-white text-[#0F1412] shadow-[0_2px_8px_rgba(15,20,18,0.08)]"
                    : "border-[#E0E4E2] bg-white/60 text-[#6B746D]"
                }`}
                onClick={() => selectPeriod(item.id)}
                role="tab"
                type="button"
              >
                {item.label}
                <span className={`text-[10px] font-semibold ${period === item.id ? "text-[#007A36]" : "text-[#98A29B]"}`}>
                  {item.hint}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-1.5 grid grid-cols-4 gap-1.5" role="tablist" aria-label="지점 선택">
            {TABS.map((item) => (
              <button
                key={item.id}
                aria-selected={tab === item.id}
                className={`rounded-[12px] border border-[#E0E4E2] bg-white px-1 py-2 text-center text-[#3B4740] transition-colors ${item.className}`}
                data-on={tab === item.id}
                onClick={() => select(item.id)}
                role="tab"
                type="button"
              >
                <span className="block text-[11.5px] font-bold leading-tight">{item.label}</span>
                <span className="mt-0.5 block text-[9px] font-semibold opacity-70">{item.sub}</span>
              </button>
            ))}
          </div>

          <div className="mt-1 flex justify-end">
            <a className="text-[10px] font-semibold text-[#007A36]" href="/admin/stores">
              ＋ 새 지점 등록
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px] px-4 py-4 pb-28 sm:px-6 sm:py-6 sm:pb-28">
        {tab === "compare" ? (
          <StoreCompare period={period} />
        ) : snapshot ? (
          <StoreReport
            key={`${store.id}-${period}`}
            fixedCost={fixedCost}
            period={period}
            profit={profit}
            pulse={pulse}
            store={{ ...store, snapshot }}
          />
        ) : (
          <StoreSalesOnly key={`${store.id}-${period}`} period={period} store={store} />
        )}
      </div>

      {tab !== "compare" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E6E9E7] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex w-full max-w-[760px] items-center gap-2 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] text-[#6B746D]">
                {store.shortLabel} · {month ? `${month.monthLabel} ${month.partial ? "부분" : "확정"}` : "수집 전"} ·{" "}
                {snapshot ? capturedLabel(snapshot.capturedAt) : "재고 수집 전"}
              </p>
              <p className="text-[14.5px] font-bold tabular-nums text-[#0F1412]">
                {month?.total ? won(month.total) : "—"}
                <span className="ml-1.5 text-[10.5px] font-semibold text-[#6B746D]">
                  {snapshot ? `3종 발주 ${won(coreAmount)}` : "3종 발주 — 재고 수집 전"}
                </span>
              </p>
            </div>
            <a
              className="flex h-11 shrink-0 items-center rounded-[12px] border border-[#D7DBD9] px-3 text-[12px] font-bold text-[#3B4740]"
              href={`/store/${store.code}`}
            >
              점주
            </a>
            <a
              className="flex h-11 shrink-0 items-center rounded-[12px] bg-[#1DFF26] px-3.5 text-[12.5px] font-bold text-[#0F1412]"
              href={autoOrderHref(store)}
            >
              발주
            </a>
          </div>
        </div>
      ) : null}
    </main>
  );
}
