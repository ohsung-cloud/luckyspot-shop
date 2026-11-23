"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import SplitSlips from "@/components/auto-order/SplitSlips";
import { clock, won as wonShort } from "@/components/auto-order/format";
import type { ApprovalView, ProposalListResponse, SplitResult } from "@/features/auto-order/types";
import { formatWon, type MonthlySummary } from "@/features/sales-report/monthly";

/**
 * 점주 전용 어드민 — 매출(1순위) → 원두·토너·용지 발주(2순위) → 접이식 상세(3순위).
 *
 * 오류·경고(이상 감지·미등록 품목·연결 실패)는 첫 화면에 펼치지 않는다.
 * 모두 '시스템 상태·알림 보기' 안에 접어 두고, 평상시에는 매출과 3종만 보이게 한다.
 */

export type StoreAdminSnapshot = {
  capturedAt: string;
  beanDaysLeft: number | null;
  beanPct: number | null;
  tonerMin: number | null;
  paperAvgPct: number | null;
  alerts: { title: string; detail: string; tone: "red" | "amber" | "blue" }[];
};

export type StoreAdminHistoryEntry = {
  at: string;
  kind: "수집" | "발주" | "오픈";
  title: string;
  detail: string;
};

type Props = {
  store: {
    code: string;
    label: string;
    shortLabel: string;
    storeType: string;
    region: string;
    ownerName: string;
    phoneMasked: string;
    thresholds: { beanDays: number; tonerDays: number; paperDays: number };
    coffeeEntityName: string;
    printEntityName: string;
    hasAdminCode: boolean;
  };
  monthly: { current: MonthlySummary | null; previous: MonthlySummary | null };
  snapshot: StoreAdminSnapshot | null;
  history: StoreAdminHistoryEntry[];
};

type ActionResponse = {
  ok?: boolean;
  status?: "canceled" | "confirmed_split";
  split?: SplitResult;
  message?: string;
  error?: string;
};

const CORE_SKUS = ["bean-10kg", "toner-black", "toner-color", "a4-paper"];

