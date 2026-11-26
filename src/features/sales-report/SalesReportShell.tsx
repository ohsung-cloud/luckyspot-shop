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
 * 매출 리포트 화면 틀 — 토스 앱식 카드 화면.
 *
 * 조작부는 두 줄뿐이다.
 *  1) 기간: [이번달] [저번달]
 *  2) 지점: [강남구청역점] [한예종점] [평택점] [지점 비교]
 * 고른 지점·고른 달의 숫자만 아래에 그린다(지점별 완전 분리, 합산 없음).
 *
 * 카드 방식: 회색 바탕 위 흰 카드(24px 라운드) 하나에 한 가지 이야기만.
 * 브랜드 폰트(Paperozi)와 컬러(잉크 #0F1412 · 네온 그린 #1DFF26)는 그대로 쓴다.
 */

type Tab = StoreId | "compare";

/** 지점 탭은 STORES 목록에서 그대로 만든다 — 지점을 늘리면 탭도 같이 늘어난다. */
const STORE_SUB: Record<StoreId, string> = {
  gangnam: "프린트 중심",
  hanyeojong: "대학 상권",
  pyeongtaek: "아파트 상가",
  yeongdeungpo: "프린트 2대",
  seonyuro: "인쇄 없음",
};

const TABS: { id: Tab; label: string; sub: string }[] = [
  ...STORES.map((store) => ({ id: store.id as Tab, label: store.tabLabel ?? store.shortLabel, sub: STORE_SUB[store.id] })),
  { id: "compare", label: "지점 비교", sub: "합산 없음" },
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

      <div className="mx-auto w-full max-w-[760px] px-4 pt-5 sm:px-6 sm:pt-7">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[23px] font-bold leading-[1.25] tracking-[-0.03em] text-[#0F1412]">매출 리포트</h1>
            <p className="mt-1.5 text-[12.5px] font-medium leading-[1.5] text-[#8B948D]">
              지점 하나씩 봐요. 두 지점을 더한 숫자는 만들지 않아요.
            </p>
          </div>
          <a
            className="flex h-9 shrink-0 items-center rounded-full bg-white px-3 text-[11.5px] font-bold text-[#0B5C2A] shadow-[0_1px_2px_rgba(15,20,18,0.04)]"
            href="/admin/stores"
          >
            ＋ 새 지점
          </a>
        </div>
      </div>

      <div className="sticky top-0 z-20 mt-3 bg-[#F4F5F6]/92 backdrop-blur">
        <div className="mx-auto w-full max-w-[760px] px-4 pb-2 pt-1 sm:px-6">
          <div aria-label="기간 선택" className="flex gap-1 rounded-[16px] bg-[#EBEEF0] p-1" role="tablist">
            {MONTHLY_PERIODS.map((item) => {
              const on = period === item.id;

              return (
                <button
                  key={item.id}
                  aria-selected={on}
                  className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[13px] text-[13px] font-bold transition-colors ${
                    on
                      ? "bg-white text-[#0F1412] shadow-[0_1px_3px_rgba(15,20,18,0.10)]"
                      : "text-[#8B948D]"
                  }`}
                  onClick={() => selectPeriod(item.id)}
                  role="tab"
                  type="button"
                >
                  {item.label.replace(" (", " · ").replace(")", "")}
                  <span className={`text-[10.5px] font-semibold ${on ? "text-[#0B5C2A]" : "text-[#A7AFA9]"}`}>
                    {item.hint}
                  </span>
                </button>
              );
            })}
          </div>

          <div aria-label="지점 선택" className="mt-2 grid grid-cols-4 gap-1.5" role="tablist">
            {TABS.map((item) => {
              const on = tab === item.id;

              return (
                <button
                  key={item.id}
                  aria-selected={on}
                  className={`flex h-[52px] min-w-0 flex-col items-center justify-center rounded-[16px] px-1 transition-colors ${
                    on
                      ? "bg-[#0F1412] text-white"
                      : "bg-white text-[#3B4740] shadow-[0_1px_2px_rgba(15,20,18,0.04)]"
                  }`}
                  onClick={() => select(item.id)}
                  role="tab"
                  type="button"
                >
                  <span className="max-w-full truncate text-[12px] font-bold leading-tight">{item.label}</span>
                  <span className={`mt-0.5 max-w-full truncate text-[9px] font-semibold leading-tight ${on ? "text-white/55" : "text-[#A7AFA9]"}`}>
                    {item.sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px] px-4 py-3 pb-28 sm:px-6 sm:py-4 sm:pb-28">
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
          <StoreSalesOnly key={`${store.id}-${period}`} fixedCost={fixedCost} period={period} profit={profit} store={store} />
        )}
      </div>

      {tab !== "compare" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#EBEEF0] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex w-full max-w-[760px] items-center gap-2 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-[#98A29B]">
                {store.shortLabel} ·{" "}
                {month ? `${month.monthLabel} ${month.coffee.status === "live" ? "진행 중" : month.partial ? "부분 확정" : "확정"}` : "수집 전"} ·{" "}
                {snapshot ? capturedLabel(snapshot.capturedAt) : store.latestReadAt ? capturedLabel(store.latestReadAt) : "재고 수집 전"}
              </p>
              <p className="mt-0.5 truncate text-[16px] font-bold tabular-nums tracking-[0.02em] text-[#0F1412]">
                {month?.total ? won(month.total) : "—"}
                <span className="ml-1.5 text-[10.5px] font-semibold text-[#8B948D]">
                  {snapshot ? `· 3종 발주 ${won(coreAmount)}` : "· 3종 발주 — 재고 수집 전"}
                </span>
              </p>
            </div>
            <a
              className="flex h-11 shrink-0 items-center rounded-full bg-[#F2F4F6] px-3.5 text-[12.5px] font-bold text-[#3B4740]"
              href={`/store/${store.code}`}
            >
              점주
            </a>
            <a
              className="flex h-11 shrink-0 items-center rounded-full bg-[#1DFF26] px-4 text-[12.5px] font-bold text-[#0F1412]"
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
