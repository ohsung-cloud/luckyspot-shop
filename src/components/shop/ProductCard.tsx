"use client";

import { formatPrice, type ShopProduct } from "@/data/products";
import { useCartStore } from "@/stores/cartStore";
import ProductThumb from "./ProductThumb";
import QuantityStepper from "./QuantityStepper";

/** 규격에 이미 들어 있는 단위는 두 번 쓰지 않는다. (예: "1kg" + "1kg" → "1kg") */
function formatSpec(spec: string, unit: string) {
  return spec.includes(unit) ? spec : `${spec} · ${unit}`;
}

export default function ProductCard({
  product,
  categoryKey,
  quantity,
}: {
  product: ShopProduct;
  categoryKey: string;
  quantity: number;
}) {
  const addItem = useCartStore((state) => state.addItem);
  const setQuantity = useCartStore((state) => state.setQuantity);

  return (
    <article className="flex flex-col rounded-[16px] border border-[var(--ls-line)] bg-white p-2.5 transition-colors hover:border-[#0F1412]/40">
      <ProductThumb categoryKey={categoryKey} product={product} />

      <div className="mt-2.5 flex flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1">
          {product.tag ? (
            <span className="rounded-[4px] bg-[#0F1412] px-1.5 py-[2px] text-[9.5px] font-semibold leading-[1.4] text-[#1DFF26]">
              {product.tag}
            </span>
          ) : null}
          <span className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-[var(--ls-muted)]">
            {product.vendor}
          </span>
        </div>

        <h3 className="mt-1 break-keep text-[13.5px] font-semibold leading-[1.35] tracking-[-0.02em] text-[#0F1412]">
          {product.name}
        </h3>
        <p className="mt-0.5 text-[11px] leading-[1.45] text-[var(--ls-muted)]">
          {formatSpec(product.spec, product.unit)}
        </p>

        <p className="mt-1.5 text-[14.5px] font-semibold leading-none tracking-[-0.02em] text-[#0F1412]">
          {formatPrice(product.price)}
        </p>

        <div className="mt-2.5">
          {quantity > 0 ? (
            <QuantityStepper
              label={product.name}
              onChange={(next) => setQuantity(product.id, next)}
              quantity={quantity}
            />
          ) : (
            <button
              className="ls-focus flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-[var(--ls-line-strong)] text-[12px] font-semibold text-[#0F1412] transition-colors hover:border-[#0F1412] hover:bg-[#0F1412] hover:text-[#1DFF26]"
              onClick={() => addItem(product.id, 1)}
              type="button"
            >
              <svg aria-hidden height="11" viewBox="0 0 12 12" width="11">
                <path
                  d="M6 1v10M1 6h10"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.6"
                />
              </svg>
              담기
            </button>
          )}
        </div>

        {product.note ? (
          <p className="mt-2 border-t border-dashed border-[var(--ls-line)] pt-1.5 text-[10px] leading-[1.5] text-[var(--ls-muted)]">
            {product.note}
          </p>
        ) : null}
      </div>
    </article>
  );
}
