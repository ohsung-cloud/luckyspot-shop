import { after } from "next/server";

/**
 * 본사 실시간 알림 보드 — Notion DB + (선택) Discord/Slack 웹훅.
 *
 * 목적
 *  점주 발주 접수, 토스 실결제 완료, (앞으로) 가맹문의·복합기 이상·스탬프쿠폰까지
 *  한 곳(Notion `🚨 럭키스팟 실시간 본사 알림 보드`)에 쌓이게 한다. 손이 닿는 채널이
 *  디스코드/슬랙이면 같은 내용을 웹훅으로도 동시에 보낸다.
 *
 * 원칙
 *  · 실패해도 주문·결제 흐름을 막지 않는다. 어떤 경우에도 예외를 밖으로 던지지 않고,
 *    응답을 보낸 뒤(after())에 실행하며 결과는 로그로만 남긴다.
 *  · 설정이 없으면 조용히 건너뛴다(로그 한 줄). 주문 접수 자체는 정상.
 *  · 같은 일이 두 번 기록되지 않게 `이벤트키`로 중복을 먼저 확인한다.
 *    (결제 승인 재시도, 새로고침, 게이트웨이 재전송에서 같은 row 가 쌓이는 것을 막는다)
 *  · 테스트 결제는 기록하지 않는다 — 호출하는 쪽(confirm 라우트)에서 걸러서 넘긴다.
 *  · 휴대폰 번호는 로그에 그대로 남기지 않는다.
 *
 * 필요한 환경변수 (Vercel → luckyspot-shop → Settings → Environment Variables)
 *   NOTION_TOKEN               Notion 통합(인테그레이션) 시크릿. 서버 전용.
 *   NOTION_HQ_BOARD_DB_ID      보드 데이터베이스 id (하이픈 포함/제외 모두 허용)
 *   DISCORD_WEBHOOK_URL        (선택) 디스코드 채널 웹훅
 *   SLACK_WEBHOOK_URL          (선택) 슬랙 인커밍 웹훅
 *   NOTION_API_VERSION         (선택) 기본 2022-06-28 — DB id 로 row 를 만드는 안정 버전
 *   NOTION_API_BASE_URL        (선택) 점검용. 기본 https://api.notion.com
 *   HQ_BOARD_DISABLED=1        (선택) 비상 스위치 — 어떤 알림도 내보내지 않는다
 */

export type HqBoardKind =
  | "가맹문의"
  | "점주발주"
  | "결제완료"
  | "장비·복합기이상"
  | "스탬프쿠폰";

export type HqBoardStatus = "신규" | "확인중" | "처리완료";

export const HQ_BOARD_KINDS: HqBoardKind[] = [
  "가맹문의",
  "점주발주",
  "결제완료",
  "장비·복합기이상",
  "스탬프쿠폰",
];

export const HQ_BOARD_STATUSES: HqBoardStatus[] = ["신규", "확인중", "처리완료"];

/** Notion DB 속성 이름 — 보드를 만드는 스크립트(scripts/notion-hq-board-create.mjs)와 같다. */
export const HQ_BOARD_PROPERTIES = {
  title: "제목",
  kind: "유형",
  target: "지점/대상",
  contact: "연락처/금액",
  status: "상태",
  occurredAt: "발생시각",
  detail: "상세메모/원본링크",
  eventKey: "이벤트키",
} as const;

export type HqBoardEvent = {
  kind: HqBoardKind;
  /** 보드에 보일 한 줄 제목. 예: "결제완료 · 당산역점 · 32,000원" */
  title: string;
  /** 지점명 또는 대상(예: "당산역점 5호"). 개인 주문이면 null. */
  target?: string | null;
  /** 연락처(문자 그대로). 금액만 있으면 비워도 된다. */
  contact?: string | null;
  /** 원 단위 금액 — 있으면 `연락처/금액`에 함께 적는다. */
  amount?: number | null;
  detail?: string | null;
  sourceUrl?: string | null;
  /** 중복 방지 키. 같은 일에는 항상 같은 값(예: `order:LS-...`, `payment:LS-...`). */
  eventKey: string;
  occurredAt?: Date | string;
  status?: HqBoardStatus;
};

export type HqBoardResult = {
  notion: "created" | "duplicate" | "skipped" | "failed";
  webhook: "sent" | "skipped" | "failed";
  notionPageUrl?: string | null;
  details?: string[];
};

const NOTION_DEFAULT_BASE = "https://api.notion.com";
const NOTION_DEFAULT_VERSION = "2022-06-28";
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_TEXT = 1_900;
const KST = "Asia/Seoul";

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

