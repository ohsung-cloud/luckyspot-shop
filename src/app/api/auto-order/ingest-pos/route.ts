import { NextResponse } from "next/server";

import {
  detectSnapshotEnvelope,
  normalizeSnapshotEnvelope,
  type NormalizedSnapshot,
} from "@/features/auto-order/adapters";
import { buildState } from "@/features/auto-order/service";
import {
  loadSales,
  loadTelemetryHistory,
  saveBeverages,
  saveMachineStatus,
  saveRevenue,
  saveSales,
  saveTelemetry,
} from "@/features/auto-order/store";
import { sheetsFromCounters, stockOverridesFromTelemetry } from "@/features/auto-order/telemetry";
import type { PosDailySales, SnapshotIngestSummary } from "@/features/auto-order/types";
import { jsonError, readJsonObject, takeRateLimit } from "@/features/http/guard";

/**
 * POST /api/auto-order/ingest-pos
 *
 * POS·프린트 일일 마감을 받아 교차 예측을 실행하고 발주 제안을 돌려준다.
 * 세 가지 입구를 모두 받는다(우선순위: snapshot > rows > 파라미터 시뮬레이션).
 *
 * 1) **포털 스냅샷** (실데이터 수집기용 — 🔬 수집기가 이 형태로 보낸다)
 *    {
 *      storeCode, storeLabel?,
 *      snapshot: {
 *        capturedAt?: ISO,
 *        escalprint?: { device:{model,serial,cumulativePrintCount}, toner:{k,c,m,y}, paper:{tray1,tray2},
 *                       revenue:{month:"2026-11", total, refund}, todaySheets?, colorSheets? },
 *        loyalsuns?: { machine:{online, alerts[]}, revenue:{today,yesterday,month},
 *                      orders:{todayCount, refundCount}, bestsellers:[{name,quantity,amount}] }
 *      }
 *    }
 *    → 장비 스냅샷은 device_telemetry_snapshots(하루 3회), 베스트셀러는 beverage_sales_snapshots,
 *      매출은 portal_revenue_snapshots에 쌓고, 그날의 pos_daily_sales 행을 갱신한다.
 *    → 토너 K/C/M/Y %와 용지 트레이 %는 **현재고로 환산해 예측에 직접 반영**한다.
 *    → 출력 매수는 누적 카운터 두 스냅샷의 차이로 하루 환산한다.
 *
 * 2) **일일 마감 rows**: 7~60일치 { salesDate, drinksSold, printSheets, colorSheets, cafeRevenue, printRevenue }
 *
 * 3) **시뮬레이션**: { scenario, drinksPerDay, sheetsPerDay, printSurgePct, cafeDropPct }
 *
 * 어느 경우든 응답에는 SKU별 예측 근거·이상 감지·사업자 분기 미리보기와,
 * 스냅샷 입력이면 `snapshot` 요약(파생값·경고)이 함께 담긴다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_CODE = /^[A-Za-z0-9_-]{2,32}$/;

/**
 * 수집기 전용 공유 비밀(선택).
 * `INGEST_API_SECRET` 이 설정된 배포에서만 헤더를 요구한다 — 설정하지 않으면 지금과 똑같이 동작한다.
 * (GitHub Actions 는 같은 값을 Secret 으로 받아 `x-ingest-secret` 헤더로 보낸다.)
 */
