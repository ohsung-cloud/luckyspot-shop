"use client";

import * as React from "react";

import { BrandWordmark } from "@/components/BrandWordmark";
import { LuckyButton } from "@/components/LuckyButton";
import { LuckyChipTabs } from "@/components/LuckyChipTabs";

const starterTabs = [
  {
    key: "shop",
    label: "쇼핑 홈",
  },
  {
    key: "product",
    label: "상품 상세",
  },
  {
    key: "checkout",
    label: "결제 흐름",
  },
];

const tabDescriptions = [
  "PC 좌측 패널과 모바일 중앙 캔버스를 유지한 채로 메인 배너와 컬렉션을 붙일 수 있는 시작점입니다.",
  "공통 버튼과 칩을 조합해서 옵션 선택, 상품 정보, CTA 블록을 빠르게 확장할 수 있습니다.",
  "주문과 결제 플로우도 같은 레이아웃 위에서 바로 이어 붙일 수 있도록 최소 골격만 남겨두었습니다.",
];

export default function HomePage() {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  return (
    <main className="pt-[76px]">
      <section
        id="shop"
        className="relative overflow-hidden bg-brand-900 px-6 pb-16 pt-10 text-white"
      >
        <div className="space-y-5">
          <p className="type-caption text-brand-100">LUCKYSPOT SHOP STARTER</p>
          <BrandWordmark className="h-[24px] w-auto" />
          <div className="space-y-3">
            <h1 className="type-heading-sm text-white">
              기존 럭키스팟 레이아웃 위에 바로 붙일 shop 시작점
            </h1>
            <p className="type-body-md text-brand-100">
              배경, 중앙 480px 캔버스, PC 좌측 패널, 상단 메뉴와 하단 고정 CTA
              구조를 그대로 유지한 상태로 옮겨왔습니다.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-[28px] bg-white p-5 text-ui-gray-900">
          <p className="type-caption text-brand-600">PRIMARY CTA</p>
          <div className="mt-4 grid gap-3">
            <LuckyButton fullWidth>지금 구매하기</LuckyButton>
            <LuckyButton appearance="weak" fullWidth>
              장바구니 담기
            </LuckyButton>
            <LuckyButton appearance="outline" fullWidth>
              상세 설명 보기
            </LuckyButton>
          </div>
        </div>
      </section>

      <section id="product" className="bg-white px-6 py-10">
        <div className="space-y-4 rounded-[24px] border border-ui-gray-200 p-5">
          <div className="space-y-2">
            <p className="type-caption text-brand-600">PAGE FLOW IDEA</p>
            <h2 className="type-heading-xs text-ui-gray-900">
              상품 페이지를 붙일 기본 구조
            </h2>
          </div>

          <LuckyChipTabs
            aria-label="샵 페이지 구상"
            className="flex flex-wrap gap-2"
            items={starterTabs}
            onChange={setSelectedIndex}
            selectedIndex={selectedIndex}
          />

          <p className="type-body-md text-ui-gray-600">
            {tabDescriptions[selectedIndex]}
          </p>
        </div>

        <div className="mt-6 rounded-[24px] bg-ui-gray-100 p-5">
          <p className="type-caption text-brand-600">PRODUCT BLOCK</p>
          <div className="mt-3 space-y-3">
            <h3 className="type-heading-xs text-ui-gray-900">
              Luckyspot Signature Capsule Set
            </h3>
            <p className="type-body-md text-ui-gray-600">
              여기부터 카드 리스트, 옵션 셀렉터, 상세 정보 아코디언 같은 shop
              전용 컴포넌트를 얹으면 됩니다.
            </p>
          </div>
        </div>
      </section>

      <section id="checkout" className="bg-brand-100 px-6 py-10">
        <div className="rounded-[24px] bg-white p-5">
          <p className="type-caption text-brand-600">CHECKOUT</p>
          <div className="mt-3 space-y-3">
            <h2 className="type-heading-xs text-ui-gray-900">
              결제 플로우도 같은 캔버스에서 확장 가능
            </h2>
            <p className="type-body-md text-ui-gray-600">
              주문 요약, 배송 정보, 결제 수단 선택 UI를 붙여도 현재 레이아웃과
              토큰을 그대로 이어서 사용할 수 있습니다.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