export function hqBoardConfig() {
  const disabled = env("HQ_BOARD_DISABLED") === "1";
  const token = env("NOTION_TOKEN");
  const databaseId = normalizeNotionId(env("NOTION_HQ_BOARD_DB_ID"));
  const discord = env("DISCORD_WEBHOOK_URL");
  const slack = env("SLACK_WEBHOOK_URL");

  return {
    disabled,
    notion: Boolean(token && databaseId),
    notionTokenSet: Boolean(token),
    databaseIdSet: Boolean(databaseId),
    databaseId,
    webhook: discord ? ("discord" as const) : slack ? ("slack" as const) : null,
    apiBaseUrl: env("NOTION_API_BASE_URL") || NOTION_DEFAULT_BASE,
    apiVersion: env("NOTION_API_VERSION") || NOTION_DEFAULT_VERSION,
  };
}

/** URL·복사본에 섞여 들어온 id 에서 32자리 hex 만 뽑아 하이픈 형식으로 되돌린다. */
export function normalizeNotionId(raw: string) {
  const compact = raw.replace(/-/g, "").trim();
  if (!/^[0-9a-fA-F]{32}$/.test(compact)) return "";
  const hex = compact.toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 로그에 남길 때 번호를 가린다. */
export function maskContact(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 8 && /^01\d/.test(digits)) {
    return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  }
  return value;
}

