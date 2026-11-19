import { NextResponse } from "next/server";

import {
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_PATH,
  ADMIN_SESSION_MAX_AGE,
  isAdminConfigured,
  issueAdminSession,
  matchesAdminPasscode,
  readPasscodeInput,
} from "@/features/admin/auth";
import { clientIp, jsonError, readJsonObject, takeRateLimit } from "@/features/http/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/auth
 *   { passcode: "12345678" } → 로그인(성공 시 httpOnly 서명 쿠키)
 *   { logout: true }         → 로그아웃(쿠키 삭제)
 *
 * 브루트포스 방어
 *   - IP 기준 10분에 5회까지, 초과 시 429 + Retry-After.
 *   - 실패 응답은 400ms 지연.
 *   - 비밀번호는 서버에서만 비교하고 어떤 응답에도 싣지 않는다.
 */

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  const parsed = await readJsonObject(request, 1024);

  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  if (body.logout === true) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE_NAME, "", { maxAge: 0, path: ADMIN_COOKIE_PATH });
    return response;
  }

  const verdict = takeRateLimit(request, `admin-auth:${clientIp(request)}`, LIMIT, WINDOW_MS);

  if (!verdict.ok) {
    return jsonError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429, {
      retryAfter: verdict.retryAfter,
    });
  }

  if (!isAdminConfigured()) {
    // 환경변수가 없으면 어떤 입력도 통과시키지 않는다(코드에 기본값 없음).
    return jsonError(
      "관리자 비밀번호가 아직 설정되지 않았습니다. Vercel 환경변수 SHOP_ADMIN_PASSCODE·SHOP_ADMIN_COOKIE_SECRET를 등록해 주세요.",
      503,
      { reason: "not_configured" },
    );
  }

  const passcode = readPasscodeInput(body.passcode);

  if (!passcode || !matchesAdminPasscode(passcode)) {
    await sleep(400);
    return jsonError("비밀번호가 맞지 않습니다.", 401, { reason: "invalid" });
  }

  const { value } = issueAdminSession();
  const response = NextResponse.json({ ok: true });

  response.cookies.set(ADMIN_COOKIE_NAME, value, {
    httpOnly: true,
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: ADMIN_COOKIE_PATH,
    sameSite: "lax",
    secure: true,
  });

  return response;
}

/** 그 밖의 메서드는 받지 않는다. */
export function GET() {
  return jsonError("method not allowed", 405);
}
