"use client";

import type { ProposalListResponse } from "@/features/auto-order/types";

import CoreStockCards from "./CoreStockCards";
import { dateLabel, days, ENTITY_LABEL, pct, remainingTone, won } from "./format";

/**
 * 통합 현황 — 첫 화면은 원두·토너·용지 3종과 발주 버튼뿐.
 * 매출·컵/뚜껑·장비 목록은 접이식으로 내려 심플하게 유지한다(2026-11-23 사용자 지시).
 */

type OverviewProps = {
  state: ProposalListResponse | null;
  loading: boolean;
  error: string | null;
  onGoOrder: () => void;
  onGoHq: () => void;
  onRefresh: () => void;
};

export default function OverviewView({ state, loading, error, onGoOrder, onGoHq, onRefresh }: OverviewProps) {
  if (loading && !state) {
    return (
      <div className="grid gap-3">
        <div className="h-[150px] animate-pulse rounded-[22px] bg-white" />
        <div className="h-[200px] animate-pulse rounded-[22px] bg-white" />
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="rounded-[22px] border border-[#E6E9E7] bg-white p-6 text-center">
        <p className="text-[15px] font-semibold text-[#0F1412]">현황을 불러오지 못했어요.</p>
        <p className="mt-1.5 text-[12px] text-[#6B746D]">{error ?? "잠시 후 다시 시도해 주세요."}</p>
        <button
          className="mt-3 h-11 w-full rounded-[12px] bg-[#0F1412] text-[13px] font-bold text-white"
          onClick={onRefresh}
          type="button"
        >
          다시 불러오기
        </button>
      </div>
    );
  }

  const revenue = state.overview.revenue;
  const machine = state.overview.machine;
  const pending = state.proposals.filter(
    (proposal) => proposal.status === "pending_approval" || proposal.status === "grace_cancel_window",
  );
  const core = pending.filter((proposal) => ["bean-10kg", "toner-black", "toner-color", "a4-paper"].includes(proposal.sku));
  const coreAmount = core.reduce((sum, proposal) => sum + proposal.amount, 0);

  const cafeForecasts = state.run.forecasts.filter((forecast) => forecast.ownerEntityType === "franchisee_cafe");
  const printForecasts = state.run.forecasts.filter((forecast) => forecast.ownerEntityType === "hq_print");

  return (
    <div className="grid gap-3">
      <header className="px-1">
        <p className="text-[12.5px] font-semibold text-[#007A36]">{state.storeLabel}</p>
        <h1 className="mt-1 text-[23px] font-bold leading-[1.25] tracking-[-0.02em] text-[#0F1412]">
          원두·토너·용지,
          <br />
          채울 때가 됐어요
        </h1>
        <p className="mt-1 text-[11.5px] text-[#6B746D]">
          {dateLabel(state.asOfDate)} POS 마감 · {revenue?.source === "portal" ? "포털 실측" : "데모 기준"}
        </p>
      </header>

      <section className="rounded-[22px] border-2 border-[#0F1412] bg-white p-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold text-[#0F1412]">지금 채울 3가지</h2>
          <span className="text-[10.5px] text-[#6B746D]">{dateLabel(state.asOfDate)} 기준</span>
        </div>
        <div className="mt-2">
          <CoreStockCards
            forecasts={state.run.forecasts}
            telemetry={state.telemetry}
            thresholds={{ beanDays: 4, tonerDays: 5, paperDays: 4 }}
          />
        </div>

        <button
          className="mt-3 h-[56px] w-full rounded-[16px] bg-[#1DFF26] text-[16px] font-bold text-[#0F1412]"
          onClick={onGoOrder}
          type="button"
        >
          {state.hold ? "이상 내용 보기" : core.length > 0 ? `3종 발주 · ${won(coreAmount)} →` : "발주 화면 열기"}
        </button>
        <p className="mt-1.5 text-center text-[10.5px] text-[#6B746D]">
          {pending.length > core.length ? `기타 ${pending.length - core.length}종은 발주 화면에서 ` : ""}
          승인 후 5분간 취소할 수 있어요
        </p>
      </section>

      {(state.hold || (machine?.alerts.length ?? 0) > 0) ? (
        <details className="rounded-[12px] border border-[#E6E9E7] bg-white px-3 py-2">
          <summary className="flex cursor-pointer items-center justify-between text-[11.5px] font-bold text-[#3B4740]">
            시스템 상태 · 알림 보기
            <span className="rounded-full bg-[#FFF6E0] px-2 py-0.5 text-[9.5px] font-bold text-[#8A5A00]">
              알림 {(state.hold ? 1 : 0) + (machine?.alerts.length ?? 0)}
            </span>
          </summary>
          {state.hold ? (
            <p className="mt-1.5 rounded-[8px] bg-[#FFF9EA] px-2.5 py-1.5 text-[10.5px] leading-[1.5] text-[#8A5A00]">
              {state.anomalies[0]?.title} — {state.anomalies[0]?.message}
            </p>
          ) : null}
          {(machine?.alerts ?? []).map((alert) => (
            <p key={alert} className="mt-1.5 rounded-[8px] bg-[#F8F9F9] px-2.5 py-1.5 text-[10.5px] text-[#3B4740]">
              {alert}
            </p>
          ))}
        </details>
      ) : null}

      <section className="rounded-[18px] bg-[#0F1412] px-4 py-3.5 text-white">
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] font-semibold text-[#9AA39C]">이달 매출</span>
          <span className="text-[10.5px] text-[#9AA39C]">{revenue?.source === "portal" ? "포털 실측" : "데모"}</span>
        </div>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-[27px] font-bold leading-none tabular-nums tracking-[-0.02em]">
            {revenue?.cafeToday != null ? won(revenue.cafeToday) : "—"}
          </span>
          <span className="text-[10.5px] text-[#9AA39C]">오늘 카페</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px] text-[#C8D0CA]">
          <span className="rounded-full bg-white/10 px-2 py-0.5">이달 카페 {revenue?.cafeMonth != null ? won(revenue.cafeMonth) : "—"}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5">이달 프린트 {revenue?.printMonth != null ? won(revenue.printMonth) : "정산 전"}</span>
        </div>
      </section>


      <details className="rounded-[16px] border border-[#E6E9E7] bg-white px-3.5 py-3">
        <summary className="cursor-pointer text-[13px] font-bold text-[#3B4740]">전체 품목 보기 (3종 외)</summary>
        <div className="mt-2 grid gap-2">
          <div>
            <p className="text-[10.5px] font-bold text-[#6B746D]">카페 · 점주 사업자</p>
            <ul className="mt-1 divide-y divide-[#F4F5F6]">
              {cafeForecasts.map((forecast) => (
                <li key={forecast.sku} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[#3B4740]">{forecast.name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${remainingTone(forecast.remainingDays)}`}>
                    {days(forecast.remainingDays)}
                  </span>
                  <span className="w-[62px] shrink-0 text-right text-[10px] text-[#98A29B]">{ENTITY_LABEL[forecast.ownerEntityType].replace(" 사업자", "")}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10.5px] font-bold text-[#6B746D]">프린트 · 본사 사업자</p>
            <ul className="mt-1 divide-y divide-[#F4F5F6]">
              {printForecasts.map((forecast) => (
                <li key={forecast.sku} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[#3B4740]">{forecast.name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${remainingTone(forecast.remainingDays)}`}>
                    {days(forecast.remainingDays)}
                  </span>
                  <span className="w-[62px] shrink-0 text-right text-[10px] text-[#98A29B]">{ENTITY_LABEL[forecast.ownerEntityType].replace(" 사업자", "")}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[10px] leading-[1.6] text-[#98A29B]">
            교차 보정 최대 ×{Math.max(...state.run.forecasts.map((item) => item.crossFactor)).toFixed(2)} · 음료 {pct(state.run.cafeRecentRatio - 1)} · 프린트{" "}
            {pct(state.run.printRecentRatio - 1)}
          </p>
        </div>
      </details>

      <div className="grid grid-cols-2 gap-2">
        <button
          className="h-11 rounded-[12px] border border-[#E6E9E7] bg-white text-[12.5px] font-semibold text-[#3B4740]"
          onClick={onGoHq}
          type="button"
        >
          분기·근거 보기
        </button>
        <a
          className="flex h-11 items-center justify-center rounded-[12px] border border-[#E6E9E7] bg-white text-[12.5px] font-semibold text-[#007A36]"
          href="/sales-report"
        >
          매출 리포트
        </a>
      </div>

      {state.dataQuality.sparse ? (
        <p className="rounded-[12px] bg-[#FFF9EA] px-3 py-2 text-[11px] leading-[1.5] text-[#8A5A00]">
          실측 {state.dataQuality.days}일치로 계산했습니다. 7일 이상 쌓이면 교차예측이 안정됩니다.
        </p>
      ) : null}

      <p className="text-[10px] text-[#98A29B]">
        데이터: {state.dataSource === "supabase" ? "Supabase POS 마감" : state.dataSource === "memory" ? "방금 입력한 마감" : "데모 실측 폴백"}
      </p>
    </div>
  );
}
