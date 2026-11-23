/**
 * 전송 본문 검증 — ingest-pos 계약 필드만 담는지, 매출 값이 그대로인지.
 * 서버(Next 앱)는 `snapshot.escalprint`·`snapshot.loyalsuns` 봉투를 읽는다.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { summarizeSnapshot, toIngestPayload } from "../src/payload.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(
  await readFile(path.join(here, "../fixtures/snapshots/2026-11-23T1210+0900.json"), "utf8"),
);

test("전송 본문: 지점·봉투 구조가 ingest-pos 계약과 같다", () => {
  const payload = toIngestPayload(snapshot);

  assert.equal(payload.storeCode, "STORE_GNM");
  assert.equal(payload.storeId, "gangnam");
  assert.equal(payload.storeLabel, "럭키스팟 강남구청역점");
  assert.ok(payload.snapshot.capturedAt);

  const escal = payload.snapshot.escalprint;
  assert.equal(escal.toner.k, 46);
  assert.equal(escal.paper.tray2, 70);
  assert.equal(escal.device.cumulativePrintCount, 25390);
  assert.equal(typeof escal.revenue.month, "string");
  assert.equal(typeof escal.revenue.total, "number");

  const loyal = payload.snapshot.loyalsuns;
  assert.equal(loyal.revenue.today, 14600);
  assert.equal(loyal.revenue.yesterday, 57800);
  assert.equal(loyal.revenue.month, 1059700);
  assert.ok(Array.isArray(loyal.bestsellers));
  assert.ok(loyal.orders.todayCount > 0);
});

test("전송 본문: 서버가 모르는 필드(지난달·재고 원본)는 싣지 않는다", () => {
  const payload = toIngestPayload(snapshot);
  const serialized = JSON.stringify(payload);

  assert.ok(!serialized.includes("lastMonth"));
  assert.ok(!serialized.includes("inventory"));
  assert.ok(!serialized.includes("recipes"));
  assert.deepEqual(Object.keys(payload.snapshot.loyalsuns.revenue).sort(), ["month", "today", "yesterday"]);
});

test("요약: 금액 없이 건수만 남긴다", () => {
  const metrics = summarizeSnapshot(snapshot);
  const serialized = JSON.stringify(metrics);

  assert.equal(metrics.storeCode, "STORE_GNM");
  assert.equal(metrics.escalprint.tonerRead, 4);
  assert.equal(metrics.escalprint.paperRead, 2);
  assert.ok(metrics.loyalsuns.inventoryItems > 0);
  assert.ok(!serialized.includes("14600"));
  assert.ok(!serialized.includes("1059700"));
  assert.ok(!serialized.includes("500200"));
});
