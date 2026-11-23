import { createHmac, timingSafeEqual } from "node:crypto";

import type { AutoOrderProposal, GracePayload } from "./types";

/**
 * 5분 취소 유예 상태 전이 — 특허 청구항 (e)의 승인 게이트.
 *
 * 승인 시각과 만료 시각, 승인한 발주 라인을 **서명 토큰**에 담는다.
 *   → 서버가 인스턴스를 갈아타거나(서버리스 콜드 스타트) 메모리가 비어도
 *     "언제 승인했고 언제 확정되는지"를 위조 없이 다시 꺼낼 수 있다.
 *   → 유예 중 취소(cancel)는 만료 전에만 성립하고, 확정(resolve)은 만료 후에만 성립한다.
 *     이 두 조건이 서버의 상태 전이로 구현된다는 점이 종전 '설정값 자동발주'와의 차이다.
 */

export const GRACE_SECONDS = 300;
const MAX_TOKEN_LENGTH = 16_000;

function secret() {
  return (
    process.env.AUTO_ORDER_GRACE_SECRET ??
    process.env.SHOP_ADMIN_COOKIE_SECRET ??
    "luckyspot-auto-order-demo-key"
  );
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url").slice(0, 43);
}

export function issueGrace(input: {
  approvalId: string;
  storeCode: string;
  storeLabel: string;
  proposals: AutoOrderProposal[];
  now?: Date;
}): { payload: GracePayload; token: string } {
  const approvedAt = input.now ?? new Date();
  const expiresAt = new Date(approvedAt.getTime() + GRACE_SECONDS * 1000);

  const payload: GracePayload = {
    v: 1,
    approvalId: input.approvalId,
    storeCode: input.storeCode,
    storeLabel: input.storeLabel,
    approvedAt: approvedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    proposals: input.proposals.map((proposal) => ({ ...proposal, status: "grace_cancel_window" })),
  };

  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { payload, token: `${body}.${sign(body)}` };
}

export function verifyGrace(token: unknown): GracePayload | null {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  const expected = sign(body);

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  let payload: GracePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GracePayload;
  } catch {
    return null;
  }

  if (!payload || payload.v !== 1) return null;
  if (typeof payload.approvalId !== "string" || typeof payload.expiresAt !== "string") return null;
  if (!Array.isArray(payload.proposals)) return null;

  return payload;
}

export function remainingSeconds(expiresAt: string, now: Date = new Date()) {
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires)) return 0;

  return Math.max(0, Math.ceil((expires - now.getTime()) / 1000));
}

export function graceState(payload: GracePayload, now: Date = new Date()) {
  const remaining = remainingSeconds(payload.expiresAt, now);

  return {
    remainingSeconds: remaining,
    expired: remaining <= 0,
  };
}
