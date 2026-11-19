import { NextResponse } from "next/server";

import { hasAdminSession } from "@/features/admin/auth";
import {
  isOrderStatus,
  isOrderId,
  listAdminOrders,
  updateOrderStatus,
} from "@/features/admin/orders";
import { queueOrderStatusAlert } from "@/features/order/status-alert";
import { jsonError, noStoreHeaders, readJsonObject } from "@/features/http/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/admin/orders — 본사 발주 관리
 *
 *   GET   ?status=pending&limit=200   최근 발주 목록(최신순)
 *   PATCH { id, status }              상태 한 건 변경
 *
 * 승인·출고로 바뀌면 점주에게 알림톡을 보낸다(queueOrderStatusAlert → after()).
 * SOLAPI_ALIMTALK_TEMPLATE_ORDER_STATUS 가 없으면 조용히 건너뛰며, 상태 변경 응답은 그대로다.
 *
 * 인증: /api/admin/auth 가 발급한 httpOnly 서명 쿠키가 있어야만 통과한다.
 * 응답에는 주문자 이름·연락처가 들어가므로 Cache-Control: no-store 를 항상 붙인다.
 */

async function guard() {
  if (await hasAdminSession()) return null;

  return jsonError("관리자 로그인이 필요합니다.", 401);
}

export async function GET(request: Request) {
  const denied = await guard();
  if (denied) return denied;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const limitParam = Number(url.searchParams.get("limit") ?? "200");

  if (statusParam && !isOrderStatus(statusParam)) {
    return jsonError("알 수 없는 상태입니다.", 400);
  }

  const result = await listAdminOrders({
    limit: Number.isFinite(limitParam) ? limitParam : 200,
    status: isOrderStatus(statusParam) ? statusParam : null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, error: "발주 목록을 불러오지 못했습니다." },
      { status: result.status, headers: noStoreHeaders },
    );
  }

  return NextResponse.json({ ok: true, orders: result.orders }, { headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  const denied = await guard();
  if (denied) return denied;

  const parsed = await readJsonObject(request, 2048);

  if (!parsed.ok) return parsed.response;

  const { id, status } = parsed.data;

  if (!isOrderId(id) || !isOrderStatus(status)) {
    return jsonError("주문 번호와 상태를 확인해 주세요.", 400);
  }

  const result = await updateOrderStatus(id, status);

  if (!result.ok) {
    if (result.reason === "not_found") {
      return jsonError("해당 발주를 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.", 404);
    }

    return NextResponse.json(
      { ok: false, reason: result.reason, error: "상태를 바꾸지 못했습니다." },
      { status: result.status, headers: noStoreHeaders },
    );
  }

  // 승인·출고는 점주가 기다리는 순간이다 — 응답을 보낸 뒤 알림톡을 시도한다.
  // 설정이 없거나 발송에 실패해도 상태 변경 결과는 그대로 돌려준다.
  if ((result.order.status === "confirmed" || result.order.status === "shipped") && result.order.requesterPhone) {
    queueOrderStatusAlert({
      orderNumber: result.order.orderNumber,
      status: result.order.status,
      storeName: result.order.storeName,
      to: result.order.requesterPhone,
    });
  }

  return NextResponse.json({ ok: true, order: result.order }, { headers: noStoreHeaders });
}

/** 그 밖의 메서드는 받지 않는다. */
export function POST() {
  return jsonError("method not allowed", 405);
}
