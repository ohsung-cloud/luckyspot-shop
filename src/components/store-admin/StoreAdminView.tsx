"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Card, CardBody, CardHead, CTA, Chip, QUIET_BUTTON, Row, RowList, SUMMARY_ROW } from "@/components/internal/card-ui";
import SplitSlips from "@/components/auto-order/SplitSlips";
import { clock, won as wonShort } from "@/components/auto-order/format";
import type { ApprovalView, ProposalListResponse, SplitResult } from "@/features/auto-order/types";
import type { CalibrationEntry } from "@/features/auto-order/calibration";
import { ProfitRow } from "@/features/sales-report/ProfitRow";
import { RevenueMixMini } from "@/features/sales-report/RevenueMixDonut";
import { SalesPulseTabs } from "@/features/sales-report/SalesPulseTabs";
import {
  computeBepAndOrderMode,
  fixedCostTotal,
  monthlyComparison,
  type ProfitEstimate,
} from "@/features/sales-report/profit";
import { formatWon, type MonthlySummary } from "@/features/sales-report/monthly";
import type { StorePulse } from "@/features/sales-report/trend";
import type { PrintVendorType, StoreFixedCost } from "@/features/stores/registry-types";

/**
 * 점주 전용 어드민 — 토스 앱식 카드 화면.
 *
 * 매출(1순위) → 원두·토너·용지 발주(2순위) → 매출 흐름 → 접이식 상세(3순위).
 * 카드 방식: 흰 카드 24px 라운드 · 테두리 없이 여백으로 나눔 · 왼쪽 라벨/설명, 오른쪽 굵은 숫자·상태 칩.
 *
 * 오류·경고(이상 감지·미등록 품목·연결 실패)는 첫 화면에 펼치지 않는다.
 * 모두 '확인할 것' 안에 접어 두고, 평상시에는 매출과 3종만 보이게 한다.
 *
 * 2026-11-23 4대 고도화
 *  - 매출 카드에 `예상 순수익` 한 줄(탭하면 내역) + [일간][주간][월간] 매출 펄스 탭.
 *  - 3종 카드마다 `교체완료` — 잔량 100% + 소진 속도 학습(0.85x~1.25x).
 *  - 시스템 상태 접이식 안에 매일 00:05 마감 알림톡 미리보기(발송 없음).
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
  kind: "수집" | "발주" | "오픈" | "교체";
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
    pinEnabled: boolean;
    printVendor: PrintVendorType;
  };
  monthly: { current: MonthlySummary | null; previous: MonthlySummary | null };
  profit: { current: ProfitEstimate | null; previous: ProfitEstimate | null };
  pulse: StorePulse;
  fixedCost: StoreFixedCost;
  calibrations: Record<string, CalibrationEntry>;
  snapshot: StoreAdminSnapshot | null;
  history: StoreAdminHistoryEntry[];
  /** 오늘 커피 매출(원) — 00:05 알림톡 미리보기용. 프린트는 26일 정산 전이면 null. */
  todayRevenue: number | null;
};

type ActionResponse = {
  ok?: boolean;
  status?: "canceled" | "confirmed_split";
  split?: SplitResult;
  message?: string;
  error?: string;
};

type CalibrateResponse = {
  ok?: boolean;
  calibration?: CalibrationEntry;
  message?: string;
  error?: string;
};

const CORE_SKUS = ["bean-10kg", "toner-black", "toner-color", "a4-paper"];
const CALIBRATE_SKUS = new Set(["bean-10kg", "toner-black", "a4-paper"]);

type Tone = "red" | "amber" | "ok" | "gray";

const DOT: Record<Tone, string> = {
  red: "bg-[#B3261E]",
  amber: "bg-[#E0A800]",
  ok: "bg-[#1D9F4C]",
  gray: "bg-[#C9CFCB]",
};

