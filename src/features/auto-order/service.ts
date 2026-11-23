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
import {
  loadMachineStatus,
  loadRevenueSummary,
  loadSales,
  loadTelemetryHistory,
  listApprovals,
} from "./store";
import { stockOverridesFromTelemetry, telemetrySummary } from "./telemetry";
import { findStoreRecord } from "../stores/registry";
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

  // 포털 실측이 있으면 토너 K/C/M/Y % · 용지 트레이 %를 현재고로 환산해 덮어쓴다.
  const telemetryHistory = await loadTelemetryHistory(storeCode);
  const latestTelemetry = telemetryHistory.length > 0 ? telemetryHistory[telemetryHistory.length - 1] : null;
  const stockOverrides = stockOverridesFromTelemetry(latestTelemetry);

  // 교체완료 피드백 루프 — 점주가 누른 교체 기록(학습 계수·마지막 교체일)을 예측에 바로 넣는다.
  const register = await findStoreRecord(storeCode).catch(() => null);
  const calibration = register?.calibrations ?? {};

  const run = forecastStore({
    storeCode,
    storeLabel,
    rows,
    dataSource: loaded?.dataSource ?? "demo",
    stockOverrides,
    calibration,
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

  // 통합 현황 — 포털 실측이 없으면 데모 시계열의 마지막 날/누적을 보여준다.
  const portalRevenue = await loadRevenueSummary(storeCode);
  const machine = await loadMachineStatus(storeCode);
  const lastRow = rows[rows.length - 1];
  const previousRow = rows[rows.length - 2];

  const revenue =
    portalRevenue ??
    (lastRow
      ? {
          source: "demo" as const,
          cafeToday: lastRow.cafeRevenue,
          cafeYesterday: previousRow?.cafeRevenue ?? null,
          cafeMonth: rows.reduce((sum, row) => sum + row.cafeRevenue, 0),
          printMonth: rows.reduce((sum, row) => sum + row.printRevenue, 0),
          capturedAt: null,
        }
      : null);

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
      telemetry: telemetrySummary(latestTelemetry),
      overview: { revenue, machine },
      dataQuality: { days: rows.length, sparse: rows.length > 0 && rows.length < 7 },
      storeRegistered: Boolean(register),
    },
  };
}

export function newApprovalId() {
  return `APR-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}
