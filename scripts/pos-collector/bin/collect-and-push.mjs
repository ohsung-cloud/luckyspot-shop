#!/usr/bin/env node
/**
 * 로얄선즈 · 에스칼프린트 자동 수집 → 분석 → 발주 시스템 전송
 *
 *   node scripts/pos-collector/bin/collect-and-push.mjs                       # 전 지점 실수집·전송
 *   node scripts/pos-collector/bin/collect-and-push.mjs --dry-run             # 수집·분석만(전송 없음)
 *   node scripts/pos-collector/bin/collect-and-push.mjs --store STORE_GNM     # 한 지점만
 *   node scripts/pos-collector/bin/collect-and-push.mjs --store all --portals escalprint
 *   node scripts/pos-collector/bin/collect-and-push.mjs --mock --dra-run      # 목(mock) 포털로 자체 검증
 *
 * 필요한 환경변수(지점별)
 *   LOYALSUNS_GNM_ID / LOYALSUNS_GNM_PW / ESCAL_GNM_ID / ESCAL_GNM_PW
 *   LOYALSUNS_HYJ_ID / LOYALSUNS_HYJ_PW / ESCAL_HYJ_ID / ESCAL_HYJ_PW
 *   INGEST_API_URL(선택, 기본 https://luckyspot-shop.vercel.app)
 *   INGEST_API_SECRET(선택 — 설정하면 x-ingest-secret 헤더로 보낸다)
 *
 * 출력은 **상태만** 남긴다(금액·자격증명 제외). 이 저장소는 공개이며 Actions 로그도 공개된다.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyze, renderReport } from "../src/engine.mjs";
import { collectStore } from "../src/browser/collect.mjs";
import { launchBrowser } from "../src/browser/session.mjs";
import { buildSnapshot } from "../src/merge.mjs";
import { summarizeSnapshot, toIngestPayload } from "../src/payload.mjs";
import { credentialsFor, missingCredentialNames, redact, resolveStores } from "../src/stores.mjs";
import { renderSummary } from "../src/summary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    store: "all",
    portals: ["loyalsuns", "escalprint"],
    out: process.env.POS_OUT_DIR ?? path.resolve(root, "../../.tmp/pos-collector"),
    dryRun: false,
    mock: false,
    headed: false,
    base: process.env.INGEST_API_URL ?? "https://luckyspot-shop.vercel.app",
    summaryFile: process.env.POS_SUMMARY_FILE ?? null,
    printReport: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--store") args.store = argv[++i];
    else if (token === "--portals") args.portals = String(argv[++i] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    else if (token === "--out") args.out = path.resolve(argv[++i]);
    else if (token === "--base") args.base = argv[++i];
    else if (token === "--dry-run" || token === "--dra-run") args.dryRun = true;
    else if (token === "--mock") {
      args.mock = true;
      args.dryRun = args.dryRun || argv.includes("--dry-run") || argv.includes("--dra-run");
    } else if (token === "--headed") args.headed = true;
    else if (token === "--summary-file") args.summaryFile = path.resolve(argv[++i]);
    else if (token === "--print-report") args.printReport = true;
    else if (token === "--help" || token === "-h") {
      console.log(
        "usage: collect-and-push.mjs [--store all|STORE_GNM|STORE_HYJ] [--portals loyalsuns,escalprint] [--dry-run] [--mock] [--out dir] [--base url] [--headed] [--summary-file path]",
      );
      process.exit(0);
    } else {
      throw new Error(`알 수 없는 옵션: ${token}`);
    }
  }

  return args;
}

const kstStamp = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date())
    .replace(" ", "T");

const clock = () =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

function log(message) {
  console.log(redact(`[${clock()}] ${message}`));
}

async function pushToIngest(payload, base, secret) {
  const url = `${base.replace(/\/+$/, "")}/api/auto-order/ingest-pos`;
  const headers = { "content-type": "application/json" };
  if (secret) headers["x-ingest-secret"] = secret;

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45000),
      });
      const text = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      return {
        ok: response.ok,
        status: response.status,
        message: typeof parsed?.message === "string" ? parsed.message.slice(0, 160) : null,
        ingested: typeof parsed?.ingested === "number" ? parsed.ingested : null,
        attempt,
      };
    } catch (error) {
      lastError = error;
      if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  return { ok: false, status: 0, message: `전송 실패: ${String(lastError?.message ?? lastError).slice(0, 120)}`, ingested: null, attempt: 2 };
}

async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const stores = resolveStores(args.store);
  const secret = process.env.INGEST_API_SECRET ?? null;
  const runStamp = kstStamp();
  const outRoot = path.join(args.out, runStamp);

  let mockServer = null;
  let baseUrls = {};
  if (args.mock) {
    const { startMockPortals } = await import("../src/mock-server.mjs");
    mockServer = await startMockPortals();
    baseUrls = mockServer.baseUrls;
    log(`mock 포털 기동: ${baseUrls.escalprint} · ${baseUrls.loyalsuns}`);
  }

  log(`수집 시작 — 대상 ${stores.map((store) => store.storeCode).join(", ")} · 포털 ${args.portals.join(", ")}${args.dryRun ? " · dry-run" : ""}`);

  const report = {
    startedAt: new Date(startedAt).toISOString(),
    finishedAtKst: "",
    mode: args.dryRun ? "dry-run" : "live",
    mock: args.mock,
    nodeVersion: process.version,
    playwrightVersion: null,
    durationSec: 0,
    stores: [],
    warnings: [],
  };

  const browser = await launchBrowser({ headless: !args.headed });
  try {
    report.playwrightVersion = browser.version();

    for (const store of stores) {
      // mock 모드는 목 포털에만 붙으므로 더미 자격증명을 쓴다(실제 포털에는 쓰이지 않는다).
      const credentials = args.mock
        ? {
            loyalsuns: { id: "mock-user", password: "mock-pass" },
            escalprint: { id: "mock-user", password: "mock-pass" },
          }
        : credentialsFor(store);
      const missing = args.mock ? [] : missingCredentialNames(store);
      if (missing.length > 0) {
        report.warnings.push(`${store.storeCode}: 환경변수 미설정 — ${missing.join(", ")}`);
        log(`${store.storeCode} — 자격증명 미설정(${missing.join(", ")}) — 건너뜀`);
      }

      const result = await collectStore(browser, store, {
        credentials,
        baseUrls,
        portals: args.portals,
        onStep: (target, key, ok) => log(`${target.storeCode} · ${key} ${ok ? "확인" : "실패"}`),
      });

      const snapshot = buildSnapshot({
        fragments: result.fragments,
        store,
        capturedAt: new Date().toISOString(),
        captureMode: args.mock ? "fixture" : "browser-automation",
      });
      const metrics = summarizeSnapshot(snapshot);

      const storeEntry = {
        storeCode: store.storeCode,
        storeLabel: store.label,
        portals: result.portals,
        routes: result.routes ?? {},
        metrics,
        ingest: null,
      };

      const storeDir = path.join(outRoot, store.storeCode);
      await mkdir(storeDir, { recursive: true });
      await writeFile(path.join(storeDir, "fragments.json"), JSON.stringify(result.fragments, null, 2), "utf8");
      await writeFile(path.join(storeDir, "snapshot.json"), JSON.stringify(snapshot, null, 2), "utf8");

      const portalOk = Boolean(result.portals.loyalsuns?.ok || result.portals.escalprint?.ok);
      if (portalOk) {
        const analysis = analyze(snapshot);
        await writeFile(path.join(storeDir, "analysis.json"), JSON.stringify(analysis, null, 2), "utf8");
        const human = renderReport(analysis, snapshot);
        await writeFile(path.join(storeDir, "report.md"), human, "utf8");
        if (args.printReport) console.log(redact(human));

        const payload = toIngestPayload(snapshot);
        await writeFile(path.join(storeDir, "payload.json"), JSON.stringify(payload, null, 2), "utf8");

        if (!args.dryRun) {
          storeEntry.ingest = await pushToIngest(payload, args.base, secret);
          log(
            `${store.storeCode} — 전송 ${storeEntry.ingest.ok ? "성공" : "실패"} (HTTP ${storeEntry.ingest.status}, 시도 ${storeEntry.ingest.attempt})`,
          );
        } else {
          log(`${store.storeCode} — 분석 완료(전송 생략 · dry-run)`);
        }
      } else {
        log(`${store.storeCode} — 수집된 포털이 없어 분석·전송을 건너뜀`);
      }

      report.stores.push(storeEntry);
    }
  } finally {
    await browser.close().catch(() => {});
    if (mockServer) await mockServer.close().catch(() => {});
  }

  report.durationSec = Math.round((Date.now() - startedAt) / 100) / 10;
  report.finishedAtKst = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const summary = renderSummary(report);
  await mkdir(outRoot, { recursive: true });
  await writeFile(path.join(outRoot, "summary.md"), summary, "utf8");
  if (args.summaryFile) {
    await mkdir(path.dirname(args.summaryFile), { recursive: true });
    await writeFile(args.summaryFile, summary, "utf8");
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, "utf8").catch(() => {});
  }
  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import("node:fs/promises");
    const failed = report.stores.filter((store) => !store.portals.loyalsuns?.ok && !store.portals.escalprint?.ok).length;
    await appendFile(process.env.GITHUB_OUTPUT, `stores_collected=${report.stores.length - failed}\nstores_failed=${failed}\n`).catch(() => {});
  }

  console.log(redact(summary));

  const anyCollected = report.stores.some((store) => store.portals.loyalsuns?.ok || store.portals.escalprint?.ok);
  const pushFailed = report.stores.some((store) => store.ingest && !store.ingest.ok);

  if (!anyCollected) {
    console.error(redact("수집된 포털이 없습니다 — 자격증명·포털 상태를 확인하세요."));
    process.exitCode = 1;
  } else if (pushFailed && !args.dryRun) {
    console.error(redact("일부 지점 전송이 실패했습니다 — 위 요약의 HTTP 상태를 확인하세요."));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(redact(`수집 실행 실패: ${String(error?.message ?? error)}`));
  process.exitCode = 1;
});
