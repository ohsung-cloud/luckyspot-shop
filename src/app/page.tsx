"use client";

import * as React from "react";
import { useToast } from "@wanteddev/wds";

import { LuckyButton } from "@/components/LuckyButton";
import { LuckyChipTabs } from "@/components/LuckyChipTabs";
import ShopProductImage from "@/components/ShopProductImage";
import { formatPrice, shopCategories } from "@/data/products";
import { useCartStore } from "@/stores/cartStore";

export default function HomePage() {
  const addItem = useCartStore((state) => state.addItem);
  const toast = useToast();
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const selectedCategory = shopCategories[selectedIndex] ?? shopCategories[0];

  return (
    <main className="shop-home-page bg-white px-6 pb-[150px] pt-24 text-ui-gray-900">
      <section
        aria-labelledby="shop-home-heading"
        className="mx-auto flex w-full max-w-[432px] flex-col gap-6"
      >
        <h1 id="shop-home-heading" className="sr-only">
          럭키스팟 홈 쇼핑 섹션
        </h1>

        <LuckyChipTabs
          aria-label="럭키스팟 상품 카테고리"
          className="no-scrollbar flex gap-2 overflow-x-auto pb-1"
          getChipProps={(_item, _index, selected) => ({
            selectedTone: "primary",
            sx: {
              minHeight: "40px",
              paddingInline: "12px",
              border: `0.833px solid ${selected ? "#0090FF" : "#D7D7D7"}`,
              backgroundColor: selected ? "#0090FF" : "transparent",
              color: selected ? "#FFFFFF" : "#171717",
              fontSize: "20px",
              fontWeight: 600,
              letterSpacing: "0.16px",
              lineHeight: 1.5,
              whiteSpace: "nowrap",
            },
            tone: "default",
          })}
          items={shopCategories.map((category) => ({
            key: category.key,
            label: category.label,
            panelId: `${category.key}-panel`,
            tabId: `${category.key}-tab`,
          }))}
          onChange={setSelectedIndex}
          selectedIndex={selectedIndex}
        />

        <div
          id={`${selectedCategory.key}-panel`}
          aria-labelledby={`${selectedCategory.key}-tab`}
          className="flex flex-col"
          role="tabpanel"
        >
          {selectedCategory.products.map((product) => (
            <article
              key={product.id}
              className="flex min-h-[165px] items-center justify-between py-6"
            >
              <div className="min-w-0 flex-1 pr-4">
                <h2 className="type-heading-xs break-keep text-ui-gray-900">
                  {product.name}
                </h2>
                <p className="type-body-lg mt-2 text-ui-gray-600">
                  {formatPrice(product.price)}
                </p>
                <LuckyButton
                  appearance="link"
                  className="mt-2 w-fit"
                  onClick={() => {
                    addItem(product);
                    toast({
                      content: "장바구니에 담겼습니다.",
                      duration: "short",
                      variant: "normal",
                    });
                  }}
                  sx={{
                    minHeight: "auto",
                    paddingInline: "0px",
                    fontSize: "16px",
                    fontWeight: 400,
                    lineHeight: "24px",
                    justifyContent: "flex-start",
                    textUnderlineOffset: "3px",
                  }}
                >
                  장바구니 담기
                </LuckyButton>
              </div>

              <ShopProductImage product={product} />
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
