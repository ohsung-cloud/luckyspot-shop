"use client";

import { useEffect, useState } from "react";

import { capturedLabel, won } from "./format";
import { StoreCompare } from "./StoreCompare";
import { StoreReport } from "./StoreReport";
import { STORES, autoOrderHref, findStore, type StoreId } from "./stores";

/**
 * 매출 리포트 화면 틀.
 *
 * 상단에서 지점을 고르고, 고른 지점의 숫자만 아래에 그린다(지점별 완전 분리).
 * '나란히 비교'는 좌우 비교만 하고 합산 숫자를 만들지 않는다.
 */

type Tab = StoreId | "compare";

const TABS: { id: Tab; label: string; sub: string; className: string }[] = [
  { id: "gangnam", label: "강남구청역점", sub: "프린트 중심", className: "data-[on=true]:bg-[#0F1412] data-[on=true]:text-white" },
  { id: "hanyeojong", label: "한예종점", sub: "대학 상권", className: "data-[on=true]:bg-[#0F7A3E] data-[on=true]:text-white" },
  { id: "compare", label: "지점 비교", sub: "합산 없음", className: "data-[on=true]:bg-[#243B8F] data-[on=true]:text-white" },
];

export function SalesReportShell() {
  const [tab, setTab] = useState<Tab>("gangnam");

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("store");
    if (param === "compare" || STORES.some((store) => store.id === param)) setTab(param as Tab);
  }, []);

  const store = findStore(tab === "compare" ? null : tab);
  const total = store.snapshot.orders.proposals.reduce((sum, proposal) => sum + (proposal.amount ?? 0), 0);

  const select = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("store", next);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <main className="min-h-screen bg-[#F4F5F6]">
      <header className="bg-[#0F1412]">
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between px-4 py-3.5 sm:px-6">
          <a className="flex items-center gap-2.5" href="/">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-[8px] bg-[#1DFF26] text-[13px] font-bold leading-none text-[#0F1412]"
            >
              L
            </span>
            <div className="leading-none">
              <p className="text-[13px] font-semibold tracking-[0.2em] text-white">LUCKY SPOT</p>
              <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-[#9AA39C]">지점별 매출 리포트</p>
            </div>
          </a>

          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-[#2C3730] px-2.5 py-1 text-[10.5px] font-semibold text-[#9AA39C]">
              내부 · noindex
            </span>
            <a
              className="flex h-9 items-center rounded-full bg-[#1DFF26] px-3 text-[12.5px] font-bold text-[#0F1412]"
              href={autoOrderHref(store)}
            >
              자동발주
            </a>
          </div>
        </div>
      </header>

      {/* 지점 선택 — 화면에서 가장 먼저 보이는 조작부 */}
      <div className="sticky top-0 z-20 border-b border-[#E6E9E7] bg-[#F4F5F6]/95 backdrop-blur">
        <div className="mx-auto w-full max-w-[760px] px-4 py-2.5 sm:px-6">
          <p className="mb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-[#98A29B]">지점 선택 · 지점별로 따로 집계</p>
          <div role="tablist" aria-label="지점 선택" className="grid grid-cols-3 gap-1.5">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                data-on={tab === item.id}
                onClick={() => select(item.id)}
                className={`rounded-[14px] border border-[#E0E4E2] bg-white px-2 py-2 text-center text-[#3B4740] transition-colors ${item.className}`}
              >
                <span className="block text-[13.5px] font-bold leading-tight">{item.label}</span>
                <span className="mt-0.5 block text-[10px] font-semibold opacity-70">{item.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px] px-4 py-5 pb-28 sm:px-6 sm:py-7 sm:pb-28">
        {tab === "compare" ? <StoreCompare /> : <StoreReport key={store.id} store={store} />}
      </div>

      {tab !== "compare" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E6E9E7] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex w-full max-w-[760px] items-center gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10.5px] text-[#6B746D]">
                {store.shortLabel} 추천 발주 · {capturedLabel(store.snapshot.capturedAt)}
              </p>
              <p className="text-[16px] font-bold tabular-nums text-[#0F1412]">{won(total)}</p>
            </div>
            <a
              className="flex h-12 flex-1 items-center justify-center rounded-[14px] bg-[#1DFF26] text-[15.5px] font-bold text-[#0F1412]"
              href={autoOrderHref(store)}
            >
              {store.shortLabel} 발주로 이동
            </a>
          </div>
        </div>
      ) : null}
    </main>
  );
}
