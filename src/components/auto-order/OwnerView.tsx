"use client";

import type { ApprovalView, ProposalListResponse } from "@/features/auto-order/types";

import SplitSlips from "./SplitSlips";
import { clock, dateLabel, days, packUnit, pct, remainingTone, shortEvidence, won } from "./format";

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
};

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
}: OwnerViewProps) {
  if (loading && !state) {
    return (
      <div className="grid gap-3">
        <div className="h-[120px] animate-pulse rounded-[24px] bg-white" />
        <div className="h-[360px] animate-pulse rounded-[24px] bg-white" />
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="rounded-[24px] border border-[#E6E9E7] bg-white p-6 text-center">
        <p className="text-[16px] font-semibold text-[#0F1412]">예측을 불러오지 못했어요.</p>
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

  const pending = state.proposals.filter(
    (proposal) => proposal.status === "pending_approval" || proposal.status === "grace_cancel_window",
  );
  const grace = approval?.status === "grace_cancel_window";

  return (
    <div className="grid gap-4">
      <header className="px-1">
        <p className="text-[14px] font-semibold text-[#007A36]">{state.storeLabel}</p>
        <h1 className="mt-1.5 text-[27px] font-bold leading-[1.3] tracking-[-0.02em] text-[#0F1412] sm:text-[31px]">
          {state.hold
            ? "발주를 잠시 멈췄어요"
            : pending.length > 0
              ? `이번 주에 채울 소모품이 ${pending.length}개 있어요`
              : "지금은 채울 소모품이 없어요"}
        </h1>
        <p className="mt-1.5 text-[13px] text-[#6B746D]">
          {dateLabel(state.asOfDate)} 마감 기준 · 카페 매출과 프린트 출력을 함께 계산했어요
        </p>
      </header>

      {notice ? (
        <p className="rounded-[14px] bg-[#EDFBEF] px-4 py-3 text-[13.5px] font-semibold text-[#0B5C2A]">
          {notice}
        </p>
      ) : null}

      {state.hold ? (
        <section className="rounded-[24px] border-2 border-[#E0A800] bg-[#FFF9EA] p-5">
          <p className="text-[13px] font-bold text-[#8A5A00]">자동발주 보류 · 이상 감지</p>
          <h2 className="mt-1 text-[20px] font-bold text-[#0F1412]">{state.anomalies[0]?.title}</h2>
          <p className="mt-2 text-[14px] leading-[1.6] text-[#3B4740]">{state.anomalies[0]?.message}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-[14px] bg-white px-3 py-3 text-center">
              <p className="text-[11.5px] text-[#6B746D]">음료 판매</p>
              <p className="mt-1 text-[20px] font-bold tabular-nums text-[#0F1412]">
                {pct(state.run.cafeRecentRatio - 1)}
              </p>
            </div>
            <div className="rounded-[14px] bg-white px-3 py-3 text-center">
              <p className="text-[11.5px] text-[#6B746D]">프린트 출력</p>
              <p className="mt-1 text-[20px] font-bold tabular-nums text-[#0F1412]">
                {pct(state.run.printRecentRatio - 1)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-[#8A5A00]">
            소모품이 덜 나간 것이 아니라 기기·결제 신호일 수 있어, 승인 버튼을 잠갔습니다.
          </p>
        </section>
      ) : null}

      {approval && grace ? (
        <section className="rounded-[26px] border-2 border-[#0F1412] bg-[#0F1412] p-6 text-white">
          <p className="text-[13px] font-semibold text-[#1DFF26]">발주를 잠갔어요</p>
          <p className="mt-2 text-[15px] text-[#C8D0CA]">아직 주문되지 않았습니다. 5분 안이면 취소할 수 있어요.</p>

          <p className="mt-3 text-center text-[64px] font-bold leading-none tabular-nums tracking-[-0.03em] text-white">
            {clock(remainingSeconds)}
          </p>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-[#1DFF26] transition-[width] duration-300"
              style={{ width: `${Math.max(0, Math.min(100, (remainingSeconds / Math.max(1, approval.graceSeconds)) * 100))}%` }}
            />
          </div>

          <p className="mt-4 text-center text-[13px] leading-[1.6] text-[#C8D0CA]">
            5분이 지나면 점주 사업자와 본사 사업자로 나뉘어
            <br />
            자동 확정되고, 세금계산서 발행 대상도 함께 지정됩니다.
          </p>

          <button
            className="mt-5 h-[66px] w-full rounded-[18px] border-2 border-[#FF6B6B] bg-transparent text-[19px] font-bold text-[#FF8A8A] transition-colors hover:bg-[#FF6B6B]/10 disabled:opacity-60"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            {busy ? "취소하는 중…" : "발주 취소하기"}
          </button>
        </section>
      ) : null}

      {approval && approval.status === "confirmed_split" ? (
        <section className="rounded-[26px] border-2 border-[#007A36] bg-[#EDFBEF] p-5">
          <p className="text-[13px] font-bold text-[#0B5C2A]">발주 확정 완료</p>
          <h2 className="mt-1 text-[22px] font-bold text-[#0F1412]">
            사업자별로 나뉘어 발주됐어요
          </h2>
          <p className="mt-1.5 text-[13.5px] text-[#3B4740]">
            총 {won(approval.splitPreview.totalAmount)} · 세금계산서는 공급처가 각 사업자 앞으로 발행합니다.
          </p>
          <div className="mt-4">
            <SplitSlips split={approval.splitPreview} compact />
          </div>
          <button
            className="mt-4 h-12 w-full rounded-[14px] border border-[#B7D9C2] bg-white text-[14px] font-bold text-[#0B5C2A]"
            onClick={onRefresh}
            type="button"
          >
            다음 발주 확인
          </button>
        </section>
      ) : null}

      {!state.hold && pending.length > 0 && !grace && !approval ? (
        <section className="overflow-hidden rounded-[26px] border-2 border-[#0F1412] bg-white shadow-[0_16px_40px_rgba(15,20,18,0.10)]">
          <div className="bg-[#0F1412] px-5 py-4 text-white">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-[#1DFF26] px-2.5 py-1 text-[11.5px] font-bold text-[#0F1412]">
                원터치 발주
              </span>
              <span className="text-[12px] text-[#9AA39C]">{dateLabel(state.asOfDate)} 기준</span>
            </div>
            <p className="mt-5 text-[40px] font-bold leading-none tabular-nums tracking-[-0.03em]">
              {won(state.totals.totalAmount)}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12px]">
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[#DDE4DF]">
                점주 부담 {won(state.totals.cafeAmount)}
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[#DDE4DF]">
                본사 부담 {won(state.totals.hqAmount)}
              </span>
            </div>
          </div>

          <ul className="divide-y divide-[#EFF1F0]">
            {pending.map((proposal) => (
              <li key={proposal.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16.5px] font-bold text-[#0F1412]">{proposal.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[#6B746D]">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${remainingTone(proposal.remainingDays)}`}>
                      약 {days(proposal.remainingDays)} 남음
                    </span>
                    <span className="truncate">{shortEvidence(proposal.evidenceLine)}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[14px] font-bold tabular-nums text-[#0F1412]">{proposal.quantity}{packUnit(proposal.packLabel)}</p>
                  <p className="mt-0.5 text-[12px] tabular-nums text-[#6B746D]">{won(proposal.amount)}</p>
                </div>
              </li>
            ))}
          </ul>

        </section>
      ) : null}

      {!state.hold && pending.length > 0 && !grace && !approval ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E6E9E7] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto w-full max-w-[760px] px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold text-[#3B4740]">
                총 <span className="text-[17px] font-bold tabular-nums text-[#0F1412]">{won(state.totals.totalAmount)}</span>
              </span>
              <span className="text-[11.5px] text-[#6B746D]">누르면 5분 동안 취소할 수 있어요</span>
            </div>
            <button
              className="mt-2 h-[62px] w-full rounded-[18px] bg-[#1DFF26] text-[20px] font-bold text-[#0F1412] shadow-[0_8px_20px_rgba(29,255,38,0.28)] transition-colors hover:bg-[#7CE785] disabled:opacity-60"
              disabled={busy}
              onClick={onApprove}
              type="button"
            >
              {busy ? "승인하는 중…" : "이대로 발주하기"}
            </button>
          </div>
        </div>
      ) : null}

      {!state.hold && pending.length > 0 && !grace ? (
        <details className="rounded-[18px] border border-[#E6E9E7] bg-white px-4 py-3">
          <summary className="cursor-pointer text-[13.5px] font-semibold text-[#3B4740]">
            왜 이 발주가 나왔나요?
          </summary>
          <ul className="mt-2 space-y-2 text-[12.5px] leading-[1.6] text-[#6B746D]">
            {pending.map((proposal) => (
              <li key={proposal.id}>
                <span className="font-semibold text-[#0F1412]">{proposal.name}</span> — {proposal.reason}.{" "}
                {proposal.evidenceLine}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!state.hold && pending.length === 0 && !approval ? (
        <section className="rounded-[24px] border border-[#E6E9E7] bg-white p-6 text-center">
          <p className="text-[15px] font-semibold text-[#0F1412]">다음 발주 시점을 계속 보고 있어요.</p>
          <p className="mt-2 text-[13px] text-[#6B746D]">
            잔여일이 리드타임 안으로 들어오면 이 화면에 카드가 먼저 나타납니다.
          </p>
          <button
            className="mt-4 h-12 w-full rounded-[14px] bg-[#0F1412] text-[14px] font-bold text-white"
            onClick={onRefresh}
            type="button"
          >
            지금 다시 계산
          </button>
        </section>
      ) : null}

      <div aria-hidden className={!state.hold && pending.length > 0 && !grace && !approval ? "h-24" : "h-0"} />

      <p className="px-1 text-[11.5px] leading-[1.7] text-[#98A29B]">
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
