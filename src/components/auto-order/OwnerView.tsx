"use client";

import { Card, CardBody, CardHead, CTA, Chip, Row, RowList, SUMMARY_ROW } from "@/components/internal/card-ui";
import type { ApprovalView, ProposalListResponse } from "@/features/auto-order/types";

import CoreStockCards from "./CoreStockCards";
import SplitSlips from "./SplitSlips";
import { clock, dateLabel, days, packUnit, pct, shortEvidence, won } from "./format";

type OwnerViewProps = {
  state: ProposalListResponse | null;
  loading: boolean;
  error: string | null;
  approval: ApprovalView | null;
  remainingSeconds: number;
  busy: boolean;
  notice: string | null;
  onApprove: () => void;
  onCancel: () => void;
  onRefresh: () => void;
  /** 교체완료 — 잔량 100% + 소진 속도 학습 */
  onCalibrate?: (sku: string) => void;
  calibrating?: string | null;
  replacementNotes?: Record<string, string>;
};

/**
 * 발주 승인(점주) — 토스 앱식 카드 화면.
 *
 *  ① 채울 것: 원두·토너·용지 세 줄
 *  ② 이번 발주: 총액 하나 크게 + 품목 줄 + 원터치 승인(5분 취소 유예)
 *  ③ 접이식: 왜 이 발주가 나왔는지
 */

