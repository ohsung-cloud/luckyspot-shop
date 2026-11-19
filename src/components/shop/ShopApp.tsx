"use client";

import { useMemo, useState } from "react";
import { useToast } from "@wanteddev/wds";

import {
  bundleItemCount,
  bundlePrice,
  formatPrice,
  shopBundles,
  shopCategories,
} from "@/data/products";
import { useCartStore, type CartLine } from "@/stores/cartStore";
import CartBar from "./CartBar";
import OrderSheet from "./OrderSheet";
import ProductCard from "./ProductCard";

type FilterKey = "all" | string;

export default function ShopApp() {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<FilterKey>("all");
  const [sheetOpen, setSheetOpen] = useState(false);

  const lines = useCartStore((state) => state.lines);
  const addBundle = useCartStore((state) => state.addBundle);

  const quantityById = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((line: CartLine) => map.set(line.id, line.quantity));
    return map;
  }, [lines]);

  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, " ");

  const visibleCategories = useMemo(() => {
    const categories =
      activeCategory === "all"
        ? shopCategories
        : shopCategories.filter((category) => category.key === activeCategory);

    if (!normalizedQuery) return categories;

    return categories
      .map((category) => ({
        ...category,
        products: category.products.filter((product) =>
          `${product.name} ${product.spec} ${product.vendor} ${product.tag ?? ""}`
            .toLowerCase()
            .includes(normalizedQuery),
        ),
      }))
      .filter((category) => category.products.length > 0);
  }, [activeCategory, normalizedQuery]);

  const resultCount = visibleCategories.reduce(
    (sum, category) => sum + category.products.length,
    0,
  );

  const showBundles = !normalizedQuery && activeCategory === "all";

  const handleAddBundle = (bundleId: string) => {
    const bundle = shopBundles.find((item) => item.id === bundleId);
    if (!bundle) return;

    addBundle(bundle.items);
    toast({
      content: `${bundle.name} ${bundleItemCount(bundle)}개를 담았습니다`,
      duration: "short",
      variant: "normal",
    });
  };

  return (
    <>
      <section className="mx-auto w-full max-w-[1200px] px-4 pt-5 sm:px-6" id="catalog">
        <div className="sticky top-0 z-30 -mx-4 bg-[#F4F5F6]/95 px-4 pb-2 pt-2 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ls-muted)]"
            >
              <svg height="16" viewBox="0 0 18 18" width="16">
                <circle cx="8" cy="8" fill="none" r="5.2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M12 12l4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
              </svg>
            </span>
            <input
              aria-label="품목 검색"
              className="ls-focus h-12 w-full rounded-[12px] border border-[var(--ls-line-strong)] bg-white pl-10 pr-10 text-[13.5px] text-[#0F1412] outline-none placeholder:text-[var(--ls-muted)]"
              inputMode="search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="품목 검색 — 원두, 초코 파우더, 컵리드…"
              type="search"
              value={query}
            />
            {query ? (
              <button
                aria-label="검색어 지우기"
                className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-[#F0F2F1] text-[var(--ls-muted)]"
                onClick={() => setQuery("")}
                type="button"
              >
                <svg height="10" viewBox="0 0 10 10" width="10">
                  <path
                    d="M1 1l8 8M9 1L1 9"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.6"
                  />
                </svg>
              </button>
            ) : null}
          </div>

          <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
            <CategoryChip
              active={activeCategory === "all"}
              count={shopCategories.reduce((sum, category) => sum + category.products.length, 0)}
              label="전체"
              onClick={() => setActiveCategory("all")}
            />
            {shopCategories.map((category) => (
              <CategoryChip
                active={activeCategory === category.key}
                count={category.products.length}
                key={category.key}
                label={category.label}
                onClick={() => setActiveCategory(category.key)}
              />
            ))}
          </div>
        </div>

        {showBundles ? (
          <section aria-labelledby="bundle-title" className="mt-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="type-eyebrow text-[var(--ls-green-ink)]">QUICK SET</p>
                <h2
                  className="mt-1 text-[19px] font-semibold tracking-[-0.03em] text-[#0F1412]"
                  id="bundle-title"
                >
                  자주 시키는 세트
                </h2>
              </div>
              <p className="pb-1 text-[11px] text-[var(--ls-muted)]">한 번에 담기</p>
            </div>

            <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">
              {shopBundles.map((bundle) => (
                <article
                  className="flex w-[248px] shrink-0 flex-col justify-between rounded-[16px] bg-[#0F1412] p-4 lg:w-auto"
                  key={bundle.id}
                >
                  <div>
                    <span className="inline-flex rounded-[4px] bg-[#1DFF26] px-1.5 py-[2px] text-[9.5px] font-bold leading-[1.5] text-[#0F1412]">
                      {bundle.badge}
                    </span>
                    <h3 className="mt-2 text-[15px] font-semibold leading-[1.35] tracking-[-0.02em] text-white">
                      {bundle.name}
                    </h3>
                    <p className="mt-1.5 text-[11px] leading-[1.55] text-[#9AA39C]">
                      {bundle.description}
                    </p>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-[9.5px] text-[#7C867E]">{bundleItemCount(bundle)}개 구성</p>
                      <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-white">
                        {formatPrice(bundlePrice(bundle))}
                      </p>
                    </div>
                    <button
                      className="ls-focus h-9 rounded-[10px] border border-[#3A463E] px-3 text-[11.5px] font-semibold text-[#1DFF26] transition-colors hover:border-[#1DFF26] hover:bg-[#16231A]"
                      onClick={() => handleAddBundle(bundle.id)}
                      type="button"
                    >
                      세트 담기
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="product-title" className="mt-6">
          <div className="flex items-end justify-between">
            <div>
              <h2
                className="text-[19px] font-semibold tracking-[-0.03em] text-[#0F1412]"
                id="product-title"
              >
                {activeCategory === "all"
                  ? "전체 품목"
                  : shopCategories.find((category) => category.key === activeCategory)?.label}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-[var(--ls-muted)]">
                {activeCategory === "all"
                  ? "원두·파우더·부자재·가구까지 한 번에"
                  : shopCategories.find((category) => category.key === activeCategory)?.note}
              </p>
            </div>
            <p className="shrink-0 pb-0.5 text-[11.5px] tabular-nums text-[var(--ls-muted)]">
              {resultCount}개 · VAT 포함
            </p>
          </div>

          {resultCount === 0 ? (
            <div className="mt-4 rounded-[16px] border border-dashed border-[var(--ls-line-strong)] bg-white px-5 py-12 text-center">
              <p className="text-[14px] font-semibold text-[#0F1412]">찾는 품목이 없어요</p>
              <p className="mt-1 text-[12px] leading-[1.6] text-[var(--ls-muted)]">
                다른 이름으로 검색하거나 전체 카테고리를 확인해 주세요.
                <br />
                발주 목록에 없는 품목은 고객센터로 문의해 주세요.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-7">
              {visibleCategories.map((category) => (
                <div key={category.key}>
                  {normalizedQuery || activeCategory === "all" ? (
                    <div className="mb-2 flex items-center gap-2">
                      <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--ls-muted)]">
                        {category.label}
                      </h3>
                      <span className="h-px flex-1 bg-[var(--ls-line)]" />
                      <span className="text-[11px] tabular-nums text-[var(--ls-muted)]">
                        {category.products.length}
                      </span>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4">
                    {category.products.map((product) => (
                      <ProductCard
                        categoryKey={category.key}
                        key={product.id}
                        product={product}
                        quantity={quantityById.get(product.id) ?? 0}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-[16px] border border-[var(--ls-line)] bg-white px-4 py-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ls-muted)]">
            발주 안내
          </h2>
          <ul className="mt-2 space-y-1 text-[11.5px] leading-[1.7] text-[var(--ls-muted)]">
            <li>· 모든 단가는 부가세 포함 금액입니다. 합계는 공급가액과 부가세로 나눠 확인할 수 있어요.</li>
            <li>· 원두 20,000원/kg, 파우더·농축은 더캐럿 2026-11-19 단가표 기준입니다.</li>
            <li>· 가구·식물·비품은 영등포시장역점 실구매 단가로, 판매처 사정에 따라 달라질 수 있습니다.</li>
            <li>· 주문 후 입금 계좌를 안내해 드리며, 입금 확인 후 출고됩니다.</li>
          </ul>
        </section>
      </section>

      <CartBar onOpen={() => setSheetOpen(true)} />
      <OrderSheet onClose={() => setSheetOpen(false)} open={sheetOpen} />
    </>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`ls-focus flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium transition-colors ${
        active
          ? "bg-[#0F1412] text-[#1DFF26]"
          : "border border-[var(--ls-line-strong)] bg-white text-[#0F1412] hover:border-[#0F1412]"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
      <span
        className={`text-[10.5px] tabular-nums ${active ? "text-[#8CF695]" : "text-[var(--ls-muted)]"}`}
      >
        {count}
      </span>
    </button>
  );
}
