export type ShopAddress = {
  value: string;
  label: string;
  name: string;
  phone: string;
  address: string;
};

export const DIRECT_SHIPPING_VALUE = "DIRECT";

export const shopAddresses: ShopAddress[] = [
  {
    value: "STORE_GNG",
    label: "럭키스팟 강남구청점",
    name: "권오성",
    phone: "010-9901-7189",
    address: "서울특별시 강남구 청담동 선릉로 714 도시빌딩 102호",
  },
  {
    value: "STORE_HYJ",
    label: "럭키스팟 한예종점",
    name: "복민근",
    phone: "010-6602-7309",
    address: "서울시 노원구 화랑로47길 38 (월계동 풍림아이원아파트) 108동 1001호",
  },
  {
    value: "STORE_CJ",
    label: "럭키스팟 충주점",
    name: "김민정",
    phone: "010-6602-7309",
    address: "충주시 남산6길 15 1층 럭키스팟 충주점",
  },
  {
    value: "STORE_PT",
    label: "럭키스팟 평택점",
    name: "정기원",
    phone: "010-2004-4000",
    address: "경기 평택시 송탄공원로 146 아주1차아파트 상가동 107호",
  },
  {
    value: "STORE_HQ",
    label: "럭키스팟 서울본사",
    name: "권오성",
    phone: "010-9901-7189",
    address: "서울특별시 강남구 청담동 선릉로 714 도시빌딩 102호",
  },
  {
    value: DIRECT_SHIPPING_VALUE,
    label: "기타 배송지 주소입력 (개인주문)",
    name: "",
    phone: "",
    address: "",
  },
];

export function getShopAddressByValue(value: string) {
  return shopAddresses.find((address) => address.value === value) ?? null;
}
