import { NextResponse } from "next/server";

import { type ShopProduct } from "@/data/products";
import {
  createOrderCreatedAt,
  createOrderSheetPayload,
  generateOrderId,
  type OrderRequestInput,
} from "@/features/order/utils";

function isShopProduct(value: unknown): value is ShopProduct {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.price === "number" &&
    typeof candidate.imageAlt === "string" &&
    typeof candidate.imageSrc === "string" &&
    (candidate.imageVariant === "bag" ||
      candidate.imageVariant === "cover" ||
      candidate.imageVariant === "icon" ||
      candidate.imageVariant === "tile")
  );
}

function isOrderRequestInput(value: unknown): value is OrderRequestInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.phone === "string" &&
    typeof candidate.shippingOption === "string" &&
    typeof candidate.address === "string" &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isShopProduct)
  );
}

function createBadRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  const gasWebhookUrl = process.env.GAS_WEBHOOK_URL;
  const gasSecret = process.env.GAS_SECRET;

  if (!gasWebhookUrl || !gasSecret) {
    return NextResponse.json(
      { error: "Google Sheets webhook is not configured." },
      { status: 500 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createBadRequest("Invalid JSON payload.");
  }

  if (!isOrderRequestInput(body)) {
    return createBadRequest("Invalid order payload.");
  }

  if (!body.items.length) {
    return createBadRequest("Cart is empty.");
  }

  if (body.phone.replace(/\D/g, "").length !== 11) {
    return createBadRequest("Phone number must have 11 digits.");
  }

  const orderId = generateOrderId();
  const createdAt = createOrderCreatedAt();
  const payload = createOrderSheetPayload(body, {
    createdAt,
    orderId,
  });

  const gasResponse = await fetch(gasWebhookUrl, {
    body: JSON.stringify({
      ...payload,
      secret: gasSecret,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const gasResponseText = await gasResponse.text();

  let gasResult: { error?: string; ok?: boolean } | null = null;

  try {
    gasResult = JSON.parse(gasResponseText) as { error?: string; ok?: boolean };
  } catch {
    gasResult = null;
  }

  if (!gasResponse.ok || gasResult?.ok === false) {
    return NextResponse.json(
      {
        error: gasResult?.error ?? "Failed to write order into Google Sheets.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    createdAt: payload.created_at,
    orderId: payload.order_id,
    totalPrice: payload.total_price,
  });
}
