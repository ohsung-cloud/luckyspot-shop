#!/usr/bin/env node
/**
 * `🚨 럭키스팟 실시간 본사 알림 보드` Notion 데이터베이스를 만든다.
 *
 * 쓰는 법 (토큰이 있는 곳에서 한 번):
 *   NOTION_TOKEN=ntn_... node scripts/notion-hq-board-create.mjs --parent-page <페이지id> --seed
 *
 *   --parent-page  보드를 둘 Notion 페이지 id (없으면 NOTION_HQ_BOARD_PARENT_PAGE_ID)
 *   --seed         예시 1건(당산역점 5호 복합기 전사벨트 C5-1120)도 같이 넣는다
 *   --dry-run      실제로 만들지 않고 보낼 본문만 확인
 *
 * 출력: 새 데이터베이스 id / URL, 그리고 Vercel 에 넣을 환경변수 두 줄.
 * 속성 이름은 src/features/notifications/hq-board.ts 의 HQ_BOARD_PROPERTIES 와 같다.
 */

const API_BASE = (process.env.NOTION_API_BASE_URL ?? "").trim().replace(/\/+$/, "") || "https://api.notion.com";
const VERSION = (process.env.NOTION_API_VERSION ?? "").trim() || "2022-06-28";
const TOKEN = (process.env.NOTION_TOKEN ?? "").trim();

const TITLE = "🚨 럭키스팟 실시간 본사 알림 보드";

const PROPERTIES = {
  제목: { title: {} },
  유형: {
    select: {
      options: [
        { name: "가맹문의", color: "blue" },
        { name: "점주발주", color: "orange" },
        { name: "결제완료", color: "green" },
        { name: "장비·복합기이상", color: "red" },
        { name: "스탬프쿠폰", color: "purple" },
      ],
    },
  },
  "지점/대상": { rich_text: {} },
  "연락처/금액": { rich_text: {} },
  상태: {
    select: {
      options: [
        { name: "신규", color: "red" },
        { name: "확인중", color: "yellow" },
        { name: "처리완료", color: "green" },
      ],
    },
  },
  발생시각: { date: {} },
  "상세메모/원본링크": { rich_text: {} },
  이벤트키: { rich_text: {} },
};

/** 2026-11-20 실제 알림: 당산역점 5호 복합기 전사벨트 수명 만료 (유피소프트) */
const SEED = {
  kind: "장비·복합기이상",
  title: "복합기 이상 · 당산역점 5호 · 전사벨트 수명 만료 (C5-1120)",
  target: "당산역점 5호 (삼성 X7500LXR)",
  contact: "유피소프트 1522-5044 · inkwa@inkwa.co.kr",
  detail: [
    "알림코드 11 / C5-1120 — 이미지 전사(transfer) 벨트 수명 종료. 부품 교체 필요(인쇄는 계속 가능).",
    "장비: SAMSUNG X7500LXR · 시리얼 ZPBKBJNR3000GJP · IP 192.168.0.150",
    "원본: mpsmonitor.com 알림 메일 (2026-11-19 22:30 수신)",
  ].join("\n"),
  sourceUrl: "https://mail.google.com/mail/u/0/#inbox/1a1f400773e10bcf",
  eventKey: "printer:A239-C5-1120-20261119",
  occurredAt: "2026-11-19T22:30:00+09:00",
  status: "신규",
};

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const next = process.argv[index + 1];
  return next && !next.startsWith("--") ? next : true;
}

function normalizeId(raw) {
  const compact = String(raw ?? "").replace(/-/g, "").trim();
  if (!/^[0-9a-fA-F]{32}$/.test(compact)) return "";
  const hex = compact.toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function call(path, init) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": VERSION,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 300) };
  }

  return { ok: response.ok, status: response.status, data };
}

function richText(text) {
  return [{ type: "text", text: { content: text.slice(0, 1900) } }];
}

function seedPayload(databaseId) {
  return {
    parent: { database_id: databaseId },
    properties: {
      제목: { title: richText(SEED.title) },
      유형: { select: { name: SEED.kind } },
      "지점/대상": { rich_text: richText(SEED.target) },
      "연락처/금액": { rich_text: richText(SEED.contact) },
      상태: { select: { name: SEED.status } },
      발생시각: { date: { start: SEED.occurredAt } },
      "상세메모/원본링크": { rich_text: richText(`${SEED.detail}\n원본: ${SEED.sourceUrl}`) },
      이벤트키: { rich_text: richText(SEED.eventKey) },
    },
  };
}

async function main() {
  if (!TOKEN) {
    console.error("NOTION_TOKEN 이 없습니다. Notion 통합 시크릿을 환경변수로 넣어 주세요.");
    process.exit(2);
  }

  const parentRaw = arg("parent-page") ?? process.env.NOTION_HQ_BOARD_PARENT_PAGE_ID ?? "";
  const parentId = normalizeId(parentRaw);

  if (!parentId) {
    console.error("--parent-page <페이지 id> 가 필요합니다(또는 NOTION_HQ_BOARD_PARENT_PAGE_ID).");
    process.exit(2);
  }

  const databaseBody = {
    parent: { type: "page_id", page_id: parentId },
    icon: { type: "emoji", emoji: "🚨" },
    title: [{ type: "text", text: { content: TITLE } }],
    properties: PROPERTIES,
  };

  if (arg("dry-run")) {
    console.log(JSON.stringify({ endpoint: `${API_BASE}/v1/databases`, body: databaseBody }, null, 2));
    return;
  }

  const created = await call("/v1/databases", { body: databaseBody });

  if (!created.ok) {
    console.error(`데이터베이스 생성 실패 status=${created.status}`, JSON.stringify(created.data).slice(0, 600));
    if (created.status === 403) {
      console.error("→ 그 페이지에 이 통합이 연결되어 있지 않습니다. 페이지 `···` → 연결(Connections)에서 추가하세요.");
    }
    process.exit(1);
  }

  const databaseId = created.data.id;
  console.log(`데이터베이스 생성 완료: ${TITLE}`);
  console.log(`  id  : ${databaseId}`);
  console.log(`  url : ${created.data.url ?? "(응답에 없음)"}`);

  if (arg("seed")) {
    const seeded = await call("/v1/pages", { body: seedPayload(databaseId) });

    if (seeded.ok) {
      console.log(`  예시 1건 등록: ${seeded.data.url ?? "(url 없음)"}`);
    } else {
      console.error(`  예시 등록 실패 status=${seeded.status}`, JSON.stringify(seeded.data).slice(0, 400));
    }
  }

  console.log("\nVercel → luckyspot-shop → Settings → Environment Variables (Production):");
  console.log("  NOTION_TOKEN=ntn_…");
  console.log(`  NOTION_HQ_BOARD_DB_ID=${databaseId}`);
}

main().catch((error) => {
  console.error("예상치 못한 오류:", error instanceof Error ? error.message : error);
  process.exit(1);
});
