import { createHmac, timingSafeEqual } from "node:crypto";

import { cookieName, readPinCookie, verifyPinToken } from "./pin";

/**
 * `/owner` 점주 통합 포털의 "지금 어느 지점으로 열려 있는가" 세션 — 서버 전용.
 *
 * 왜 따로 두나
 *  - 지점별 PIN 쿠키(`ls_store_pin_<CODE>`)는 `/store/[code]`가 이미 쓰는 값이다.
 *    그 쿠키만으로도 "어느 지점들이 열려 있는지"는 알 수 있지만, **마지막에 연 지점**을
 *    알 수 없어 새로고침마다 지점이 바뀔 수 있다.
 *  - 그래서 `/api/owner/login`이 PIN 검증에 성공했을 때만 지점별 PIN 쿠키와 함께
 *    `ls_owner_store`(서명·httpOnly·30일)를 심는다. 값에는 지점 코드·만료·서명만 담긴다.
 *
 * 검증은 두 겹
 *  1) `ls_owner_store` 서명·만료 확인 → 지점 코드를 얻는다.
 *  2) 그 지점의 PIN 쿠키(`ls_store_pin_<CODE>`)도 여전히 유효해야 한다.
 *     둘 중 하나라도 없으면 로그인 화면으로 돌아간다(로그아웃·만료가 바로 반영된다).
 *
 * 서명 키는 `pin.ts`와 같은 체인(`STORE_PIN_SECRET` → `INGEST_API_SECRET` → …)을 쓴다.
 */

export const OWNER_COOKIE = "ls_owner_store";
export const OWNER_COOKIE_DAYS = 30;

function secret() {
  return (
    process.env.STORE_PIN_SECRET ??
    process.env.INGEST_API_SECRET ??
    process.env.SHOP_ADMIN_COOKIE_SECRET ??
    "luckyspot-store-pin-v1"
  );
}

function sign(payload: string) {
  return createHmac("sha256", `owner-portal|${secret()}`).update(payload).digest("base64url");
}

export function readCookie(cookieHeader: string | null | undefined, name: string) {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }

  return null;
}

/** `CODE.exp.signature` — PIN이 아니라 '이 기기에서 이 지점을 열어 두었다'만 증명한다. */
export function issueOwnerToken(code: string, now: Date = new Date()) {
  const exp = now.getTime() + OWNER_COOKIE_DAYS * 86_400_000;
  const payload = `${code.trim().toUpperCase()}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyOwnerToken(token: string | null | undefined, now: Date = new Date()) {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [tokenCode, expText, signature] = parts;
  const exp = Number(expText);
  if (!tokenCode || !Number.isFinite(exp) || exp <= now.getTime()) return null;

  const expected = sign(`${tokenCode}.${expText}`);
  const given = Buffer.from(signature);
  const target = Buffer.from(expected);
  if (given.length !== target.length) return null;
  if (!timingSafeEqual(given, target)) return null;

  return tokenCode;
}

export function ownerCookieHeader(code: string, secure: boolean, now?: Date) {
  const maxAge = OWNER_COOKIE_DAYS * 86_400;
  return [
    `${OWNER_COOKIE}=${issueOwnerToken(code, now)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearedOwnerCookieHeader() {
  return `${OWNER_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

/**
 * 요청 쿠키에서 포털 세션을 읽는다. 두 겹(포털 토큰 + 지점 PIN 쿠키) 모두 유효해야 열린다.
 */
export function readOwnerSession(cookieHeader: string | null | undefined) {
  const code = verifyOwnerToken(readCookie(cookieHeader, OWNER_COOKIE));
  if (!code) return null;

  if (!verifyPinToken(code, readPinCookie(cookieHeader, code))) return null;

  return { code, cookieName: cookieName(code) };
}
