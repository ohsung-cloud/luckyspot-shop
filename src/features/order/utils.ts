import { clampOrderQuantity, formatPrice, getProductById } from "@/data/products";
import { formatBusinessNo, type TaxInvoiceRequest } from "@/features/tax-invoice";

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
  /** 세금계산서 발급 요청 — 없으면 발급 신청 안 함으로 본다 */
  taxInvoice?: TaxInvoiceRequest;
};

/**
 * 구글시트(order_requests)·Supabase 적재에 함께 넘기는 주문서.
 * 세금계산서 필드는 시트 스크립트가 모르는 상태여도 무시되고, 스크립트를 새로 배포하면
 * 그대로 열로 쌓인다(필수 필드 검증에 넣지 않았다).
 */
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
  tax_business_item: string;
  tax_business_name: string;
  tax_business_no: string;
  tax_business_type: string;
  tax_ceo_name: string;
  tax_email: string;
  tax_invoice_requested: boolean;
  tax_invoice_text: string;
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

    // 원두는 1~3박스로 맞춘다(클라이언트를 거치지 않은 요청도 같은 규칙).
    const quantity = clampOrderQuantity(product.id, item.quantity);

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
  const tax = input.taxInvoice;
  const taxRequested = tax?.requested === true;

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
    tax_business_item: taxRequested ? tax?.businessItem?.trim() ?? "" : "",
    tax_business_name: taxRequested ? tax?.businessName?.trim() ?? "" : "",
    tax_business_no: taxRequested ? tax?.businessNo?.trim() ?? "" : "",
    tax_business_type: taxRequested ? tax?.businessType?.trim() ?? "" : "",
    tax_ceo_name: taxRequested ? tax?.ceoName?.trim() ?? "" : "",
    tax_email: taxRequested ? tax?.email?.trim() ?? "" : "",
    tax_invoice_requested: taxRequested,
    tax_invoice_text: taxRequested
      ? [
          tax?.businessName?.trim() ?? "",
          formatBusinessNo(tax?.businessNo ?? ""),
          tax?.ceoName?.trim() ?? "",
          tax?.email?.trim() ?? "",
        ]
          .filter(Boolean)
          .join(" · ")
      : "",
    total_price: totalPrice,
  };
}