export function formatWon(amount: number) {
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

/** `연락처/금액` 한 칸에 들어갈 문구. */
export function contactOrAmountFor(event: HqBoardEvent) {
  const parts: string[] = [];
  if (event.contact?.trim()) parts.push(event.contact.trim());
  if (typeof event.amount === "number" && Number.isFinite(event.amount)) {
    parts.push(formatWon(event.amount));
  }
  return parts.join(" · ");
}

function occurredAtIso(event: HqBoardEvent) {
  const value = event.occurredAt ?? new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function kstStamp(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function trim(text: string) {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

function richText(text: string) {
  return [{ type: "text" as const, text: { content: trim(text) } }];
}

/** 상세메모 + 원본 링크를 한 칸에 합친다(링크는 Notion 이 자동으로 링크로 만든다). */
export function detailTextFor(event: HqBoardEvent) {
  const lines: string[] = [];
  if (event.detail?.trim()) lines.push(event.detail.trim());
  if (event.sourceUrl?.trim()) lines.push(`원본: ${event.sourceUrl.trim()}`);
  if (!lines.length) return "";
  return trim(lines.join("\n"));
}

/** POST /v1/pages 에 보낼 본문. 순수 함수라 테스트에서 그대로 검증한다. */
export function buildNotionPagePayload(event: HqBoardEvent, databaseId: string) {
  const contact = contactOrAmountFor(event);
  const detail = detailTextFor(event);
  const properties: Record<string, unknown> = {
    [HQ_BOARD_PROPERTIES.title]: {
      title: richText(event.title || event.kind),
    },
    [HQ_BOARD_PROPERTIES.kind]: { select: { name: event.kind } },
    [HQ_BOARD_PROPERTIES.status]: { select: { name: event.status ?? "신규" } },
    [HQ_BOARD_PROPERTIES.occurredAt]: { date: { start: occurredAtIso(event) } },
    [HQ_BOARD_PROPERTIES.eventKey]: { rich_text: richText(event.eventKey) },
  };

  if (event.target?.trim()) {
    properties[HQ_BOARD_PROPERTIES.target] = { rich_text: richText(event.target.trim()) };
  }
  if (contact) {
    properties[HQ_BOARD_PROPERTIES.contact] = { rich_text: richText(contact) };
  }
  if (detail) {
    properties[HQ_BOARD_PROPERTIES.detail] = { rich_text: richText(detail) };
  }

  return {
    parent: { database_id: databaseId },
    properties,
  };
}

const KIND_COLOR: Record<HqBoardKind, number> = {
  가맹문의: 0x2f6fed,
  점주발주: 0xf59e0b,
  결제완료: 0x16a34a,
  "장비·복합기이상": 0xdc2626,
  스탬프쿠폰: 0x8b5cf6,
};

/** 디스코드 웹훅 본문(embed 1개). */
export function buildDiscordPayload(event: HqBoardEvent, notionUrl?: string | null) {
  const iso = occurredAtIso(event);
  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (event.target?.trim()) fields.push({ name: "지점/대상", value: event.target.trim(), inline: true });
  const contact = contactOrAmountFor(event);
  if (contact) fields.push({ name: "연락처/금액", value: contact, inline: true });
  if (event.detail?.trim()) fields.push({ name: "상세", value: trim(event.detail.trim()), inline: false });
  if (event.sourceUrl?.trim()) fields.push({ name: "원본", value: event.sourceUrl.trim(), inline: false });
  if (notionUrl) fields.push({ name: "보드", value: notionUrl, inline: false });

  return {
    username: "럭키스팟 본사 알림",
    embeds: [
      {
        title: trim(event.title || event.kind),
        color: KIND_COLOR[event.kind],
        fields,
        timestamp: iso,
        footer: { text: `유형 · ${event.kind} · 상태 ${event.status ?? "신규"}` },
      },
    ],
  };
}

/** 슬랙 인커밍 웹훅 본문(blocks). */
export function buildSlackPayload(event: HqBoardEvent, notionUrl?: string | null) {
  const iso = occurredAtIso(event);
  const lines: string[] = [];
  if (event.target?.trim()) lines.push(`*지점/대상*  ${event.target.trim()}`);
  const contact = contactOrAmountFor(event);
  if (contact) lines.push(`*연락처/금액*  ${contact}`);
  if (event.detail?.trim()) lines.push(`*상세*  ${trim(event.detail.trim())}`);
  if (event.sourceUrl?.trim()) lines.push(`*원본*  ${event.sourceUrl.trim()}`);
  if (notionUrl) lines.push(`*보드*  ${notionUrl}`);

  return {
    text: `[${event.kind}] ${event.title}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${event.kind}* · ${event.title}\n${lines.join("\n")}\n_${kstStamp(iso)} · 상태 ${event.status ?? "신규"}_`,
        },
      },
    ],
  };
}

function notionHeaders(config: ReturnType<typeof hqBoardConfig>) {
  return {
    Authorization: `Bearer ${env("NOTION_TOKEN")}`,
    "Content-Type": "application/json",
    "Notion-Version": config.apiVersion,
  };
}

type FetchJsonResult =
  | { ok: true; status: number; data: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterMs?: number };

async function fetchJson(
  url: string,
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: unknown },
): Promise<FetchJsonResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: "no-store",
    });

    const raw = await response.text().catch(() => "");
    let data: Record<string, unknown> = {};

    if (raw) {
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        data = { raw: raw.slice(0, 200) };
      }
    }

    if (response.ok) return { ok: true, status: response.status, data };

    const retryAfter = Number(response.headers.get("retry-after"));
    return {
      ok: false,
      status: response.status,
      error: describeNotionError(data, response.status),
      retryAfterMs: Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 3_000) : undefined,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return { ok: false, status: 0, error: timedOut ? "timeout" : "request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}

function describeNotionError(data: Record<string, unknown>, status: number) {
  const code = typeof data.code === "string" ? data.code : "";
  const message = typeof data.message === "string" ? data.message : "";
  return `status_${status}${code ? ` ${code}` : ""}${message ? `: ${message.slice(0, 160)}` : ""}`;
}

/** 이미 같은 이벤트키의 row 가 있는지. 조회 실패는 "없음"으로 본다(알림을 잃지 않는다). */
async function alreadyRecorded(
  config: ReturnType<typeof hqBoardConfig>,
  databaseId: string,
  eventKey: string,
): Promise<{ duplicate: boolean; error?: string }> {
  const result = await fetchJson(
    `${config.apiBaseUrl}/v1/databases/${databaseId}/query`,
    {
      method: "POST",
      headers: notionHeaders(config),
      body: {
        filter: {
          property: HQ_BOARD_PROPERTIES.eventKey,
          rich_text: { equals: eventKey },
        },
        page_size: 1,
      },
    },
  );

  if (!result.ok) return { duplicate: false, error: result.error };

  const results = result.data.results;
  return { duplicate: Array.isArray(results) && results.length > 0 };
}

async function createNotionRow(
  config: ReturnType<typeof hqBoardConfig>,
  databaseId: string,
  event: HqBoardEvent,
): Promise<{ status: HqBoardResult["notion"]; url?: string | null; detail?: string }> {
  const body = buildNotionPagePayload(event, databaseId);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await fetchJson(`${config.apiBaseUrl}/v1/pages`, {
      method: "POST",
      headers: notionHeaders(config),
      body,
    });

    if (result.ok) {
      const url = typeof result.data.url === "string" ? result.data.url : null;
      return { status: "created", url };
    }

    const retryable = result.status === 429 || result.status >= 500;
    if (!retryable || attempt === 1) return { status: "failed", detail: result.error };

    await new Promise((resolve) => setTimeout(resolve, result.retryAfterMs ?? 400));
  }

  return { status: "failed", detail: "retry_exhausted" };
}

