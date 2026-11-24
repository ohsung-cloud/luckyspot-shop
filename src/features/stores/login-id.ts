import { createHmac, timingSafeEqual } from "node:crypto";

import { SEED_LOGIN_GROUPS, SEED_LOGINS, seedLoginFor } from "./seed-logins";

/**
 * 점주 포털(`/owner`) 로그인 ID·비밀번호 — 서버 전용.
 *
 * 기준(대표 확정 2026-11-25)
 *  - 아이디는 네이버 아이디와 맞춘 지점별 ID. 비밀번호는 지점마다 따로 두되 초기값은 123456.
 *  - 저장은 **해시만**: HMAC-SHA256(key = "luckyspot-store-login|" + 지점코드, message = 비밀번호).
 *  - 네이버 실제 비밀번호는 코드·DB 어디에도 넣지 않는다(아이디만 맞췄다).
 *
 * 아이디 표기
 *  - 대소문자·앞뒤 공백은 무시한다(`luckyspot-hyj@naver.com` → 소문자).
 *  - 지점별 ID 외에 메일 주소 별칭, 그리고 직영 3개 지점을 묶은 본계정 ID도 받는다.
 *    (본계정으로 들어오면 지점을 고르게 한다 — `SEED_LOGIN_GROUPS`)
 */

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 32;
const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._@-]{2,49}$/;

export function normalizeLoginId(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function isValidLoginId(value: string | null | undefined) {
  const id = normalizeLoginId(value);
  return LOGIN_ID_PATTERN.test(id);
}

/** 비밀번호는 공백 없이 6~32자 — 숫자만일 필요는 없다(나중에 바꿀 수 있게). */
export function isValidPassword(value: string | null | undefined) {
  if (typeof value !== "string") return false;
  if (/\s/.test(value)) return false;
  return value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH;
}

export function hashStorePassword(code: string, password: string) {
  const normalizedCode = code.trim().toUpperCase();
  return createHmac("sha256", `luckyspot-store-login|${normalizedCode}`)
    .update(password)
    .digest("hex");
}

export function matchesStorePassword(
  storedHash: string | null | undefined,
  code: string,
  given: string | null | undefined,
) {
  if (!storedHash || typeof given !== "string" || given.length === 0) return false;

  const givenHash = Buffer.from(hashStorePassword(code, given), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (givenHash.length !== stored.length || stored.length === 0) return false;

  return timingSafeEqual(givenHash, stored);
}

/** 시드 표에서 이 아이디가 가리키는 지점 코드(별칭 포함). 없으면 null. */
export function seedCodeForLoginId(value: string | null | undefined) {
  const id = normalizeLoginId(value);
  if (!id) return null;

  for (const [code, login] of Object.entries(SEED_LOGINS)) {
    if (login.loginId === id) return code;
    if (login.aliases.some((alias) => normalizeLoginId(alias) === id)) return code;
  }

  return null;
}

/** 본계정 ID 하나로 여러 지점을 관리하는 경우 — 고를 수 있는 지점 코드 목록. */
export function seedGroupCodesForLoginId(value: string | null | undefined) {
  const id = normalizeLoginId(value);
  if (!id) return null;

  return SEED_LOGIN_GROUPS[id] ?? null;
}

export function seedPasswordHashFor(code: string) {
  return seedLoginFor(code)?.passwordHash ?? null;
}

export function seedLoginIdFor(code: string) {
  return seedLoginFor(code)?.loginId ?? null;
}

export function seedAliasesFor(code: string) {
  return seedLoginFor(code)?.aliases ?? [];
}
