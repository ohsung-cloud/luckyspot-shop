export type ShopImageVariant = "bag" | "cover" | "icon" | "tile";

export type ShopProduct = {
  id: string;
  imageAlt: string;
  imageSrc: string;
  imageVariant: ShopImageVariant;
  name: string;
  price: number;
};

export type ShopCategory = {
  key: string;
  label: string;
  products: ShopProduct[];
};

export const shopCategories: ShopCategory[] = [
  {
    key: "shop",
    label: "원두티백",
    products: [
      {
        id: "bean-box-10kg",
        imageAlt: "럭키빈 1박스 (10kg)",
        imageSrc: "/assets/images/home/products/bean-bag.png",
        imageVariant: "bag",
        name: "럭키빈 1박스 (10kg)",
        price: 200000,
      },
      {
        id: "bean-box-30kg",
        imageAlt: "럭키빈 3박스 (30kg)",
        imageSrc: "/assets/images/home/products/bean-bag.png",
        imageVariant: "bag",
        name: "럭키빈 3박스 (30kg)",
        price: 600000,
      },
      {
        id: "bean-1kg",
        imageAlt: "럭키빈 1kg",
        imageSrc: "/assets/images/home/products/bean-bag.png",
        imageVariant: "bag",
        name: "럭키빈 1kg",
        price: 22000,
      },
      {
        id: "hibiscus-teabag",
        imageAlt: "히비스커스 티백 100ea",
        imageSrc: "/assets/images/home/products/box-icon.svg",
        imageVariant: "icon",
        name: "히비스커스 티백 100ea",
        price: 65000,
      },
      {
        id: "chamomile-teabag",
        imageAlt: "캐모마일 티백 100ea",
        imageSrc: "/assets/images/home/products/box-icon.svg",
        imageVariant: "icon",
        name: "캐모마일 티백 100ea",
        price: 65000,
      },
      {
        id: "rooibos-teabag",
        imageAlt: "루이보스 티백 100ea",
        imageSrc: "/assets/images/home/products/box-icon.svg",
        imageVariant: "icon",
        name: "루이보스 티백 100ea",
        price: 65000,
      },
    ],
  },
  {
    key: "print",
    label: "프린트물품",
    products: [
      {
        id: "a4-paper-75g-2500",
        imageAlt: "A4 용지 75g 2500매",
        imageSrc: "/assets/images/home/products/print-paper.png",
        imageVariant: "cover",
        name: "A4 용지 75g 2500매",
        price: 23000,
      },
      {
        id: "a3-paper-75g-2500",
        imageAlt: "A3 용지 75g 2500매",
        imageSrc: "/assets/images/home/products/print-paper.png",
        imageVariant: "cover",
        name: "A3 용지 75g 2500매",
        price: 75000,
      },
      {
        id: "b4-paper-75g-2500",
        imageAlt: "B4 용지 75g 2500매",
        imageSrc: "/assets/images/home/products/print-paper.png",
        imageVariant: "cover",
        name: "B4 용지 75g 2500매",
        price: 44000,
      },
      {
        id: "black-toner-k",
        imageAlt: "복합기 정품 검정토너 (K)",
        imageSrc: "/assets/images/home/products/box-icon.svg",
        imageVariant: "icon",
        name: "복합기 정품 검정토너 (K)",
        price: 99800,
      },
      {
        id: "color-toner-cmy",
        imageAlt: "복합기 정품 컬러토너 (C/M/Y)",
        imageSrc: "/assets/images/home/products/box-icon.svg",
        imageVariant: "icon",
        name: "복합기 정품 컬러토너 (C/M/Y)",
        price: 149800,
      },
    ],
  },
  {
    key: "cafe",
    label: "카페비품",
    products: [
      {
        id: "ice-cup",
        imageAlt: "아이스 음료 컵",
        imageSrc: "/assets/images/home/tea-cup.png",
        imageVariant: "cover",
        name: "16oz 아이스컵 1박스",
        price: 42000,
      },
      {
        id: "bean-bag",
        imageAlt: "원두 보관 패키지",
        imageSrc: "/assets/images/home/products/bean-bag.png",
        imageVariant: "bag",
        name: "원두 보관팩 200매",
        price: 31000,
      },
      {
        id: "straw-set",
        imageAlt: "카페 소모품 샘플",
        imageSrc: "/assets/images/home/tea-cup.png",
        imageVariant: "cover",
        name: "빨대/냅킨 세트",
        price: 27000,
      },
    ],
  },
  {
    key: "cleaning",
    label: "청소용품",
    products: [
      {
        id: "cleaner",
        imageAlt: "클리닝 패키지 샘플",
        imageSrc: "/assets/images/home/products/bean-bag.png",
        imageVariant: "bag",
        name: "에스프레소 머신 클리너",
        price: 24000,
      },
      {
        id: "sanitizer",
        imageAlt: "매장용 위생용품 샘플",
        imageSrc: "/assets/images/home/tea-cup.png",
        imageVariant: "cover",
        name: "매장용 살균 소독제",
        price: 16000,
      },
      {
        id: "wiper",
        imageAlt: "청소용품 패키지 샘플",
        imageSrc: "/assets/images/home/products/box-icon.svg",
        imageVariant: "icon",
        name: "극세사 와이퍼 10매",
        price: 19000,
      },
    ],
  },
  {
    key: "etc",
    label: "기타용품",
    products: [
      {
        id: "memory-foam-cushion",
        imageAlt: "메모리폼 원형 방석",
        imageSrc: "/assets/images/home/products/etc-cushion.png",
        imageVariant: "tile",
        name: "메모리폼 원형 방석",
        price: 30000,
      },
      {
        id: "canvas-frame-a3-type-a",
        imageAlt: "캔버스 액자 (A3) TypeA",
        imageSrc: "/assets/images/home/products/etc-canvas-a.png",
        imageVariant: "tile",
        name: "캔버스 액자 (A3) TypeA",
        price: 33000,
      },
      {
        id: "canvas-frame-a3-type-b",
        imageAlt: "캔버스 액자 (A3) TypeB",
        imageSrc: "/assets/images/home/products/etc-canvas-b.png",
        imageVariant: "tile",
        name: "캔버스 액자 (A3) TypeB",
        price: 33000,
      },
      {
        id: "canvas-frame-a3-type-c",
        imageAlt: "캔버스 액자 (A3) TypeC",
        imageSrc: "/assets/images/home/products/etc-canvas-c.png",
        imageVariant: "tile",
        name: "캔버스 액자 (A3) TypeC",
        price: 33000,
      },
      {
        id: "canvas-frame-a3-type-d",
        imageAlt: "캔버스 액자 (A3) TypeD",
        imageSrc: "/assets/images/home/products/etc-canvas-d.png",
        imageVariant: "tile",
        name: "캔버스 액자 (A3) TypeD",
        price: 33000,
      },
      {
        id: "entrance-mat-90x60",
        imageAlt: "현관 발매트(90x60)",
        imageSrc: "/assets/images/home/products/etc-mat.png",
        imageVariant: "tile",
        name: "현관 발매트(90x60)",
        price: 55000,
      },
      {
        id: "wifi-acrylic-banner",
        imageAlt: "WIFI 아크릴 배너",
        imageSrc: "/assets/images/home/products/etc-wifi-banner.png",
        imageVariant: "tile",
        name: "WIFI 아크릴 배너",
        price: 16500,
      },
      {
        id: "startup-acrylic-banner",
        imageAlt: "창업문의 아크릴 배너",
        imageSrc: "/assets/images/home/products/etc-startup-banner.png",
        imageVariant: "tile",
        name: "창업문의 아크릴 배너",
        price: 16500,
      },
    ],
  },
];

const priceFormatter = new Intl.NumberFormat("ko-KR");

export function formatPrice(price: number) {
  return `${priceFormatter.format(price)}원`;
}
