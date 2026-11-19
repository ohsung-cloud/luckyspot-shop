import { formatPrice, getProductById } from "@/data/products";

const ORDER_ID_RANDOM_DIGITS = 3;
const ORDER_ID_SUFFIX_LENGTH = 1;
const ORDER_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export const ORDER_BANK_NAME = "카카오뱅크";
export const ORDER_ACCOUNT_NUMBER = "3333-10-7086641";
export const ORDER_SUPPORT_PHONE = "1551-7157";
export const ORDER_REQUEST_SHEET_NAME = "order_requests";

/** 클라이언트가 보내는 최소 정보 — 단가는 서버가 카탈로그에서 다시 계산한다. */
export type OrderItemInput = {
  id: string;
  quantity: number;
};

export type OrderLine = {
  id: string;
  name: string;
  spec: string;
  unit: string;
  vendor: string;
  price: number;
  quantity: number;
  amount: number;
};

export type OrderRequestInput = {
  address: string;
  items: OrderLine[];
  name: string;
  phone: string;
  shippingOption: string;
};

export type OrderSheetPayload = {
  address: string;
  created_at: string;
  fulfillment_type: string;
  item_text: string;
  items_json: string;
  name: string;
  order_id: string;
  phone: string;
  pickup_location: string;
  total_price: number;
};

function padNumber(value: number) {
  return value.toString().padStart(2, "0");
}

function createDateSegment(date: Date) {
  const year = date.getFullYear().toString().slice(-2);
  const month = padNumber(date.getMonth() + 1);
  const day = padNumber(date.getDate());

  return `${year}${month}${day}`;
}

function createRandomDigits(length: number) {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(length);

    cryptoApi.getRandomValues(values);

    return Array.from(values, (value) => (value % 10).toString()).join("");
  }

  return Array.from({ length }, () => Math.floor(Math.random() * 10).toString()).join("");
}

function createUniqueSuffix(length: number) {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(length);

    cryptoApi.getRandomValues(values);

    return Array.from(
      values,
      (value) => ORDER_ID_ALPHABET[value % ORDER_ID_ALPHABET.length],
    ).join("");
  }

  return Array.from(
    { length },
    () => ORDER_ID_ALPHABET[Math.floor(Math.random() * ORDER_ID_ALPHABET.length)],
  ).join("");
}

export function generateOrderId(date = new Date()) {
  const dateSegment = createDateSegment(date);
  const randomDigits = createRandomDigits(ORDER_ID_RANDOM_DIGITS);
  const uniqueSuffix = createUniqueSuffix(ORDER_ID_SUFFIX_LENGTH);

  return `${dateSegment}-${randomDigits}${uniqueSuffix}`;
}

export function createOrderCreatedAt(date = new Date()) {
  return date.toISOString();
}

function resolveFulfillmentFields(shippingOption: string) {
  switch (shippingOption) {
    case "서울 직배송":
      return { fulfillmentType: "direct_delivery", pickupLocation: "서울" };
    case "경기/인천 직배송":
      return { fulfillmentType: "direct_delivery", pickupLocation: "경기/인천" };
    case "택배 배송":
      return { fulfillmentType: "parcel_delivery", pickupLocation: "" };
    default:
      return { fulfillmentType: "custom_address", pickupLocation: shippingOption };
  }
}

/** 품목 id·수량만 받아 카탈로그 단가로 주문 라인을 만든다. 없는 품목은 라인에서 빠진다. */
export function buildOrderLines(items: OrderItemInput[]): OrderLine[] {
  return items.flatMap((item) => {
    const product = getProductById(item.id);

    if (!product) return [];

    const quantity = Math.min(999, Math.max(1, Math.round(item.quantity)));

    return [
      {
        id: product.id,
        name: product.name,
        spec: product.spec,
        unit: product.unit,
        vendor: product.vendor,
        price: product.price,
        quantity,
        amount: product.price * quantity,
      },
    ];
  });
}

export function createOrderItemText(items: OrderLine[]) {
  return items
    .map((item) => `${item.name} x${item.quantity} (${formatPrice(item.price)})`)
    .join(" | ");
}

export function calculateOrderTotalPrice(items: OrderLine[]) {
  return items.reduce((total, item) => total + item.amount, 0);
}

export function createOrderSheetPayload(
  input: OrderRequestInput,
  options?: { createdAt?: string; orderId?: string },
): OrderSheetPayload {
  const createdAt = options?.createdAt ?? createOrderCreatedAt();
  const orderId = options?.orderId ?? generateOrderId();
  const totalPrice = calculateOrderTotalPrice(input.items);
  const fulfillment = resolveFulfillmentFields(input.shippingOption);

  return {
    address: input.address.trim(),
    created_at: createdAt,
    fulfillment_type: fulfillment.fulfillmentType,
    item_text: createOrderItemText(input.items),
    items_json: JSON.stringify(input.items),
    name: input.name.trim(),
    order_id: orderId,
    phone: input.phone.trim(),
    pickup_location: fulfillment.pickupLocation,
    total_price: totalPrice,
  };
}
