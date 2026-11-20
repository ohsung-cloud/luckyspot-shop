import { DIRECT_SHIPPING_LABEL, DIRECT_SHIPPING_VALUE } from "@/data/address";
import { resolveStoreByCode, resolveStoreByLabel } from "@/features/stores/directory";
import type { StoreRecord } from "@/features/stores/types";

/**
 * 결제 준비(/api/payments/prepare)에서 쓰는 주문 입력 검증.
 *
 * `/api/orders`(입금 안내 방식)와 같은 규칙을 쓴다. 그 라우트는 운영 중이라
 * 손대지 않고, 결제 경로에서만 이 모듈을 쓴다(규칙이 바뀌면 두 곳을 함께 고친다).
 */

export const MAX_ITEMS = 100;
export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_ORDER_TOTAL = 100_000_000;

export type OrderRecipient = {
  address: string;
  name: string;
  phone: string;
  shippingOption: string;
  storeCode: string | null;
  storeName: string | null;
};

export type RecipientResult =
  | { ok: true; recipient: OrderRecipient; store: StoreRecord | null }
  | { message: string; ok: false; status: 400 };

export function readText(value: unknown, min: number, max: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length < min || text.length > max) return null;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) return null;
  return text;
}

export function readItems(value: unknown): { id: string; quantity: number }[] | null {
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

function recipientFromStore(store: StoreRecord): OrderRecipient {
  return {
    address: store.address,
    name: store.ownerName ?? store.label,
    phone: store.phone ? store.phone.replace(/\D/g, "") : "",
    shippingOption: store.label,
    storeCode: store.code,
    storeName: store.label,
  };
}

/**
 * 받는 곳 확정 — 지점 코드가 오면 Supabase 의 지점 정보로 서버가 채운다.
 * 직접 입력(개인 주문)만 클라이언트 값을 검증해서 쓴다.
 */
export async function resolveOrderRecipient(
  candidate: Record<string, unknown>,
): Promise<RecipientResult> {
  const storeCode = readText(candidate.storeCode, 1, 40);
  const shippingOption = readText(candidate.shippingOption, 1, 60);

  if (storeCode && storeCode !== DIRECT_SHIPPING_VALUE) {
    const store = await resolveStoreByCode(storeCode);

    if (!store) {
      return {
        message: "지점 정보를 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.",
        ok: false,
        status: 400,
      };
    }

    return { ok: true, recipient: recipientFromStore(store), store };
  }

  if (
    storeCode !== DIRECT_SHIPPING_VALUE &&
    shippingOption &&
    shippingOption !== DIRECT_SHIPPING_LABEL
  ) {
    const store = await resolveStoreByLabel(shippingOption);

    if (store) return { ok: true, recipient: recipientFromStore(store), store };
  }

  const name = readText(candidate.name, 1, 30);
  const phoneInput = readText(candidate.phone, 9, 20);
  const phone = phoneInput?.replace(/\D/g, "") ?? "";
  const address = readText(candidate.address, 1, 200);

  if (!name || !address || !/^01\d{8,9}$/.test(phone)) {
    return { message: "Invalid order payload", ok: false, status: 400 };
  }

  return {
    ok: true,
    recipient: {
      address,
      name,
      phone,
      shippingOption: shippingOption ?? DIRECT_SHIPPING_LABEL,
      storeCode: null,
      storeName: null,
    },
    store: null,
  };
}
