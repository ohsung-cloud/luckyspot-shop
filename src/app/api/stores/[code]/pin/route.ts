import { NextResponse } from "next/server";

import { findStoreRecord, verifyStorePin } from "@/features/stores/registry";
import { isValidPin, normalizePin, pinCookieHeader } from "@/features/stores/pin";
import { jsonError, readJsonObject, takeRateLimit } from "@/features/http/guard";

/**
 * POST /api/stores/[code]/pin — 점주 4자리 PIN 검증.
 *
 * 성공하면 httpOnly 쿠키(30일)를 심는다. 그 뒤로는 `/store/[코드]`가
 * `?key=` 없이도 열린다(1초 재접속). 쿠키에는 PIN이 아니라 지점 코드·만료·서명만 담긴다.
 *
 * 실패는 400 + 남은 시도 안내. 과도한 시도는 10분에 10회로 제한한다.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const limit = takeRateLimit(request, "store-pin", 10, 10 * 60 * 1000);
  if (!limit.ok) {
    return jsonError("PIN 시도가 너무 많습니다. 10분 뒤에 다시 시도해 주세요.", 429, {
      retryAfter: limit.retryAfter,
    });
  }

  const { code } = await context.params;
  const record = await findStoreRecord(code);
  if (!record) return jsonError("매장을 찾을 수 없습니다.", 404);

  const parsed = await readJsonObject(request, 1024);
  if (!parsed.ok) return parsed.response;

  const rawPin = typeof parsed.data.pin === "string" ? parsed.data.pin : "";
  if (!isValidPin(rawPin)) return jsonError("PIN은 숫자 4자리입니다.", 400);
  const pin = normalizePin(rawPin);

  const ok = await verifyStorePin(record, pin);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "PIN이 맞지 않습니다. 다시 입력해 주세요." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = NextResponse.json(
    { ok: true, code: record.code, shortLabel: record.shortLabel },
    { headers: { "Cache-Control": "no-store" } },
  );

  const secure = new URL(request.url).protocol === "https:";
  response.headers.append("Set-Cookie", pinCookieHeader(record.code, secure));

  return response;
}
