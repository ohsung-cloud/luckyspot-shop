import { NextResponse } from "next/server";

import { jsonError, readJsonObject, takeRateLimit } from "@/features/http/guard";
import { isValidPassword, seedGroupCodesForLoginId } from "@/features/stores/login-id";
import { ownerCookieHeader } from "@/features/stores/owner-session";
import { isValidPin, normalizePin, pinCookieHeader } from "@/features/stores/pin";
import {
  findStoreRecord,
  resolveStoreCodeByLoginId,
  verifyStorePassword,
  verifyStorePin,
} from "@/features/stores/registry";
import type { StoreRegistryRecord } from "@/features/stores/registry-types";

/**
 * POST /api/owner/login — 점주 통합 포털(`/owner`) 로그인.
 *
 * 받는 본문 (셋 중 하나)
 *   1) { loginId: "luckyspot-hyj", password: "123456" }   ← 기본(아이디 + 비밀번호)
 *   2) { code: "STORE_GNM", password: "123456" }          ← 본계정으로 지점을 고른 뒤
 *   3) { code: "STORE_GNM", pin: "0000" }                 ← 기존 4자리 PIN(빠른 재접속)
 *
 * 계정 원본
 *  - 아이디·비밀번호는 기존 지점 레지스트리(`stores.login_id · password_hash`)다. 새 계정 표를 만들지 않는다.
 *  - 저장은 HMAC-SHA256 해시뿐이고, 네이버 실제 비밀번호는 어디에도 쓰지 않는다.
 *
 * 성공 시 httpOnly 쿠키 두 개
 *   1) `ls_store_pin_<CODE>` — 이 기기에서 이 지점을 열어 두었다는 30일 토큰(PIN 원문 아님)
 *   2) `ls_owner_store`      — 마지막으로 연 지점(포털 세션)
 *
 * 본계정 ID(직영 3개 지점)로 들어오면 200 + `{ ok: false, choose: [...] }`로 지점 목록을 돌려준다.
 * 그중 하나를 골라 (2)로 다시 보내면 그 지점으로 열린다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const SAME_ANSWER = "아이디 또는 비밀번호가 맞지 않아요. 다시 확인해 주세요.";

export async function POST(request: Request) {
  const limit = takeRateLimit(request, "owner-login", 10, 10 * 60 * 1000);
  if (!limit.ok) {
    return jsonError("로그인 시도가 너무 많습니다. 10분 뒤에 다시 시도해 주세요.", 429, {
      retryAfter: limit.retryAfter,
    });
  }

  const parsed = await readJsonObject(request, 1024);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const rawLoginId = typeof body.loginId === "string" ? body.loginId.trim() : "";
  const rawPassword = typeof body.password === "string" ? body.password : "";
  const rawCode = typeof body.code === "string" ? body.code.trim() : "";
  const rawPin = typeof body.pin === "string" ? body.pin : "";

  /* ── 3) 4자리 PIN (기존 방식) ─────────────────────────────────────────── */
  if (!rawLoginId && rawPin) {
    if (!rawCode) return jsonError("지점을 골라 주세요.", 400);
    if (!isValidPin(rawPin)) return jsonError("PIN은 숫자 4자리예요.", 400);

    const record = await findStoreRecord(rawCode);
    const blocked = guardRecord(record);
    if (blocked) return blocked;

    const ok = await verifyStorePin(record as StoreRegistryRecord, normalizePin(rawPin));
    if (!ok) return unauthorized(SAME_ANSWER);

    return grant(request, record as StoreRegistryRecord);
  }

  /* ── 1) 아이디 + 비밀번호 ─────────────────────────────────────────────── */
  if (rawLoginId) {
    if (!isValidPassword(rawPassword)) {
      return jsonError("비밀번호는 6자리 이상이에요. 본사에서 받은 비밀번호를 넣어 주세요.", 400);
    }

    // 직영 여러 지점을 한 아이디로 관리하는 경우 — 지점을 고르게 한다.
    const group = seedGroupCodesForLoginId(rawLoginId);
    if (group) {
      const matches: { code: string; label: string; shortLabel: string }[] = [];

      for (const code of group) {
        const record = await findStoreRecord(code);
        if (!record || record.status !== "active") continue;
        if (await verifyStorePassword(record, rawPassword)) {
          matches.push({ code: record.code, label: record.label, shortLabel: record.shortLabel });
        }
      }

      if (matches.length === 0) return unauthorized(SAME_ANSWER);
      if (matches.length === 1) {
        const record = await findStoreRecord(matches[0].code);
        if (record) return grant(request, record);
      }

      return NextResponse.json(
        { ok: false, choose: matches, error: "어느 지점으로 들어갈까요?" },
        { headers: NO_STORE },
      );
    }

    const code = await resolveStoreCodeByLoginId(rawLoginId);
    if (!code) return unauthorized(SAME_ANSWER);

    const record = await findStoreRecord(code);
    const blocked = guardRecord(record);
    if (blocked) return blocked;

    const ok = await verifyStorePassword(record as StoreRegistryRecord, rawPassword);
    if (!ok) return unauthorized(SAME_ANSWER);

    return grant(request, record as StoreRegistryRecord);
  }

  /* ── 2) 지점 선택 후 비밀번호 ─────────────────────────────────────────── */
  if (rawCode && rawPassword) {
    const record = await findStoreRecord(rawCode);
    const blocked = guardRecord(record);
    if (blocked) return blocked;

    const ok = await verifyStorePassword(record as StoreRegistryRecord, rawPassword);
    if (!ok) return unauthorized(SAME_ANSWER);

    return grant(request, record as StoreRegistryRecord);
  }

  return jsonError("아이디와 비밀번호를 넣어 주세요.", 400);
}

function guardRecord(record: StoreRegistryRecord | null) {
  if (!record || record.status === "deleted") {
    return jsonError("그런 지점을 찾을 수 없어요. 지점 코드를 확인해 주세요.", 404);
  }

  if (record.status === "paused") {
    return jsonError("본사에서 잠시 멈춘 지점이에요. 다시 열려면 본사에 문의해 주세요.", 403);
  }

  return null;
}

function unauthorized(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 401, headers: NO_STORE });
}

function grant(request: Request, record: StoreRegistryRecord) {
  const response = NextResponse.json(
    {
      ok: true,
      code: record.code,
      label: record.label,
      shortLabel: record.shortLabel,
    },
    { headers: NO_STORE },
  );

  const secure = new URL(request.url).protocol === "https:";
  response.headers.append("Set-Cookie", pinCookieHeader(record.code, secure));
  response.headers.append("Set-Cookie", ownerCookieHeader(record.code, secure));

  return response;
}
