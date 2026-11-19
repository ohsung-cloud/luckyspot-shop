import { NextResponse } from "next/server";

import {
  buildOrderLines,
  createOrderCreatedAt,
  createOrderSheetPayload,
  generateOrderId,
} from "@/features/order/utils";
import { resolveOrderStore, saveShopOrder } from "@/features/order/supabase";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_ITEMS = 100;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_ORDER_TOTAL = 100_000_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function takeRateLimit(request: Request) {
  const key = clientIp(request);
  const now = Date.now();
  const bucket = buckets.get(key) ?? { count: 0, resetAt: now + RATE_WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_WINDOW_MS;
  }

  if (bucket.count >= RATE_LIMIT) {
    return { ok: false as const, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (buckets.size > 3000) {
    for (const [storedKey, stored] of buckets) {
      if (stored.resetAt < now) buckets.delete(storedKey);
    }
  }

  return { ok: true as const };
}

function createBadRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function readText(value: unknown, min: number, max: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length < min || text.length > max) return null;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) return null;
  return text;
}

function readItems(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ITEMS) return null;

  const items: { id: string; quantity: number }[] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;

    const candidate = raw as Record<string, unknown>;
    const id = readText(candidate.id, 1, 40);

    if (!id) return null;

    const quantity = Number(candidate.quantity ?? 1);

    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 999) return null;

    items.push({ id, quantity: Math.round(quantity) });
  }

  return items;
}

export async function POST(request: Request) {
  const gasWebhookUrl = process.env.GAS_WEBHOOK_URL;
  const gasSecret = process.env.GAS_SECRET;

  if (!gasWebhookUrl || !gasSecret) {
    return NextResponse.json({ error: "Order relay is not configured" }, { status: 500 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  const verdict = takeRateLimit(request);

  if (!verdict.ok) {
    return NextResponse.json(
      { error: "주문 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfter) } },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createBadRequest("Invalid JSON payload");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return createBadRequest("Invalid order payload");
  }

  const candidate = body as Record<string, unknown>;
  const name = readText(candidate.name, 1, 30);
  const phoneInput = readText(candidate.phone, 9, 20);
  const phone = phoneInput?.replace(/\D/g, "") ?? "";
  const address = readText(candidate.address, 1, 200);
  const shippingOption = readText(candidate.shippingOption, 1, 40);
  const items = readItems(candidate.items);

  if (!name || !shippingOption || !address || !items) {
    return createBadRequest("Invalid order payload");
  }

  if (!/^01\d{8,9}$/.test(phone)) {
    return createBadRequest("Invalid phone number");
  }

  // 금액은 클라이언트가 보낸 값이 아니라 서버 카탈로그 단가로 다시 계산한다.
  const orderLines = buildOrderLines(items);

  if (!orderLines.length) {
    return createBadRequest("장바구니에 담긴 품목을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.");
  }

  if (orderLines.reduce((sum, line) => sum + line.amount, 0) > MAX_ORDER_TOTAL) {
    return createBadRequest("Order total is too large");
  }

  const orderId = generateOrderId();
  const createdAt = createOrderCreatedAt();
  const payload = createOrderSheetPayload(
    { address, items: orderLines, name, phone, shippingOption },
    { createdAt, orderId },
  );

  try {
    const gasResponse = await fetch(gasWebhookUrl, {
      body: JSON.stringify({ ...payload, secret: gasSecret }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      cache: "no-store",
    });

    const gasResponseText = await gasResponse.text();

    let gasResult: { error?: string; ok?: boolean } | null = null;

    try {
      gasResult = JSON.parse(gasResponseText) as { error?: string; ok?: boolean };
    } catch {
      gasResult = null;
    }

    if (!gasResponse.ok || gasResult?.ok === false) {
      console.error("[orders] gas relay failed:", gasResponse.status, gasResponseText.slice(0, 200));
      return NextResponse.json(
        { error: "주문 접수 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("[orders] gas relay error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "주문 접수 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }

  // 구글시트 전달이 끝난 주문을 Supabase에도 남긴다.
  // 실패해도 주문 접수(시트·웹훅·응답)는 그대로 유지하고 로그만 남긴다.
  const store = resolveOrderStore(shippingOption);
  const persistence = await saveShopOrder({
    address: payload.address,
    createdAt: payload.created_at,
    fulfillmentType: payload.fulfillment_type,
    items: orderLines,
    itemText: payload.item_text,
    orderNumber: payload.order_id,
    pickupLocation: payload.pickup_location,
    requesterName: payload.name,
    requesterPhone: payload.phone,
    shippingOption,
    storeCode: store.storeCode,
    storeName: store.storeName,
    totalAmount: payload.total_price,
  });

  if (persistence.saved) {
    console.log(`[orders] shop_orders 적재 완료 order=${payload.order_id} id=${persistence.id}`);
  }

  return NextResponse.json({
    createdAt: payload.created_at,
    orderId: payload.order_id,
    totalPrice: payload.total_price,
  });
}
