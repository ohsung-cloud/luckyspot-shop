import type { OrderSheetPayload } from "@/features/order/utils";

/**
 * 주문을 구글시트(order_requests)로 넘기는 웹훅 릴레이 (서버 전용).
 *
 * 원본 경로는 Google Apps Script 웹훅이다. `/api/orders`(입금 안내 방식)는 이 로직을
 * 라우트 안에 두고 있고, 결제가 끝난 발주만 이 모듈로 전달한다.
 * 환경변수(GAS_WEBHOOK_URL·GAS_SECRET)가 없으면 보내지 않고 false 를 돌려준다.
 */

const GAS_TIMEOUT_MS = 8_000;

export type GasRelayResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "rejected" | "timeout" | "request_failed"; detail?: string };

export async function relayOrderToGas(payload: OrderSheetPayload): Promise<GasRelayResult> {
  const url = process.env.GAS_WEBHOOK_URL?.trim();
  const secret = process.env.GAS_SECRET?.trim();

  if (!url || !secret) return { ok: false, reason: "not_configured" };

  try {
    const response = await fetch(url, {
      body: JSON.stringify({ ...payload, secret }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(GAS_TIMEOUT_MS),
    });

    const text = await response.text();

    let parsed: { ok?: boolean; error?: string } | null = null;

    try {
      parsed = JSON.parse(text) as { ok?: boolean; error?: string };
    } catch {
      parsed = null;
    }

    if (!response.ok || parsed?.ok === false) {
      console.error(
        `[payments] 구글시트 전달 실패 order=${payload.order_id} status=${response.status}: ${text.slice(0, 200)}`,
      );
      return { ok: false, reason: "rejected", detail: `status_${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";

    console.error(
      `[payments] 구글시트 전달 ${timedOut ? "시간 초과" : "오류"} order=${payload.order_id}:`,
      error instanceof Error ? error.message : error,
    );

    return {
      ok: false,
      reason: timedOut ? "timeout" : "request_failed",
    };
  }
}
