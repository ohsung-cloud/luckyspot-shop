/**
 * 자체 검증(e2e) — 목(mock) 포털에 실제 Playwright 로 로그인·이동·추출·병합·분석·payload 생성까지
 * 한 번에 돌린다. 네트워크(실제 포털)와 GitHub Secrets 없이 전체 경로를 확인하는 테스트다.
 *
 *   node --test tests/
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));

async function playwrightInstalled() {
  try {
    await import("playwright");
    return true;
  } catch {
    return false;
  }
}

test("목 포털 e2e: 로그인 → 추출 → 병합 → 분석 → 전송본 생성", { timeout: 180000 }, async (t) => {
  if (!(await playwrightInstalled())) {
    t.skip("playwright 미설치 — `npm install` 후 다시 실행하세요 (scripts/pos-collector)");
    return;
  }

  const out = await mkdtemp(path.join(tmpdir(), "pos-collector-e2e-"));
  const script = path.join(here, "../bin/collect-and-push.mjs");

  const { stdout } = await run(process.execPath, [script, "--mock", "--dry-run", "--store", "STORE_GNM", "--out", out], {
    cwd: path.join(here, ".."),
    env: { ...process.env, GITHUB_STEP_SUMMARY: "" },
    maxBuffer: 8 * 1024 * 1024,
  });

  assert.match(stdout, /수집 시작/);
  assert.match(stdout, /분석 완료/);

  const { readdir } = await import("node:fs/promises");
  const runDirs = await readdir(out);
  assert.equal(runDirs.length, 1);

  const storeDir = path.join(out, runDirs[0], "STORE_GNM");
  const snapshot = JSON.parse(await readFile(path.join(storeDir, "snapshot.json"), "utf8"));
  const payload = JSON.parse(await readFile(path.join(storeDir, "payload.json"), "utf8"));
  const summary = await readFile(path.join(out, runDirs[0], "summary.md"), "utf8");

  /* 에스칼프린트 */
  assert.equal(snapshot.escalprint.device.model, "TASKalfa MZ3501ci");
  assert.equal(snapshot.escalprint.device.serial, "1P26300591");
  assert.equal(snapshot.escalprint.device.cumulativePrintCount, 25394);
  assert.deepEqual(snapshot.escalprint.toner, { k: 46, c: 27, m: 38, y: 40 });
  assert.deepEqual(snapshot.escalprint.paper, { tray1: 30, tray2: 70 });
  assert.equal(snapshot.escalprint.revenue.month, "2026-10");
  assert.equal(snapshot.escalprint.revenue.total, 500200);
  assert.equal(snapshot.escalprint.revenue.refund, 250);
  assert.equal(snapshot.escalprint.spend.total, 125400);
  assert.equal(snapshot.escalprint.shipping.freeThreshold, 200000);
  const a4 = snapshot.escalprint.catalog.find((item) => item.name.includes("A4"));
  assert.ok(a4, "A4 카탈로그 항목을 찾지 못했습니다");
  assert.equal(a4.price, 22800);
  assert.equal(a4.minQty, 5);
  assert.equal(a4.unit, "BOX");
  assert.ok(snapshot.escalprint.calendar.some((event) => event.date === "2026-11-21" && event.end === "2026-11-25" && event.demandWeight === 1.35));
  assert.ok(snapshot.escalprint.calendar.some((event) => event.date === "2026-12-14"), "다음달 일정까지 읽어야 합니다");

  /* 로얄선즈 */
  assert.equal(snapshot.loyalsuns.revenue.today, 14600);
  assert.equal(snapshot.loyalsuns.revenue.yesterday, 57800);
  assert.equal(snapshot.loyalsuns.revenue.month, 1059700);
  assert.equal(snapshot.loyalsuns.revenue.lastMonth, 1214300);
  assert.equal(snapshot.loyalsuns.orders.totalCount, 6007);
  assert.equal(snapshot.loyalsuns.orders.todayCount, 3);
  assert.equal(snapshot.loyalsuns.bestsellers.length, 4);
  assert.equal(snapshot.loyalsuns.inventorySource, "api", "캔버스 재고는 같은 화면의 JSON 으로 채워야 합니다");
  assert.equal(snapshot.loyalsuns.inventory.length, 7);
  assert.equal(snapshot.loyalsuns.shortages.length, 2);
  assert.ok(snapshot.loyalsuns.lowStock.some((item) => item.material === "투명컵"));
  assert.equal(snapshot.loyalsuns.recipes.length, 2);
  assert.equal(snapshot.loyalsuns.consumptionLog.length, 3);
  assert.equal(snapshot.loyalsuns.consumptionTotal, 12.8);
  assert.equal(snapshot.loyalsuns.refillLog.length, 1);

  /* 분석·전송본 */
  assert.equal(payload.storeCode, "STORE_GNM");
  assert.equal(payload.snapshot.loyalsuns.revenue.today, 14600);
  assert.equal(payload.snapshot.escalprint.toner.k, 46);

  const analysis = JSON.parse(await readFile(path.join(storeDir, "analysis.json"), "utf8"));
  assert.ok(Array.isArray(analysis.orders.proposals));

  /* 요약에는 금액이 없어야 한다(공개 저장소 Actions 로그) */
  assert.match(summary, /POS 자동 수집 결과/);
  for (const money of ["14,600", "14600", "500,200", "500200", "1,059,700"]) {
    assert.ok(!summary.includes(money), `요약에 금액(${money})이 남았습니다`);
  }
});
