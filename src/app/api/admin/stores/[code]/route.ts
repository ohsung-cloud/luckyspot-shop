import { NextResponse } from "next/server";

import {
  findStoreRecord,
  portalSecretKeys,
  regenerateAdminCode,
  regeneratePin,
  updateStoreSettings,
  updateStoreStatus,
  updateStoreThresholds,
} from "@/features/stores/registry";
import type { PrintVendorType, StoreStatus, StoreThresholds } from "@/features/stores/registry-types";
import { PRINT_VENDORS } from "@/features/stores/registry-types";
import { jsonError, readJsonObject, takeRateLimit } from "@/features/http/guard";

/**
 * /api/admin/stores/[code]
 *
 *  PATCH  { status: "active" | "paused" | "deleted" }        → 상태 변경(삭제는 소프트 삭제)
 *         { thresholds: { beanDays, tonerDays, paperDays } } → 경보 기준일 변경
 *         { action: "regenerate-code" }                      → 점주 접근 코드 재발급(이전 코드 무효)
 *         { action: "regenerate-pin" }                       → 4자리 PIN 재발급(새 PIN 한 번만 응답)
 *         { settings: { printVendor, monthlyFixedCost, pinEnabled } } → 프린트 벤더·월 고정비·PIN 잠금
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: StoreStatus[] = ["active", "paused", "deleted"];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const limit = takeRateLimit(request, "store-update", 60, 10 * 60 * 1000);
  if (!limit.ok) {
    return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
      retryAfter: limit.retryAfter,
    });
  }

  const { code } = await context.params;
  const record = await findStoreRecord(code);
  if (!record) return jsonError("매장을 찾을 수 없습니다.", 404);

  const parsed = await readJsonObject(request, 4 * 1024);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  if (body.action === "regenerate-code") {
    const issued = await regenerateAdminCode(record.code);
    if (!issued) return jsonError("매장을 찾을 수 없습니다.", 404);

    return NextResponse.json(
      {
        ok: true,
        store: issued.store,
        adminCode: issued.adminCode,
        adminUrl: issued.adminUrl,
        secrets: portalSecretKeys(record.code),
        message: "새 접근 코드를 발급했습니다. 이전 코드는 더 이상 열리지 않습니다.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (body.action === "regenerate-pin") {
    const issued = await regeneratePin(record.code);
    if (!issued) return jsonError("매장을 찾을 수 없습니다.", 404);

    return NextResponse.json(
      {
        ok: true,
        store: issued.store,
        pin: issued.pin,
        message: "새 4자리 PIN을 발급했습니다. 이전 PIN은 더 이상 열리지 않습니다.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (body.settings && typeof body.settings === "object") {
    const settings = body.settings as Record<string, unknown>;
    const fixed = settings.monthlyFixedCost as Record<string, unknown> | undefined;
    const vendorRaw = typeof settings.printVendor === "string" ? settings.printVendor : "";

    const updated = await updateStoreSettings(record.code, {
      printVendor: (PRINT_VENDORS as readonly string[]).includes(vendorRaw)
        ? (vendorRaw as PrintVendorType)
        : undefined,
      monthlyFixedCost:
        fixed && typeof fixed === "object"
          ? {
              rent: numberOrZero(fixed, "rent"),
              maintenance: numberOrZero(fixed, "maintenance"),
              internet: numberOrZero(fixed, "internet"),
              solution: numberOrZero(fixed, "solution"),
            }
          : undefined,
      pinEnabled: typeof settings.pinEnabled === "boolean" ? settings.pinEnabled : undefined,
    });

    if (!updated) return jsonError("매장을 찾을 수 없습니다.", 404);

    return NextResponse.json(
      { ok: true, store: updated, message: "매장 설정(벤더·고정비·PIN)을 저장했습니다." },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (typeof body.status === "string") {
    const status = body.status as StoreStatus;
    if (!STATUSES.includes(status)) return jsonError("상태 값이 올바르지 않습니다.", 400);

    if (status === "deleted" && record.code.startsWith("STORE_GNM")) {
      return jsonError("기준 지점은 삭제할 수 없습니다. 일시정지를 사용해 주세요.", 400);
    }

    const updated = await updateStoreStatus(record.code, status);
    if (!updated) return jsonError("매장을 찾을 수 없습니다.", 404);

    return NextResponse.json(
      { ok: true, store: updated, message: status === "paused" ? "일시정지했습니다." : status === "deleted" ? "목록에서 삭제했습니다." : "다시 활성화했습니다." },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (body.thresholds && typeof body.thresholds === "object") {
    const thresholds = body.thresholds as Record<string, unknown>;
    const patch: Partial<StoreThresholds> = {};

    for (const key of ["beanDays", "tonerDays", "paperDays"] as const) {
      const value = thresholds[key];
      if (typeof value === "number" && Number.isFinite(value)) patch[key] = value;
    }

    const updated = await updateStoreThresholds(record.code, patch);
    if (!updated) return jsonError("매장을 찾을 수 없습니다.", 404);

    return NextResponse.json(
      { ok: true, store: updated, message: "경보 기준일을 저장했습니다." },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return jsonError("변경할 내용이 없습니다.", 400);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const limit = takeRateLimit(request, "store-delete", 20, 10 * 60 * 1000);
  if (!limit.ok) {
    return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
      retryAfter: limit.retryAfter,
    });
  }

  const { code } = await context.params;
  const record = await findStoreRecord(code);
  if (!record) return jsonError("매장을 찾을 수 없습니다.", 404);

  const updated = await updateStoreStatus(record.code, "deleted");
  if (!updated) return jsonError("매장을 찾을 수 없습니다.", 404);

  // 점주 페이지는 열리지 않게 한다(데이터는 남긴다 — 되돌릴 수 있는 소프트 삭제).
  return NextResponse.json(
    { ok: true, store: updated, message: "목록에서 내렸습니다. 데이터는 보관됩니다." },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function numberOrZero(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(50_000_000, Math.round(value)));
}