function CoreCard({
  label,
  value,
  sub,
  tone,
  badge,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "red" | "amber" | "green" | "gray";
  badge?: string;
}) {
  const styles = {
    red: "border-[#F3D2D2] bg-[#FFF7F7]",
    amber: "border-[#F0E1B8] bg-[#FFFBF0]",
    green: "border-[#D6EBDD] bg-white",
    gray: "border-[#E6E9E7] bg-white",
  }[tone];
  const valueTone = {
    red: "text-[#B3261E]",
    amber: "text-[#8A5A00]",
    green: "text-[#0F1412]",
    gray: "text-[#98A29B]",
  }[tone];

  return (
    <div className={`rounded-[14px] border p-2.5 ${styles}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-[#3B4740]">{label}</span>
        {badge ? (
          <span className="rounded-full bg-[#0F1412] px-1.5 py-0.5 text-[9px] font-bold text-[#1DFF26]">{badge}</span>
        ) : null}
      </div>
      <p className={`mt-1.5 text-[18px] font-bold leading-none tabular-nums tracking-[-0.02em] ${valueTone}`}>{value}</p>
      <p className="mt-1 truncate text-[9.5px] text-[#6B746D]">{sub}</p>
    </div>
  );
}

export default function StoreAdminView({ store, monthly, snapshot, history }: Props) {
  const [state, setState] = useState<ProposalListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [approval, setApproval] = useState<ApprovalView | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [localHistory, setLocalHistory] = useState<StoreAdminHistoryEntry[]>([]);

  const resolving = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/auto-order/proposals?storeCode=${encodeURIComponent(store.code)}&storeLabel=${encodeURIComponent(store.label)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as (ProposalListResponse & { error?: string }) | null;

      if (!response.ok || !payload || payload.ok !== true) {
        throw new Error(payload?.error ?? "발주 제안을 불러오지 못했습니다.");
      }

      setState(payload);
      setNow(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "발주 제안을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [store.code, store.label]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!approval || approval.status !== "grace_cancel_window") return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [approval]);

  const applyLocal = (ids: string[], status: "canceled" | "confirmed_split") => {
    const idSet = new Set(ids);
    setState((prev) => {
      if (!prev) return prev;

      const proposals = prev.proposals.map((proposal) =>
        idSet.has(proposal.id) ? { ...proposal, status } : proposal,
      );
      const actionable = proposals.filter(
        (proposal) => proposal.status === "pending_approval" || proposal.status === "grace_cancel_window",
      );
      const totals = actionable.reduce(
        (sum, proposal) => {
          sum.count += 1;
          sum.totalAmount += proposal.amount;
          if (proposal.ownerEntityType === "franchisee_cafe") sum.cafeAmount += proposal.amount;
          else sum.hqAmount += proposal.amount;
          return sum;
        },
        { count: 0, cafeAmount: 0, hqAmount: 0, totalAmount: 0 },
      );

      return { ...prev, proposals, totals };
    });
  };

  const resolveNow = useCallback(async () => {
    if (!approval || approval.status !== "grace_cancel_window" || resolving.current) return;

    resolving.current = true;
    setBusy(true);

    try {
      const response = await fetch("/api/auto-order/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", token: approval.token }),
      });
      const payload = (await response.json().catch(() => null)) as ActionResponse | null;

      if (response.ok && payload?.ok && payload.split) {
        setApproval({ ...approval, status: "confirmed_split", remainingSeconds: 0, splitPreview: payload.split });
        setNotice("5분이 지나 사업자별 발주로 확정됐어요.");
        applyLocal(approval.proposals.map((proposal) => proposal.id), "confirmed_split");
      }
    } catch {
      setNotice("확정 확인이 늦어지고 있어요. 잠시 후 새로고침해 주세요.");
    } finally {
      resolving.current = false;
      setBusy(false);
    }
  }, [approval]);

  useEffect(() => {
    if (!approval || approval.status !== "grace_cancel_window") return;
    if (new Date(approval.expiresAt).getTime() <= now) void resolveNow();
  }, [approval, now, resolveNow]);

  const approve = async (ids: string[]) => {
    if (!state || ids.length === 0) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auto-order/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          storeCode: state.storeCode,
          storeLabel: state.storeLabel,
          proposalIds: ids,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; approval?: ApprovalView; error?: string } | null;

      if (!response.ok || !payload?.ok || !payload.approval) {
        throw new Error(payload?.error ?? "승인하지 못했습니다.");
      }

      setApproval(payload.approval);
      setNow(Date.now());
      setLocalHistory((prev) => [
        {
          at: new Date().toISOString(),
          kind: "발주",
          title: "발주 승인 · 5분 취소 유예",
          detail: `총 ${wonShort(payload.approval?.splitPreview.totalAmount ?? 0)} · 사업자별 분리`,
        },
        ...prev,
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "승인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!approval) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auto-order/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", token: approval.token }),
      });
      const payload = (await response.json().catch(() => null)) as ActionResponse | null;

      if (payload?.status === "confirmed_split" && payload.split) {
        setApproval({ ...approval, status: "confirmed_split", remainingSeconds: 0, splitPreview: payload.split });
        setNotice(payload.message ?? "유예가 이미 끝나 확정됐습니다.");
        applyLocal(approval.proposals.map((proposal) => proposal.id), "confirmed_split");
        return;
      }

      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "취소하지 못했습니다.");

      setApproval(null);
      setNotice(payload.message ?? "발주를 취소했어요.");
      applyLocal(approval.proposals.map((proposal) => proposal.id), "canceled");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "취소하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const current = monthly.current;
  const previous = monthly.previous;
  const pending = state?.proposals.filter(
    (proposal) => proposal.status === "pending_approval" || proposal.status === "grace_cancel_window",
  ) ?? [];
  const corePending = pending.filter((proposal) => CORE_SKUS.includes(proposal.sku));
  const otherPending = pending.filter((proposal) => !CORE_SKUS.includes(proposal.sku));
  const coreAmount = corePending.reduce((sum, proposal) => sum + proposal.amount, 0);
  const grace = approval?.status === "grace_cancel_window";
  const remainingSeconds = approval
    ? Math.max(0, Math.ceil((new Date(approval.expiresAt).getTime() - now) / 1000))
    : 0;

  const forecasts = state?.run.forecasts ?? [];
  const bean = forecasts.find((item) => item.sku === "bean-10kg");
  const toner = forecasts.find((item) => item.sku === "toner-black");
  const paper = forecasts.find((item) => item.sku === "a4-paper");
  const tonerPct = state?.telemetry
    ? Math.min(
        ...[state.telemetry.toner.k, state.telemetry.toner.c, state.telemetry.toner.m, state.telemetry.toner.y].filter(
          (value): value is number => typeof value === "number",
        ),
        snapshot?.tonerMin ?? 100,
      )
    : snapshot?.tonerMin ?? null;
  const paperPct = state?.telemetry
    ? average(
        [state.telemetry.paper.tray1, state.telemetry.paper.tray2].filter(
          (value): value is number => typeof value === "number",
        ),
      )
    : snapshot?.paperAvgPct ?? null;

  const allHistory = [...localHistory, ...history].slice(0, 6);
  const warningCount =
    (error ? 1 : 0) + (state?.hold ? 1 : 0) + (snapshot?.alerts.length ?? 0);

  return (
    <div className="grid gap-2.5">
      <header className="px-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-[#0F1412] px-2.5 py-1 font-mono text-[10px] font-bold text-[#1DFF26]">
            {store.code}
          </span>
          <span className="rounded-full border border-[#D7DBD9] px-2 py-0.5 text-[10px] font-semibold text-[#6B746D]">
            {store.storeType}
          </span>
        </div>
        <h1 className="mt-1.5 text-[21px] font-bold leading-[1.25] tracking-[-0.02em] text-[#0F1412]">
          {store.shortLabel} 점주 어드민
        </h1>
        <p className="mt-1 text-[10px] text-[#98A29B]">매일 08~22시 1시간마다 · 00:05 마감 업데이트</p>
      </header>

      {/* ① 매출 — 최상위 위계 */}
      <section className="rounded-[20px] bg-[#0F1412] p-4 text-white">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-[#1DFF26] px-2.5 py-1 text-[10.5px] font-bold text-[#0F1412]">이번달 매출</span>
          <span className="text-[10px] tabular-nums text-[#9AA39C]">{current?.coffee.range ?? "수집 전"}</span>
        </div>

        <p className="mt-2.5 text-[33px] font-bold leading-none tabular-nums tracking-[-0.03em]">
          {current ? formatWon(current.total) : "—"}
        </p>

        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-[#C8D0CA]">
          <span className="rounded-full bg-white/10 px-2 py-0.5">커피 {current ? formatWon(current.coffee.amount) : "—"}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5">
            프린트 {current?.print.amount !== null && current?.print.amount !== undefined ? formatWon(current.print.amount) : "26일 정산 전"}
          </span>
        </div>

        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-white/15">
          {current?.coffee.amount ? (
            <div
              className="h-full bg-[#1DFF26]"
              style={{
                width: `${(current.coffee.amount / ((current.coffee.amount ?? 0) + (current.print.amount ?? 0) || 1)) * 100}%`,
              }}
            />
          ) : null}
          {current?.print.amount ? (
            <div
              className="h-full bg-[#7FA6FF]"
              style={{
                width: `${(current.print.amount / ((current.coffee.amount ?? 0) + (current.print.amount ?? 0) || 1)) * 100}%`,
              }}
            />
          ) : null}
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[10.5px]">
          <div className="rounded-[10px] bg-white/8 px-2.5 py-2">
            <p className="text-[#9AA39C]">지난달 커피</p>
            <p className="mt-0.5 text-[13px] font-bold tabular-nums">{previous ? formatWon(previous.coffee.amount) : "—"}</p>
          </div>
          <div className="rounded-[10px] bg-white/8 px-2.5 py-2">
            <p className="text-[#9AA39C]">지난달 프린트</p>
            <p className="mt-0.5 text-[13px] font-bold tabular-nums">{previous ? formatWon(previous.print.amount) : "—"}</p>
          </div>
        </div>
      </section>

      {/* ② 원두 · 토너 · 용지 + 원터치 발주 */}
      <section className="rounded-[20px] border-2 border-[#0F1412] bg-white p-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold text-[#0F1412]">지금 채울 3가지</h2>
          <span className="text-[10px] text-[#6B746D]">
            {state
              ? state.dataSource === "demo"
                ? "데모 예측 · 실측 마감 0일"
                : `${state.run.asOfDate.slice(5).replace("-", "/")} 마감`
              : snapshot
                ? "실측"
                : "수집 전"}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <CoreCard
            badge={bean?.due ? "발주" : undefined}
            label="원두"
            sub={bean ? `${Math.round(bean.stockOnHand).toLocaleString("ko-KR")}g · ${bean.predictedDailyConsumption.toFixed(0)}g/일` : snapshot?.beanDaysLeft ? `실측 ${snapshot.beanDaysLeft.toFixed(1)}일` : "수집 전"}
            tone={toneFor(bean?.remainingDays ?? snapshot?.beanDaysLeft ?? null, store.thresholds.beanDays)}
            value={daysShort(bean?.remainingDays ?? snapshot?.beanDaysLeft ?? null)}
          />
          <CoreCard
            badge={toner?.due ? "발주" : undefined}
            label="토너"
            sub={
              toner
                ? `${Math.round(toner.stockOnHand).toLocaleString("ko-KR")}g · ${toner.predictedDailyConsumption.toFixed(1)}g/일`
                : tonerPct !== null
                  ? `잔량 ${Math.round(tonerPct)}%`
                  : "수집 전"
            }
            tone={toner?.remainingDays != null ? toneFor(toner.remainingDays, store.thresholds.tonerDays) : pctTone(tonerPct)}
            value={toner?.remainingDays != null ? daysShort(toner.remainingDays) : tonerPct !== null ? `${Math.round(tonerPct)}%` : "—"}
          />
          <CoreCard
            badge={paper?.due ? "발주" : undefined}
            label="용지"
            sub={
              paper
                ? `${Math.round(paper.stockOnHand).toLocaleString("ko-KR")}매 · ${paper.predictedDailyConsumption.toFixed(0)}매/일`
                : paperPct !== null
                  ? `잔량 ${Math.round(paperPct)}%`
                  : "수집 전"
            }
            tone={paper?.remainingDays != null ? toneFor(paper.remainingDays, store.thresholds.paperDays) : pctTone(paperPct)}
            value={paper?.remainingDays != null ? daysShort(paper.remainingDays) : paperPct !== null ? `${Math.round(paperPct)}%` : "—"}
          />
        </div>

        {grace && approval ? (
          <div className="mt-2.5 rounded-[14px] bg-[#0F1412] px-3 py-3 text-white">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#1DFF26]">발주 잠금 · 아직 주문 전</span>
              <span className="text-[24px] font-bold leading-none tabular-nums">{clock(remainingSeconds)}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-[#1DFF26] transition-[width] duration-300"
                style={{ width: `${Math.max(0, Math.min(100, (remainingSeconds / Math.max(1, approval.graceSeconds)) * 100))}%` }}
              />
            </div>
            <button
              className="mt-2.5 h-11 w-full rounded-[11px] border border-[#FF6B6B] text-[14px] font-bold text-[#FF8A8A] disabled:opacity-60"
              disabled={busy}
              onClick={() => void cancel()}
              type="button"
            >
              {busy ? "취소하는 중…" : "발주 취소하기"}
            </button>
          </div>
        ) : corePending.length > 0 ? (
          <button
            className="mt-2.5 h-[54px] w-full rounded-[14px] bg-[#1DFF26] text-[16px] font-bold text-[#0F1412] disabled:opacity-60"
            disabled={busy}
            onClick={() => void approve(corePending.map((proposal) => proposal.id))}
            type="button"
          >
            {busy ? "승인하는 중…" : `3종 채우기 · ${wonShort(coreAmount)}`}
          </button>
        ) : (
          <div className="mt-2.5 flex h-[50px] items-center justify-center rounded-[14px] bg-[#F4F5F6] text-[12.5px] font-semibold text-[#6B746D]">
            {loading ? "계산 중…" : state?.hold ? "이상 감지로 멈춤 — 아래 알림" : "3종 모두 충분해요"}
          </div>
        )}

        <p className="mt-1.5 text-center text-[9.5px] text-[#6B746D]">
          {corePending.length > 0 ? "승인 후 5분 동안 취소할 수 있어요" : "잔여일이 기준 안으로 오면 버튼이 켜집니다"}
          {otherPending.length > 0 ? ` · 기타 ${otherPending.length}종은 아래 상세` : ""}
        </p>
      </section>

      {notice ? (
        <p className="rounded-[12px] bg-[#EDFBEF] px-3 py-2 text-[11.5px] font-semibold text-[#0B5C2A]">{notice}</p>
      ) : null}

      {approval?.status === "confirmed_split" ? (
        <section className="rounded-[16px] border border-[#007A36] bg-[#EDFBEF] p-3">
          <p className="text-[11px] font-bold text-[#0B5C2A]">발주 확정 · {wonShort(approval.splitPreview.totalAmount)}</p>
          <p className="mt-0.5 text-[11px] text-[#3B4740]">사업자별로 나뉘어 발주됐어요. 전표는 아래 상세에서.</p>
        </section>
      ) : null}

      {/* ③ 접이식 2개 — 기본 접힘 */}
      <details className="rounded-[14px] border border-[#E6E9E7] bg-white px-3.5 py-3">
        <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-bold text-[#3B4740]">
          교차예측 · 특허 근거 보기
          <span className="text-[10px] font-semibold text-[#98A29B]">3종 → 사업자 분리</span>
        </summary>

        <div className="mt-2 flex flex-wrap items-center gap-1 text-[9.5px] font-semibold text-[#3B4740]">
          {["수집", "교차예측", "임계", "사업자 분리", "알림톡"].map((step, index) => (
            <span key={step} className="flex items-center gap-1">
              <span className={`rounded-full px-1.5 py-0.5 ${index === 1 ? "bg-[#0F1412] text-[#1DFF26]" : "bg-[#F4F5F6]"}`}>
                {step}
              </span>
              {index < 4 ? <span className="text-[#B0B7B2]">›</span> : null}
            </span>
          ))}
        </div>

        <ul className="mt-2 divide-y divide-[#F4F5F6]">
          {forecasts.map((forecast) => (
            <li key={forecast.sku} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-[#0F1412]">{forecast.name}</span>
              <span className="shrink-0 text-[10px] tabular-nums text-[#6B746D]">×{forecast.crossFactor.toFixed(2)}</span>
              <span className="w-[44px] shrink-0 text-right text-[10.5px] font-bold tabular-nums text-[#0F1412]">
                {daysShort(forecast.remainingDays)}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-1.5 text-[9.5px] leading-[1.6] text-[#98A29B]">
          기본 = 14일 지수가중(0.9) · 교차 = 1 + w×clamp(최근3일/직전주, ±40%) · 잔여일 = 현재고 ÷ 보정소진
        </p>

        {state?.splitPreview ? (
          <div className="mt-2">
            <SplitSlips compact split={state.splitPreview} />
          </div>
        ) : approval?.status === "confirmed_split" ? (
          <div className="mt-2">
            <SplitSlips compact split={approval.splitPreview} />
          </div>
        ) : null}

        {otherPending.length > 0 ? (
          <button
            className="mt-2 h-10 w-full rounded-[10px] border border-[#0F1412] text-[11.5px] font-bold text-[#0F1412] disabled:opacity-60"
            disabled={busy || grace}
            onClick={() => void approve(otherPending.map((proposal) => proposal.id))}
            type="button"
          >
            기타 {otherPending.length}종 함께 발주 · {wonShort(otherPending.reduce((sum, item) => sum + item.amount, 0))}
          </button>
        ) : null}
      </details>

      <details className="rounded-[14px] border border-[#E6E9E7] bg-white px-3.5 py-3">
        <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-bold text-[#3B4740]">
          시스템 상태 · 알림 보기
          <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${warningCount > 0 ? "bg-[#FFF6E0] text-[#8A5A00]" : "bg-[#EDFBEF] text-[#0B5C2A]"}`}>
            {warningCount > 0 ? `알림 ${warningCount}` : "정상"}
          </span>
        </summary>

        <div className="mt-2 grid gap-1.5">
          {error ? (
            <p className="rounded-[8px] bg-[#FFEBEE] px-2.5 py-1.5 text-[10.5px] leading-[1.5] text-[#B3261E]">{error}</p>
          ) : null}

          {state?.hold ? (
            <p className="rounded-[8px] bg-[#FFF9EA] px-2.5 py-1.5 text-[10.5px] leading-[1.5] text-[#8A5A00]">
              {state.anomalies[0]?.title} — {state.anomalies[0]?.message}
            </p>
          ) : null}

          {(snapshot?.alerts ?? []).map((alert) => (
            <p key={alert.title} className="rounded-[8px] bg-[#F8F9F9] px-2.5 py-1.5 text-[10.5px] leading-[1.5] text-[#3B4740]">
              <span className="font-bold">{alert.title}</span> · {alert.detail}
            </p>
          ))}

          {warningCount === 0 ? (
            <p className="rounded-[8px] bg-[#F8F9F9] px-2.5 py-1.5 text-[10.5px] text-[#6B746D]">
              연결·수집·발주 모두 정상입니다.
            </p>
          ) : null}

          <ul className="mt-1 space-y-1.5">
            {allHistory.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex gap-1.5 text-[10px]">
                <span className="w-[64px] shrink-0 tabular-nums text-[#98A29B]">
                  {new Date(entry.at).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-[#0F1412]">{entry.title}</span>
                  <span className="text-[#6B746D]"> · {entry.detail}</span>
                </span>
              </li>
            ))}
            {allHistory.length === 0 ? <li className="text-[10.5px] text-[#6B746D]">아직 이력이 없습니다.</li> : null}
          </ul>

          <p className="text-[9.5px] leading-[1.6] text-[#98A29B]">
            예측 데이터:{" "}
            {state
              ? state.dataSource === "supabase"
                ? "Supabase POS 마감"
                : state.dataSource === "memory"
                  ? "방금 수집한 POS 마감"
                  : "데모 시계열(실측 마감 0일)"
              : "수집 전"}
            · 원두 {store.thresholds.beanDays}일 · 토너 {store.thresholds.tonerDays}일 · 용지 {store.thresholds.paperDays}일 기준
            {snapshot ? ` · 실측 ${new Date(snapshot.capturedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}
          </p>
        </div>
      </details>
    </div>
  );
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function daysShort(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value >= 99) return "99일+";
  return `${value.toFixed(value < 10 ? 1 : 0)}일`;
}

function toneFor(daysLeft: number | null | undefined, threshold: number): "red" | "amber" | "green" | "gray" {
  if (daysLeft === null || daysLeft === undefined) return "gray";
  if (daysLeft <= 2) return "red";
  if (daysLeft <= threshold) return "amber";
  return "green";
}

function pctTone(value: number | null): "red" | "amber" | "green" | "gray" {
  if (value === null) return "gray";
  if (value <= 10) return "red";
  if (value <= 30) return "amber";
  return "green";
}
