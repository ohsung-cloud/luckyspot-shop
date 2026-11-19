"use client";

import { useMemo } from "react";

import { formatPrice } from "@/data/products";
import { cartCount, cartTotal, resolveCart, useCartStore } from "@/stores/cartStore";

export default function CartBar({ onOpen }: { onOpen: () => void }) {
  const lines = useCartStore((state) => state.lines);
  const entries = useMemo(() => resolveCart(lines), [lines]);
  const count = cartCount(entries);
  const total = cartTotal(entries);
  const isEmpty = count === 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 lg:px-5">
      <div className="pointer-events-auto mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 rounded-[18px] bg-[#0F1412] px-3.5 py-2.5 shadow-[0_18px_40px_-12px_rgba(15,20,18,0.55)]">
        <div className="min-w-0 pl-1">
          <p className="text-[10.5px] font-medium text-[#9AA39C]">
            장바구니 <span className="text-white">{count}</span>개 · VAT 포함
          </p>
          <p className="mt-0.5 text-[18px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-white">
            {formatPrice(total)}
          </p>
        </div>

        <button
          className="ls-focus h-11 shrink-0 rounded-[12px] bg-[#1DFF26] px-5 text-[14px] font-semibold text-[#0F1412] transition-colors hover:bg-[#0FE01B] disabled:bg-[#2A332E] disabled:text-[#7C867E]"
          disabled={isEmpty}
          onClick={onOpen}
          type="button"
        >
          {isEmpty ? "품목을 담아주세요" : "주문하기"}
        </button>
      </div>
    </div>
  );
}
