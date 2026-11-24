"use client";

import { Card, CardBody, CardHead, Chip, Row, RowList, SUMMARY_ROW } from "@/components/internal/card-ui";
import type { ProposalListResponse } from "@/features/auto-order/types";

import CoreStockCards from "./CoreStockCards";
import { dateLabel, days, ENTITY_LABEL, pct, won } from "./format";

/**
 * 통합 현황 — 토스 앱식 카드 화면. 첫 화면은 원두·토너·용지 3종과 발주 버튼뿐.
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
        <div className="h-[150px] animate-pulse rounded-[24px] bg-white" />
        <div className="h-[200px] animate-pulse rounded-[24px] bg-white" />
      </div>
    );
  }

  if (error || !state) {
    return (
      <Card className="px-6 py-8 text-center">
        <p className="text-[16px] font-bold text-[#0F1412]">현황을 불러오지 못했어요</p>
        <p className="mt-2 text-[12px] leading-[1.55] text-[#8B948D]">{error ?? "잠시 후 다시 시도해 주세요."}</p>
        <button className="mt-4 h-12 w-full rounded-[14px] bg-[#0F1412] text-[13.5px] font-bold text-white" onClick={onRefresh} type="button">
          다시 불러오기
        </button>
      </Card>
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
  const alertCount = (state.hold ? 1 : 0) + (machine?.alerts.length ?? 0);

  return (
    <div className="grid gap-3">
      <header className="px-1">
        <p className="text-[12px] font-bold text-[#0B5C2A]">{state.storeLabel}</p>
        <h1 className="mt-1.5 text-[24px] font-bold leading-[1.3] tracking-[-0.03em] text-[#0F1412]">
          원두·토너·용지,
          <br />
          채울 때가 됐어요
        </h1>
        <p className="mt-1.5 text-[12px] font-medium text-[#8B948D]">
          {dateLabel(state.asOfDate)} POS 마감 · {revenue?.source === "portal" ? "포털 실측" : "데모 기준"}
        </p>
      </header>

      <Card>
        <CardHead
          right={<span className="text-[10.5px] font-semibold text-[#A7AFA9]">{dateLabel(state.asOfDate)} 기준</span>}
          sub="잔여일이 기준 안으로 들어오면 발주를 제안해요"
          title="채울 때가 됐어요"
        />
        <CardBody className="pt-2">
          <CoreStockCards
            forecasts={state.run.forecasts}
            telemetry={state.telemetry}
            thresholds={{ beanDays: 4, tonerDays: 5, paperDays: 4 }}
          />

          <button
            className={`mt-4 flex h-[56px] w-full items-center justify-center rounded-[16px] text-[16px] font-bold tracking-[-0.01em] ${
              state.hold ? "bg-[#F2F4F6] text-[#6B746D]" : "bg-[#1DFF26] text-[#0F1412]"
            }`}
            onClick={onGoOrder}
            type="button"
          >
            {state.hold ? "이상 내용 확인하기" : core.length > 0 ? `버튼 한 번으로 발주 · ${won(coreAmount)}` : "발주 화면 열기"}
          </button>
          <p className="mt-2 text-center text-[10.5px] font-medium text-[#A7AFA9]">
            {pending.length > core.length ? `기타 ${pending.length - core.length}종은 발주 화면에서 · ` : ""}
            누르면 5분 동안 취소할 수 있어요
          </p>
        </CardBody>
      </Card>

      {alertCount > 0 ? (
        <Card>
          <details className="group">
            <summary className={SUMMARY_ROW}>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-[#0F1412]">확인할 것</span>
                <span className="mt-0.5 block truncate text-[11.5px] font-medium text-[#8B948D]">
                  {state.hold ? "이상 감지로 발주를 멈췄어요" : "장비·연결 알림이에요"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Chip tone="amber">알림 {alertCount}</Chip>
                <span aria-hidden className="text-[16px] font-bold text-[#C2C9C4] transition-transform group-open:rotate-90">
                  ›
                </span>
              </span>
            </summary>
            <div className="border-t border-[#F1F3F2] px-5 py-4">
              {state.hold ? (
                <p className="rounded-[14px] bg-[#FFF8E6] px-3.5 py-2.5 text-[11px] leading-[1.55] text-[#8A5A00]">
                  {state.anomalies[0]?.title} — {state.anomalies[0]?.message}
                </p>
              ) : null}
              {(machine?.alerts ?? []).map((alert) => (
                <p key={alert} className="mt-1.5 rounded-[14px] bg-[#F7F8F9] px-3.5 py-2.5 text-[11px] leading-[1.55] text-[#3B4740]">
                  {alert}
                </p>
              ))}
            </div>
          </details>
        </Card>
      ) : null}

      <Card className="px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#6B746D]">오늘 카페 매출</p>
            <p className="mt-2 text-[30px] font-bold leading-none tabular-nums tracking-[0.03em] text-[#0F1412]">
              {revenue?.cafeToday != null ? won(revenue.cafeToday) : "—"}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Chip tone="gray">이달 카페 {revenue?.cafeMonth != null ? won(revenue.cafeMonth) : "—"}</Chip>
              <Chip tone="gray">이달 프린트 {revenue?.printMonth != null ? won(revenue.printMonth) : "정산 전"}</Chip>
            </div>
          </div>
          <Chip tone={revenue?.source === "portal" ? "green" : "amber"}>
            {revenue?.source === "portal" ? "포털 실측" : "데모"}
          </Chip>
        </div>
      </Card>

      <Card>
        <details className="group">
          <summary className={SUMMARY_ROW}>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-[#0F1412]">전체 품목 보기</span>
              <span className="mt-0.5 block truncate text-[11.5px] font-medium text-[#8B948D]">
                원두·토너·용지 외 {state.run.forecasts.length - 3}종
              </span>
            </span>
            <span aria-hidden className="text-[16px] font-bold text-[#C2C9C4] transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>

          <div className="border-t border-[#F1F3F2] px-5 py-4">
            <p className="text-[10.5px] font-bold text-[#A7AFA9]">카페 · 점주 사업자</p>
            <RowList className="mt-1">
              {cafeForecasts.map((forecast) => (
                <Row
                  key={forecast.sku}
                  chip={ENTITY_LABEL[forecast.ownerEntityType].replace(" 사업자", "")}
                  chipTone="green"
                  label={forecast.name}
                  value={days(forecast.remainingDays)}
                />
              ))}
            </RowList>

            <p className="mt-3 text-[10.5px] font-bold text-[#A7AFA9]">프린트 · 본사 사업자</p>
            <RowList className="mt-1">
              {printForecasts.map((forecast) => (
                <Row
                  key={forecast.sku}
                  chip={ENTITY_LABEL[forecast.ownerEntityType].replace(" 사업자", "")}
                  chipTone="blue"
                  label={forecast.name}
                  value={days(forecast.remainingDays)}
                />
              ))}
            </RowList>

            <p className="mt-2 text-[10px] leading-[1.6] text-[#A7AFA9]">
              교차 보정 최대 ×{Math.max(...state.run.forecasts.map((item) => item.crossFactor)).toFixed(2)} · 음료{" "}
              {pct(state.run.cafeRecentRatio - 1)} · 프린트 {pct(state.run.printRecentRatio - 1)}
            </p>
          </div>
        </details>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <button
          className="h-12 rounded-[14px] bg-white text-[12.5px] font-bold text-[#3B4740] shadow-[0_1px_2px_rgba(15,20,18,0.04)]"
          onClick={onGoHq}
          type="button"
        >
          분기·근거 보기
        </button>
        <a
          className="flex h-12 items-center justify-center rounded-[14px] bg-white text-[12.5px] font-bold text-[#0B5C2A] shadow-[0_1px_2px_rgba(15,20,18,0.04)]"
          href="/sales-report"
        >
          매출 리포트
        </a>
      </div>

      {state.dataQuality.sparse ? (
        <p className="rounded-[16px] bg-[#FFF8E6] px-4 py-3 text-[11px] leading-[1.55] text-[#8A5A00]">
          실측 {state.dataQuality.days}일치로 계산했어요. 7일 이상 쌓이면 교차예측이 안정돼요.
        </p>
      ) : null}

      <p className="px-1 text-[10px] leading-[1.6] text-[#B0B7B2]">
        데이터: {state.dataSource === "supabase" ? "Supabase POS 마감" : state.dataSource === "memory" ? "방금 입력한 마감" : "데모 실측 폴백"}
      </p>
    </div>
  );
}
