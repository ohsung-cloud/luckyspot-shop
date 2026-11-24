"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Card, CardBody, CardHead, Chip, QUIET_BUTTON, Row, RowList } from "@/components/internal/card-ui";
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
      content: `${bundle.name} ${bundleItemCount(bundle)}개를 담았어요`,
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
      content: `${item.label} ${recommendedQuantityLabel(product?.unit ?? "개", quantity)}를 담았어요 · ${storeScaleLabel(scale)} 기준`,
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
      content: `필수 소모품 ${items.length}종을 ${storeScaleLabel(scale)} 기준 수량으로 담았어요`,
      duration: "short",
      variant: "normal",
    });
  };

  return (
    <>
      {/* 원두가 발주의 대부분이라, 99품목을 찾지 않고 3단계로 끝나는 빠른 발주를 맨 위에 둔다. */}
      <QuickBeanOrder onOpenCart={() => setSheetOpen(true)} testMode={testMode} />

      <ReorderBanner lastOrder={lastOrder} onReorder={handleReorderLast} recentStore={recentStore} />

      {showEssentials ? (
        <Card className="mt-3">
          <CardHead
            right={
              <button className={QUIET_BUTTON} onClick={handleAddAllEssentials} type="button">
                한 번에 담기
              </button>
            }
            sub="매장 규모를 고르면 1회 권장 수량이 바뀌어요"
            title="자주 시키는 소모품"
          />
          <CardBody className="pt-3">
            <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
              <span className="shrink-0 text-[11.5px] font-bold text-[#98A29B]">매장 규모</span>
              {storeScales.map((option) => {
                const active = option.key === scale;

                return (
                  <button
                    aria-pressed={active}
                    className={`ls-focus flex h-9 shrink-0 items-center rounded-full px-3.5 text-[12.5px] font-bold transition-colors ${
                      active
                        ? "bg-[#0F1412] text-[#1DFF26]"
                        : "bg-[#F7F8F9] text-[#3B4740] hover:bg-[#EFF1F0]"
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
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {essentialItems.map((item) => {
                const product = getProductById(item.productId);
                if (!product) return null;

                const quantity = item.quantity[scale];
                const inCart = quantityById.get(product.id) ?? 0;

                return (
                  <div className="flex flex-col rounded-[16px] bg-[#F7F8F9] p-3" key={item.key}>
                    <p className="text-[11px] font-medium text-[#98A29B]">{item.hint}</p>
                    <h3 className="mt-0.5 break-keep text-[14px] font-bold leading-[1.3] text-[#0F1412]">
                      {item.label}
                    </h3>
                    <span className="mt-1.5 inline-flex w-fit rounded-full bg-white px-2 py-[3px] text-[10.5px] font-bold leading-none text-[#0B5C2A]">
                      {cycleBadge(product.id, scale) ?? "정기 발주"}
                    </span>
                    <p className="mt-1 text-[11.5px] leading-[1.45] text-[#8B948D]">
                      1회 {recommendedQuantityLabel(product.unit, quantity)}
                      {inCart > 0 ? ` · 담김 ${inCart}` : ""}
                    </p>
                    <button
                      className="ls-focus mt-2 h-11 w-full rounded-[12px] bg-white text-[12.5px] font-bold tracking-[0.01em] text-[#0F1412] shadow-[0_1px_3px_rgba(15,20,18,0.08)] transition-colors hover:bg-[#0F1412] hover:text-[#1DFF26]"
                      onClick={() => handleAddEssential(item.key)}
                      type="button"
                    >
                      담기 · {formatPrice(product.price * quantity)}
                    </button>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="sticky top-0 z-30 -mx-4 mt-3 bg-[#F4F5F6]/95 px-4 pb-2 pt-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98A29B]"
          >
            <svg height="16" viewBox="0 0 18 18" width="16">
              <circle cx="8" cy="8" fill="none" r="5.2" stroke="currentColor" strokeWidth="1.7" />
              <path d="M12 12l4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
            </svg>
          </span>
          <input
            aria-label="품목 검색"
            className="ls-focus h-12 w-full rounded-[14px] bg-white pl-11 pr-11 text-[15px] font-medium text-[#0F1412] shadow-[0_1px_2px_rgba(15,20,18,0.05)] outline-none ring-0 transition-shadow placeholder:text-[#98A29B] focus:ring-2 focus:ring-[#0F1412]"
            inputMode="search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="품목 이름으로 찾아보세요"
            type="search"
            value={query}
          />
          {query ? (
            <button
              aria-label="검색어 지우기"
              className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-[#F2F4F6] text-[#8B948D]"
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
        <Card className="mt-1">
          <CardHead sub="자주 쓰는 조합을 한 번에 담아요" title="자주 시키는 세트" />
          <CardBody className="pt-1">
            <RowList>
              {shopBundles.map((bundle) => (
                <Row
                  key={bundle.id}
                  label={bundle.name}
                  sub={`${bundle.badge} · ${bundleItemCount(bundle)}개 구성`}
                  trailing={
                    <button
                      className="ls-focus flex h-10 shrink-0 items-center justify-center rounded-full bg-[#F2F4F6] px-3.5 text-[12px] font-bold text-[#3B4740] transition-colors hover:bg-[#E9ECEB]"
                      onClick={() => handleAddBundle(bundle.id)}
                      type="button"
                    >
                      담기
                    </button>
                  }
                  value={formatPrice(bundlePrice(bundle))}
                />
              ))}
            </RowList>
          </CardBody>
        </Card>
      ) : null}

      <section aria-labelledby="product-title" className="mt-5">
        <div className="flex items-end justify-between px-1">
          <div>
            <h2
              className="break-keep text-[18px] font-bold tracking-[-0.025em] text-[#0F1412]"
              id="product-title"
            >
              {activeCategory === "all" ? "전체 품목" : activeCategoryMeta.label}
            </h2>
            <p className="mt-0.5 text-[11.5px] font-medium leading-[1.5] text-[#98A29B]">
              {activeCategoryMeta.note}
            </p>
          </div>
          <span className="shrink-0 pb-0.5 text-[11.5px] font-bold tabular-nums tracking-[0.01em] text-[#98A29B]">
            {resultCount}개
          </span>
        </div>

        {resultCount === 0 ? (
          <Card className="mt-3 px-6 py-10 text-center">
            <p className="text-[15px] font-bold text-[#0F1412]">찾는 품목이 없어요</p>
            <p className="mt-1.5 break-keep text-[12px] leading-[1.6] text-[#8B948D]">
              다른 이름으로 검색하거나 전체 카테고리를 확인해 주세요.
              <br />
              발주 목록에 없는 품목은 고객센터로 문의해 주세요.
            </p>
          </Card>
        ) : (
          <div className="mt-3 space-y-6">
            {visibleCategories.map((category) => (
              <div key={category.key}>
                {normalizedQuery || activeCategory === "all" ? (
                  <div className="mb-2 flex items-center gap-2 px-1">
                    <h3 className="text-[12px] font-bold text-[#8B948D]">{category.label}</h3>
                    <span className="h-px flex-1 bg-[#E6E9E7]" />
                    <span className="text-[11.5px] font-bold tabular-nums tracking-[0.01em] text-[#98A29B]">
                      {category.products.length}
                    </span>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
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

      <Card className="mt-5">
        <CardHead sub="처음 발주하실 때 한 번만 읽어 주세요" title="발주 안내" />
        <CardBody className="pt-3">
          <ul className="space-y-1.5 text-[12px] leading-[1.65] text-[#3B4740]">
            <li>· 원두는 1박스(1kg × 10봉 = 10kg)부터 3박스까지 발주할 수 있어요.</li>
            <li>· 모든 단가는 부가세 포함 금액이에요. 합계는 공급가액과 부가세로 나눠 확인할 수 있어요.</li>
            <li>· 원두 1박스 {formatPrice(200000)} · 파우더·농축은 더캐럿 2026-11-19 단가표 기준이에요.</li>
            <li>· 주문하면 입금 계좌를 안내해 드리고, 입금을 확인한 뒤 출고해요.</li>
          </ul>
        </CardBody>
      </Card>

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
    // 직전 발주가 없으면 카드를 두지 않는다 — 첫 발주자는 위 간편 발주만 보면 된다.
    return null;
  }

  const preview = lastOrder.items.slice(0, 3);
  const restCount = lastOrder.items.length - preview.length;
  const storeLabel = lastOrder.storeName ?? recentStore?.label ?? null;

  return (
    <Card className="mt-3">
      <CardHead
        right={storeLabel ? <Chip tone="green">{storeLabel}</Chip> : undefined}
        sub={`${formatOrderDay(lastOrder.createdAt)} 발주 · ${lastOrder.items.length}종 ${lastOrder.count}개`}
        title="지난 발주 그대로 담기"
      />

      <CardBody className="pt-3">
        <div className="flex items-end justify-between gap-3">
          <p className="text-[24px] font-bold leading-none tracking-[0.02em] tabular-nums text-[#0F1412]">
            {formatPrice(lastOrder.totalAmount)}
          </p>
          <p className="shrink-0 pb-0.5 text-[11px] tabular-nums tracking-[0.01em] text-[#98A29B]">
            {lastOrder.orderNumber}
          </p>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {preview.map((item) => {
            const product = getProductById(item.id);
            if (!product) return null;

            return (
              <span
                className="max-w-[190px] truncate rounded-full bg-[#F2F4F6] px-2.5 py-1 text-[11px] font-semibold text-[#3B4740]"
                key={item.id}
              >
                {product.name} ×{item.quantity}
              </span>
            );
          })}
          {restCount > 0 ? (
            <span className="rounded-full bg-[#F2F4F6] px-2.5 py-1 text-[11px] font-semibold text-[#98A29B]">
              +{restCount}종
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            className="ls-focus flex h-[52px] items-center justify-center rounded-[16px] bg-[#F2F4F6] text-[14px] font-bold text-[#3B4740] transition-colors hover:bg-[#E9ECEB]"
            href="/orders"
          >
            발주 내역
          </a>
          <button
            className="ls-focus flex h-[52px] items-center justify-center rounded-[16px] bg-[#0F1412] text-[14.5px] font-bold text-white transition-colors hover:bg-[#232B26]"
            onClick={onReorder}
            type="button"
          >
            그대로 담기
          </button>
        </div>
      </CardBody>
    </Card>
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
      className={`ls-focus flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-bold transition-colors ${
        active
          ? "bg-[#0F1412] text-[#1DFF26]"
          : "bg-white text-[#3B4740] shadow-[0_1px_2px_rgba(15,20,18,0.05)] hover:bg-[#FBFCFC]"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
      <span
        className={`text-[11.5px] font-bold tabular-nums tracking-[0.01em] ${active ? "text-[#8CF695]" : "text-[#98A29B]"}`}
      >
        {count}
      </span>
    </button>
  );
}