function ingestAuthorized(request: Request) {
  const expected = process.env.INGEST_API_SECRET;
  if (!expected) return true;

  const header = request.headers.get("x-ingest-secret") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const provided = header || (authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "");

  if (!provided || provided.length !== expected.length) return false;

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

function number(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function sanitizeRows(input: unknown, fallbackStoreCode: string): PosDailySales[] {
  if (!Array.isArray(input)) return [];

  const rows: PosDailySales[] = [];

  for (const item of input.slice(0, 60)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const date = typeof record.salesDate === "string" ? record.salesDate.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const storeCode =
      typeof record.storeCode === "string" && STORE_CODE.test(record.storeCode.trim())
        ? record.storeCode.trim().toUpperCase()
        : fallbackStoreCode;

    rows.push({
      storeCode,
      salesDate: date,
      drinksSold: Math.round(number(record.drinksSold, 0, 5000, 0)),
      printSheets: Math.round(number(record.printSheets, 0, 20000, 0)),
      colorSheets: Math.round(number(record.colorSheets, 0, 20000, 0)),
      cafeRevenue: Math.round(number(record.cafeRevenue, 0, 50_000_000, 0)),
      printRevenue: Math.round(number(record.printRevenue, 0, 50_000_000, 0)),
      cafeReported: true,
      printReported: true,
    });
  }

  return rows;
}

const NUMERIC_KEYS = ["cafeRevenue", "drinksSold", "beanGrams", "printRevenue", "printSheets", "colorSheets"] as const;

/**
 * 그날 행이 이미 있으면 값만 덮어쓴다.
 * 한쪽 포털만 들어온 날은 없는 쪽을 0으로 만들지 않고 `cafeReported/printReported=false`로 남긴다.
 * (엔진이 그날을 그 도메인의 시계열에서 제외한다.)
 */
async function mergeDailyRow(
  storeCode: string,
  salesDate: string,
  patch: Partial<Pick<PosDailySales, (typeof NUMERIC_KEYS)[number]>>,
  reported: { cafe: boolean; print: boolean },
): Promise<PosDailySales> {
  const loaded = await loadSales(storeCode);
  const existing = loaded?.rows.find((row) => row.salesDate === salesDate);

  const merged: PosDailySales =
    existing ?? {
      storeCode,
      salesDate,
      cafeRevenue: 0,
      drinksSold: 0,
      printRevenue: 0,
      printSheets: 0,
      colorSheets: 0,
      cafeReported: false,
      printReported: false,
    };

  for (const key of NUMERIC_KEYS) {
    const value = patch[key];
    if (typeof value === "number" && Number.isFinite(value)) merged[key] = value;
  }

  if (reported.cafe) merged.cafeReported = true;
  if (reported.print) merged.printReported = true;

  return merged;
}

export async function POST(request: Request) {
  const limited = takeRateLimit(request, "auto-order-ingest", 60, 60_000);

  if (!limited.ok) {
    return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
      retryAfter: limited.retryAfter,
    });
  }

  if (!ingestAuthorized(request)) {
    return jsonError("수집 인증이 필요합니다.", 401);
  }

  const parsed = await readJsonObject(request, 256 * 1024);
  if (!parsed.ok) return parsed.response;

  const data = parsed.data;

  const requestedCode =
    typeof data.storeCode === "string" && STORE_CODE.test(data.storeCode.trim())
      ? data.storeCode.trim().toUpperCase()
      : null;

  const storeCode = requestedCode ?? "STORE_YDP";
  const storeLabel =
    typeof data.storeLabel === "string" && data.storeLabel.trim().length > 0
      ? data.storeLabel.trim().slice(0, 40)
      : undefined;

  /* ------------------------------------------------------------------ */
  /* 1) 포털 스냅샷                                                      */
  /* ------------------------------------------------------------------ */
  const envelope = detectSnapshotEnvelope(data);

  if (envelope) {
    let snapshots: NormalizedSnapshot[];

    try {
      snapshots = normalizeSnapshotEnvelope(envelope, { storeCode });
    } catch {
      return jsonError("포털 스냅샷 형식을 읽지 못했습니다. snapshot 필드 구조를 확인해 주세요.", 400);
    }

    if (snapshots.length === 0) {
      return jsonError("snapshot 안에 escalprint 또는 loyalsuns 값이 필요합니다.", 400);
    }

    const notes: string[] = [];
    const warnings: string[] = [];
    const derived: SnapshotIngestSummary["derived"] = {
      drinksSold: null,
      printSheets: null,
      colorSheets: null,
      stockOverrides: {},
    };

    const sourceLabel =
      snapshots.length > 1 ? "both" : (snapshots[0].source as "escalprint" | "loyalsuns");

    for (const snapshot of snapshots) {
      notes.push(...snapshot.notes);
      warnings.push(...snapshot.warnings);

      if (snapshot.telemetry) {
        await saveTelemetry(snapshot.telemetry);
      }

      if (snapshot.beverages.length > 0) {
        await saveBeverages({
          storeCode,
          capturedAt: snapshot.capturedAt,
          salesDate: snapshot.salesDate,
          beverages: snapshot.beverages,
        });
        derived.drinksSold = snapshot.patch.drinksSold ?? derived.drinksSold;
      }

      for (const revenue of snapshot.revenues) {
        await saveRevenue(revenue, storeCode, snapshot.capturedAt);
      }

      if (snapshot.machine) {
        await saveMachineStatus({
          storeCode,
          capturedAt: snapshot.capturedAt,
          online: snapshot.machine.online,
          alerts: snapshot.machine.alerts,
        });
      }

      // 출력 매수가 스냅샷에 없으면 누적 카운터 두 점의 차이로 계산한다.
      if (snapshot.source === "escalprint" && snapshot.patch.printSheets === undefined) {
        const history = await loadTelemetryHistory(storeCode, 12);
        const { sheets, note } = sheetsFromCounters(history);
        notes.push(note);

        if (sheets !== null) {
          snapshot.patch.printSheets = sheets;
          snapshot.patch.colorSheets =
            snapshot.patch.colorSheets ?? Math.round(sheets * 0.18);
          if (snapshot.patch.colorSheets === Math.round(sheets * 0.18)) {
            warnings.push("컬러 출력 비중을 18%로 가정했습니다(컬러 카운터 확인 필요).");
          }
        }
      }

      const reported = {
        cafe:
          snapshot.patch.drinksSold !== undefined ||
          snapshot.patch.cafeRevenue !== undefined ||
          snapshot.patch.beanGrams !== undefined,
        print:
          snapshot.patch.printSheets !== undefined ||
          snapshot.patch.printRevenue !== undefined ||
          snapshot.patch.colorSheets !== undefined,
      };

      const row = await mergeDailyRow(storeCode, snapshot.salesDate, snapshot.patch, reported);
      await saveSales([row]);

      derived.drinksSold = row.drinksSold || derived.drinksSold;
      derived.printSheets = row.printSheets || derived.printSheets;
      derived.colorSheets = row.colorSheets || derived.colorSheets;
    }

    const telemetry = await loadTelemetryHistory(storeCode, 12);
    derived.stockOverrides = stockOverridesFromTelemetry(
      telemetry.length > 0 ? telemetry[telemetry.length - 1] : null,
    );

    const built = await buildState({ storeCode, storeLabel });

    const snapshotSummary: SnapshotIngestSummary = {
      source: sourceLabel as SnapshotIngestSummary["source"],
      capturedAt: snapshots[snapshots.length - 1].capturedAt,
      salesDate: snapshots[snapshots.length - 1].salesDate,
      derived,
      notes: notes.slice(0, 12),
      warnings: [...new Set(warnings)].slice(0, 12),
    };

    return NextResponse.json(
      {
        ...built.state,
        ok: true,
        ingested: snapshots.length,
        message:
          sourceLabel === "both"
            ? "에스칼프린트·로얄선즈 실측을 함께 반영했습니다."
            : sourceLabel === "escalprint"
              ? "에스칼프린트 장비 실측을 반영했습니다."
              : "로얄선즈 판매 실측을 반영했습니다.",
        snapshot: snapshotSummary,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  /* ------------------------------------------------------------------ */
  /* 2) 일일 마감 rows / 3) 시뮬레이션                                    */
  /* ------------------------------------------------------------------ */
  const rows = sanitizeRows(data.rows, storeCode);

  if (rows.length > 0 && rows.length < 7) {
    return jsonError("교차 예측에는 최소 7일치 마감 데이터가 필요합니다.", 400, {
      received: rows.length,
    });
  }

  if (rows.length === 0) {
    const { generateDemoSeries, resolveDemoStore } = await import("@/features/auto-order/demo-pos");
    const demoStore = resolveDemoStore(storeCode);
    const scenario =
      data.scenario === "normal" || data.scenario === "cafe_drop" || data.scenario === "print_surge"
        ? data.scenario
        : "print_surge";

    const drinksPerDay =
      typeof data.drinksPerDay === "number" && Number.isFinite(data.drinksPerDay)
        ? number(data.drinksPerDay, 1, 3000, demoStore.cafeBase)
        : undefined;
    const sheetsPerDay =
      typeof data.sheetsPerDay === "number" && Number.isFinite(data.sheetsPerDay)
        ? number(data.sheetsPerDay, 1, 8000, demoStore.printBase)
        : undefined;
    const printSurge =
      typeof data.printSurgePct === "number" && Number.isFinite(data.printSurgePct)
        ? number(data.printSurgePct, -100, 300, 35) / 100
        : undefined;
    const cafeDrop =
      typeof data.cafeDropPct === "number" && Number.isFinite(data.cafeDropPct)
        ? number(data.cafeDropPct, -100, 100, -65)
        : undefined;

    const generated = generateDemoSeries({
      storeCode,
      storeLabel: storeLabel ?? demoStore.label,
      scenario,
      days: 21,
      cafeBase: drinksPerDay,
      printBase: sheetsPerDay,
      printSurge,
      cafeDrop: cafeDrop !== undefined ? Math.max(0, 1 + cafeDrop / 100) : undefined,
    });

    await saveSales(generated);
  } else {
    await saveSales(rows);
  }

  const built = await buildState({ storeCode, storeLabel });

  return NextResponse.json(
    {
      ...built.state,
      ok: true,
      ingested: rows.length > 0 ? rows.length : 21,
      message:
        built.state.dataSource === "demo"
          ? "데모 실측 폴백으로 예측했습니다(Supabase SQL 미적용)."
          : "마감 데이터를 반영해 예측했습니다.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
