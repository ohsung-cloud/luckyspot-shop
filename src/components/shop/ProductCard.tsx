"use client";

import { BEAN_BAGS_PER_BOX, beanBoxesToBags, formatPrice, getOrderLimits, type ShopProduct } from "@/data/products";
import {
  coverageLabel,
  cycleBadge,
  daysCovered,
  getConsumptionGuide,
  type StoreScale,
} from "@/data/consumables";
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
  scale,
}: {
  product: ShopProduct;
  categoryKey: string;
  quantity: number;
  scale: StoreScale;
}) {
  const addItem = useCartStore((state) => state.addItem);
  const setQuantity = useCartStore((state) => state.setQuantity);

  const guide = getConsumptionGuide(product.id);
  const badge = cycleBadge(product.id, scale);
  const coverage = coverageLabel(daysCovered(product.id, quantity, scale));
  const limits = getOrderLimits(product.id);
  const isBoxProduct = limits.unit === "박스";

  return (
    <article className="flex flex-col rounded-[20px] bg-white p-3 shadow-[0_1px_2px_rgba(15,20,18,0.04)] transition-shadow hover:shadow-[0_6px_20px_-12px_rgba(15,20,18,0.28)]">
      <ProductThumb categoryKey={categoryKey} product={product} />

      <div className="mt-2.5 flex flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1">
          {product.tag ? (
            <span className="rounded-full bg-[#0F1412] px-2 py-[3px] text-[10.5px] font-bold leading-none text-[#1DFF26]">
              {product.tag}
            </span>
          ) : null}
          {badge ? (
            <span className="rounded-full bg-[#EDFBEF] px-2 py-[3px] text-[10.5px] font-bold leading-none text-[#0B5C2A]">
              {badge}
            </span>
          ) : null}
          <span className="text-[10.5px] font-medium text-[#98A29B]">{product.vendor}</span>
        </div>

        <h3 className="mt-1.5 break-keep text-[14.5px] font-bold leading-[1.35] tracking-[-0.015em] text-[#0F1412]">
          {product.name}
        </h3>
        <p className="mt-0.5 text-[12px] leading-[1.45] text-[#8B948D]">
          {formatSpec(product.spec, product.unit)}
        </p>

        <p className="mt-1.5 text-[17px] font-bold leading-none tracking-[0.02em] tabular-nums text-[#0F1412]">
          {formatPrice(product.price)}
        </p>

        <div className="mt-2.5">
          {quantity > 0 ? (
            <div>
              <QuantityStepper
                label={product.name}
                max={limits.max}
                min={limits.min}
                onChange={(next) => setQuantity(product.id, next)}
                quantity={quantity}
              />
              {isBoxProduct ? (
                <p className="mt-1.5 text-[11.5px] font-bold tracking-[0.01em] text-[#0B5C2A]">
                  {quantity >= limits.max
                    ? `최대 ${limits.max}박스예요`
                    : `${quantity}박스 · ${beanBoxesToBags(quantity)}봉 담김`}
                </p>
              ) : coverage ? (
                <p className="mt-1.5 text-[11.5px] font-bold tracking-[0.01em] text-[#0B5C2A]">
                  {coverage} <span className="font-medium text-[#8B948D]">사용</span>
                </p>
              ) : null}
            </div>
          ) : (
            <button
              className="ls-focus flex h-11 w-full items-center justify-center gap-1.5 rounded-[12px] bg-[#F2F4F6] text-[13px] font-bold text-[#0F1412] transition-colors hover:bg-[#0F1412] hover:text-[#1DFF26]"
              onClick={() => addItem(product.id, limits.min)}
              type="button"
            >
              <svg aria-hidden height="11" viewBox="0 0 12 12" width="11">
                <path
                  d="M6 1v10M1 6h10"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                />
              </svg>
              담기
            </button>
          )}
        </div>

        {guide ? (
          <p className="mt-2 text-[11.5px] leading-[1.55] text-[#98A29B]">{guide.reason}</p>
        ) : product.note ? (
          <p className="mt-2 text-[11.5px] leading-[1.55] text-[#98A29B]">{product.note}</p>
        ) : null}
      </div>
    </article>
  );
}