export default function OwnerView({
  state,
  loading,
  error,
  approval,
  remainingSeconds,
  busy,
  notice,
  onApprove,
  onCancel,
  onRefresh,
  onCalibrate,
  calibrating,
  replacementNotes,
}: OwnerViewProps) {
  if (loading && !state) {
    return (
      <div className="grid gap-3">
        <div className="h-[120px] animate-pulse rounded-[24px] bg-white" />
        <div className="h-[320px] animate-pulse rounded-[24px] bg-white" />
      </div>
    );
  }

  if (error || !state) {
    return (
      <Card className="px-6 py-8 text-center">
        <p className="text-[16px] font-bold text-[#0F1412]">발주 정보를 불러오지 못했어요</p>
        <p className="mt-2 text-[12.5px] leading-[1.55] text-[#8B948D]">{error ?? "잠시 후 다시 시도해 주세요."}</p>
        <button className="mt-4 h-12 w-full rounded-[14px] bg-[#0F1412] text-[14px] font-bold text-white" onClick={onRefresh} type="button">
          다시 불러오기
        </button>
      </Card>
    );
  }

  const pending = state.proposals.filter(
    (proposal) => proposal.status === "pending_approval" || proposal.status === "grace_cancel_window",
  );
  const CORE_ORDER = ["bean-10kg", "toner-black", "toner-color", "a4-paper"];
  const sortedPending = [...pending].sort((a, b) => {
    const aIndex = CORE_ORDER.indexOf(a.sku);
    const bIndex = CORE_ORDER.indexOf(b.sku);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex) || a.remainingDays - b.remainingDays;
  });
  const coreCount = pending.filter((proposal) => CORE_ORDER.includes(proposal.sku)).length;
  const grace = approval?.status === "grace_cancel_window";
  const showOrderCard = !state.hold && pending.length > 0 && !grace && !approval;

  return (
    <div className="grid gap-3">
      <header className="px-1">
        <p className="text-[12px] font-bold text-[#0B5C2A]">{state.storeLabel}</p>
        <h1 className="mt-1.5 text-[24px] font-bold leading-[1.3] tracking-[-0.03em] text-[#0F1412] sm:text-[27px]">
          {state.hold
            ? "발주를 잠시 멈췄어요"
            : pending.length > 0
              ? `이번 주에 채울 게 ${pending.length}개 있어요`
              : "지금은 채울 게 없어요"}
        </h1>
        <p className="mt-1.5 text-[12px] font-medium leading-[1.5] text-[#8B948D]">
          {dateLabel(state.asOfDate)} 마감 기준 · 카페 매출과 프린트 출력을 함께 계산했어요
        </p>
      </header>

      <Card>
        <CardHead
          right={<Chip tone="gray">원두 · 토너 · 용지</Chip>}
          sub="잔여일이 기준 안이면 발주를 제안해요"
          title="채울 때가 됐어요"
        />
        <CardBody className="pt-2">
          <CoreStockCards
            calibrating={calibrating}
            forecasts={state.run.forecasts}
            onCalibrate={state.storeRegistered === false ? undefined : onCalibrate}
            replacementNotes={replacementNotes}
            telemetry={state.telemetry}
            thresholds={{ beanDays: 4, tonerDays: 5, paperDays: 4 }}
          />
        </CardBody>
      </Card>

      {state.dataQuality.sparse ? (
        <p className="rounded-[16px] bg-[#FFF8E6] px-4 py-3 text-[11.5px] font-medium leading-[1.55] text-[#8A5A00]">
          실측 {state.dataQuality.days}일치로 계산했어요. 7일 이상 쌓이면 예측이 안정돼요.
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-[16px] bg-[#EDFBEF] px-4 py-3 text-[12.5px] font-semibold leading-[1.5] text-[#0B5C2A]">
          {notice}
        </p>
      ) : null}

      {state.hold ? (
        <Card>
          <details className="group">
            <summary className={SUMMARY_ROW}>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-[#0F1412]">발주를 멈춘 이유</span>
                <span className="mt-0.5 block truncate text-[11.5px] font-medium text-[#8B948D]">
                  {state.anomalies[0]?.title ?? "이상 감지"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Chip tone="amber">보류</Chip>
                <span aria-hidden className="text-[16px] font-bold text-[#C2C9C4] transition-transform group-open:rotate-90">
                  ›
                </span>
              </span>
            </summary>
            <div className="border-t border-[#F1F3F2] px-5 py-4">
              <p className="text-[12px] font-bold text-[#8A5A00]">{state.anomalies[0]?.title}</p>
              <p className="mt-1 text-[11.5px] leading-[1.6] text-[#3B4740]">{state.anomalies[0]?.message}</p>
              <p className="mt-2 text-[10.5px] tabular-nums text-[#8A5A00]">
                음료 {pct(state.run.cafeRecentRatio - 1)} · 프린트 {pct(state.run.printRecentRatio - 1)}
              </p>
            </div>
          </details>
        </Card>
      ) : null}

      {approval && grace ? (
        <div className="rounded-[24px] bg-[#0F1412] px-5 py-5 text-white">
          <p className="text-[12.5px] font-bold text-[#1DFF26]">아직 주문 전이에요</p>
          <p className="mt-1 text-[12px] leading-[1.5] text-[#C8D0CA]">5분 안이면 취소할 수 있어요</p>

          <p className="mt-4 text-center text-[58px] font-bold leading-none tabular-nums tracking-[-0.04em]">
            {clock(remainingSeconds)}
          </p>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-[#1DFF26] transition-[width] duration-300"
              style={{ width: `${Math.max(0, Math.min(100, (remainingSeconds / Math.max(1, approval.graceSeconds)) * 100))}%` }}
            />
          </div>

          <p className="mt-4 text-center text-[11.5px] leading-[1.6] text-[#C8D0CA]">
            5분이 지나면 점주 사업자와 본사 사업자로 나뉘어
            <br />
            자동으로 확정되고, 세금계산서 발행 대상도 함께 정해져요.
          </p>

          <button
            className="mt-4 h-14 w-full rounded-[16px] border border-[#FF6B6B] text-[16px] font-bold text-[#FF8A8A] disabled:opacity-60"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            {busy ? "취소하는 중…" : "발주 취소하기"}
          </button>
        </div>
      ) : null}

      {approval && approval.status === "confirmed_split" ? (
        <div className="rounded-[24px] bg-[#EDFBEF] px-5 py-5">
          <p className="text-[12px] font-bold text-[#0B5C2A]">발주 확정 완료</p>
          <h2 className="mt-1 text-[20px] font-bold leading-[1.3] tracking-[-0.02em] text-[#0F1412]">
            사업자별로 나눠 담았어요
          </h2>
          <p className="mt-1.5 text-[11.5px] leading-[1.55] text-[#3B4740]">
            총 {won(approval.splitPreview.totalAmount)} · 세금계산서는 공급처가 각 사업자 앞으로 발행해요.
          </p>
          <div className="mt-3">
            <SplitSlips compact split={approval.splitPreview} />
          </div>
          <button
            className="mt-3 h-12 w-full rounded-[14px] bg-white text-[13.5px] font-bold text-[#0B5C2A]"
            onClick={onRefresh}
            type="button"
          >
            다음 발주 확인
          </button>
        </div>
      ) : null}

      {showOrderCard ? (
        <Card>
          <CardHead
            right={<span className="text-[10.5px] font-semibold text-[#A7AFA9]">{dateLabel(state.asOfDate)} 기준</span>}
            sub={`${pending.length}개 품목 · 3종 ${coreCount}개 포함`}
            title="이번 발주"
          />
          <CardBody className="pt-3">
            <p className="text-[34px] font-bold leading-none tabular-nums tracking-[-0.035em] text-[#0F1412]">
              {won(state.totals.totalAmount)}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Chip tone="gray">점주 부담 {won(state.totals.cafeAmount)}</Chip>
              <Chip tone="gray">본사 부담 {won(state.totals.hqAmount)}</Chip>
            </div>

            <RowList className="mt-4 border-t border-[#F1F3F2]">
              {sortedPending.slice(0, 4).map((proposal) => (
                <Row
                  key={proposal.id}
                  label={proposal.name}
                  sub={`약 ${days(proposal.remainingDays)} 남음 · ${shortEvidence(proposal.evidenceLine)}`}
                  value={`${proposal.quantity}${packUnit(proposal.packLabel)}`}
                  valueSub={won(proposal.amount)}
                />
              ))}
            </RowList>

            {pending.length > 4 ? (
              <p className="mt-2 text-[10.5px] font-medium text-[#A7AFA9]">
                원두·토너·용지 외 {pending.length - 4}종은 아래 &lsquo;발주 승인&rsquo; 상세에 있어요.
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {showOrderCard ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#EBEEF0] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto w-full max-w-[760px] px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-semibold text-[#6B746D]">
                총 <span className="text-[17px] font-bold tabular-nums text-[#0F1412]">{won(state.totals.totalAmount)}</span>
                <span className="ml-1.5 text-[10.5px] text-[#A7AFA9]">3종 {coreCount}개 포함</span>
              </span>
              <span className="text-[10.5px] font-medium text-[#A7AFA9]">5분 동안 취소할 수 있어요</span>
            </div>
            <button className={`${CTA} mt-2`} disabled={busy} onClick={onApprove} type="button">
              {busy ? "발주하는 중…" : "이대로 발주하기"}
            </button>
          </div>
        </div>
      ) : null}

      {!state.hold && pending.length > 0 && !grace ? (
        <Card>
          <details className="group">
            <summary className={SUMMARY_ROW}>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-[#0F1412]">왜 이 발주가 나왔나요?</span>
                <span className="mt-0.5 block truncate text-[11.5px] font-medium text-[#8B948D]">
                  품목마다 계산 근거를 적어 뒀어요
                </span>
              </span>
              <span aria-hidden className="text-[16px] font-bold text-[#C2C9C4] transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <ul className="divide-y divide-[#F1F3F2] border-t border-[#F1F3F2] px-5">
              {pending.map((proposal) => (
                <li key={proposal.id} className="py-3">
                  <p className="text-[13px] font-bold text-[#0F1412]">{proposal.name}</p>
                  <p className="mt-1 text-[11px] leading-[1.6] text-[#8B948D]">
                    {proposal.reason} {proposal.evidenceLine}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        </Card>
      ) : null}

      {!state.hold && pending.length === 0 && !approval ? (
        <Card className="px-6 py-8 text-center">
          <p className="text-[15px] font-bold text-[#0F1412]">다음 발주 시점을 계속 보고 있어요</p>
          <p className="mt-2 text-[12px] leading-[1.55] text-[#8B948D]">
            잔여일이 리드타임 안으로 들어오면 이 화면에 카드가 먼저 나타나요.
          </p>
          <button className="mt-4 h-12 w-full rounded-[14px] bg-[#0F1412] text-[13.5px] font-bold text-white" onClick={onRefresh} type="button">
            지금 다시 계산
          </button>
        </Card>
      ) : null}

      <div aria-hidden className={showOrderCard ? "h-36" : "h-0"} />

      <p className="px-1 text-[10px] leading-[1.6] text-[#B0B7B2]">
        데이터 출처:{" "}
        {state.dataSource === "supabase"
          ? "Supabase POS 마감"
          : state.dataSource === "memory"
            ? "방금 입력한 POS 마감"
            : "데모 실측 폴백(Supabase SQL 미적용)"}
        · 14일 창 · 교차 보정 적용
      </p>
    </div>
  );
}
