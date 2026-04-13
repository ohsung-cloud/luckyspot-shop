export type ShopImageVariant = "bag" | "photo";

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

const coffeeBagImage = "/assets/images/home/coffee-bag.png";
const teaCupImage = "/assets/images/home/tea-cup.png";

export const shopCategories: ShopCategory[] = [
  {
    key: "shop",
    label: "원두티백",
    products: [
      {
        id: "bean-box-10kg",
        imageAlt: "럭키빈 원두 패키지",
        imageSrc: coffeeBagImage,
        imageVariant: "bag",
        name: "럭키빈 1박스 (10kg)",
        price: 200000,
      },
      {
        id: "bean-box-30kg",
        imageAlt: "럭키빈 원두 패키지",
        imageSrc: coffeeBagImage,
        imageVariant: "bag",
        name: "럭키빈 3박스 (30kg)",
        price: 600000,
      },
      {
        id: "bean-1kg",
        imageAlt: "럭키빈 원두 패키지",
        imageSrc: coffeeBagImage,
        imageVariant: "bag",
        name: "럭키빈 1kg",
        price: 22000,
      },
      {
        id: "hibiscus-teabag",
        imageAlt: "히비스커스 아이스티",
        imageSrc: teaCupImage,
        imageVariant: "photo",
        name: "히비스커스 티백 100ea",
        price: 65000,
      },
      {
        id: "chamomile-teabag",
        imageAlt: "캐모마일 아이스티",
        imageSrc: teaCupImage,
        imageVariant: "photo",
        name: "캐모마일 티백 100ea",
        price: 65000,
      },
      {
        id: "rooibos-teabag",
        imageAlt: "루이보스 아이스티",
        imageSrc: teaCupImage,
        imageVariant: "photo",
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
        id: "printed-cup-sleeve",
        imageAlt: "브랜딩 프린트 샘플",
        imageSrc: teaCupImage,
        imageVariant: "photo",
        name: "로고 컵홀더 1박스",
        price: 89000,
      },
      {
        id: "printed-sticker",
        imageAlt: "브랜딩 패키지 샘플",
        imageSrc: coffeeBagImage,
        imageVariant: "bag",
        name: "브랜드 스티커 500매",
        price: 38000,
      },
      {
        id: "takeout-bag",
        imageAlt: "포장 봉투 샘플",
        imageSrc: coffeeBagImage,
        imageVariant: "bag",
        name: "테이크아웃 쇼핑백 1세트",
        price: 54000,
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
        imageSrc: teaCupImage,
        imageVariant: "photo",
        name: "16oz 아이스컵 1박스",
        price: 42000,
      },
      {
        id: "bean-bag",
        imageAlt: "원두 보관 패키지",
        imageSrc: coffeeBagImage,
        imageVariant: "bag",
        name: "원두 보관팩 200매",
        price: 31000,
      },
      {
        id: "straw-set",
        imageAlt: "카페 소모품 샘플",
        imageSrc: teaCupImage,
        imageVariant: "photo",
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
        imageSrc: coffeeBagImage,
        imageVariant: "bag",
        name: "에스프레소 머신 클리너",
        price: 24000,
      },
      {
        id: "sanitizer",
        imageAlt: "매장용 위생용품 샘플",
        imageSrc: teaCupImage,
        imageVariant: "photo",
        name: "매장용 살균 소독제",
        price: 16000,
      },
      {
        id: "wiper",
        imageAlt: "청소용품 패키지 샘플",
        imageSrc: coffeeBagImage,
        imageVariant: "bag",
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
        id: "gift-set",
        imageAlt: "기프트 세트 샘플",
        imageSrc: coffeeBagImage,
        imageVariant: "bag",
        name: "시즌 기프트 포장 세트",
        price: 48000,
      },
      {
        id: "signature-drink",
        imageAlt: "시그니처 음료 샘플",
        imageSrc: teaCupImage,
        imageVariant: "photo",
        name: "시그니처 레시피 카드",
        price: 12000,
      },
      {
        id: "display-kit",
        imageAlt: "매장 디스플레이 샘플",
        imageSrc: teaCupImage,
        imageVariant: "photo",
        name: "카운터 디스플레이 키트",
        price: 58000,
      },
    ],
  },
];

const priceFormatter = new Intl.NumberFormat("ko-KR");

export function formatPrice(price: number) {
  return `${priceFormatter.format(price)}원`;
}
