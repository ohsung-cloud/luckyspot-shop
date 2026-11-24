import { createHash, timingSafeEqual } from "node:crypto";

import type { NextResponse } from "next/server";

import { hasAdminSession } from "@/features/admin/auth";
import { jsonError } from "@/features/http/guard";

/**
 * `/api/admin/owners`(점주 로그인 관리) 접근 확인 — 서버 전용.
 *
 * 세 가지 길
 *  1) **본사 로그인 세션** — `/admin/login`에서 받은 httpOnly 쿠키(`features/admin/auth.ts`).
 *     사람이 브라우저에서 쓰는 길이다.
 *  2) **서버 간 토큰** — `INGEST_API_SECRET` 또는 `SHOP_ADMIN_SECRET` 값을
 *     `x-admin-secret`·`x-ingest-secret`·`Authorization: Bearer` 중 하나로 보낸다.
 *     대화 중 지니(또는 GitHub Actions)가 curl로 지점 로그인을 고칠 때 쓰는 길이다.
 *  3) **아무 비밀도 설정되지 않은 환경** — 셀프호스트·첫 배포 상태. 이때는 형제 라우트
 *     (`/api/admin/stores`)와 같은 수준(레이트리밋만)으로 열어 두고 응답에 `via: "open"`을 남긴다.
 *     토큰을 하나라도 설정하면 곧바로 (2)가 강제된다.
 *
 * 비교는 해시 후 상수 시간 — 길이가 달라도 타이밍이 새지 않는다.
 */

const TOKEN_ENV_KEYS = ["INGEST_API_SECRET", "SHOP_ADMIN_SECRET", "SHOP_ADMIN_TOKEN"] as const;

export type OwnerAdminAccess =
  | { ok: true; via: "session" | "secret" | "open" }
  | { ok: false; response: NextResponse };

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function safeEqual(a: string, b: string) {
  return timingSafeEqual(digest(a), digest(b));
}

function readBearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function configuredTokens() {
  return TOKEN_ENV_KEYS.map((key) => (process.env[key] ?? "").trim()).filter((value) => value.length > 0);
}

export async function requireOwnerAdmin(request: Request): Promise<OwnerAdminAccess> {
  if (await hasAdminSession()) return { ok: true, via: "session" };

  const presented =
    (request.headers.get("x-admin-secret") ?? request.headers.get("x-ingest-secret") ?? "").trim() ||
    readBearer(request);
  const tokens = configuredTokens();

  if (tokens.length > 0) {
    if (presented && tokens.some((token) => safeEqual(presented, token))) {
      return { ok: true, via: "secret" };
    }

    return {
      ok: false,
      response: jsonError(
        "관리자 인증이 필요합니다. 본사 로그인 쿠키 또는 x-admin-secret 헤더를 보내 주세요.",
        401,
      ),
    };
  }

  return { ok: true, via: "open" };
}
