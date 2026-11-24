import { NextResponse } from "next/server";

import { jsonError, readJsonObject, takeRateLimit } from "@/features/http/guard";
import { requireOwnerAdmin } from "@/features/owner/admin-access";
import { isValidLoginId, isValidPassword, normalizeLoginId, seedPasswordHashFor } from "@/features/stores/login-id";
import { seedPinFor } from "@/features/stores/seed-pins";
import {
  createStore,
  findStoreRecord,
  listStoreRecords,
  loadStoreLoginRows,
  regeneratePin,
  resolveStoreCodeByLoginId,
  setStoreLogin,
  setStorePin,
  storeLoginAliases,
  storeLoginIdOf,
  updateStoreSettings,
  updateStoreStatus,
} from "@/features/stores/registry";
import type { CreateStoreInput, PrintVendorType, StoreStatus, StoreType } from "@/features/stores/registry-types";
import { PRINT_VENDORS, STORE_TYPES } from "@/features/stores/registry-types";

/**
 * /api/admin/owners — 점주 로그인 계정 관리 (본사·대화 중 AI 공용)
 *
 * 점주 로그인 DB는 **새 표를 만들지 않는다.** 이미 쓰는 `stores`(+`pin_hash`)가 곧 계정이다.
 * 그래서 여기서 하는 일은 "지점 행 = 로그인 계정"을 조회·생성·수정하는 것뿐이다.
 *
 *   GET    ?code=STORE_HYJ          지점 로그인 목록(코드·이름·상태·아이디·비밀번호 설정 여부)
 *   POST   { label, ownerName, phone, code?, region?, loginId?, password?, pin?, monthlyFixedCost? }
 *                                   새 지점 로그인 만들기(접근 코드·PIN은 응답에 한 번만)
 *   PATCH  { code, action }
 *          action = "set-login"        { loginId?: "luckyspot-hyj", password?: "…" }  아이디·비밀번호 변경
 *          action = "set-pin"          { pin: "4821" }  지정한 4자리 PIN으로 변경
 *          action = "regenerate-pin"   새 무작위 PIN 발급(응답에 한 번만)
 *          action = "status"           { status: "active" | "paused" }  로그인 정지/재개
 *          action = "settings"         { pinEnabled?: boolean, monthlyFixedCost?: {...} }  잠금 여부·고정비
 *
 * 개인정보·비밀
 *  - 비밀번호·PIN 원문은 변경 응답에 싣지 않는다. 저장은 해시만(아이디는 원문 그대로 둔다).
 *  - 목록에는 이름·마스킹 연락처까지만 싣는다(원본 번호·사업자번호 없음).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(request: Request) {
  const limit = takeRateLimit(request, "owner-admin-read", 120, 10 * 60 * 1000);
  if (!limit.ok) return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);

  const access = await requireOwnerAdmin(request);
  if (!access.ok) return access.response;

  const code = new URL(request.url).searchParams.get("code");
  const records = code ? [await findStoreRecord(code)].flatMap((record) => (record ? [record] : [])) : await listStoreRecords();
  const loginRows = await loadStoreLoginRows();

  return NextResponse.json(
    {
      ok: true,
      auth: access.via,
      accounts: records.map((record) => {
        const row = loginRows.get(record.code);
        const loginId = row?.loginId ?? storeLoginIdOf(record);

        return {
          code: record.code,
          label: record.label,
          shortLabel: record.shortLabel,
          region: record.region,
          status: record.status,
          ownerName: record.ownerName || null,
          phoneMasked: record.phoneMasked,
          login: {
            loginId,
            aliases: storeLoginAliases(record),
            hasPassword: Boolean(row?.hasPassword || seedPasswordHashFor(record.code)),
            passwordSetAt: row?.passwordSetAt ?? null,
            hasPin: record.hasPin,
            pinEnabled: record.pinEnabled,
            pinSetAt: record.pinSetAt,
            hasAdminCode: record.hasAdminCode,
            /** 코드에 적어 둔 기본 PIN이 있는 지점인가(값은 내보내지 않는다) */
            seedPin: Boolean(seedPinFor(record.code)),
            /** 본사 PIN이 아직 없어 데모 PIN(0000)으로 열리는 지점인가 */
            demoPin: !record.hasAdminCode && !seedPinFor(record.code),
          },
          fixedCost: record.monthlyFixedCost,
          thresholds: record.thresholds,
          portal: "/owner",
        };
      }),
      storage: {
        /** 변경 생존 범위 안내 — Supabase 키가 없으면 이 인스턴스 메모리에만 남는다 */
        persistent: Boolean((process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()),
      },
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const limit = takeRateLimit(request, "owner-admin-create", 10, 60 * 60 * 1000);
  if (!limit.ok) return jsonError("생성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);

  const access = await requireOwnerAdmin(request);
  if (!access.ok) return access.response;

  const parsed = await readJsonObject(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

  const storeTypeRaw = text(body.storeType, 12);
  const vendorRaw = text(body.printVendor, 20);
  const fixed = body.monthlyFixedCost && typeof body.monthlyFixedCost === "object"
    ? (body.monthlyFixedCost as Record<string, unknown>)
    : null;

  const input: CreateStoreInput = {
    label: text(body.label, 40),
    code: text(body.code, 24) || undefined,
    ownerName: text(body.ownerName, 20),
    phone: text(body.phone, 20),
    region: text(body.region, 20),
    storeType: STORE_TYPES.includes(storeTypeRaw as StoreType) ? (storeTypeRaw as StoreType) : undefined,
    printVendor: (PRINT_VENDORS as readonly string[]).includes(vendorRaw)
      ? (vendorRaw as PrintVendorType)
      : undefined,
    monthlyFixedCost: fixed
      ? {
          rent: numberOr(fixed, "rent"),
          maintenance: numberOr(fixed, "maintenance"),
          internet: numberOr(fixed, "internet"),
          solution: numberOr(fixed, "solution"),
        }
      : undefined,
    pin: typeof body.pin === "string" ? body.pin : undefined,
  };

  const result = await createStore(input);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, errors: result.errors, error: result.errors[0]?.message ?? "입력을 확인해 주세요." },
      { status: 400, headers: NO_STORE },
    );
  }

  const created = result.created;

  // 포털 로그인(아이디·비밀번호)을 같이 만들었으면 바로 반영한다.
  const loginId = typeof body.loginId === "string" ? normalizeLoginId(body.loginId) : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (loginId && !isValidLoginId(loginId)) {
    return jsonError("아이디는 영문 소문자·숫자로 3자 이상이어야 합니다.", 400);
  }
  if (password && !isValidPassword(password)) {
    return jsonError("비밀번호는 6자리 이상(공백 없이)이어야 합니다.", 400);
  }

  const login = loginId || password
    ? await setStoreLogin(created.store.code, {
        loginId: loginId || undefined,
        password: password || undefined,
      })
    : null;

  return NextResponse.json(
    {
      ok: true,
      auth: access.via,
      account: {
        code: created.store.code,
        label: created.store.label,
        shortLabel: created.store.shortLabel,
        status: created.store.status,
        loginId: login?.loginId ?? null,
      },
      adminCode: created.adminCode,
      pin: created.pin,
      persisted: login?.persisted ?? false,
      message: loginId
        ? `지점 로그인을 만들었습니다. 아이디 ${loginId}${password ? " · 비밀번호 설정됨" : ""}.`
        : "지점 로그인을 만들었습니다. 포털 아이디는 set-login으로 지정할 수 있어요.",
    },
    { status: 201, headers: NO_STORE },
  );
}

