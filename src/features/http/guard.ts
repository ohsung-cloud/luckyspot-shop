import { NextResponse } from "next/server";

/**
 * 서버 API 공통 방어막.
 *
 *  - 요청 횟수 제한(서버리스 인스턴스 단위 메모리 카운터).
 *  - 본문 크기 제한 + JSON 객체 검증.
 *  - 응답에는 내부 오류 문구·개인정보를 그대로 싣지 않는다.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 3000;

export const noStoreHeaders = { "Cache-Control": "no-store" } as const;

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function takeRateLimit(request: Request, scope: string, limit: number, windowMs: number) {
  const key = `${scope}:${clientIp(request)}`;
  const now = Date.now();
  const bucket = buckets.get(key) ?? { count: 0, resetAt: now + windowMs };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  if (bucket.count >= limit) {
    return { ok: false as const, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (buckets.size > MAX_BUCKETS) {
    for (const [storedKey, stored] of buckets) {
      if (stored.resetAt < now) buckets.delete(storedKey);
    }
  }

  return { ok: true as const };
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error: message, ...extra },
    { status, headers: noStoreHeaders },
  );
}

export type JsonObjectResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; response: NextResponse };

export async function readJsonObject(request: Request, maxBytes = 4 * 1024): Promise<JsonObjectResult> {
  const declared = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: jsonError("payload too large", 413) };
  }

  let raw: string;

  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: jsonError("invalid body", 400) };
  }

  if (raw.length > maxBytes) {
    return { ok: false, response: jsonError("payload too large", 413) };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, response: jsonError("invalid json", 400) };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, response: jsonError("invalid json", 400) };
  }

  return { ok: true, data: parsed as Record<string, unknown> };
}

export function boundedText(value: unknown, min: number, max: number) {
  if (typeof value !== "string") return null;

  const text = value.trim();

  if (text.length < min || text.length > max) return null;
  // 제어문자(줄바꿈·탭 제외) 차단
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) return null;

  return text;
}
