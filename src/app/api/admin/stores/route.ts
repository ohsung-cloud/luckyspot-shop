import { NextResponse } from "next/server";

import {
  createStore,
  listStoreRecords,
  portalSecretKeys,
} from "@/features/stores/registry";
import type { CreateStoreInput, PrintVendorType, StoreType } from "@/features/stores/registry-types";
import { PRINT_VENDORS, STORE_TYPES } from "@/features/stores/registry-types";
import { jsonError, readJsonObject, takeRateLimit } from "@/features/http/guard";

/**
 * /api/admin/stores — 본사 매장·점주 어드민 관리.
 *
 *  GET   → 매장 목록(연락처·사업자번호 마스킹) + 포털 Secret 키 이름 안내
 *  POST  → 매장 생성. 생성과 동시에 점주 접근 코드를 발급한다.
 *
 * 비밀 취급
 *  - 포털 비밀번호는 받지 않는다(필드 자체가 없다). GitHub Secrets 키 이름만 안내한다.
 *  - 발급한 접근 코드는 이 응답에 한 번만 실린다. DB에는 해시만 남는다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT_CREATE = 10;
const WINDOW_CREATE_MS = 60 * 60 * 1000;

export async function GET() {
  const stores = await listStoreRecords();

  return NextResponse.json(
    {
      ok: true,
      stores: stores.map((store) => ({
        ...store,
        secrets: portalSecretKeys(store.code),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const limit = takeRateLimit(request, "store-create", LIMIT_CREATE, WINDOW_CREATE_MS);
  if (!limit.ok) {
    return jsonError("매장 생성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
      retryAfter: limit.retryAfter,
    });
  }

  const parsed = await readJsonObject(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  const text = (value: unknown, max: number) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";

  const storeTypeRaw = text(body.storeType, 12);
  const storeType: StoreType | undefined = STORE_TYPES.includes(storeTypeRaw as StoreType)
    ? (storeTypeRaw as StoreType)
    : undefined;

  const vendorRaw = text(body.printVendor, 20);
  const printVendor: PrintVendorType | undefined = (PRINT_VENDORS as readonly string[]).includes(vendorRaw)
    ? (vendorRaw as PrintVendorType)
    : undefined;

  const thresholds = body.thresholds && typeof body.thresholds === "object"
    ? (body.thresholds as Record<string, unknown>)
    : {};

  const toDays = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  const input: CreateStoreInput = {
    label: text(body.label, 40),
    code: text(body.code, 24) || undefined,
    ownerName: text(body.ownerName, 20),
    phone: text(body.phone, 20),
    storeType,
    region: text(body.region, 20),
    coffeeEntityName: text(body.coffeeEntityName, 40),
    coffeeBusinessNo: text(body.coffeeBusinessNo, 14),
    printEntityName: text(body.printEntityName, 40),
    printBusinessNo: text(body.printBusinessNo, 14),
    loyalsunsStoreId: text(body.loyalsunsStoreId, 40),
    escalprintBranch: text(body.escalprintBranch, 40),
    thresholds: {
      beanDays: toDays(thresholds.beanDays),
      tonerDays: toDays(thresholds.tonerDays),
      paperDays: toDays(thresholds.paperDays),
    },
    printVendor,
    monthlyFixedCost: readFixedCost(body.monthlyFixedCost),
    pin: typeof body.pin === "string" ? body.pin : undefined,
  };

  const result = await createStore(input);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, errors: result.errors, error: result.errors[0]?.message ?? "입력을 확인해 주세요." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      store: result.created.store,
      adminCode: result.created.adminCode,
      adminUrl: result.created.adminUrl,
      pin: result.created.pin,
      secrets: portalSecretKeys(result.created.store.code),
      message: "매장과 점주 어드민이 만들어졌습니다. 접근 코드와 PIN은 지금 한 번만 보입니다.",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

/** 월 고정비 — 숫자만 받고 나머지는 버린다(0원도 유효). */
function readFixedCost(value: unknown) {
  if (!value || typeof value !== "object") return undefined;

  const source = value as Record<string, unknown>;
  const pick = (key: string) =>
    typeof source[key] === "number" && Number.isFinite(source[key]) ? (source[key] as number) : 0;

  return {
    rent: pick("rent"),
    maintenance: pick("maintenance"),
    internet: pick("internet"),
    solution: pick("solution"),
  };
}
