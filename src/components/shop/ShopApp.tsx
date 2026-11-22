"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@wanteddev/wds";

import {
  bundleItemCount,
  bundlePrice,
  formatPrice,
  getProductById,
  shopBundles,
  shopCategories,
} from "@/data/products";
import {
  cycleBadge,
  DEFAULT_STORE_SCALE,
  essentialItems,
  isEssentialProduct,
  recommendedQuantityLabel,
  storeScaleLabel,
  storeScales,
  type StoreScale,
} from "@/data/consumables";
import {
  readLastOrder,
  readRecentStore,
  readStoreScale,
  takePendingReorder,
  writeStoreScale,
  type LastOrder,
} from "@/features/shop/preferences";
import { useCartStore, type CartLine, hydrateCart } from "@/stores/cartStore";
import CartBar from "./CartBar";
import OrderSheet from "./OrderSheet";
import ProductCard from "./ProductCard";
import QuickBeanOrder from "./QuickBeanOrder";

type FilterKey = "all" | "essential" | string;

const ESSENTIAL_FILTER = "essential";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  day: "numeric",
  month: "numeric",
  timeZone: "Asia/Seoul",
});

function formatOrderDay(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return dateFormatter.format(date);
}

export default function ShopApp({ testMode = false }: { testMode?: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<FilterKey>("all");
  const [scale, setScale] = useState<StoreScale>(DEFAULT_STORE_SCALE);
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const [recentStore, setRecentStore] = useState<{ code: string; label: string } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetStoreCode, setSheetStoreCode] = useState<string | null>(null);
  const [sheetNotice, setSheetNotice] = useState<string | null>(null);

  const lines = useCartStore((state) => state.lines);
  const addBundle = useCartStore((state) => state.addBundle);

  const quantityById = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((line: CartLine) => map.set(line.id, line.quantity));
    return map;
  }, [lines]);

  // 브라우저에 남은 기억(규모·직전 발주·최근 지점)과 /orders 에서 넘어온 구성을 읽는다.
  useEffect(() => {
    // 결제창에서 돌아왔을 때도 담은 품목이 그대로 있도록 먼저 복원한다.
    hydrateCart();

    setScale(readStoreScale());
    setLastOrder(readLastOrder());
    setRecentStore(readRecentStore());

    const params = new URLSearchParams(window.location.search);

    if (params.get("reorder") !== "1") return;

    const pending = takePendingReorder();

    // 주소창에서 reorder 표시를 지워 새로고침해도 같은 구성이 또 담기지 않게 한다.
    router.replace("/", { scroll: false });

    if (!pending) return;

    addBundle(pending.items);
    const count = pending.items.reduce((sum, item) => sum + item.quantity, 0);

    setSheetStoreCode(pending.store?.code ?? null);
    setSheetNotice(`지난 발주 ${pending.items.length}종 ${count}개를 그대로 담았어요. 수량만 확인하세요.`);
    setSheetOpen(true);
  }, [addBundle, router]);

  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, " ");

  const visibleCategories = useMemo(() => {
    let categories =
      activeCategory === "all"
        ? shopCategories
        : activeCategory === ESSENTIAL_FILTER
          ? shopCategories.map((category) => ({
              ...category,
              products: category.products.filter((product) => isEssentialProduct(product.id)),
            }))
          : shopCategories.filter((category) => category.key === activeCategory);

    categories = categories.filter((category) => category.products.length > 0);

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
  const showEssentials = !normalizedQuery && (activeCategory === "all" || activeCategory === ESSENTIAL_FILTER);

  const essentialCount = useMemo(
    () => shopCategories.reduce(
      (sum, category) => sum + category.products.filter((product) => isEssentialProduct(product.id)).length,
      0,
    ),
    [],
  );

  const activeCategoryMeta = useMemo(() => {
    if (activeCategory === ESSENTIAL_FILTER) {
      return {
        label: "필수 소모품",
        note: "원두·컵·리드·컵홀더·A4·토너 — 발주 주기를 함께 봅니다",
      };
    }

    const category = shopCategories.find((item) => item.key === activeCategory);

    return category
      ? { label: category.label, note: category.note }
      : { label: "전체 품목", note: "원두·파우더·부자재·가구까지 한 번에" };
  }, [activeCategory]);

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

  const handleReorderLast = useCallback(() => {
    if (!lastOrder) return;

    addBundle(lastOrder.items);
    setSheetStoreCode(lastOrder.storeCode);
    setSheetNotice(
      `${formatOrderDay(lastOrder.createdAt)} 발주 ${lastOrder.items.length}종 ${lastOrder.count}개를 그대로 담았어요.`,
    );
    setSheetOpen(true);
  }, [addBundle, lastOrder]);

  const handleAddEssential = (itemKey: string) => {
    const item = essentialItems.find((candidate) => candidate.key === itemKey);
    if (!item) return;

    const quantity = item.quantity[scale];
    const product = getProductById(item.productId);

    addBundle([{ id: item.productId, quantity }]);

    toast({
      content: `${item.label} ${recommendedQuantityLabel(product?.unit ?? "개", quantity)}를 담았습니다 · ${storeScaleLabel(scale)} 기준`,
      duration: "short",
      variant: "normal",
    });
  };

  const handleScaleChange = (next: StoreScale) => {
    setScale(next);
    writeStoreScale(next);
  };

  const handleAddAllEssentials = () => {
    const items = essentialItems.flatMap((item) => [
      { id: item.productId, quantity: item.quantity[scale] },
    ]);

    addBundle(items);
    toast({
      content: `필수 소모품 ${items.length}종을 ${storeScaleLabel(scale)} 기준 수량으로 담았습니다`,
      duration: "short",
      variant: "normal",
    });
  };

  return (
    <>
      <section className="mx-auto w-full max-w-[1200px] px-4 pt-5 sm:px-6" id="catalog">
        {/* 원두가 발주의 대부분이라, 99품목을 찾지 않고 3단계로 끝나는 빠른 발주를 맨 위에 둔다. */}
        <QuickBeanOrder onOpenCart={() => setSheetOpen(true)} testMode={testMode} />

        <ReorderBanner
          lastOrder={lastOrder}
          onReorder={handleReorderLast}
          recentStore={recentStore}
        />

        {showEssentials ? (
          <section aria-labelledby="essential-title" className="mt-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2
                  className="break-keep text-[21px] font-bold tracking-[-0.03em] text-[#0F1412]"
                  id="essential-title"
                >
                  자주 시키는 소모품
                </h2>
                <p className="mt-1 text-[14px] leading-[1.5] text-[#3B4740]">
                  매장 규모를 고르면 1회 권장 수량이 바뀝니다
                </p>
              </div>
              <button
                className="ls-focus h-11 rounded-full border-2 border-[var(--ls-line-strong)] bg-white px-4 text-[14px] font-semibold text-[#0F1412] transition-colors hover:border-[#0F1412]"
                onClick={handleAddAllEssentials}
                type="button"
              >
                한 번에 담기
              </button>
            </div>

            <div className="no-scrollbar mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="shrink-0 text-[13px] font-semibold text-[#3B4740]">
                매장 규모
              </span>
              {storeScales.map((option) => {
                const active = option.key === scale;

                return (
                  <button
                    aria-pressed={active}
                    className={`ls-focus flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14.5px] font-semibold transition-colors ${
                      active
                        ? "bg-[#0F1412] text-[#1DFF26]"
                        : "border-2 border-[var(--ls-line-strong)] bg-white text-[#0F1412] hover:border-[#0F1412]"
                    }`}
                    key={option.key}
                    onClick={() => handleScaleChange(option.key)}
                    title={option.hint}
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
              <span className="shrink-0 pl-1 text-[13px] text-[#3B4740]">
                {storeScales.find((option) => option.key === scale)?.hint}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {essentialItems.map((item) => {
                const product = getProductById(item.productId);
                if (!product) return null;

                const quantity = item.quantity[scale];
                const inCart = quantityById.get(product.id) ?? 0;

                return (
                  <article
                    className="flex flex-col rounded-[14px] border border-[var(--ls-line)] bg-white p-3"
                    key={item.key}
                  >
                    <p className="text-[12.5px] text-[#3B4740]">{item.hint}</p>
                    <h3 className="mt-1 break-keep text-[15px] font-bold leading-[1.3] text-[#0F1412]">
                      {item.label}
                    </h3>
                    <span className="mt-1.5 inline-flex w-fit rounded-[4px] bg-[#EAF8EF] px-1.5 py-[2px] text-[11.5px] font-semibold text-[#0B5C2A]">
                      {cycleBadge(product.id, scale) ?? "정기 발주"}
                    </span>
                    <p className="mt-1 text-[12.5px] leading-[1.45] text-[#3B4740]">
                      1회 {recommendedQuantityLabel(product.unit, quantity)}
                      {inCart > 0 ? ` · 담김 ${inCart}` : ""}
                    </p>
                    <button
                      className="ls-focus mt-2 h-11 w-full rounded-full border-2 border-[var(--ls-line-strong)] text-[14px] font-semibold text-[#0F1412] transition-colors hover:border-[#0F1412] hover:bg-[#0F1412] hover:text-[#1DFF26]"
                      onClick={() => handleAddEssential(item.key)}
                      type="button"
                    >
                      담기 · {formatPrice(product.price * quantity)}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="sticky top-0 z-30 -mx-4 mt-4 bg-[#F4F5F6] px-4 pb-2 pt-2 shadow-[0_10px_16px_-14px_rgba(15,20,18,0.35)] sm:-mx-6 sm:px-6">
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
              className="ls-focus h-14 w-full rounded-[12px] border-2 border-[var(--ls-line-strong)] bg-white pl-11 pr-11 text-[16px] text-[#0F1412] outline-none placeholder:text-[#6B746D]"
              inputMode="search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="품목 이름으로 찾기"
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
            <CategoryChip
              active={activeCategory === ESSENTIAL_FILTER}
              count={essentialCount}
              label="필수 소모품"
              onClick={() => setActiveCategory(ESSENTIAL_FILTER)}
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
          <section aria-labelledby="bundle-title" className="mt-6">
            <div className="flex items-end justify-between">
              <div>
                <h2
                  className="break-keep text-[21px] font-bold tracking-[-0.03em] text-[#0F1412]"
                  id="bundle-title"
                >
                  자주 시키는 세트
                </h2>
                <p className="mt-1 text-[14px] text-[#3B4740]">한 번에 담기</p>
              </div>
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
                      className="ls-focus h-11 shrink-0 rounded-[10px] border border-[#3A463E] px-4 text-[14px] font-semibold text-[#1DFF26] transition-colors hover:border-[#1DFF26] hover:bg-[#16231A]"
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

        <section aria-labelledby="product-title" className="mt-7" id="all-products">
          <div className="flex items-end justify-between">
            <div>
              <h2
                className="break-keep text-[21px] font-bold tracking-[-0.03em] text-[#0F1412]"
                id="product-title"
              >
                {activeCategory === "all" ? "전체 품목" : activeCategoryMeta.label}
              </h2>
              <p className="mt-1 text-[14px] leading-[1.5] text-[#3B4740]">
                {activeCategoryMeta.note}
              </p>
            </div>
            <p className="shrink-0 pb-0.5 text-[13px] tabular-nums text-[#3B4740]">
              {resultCount}개
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
                      <h3 className="text-[14px] font-bold text-[#3B4740]">
                        {category.label}
                      </h3>
                      <span className="h-px flex-1 bg-[var(--ls-line)]" />
                      <span className="text-[13px] tabular-nums text-[#3B4740]">
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
                        scale={scale}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-[16px] border border-[var(--ls-line)] bg-white px-4 py-4">
          <h2 className="text-[16px] font-bold text-[#0F1412]">발주 안내</h2>
          <ul className="mt-2 space-y-1 text-[13.5px] leading-[1.7] text-[#3B4740]">
            <li>· 원두는 1박스(1kg × 10봉 = 10kg)부터 3박스까지 발주할 수 있어요.</li>
            <li>· 모든 단가는 부가세 포함 금액이에요. 합계는 공급가액과 부가세로 나눠 확인할 수 있어요.</li>
            <li>· 원두 1박스 {formatPrice(200000)} · 파우더·농축은 더캐럿 2026-11-19 단가표 기준이에요.</li>
            <li>· 주문 후 입금 계좌를 안내해 드리고, 입금 확인 후 출고돼요.</li>
          </ul>
        </section>
      </section>

      <CartBar onOpen={() => setSheetOpen(true)} />
      <OrderSheet
        initialStoreCode={sheetStoreCode}
        notice={sheetNotice}
        onClose={() => {
          setSheetOpen(false);
          setSheetNotice(null);
        }}
        open={sheetOpen}
        testMode={testMode}
      />
    </>
  );
}

function ReorderBanner({
  lastOrder,
  onReorder,
  recentStore,
}: {
  lastOrder: LastOrder | null;
  onReorder: () => void;
  recentStore: { code: string; label: string } | null;
}) {
  if (!lastOrder) {
    // 직전 발주가 없으면 배너를 두지 않는다 — 첫 발주자는 위 간편 발주만 보면 된다.
    return null;
  }

  const preview = lastOrder.items.slice(0, 3);
  const restCount = lastOrder.items.length - preview.length;

  return (
    <article className="relative mt-1 overflow-hidden rounded-[18px] bg-[#0F1412] p-4 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-[220px] rounded-full bg-[radial-gradient(closest-side,rgba(29,255,38,0.16),rgba(29,255,38,0))]"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#2C3730] px-2.5 py-[3px] text-[12px] text-[#C8D0CA]">
              {formatOrderDay(lastOrder.createdAt)} 발주
            </span>
            {lastOrder.storeName ?? recentStore ? (
              <span className="rounded-full bg-[#16231A] px-2.5 py-[3px] text-[12px] font-semibold text-[#7CE785]">
                {lastOrder.storeName ?? recentStore?.label}
              </span>
            ) : null}
          </div>

          <h2 className="mt-2 break-keep text-[19px] font-bold leading-[1.3] tracking-[-0.03em] text-white">
            지난 발주 그대로 다시 담기
          </h2>
          <p className="mt-1 text-[13.5px] tabular-nums text-[#C8D0CA]">
            {lastOrder.items.length}종 {lastOrder.count}개 · {formatPrice(lastOrder.totalAmount)} ·{" "}
            <span className="text-[#9AA39C]">{lastOrder.orderNumber}</span>
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {preview.map((item) => {
              const product = getProductById(item.id);
              if (!product) return null;

              return (
                <span
                  className="max-w-[190px] truncate rounded-full border border-[#2C3730] px-2 py-[3px] text-[10.5px] text-[#C8D0CA]"
                  key={item.id}
                >
                  {product.name} ×{item.quantity}
                </span>
              );
            })}
            {restCount > 0 ? (
              <span className="rounded-full border border-[#2C3730] px-2 py-[3px] text-[10.5px] text-[#7C867E]">
                +{restCount}종
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <button
            className="ls-focus h-12 rounded-[12px] bg-[#1DFF26] px-5 text-[15px] font-bold text-[#0F1412] transition-colors hover:bg-[#0FE01B]"
            onClick={onReorder}
            type="button"
          >
            그대로 담기
          </button>
          <Link
            className="ls-focus flex h-11 items-center justify-center rounded-[12px] border border-[#2C3730] px-4 text-[14px] font-medium text-[#C8D0CA] transition-colors hover:border-[#1DFF26] hover:text-white"
            href="/orders"
          >
            발주 내역
          </Link>
        </div>
      </div>
    </article>
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
      className={`ls-focus flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14.5px] font-semibold transition-colors ${
        active
          ? "bg-[#0F1412] text-[#1DFF26]"
          : "border-2 border-[var(--ls-line-strong)] bg-white text-[#0F1412] hover:border-[#0F1412]"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
      <span
        className={`text-[12.5px] tabular-nums ${active ? "text-[#8CF695]" : "text-[#3B4740]"}`}
      >
        {count}
      </span>
    </button>
  );
}
