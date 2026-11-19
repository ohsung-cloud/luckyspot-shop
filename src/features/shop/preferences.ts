"use client";

/**
 * 점주 화면의 기억(브라우저 localStorage) — 서버로 나가지 않는다.
 *
 *  · scale      : 매장 규모(소형·중형·대형). 소모 주기 배지·권장 수량의 기준
 *  · storeCode  : 최근에 쓴 지점. 주문서 "받는 곳"을 미리 채운다
 *  · lastOrder  : 직전 발주(품목·수량). 메인 화면 "직전 발주 그대로 담기" 배너
 *  · pendingReorder : `/orders` 에서 "다시 담기"를 누른 구성. 메인 화면이 이어받아 담는다
 *
 * 주문 자체는 항상 서버(`/api/orders`)가 단가를 다시 계산해 확정한다.
 * 여기 담기는 것은 "무엇을 몇 개 담았는지" 뿐이고, 이름·연락처·주소는 저장하지 않는다.
 */

import { getProductById } from "@/data/products";
import { DEFAULT_STORE_SCALE, isStoreScale, type StoreScale } from "@/data/consumables";

export type ReorderLine = { id: string; quantity: number };

export type LastOrder = {
  orderNumber: string;
  /** ISO 문자열 */
  createdAt: string;
  storeCode: string | null;
  storeName: string | null;
  totalAmount: number;
  /** 담은 수량 합계 */
  count: number;
  items: ReorderLine[];
};

type ShopPrefs = {
  scale: StoreScale;
  storeCode: string | null;
  storeName: string | null;
  lastOrder: LastOrder | null;
};

const PREFS_KEY = "ls_shop_prefs_v1";
const PENDING_REORDER_KEY = "ls_shop_pending_reorder_v1";
const MAX_LINES = 100;
const MAX_QUANTITY = 999;

const EMPTY_PREFS: ShopPrefs = {
  scale: DEFAULT_STORE_SCALE,
  storeCode: null,
  storeName: null,
  lastOrder: null,
};

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readPrefs(): ShopPrefs {
  if (!hasStorage()) return EMPTY_PREFS;

  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return EMPTY_PREFS;

    const parsed = JSON.parse(raw) as Partial<ShopPrefs> | null;
    if (!parsed || typeof parsed !== "object") return EMPTY_PREFS;

    return {
      scale: isStoreScale(parsed.scale) ? parsed.scale : EMPTY_PREFS.scale,
      storeCode: typeof parsed.storeCode === "string" ? parsed.storeCode : null,
      storeName: typeof parsed.storeName === "string" ? parsed.storeName : null,
      lastOrder: normalizeLastOrder(parsed.lastOrder),
    };
  } catch {
    return EMPTY_PREFS;
  }
}

function writePrefs(patch: Partial<ShopPrefs>) {
  if (!hasStorage()) return;

  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    // 저장 공간이 없거나 막힌 브라우저(시크릿 모드)에서는 조용히 넘어간다.
  }
}

function normalizeLastOrder(value: unknown): LastOrder | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<LastOrder>;
  const items = normalizeLines(candidate.items);
  const orderNumber = typeof candidate.orderNumber === "string" ? candidate.orderNumber : "";

  if (!orderNumber || !items.length) return null;

  return {
    orderNumber,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date().toISOString(),
    storeCode: typeof candidate.storeCode === "string" ? candidate.storeCode : null,
    storeName: typeof candidate.storeName === "string" ? candidate.storeName : null,
    totalAmount: Number.isFinite(candidate.totalAmount) ? Number(candidate.totalAmount) : 0,
    count: items.reduce((sum, line) => sum + line.quantity, 0),
    items,
  };
}

/** 지금 카탈로그에 있는 품목만 남기고 수량을 다듬는다. */
export function normalizeLines(value: unknown): ReorderLine[] {
  if (!Array.isArray(value)) return [];

  const merged = new Map<string, number>();

  for (const raw of value.slice(0, MAX_LINES * 2)) {
    if (!raw || typeof raw !== "object") continue;

    const candidate = raw as { id?: unknown; quantity?: unknown };
    const id = typeof candidate.id === "string" ? candidate.id : "";

    if (!id || !getProductById(id)) continue;

    const quantity = Number(candidate.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) continue;

    const next = Math.min(MAX_QUANTITY, Math.round(quantity));
    merged.set(id, Math.min(MAX_QUANTITY, (merged.get(id) ?? 0) + next));
  }

  return Array.from(merged, ([id, quantity]) => ({ id, quantity })).slice(0, MAX_LINES);
}

export function readStoreScale(): StoreScale {
  return readPrefs().scale;
}

export function writeStoreScale(scale: StoreScale) {
  writePrefs({ scale });
}

export function readRecentStore(): { code: string; label: string } | null {
  const prefs = readPrefs();
  if (!prefs.storeCode) return null;

  return { code: prefs.storeCode, label: prefs.storeName ?? prefs.storeCode };
}

export function writeRecentStore(store: { code: string; label: string } | null) {
  writePrefs(store ? { storeCode: store.code, storeName: store.label } : { storeCode: null, storeName: null });
}

export function readLastOrder(): LastOrder | null {
  return readPrefs().lastOrder;
}

export function writeLastOrder(order: LastOrder) {
  const items = normalizeLines(order.items);
  if (!items.length) return;

  const patch: Partial<ShopPrefs> = {
    lastOrder: {
      ...order,
      items,
      count: items.reduce((sum, line) => sum + line.quantity, 0),
    },
  };

  // 주문한 지점도 함께 기억한다 — 다음 주문서의 "받는 곳"을 미리 채우는 값이다.
  if (order.storeCode) {
    patch.storeCode = order.storeCode;
    patch.storeName = order.storeName ?? null;
  }

  writePrefs(patch);
}

/** `/orders` → 메인 이동 사이에 구성만 넘긴다(주소창·서버에 개인정보 없음). */
export function savePendingReorder(items: ReorderLine[], store: { code: string; label: string } | null) {
  const lines = normalizeLines(items);
  if (!lines.length || !hasStorage()) return false;

  try {
    window.localStorage.setItem(
      PENDING_REORDER_KEY,
      JSON.stringify({
        items: lines,
        storeCode: store?.code ?? null,
        storeName: store?.label ?? null,
        savedAt: new Date().toISOString(),
      }),
    );

    if (store) writeRecentStore(store);

    return true;
  } catch {
    return false;
  }
}

export function takePendingReorder(): {
  items: ReorderLine[];
  store: { code: string; label: string } | null;
} | null {
  if (!hasStorage()) return null;

  try {
    const raw = window.localStorage.getItem(PENDING_REORDER_KEY);
    if (!raw) return null;

    window.localStorage.removeItem(PENDING_REORDER_KEY);

    const parsed = JSON.parse(raw) as {
      items?: unknown;
      storeCode?: unknown;
      storeName?: unknown;
    } | null;

    const items = normalizeLines(parsed?.items);
    if (!items.length) return null;

    const storeCode = typeof parsed?.storeCode === "string" ? parsed.storeCode : "";
    const storeName = typeof parsed?.storeName === "string" ? parsed.storeName : "";

    return {
      items,
      store: storeCode ? { code: storeCode, label: storeName || storeCode } : null,
    };
  } catch {
    return null;
  }
}

export function clearPendingReorder() {
  if (!hasStorage()) return;

  try {
    window.localStorage.removeItem(PENDING_REORDER_KEY);
  } catch {
    // 무시
  }
}
