import { randomUUID } from "node:crypto";

import {
  DEFAULT_DEMO_STORE_CODE,
  DEFAULT_SCENARIO,
  type DemoScenario,
  generateDemoSeries,
  resolveDemoStore,
} from "./demo-pos";
import { splitProposals } from "./entity-split";
import { forecastStore } from "./forecast";
import { buildProposals, proposalTotals } from "./proposal";
import { loadSales, listApprovals } from "./store";
import type { AutoOrderProposal, ProposalListResponse, ProposalStatus, SplitResult } from "./types";

/**
 * API·화면이 공유하는 조립 계층.
 *
 * 입력 우선순위: 인메모리(POS 방금 입력) → Supabase 마감 → 데모 실측 폴백.
 * 어느 경로든 같은 예측·제안·분기 결과를 낸다.
 */

export type BuildStateInput = {
  storeCode?: string | null;
  storeLabel?: string | null;
  scenario?: DemoScenario | null;
};

export type BuiltState = {
  state: ProposalListResponse;
  /** 상태 덮어쓰기 전 원본 제안(승인 대상 판정용) */
  rawProposals: AutoOrderProposal[];
  storeCode: string;
  storeLabel: string;
};

export async function buildState(input: BuildStateInput = {}): Promise<BuiltState> {
  const storeCode = (input.storeCode ?? "").trim().toUpperCase() || DEFAULT_DEMO_STORE_CODE;
  const demoStore = resolveDemoStore(storeCode);
  const storeLabel = (input.storeLabel ?? "").trim() || demoStore.label;
  const scenario = input.scenario ?? DEFAULT_SCENARIO;

  const loaded = await loadSales(storeCode);

  const rows =
    loaded?.rows ??
    generateDemoSeries({
      storeCode,
      storeLabel,
      scenario,
    });

  const run = forecastStore({
    storeCode,
    storeLabel,
    rows,
    dataSource: loaded?.dataSource ?? "demo",
  });

  const rawProposals = buildProposals(run);

  // 승인 이력 덮어쓰기는 **같은 예측 결과일 때만** 적용한다.
  //  - 이상 감지(hold) 중에는 과거 승인 상태를 보여주지 않는다(전부 held_anomaly).
  //  - 마감 데이터가 바뀌어 제안 id가 달라지면 이전 승인은 이 제안에 대한 것이 아니다.
  const currentIds = new Set(rawProposals.map((proposal) => proposal.id));
  const approvals = run.hold
    ? []
    : listApprovals(storeCode).filter((approval) =>
        approval.proposals.every((item) => currentIds.has(item.id)),
      );

  const overridden: AutoOrderProposal[] = rawProposals.map((proposal) => {
    const approval = approvals.find((candidate) =>
      candidate.proposals.some((item) => item.id === proposal.id),
    );

    if (!approval) return proposal;

    const status: ProposalStatus =
      approval.status === "grace_cancel_window"
        ? "grace_cancel_window"
        : approval.status === "confirmed_split"
          ? "confirmed_split"
          : approval.status === "canceled"
            ? "canceled"
            : proposal.status;

    return { ...proposal, status };
  });

  const actionable = overridden.filter(
    (proposal) => proposal.status === "pending_approval" || proposal.status === "grace_cancel_window",
  );

  const splitPreview: SplitResult | null =
    actionable.length > 0 && !run.hold
      ? splitProposals({
          approvalId: "PREVIEW",
          storeCode,
          storeLabel,
          proposals: actionable,
        })
      : null;

  return {
    rawProposals,
    storeCode,
    storeLabel,
    state: {
      ok: true,
      storeCode,
      storeLabel,
      asOfDate: run.asOfDate,
      serverTime: new Date().toISOString(),
      graceSeconds: 300,
      dataSource: run.dataSource,
      hold: run.hold,
      anomalies: run.anomalies,
      proposals: overridden,
      totals: proposalTotals(actionable),
      splitPreview,
      run,
    },
  };
}

export function newApprovalId() {
  return `APR-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}
