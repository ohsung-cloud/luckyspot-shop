"use client";

/**
 * 결제 직전에 브라우저에 남기는 "주문 의도" — 결제창에서 돌아온 뒤 서버에 그대로 넘긴다.
 *
 * 남기는 값
 *   주문번호 · 서명 토큰 · 금액 · 결제수단 · 품목(id·수량) · 받는 곳(이름·연락처·주소·지점)
 *
 * 왜 브라우저에 두나
 *   토스 결제창은 successUrl 로 페이지를 이동시킨다. 이동해도 남아 있어야 하는 값이라
 *   localStorage(같은 사이트의 모든 탭이 공유)에 주문번호별로 둔다. 서버로는 결제 확인 때 한 번만 간다.
 *   1시간이 지나면 버린다. 결제가 끝나면 바로 지운다.
 */

const STORAGE_KEY = "ls_payment_intent_v1";
const TTL_MS = 60 * 60 * 1000;
const MAX_ITEMS = 5;

export type StoredRecipient = {
  address: string;
  name: string;
  phone: string;
  shippingOption: string;
  storeCode: string | null;
  storeName: string | null;
};

export type StoredPaymentIntent = {
  amount: number;
  createdAt: string;
  items: { id: string; quantity: number }[];
  /** 결제수단은 토스 결제창에서 고르므로 여기서는 참고값만 남긴다 */
  method: string;
  orderId: string;
  orderName: string;
  recipient: StoredRecipient;
  storeName: string | null;
  token: string;
};

type IntentMap = Record<string, StoredPaymentIntent>;

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readMap(): IntentMap {
  if (!hasStorage()) return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const cutoff = Date.now() - TTL_MS;
    const map: IntentMap = {};

    for (const [orderId, value] of Object.entries(parsed as IntentMap)) {
      if (!value || typeof value !== "object") continue;
      if (typeof value.token !== "string" || typeof value.amount !== "number") continue;
      if (!(Number(value.createdAt ? new Date(value.createdAt).getTime() : 0) > cutoff)) continue;

      map[orderId] = value;
    }

    return map;
  } catch {
    return {};
  }
}

function writeMap(map: IntentMap) {
  if (!hasStorage()) return;

  const entries = Object.entries(map)
    .sort(([, left], [, right]) => (left.createdAt < right.createdAt ? 1 : -1))
    .slice(0, MAX_ITEMS);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // 저장 공간이 없으면 결제 확인 단계에서 안내 문구로 떨어진다.
  }
}

export function savePaymentIntent(intent: StoredPaymentIntent) {
  const map = readMap();
  map[intent.orderId] = intent;
  writeMap(map);
}

export function readPaymentIntent(orderId: string | null | undefined): StoredPaymentIntent | null {
  if (!orderId) return null;

  const map = readMap();

  return map[orderId] ?? null;
}

/* 결제 결과 캐시 — 성공 화면을 새로고침해도 같은 결과를 보여준다(승인 API를 다시 부르지 않는다). */
const RESULT_KEY = "ls_payment_result_v1";

export type StoredPaymentResult = Record<string, unknown> & { orderId: string };

function readResultMap(): Record<string, { at: string; value: StoredPaymentResult }> {
  if (!hasStorage()) return {};

  try {
    const raw = window.localStorage.getItem(RESULT_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return parsed as Record<string, { at: string; value: StoredPaymentResult }>;
  } catch {
    return {};
  }
}

export function savePaymentResult(orderId: string, value: StoredPaymentResult) {
  if (!hasStorage()) return;

  const map = readResultMap();
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;

  for (const [key, entry] of Object.entries(map)) {
    if (!entry || !(new Date(entry.at).getTime() > cutoff)) delete map[key];
  }

  map[orderId] = { at: new Date().toISOString(), value };

  try {
    window.localStorage.setItem(RESULT_KEY, JSON.stringify(Object.fromEntries(Object.entries(map).slice(-5))));
  } catch {
    // 저장 공간이 없으면 새로고침 때 승인 API로 다시 확인한다(멱등).
  }
}

export function readPaymentResult(orderId: string | null | undefined): StoredPaymentResult | null {
  if (!orderId) return null;

  return readResultMap()[orderId]?.value ?? null;
}

export function clearPaymentIntent(orderId: string | null | undefined) {
  if (!orderId) return;

  const map = readMap();
  delete map[orderId];
  writeMap(map);
}
