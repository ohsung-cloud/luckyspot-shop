import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { clientIp, jsonError, noStoreHeaders, readJsonObject, takeRateLimit } from "@/features/http/guard";
import {
  HQ_BOARD_KINDS,
  HQ_BOARD_STATUSES,
  notifyHqBoard,
  type HqBoardEvent,
  type HqBoardKind,
  type HqBoardStatus,
} from "@/features/notifications/hq-board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/hq-board/event — 본사 보드에 한 줄 넣기(공용 입구)
 *
 *   헤더: X-HQ-Board-Secret: <HQ_BOARD_INGEST_SECRET>
 *   본문: { kind, title, target?, contact?, amount?, detail?, sourceUrl?, eventKey, occurredAt?, status? }
 *
 * 왜 필요한가: Notion 토큰은 이 프로젝트(Vercel luckyspot-shop)에만 둔다. 가맹문의(luckyspot-fe),
 * 복합기 알림(scheduled action)처럼 **다른 곳에서 생긴 일**은 토큰을 나눠 갖지 말고 이 입구로 보낸다.
 *  · 비밀키가 설정되지 않으면 503 으로 닫힌다(열린 쓰기 창구가 되지 않게).
 *  · 같은 eventKey 는 한 번만 쌓인다(재전송·재시도 안전).
 */

const MAX_BODY_BYTES = 8 * 1024;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function readSecret() {
  return (process.env.HQ_BOARD_INGEST_SECRET ?? "").trim();
}

function secretMatches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function text(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function optionalText(value: unknown, max: number) {
  if (value === undefined || value === null || value === "") return null;
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, max) : null;
}

function buildEvent(body: Record<string, unknown>): HqBoardEvent | { error: string } {
  const kind = body.kind;
  if (typeof kind !== "string" || !HQ_BOARD_KINDS.includes(kind as HqBoardKind)) {
    return { error: `kind 는 ${HQ_BOARD_KINDS.join(" · ")} 중 하나여야 합니다.` };
  }

  const title = text(body.title, 200);
  const eventKey = text(body.eventKey, 200);

  if (!title) return { error: "title(200자 이하)이 필요합니다." };
  if (!eventKey) return { error: "eventKey(200자 이하)가 필요합니다 — 중복 방지 키입니다." };

  const status = body.status;
  if (status !== undefined && (typeof status !== "string" || !HQ_BOARD_STATUSES.includes(status as HqBoardStatus))) {
    return { error: `status 는 ${HQ_BOARD_STATUSES.join(" · ")} 중 하나여야 합니다.` };
  }

  const amount = body.amount;
  if (amount !== undefined && amount !== null) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
      return { error: "amount 는 0 이상의 숫자(원)여야 합니다." };
    }
  }

  const sourceUrl = optionalText(body.sourceUrl, 500);
  if (sourceUrl && !/^https?:\/\//.test(sourceUrl)) {
    return { error: "sourceUrl 은 http(s) 주소여야 합니다." };
  }

  return {
    amount: typeof amount === "number" ? amount : null,
    contact: optionalText(body.contact, 200),
    detail: optionalText(body.detail, 1_900),
    eventKey,
    kind: kind as HqBoardKind,
    occurredAt: optionalText(body.occurredAt, 40) ?? new Date().toISOString(),
    sourceUrl,
    status: (status as HqBoardStatus | undefined) ?? "신규",
    target: optionalText(body.target, 200),
    title,
  };
}

export async function POST(request: Request) {
  const expected = readSecret();

  if (!expected) {
    return jsonError("보드 입구가 설정되지 않았습니다(HQ_BOARD_INGEST_SECRET).", 503);
  }

  const provided =
    request.headers.get("x-hq-board-secret")?.trim() ||
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  if (!provided || !secretMatches(provided, expected)) {
    return jsonError("권한이 없습니다.", 401);
  }

  const verdict = takeRateLimit(request, `hq-board-event:${clientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS);

  if (!verdict.ok) {
    return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
      retryAfter: verdict.retryAfter,
    });
  }

  const parsed = await readJsonObject(request, MAX_BODY_BYTES);
  if (!parsed.ok) return parsed.response;

  const event = buildEvent(parsed.data);

  if ("error" in event) return jsonError(event.error, 400);

  const result = await notifyHqBoard(event);

  return NextResponse.json(
    {
      ok: result.notion !== "failed",
      eventKey: event.eventKey,
      notion: result.notion,
      webhook: result.webhook,
      notionPageUrl: result.notionPageUrl ?? null,
      details: result.details ?? [],
    },
    { headers: noStoreHeaders },
  );
}
