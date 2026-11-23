import { NextResponse } from "next/server";

import { isDemoScenario, type DemoScenario } from "@/features/auto-order/demo-pos";
import { splitProposals } from "@/features/auto-order/entity-split";
import { buildState, newApprovalId } from "@/features/auto-order/service";
import { graceState, issueGrace, remainingSeconds, verifyGrace, GRACE_SECONDS } from "@/features/auto-order/state";
import { patchApproval, saveApproval, saveLedger } from "@/features/auto-order/store";
import type { GracePayload } from "@/features/auto-order/types";
import { jsonError, readJsonObject, takeRateLimit } from "@/features/http/guard";

/**
 * /api/auto-order/proposals
 *
 *  GET  ?storeCode=STORE_YDP  → 제안 목록 + 예측 근거 + 사업자별 분기 미리보기
 *  POST action=approve        → 1터치 승인. 5분 취소 유예(grace_cancel_window)로 진입
 *  POST action=cancel         → 유예 중 즉시 취소(만료 뒤에는 성립하지 않는다)
 *  POST action=resolve        → 유예 만료 확인. 만료 뒤에만 사업자별 발주 전표로 확정
 *
 * 승인 내용은 서명 토큰에 담겨 내려간다. 취소·확정은 그 토큰으로만 되고,
 * 만료 시각은 서버가 검증한다(클라이언트 시계 조작으로 앞당길 수 없다).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_CODE = /^[A-Za-z0-9_-]{2,32}$/;
const MAX_SELECTION = 20;

function storeParams(url: URL) {
  const raw = url.searchParams.get("storeCode") ?? "";
  const storeCode = STORE_CODE.test(raw.trim()) ? raw.trim().toUpperCase() : undefined;
  const scenarioParam = url.searchParams.get("scenario");
  const scenario: DemoScenario | undefined = isDemoScenario(scenarioParam) ? scenarioParam : undefined;
  // 점주 어드민이 매장명을 넘기면 그 이름으로 분기 전표를 만든다(없으면 데모 이름).
  const labelParam = (url.searchParams.get("storeLabel") ?? "").trim().slice(0, 40);
  const storeLabel = labelParam.length >= 2 ? labelParam : undefined;

  return { storeCode, scenario, storeLabel };
}

function approvalView(payload: GracePayload, token: string, now = new Date()) {
  const { remainingSeconds: remaining, expired } = graceState(payload, now);

  return {
    approvalId: payload.approvalId,
    token,
    status: expired ? ("confirmed_split" as const) : ("grace_cancel_window" as const),
    approvedAt: payload.approvedAt,
    expiresAt: payload.expiresAt,
    graceSeconds: GRACE_SECONDS,
    remainingSeconds: remaining,
    proposals: payload.proposals,
    splitPreview: splitProposals({
      approvalId: payload.approvalId,
      storeCode: payload.storeCode,
      storeLabel: payload.storeLabel,
      proposals: payload.proposals,
    }),
    storeCode: payload.storeCode,
    storeLabel: payload.storeLabel,
  };
}

async function confirm(payload: GracePayload, now: Date) {
  const split = splitProposals({
    approvalId: payload.approvalId,
    storeCode: payload.storeCode,
    storeLabel: payload.storeLabel,
    proposals: payload.proposals.map((proposal) => ({ ...proposal, status: "confirmed_split" as const })),
  });

  await patchApproval(payload.approvalId, "confirmed_split", {
    split_result: split,
    confirmed_at: now.toISOString(),
  });
  await saveLedger(split, now.toISOString());

  return split;
}

export async function GET(request: Request) {
  const limited = takeRateLimit(request, "auto-order-list", 120, 60_000);
  if (!limited.ok) {
    return jsonError("요청이 너무 많습니다.", 429, { retryAfter: limited.retryAfter });
  }

  const { storeCode, scenario, storeLabel } = storeParams(new URL(request.url));
  const built = await buildState({ storeCode, scenario, storeLabel });

  return NextResponse.json(built.state, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const limited = takeRateLimit(request, "auto-order-action", 60, 60_000);
  if (!limited.ok) {
    return jsonError("요청이 너무 많습니다.", 429, { retryAfter: limited.retryAfter });
  }

  const parsed = await readJsonObject(request, 128 * 1024);
  if (!parsed.ok) return parsed.response;

  const data = parsed.data;
  const action = data.action;
  const now = new Date();

  if (action === "approve") {
    const ids = Array.isArray(data.proposalIds)
      ? data.proposalIds.filter((id): id is string => typeof id === "string").slice(0, MAX_SELECTION)
      : [];

    if (ids.length === 0) {
      return jsonError("승인할 발주 항목을 선택해 주세요.", 400);
    }

    const scenarioParam = data.scenario;
    const scenario: DemoScenario | undefined = isDemoScenario(scenarioParam) ? scenarioParam : undefined;

    const built = await buildState({
      storeCode: typeof data.storeCode === "string" ? data.storeCode : undefined,
      storeLabel: typeof data.storeLabel === "string" ? data.storeLabel : undefined,
      scenario,
    });

    const selected = built.state.proposals.filter((proposal) => ids.includes(proposal.id));

    if (selected.length === 0) {
      return jsonError("제안이 갱신되었습니다. 새로고침한 뒤 다시 시도해 주세요.", 409);
    }

    if (selected.some((proposal) => proposal.status === "held_anomaly")) {
      return jsonError("이상 감지로 보류된 제안입니다. 장비 상태를 먼저 확인해 주세요.", 409);
    }

    if (selected.some((proposal) => proposal.status !== "pending_approval")) {
      return jsonError("이미 처리된 항목이 있습니다. 새로고침해 주세요.", 409);
    }

    const approvalId = newApprovalId();
    const split = splitProposals({
      approvalId,
      storeCode: built.storeCode,
      storeLabel: built.storeLabel,
      proposals: selected,
    });

    const { payload, token } = issueGrace({
      approvalId,
      storeCode: built.storeCode,
      storeLabel: built.storeLabel,
      proposals: selected,
      now,
    });

    await saveApproval({
      approvalId,
      storeCode: built.storeCode,
      storeLabel: built.storeLabel,
      status: "grace_cancel_window",
      asOfDate: built.state.asOfDate,
      approvedAt: payload.approvedAt,
      expiresAt: payload.expiresAt,
      proposals: payload.proposals,
      split,
      updatedAt: now.toISOString(),
    });

    return NextResponse.json(
      {
        ok: true,
        approval: {
          ...approvalView(payload, token, now),
          splitPreview: split,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (action === "cancel" || action === "resolve") {
    const payload = verifyGrace(data.token);

    if (!payload) {
      return jsonError("승인 정보를 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요.", 400);
    }

    const remaining = remainingSeconds(payload.expiresAt, now);

    if (action === "cancel") {
      if (remaining <= 0) {
        const split = await confirm(payload, now);
        return NextResponse.json(
          {
            ok: true,
            status: "confirmed_split",
            approvalId: payload.approvalId,
            remainingSeconds: 0,
            message: "5분 유예가 이미 지나 사업자별 발주로 확정되었습니다.",
            split,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      await patchApproval(payload.approvalId, "canceled", { canceled_at: now.toISOString() });

      return NextResponse.json(
        {
          ok: true,
          status: "canceled",
          approvalId: payload.approvalId,
          remainingSeconds: remaining,
          message: "발주를 취소했습니다. 오늘은 아무것도 주문되지 않습니다.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (remaining > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "아직 5분 취소 유예 중입니다.",
          remainingSeconds: remaining,
        },
        { status: 425, headers: { "Cache-Control": "no-store" } },
      );
    }

    const split = await confirm(payload, now);

    return NextResponse.json(
      {
        ok: true,
        status: "confirmed_split",
        approvalId: payload.approvalId,
        remainingSeconds: 0,
        split,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return jsonError("알 수 없는 요청입니다.", 400);
}
