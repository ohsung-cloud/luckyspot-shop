"use client";

import { useEffect, useState } from "react";

import InternalHeader from "@/components/internal/InternalHeader";

import { capturedLabel, won } from "./format";
import { MONTHLY_PERIODS, monthlyForStore, type MonthlyPeriod } from "./monthly";
import { StoreCompare } from "./StoreCompare";
import { StoreReport } from "./StoreReport";
import { STORES, autoOrderHref, findStore, type StoreId } from "./stores";

/**
 * 매출 리포트 화면 틀.
 *
 * 조작부는 두 줄뿐이다.
 *  1) 기간: [이번달 11월] [저번달 10월]
 *  2) 지점: [강남구청역점] [한예종점] [지점 비교] + 새 지점 등록
 * 고른 지점·고른 달의 숫자만 아래에 그린다(지점별 완전 분리, 합산 없음).
 */

type Tab = StoreId | "compare";

const TABS: { id: Tab; label: string; sub: string; className: string }[] = [
  { id: "gangnam", label: "강남구청역점", sub: "프린트 중심", className: "data-[on=true]:bg-[#0F1412] data-[on=true]:text-white" },
  { id: "hanyeojong", label: "한예종점", sub: "대학 상권", className: "data-[on=true]:bg-[#0F7A3E] data-[on=true]:text-white" },
  { id: "compare", label: "지점 비교", sub: "합산 없음", className: "data-[on=true]:bg-[#243B8F] data-[on=true]:text-white" },
];

const CORE_PATTERN = /원두|토너|A4|용지/i;

export function SalesReportShell() {
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
  const month = monthlyForStore(store.code, period);
  const coreAmount = store.snapshot.orders.proposals
    .filter((proposal) => CORE_PATTERN.test(proposal.material) && proposal.amount !== null)
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
            <a
              className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-[#C9CFCB] bg-white/60 px-1 py-2 text-center text-[#007A36]"
              href="/admin/stores"
            >
              <span className="text-[11.5px] font-bold leading-tight">＋ 등록</span>
              <span className="mt-0.5 block text-[9px] font-semibold text-[#98A29B]">새 지점</span>
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px] px-4 py-4 pb-28 sm:px-6 sm:py-6 sm:pb-28">
        {tab === "compare" ? (
          <StoreCompare period={period} />
        ) : (
          <StoreReport key={`${store.id}-${period}`} period={period} store={store} />
        )}
      </div>

      {tab !== "compare" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E6E9E7] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex w-full max-w-[760px] items-center gap-2 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] text-[#6B746D]">
                {store.shortLabel} · {month ? `${month.monthLabel} ${month.partial ? "부분" : "확정"}` : "수집 전"} ·{" "}
                {capturedLabel(store.snapshot.capturedAt)}
              </p>
              <p className="text-[14.5px] font-bold tabular-nums text-[#0F1412]">
                {month?.total ? won(month.total) : "—"}
                <span className="ml-1.5 text-[10.5px] font-semibold text-[#6B746D]">3종 발주 {won(coreAmount)}</span>
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
