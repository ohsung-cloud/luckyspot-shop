"use client";

import { create } from "zustand";

import { getProductById, type ShopProduct } from "@/data/products";

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

export const useCartStore = create<CartState>((set) => ({
  lines: [],

  addItem: (productId, quantity = 1) =>
    set((state) => {
      if (!getProductById(productId)) return state;

      const existing = state.lines.find((line) => line.id === productId);

      if (!existing) {
        return { lines: [...state.lines, { id: productId, quantity: clamp(quantity) }] };
      }

      return {
        lines: state.lines.map((line) =>
          line.id === productId
            ? { ...line, quantity: clamp(line.quantity + quantity) }
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
              line.id === productId ? { ...line, quantity: clamp(quantity) } : line,
            ),
    })),

  increase: (productId) =>
    set((state) => ({
      lines: state.lines.map((line) =>
        line.id === productId ? { ...line, quantity: clamp(line.quantity + 1) } : line,
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
            quantity: clamp(next[index].quantity + item.quantity),
          };
        } else {
          next.push({ id: item.id, quantity: clamp(item.quantity) });
        }
      }

      return { lines: next };
    }),

  clearItems: () => set({ lines: [] }),
}));

function clamp(quantity: number) {
  return Math.min(MAX_QUANTITY, Math.max(1, Math.round(quantity)));
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
