import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * 본사 발주 관리자(/admin) 서버 인증.
 *
 * 원칙 (/knowhow 게이트와 같은 방식)
 *  - 비밀번호는 절대 클라이언트로 내려보내지 않는다. 비교·서명은 서버에서만.
 *  - 인증 상태는 HMAC 서명 쿠키로만 유지한다(HttpOnly · Secure · SameSite=Lax · 7일).
 *  - 서명에 비밀번호 해시 조각을 넣어, 비밀번호를 바꾸면 기존 쿠키가 자동으로 무효가 된다.
 *  - 환경변수가 없으면 항상 실패(fail-closed)한다. 코드에 기본값을 두지 않는다.
 *
 * 필요한 환경변수 (Vercel → luckyspot-shop → Settings → Environment Variables)
 *   SHOP_ADMIN_PASSCODE        관리자 비밀번호 (6~12자리 숫자 권장)
 *   SHOP_ADMIN_COOKIE_SECRET   쿠키 서명 키 (16자 이상 임의 문자열)
 *
 * 두 값이 없으면 /admin 은 "설정 필요" 안내만 보여주고 어떤 입력도 통과시키지 않는다.
 */

export const ADMIN_COOKIE_NAME = "ls_shop_admin";
/** /admin 화면과 /api/admin API 양쪽에 쿠키를 보내야 해서 경로는 루트다. */
export const ADMIN_COOKIE_PATH = "/";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7일

const MIN_PASSCODE_LENGTH = 6;
const MAX_PASSCODE_LENGTH = 12;

const cookieSecret = () => (process.env.SHOP_ADMIN_COOKIE_SECRET ?? "").trim();
const passcode = () =>
  (process.env.SHOP_ADMIN_PASSCODE ?? process.env.ADMIN_PASSCODE ?? "").trim();

export function isAdminConfigured() {
  const code = passcode();
  return (
    cookieSecret().length >= 16 &&
    code.length >= MIN_PASSCODE_LENGTH &&
    code.length <= MAX_PASSCODE_LENGTH
  );
}

export function readPasscodeInput(value: unknown) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw.length < MIN_PASSCODE_LENGTH || raw.length > MAX_PASSCODE_LENGTH) return null;
  if (!/^\d+$/.test(raw)) return null;
  return raw;
}

const passcodeTag = () => createHash("sha256").update(passcode()).digest("hex").slice(0, 12);

function sign(exp: number) {
  return createHmac("sha256", cookieSecret())
    .update(`admin|${exp}|${passcodeTag()}`)
    .digest("base64url");
}

export function issueAdminSession() {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE;
  return { exp, value: `v1.${exp}.${sign(exp)}` };
}

export function verifyAdminSession(raw?: string | null) {
  if (!isAdminConfigured() || !raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 3) return null;

  const [version, expText, signature] = parts;
  const exp = Number(expText);

  if (version !== "v1" || !signature || !Number.isFinite(exp)) return null;
  if (exp * 1000 < Date.now()) return null;

  const given = Buffer.from(signature);
  const expected = Buffer.from(sign(exp));

  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  return { exp };
}

/** 입력 비밀번호 비교(타이밍 공격 방지). 설정이 없으면 항상 false. */
export function matchesAdminPasscode(input: string) {
  if (!isAdminConfigured()) return false;

  const given = createHash("sha256").update(input).digest();
  const expected = createHash("sha256").update(passcode()).digest();

  return timingSafeEqual(given, expected);
}

export async function hasAdminSession() {
  const jar = await cookies();
  return Boolean(verifyAdminSession(jar.get(ADMIN_COOKIE_NAME)?.value));
}
