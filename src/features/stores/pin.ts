import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * 점주용 4자리 간편 PIN — 서버 검증 전용.
 *
 * 왜 PIN인가
 *  - 점주가 홈화면에 설치한 PWA를 열 때마다 10자리 접근 코드를 치는 건 현실적으로 안 된다.
 *    네 자리만 누르면 1초 안에 다시 들어오게 하되, 원문은 어디에도 저장하지 않는다.
 *
 * 저장·검증
 *  - DB(`stores.pin_hash`)에는 SHA-256(고정 접두어 + 지점코드 + PIN)만 둔다.
 *  - 비교는 상수 시간(timingSafeEqual). 저장된 해시가 없으면 항상 false.
 *  - 한 기기에서의 재접속은 **httpOnly 쿠키**(서명된 만료 토큰)로 처리한다.
 *    쿠키에는 PIN이 아니라 지점 코드·만료·서명만 담긴다.
 *
 * 쿠키 서명 키
 *  - `STORE_PIN_SECRET` → 없으면 `INGEST_API_SECRET` → 없으면 고정 문자열.
 *    (내부 화면·noindex 전제. 별도 시크릿을 넣으면 즉시 교체된다.)
 */

export const PIN_LENGTH = 4;
export const PIN_COOKIE_PREFIX = "ls_store_pin_";
export const PIN_COOKIE_DAYS = 30;

const PIN_SALT = "luckyspot-store-pin|";

export function normalizePin(input: string | null | undefined) {
  return (input ?? "").replace(/\D/g, "").slice(0, PIN_LENGTH);
}

export function isValidPin(input: string | null | undefined) {
  const digits = (input ?? "").replace(/\D/g, "");
  return digits.length === PIN_LENGTH;
}

/** 데모용 기본 PIN — 시드 지점(강남구청역·한예종)에서만 안내한다. */
export const DEMO_PIN = "0000";

export function generatePin(): string {
  return String(randomInt(0, 10_000)).padStart(PIN_LENGTH, "0");
}

export function hashStorePin(code: string, pin: string) {
  const normalizedCode = code.trim().toUpperCase();
  return createHmac("sha256", `${PIN_SALT}${normalizedCode}`)
    .update(normalizePin(pin))
    .digest("hex");
}

export function matchesStorePin(storedHash: string | null, code: string, given: string | null | undefined) {
  if (!storedHash || !isValidPin(given)) return false;

  const givenHash = Buffer.from(hashStorePin(code, given as string), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (givenHash.length !== stored.length || stored.length === 0) return false;

  return timingSafeEqual(givenHash, stored);
}

/* ------------------------------------------------------------------------- */
/* 쿠키 토큰 — PIN이 아니라 '이 기기는 열려 있다'만 증명한다                     */
/* ------------------------------------------------------------------------- */

function secret() {
  return (
    process.env.STORE_PIN_SECRET ??
    process.env.INGEST_API_SECRET ??
    process.env.SHOP_ADMIN_COOKIE_SECRET ??
    "luckyspot-store-pin-v1"
  );
}

function sign(payload: string) {
  return createHmac("sha256", `pin-cookie|${secret()}`).update(payload).digest("base64url");
}

export function cookieName(code: string) {
  return `${PIN_COOKIE_PREFIX}${code.trim().toUpperCase()}`;
}

/** `code.expEpoch.signature` */
export function issuePinToken(code: string, now: Date = new Date()) {
  const normalizedCode = code.trim().toUpperCase();
  const exp = now.getTime() + PIN_COOKIE_DAYS * 86_400_000;
  const payload = `${normalizedCode}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyPinToken(code: string, token: string | null | undefined, now: Date = new Date()) {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [tokenCode, expText, signature] = parts;
  if (tokenCode !== code.trim().toUpperCase()) return false;

  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp <= now.getTime()) return false;

  const expected = sign(`${tokenCode}.${expText}`);
  const given = Buffer.from(signature);
  const target = Buffer.from(expected);
  if (given.length !== target.length) return false;

  return timingSafeEqual(given, target);
}

/** Set-Cookie 헤더 값. httpOnly·sameSite=lax·30일. */
export function pinCookieHeader(code: string, secure: boolean, now?: Date) {
  const maxAge = PIN_COOKIE_DAYS * 86_400;
  return [
    `${cookieName(code)}=${issuePinToken(code, now)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearedPinCookieHeader(code: string) {
  return `${cookieName(code)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

/** 요청 쿠키에서 이 지점의 PIN 토큰만 꺼낸다. */
export function readPinCookie(cookieHeader: string | null | undefined, code: string) {
  if (!cookieHeader) return null;

  const name = cookieName(code);
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }

  return null;
}
