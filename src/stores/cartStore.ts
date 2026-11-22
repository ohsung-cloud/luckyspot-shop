"use client";

import { create } from "zustand";

import {
  clampOrderQuantity,
  getProductById,
  normalizeOrderLine,
  type ShopProduct,
} from "@/data/products";

export type CartLine = {
  id: string;
  quantity: number;
};

type CartState = {
  lines: CartLine[];
  addItem: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  increase: (productId: string) => void;
  decrease: (productId: string) => void;
  removeItem: (productId: string) => void;
  addBundle: (items: { id: string; quantity: number }[]) => void;
  clearItems: () => void;
};

const MAX_QUANTITY = 999;
/**
 * 장바구니는 브라우저에 남긴다.
 * 토스 결제창은 successUrl/failUrl 로 페이지를 이동시키므로, 이동해도 담은 품목이
 * 그대로 있어야 결제 실패 후 다시 시도할 수 있다. 남기는 값은 품목 id·수량뿐이다.
 */
const CART_STORAGE_KEY = "ls_cart_v1";
let persistenceInstalled = false;

function readStoredLines(): CartLine[] {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const merged = new Map<string, number>();

    for (const value of parsed.slice(0, 300)) {
      if (!value || typeof value !== "object") continue;

      const candidate = value as { id?: unknown; quantity?: unknown };
      const id = typeof candidate.id === "string" ? candidate.id : "";
      const quantity = Number(candidate.quantity);

      if (!id || !Number.isFinite(quantity) || quantity < 1) continue;

      // 박스 이전 원두(1봉·3박스 상품)도 지금의 박스 수량으로 옮겨 담는다.
      const line = normalizeOrderLine({ id, quantity });

      if (!line) continue;

      merged.set(line.id, clamp(line.id, (merged.get(line.id) ?? 0) + line.quantity));
    }

    return Array.from(merged, ([id, quantity]) => ({ id, quantity }));
  } catch {
    return [];
  }
}

function writeLines(lines: CartLine[]) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;

  try {
    if (!lines.length) {
      window.localStorage.removeItem(CART_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // 저장 공간이 없으면 이번 방문 동안만 유지한다.
  }
}

/**
 * 저장된 장바구니를 한 번 불러오고, 이후 변화를 계속 저장한다.
 * (결제창에서 돌아왔을 때 품목이 살아 있게 하는 장치)
 */
export function hydrateCart() {
  if (typeof window === "undefined") return;

  if (!persistenceInstalled) {
    persistenceInstalled = true;
    useCartStore.subscribe((state) => writeLines(state.lines));
  }

  if (useCartStore.getState().lines.length > 0) return;

  const stored = readStoredLines();

  if (stored.length) useCartStore.setState({ lines: stored });
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],

  addItem: (productId, quantity = 1) =>
    set((state) => {
      if (!getProductById(productId)) return state;

      const existing = state.lines.find((line) => line.id === productId);

      if (!existing) {
        return { lines: [...state.lines, { id: productId, quantity: clamp(productId, quantity) }] };
      }

      return {
        lines: state.lines.map((line) =>
          line.id === productId
            ? { ...line, quantity: clamp(productId, line.quantity + quantity) }
            : line,
        ),
      };
    }),

  setQuantity: (productId, quantity) =>
    set((state) => ({
      lines:
        quantity <= 0
          ? state.lines.filter((line) => line.id !== productId)
          : state.lines.map((line) =>
              line.id === productId ? { ...line, quantity: clamp(productId, quantity) } : line,
            ),
    })),

  increase: (productId) =>
    set((state) => ({
      lines: state.lines.map((line) =>
        line.id === productId ? { ...line, quantity: clamp(productId, line.quantity + 1) } : line,
      ),
    })),

  decrease: (productId) =>
    set((state) => ({
      lines: state.lines
        .map((line) =>
          line.id === productId ? { ...line, quantity: line.quantity - 1 } : line,
        )
        .filter((line) => line.quantity > 0),
    })),

  removeItem: (productId) =>
    set((state) => ({ lines: state.lines.filter((line) => line.id !== productId) })),

  addBundle: (items) =>
    set((state) => {
      const next = [...state.lines];

      for (const item of items) {
        if (!getProductById(item.id)) continue;

        const index = next.findIndex((line) => line.id === item.id);

        if (index >= 0) {
          next[index] = {
            ...next[index],
            quantity: clamp(item.id, next[index].quantity + item.quantity),
          };
        } else {
          next.push({ id: item.id, quantity: clamp(item.id, item.quantity) });
        }
      }

      return { lines: next };
    }),

  clearItems: () => set({ lines: [] }),
}));

/** 품목별 허용 범위로 맞춘다(원두는 1~3박스, 나머지는 1~999개). */
function clamp(productId: string, quantity: number) {
  return Math.min(MAX_QUANTITY, clampOrderQuantity(productId, quantity));
}

export type CartEntry = {
  product: ShopProduct;
  quantity: number;
  amount: number;
};

export function resolveCart(lines: CartLine[]): CartEntry[] {
  return lines.flatMap((line) => {
    const product = getProductById(line.id);

    return product
      ? [{ product, quantity: line.quantity, amount: product.price * line.quantity }]
      : [];
  });
}

export function cartTotal(entries: CartEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.amount, 0);
}

export function cartCount(entries: CartEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.quantity, 0);
}
