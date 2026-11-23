import { NextResponse } from "next/server";

import {
  isDemoScenario,
  type DemoScenario,
  generateDemoSeries,
  resolveDemoStore,
} from "@/features/auto-order/demo-pos";
import { buildState } from "@/features/auto-order/service";
import { saveSales } from "@/features/auto-order/store";
import type { PosDailySales } from "@/features/auto-order/types";
import { jsonError, readJsonObject, takeRateLimit } from "@/features/http/guard";

/**
 * POST /api/auto-order/ingest-pos
 *
 * POS·프린트 일일 마감 데이터를 받아 교차 예측을 실행하고 발주 제안을 돌려준다.
 *
 * 입력 3가지 방식
 *  1) rows: 7~60일치 마감 데이터를 직접 준다(실서비스 연동·본사 실증용).
 *  2) scenario/drinksPerDay/sheetsPerDay: 테스트용 POS 시뮬레이션. 같은 지점 기준선으로
 *     21일치를 만들어 넣는다.
 *  3) 아무것도 없으면 데모 지점의 기본 시나리오를 쓴다.
 *
 * 어느 경우든 응답에는 예측 근거(SKU별 기본 소진·교차 계수·잔여일)와
 * 사업자별 분기 미리보기가 함께 담긴다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_CODE = /^[A-Za-z0-9_-]{2,32}$/;

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
    });
  }

  return rows;
}

export async function POST(request: Request) {
  const limited = takeRateLimit(request, "auto-order-ingest", 30, 60_000);

  if (!limited.ok) {
    return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
      retryAfter: limited.retryAfter,
    });
  }

  const parsed = await readJsonObject(request, 96 * 1024);
  if (!parsed.ok) return parsed.response;

  const data = parsed.data;

  const requestedCode =
    typeof data.storeCode === "string" && STORE_CODE.test(data.storeCode.trim())
      ? data.storeCode.trim().toUpperCase()
      : null;

  const demoStore = resolveDemoStore(requestedCode ?? undefined);
  const storeCode = requestedCode ?? demoStore.code;
  const storeLabel =
    typeof data.storeLabel === "string" && data.storeLabel.trim().length > 0
      ? data.storeLabel.trim().slice(0, 40)
      : demoStore.label;

  const scenario: DemoScenario = isDemoScenario(data.scenario)
    ? data.scenario
    : "print_surge";

  const rows = sanitizeRows(data.rows, storeCode);

  if (rows.length > 0 && rows.length < 7) {
    return jsonError("교차 예측에는 최소 7일치 마감 데이터가 필요합니다.", 400, {
      received: rows.length,
    });
  }

  if (rows.length === 0) {
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
      storeLabel,
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

  const built = await buildState({ storeCode, storeLabel, scenario });

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
