import { NextResponse } from "next/server";

import { takeRateLimit } from "@/features/http/guard";
import { readOwnerSession } from "@/features/stores/owner-session";
import { clearedPinCookieHeader } from "@/features/stores/pin";

/**
 * POST /api/owner/logout — 이 기기에서 점주 포털을 닫는다.
 *
 *  - 지금 열려 있는 지점의 PIN 쿠키와 포털 세션 쿠키를 지운다(Max-Age=0).
 *  - 다른 지점을 이미 열어 둔 기기라면 그 지점의 쿠키는 그대로 남는다 —
 *    "지점 전환"은 `/owner?switch=1`로 로그인 화면만 다시 보여 주고, 쿠키는 지우지 않는다.
 *  - 지우는 것 말고는 아무것도 바꾸지 않는다(지점 데이터·주문은 그대로).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = takeRateLimit(request, "owner-logout", 30, 10 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });

  const session = readOwnerSession(request.headers.get("cookie"));
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });

  if (session) response.headers.append("Set-Cookie", clearedPinCookieHeader(session.code));
  response.headers.append("Set-Cookie", "ls_owner_store=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");

  return response;
}
