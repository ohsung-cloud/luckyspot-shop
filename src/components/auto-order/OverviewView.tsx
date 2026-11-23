"use client";

import type { ProposalListResponse } from "@/features/auto-order/types";

import { dateLabel, days, ENTITY_LABEL, ENTITY_TONE, pct, remainingTone, won } from "./format";

/**
 * 통합 현황 — 프린트(에스칼프린트)·커피(로얄선즈)·발주를 한 화면에서 본다.
 *
 * 위에서 아래로: 통합 매출 → 소모품 잔량(프린트 %·카페 잔여일) → 기계 상태 → 추천 발주로 이동.
 * 점주가 세 사이트를 오가지 않고 "오늘 얼마 벌었고, 무엇이 떨어졌고, 무엇을 시켜야 하는지"를
 * 한 번에 판단하게 하는 것이 목적이다.
 */

type OverviewProps = {
  state: ProposalListResponse | null;
  loading: boolean;
  error: string | null;
  onGoOrder: () => void;
  onGoHq: () => void;
  onRefresh: () => void;
};

function levelTone(pctValue: number | null) {
  if (pctValue === null) return "bg-[#E6E9E7]";
  if (pctValue <= 20) return "bg-[#E5484D]";
  if (pctValue <= 40) return "bg-[#E0A800]";
  return "bg-[#1D9F4C]";
}

function Gauge({ label, pctValue }: { label: string; pctValue: number | null }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-semibold text-[#3B4740]">{label}</span>
        <span className="text-[12.5px] font-bold tabular-nums text-[#0F1412]">
          {pctValue === null ? "—" : `${Math.round(pctValue)}%`}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#EFF1F0]">
        <div
          className={`h-full rounded-full ${levelTone(pctValue)}`}
          style={{ width: `${pctValue === null ? 0 : Math.max(2, Math.min(100, pctValue))}%` }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[14px] bg-white/8 px-3 py-3">
      <p className="text-[11px] text-[#9AA39C]">{label}</p>
      <p className="mt-1 text-[17px] font-bold tabular-nums text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-[10.5px] text-[#9AA39C]">{hint}</p> : null}
    </div>
  );
}