async function postWebhook(
  config: ReturnType<typeof hqBoardConfig>,
  event: HqBoardEvent,
  notionUrl?: string | null,
): Promise<HqBoardResult["webhook"]> {
  if (!config.webhook) return "skipped";

  const url = config.webhook === "discord" ? env("DISCORD_WEBHOOK_URL") : env("SLACK_WEBHOOK_URL");
  const body =
    config.webhook === "discord"
      ? buildDiscordPayload(event, notionUrl)
      : buildSlackPayload(event, notionUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.ok) return "sent";

    const detail = (await response.text().catch(() => "")).slice(0, 160);
    console.warn(`[hq-board] ${config.webhook} 웹훅 실패 status=${response.status} ${detail}`);
    return "failed";
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "timeout" : "request_failed";
    console.warn(`[hq-board] ${config.webhook} 웹훅 오류 ${reason}`);
    return "failed";
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 한 건을 보드에 남긴다. 주문·결제 응답을 막지 않도록 after() 안에서 호출한다.
 * 반환값은 점검(health) 경로에서만 쓰고, 라우트 응답에는 싣지 않는다.
 */
export async function notifyHqBoard(event: HqBoardEvent): Promise<HqBoardResult> {
  const result: HqBoardResult = { notion: "skipped", webhook: "skipped", details: [] };
  const config = hqBoardConfig();

  if (config.disabled) {
    result.details?.push("disabled_by_env");
    return result;
  }

  // 1) Notion — 중복 확인 후 생성
  if (config.notion && config.databaseId) {
    const seen = await alreadyRecorded(config, config.databaseId, event.eventKey);

    if (seen.error) {
      // 속성이 없거나 권한이 없으면 조회가 실패한다. 생성은 시도하고, 원인은 점검 경로에서 보여준다.
      result.details?.push(`dedupe_lookup_failed ${seen.error}`);
    }

    if (seen.duplicate) {
      result.notion = "duplicate";
    } else {
      const created = await createNotionRow(config, config.databaseId, event);
      result.notion = created.status;
      result.notionPageUrl = created.url ?? null;
      if (created.detail) result.details?.push(`notion ${created.detail}`);
    }
  } else {
    result.details?.push("notion_not_configured");
  }

  // 2) 웹훅 — Notion 과 별개로 시도한다(보드가 막혀도 알림은 가게)
  if (result.notion !== "duplicate") {
    result.webhook = await postWebhook(config, event, result.notionPageUrl);
  }

  const summary = [
    `kind=${event.kind}`,
    `key=${event.eventKey}`,
    `notion=${result.notion}`,
    `webhook=${result.webhook}`,
    result.notionPageUrl ? `page=${result.notionPageUrl}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (result.notion === "failed" || result.webhook === "failed") {
    console.warn(`[hq-board] 알림 일부 실패 — ${summary}${result.details?.length ? ` | ${result.details.join(" | ")}` : ""}`);
  } else if (result.notion === "skipped" && result.webhook === "skipped") {
    console.log(`[hq-board] 설정이 없어 건너뜀 — ${summary}`);
  } else {
    console.log(`[hq-board] 알림 처리 — ${summary}`);
  }

  return result;
}

/** 응답을 보낸 뒤 알림을 시도한다. 설정이 하나도 없어도 로그 한 줄만 남긴다. */
export function queueHqBoardAlert(event: HqBoardEvent) {
  const run = () => notifyHqBoard(event).catch(() => undefined);

  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * 보드 DB 의 속성 구성이 코드와 맞는지 확인한다(점검 경로 전용, 읽기만).
 * 없는 속성 이름을 그대로 돌려주므로 그대로 보드를 고치면 된다.
 */
export async function inspectHqBoardSchema() {
  const config = hqBoardConfig();

  if (!config.notion || !config.databaseId) {
    return { ok: false as const, reason: "notion_not_configured" as const };
  }

  const result = await fetchJson(`${config.apiBaseUrl}/v1/databases/${config.databaseId}`, {
    method: "GET",
    headers: notionHeaders(config),
  });

  if (!result.ok) {
    return { ok: false as const, reason: "notion_request_failed" as const, detail: result.error };
  }

  const properties = (result.data.properties ?? {}) as Record<string, { type?: string }>;
  const present = Object.keys(properties);
  const expected = Object.values(HQ_BOARD_PROPERTIES);

  return {
    ok: true as const,
    title: typeof result.data.title === "string" ? result.data.title : null,
    present,
    missing: expected.filter((name) => !present.includes(name)),
    unexpected: present.filter((name) => !expected.includes(name as (typeof expected)[number])),
  };
}