export async function PATCH(request: Request) {
  const limit = takeRateLimit(request, "owner-admin-update", 60, 10 * 60 * 1000);
  if (!limit.ok) return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);

  const access = await requireOwnerAdmin(request);
  if (!access.ok) return access.response;

  const parsed = await readJsonObject(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const codeRaw = typeof body.code === "string" ? body.code.trim() : "";
  const action = typeof body.action === "string" ? body.action : "";

  if (!codeRaw) return jsonError("지점 코드(code)를 함께 보내 주세요.", 400);

  const record = await findStoreRecord(codeRaw);
  if (!record || record.status === "deleted") return jsonError("지점을 찾을 수 없습니다.", 404);

  if (action === "set-login") {
    const loginId = typeof body.loginId === "string" ? normalizeLoginId(body.loginId) : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!loginId && !password) return jsonError("바꿀 아이디나 비밀번호를 함께 보내 주세요.", 400);
    if (loginId && !isValidLoginId(loginId)) {
      return jsonError("아이디는 영문 소문자·숫자로 3자 이상이어야 합니다.", 400);
    }
    if (password && !isValidPassword(password)) {
      return jsonError("비밀번호는 6자리 이상(공백 없이)이어야 합니다.", 400);
    }

    // 다른 지점이 쓰는 아이디로는 바꾸지 않는다(어느 지점으로 열릴지 모호해진다).
    if (loginId) {
      const owner = await resolveStoreCodeByLoginId(loginId);
      if (owner && owner !== record.code) {
        return jsonError(`이미 ${owner} 지점이 쓰는 아이디입니다.`, 409);
      }
    }

    const result = await setStoreLogin(record.code, {
      loginId: loginId || undefined,
      password: password || undefined,
    });
    if (!result) return jsonError("지점을 찾을 수 없습니다.", 404);

    return NextResponse.json(
      {
        ok: true,
        auth: access.via,
        account: {
          code: result.store.code,
          label: result.store.label,
          loginId: result.loginId,
          passwordChanged: result.passwordChanged,
        },
        persisted: result.persisted,
        message: result.persisted
          ? `${result.store.shortLabel} 로그인 정보를 바꿨습니다.${result.passwordChanged ? " 새 비밀번호는 보낸 값이에요." : ""}`
          : `${result.store.shortLabel} 로그인 정보를 바꿨습니다. Supabase가 설정되지 않아 서버 메모리에만 적용돼요 — 영구 반영은 seed-logins.ts 값 + 재배포가 필요합니다.`,
      },
      { headers: NO_STORE },
    );
  }

  if (action === "set-pin") {
    const pin = typeof body.pin === "string" ? body.pin : "";
    if (!/^\d{4}$/.test(pin)) return jsonError("PIN은 숫자 4자리입니다.", 400);

    const result = await setStorePin(record.code, pin);
    if (!result) return jsonError("PIN을 저장하지 못했습니다.", 400);

    return NextResponse.json(
      {
        ok: true,
        auth: access.via,
        account: { code: result.store.code, label: result.store.label, pinSetAt: result.store.pinSetAt },
        pin: result.pin,
        persisted: result.persisted,
        message: result.persisted
          ? `${result.store.shortLabel} PIN을 ${result.pin}으로 바꿨습니다.`
          : `${result.store.shortLabel} PIN을 ${result.pin}으로 바꿨습니다. Supabase가 설정되지 않아 서버 메모리에만 적용돼요 — 영구 반영은 seed-pins.ts 값 + 재배포가 필요합니다.`,
      },
      { headers: NO_STORE },
    );
  }

  if (action === "regenerate-pin") {
    const issued = await regeneratePin(record.code);
    if (!issued) return jsonError("지점을 찾을 수 없습니다.", 404);

    return NextResponse.json(
      {
        ok: true,
        auth: access.via,
        account: { code: issued.store.code, label: issued.store.label, pinSetAt: issued.store.pinSetAt },
        pin: issued.pin,
        message: `${issued.store.shortLabel} 새 PIN은 ${issued.pin}입니다. 지금 한 번만 보여요.`,
      },
      { headers: NO_STORE },
    );
  }

  if (action === "status") {
    const status = typeof body.status === "string" ? (body.status as StoreStatus) : null;
    if (status !== "active" && status !== "paused") {
      return jsonError("상태는 active 또는 paused만 보낼 수 있습니다.", 400);
    }

    const updated = await updateStoreStatus(record.code, status);
    if (!updated) return jsonError("지점을 찾을 수 없습니다.", 404);

    return NextResponse.json(
      {
        ok: true,
        auth: access.via,
        account: { code: updated.code, label: updated.label, status: updated.status },
        message:
          status === "paused"
            ? `${updated.shortLabel} 로그인을 멈췄습니다. 다시 열려면 status를 active로 보내 주세요.`
            : `${updated.shortLabel} 로그인을 다시 열었습니다.`,
      },
      { headers: NO_STORE },
    );
  }

  if (action === "settings") {
    const fixed = body.monthlyFixedCost && typeof body.monthlyFixedCost === "object"
      ? (body.monthlyFixedCost as Record<string, unknown>)
      : null;

    const updated = await updateStoreSettings(record.code, {
      pinEnabled: typeof body.pinEnabled === "boolean" ? body.pinEnabled : undefined,
      monthlyFixedCost: fixed
        ? {
            rent: numberOr(fixed, "rent"),
            maintenance: numberOr(fixed, "maintenance"),
            internet: numberOr(fixed, "internet"),
            solution: numberOr(fixed, "solution"),
          }
        : undefined,
    });

    if (!updated) return jsonError("지점을 찾을 수 없습니다.", 404);

    return NextResponse.json(
      {
        ok: true,
        auth: access.via,
        account: {
          code: updated.code,
          label: updated.label,
          pinEnabled: updated.pinEnabled,
          fixedCost: updated.monthlyFixedCost,
        },
        message: "지점 설정을 저장했습니다.",
      },
      { headers: NO_STORE },
    );
  }

  return jsonError("action은 set-pin · regenerate-pin · status · settings 중 하나입니다.", 400);
}

function numberOr(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(50_000_000, Math.round(value)));
}
