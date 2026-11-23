import { NextResponse } from "next/server";

import { daysBetween, stapleCapacity, nextCalibration } from "@/features/auto-order/calibration";
import { buildState } from "@/features/auto-order/service";
import { findStoreRecord, logCalibration, saveCalibration } from "@/features/stores/registry";
import { jsonError, readJsonObject, takeRateLimit } from "@/features/http/guard";

/**
 * POST /api/stores/[code]/calibrate
 *
 * 점주가 원두·토너·용지를 실제로 갈았을 때 부르는 **원터치 교체완료**.
 *
 *   1) 그 품목 잔량을 100%(가득)로 되돌린다 — 교체 직후 24시간은 예측이 '가득'으로 계산한다.
 *   2) 지난 교체일 → 오늘의 실제 일수와, 그 사이 예측 소진 속도를 비교해
 *      지점별 보정 계수(0.85x~1.25x)를 다시 학습한다.
 *   3) 학습 결과는 지점 레코드(calibrations)에 남아 다음 예측부터 바로 적용된다.
 *
 * body: { sku: "bean-10kg" | "toner-black" | "toner-color" | "a4-paper" }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 교체완료를 받는 품목 — 3종(원두·토너·용지)과 컬러 토너. */
const CALIBRATABLE = new Set(["bean-10kg", "toner-black", "toner-color", "a4-paper"]);

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const limit = takeRateLimit(request, "store-calibrate", 30, 10 * 60 * 1000);
  if (!limit.ok) {
    return jsonError("교체완료 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
      retryAfter: limit.retryAfter,
    });
  }

  const { code } = await context.params;
  const record = await findStoreRecord(code);
  if (!record) {
    return jsonError("이 지점은 아직 매장 등록 전입니다. 본사(/admin/stores)에서 등록하면 교체 기록이 저장됩니다.", 404);
  }

  const parsed = await readJsonObject(request, 2 * 1024);
  if (!parsed.ok) return parsed.response;

  const sku = typeof parsed.data.sku === "string" ? parsed.data.sku.trim() : "";
  if (!CALIBRATABLE.has(sku)) {
    return jsonError("원두·토너·용지 중 하나만 교체완료할 수 있습니다.", 400);
  }

  // 지금 예측(교체 전)의 일 소진량을 학습 기준으로 삼는다.
  let predictedDailyConsumption = 0;
  let name = sku;

  try {
    const built = await buildState({ storeCode: record.code, storeLabel: record.label });
    const forecast = built.state.run.forecasts.find((item) => item.sku === sku);
    if (forecast) {
      predictedDailyConsumption = forecast.predictedDailyConsumption;
      name = forecast.name;
    }
  } catch {
    // 예측을 못 불러와도 교체 기록 자체는 남긴다(다음 예측에서 학습).
  }

  const previous = record.calibrations[sku] ?? null;
  const replacedAt = new Date().toISOString();
  const fullCapacity = stapleCapacity(sku, previous?.fullCapacity ?? null);

  const entry = nextCalibration({
    sku,
    previous,
    replacedAt,
    fullCapacity,
    predictedDailyConsumption,
  });

  const saved = await saveCalibration(record.code, entry);
  if (!saved) return jsonError("매장을 찾을 수 없습니다.", 404);

  // 학습 근거를 이력으로 남긴다(표가 없으면 조용히 건너뛴다).
  await logCalibration({
    storeCode: record.code,
    sku,
    entry,
    actualDays: previous ? Math.round(daysBetween(previous.lastReplacedAt, replacedAt) * 10) / 10 : null,
    expectedDays:
      predictedDailyConsumption > 0 ? Math.round((fullCapacity / predictedDailyConsumption) * 10) / 10 : null,
  });

  const learned = entry.samples > 0;

  return NextResponse.json(
    {
      ok: true,
      sku,
      name,
      calibration: entry,
      stockPct: 100,
      calibrationFactor: entry.factor,
      message: learned
        ? `${name} 교체완료 · 잔량 100% · 소진 속도 ${entry.factor.toFixed(2)}x로 학습했습니다.`
        : `${name} 교체완료 · 잔량 100%. 다음 교체 때 소진 속도를 학습합니다.`,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
