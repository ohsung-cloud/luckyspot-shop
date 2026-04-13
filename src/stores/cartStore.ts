"use client";

import { create } from "zustand";

import type { ShopProduct } from "@/features/shop/data";

type CartState = {
  addItem: (product: ShopProduct) => void;
  clearItems: () => void;
  items: ShopProduct[];
  removeItem: (productId: string) => void;
};

export const useCartStore = create<CartState>((set) => ({
  addItem: (product) =>
    set((state) => {
      if (state.items.some((item) => item.id === product.id)) {
        return state;
      }

      return {
        items: [...state.items, product],
      };
    }),
  clearItems: () => set({ items: [] }),
  items: [],
  removeItem: (productId) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== productId),
    })),
}));

export function selectCartTotalPrice(state: CartState) {
  return state.items.reduce((total, item) => total + item.price, 0);
}
