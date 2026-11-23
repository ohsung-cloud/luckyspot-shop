"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DemoScenario } from "@/features/auto-order/demo-pos";
import type { ApprovalView, ProposalListResponse, SplitResult } from "@/features/auto-order/types";

import HqView, { type SimulateInput } from "./HqView";
import OverviewView from "./OverviewView";
import OwnerView from "./OwnerView";

/**
 * /auto-order 실증 화면.
 *
 * 점주 뷰: 1터치 승인 → 5분 취소 유예 카운트다운 → 만료 시 사업자별 확정.
 * 본사 뷰: POS 시뮬레이션 입력 → 교차예측 근거 표 → 사업자·세금계산서 분기 미리보기.
 *
 * 서버 상태가 없어도(테이블 미적용) API가 데모 실측 폴백을 돌려주므로 화면은 그대로 동작한다.
 */

type Tab = "overview" | "owner" | "hq";

type ApproveResponse = {
  ok: true;
  approval: ApprovalView;
};

type ActionResponse = {
  ok: boolean;
  status?: "canceled" | "confirmed_split";
  split?: SplitResult;
  message?: string;
  error?: string;
  remainingSeconds?: number;
};

export default function AutoOrderClient() {
  const [tab, setTab] = useState<Tab>("owner");
  const [state, setState] = useState<ProposalListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [approval, setApproval] = useState<ApprovalView | null>(null);
  const [scenario, setScenario] = useState<DemoScenario>("print_surge");
  const [storeCode, setStoreCode] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const resolving = useRef(false);

  const load = useCallback(
    async (options?: { scenario?: DemoScenario; storeCode?: string; storeLabel?: string }) => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      const code = options?.storeCode ?? storeCode;
      const nextScenario = options?.scenario ?? scenario;

      if (code) params.set("storeCode", code);
      if (nextScenario) params.set("scenario", nextScenario);

      try {
        const response = await fetch(`/api/auto-order/proposals?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as (ProposalListResponse & { error?: string }) | null;

        if (!response.ok || !payload || payload.ok !== true) {
          throw new Error(payload?.error ?? "예측을 불러오지 못했습니다.");
        }

        setState(payload);
        setScenario(nextScenario);
        setStoreCode(payload.storeCode);
        setStoreLabel(payload.storeLabel);
        setNow(Date.now());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "예측을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [scenario, storeCode],
  );

  useEffect(() => {
    // 딥링크: ?storeCode=STORE_GNG&scenario=cafe_drop (수집기·본사 테스트용)
    const params = new URLSearchParams(window.location.search);
    const code = params.get("storeCode") ?? undefined;
    const scenarioParam = params.get("scenario");
    const initialScenario =
      scenarioParam === "normal" || scenarioParam === "print_surge" || scenarioParam === "cafe_drop"
        ? scenarioParam
        : undefined;

    void load({ storeCode: code, scenario: initialScenario });
    // 최초 1회만 — 이후는 명시적 새로고침·시뮬레이션에서 부른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!approval || approval.status !== "grace_cancel_window") return;

    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [approval]);

  /**
   * 취소·확정을 화면 상태에 즉시 반영한다.
   *
   * 서버(서버리스)는 요청마다 다른 인스턴스일 수 있어, 목록을 다시 부르면
   * 방금 취소한 항목이 '대기'로 되살아나 보일 수 있다. 그래서 취소·확정 직후에는
   * 재조회 대신 이 화면의 제안 상태를 직접 바꾼다(같은 세션 안에서 일관).
   */
  const applyLocalStatus = (ids: string[], status: "canceled" | "confirmed_split") => {
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
        applyLocalStatus(
          approval.proposals.map((proposal) => proposal.id),
          "confirmed_split",
        );
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
    if (new Date(approval.expiresAt).getTime() <= now) {
      void resolveNow();
    }
  }, [approval, now, resolveNow]);

  const approve = async () => {
    if (!state) return;

    const proposalIds = state.proposals
      .filter((proposal) => proposal.status === "pending_approval")
      .map((proposal) => proposal.id);

    if (proposalIds.length === 0) return;

    setBusy(true);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch("/api/auto-order/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          storeCode: state.storeCode,
          storeLabel: state.storeLabel,
          scenario,
          proposalIds,
        }),
      });
      const payload = (await response.json().catch(() => null)) as (ApproveResponse & { error?: string }) | null;

      if (!response.ok || !payload || payload.ok !== true) {
        throw new Error(payload?.error ?? "승인하지 못했습니다.");
      }

      setApproval(payload.approval);
      setNow(Date.now());
      setNotice(null);
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
        applyLocalStatus(
          approval.proposals.map((proposal) => proposal.id),
          "confirmed_split",
        );
        return;
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "취소하지 못했습니다.");
      }

      setApproval(null);
      setNotice(payload.message ?? "발주를 취소했습니다.");
      applyLocalStatus(
        approval.proposals.map((proposal) => proposal.id),
        "canceled",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "취소하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const simulate = async (input: SimulateInput) => {
    setSimulating(true);
    setError(null);
    setNotice(null);
    setApproval(null);

    try {
      const response = await fetch("/api/auto-order/ingest-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeCode: input.storeCode,
          storeLabel: input.storeLabel,
          scenario: input.scenario,
          drinksPerDay: input.drinksPerDay,
          sheetsPerDay: input.sheetsPerDay,
          printSurgePct: input.printSurgePct,
          cafeDropPct: input.cafeDropPct,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (ProposalListResponse & { ok: true; message?: string; error?: string })
        | null;

      if (!response.ok || !payload || payload.ok !== true) {
        throw new Error(payload?.error ?? "예측하지 못했습니다.");
      }

      setState(payload);
      setScenario(input.scenario);
      setStoreCode(input.storeCode);
      setStoreLabel(input.storeLabel);
      setNotice(payload.message ?? "예측을 실행했습니다.");
      setNow(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "예측하지 못했습니다.");
    } finally {
      setSimulating(false);
    }
  };

  const remainingSeconds = approval
    ? Math.max(0, Math.ceil((new Date(approval.expiresAt).getTime() - now) / 1000))
    : 0;

  return (
    <div className="grid gap-4">
      <div className="flex rounded-[16px] bg-white p-1 shadow-[0_2px_10px_rgba(15,20,18,0.05)]" role="tablist">
        {(
          [
            { key: "overview", label: "통합 현황" },
            { key: "owner", label: "발주 승인" },
            { key: "hq", label: "본사·특허" },
          ] as { key: Tab; label: string }[]
        ).map((item) => (
          <button
            key={item.key}
            aria-selected={tab === item.key}
            className={`h-12 flex-1 rounded-[12px] text-[13.5px] font-bold transition-colors ${
              tab === item.key ? "bg-[#0F1412] text-white" : "text-[#6B746D]"
            }`}
            onClick={() => setTab(item.key)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <OverviewView
          error={error}
          loading={loading}
          onGoHq={() => setTab("hq")}
          onGoOrder={() => setTab("owner")}
          onRefresh={() => {
            setNotice(null);
            void load();
          }}
          state={state}
        />
      ) : tab === "owner" ? (
        <OwnerView
          approval={approval}
          busy={busy}
          error={error}
          loading={loading}
          notice={notice}
          onApprove={approve}
          onCancel={cancel}
          onRefresh={() => {
            setApproval(null);
            setNotice(null);
            void load();
          }}
          remainingSeconds={remainingSeconds}
          state={state}
        />
      ) : (
        <HqView
          error={error}
          loading={loading}
          notice={notice}
          onSimulate={simulate}
          simulating={simulating}
          state={state}
        />
      )}
    </div>
  );
}
