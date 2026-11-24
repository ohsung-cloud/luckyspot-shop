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

  // 원두만 담았으면 "3개"가 아니라 "3박스"로 보여준다.
  const countUnit = entries.length > 0 && entries.every((entry) => entry.product.unit === "1박스")
    ? "박스"
    : "개";

  // 빈 장바구니에는 띠를 띄우지 않는다 — 빠른 발주 버튼을 가리지 않고, 담을 것이 없다는 것도 이미 안다.
  if (isEmpty) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 sm:px-6">
      <div className="pointer-events-auto mx-auto flex w-full max-w-[728px] items-center justify-between gap-3 rounded-[20px] bg-[#0F1412] px-4 py-3 shadow-[0_18px_40px_-14px_rgba(15,20,18,0.55)]">
        <div className="min-w-0 pl-1">
          <p className="text-[11px] font-medium text-[#9AA39C]">
            장바구니 <span className="text-white">{count}</span>
            {countUnit} · VAT 포함
          </p>
          <p className="mt-1 text-[19px] font-bold leading-none tabular-nums tracking-[0.02em] text-white">
            {formatPrice(total)}
          </p>
        </div>

        <button
          className="ls-focus h-11 shrink-0 rounded-[14px] bg-[#1DFF26] px-5 text-[14px] font-bold text-[#0F1412] transition-colors hover:bg-[#3BE93F] disabled:bg-[#2A332E] disabled:text-[#7C867E]"
          disabled={isEmpty}
          onClick={onOpen}
          type="button"
        >
          주문하기
        </button>
      </div>
    </div>
  );
}