const VALUE_TONE: Record<Tone, "red" | "amber" | "ink" | "muted"> = {
  red: "red",
  amber: "amber",
  ok: "ink",
  gray: "muted",
};

function CoreRow({
  label,
  value,
  sub,
  tone,
  badge,
  onCalibrate,
  busy,
  replacedLabel,
}: {
  label: string;
  value: string;
  sub: string;
  tone: Tone;
  badge?: string;
  onCalibrate?: () => void;
  busy?: boolean;
  replacedLabel?: string | null;
}) {
  return (
    <Row
      chip={badge}
      chipTone="ink"
      dot={DOT[tone]}
      label={label}
      sub={replacedLabel ?? sub}
      trailing={
        onCalibrate ? (
          <button className={QUIET_BUTTON} disabled={busy} onClick={onCalibrate} type="button">
            {busy ? "기록 중" : "교체완료"}
          </button>
        ) : null
      }
      value={value}
      valueTone={VALUE_TONE[tone]}
    />
  );
}

export default function StoreAdminView({
  store,
  monthly,
  profit,
  pulse,
  fixedCost,
  calibrations,
  snapshot,
  history,
  todayRevenue,
}: Props) {
  const [state, setState] = useState<ProposalListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [approval, setApproval] = useState<ApprovalView | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [localHistory, setLocalHistory] = useState<StoreAdminHistoryEntry[]>([]);
  const [localCalibrations, setLocalCalibrations] = useState<Record<string, CalibrationEntry>>(calibrations);
  const [calibrating, setCalibrating] = useState<string | null>(null);

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
        throw new Error(payload?.error ?? "발주 제안을 불러오지 못했어요.");
      }

      setState(payload);
      setNow(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "발주 제안을 불러오지 못했어요.");
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
        throw new Error(payload?.error ?? "승인하지 못했어요.");
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
      setError(cause instanceof Error ? cause.message : "승인하지 못했어요.");
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
        setNotice(payload.message ?? "유예가 이미 끝나 확정됐어요.");
        applyLocal(approval.proposals.map((proposal) => proposal.id), "confirmed_split");
        return;
      }

      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "취소하지 못했어요.");

      setApproval(null);
      setNotice(payload.message ?? "발주를 취소했어요.");
      applyLocal(approval.proposals.map((proposal) => proposal.id), "canceled");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "취소하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  /** 원두·토너·용지 원터치 교체완료 — 잔량 100% + 소진 속도 학습. */
  const calibrate = async (sku: string, label: string) => {
    setCalibrating(sku);
    setError(null);

    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(store.code)}/calibrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      const payload = (await response.json().catch(() => null)) as CalibrateResponse | null;

      if (!response.ok || !payload?.ok || !payload.calibration) {
        throw new Error(payload?.error ?? "교체완료를 기록하지 못했어요.");
      }

      setLocalCalibrations((prev) => ({ ...prev, [sku]: payload.calibration as CalibrationEntry }));
      setNotice(payload.message ?? `${label} 교체완료 — 잔량 100%`);
      setLocalHistory((prev) => [
        {
          at: new Date().toISOString(),
          kind: "교체",
          title: `${label} 교체완료`,
          detail: `잔량 100% · 학습 ${payload.calibration?.factor.toFixed(2)}x`,
        },
        ...prev,
      ]);
      void load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "교체완료를 기록하지 못했어요.");
    } finally {
      setCalibrating(null);
    }
  };

  const current = monthly.current;
  const previous = monthly.previous;
  const pending =
    state?.proposals.filter(
      (proposal) => proposal.status === "pending_approval" || proposal.status === "grace_cancel_window",
    ) ?? [];
  const corePending = pending.filter((proposal) => CORE_SKUS.includes(proposal.sku));
  const otherPending = pending.filter((proposal) => !CORE_SKUS.includes(proposal.sku));
  const coreAmount = corePending.reduce((sum, proposal) => sum + proposal.amount, 0);

  // [월간] 탭 비교행 · 접힘 패널의 BEP/발주 모드 — 이 지점 하나의 숫자만.
  const comparison = monthlyComparison({ previous: profit.previous, current: profit.current });
  const bep = computeBepAndOrderMode({ month: current, fixedCost, orderAmount: coreAmount });

  const grace = approval?.status === "grace_cancel_window";
  const remainingSeconds = approval ? Math.max(0, Math.ceil((new Date(approval.expiresAt).getTime() - now) / 1000)) : 0;

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
    : (snapshot?.tonerMin ?? null);
  const paperPct = state?.telemetry
    ? average(
        [state.telemetry.paper.tray1, state.telemetry.paper.tray2].filter(
          (value): value is number => typeof value === "number",
        ),
      )
    : (snapshot?.paperAvgPct ?? null);

  const allHistory = [...localHistory, ...history].slice(0, 6);
  const warningCount = (error ? 1 : 0) + (state?.hold ? 1 : 0) + (snapshot?.alerts.length ?? 0);

  const replaceNote = (sku: string) => {
    const entry = localCalibrations[sku];
    if (!entry) return null;

    const hours = (Date.now() - new Date(entry.lastReplacedAt).getTime()) / 3_600_000;
    if (hours >= 0 && hours <= 24) return "오늘 교체 · 100%";
    const date = new Date(entry.lastReplacedAt);
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    return `${label} 교체`;
  };

  const digest = buildDigest({
    storeLabel: store.label,
    todayRevenue,
    beanDays: bean?.remainingDays ?? snapshot?.beanDaysLeft ?? null,
    tonerPct: tonerPct ?? null,
    paperPct: paperPct ?? null,
    due: corePending.length,
  });

  const beanTone = toneFor(bean?.remainingDays ?? snapshot?.beanDaysLeft ?? null, store.thresholds.beanDays);
  const tonerTone = toner?.remainingDays != null ? toneFor(toner.remainingDays, store.thresholds.tonerDays) : pctTone(tonerPct);
  const paperTone = paper?.remainingDays != null ? toneFor(paper.remainingDays, store.thresholds.paperDays) : pctTone(paperPct);

  return (
    <div className="grid gap-3">
      <header className="px-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="ink">{store.code}</Chip>
          <Chip tone="gray">{store.storeType}</Chip>
          <Chip tone="gray">PIN {store.pinEnabled ? "켜짐" : "열람"}</Chip>
        </div>
        <h1 className="mt-2.5 text-[24px] font-bold leading-[1.25] tracking-[-0.03em] text-[#0F1412]">
          {store.shortLabel} 사장님
        </h1>
        <p className="mt-1 text-[11.5px] font-medium leading-[1.5] text-[#8B948D]">
          오늘 매출과 채울 것을 한 화면에 모았어요 · 00:05에 마감해요
        </p>
      </header>

      {/* ① 매출 — 최상위 위계 */}
      <Card className="min-w-0 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#6B746D]">이번 달 매출</p>
            <p className="mt-2 text-[32px] font-bold leading-none tabular-nums tracking-[-0.035em] text-[#0F1412]">
              {current ? formatWon(current.total) : "—"}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Chip tone={current && !current.partial ? "green" : "gray"}>
                {current ? (current.partial ? "확인된 항목만" : "확정") : "수집 전"}
              </Chip>
              <span className="text-[10.5px] font-medium text-[#A7AFA9]">{current?.coffee.range ?? "수집 전"}</span>
            </div>
          </div>
          <RevenueMixMini month={current} size={66} />
        </div>

        <RowList className="mt-4 border-t border-[#F1F3F2]">
          <Row
            dot="bg-[#0F1412]"
            label="커피"
            sub={current ? `${current.coffee.range} · ${current.coffee.source}` : "수집 전"}
            value={current ? formatWon(current.coffee.amount) : "—"}
          />
          <Row
            dot="bg-[#1D9F4C]"
            label="프린트"
            sub={current ? `${current.print.range} · ${current.print.status === "pending" ? "매월 26일 정산" : current.print.source}` : "수집 전"}
            value={
              current?.print.amount !== null && current?.print.amount !== undefined
                ? formatWon(current.print.amount)
                : current?.print.status === "missing"
                  ? "미확보"
                  : "26일 정산 전"
            }
            valueTone={current?.print.amount !== null && current?.print.amount !== undefined ? "ink" : "muted"}
          />
        </RowList>

        <div className="mt-4 rounded-[18px] bg-[#F7F8F9] px-4 py-3.5">
          <ProfitRow
            fixedCost={fixedCost}
            note={
              fixedCostTotal(fixedCost) === 0 ? "월 고정비를 넣으면 실제 순수익이 보여요. 본사 화면에서 넣을 수 있어요." : undefined
            }
            previousNet={profit.previous?.net ?? null}
            profit={profit.current}
          />
        </div>

        <p className="mt-2 text-[10.5px] font-medium tabular-nums text-[#A7AFA9]">
          지난달 커피 {previous ? formatWon(previous.coffee.amount) : "—"} · 프린트{" "}
          {previous?.print.amount !== null && previous?.print.amount !== undefined ? formatWon(previous.print.amount) : "—"}
        </p>
      </Card>

      {/* ② 원두 · 토너 · 용지 + 원터치 발주 */}
      <Card>
        <CardHead
          right={
            <span className="text-[10.5px] font-semibold text-[#A7AFA9]">
              {state
                ? state.dataSource === "demo"
                  ? "데모 예측"
                  : `${state.run.asOfDate.slice(5).replace("-", "/")} 마감`
                : snapshot
                  ? "실측"
                  : "수집 전"}
            </span>
          }
          sub="원두·토너·용지 잔량이에요"
          title="채울 때가 됐어요"
        />

        <CardBody className="pt-2">
          <RowList>
            <CoreRow
              badge={bean?.due ? "발주" : undefined}
              busy={calibrating === "bean-10kg"}
              label="원두"
              onCalibrate={CALIBRATE_SKUS.has("bean-10kg") ? () => void calibrate("bean-10kg", "원두") : undefined}
              replacedLabel={replaceNote("bean-10kg")}
              sub={
                bean
                  ? `${Math.round(bean.stockOnHand).toLocaleString("ko-KR")}g · ${bean.predictedDailyConsumption.toFixed(0)}g/일`
                  : snapshot?.beanDaysLeft
                    ? `실측 ${snapshot.beanDaysLeft.toFixed(1)}일`
                    : "수집 전"
              }
              tone={beanTone}
              value={daysShort(bean?.remainingDays ?? snapshot?.beanDaysLeft ?? null)}
            />
            <CoreRow
              badge={toner?.due ? "발주" : undefined}
              busy={calibrating === "toner-black"}
              label="토너"
              onCalibrate={() => void calibrate("toner-black", "토너")}
              replacedLabel={replaceNote("toner-black")}
              sub={
                toner
                  ? `${Math.round(toner.stockOnHand).toLocaleString("ko-KR")}g · ${toner.predictedDailyConsumption.toFixed(1)}g/일`
                  : tonerPct !== null
                    ? `잔량 ${Math.round(tonerPct)}%`
                    : "수집 전"
              }
              tone={tonerTone}
              value={toner?.remainingDays != null ? daysShort(toner.remainingDays) : tonerPct !== null ? `${Math.round(tonerPct)}%` : "—"}
            />
            <CoreRow
              badge={paper?.due ? "발주" : undefined}
              busy={calibrating === "a4-paper"}
              label="용지"
              onCalibrate={() => void calibrate("a4-paper", "용지")}
              replacedLabel={replaceNote("a4-paper")}
              sub={
                paper
                  ? `${Math.round(paper.stockOnHand).toLocaleString("ko-KR")}매 · ${paper.predictedDailyConsumption.toFixed(0)}매/일`
                  : paperPct !== null
                    ? `잔량 ${Math.round(paperPct)}%`
                    : "수집 전"
              }
              tone={paperTone}
              value={paper?.remainingDays != null ? daysShort(paper.remainingDays) : paperPct !== null ? `${Math.round(paperPct)}%` : "—"}
            />
          </RowList>

          {grace && approval ? (
            <div className="mt-4 rounded-[20px] bg-[#0F1412] px-4 py-4 text-white">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[12.5px] font-bold text-[#1DFF26]">아직 주문 전이에요</p>
                  <p className="mt-1 text-[11.5px] leading-[1.5] text-[#C8D0CA]">5분 안이면 취소할 수 있어요</p>
                </div>
                <p className="shrink-0 text-[30px] font-bold leading-none tabular-nums tracking-[-0.03em]">
                  {clock(remainingSeconds)}
                </p>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-[#1DFF26] transition-[width] duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, (remainingSeconds / Math.max(1, approval.graceSeconds)) * 100))}%` }}
                />
              </div>
              <button
                className="mt-3 h-12 w-full rounded-[14px] border border-[#FF6B6B] text-[14px] font-bold text-[#FF8A8A] disabled:opacity-60"
                disabled={busy}
                onClick={() => void cancel()}
                type="button"
              >
                {busy ? "취소하는 중…" : "발주 취소하기"}
              </button>
            </div>
          ) : corePending.length > 0 ? (
            <button
              className={`${CTA} mt-4`}
              disabled={busy}
              onClick={() => void approve(corePending.map((proposal) => proposal.id))}
              type="button"
            >
              {busy ? "발주하는 중…" : `버튼 한 번으로 발주 · ${wonShort(coreAmount)}`}
            </button>
          ) : (
            <div className="mt-4 flex h-14 items-center justify-center rounded-[16px] bg-[#F2F4F6] text-[13px] font-semibold text-[#6B746D]">
              {loading ? "잔량을 계산하고 있어요…" : state?.hold ? "이상 감지로 멈췄어요 — 아래에서 확인해요" : "지금은 채울 게 없어요"}
            </div>
          )}

          <p className="mt-2 text-center text-[10.5px] font-medium leading-[1.5] text-[#A7AFA9]">
            {corePending.length > 0 ? "누르면 5분 동안 취소할 수 있어요" : "잔여일이 기준 안으로 오면 버튼이 켜져요"}
            {otherPending.length > 0 ? ` · 기타 ${otherPending.length}종은 아래 상세에 있어요` : ""}
          </p>
        </CardBody>
      </Card>

      {notice ? (
        <p className="rounded-[16px] bg-[#EDFBEF] px-4 py-3 text-[12.5px] font-semibold leading-[1.5] text-[#0B5C2A]">{notice}</p>
      ) : null}

      {approval?.status === "confirmed_split" ? (
        <div className="rounded-[20px] bg-[#EDFBEF] px-4 py-4">
          <p className="text-[12px] font-bold text-[#0B5C2A]">발주 확정 · {wonShort(approval.splitPreview.totalAmount)}</p>
          <p className="mt-1 text-[12px] leading-[1.55] text-[#3B4740]">점주 사업자와 본사 사업자로 나눠 담았어요. 전표는 아래에 있어요.</p>
        </div>
      ) : null}

      {/* ③ 흐름 */}
      <Card className="min-w-0">
        <CardHead
          right={
            <Chip tone={pulse.dailySource === "measured" ? "green" : pulse.dailySource === "estimated" ? "amber" : "gray"}>
              {pulse.dailySource === "measured" ? "실측" : pulse.dailySource === "estimated" ? "추정" : "수집 전"}
            </Chip>
          }
          sub="탭을 눌러 일간·주간·월간을 봐요"
          title="매출 흐름"
        />
        <CardBody className="pt-3">
          <SalesPulseTabs comparison={comparison} month={current} pulse={pulse} />
        </CardBody>
      </Card>

      {/* ④ 접이식 2장 — 기본 접힘 */}
      <Card>
        <details className="group">
          <summary className={SUMMARY_ROW}>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-[#0F1412]">발주가 나온 이유</span>
              <span className="mt-0.5 block truncate text-[11.5px] font-medium text-[#8B948D]">
                교차예측 · 사업자별 전표 · 손익분기
              </span>
            </span>
            <span aria-hidden className="text-[16px] font-bold text-[#C2C9C4] transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>

          <div className="border-t border-[#F1F3F2] px-5 py-4">
            <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold text-[#3B4740]">
              {["수집", "교차예측", "임계", "사업자 분리", "알림톡"].map((step, index) => (
                <span key={step} className="flex items-center gap-1">
                  <span className={`rounded-full px-2 py-1 ${index === 1 ? "bg-[#0F1412] text-[#1DFF26]" : "bg-[#F2F4F6] text-[#6B746D]"}`}>
                    {step}
                  </span>
                  {index < 4 ? <span className="text-[#C2C9C4]">›</span> : null}
                </span>
              ))}
            </div>

            {/* 손익분기(BEP) · 발주 모드 — 접힘 패널 안에서만. */}
            {bep ? (
              <div className="mt-3 rounded-[18px] bg-[#F7F8F9] px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-bold text-[#3B4740]">손익분기 · 발주 모드</p>
                  <Chip tone={bep.reached ? "green" : "amber"}>{bep.modeLabel}</Chip>
                </div>

                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#E3E8E5]">
                  <div
                    className={`h-full rounded-full ${bep.reached ? "bg-[#1D9F4C]" : "bg-[#E0A800]"}`}
                    style={{ width: `${Math.min(100, Math.max(0, bep.progressPct))}%` }}
                  />
                </div>

                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="text-[11.5px] font-medium text-[#6B746D]">
                    달성률 <span className="font-bold tabular-nums text-[#0F1412]">{Math.round(bep.progressPct)}%</span>
                  </span>
                  <span className={`text-[12px] font-bold ${bep.reached ? "text-[#0B5C2A]" : "text-[#8A5A00]"}`}>
                    {bep.bepLabel}
                  </span>
                </div>

                <p className="mt-2 text-[10px] leading-[1.6] text-[#8B948D]">
                  일할 고정비 {formatWon(bep.dailyFixedCost)} · 하루 공헌이익 {formatWon(bep.dailyContribution)} · BEP 일매출{" "}
                  {formatWon(bep.bepDailyRevenue)}
                </p>
                <p className="text-[10px] leading-[1.6] text-[#8B948D]">
                  여유 현금 {formatWon(bep.freeCashFlow)} (월말 예상 순수익 − 3종 발주 {formatWon(bep.orderAmount)})
                </p>
                <p className="mt-1 text-[10px] leading-[1.6] text-[#A7AFA9]">{bep.reason}</p>
              </div>
            ) : null}

            <RowList className="mt-3">
              {forecasts.map((forecast) => (
                <Row
                  key={forecast.sku}
                  label={forecast.name}
                  sub={`교차 ×${forecast.crossFactor.toFixed(2)}`}
                  value={daysShort(forecast.remainingDays)}
                />
              ))}
            </RowList>

            <p className="mt-2 text-[10px] leading-[1.6] text-[#A7AFA9]">
              기본 = 14일 지수가중(0.9) · 교차 = 1 + w×clamp(최근3일/직전주, ±40%) · 잔여일 = 현재고 ÷ 보정소진
            </p>

            {/* 교체완료 학습 — 최근 교체일·학습 계수 */}
            <div className="mt-3 rounded-[18px] bg-[#F7F8F9] px-4 py-3.5">
              <p className="text-[11.5px] font-bold text-[#3B4740]">교체 학습 · 자동 보정</p>
              <ul className="mt-1.5 space-y-1">
                {["bean-10kg", "toner-black", "a4-paper"].map((sku) => {
                  const entry = localCalibrations[sku];
                  const label = sku === "bean-10kg" ? "원두" : sku === "toner-black" ? "토너" : "용지";

                  return (
                    <li key={sku} className="flex items-baseline justify-between gap-2 text-[10.5px]">
                      <span className="shrink-0 font-semibold text-[#3B4740]">{label}</span>
                      <span className="min-w-0 flex-1 truncate text-right text-[#8B948D]">
                        {entry
                          ? `${shortDate(entry.lastReplacedAt)} 교체 · 학습 ${entry.factor.toFixed(2)}x${entry.samples > 0 ? ` · ${entry.samples}회` : ""}`
                          : "교체 기록 없음 — 버튼 한 번이면 학습을 시작해요"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-[9.5px] leading-[1.6] text-[#A7AFA9]">
                실제 교체 간격 ÷ 예측 간격을 0.85~1.25배로 눌러 다음 잔여일에 바로 적용해요. (시드 지점 값은 예시)
              </p>
            </div>

            {state?.splitPreview ? (
              <div className="mt-3">
                <SplitSlips compact split={state.splitPreview} />
              </div>
            ) : approval?.status === "confirmed_split" ? (
              <div className="mt-3">
                <SplitSlips compact split={approval.splitPreview} />
              </div>
            ) : null}

            {otherPending.length > 0 ? (
              <button
                className="mt-3 h-12 w-full rounded-[14px] border border-[#D7DBD9] text-[12.5px] font-bold text-[#3B4740] disabled:opacity-60"
                disabled={busy || grace}
                onClick={() => void approve(otherPending.map((proposal) => proposal.id))}
                type="button"
              >
                기타 {otherPending.length}종 함께 발주 · {wonShort(otherPending.reduce((sum, item) => sum + item.amount, 0))}
              </button>
            ) : null}
          </div>
        </details>
      </Card>

      <Card>
        <details className="group">
          <summary className={SUMMARY_ROW}>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-[#0F1412]">확인할 것</span>
              <span className="mt-0.5 block truncate text-[11.5px] font-medium text-[#8B948D]">
                알림 · 최근 기록 · 어디서 온 숫자인지
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <Chip tone={warningCount > 0 ? "amber" : "green"}>{warningCount > 0 ? `알림 ${warningCount}` : "정상"}</Chip>
              <span aria-hidden className="text-[16px] font-bold text-[#C2C9C4] transition-transform group-open:rotate-90">
                ›
              </span>
            </span>
          </summary>

          <div className="grid gap-2 border-t border-[#F1F3F2] px-5 py-4">
            {error ? (
              <p className="rounded-[14px] bg-[#FFF2F2] px-3.5 py-2.5 text-[11px] leading-[1.55] text-[#B3261E]">{error}</p>
            ) : null}

            {state?.hold ? (
              <p className="rounded-[14px] bg-[#FFF8E6] px-3.5 py-2.5 text-[11px] leading-[1.55] text-[#8A5A00]">
                {state.anomalies[0]?.title} — {state.anomalies[0]?.message}
              </p>
            ) : null}

            {(snapshot?.alerts ?? []).map((alert) => (
              <p key={alert.title} className="rounded-[14px] bg-[#F7F8F9] px-3.5 py-2.5 text-[11px] leading-[1.55] text-[#3B4740]">
                <span className="font-bold">{alert.title}</span> · {alert.detail}
              </p>
            ))}

            {warningCount === 0 ? (
              <p className="rounded-[14px] bg-[#F7F8F9] px-3.5 py-2.5 text-[11px] text-[#6B746D]">
                연결·수집·발주 모두 정상이에요.
              </p>
            ) : null}

            {/* 매일 00:05 마감 알림톡 미리보기 — 실제 발송 없음 */}
            <div className="rounded-[16px] bg-[#F7F8F9] px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10.5px] font-bold text-[#3B4740]">00:05 마감 알림톡 미리보기</p>
                <Chip tone="gray">발송 안 됨</Chip>
              </div>
              <p className="mt-1.5 text-[10.5px] leading-[1.65] text-[#3B4740]">{digest}</p>
              <p className="mt-1 text-[9px] leading-[1.5] text-[#A7AFA9]">
                실제 알림톡은 보내지 않아요. 문구·수치를 확인하는 미리보기예요.
              </p>
            </div>

            <ul className="mt-1 space-y-1.5">
              {allHistory.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex gap-2 text-[10px]">
                  <span className="w-[62px] shrink-0 tabular-nums text-[#A7AFA9]">
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
                    <span className="text-[#8B948D]"> · {entry.detail}</span>
                  </span>
                </li>
              ))}
              {allHistory.length === 0 ? <li className="text-[10.5px] text-[#8B948D]">아직 기록이 없어요.</li> : null}
            </ul>

            <p className="text-[9.5px] leading-[1.6] text-[#B0B7B2]">
              예측 데이터:{" "}
              {state
                ? state.dataSource === "supabase"
                  ? "Supabase POS 마감"
                  : state.dataSource === "memory"
                    ? "방금 수집한 POS 마감"
                    : "데모 시계열(실측 마감 0일)"
                : "수집 전"}
              · 원두 {store.thresholds.beanDays}일 · 토너 {store.thresholds.tonerDays}일 · 용지 {store.thresholds.paperDays}일 기준
              {snapshot
                ? ` · 실측 ${new Date(snapshot.capturedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}`
                : ""}
              {" · "}프린트 벤더 {store.printVendor === "yupisoft" ? "유피소프트" : store.printVendor === "generic_webhook" ? "타사 복합기(공용)" : "에스칼프린트"}
            </p>
          </div>
        </details>
      </Card>
    </div>
  );
}

function buildDigest(input: {
  storeLabel: string;
  todayRevenue: number | null;
  beanDays: number | null;
  tonerPct: number | null;
  paperPct: number | null;
  due: number;
}) {
  const kst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const dateLabel = `${Number(kst.slice(5, 7))}/${kst.slice(8, 10)}`;

  const revenue = input.todayRevenue === null ? "커피 집계 전" : `오늘 매출 ${formatWon(input.todayRevenue)}`;
  const fill = [
    input.beanDays === null ? null : `원두 ${input.beanDays.toFixed(1)}일`,
    input.tonerPct === null ? null : `토너 ${Math.round(input.tonerPct)}%`,
    input.paperPct === null ? null : `용지 ${Math.round(input.paperPct)}%`,
  ]
    .filter(Boolean)
    .join(" · ");

  const tail = input.due > 0 ? `발주 대기 ${input.due}건` : "발주 대기 없음";

  return `[럭키스팟 ${input.storeLabel.replace(/^럭키스팟\s*/, "")}] ${dateLabel} 마감 · ${revenue} · 내일 채울 3종 ${fill || "집계 전"} · ${tail}`;
}

/** ISO → "11/23" (KST). */
function shortDate(iso: string) {
  const kst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return `${Number(kst.slice(5, 7))}/${Number(kst.slice(8, 10))}`;
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

function toneFor(daysLeft: number | null | undefined, threshold: number): Tone {
  if (daysLeft === null || daysLeft === undefined) return "gray";
  if (daysLeft <= 2) return "red";
  if (daysLeft <= threshold) return "amber";
  return "ok";
}

function pctTone(value: number | null): Tone {
  if (value === null) return "gray";
  if (value <= 10) return "red";
  if (value <= 30) return "amber";
  return "ok";
}
