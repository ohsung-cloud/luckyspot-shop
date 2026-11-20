import { NextResponse } from "next/server";

import { hasAdminSession } from "@/features/admin/auth";
import { clientIp, jsonError, noStoreHeaders, readJsonObject, takeRateLimit } from "@/features/http/guard";
import {
  buildDiscordPayload,
  buildNotionPagePayload,
  buildSlackPayload,
  hqBoardConfig,
  HQ_BOARD_PROPERTIES,
  inspectHqBoardSchema,
  notifyHqBoard,
  type HqBoardEvent,
} from "@/features/notifications/hq-board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/hq-board/health — 본사 실시간 알림 보드 연결 점검
 *
 *   GET              설정 여부만(외부 호출 없음, 값은 절대 싣지 않는다)
 *   GET  ?schema=1   Notion 보드 속성이 코드와 맞는지까지 확인(토큰 필요)
 *   POST { write }   관리자 로그인 후 실제 점검:
 *                      · 기본: 보낼 본문 미리보기만 (아무것도 쓰지 않는다)
 *                      · write:true — 보드에 `[연결 점검]` row 1건을 실제로 만든다
 *
 * 왜 필요한가: NOTION_TOKEN·NOTION_HQ_BOARD_DB_ID 는 Vercel 화면에서만 넣을 수 있어서,
 * 넣은 뒤 "정말 연결됐는지"를 대표가 한 번에 확인할 수 있는 창구가 필요하다.
 */

const WINDOW_MS = 10 * 60 * 1000;

function probeEvent(): HqBoardEvent {
  return {
    amount: null,
    contact: "연결 점검 (자동)",
    detail: "본사 알림 보드 연결 확인용 줄입니다. 확인 후 Notion 에서 지워도 됩니다.",
    eventKey: `probe:${Date.now()}`,
    kind: "장비·복합기이상",
    occurredAt: new Date(),
    status: "처리완료",
    target: "본사",
    title: "[연결 점검] 본사 실시간 알림 보드",
  };
}

export async function GET(request: Request) {
  const config = hqBoardConfig();
  const wantsSchema = new URL(request.url).searchParams.get("schema") === "1";

  return NextResponse.json(
    {
      ok: true,
      disabled: config.disabled,
      notion: {
        configured: config.notion,
        tokenSet: config.notionTokenSet,
        databaseIdSet: config.databaseIdSet,
        apiVersion: config.apiVersion,
      },
      webhook: config.webhook,
      properties: HQ_BOARD_PROPERTIES,
      schema: wantsSchema && config.notion ? await inspectHqBoardSchema() : null,
    },
    { headers: noStoreHeaders },
  );
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) {
    return jsonError("관리자 로그인이 필요합니다.", 401);
  }

  const verdict = takeRateLimit(request, `hq-board-health:${clientIp(request)}`, 5, WINDOW_MS);
  if (!verdict.ok) {
    return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
      retryAfter: verdict.retryAfter,
    });
  }

  const parsed = await readJsonObject(request, 1024);
  if (!parsed.ok) return parsed.response;

  const event = probeEvent();
  const config = hqBoardConfig();
  const notionPayload = config.databaseId
    ? buildNotionPagePayload(event, config.databaseId)
    : null;

  const preview = {
    notion: notionPayload,
    discord: config.webhook === "discord" ? buildDiscordPayload(event) : null,
    slack: config.webhook === "slack" ? buildSlackPayload(event) : null,
  };

  if (parsed.data.write !== true) {
    return NextResponse.json(
      {
        ok: true,
        mode: "preview",
        configured: { notion: config.notion, webhook: config.webhook },
        preview,
        schema: config.notion ? await inspectHqBoardSchema() : null,
      },
      { headers: noStoreHeaders },
    );
  }

  const result = await notifyHqBoard(event);

  return NextResponse.json(
    { ok: true, mode: "write", configured: { notion: config.notion, webhook: config.webhook }, eventKey: event.eventKey, result },
    { headers: noStoreHeaders },
  );
}
