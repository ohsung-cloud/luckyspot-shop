#!/usr/bin/env node
/**
 * 조각(raw) 폴더 → 표준 스냅샷 파일
 *
 *   node bin/merge.mjs --dir fixtures/raw/2026-11-23 --out .tmp/snapshot.json --store STORE_GNM
 *
 * 자동 수집은 이 과정을 메모리에서 하지만, 손으로 모은 조각이나 지난 실행 산출물을
 * 다시 병합해 볼 때 쓴다.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { mergeFromDir } from "../src/merge.mjs";
import { STORES } from "../src/stores.mjs";

function parseArgs(argv) {
  const args = { store: "STORE_GNM" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dir") args.dir = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--store") args.store = argv[++i];
    else if (argv[i] === "--time") args.time = argv[++i];
    else throw new Error(`알 수 없는 옵션: ${argv[i]}`);
  }
  if (!args.dir || !args.out) throw new Error("--dir 과 --out 이 필요합니다");
  return args;
}

const args = parseArgs(process.argv.slice(2));
const store = STORES[args.store?.toUpperCase()];
if (!store) throw new Error(`알 수 없는 지점: ${args.store}`);

const capturedAt = args.time
  ? new Date(`${new Date().toISOString().slice(0, 10)}T${args.time.slice(0, 2)}:${args.time.slice(2, 4)}:00+09:00`).toISOString()
  : new Date().toISOString();

const snapshot = await mergeFromDir(path.resolve(args.dir), { store, capturedAt });
await mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
await writeFile(path.resolve(args.out), JSON.stringify(snapshot, null, 2), "utf8");

console.log(`병합 완료: ${args.out} (${store.storeCode}, 빠진 항목 ${snapshot.missing.length}개)`);
if (snapshot.loyalsuns.inventorySource === "none") {
  console.warn("⚠️ 재고 값이 없습니다 — 재고 %가 캔버스면 JSON 대체 경로가 필요합니다.");
}
