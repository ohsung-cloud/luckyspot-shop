#!/usr/bin/env node
/**
 * 저장된 스냅샷만으로 분석·전송 (네트워크 로그인 불필요)
 *
 *   node bin/daily.mjs                                   # --out 의 최신 스냅샷 분석
 *   node bin/daily.mjs --snapshot <file> --push          # 분석 후 ingest-pos 로 전송
 *   node bin/daily.mjs --snapshot <file> --push --base https://luckyspot-shop.vercel.app
 *
 * 수집 자체는 bin/collect-and-push.mjs 가 한다. 이 CLI 는 수집이 끝난 스냅샷을
 * 다시 계산하거나, 실패한 전송만 되돌려 보낼 때 쓴다.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyze, kstDate, renderReport } from "../src/engine.mjs";
import { toIngestPayload } from "../src/payload.mjs";
import { redact } from "../src/stores.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    push: false,
    base: process.env.INGEST_API_URL ?? "https://luckyspot-shop.vercel.app",
    out: process.env.POS_OUT_DIR ?? path.resolve(root, "../../.tmp/pos-collector"),
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--push") args.push = true;
    else if (token === "--snapshot") args.snapshot = path.resolve(argv[++i]);
    else if (token === "--base") args.base = argv[++i];
    else if (token === "--out") args.out = path.resolve(argv[++i]);
    else if (token === "--json") args.json = true;
    else if (token === "--help" || token === "-h") {
      console.log("usage: daily.mjs [--snapshot file] [--out dir] [--push] [--base url] [--json]");
      process.exit(0);
    } else throw new Error(`알 수 없는 옵션: ${token}`);
  }
  return args;
}

async function latestSnapshot(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { recursive: true });
  } catch {
    throw new Error(`스냅샷 폴더를 읽지 못했습니다: ${dir} (--snapshot 으로 파일을 지정하세요)`);
  }
  const files = entries
    .filter((name) => typeof name === "string" && name.endsWith("snapshot.json"))
    .sort();
  if (files.length === 0) throw new Error(`스냅샷이 없습니다: ${dir}`);
  return path.join(dir, files[files.length - 1]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshotPath = args.snapshot ?? (await latestSnapshot(args.out));
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));

  const analysis = analyze(snapshot);
  const report = renderReport(analysis, snapshot);

  const outDir = path.dirname(snapshotPath);
  const stamp = kstDate(snapshot.capturedAt);
  const suffix = snapshot.storeId ? `-${snapshot.storeId}` : "";
  const reportPath = path.join(outDir, `report-${stamp}${suffix}.md`);
  const analysisPath = path.join(outDir, `analysis-${stamp}${suffix}.json`);
  await mkdir(outDir, { recursive: true });
  await writeFile(reportPath, report, "utf8");
  await writeFile(analysisPath, JSON.stringify(analysis, null, 2), "utf8");

  if (!args.json) console.log(report);
  console.log(`\n— 저장: ${reportPath}, ${analysisPath}`);

  if (!args.push) return;

  const url = `${args.base.replace(/\/+$/, "")}/api/auto-order/ingest-pos`;
  const headers = { "content-type": "application/json" };
  if (process.env.INGEST_API_SECRET) headers["x-ingest-secret"] = process.env.INGEST_API_SECRET;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(toIngestPayload(snapshot)),
    signal: AbortSignal.timeout(45000),
  });
  const text = await response.text();
  console.log(redact(`\n— 전송 ${url} → HTTP ${response.status}`));
  console.log(redact(text.slice(0, 1200)));
  if (!response.ok) process.exitCode = 2;
}

main().catch((error) => {
  console.error(redact(String(error?.message ?? error)));
  process.exitCode = 1;
});