export default function OverviewView({ state, loading, error, onGoOrder, onGoHq, onRefresh }: OverviewProps) {
  if (loading && !state) {
    return (
      <div className="grid gap-3">
        <div className="h-[150px] animate-pulse rounded-[24px] bg-white" />
        <div className="h-[260px] animate-pulse rounded-[24px] bg-white" />
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="rounded-[24px] border border-[#E6E9E7] bg-white p-6 text-center">
        <p className="text-[16px] font-semibold text-[#0F1412]">현황을 불러오지 못했어요.</p>
        <p className="mt-2 text-[13px] text-[#6B746D]">{error ?? "잠시 후 다시 시도해 주세요."}</p>
        <button
          className="mt-4 h-12 w-full rounded-[14px] bg-[#0F1412] text-[15px] font-bold text-white"
          onClick={onRefresh}
          type="button"
        >
          다시 불러오기
        </button>
      </div>
    );
  }

  const revenue = state.overview.revenue;
  const telemetry = state.telemetry;
  const machine = state.overview.machine;

  const pending = state.proposals.filter(
    (proposal) => proposal.status === "pending_approval" || proposal.status === "grace_cancel_window",
  );

  const cafeForecasts = state.run.forecasts.filter((forecast) => forecast.ownerEntityType === "franchisee_cafe");
  const printForecasts = state.run.forecasts.filter((forecast) => forecast.ownerEntityType === "hq_print");

  const monthTotal =
    revenue && (revenue.cafeMonth !== null || revenue.printMonth !== null)
      ? (revenue.cafeMonth ?? 0) + (revenue.printMonth ?? 0)
      : null;

  const todayDelta =
    revenue && revenue.cafeToday !== null && revenue.cafeYesterday !== null && revenue.cafeYesterday > 0
      ? revenue.cafeToday / revenue.cafeYesterday - 1
      : null;

  return (
    <div className="grid gap-4">
      <header className="px-1">
        <p className="text-[14px] font-semibold text-[#007A36]">{state.storeLabel}</p>
        <h1 className="mt-1.5 text-[26px] font-bold leading-[1.3] tracking-[-0.02em] text-[#0F1412] sm:text-[30px]">
          오늘 매출과 남은 소모품,
          <br />
          한 화면에서 봅니다
        </h1>
        <p className="mt-1.5 text-[13px] text-[#6B746D]">
          {dateLabel(state.asOfDate)} POS 마감 ·{" "}
          {revenue?.source === "portal" ? "에스칼프린트 · 로얄선즈 실측" : "데모 실측 폴백"}
        </p>
      </header>

      {state.dataQuality.sparse ? (
        <p className="rounded-[14px] bg-[#FFF9EA] px-4 py-3 text-[12px] leading-[1.6] text-[#8A5A00]">
          실측 {state.dataQuality.days}일치로 계산했습니다. 7일 이상 쌓이면 교차예측이 안정됩니다.
        </p>
      ) : null}

      <section className="rounded-[24px] bg-[#0F1412] p-5 text-white">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-[#1DFF26] px-2.5 py-1 text-[11.5px] font-bold text-[#0F1412]">
            통합 매출
          </span>
          <span className="text-[11.5px] text-[#9AA39C]">
            {revenue?.source === "portal" ? "포털 실측" : "데모 기준"}
          </span>
        </div>

        <p className="mt-4 text-[12px] text-[#9AA39C]">오늘 카페 매출</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <p className="text-[36px] font-bold leading-none tabular-nums tracking-[-0.02em] text-white">
            {revenue?.cafeToday !== null && revenue?.cafeToday !== undefined ? won(revenue.cafeToday) : "—"}
          </p>
          {todayDelta !== null ? (
            <span className={`text-[13px] font-bold ${todayDelta >= 0 ? "text-[#1DFF26]" : "text-[#FF8A8A]"}`}>
              {pct(todayDelta)}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[11.5px] text-[#9AA39C]">
          어제 {revenue?.cafeYesterday !== null && revenue?.cafeYesterday !== undefined ? won(revenue.cafeYesterday) : "—"}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-1.5">
          <Stat label="이달 카페" value={revenue?.cafeMonth != null ? won(revenue.cafeMonth) : "—"} />
          <Stat label="이달 프린트" value={revenue?.printMonth != null ? won(revenue.printMonth) : "—"} />
          <Stat
            label="이달 합계"
            value={monthTotal !== null ? won(monthTotal) : "—"}
            hint={state.dataSource === "demo" ? "데모 누적" : undefined}
          />
        </div>
      </section>

      <section className="rounded-[22px] border border-[#E6E9E7] bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[#0F1412]">프린트 장비 · 소모품 잔량</h2>
          <span className="text-[11.5px] text-[#6B746D]">{telemetry?.deviceModel ?? "포털 연동 전"}</span>
        </div>

        {telemetry ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
              <Gauge label="토너 K" pctValue={telemetry.toner.k} />
              <Gauge label="토너 C" pctValue={telemetry.toner.c} />
              <Gauge label="토너 M" pctValue={telemetry.toner.m} />
              <Gauge label="토너 Y" pctValue={telemetry.toner.y} />
              <Gauge label="용지 Tray1" pctValue={telemetry.paper.tray1} />
              <Gauge label="용지 Tray2" pctValue={telemetry.paper.tray2} />
            </div>
            <p className="mt-3 text-[11.5px] text-[#98A29B]">
              하루 3회 갱신 · 누적 출력{" "}
              {telemetry.cumulativePrintCount !== null
                ? `${telemetry.cumulativePrintCount.toLocaleString("ko-KR")}매`
                : "—"}
              {telemetry.capturedAt ? ` · ${new Date(telemetry.capturedAt).toLocaleString("ko-KR", { hour12: false })} 기준` : ""}
            </p>
          </>
        ) : (
          <p className="mt-2 rounded-[14px] bg-[#F4F5F6] px-4 py-4 text-[12.5px] leading-[1.6] text-[#6B746D]">
            에스칼프린트 포털 스냅샷이 아직 없습니다. 수집기가 첫 스냅샷을 보내면 토너 K/C/M/Y와 용지 트레이 %가
            여기에 그대로 표시됩니다. 그전에는 아래 계산값으로 판단합니다.
          </p>
        )}

        <div className="mt-3 space-y-2 border-t border-dashed border-[#E6E9E7] pt-3">
          {printForecasts.map((forecast) => (
            <div key={forecast.sku} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] text-[#3B4740]">{forecast.name}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${remainingTone(forecast.remainingDays)}`}>
                약 {days(forecast.remainingDays)} 남음
              </span>
              <span className="w-[74px] shrink-0 text-right text-[11px] text-[#98A29B]">
                {ENTITY_LABEL[forecast.ownerEntityType].replace(" 사업자", "")}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[22px] border border-[#E6E9E7] bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[#0F1412]">카페 소모품 잔여</h2>
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${ENTITY_TONE.franchisee_cafe}`}>
            점주 사업자
          </span>
        </div>

        <ul className="mt-3 divide-y divide-[#F4F5F6]">
          {cafeForecasts.map((forecast) => (
            <li key={forecast.sku} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-[#0F1412]">{forecast.name}</p>
                <p className="mt-0.5 truncate text-[11px] text-[#98A29B]">
                  하루 {forecast.predictedDailyConsumption.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}
                  {forecast.stockUnit}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${remainingTone(forecast.remainingDays)}`}>
                약 {days(forecast.remainingDays)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {machine ? (
        <section className="rounded-[22px] border border-[#E6E9E7] bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-[#0F1412]">커피 머신 상태</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                machine.online === false ? "bg-[#FFEBEE] text-[#B3261E]" : "bg-[#EDFBEF] text-[#0B5C2A]"
              }`}
            >
              {machine.online === false ? "오프라인" : machine.online === true ? "온라인" : "상태 미수신"}
            </span>
          </div>
          {machine.alerts.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {machine.alerts.map((alert) => (
                <li key={alert} className="rounded-[12px] bg-[#FFF9EA] px-3 py-2 text-[12.5px] text-[#8A5A00]">
                  {alert}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-[#6B746D]">재료 부족·기계 알림이 없습니다.</p>
          )}
        </section>
      ) : null}

      <section className="rounded-[24px] border-2 border-[#0F1412] bg-white p-5">
        <p className="text-[12.5px] font-semibold text-[#6B746D]">다음 할 일</p>
        <h2 className="mt-1 text-[21px] font-bold text-[#0F1412]">
          {state.hold
            ? "이상 감지로 발주를 멈췄어요"
            : pending.length > 0
              ? `추천 발주 ${pending.length}건 · ${won(state.totals.totalAmount)}`
              : "지금 채울 소모품은 없어요"}
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-[1.6] text-[#6B746D]">
          교차예측이 리드타임 안으로 들어온 품목만 골랐습니다. 승인하면 점주·본사 사업자 발주로 나뉩니다.
        </p>

        <button
          className="mt-4 h-[64px] w-full rounded-[18px] bg-[#1DFF26] text-[19px] font-bold text-[#0F1412] disabled:opacity-60"
          onClick={onGoOrder}
          type="button"
        >
          {state.hold ? "이상 내용 보기" : pending.length > 0 ? "추천 발주 확인하기" : "발주 화면 열기"}
        </button>
        <button
          className="mt-2 h-11 w-full rounded-[14px] border border-[#E6E9E7] text-[13px] font-semibold text-[#3B4740]"
          onClick={onGoHq}
          type="button"
        >
          사업자별 분기·예측 근거 보기
        </button>
        <a
          className="mt-2 flex h-11 w-full items-center justify-center rounded-[14px] text-[12.5px] font-semibold text-[#007A36] underline underline-offset-2"
          href="/sales-report"
        >
          수집된 전체 매출 리포트 보기
        </a>
      </section>
    </div>
  );
}
