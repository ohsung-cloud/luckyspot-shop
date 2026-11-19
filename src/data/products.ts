/**
 * 럭키스팟 점주 발주 카탈로그.
 *
 * 단가 기준: 모두 **부가세 포함(VAT 포함) 실제 발주·결제 단가**입니다.
 *  - 원두: 대표 확정 단가 20,000원/kg (2026-11-19)
 *  - 파우더·베이스·농축: 더캐럿 발주 단가표 43품목 (2026-11-19, VAT 포함)
 *  - 시럽: 로얄선스 초도 발주 단가표 (소울티 1.3kg)
 *  - 컵·리드·필터·캡: 로얄선스 초도 발주 단가표 (2026-11-19)
 *  - 가구·식물·집기·비품: 영등포시장역점 2026-09~11 실구매 단가(쿠팡·네이버)
 *  - 프린트 물품: 기존 발주 단가(변동 없음)
 *
 * 값이 바뀌면 이 파일만 고치면 됩니다. 주문 금액은 서버에서 이 파일의 단가로 다시 계산합니다.
 */

export type ShopProduct = {
  id: string;
  name: string;
  /** 규격 표기 (예: "1kg · 10봉/박스") */
  spec: string;
  /** 부가세 포함 단가 */
  price: number;
  /** 판매 단위 (1봉·1개·1박스) */
  unit: string;
  vendor: string;
  /** 카드에 붙는 짧은 표시 */
  tag?: string;
  /** 단가 근거·주의 한 줄 */
  note?: string;
  imageSrc?: string;
  imageAlt?: string;
};

export type ShopCategory = {
  key: string;
  label: string;
  /** 카테고리 한 줄 설명 */
  note: string;
  products: ShopProduct[];
};

export type ShopBundle = {
  id: string;
  name: string;
  description: string;
  badge: string;
  items: { id: string; quantity: number }[];
};

const BEAN_IMG = "/assets/images/home/products/bean-bag.png";
const PAPER_IMG = "/assets/images/home/products/print-paper.png";

export const shopCategories: ShopCategory[] = [
  {
    key: "bean",
    label: "원두",
    note: "제이웨이브 레귤러핏 · 대표 확정 단가 20,000원/kg",
    products: [
      {
        id: "bean-1kg",
        name: "제이웨이브 레귤러핏 원두",
        spec: "1kg",
        price: 20000,
        unit: "1kg",
        vendor: "제이웨이브",
        tag: "확정단가",
        note: "1kg 20,000원 기준(2026-11 대표 확정)",
        imageSrc: BEAN_IMG,
        imageAlt: "원두 1kg 포장",
      },
      {
        id: "bean-10kg",
        name: "원두 1박스",
        spec: "10kg (1kg × 10)",
        price: 200000,
        unit: "1박스",
        vendor: "제이웨이브",
        tag: "10kg",
        note: "1kg 20,000원 × 10",
        imageSrc: BEAN_IMG,
        imageAlt: "원두 10kg 박스",
      },
      {
        id: "bean-30kg",
        name: "원두 3박스",
        spec: "30kg (10kg × 3)",
        price: 600000,
        unit: "3박스",
        vendor: "제이웨이브",
        tag: "월 발주",
        note: "매장 규모가 큰 경우 월 1회 발주 단위",
        imageSrc: BEAN_IMG,
        imageAlt: "원두 30kg",
      },
      {
        id: "bean-decaf",
        name: "디카페인 원두 카페모어",
        spec: "1개",
        price: 19990,
        unit: "1개",
        vendor: "실구매",
        note: "영등포점 실구매 2개 39,980원 기준",
      },
    ],
  },
  {
    key: "powder",
    label: "파우더·베이스",
    note: "더캐럿 43품목 · 부가세 포함 단가",
    products: [
      {
        id: "tc-01",
        name: "매일쓰는 녹차 파우더",
        spec: "1kg · 10봉/박스",
        price: 10450,
        unit: "1봉",
        vendor: "더캐럿",
        tag: "말차",
      },
      {
        id: "tc-02",
        name: "매일쓰는 요거트 파우더",
        spec: "1kg · 10봉/박스",
        price: 6050,
        unit: "1봉",
        vendor: "더캐럿",
        tag: "요거트",
      },
      {
        id: "tc-03",
        name: "매일쓰는 초코 파우더",
        spec: "1kg · 10봉/박스",
        price: 8250,
        unit: "1봉",
        vendor: "더캐럿",
        tag: "인기",
      },
      {
        id: "tc-04",
        name: "매일쓰는 밀크티 파우더",
        spec: "1kg · 10봉/박스",
        price: 6600,
        unit: "1봉",
        vendor: "더캐럿",
        tag: "인기",
      },
      {
        id: "tc-05",
        name: "매일쓰는 복숭아아이스티",
        spec: "1kg · 10봉/박스",
        price: 5280,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-06",
        name: "매일쓰는 토피넛 파우더",
        spec: "1kg · 10봉/박스",
        price: 9350,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-07",
        name: "허니 바닐라 베이스",
        spec: "1kg · 10봉/박스",
        price: 6820,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-08",
        name: "허니 밀크 베이스",
        spec: "1kg · 10봉/박스",
        price: 7150,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-09",
        name: "허니 마 베이스",
        spec: "1kg · 10봉/박스",
        price: 9570,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-10",
        name: "찐찐 고구마 파우더",
        spec: "800g · 10봉/박스",
        price: 10230,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-11",
        name: "찐찐 황치즈 파우더",
        spec: "800g · 10봉/박스",
        price: 10780,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-12",
        name: "찐찐 단호박 파우더",
        spec: "800g · 10봉/박스",
        price: 8250,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-13",
        name: "찐찐 커피믹스 파우더",
        spec: "800g · 10봉/박스",
        price: 9900,
        unit: "1봉",
        vendor: "더캐럿",
        tag: "다방커피",
      },
      {
        id: "tc-14",
        name: "아이스크림맛 파우더 딸기",
        spec: "1kg · 10봉/박스",
        price: 8250,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-15",
        name: "아이스크림맛 파우더 블루",
        spec: "1kg · 10봉/박스",
        price: 8250,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-16",
        name: "아이스크림맛 파우더 커피사냥",
        spec: "800g · 10봉/박스",
        price: 6600,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-17",
        name: "약과 파우더",
        spec: "800g · 10봉/박스",
        price: 8800,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-18",
        name: "망콩 올무 파우더",
        spec: "800g · 10봉/박스",
        price: 9350,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-19",
        name: "밤 파우더",
        spec: "800g · 10봉/박스",
        price: 7700,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-20",
        name: "안동 냥마 파우더",
        spec: "1kg · 10봉/박스",
        price: 9570,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-21",
        name: "밀크쉐이크 파우더",
        spec: "800g · 10봉/박스",
        price: 7150,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-22",
        name: "바닐라 파우더",
        spec: "1kg · 10봉/박스",
        price: 8580,
        unit: "1봉",
        vendor: "더캐럿",
        tag: "인기",
      },
      {
        id: "tc-23",
        name: "프라페 파우더",
        spec: "1kg · 10봉/박스",
        price: 6600,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-24",
        name: "체리 파우더",
        spec: "500g 파우치 · 10봉/박스",
        price: 4180,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-25",
        name: "망고 파우더",
        spec: "500g 파우치 · 10봉/박스",
        price: 4290,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-26",
        name: "자몽 허니 블랙티",
        spec: "500g 파우치 · 10봉/박스",
        price: 4180,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-27",
        name: "크림라떼 파우더 슈크림",
        spec: "350g · 10봉/박스",
        price: 5280,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-28",
        name: "크림라떼 파우더 아마레또",
        spec: "350g · 10봉/박스",
        price: 4180,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-29",
        name: "크림라떼 파우더 토피넛",
        spec: "350g · 10봉/박스",
        price: 4730,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-30",
        name: "크림라떼 파우더 티라미수",
        spec: "350g · 10봉/박스",
        price: 5280,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-31",
        name: "그라데이션 파우더 500g",
        spec: "100g × 5팩 · 10봉/박스",
        price: 9570,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-32",
        name: "그라데이션 파우더",
        spec: "1kg · 12봉/박스",
        price: 9350,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-33",
        name: "블루바이올렛 파우더",
        spec: "500g · 10봉/박스",
        price: 9570,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-34",
        name: "우메 파우더",
        spec: "1kg · 10봉/박스",
        price: 9020,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-35",
        name: "제로슈가 복숭아아이스티",
        spec: "1kg · 10봉/박스",
        price: 8800,
        unit: "1봉",
        vendor: "더캐럿",
        tag: "제로슈가",
      },
      {
        id: "tc-36",
        name: "제로슈가 레몬아이스티",
        spec: "1kg · 10봉/박스",
        price: 8470,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-37",
        name: "제로슈가 매실아이스티",
        spec: "1kg · 10봉/박스",
        price: 8470,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "tc-38",
        name: "제로슈가 에사비 파우더",
        spec: "1kg · 10봉/박스",
        price: 8580,
        unit: "1봉",
        vendor: "더캐럿",
      },
    ],
  },
  {
    key: "syrup",
    label: "시럽·농축",
    note: "더캐럿 농축액 + 소울티 시럽 1.3kg",
    products: [
      {
        id: "tc-39",
        name: "제로슈가 에너지 베이스",
        spec: "1.12kg · 6개/박스",
        price: 14300,
        unit: "1개",
        vendor: "더캐럿",
      },
      {
        id: "tc-40",
        name: "(레드) 제로슈가 에너지 베이스",
        spec: "1.12kg · 6개/박스",
        price: 14300,
        unit: "1개",
        vendor: "더캐럿",
      },
      {
        id: "tc-41",
        name: "에너지 베이스",
        spec: "1.12kg · 6개/박스",
        price: 8580,
        unit: "1개",
        vendor: "더캐럿",
      },
      {
        id: "tc-42",
        name: "매일쓰는 복숭아아이스티 베이스",
        spec: "1.12kg · 6개/박스",
        price: 7150,
        unit: "1개",
        vendor: "더캐럿",
      },
      {
        id: "syrup-lemon",
        name: "소울티 레몬 시럽",
        spec: "1.3kg",
        price: 15400,
        unit: "1개",
        vendor: "로얄선스",
        tag: "초도",
      },
      {
        id: "syrup-apple",
        name: "소울티 사과 시럽",
        spec: "1.3kg",
        price: 15400,
        unit: "1개",
        vendor: "로얄선스",
        tag: "초도",
      },
      {
        id: "syrup-peach",
        name: "소울티 복숭아 시럽",
        spec: "1.3kg",
        price: 14300,
        unit: "1개",
        vendor: "로얄선스",
        tag: "초도",
      },
      {
        id: "syrup-grape",
        name: "소울티 청포도 시럽",
        spec: "1.3kg",
        price: 14300,
        unit: "1개",
        vendor: "로얄선스",
        tag: "초도",
      },
      {
        id: "syrup-yuja",
        name: "유자청 베이스",
        spec: "1개",
        price: 27000,
        unit: "1개",
        vendor: "실구매",
        note: "영등포점 실구매 3건 81,000원 기준",
      },
    ],
  },
  {
    key: "cup",
    label: "컵·포장",
    note: "16온즈 컵·리드·캡 · 1,000개 단위",
    products: [
      {
        id: "cup-plastic-16",
        name: "16온즈 플라스틱컵 92파이",
        spec: "1,000개",
        price: 72600,
        unit: "1박스",
        vendor: "로얄선스",
        tag: "초도",
      },
      {
        id: "cup-paper-16",
        name: "16온즈 친환경 종이컵",
        spec: "1,000개",
        price: 72600,
        unit: "1박스",
        vendor: "로얄선스",
        tag: "초도",
      },
      {
        id: "lid-white-16",
        name: "16온즈 흰색 컵리드",
        spec: "1,000개",
        price: 34430,
        unit: "1박스",
        vendor: "로얄선스",
        tag: "초도",
      },
      {
        id: "lid-clear-16",
        name: "16온즈 투명 컵리드 92파이",
        spec: "1,000개",
        price: 38500,
        unit: "1박스",
        vendor: "로얄선스",
        tag: "초도",
      },
      {
        id: "silicone-cap",
        name: "실리콘 캡(대)",
        spec: "1개",
        price: 2200,
        unit: "1개",
        vendor: "로얄선스",
      },
      {
        id: "straw-free-lid",
        name: "스트로우프리 뚜껑",
        spec: "1박스",
        price: 32490,
        unit: "1박스",
        vendor: "실구매",
        note: "영등포점 2026-10 실구매",
      },
      {
        id: "cup-holder",
        name: "컵홀더",
        spec: "1박스",
        price: 24200,
        unit: "1박스",
        vendor: "실구매",
        note: "영등포점 실구매 4건 평균",
      },
      {
        id: "straw",
        name: "빨대",
        spec: "1박스",
        price: 14650,
        unit: "1박스",
        vendor: "실구매",
        note: "영등포점 실구매 4건 평균",
      },
      {
        id: "napkin",
        name: "냅킨",
        spec: "1박스",
        price: 12530,
        unit: "1박스",
        vendor: "실구매",
        note: "영등포점 실구매 2건 평균",
      },
    ],
  },
  {
    key: "supply",
    label: "부자재·위생",
    note: "필터·세척·매장 소모품",
    products: [
      {
        id: "water-filter",
        name: "정수·연수 필터",
        spec: "1EA (에버퓨어 스케일억제)",
        price: 440000,
        unit: "1개",
        vendor: "로얄선스",
        tag: "초도 필수",
        note: "초도물품에서 가장 큰 단일 항목 — 교체 주기 관리 필요",
      },
      {
        id: "machine-cleaner",
        name: "에스프레소 머신 클리너",
        spec: "1개",
        price: 24000,
        unit: "1개",
        vendor: "기존 단가",
      },
      {
        id: "sanitizer",
        name: "매장용 살균 소독제",
        spec: "1개",
        price: 16000,
        unit: "1개",
        vendor: "기존 단가",
      },
      {
        id: "wiper",
        name: "극세사 와이퍼",
        spec: "10매",
        price: 19000,
        unit: "1팩",
        vendor: "기존 단가",
      },
      {
        id: "cinnamon-stick",
        name: "시나몬 스틱 12cm",
        spec: "15스틱 · 40봉/박스",
        price: 3850,
        unit: "1봉",
        vendor: "더캐럿",
      },
      {
        id: "trash-bag",
        name: "분리수거 쓰레기통 75L",
        spec: "1개",
        price: 21163,
        unit: "1개",
        vendor: "실구매",
        note: "영등포점 3개 63,490원 기준",
      },
      {
        id: "floor-cloth",
        name: "극세사 손걸레",
        spec: "1팩",
        price: 4920,
        unit: "1팩",
        vendor: "실구매",
      },
      {
        id: "tile-cleaner",
        name: "타일 크리너",
        spec: "1개",
        price: 14850,
        unit: "1개",
        vendor: "실구매",
      },
      {
        id: "hygiene-towel",
        name: "위생 행주",
        spec: "1팩",
        price: 12300,
        unit: "1팩",
        vendor: "실구매",
      },
      {
        id: "broom-set",
        name: "빗자루 세트",
        spec: "1세트",
        price: 9990,
        unit: "1세트",
        vendor: "실구매",
      },
      {
        id: "wood-coaster",
        name: "나무 슬라이스 우드 코스터",
        spec: "1세트",
        price: 9900,
        unit: "1세트",
        vendor: "실구매",
      },
      {
        id: "entry-sign",
        name: "진입판(특대)",
        spec: "1개",
        price: 55000,
        unit: "1개",
        vendor: "실구매",
        note: "영등포점 2개 110,000원 기준",
      },
      {
        id: "diffuser",
        name: "대용량 디퓨저 500ml",
        spec: "1개",
        price: 7020,
        unit: "1개",
        vendor: "실구매",
        note: "영등포점 5개 35,100원 기준",
      },
      {
        id: "cushion",
        name: "소프트 원형 방석",
        spec: "2개 1세트",
        price: 11800,
        unit: "1세트",
        vendor: "실구매",
      },
    ],
  },
  {
    key: "furniture",
    label: "가구·집기",
    note: "영등포시장역점 실측 구매 단가",
    products: [
      {
        id: "table-round-600",
        name: "화이트 자작 엔드 600 원형 테이블",
        spec: "지름 600 · 36T 라운딩",
        price: 88000,
        unit: "1개",
        vendor: "위드퍼니처",
        note: "11-04 재구매 단가(10-11 176,000원 → 인하)",
      },
      {
        id: "table-milky-600",
        name: "밀키우드 600 원형 2인 식탁",
        spec: "HPM · 지름 600",
        price: 63000,
        unit: "1개",
        vendor: "위드퍼니처",
      },
      {
        id: "table-standing",
        name: "피크 스탠딩테이블",
        spec: "1400 × 360",
        price: 127710,
        unit: "1개",
        vendor: "마켓비",
      },
      {
        id: "table-side-wood",
        name: "와비사비 원목 사이드테이블",
        spec: "내추럴우드",
        price: 76000,
        unit: "1개",
        vendor: "쿠팡",
      },
      {
        id: "chair-elena",
        name: "엘레나 원목의자",
        spec: "1+1 (2개)",
        price: 119900,
        unit: "1세트",
        vendor: "쿠팡",
        note: "2개 1세트 기준",
      },
      {
        id: "bench-damso",
        name: "담소 1200 수납 벤치의자",
        spec: "1개",
        price: 106300,
        unit: "1개",
        vendor: "쿠팡",
        note: "2개 212,600원 기준",
      },
      {
        id: "stool-onestool",
        name: "원목 보조의자 원스툴",
        spec: "1개",
        price: 32700,
        unit: "1개",
        vendor: "쿠팡",
        note: "2개 65,400원 기준",
      },
      {
        id: "stool-oak",
        name: "오크 패브릭 스툴 아이보리",
        spec: "1개",
        price: 19200,
        unit: "1개",
        vendor: "쿠팡",
        note: "3개 57,600원 기준",
      },
      {
        id: "magazine-rack",
        name: "모아이 매거진렉",
        spec: "1개",
        price: 92000,
        unit: "1개",
        vendor: "네이버",
      },
      {
        id: "paper-rack",
        name: "페이퍼팝 매거진랙",
        spec: "1개",
        price: 18900,
        unit: "1개",
        vendor: "네이버",
      },
      {
        id: "dispenser-8",
        name: "오리스타 우드 디스펜서 8구",
        spec: "1개",
        price: 124000,
        unit: "1개",
        vendor: "네이버",
        note: "메가커피몰 59,900원 등 대안 있음 — 다음 지점은 약 6만원 절감 가능",
      },
      {
        id: "cabinet-curtain",
        name: "캐비닛 커튼",
        spec: "1개",
        price: 18730,
        unit: "1개",
        vendor: "쿠팡",
      },
      {
        id: "ceiling-light",
        name: "일본 패브릭 천장등",
        spec: "1개",
        price: 14900,
        unit: "1개",
        vendor: "쿠팡",
      },
    ],
  },
  {
    key: "plant",
    label: "식물·플랜테리어",
    note: "관엽·조화·화분 (쿠팡 실구매)",
    products: [
      {
        id: "plant-hongkong-large",
        name: "홍콩야자 중대형 온달 화분",
        spec: "1개",
        price: 67000,
        unit: "1개",
        vendor: "쿠팡",
      },
      {
        id: "plant-hongkong",
        name: "홍콩야자 중형 화분",
        spec: "1개",
        price: 31300,
        unit: "1개",
        vendor: "쿠팡",
      },
      {
        id: "plant-pachira",
        name: "파키라 조화 화분",
        spec: "1개",
        price: 32500,
        unit: "1개",
        vendor: "쿠팡",
        note: "조화 — 관리 부담이 적음",
      },
      {
        id: "plant-monstera-set",
        name: "몬스테라 + 테이블야자 세트",
        spec: "1세트",
        price: 24300,
        unit: "1세트",
        vendor: "쿠팡",
      },
      {
        id: "plant-mostera",
        name: "모스트레이 공기정화 식물",
        spec: "와이드 21cm",
        price: 18300,
        unit: "1개",
        vendor: "쿠팡",
      },
      {
        id: "plant-mini-light",
        name: "미니 모니트리 + 식물 조명",
        spec: "넝쿨식물 세트",
        price: 42800,
        unit: "1세트",
        vendor: "쿠팡",
      },
      {
        id: "plant-nutrient",
        name: "식물 영양제 35ml",
        spec: "20개",
        price: 5180,
        unit: "1세트",
        vendor: "쿠팡",
      },
    ],
  },
  {
    key: "print",
    label: "프린트",
    note: "복합기 용지·토너 (변동 없음)",
    products: [
      {
        id: "a4-paper",
        name: "A4 용지 75g",
        spec: "2,500매",
        price: 23000,
        unit: "1박스",
        vendor: "기존 단가",
        imageSrc: PAPER_IMG,
        imageAlt: "A4 용지",
      },
      {
        id: "a3-paper",
        name: "A3 용지 75g",
        spec: "2,500매",
        price: 75000,
        unit: "1박스",
        vendor: "기존 단가",
        imageSrc: PAPER_IMG,
        imageAlt: "A3 용지",
      },
      {
        id: "b4-paper",
        name: "B4 용지 75g",
        spec: "2,500매",
        price: 44000,
        unit: "1박스",
        vendor: "기존 단가",
        imageSrc: PAPER_IMG,
        imageAlt: "B4 용지",
      },
      {
        id: "toner-black",
        name: "복합기 정품 검정토너 (K)",
        spec: "1개",
        price: 99800,
        unit: "1개",
        vendor: "기존 단가",
      },
      {
        id: "toner-color",
        name: "복합기 정품 컬러토너 (C/M/Y)",
        spec: "1개",
        price: 149800,
        unit: "1개",
        vendor: "기존 단가",
      },
    ],
  },
];

export const allProducts: ShopProduct[] = shopCategories.flatMap((category) => category.products);

/** 초도·필수 세트. 금액은 위 단가로 자동 계산한다. */
export const shopBundles: ShopBundle[] = [
  {
    id: "bundle-opening",
    name: "초도 세트 · 카페 기본",
    description:
      "원두 10kg + 파우더 6종×3봉 + 시럽 4종×3개 + 컵·리드 4종 + 필터·캡. 개업 첫 발주 구성 그대로.",
    badge: "초도 17종",
    items: [
      { id: "bean-10kg", quantity: 1 },
      { id: "tc-01", quantity: 3 },
      { id: "tc-03", quantity: 3 },
      { id: "tc-04", quantity: 3 },
      { id: "tc-05", quantity: 3 },
      { id: "tc-22", quantity: 3 },
      { id: "tc-02", quantity: 3 },
      { id: "syrup-lemon", quantity: 3 },
      { id: "syrup-apple", quantity: 3 },
      { id: "syrup-peach", quantity: 3 },
      { id: "syrup-grape", quantity: 3 },
      { id: "cup-plastic-16", quantity: 1 },
      { id: "cup-paper-16", quantity: 1 },
      { id: "lid-white-16", quantity: 1 },
      { id: "lid-clear-16", quantity: 1 },
      { id: "water-filter", quantity: 1 },
      { id: "silicone-cap", quantity: 4 },
    ],
  },
  {
    id: "bundle-refill",
    name: "월간 보충 세트",
    description: "원두 2kg + 인기 파우더 4종 1봉씩 + 컵·리드 각 1박스. 매달 반복되는 기본 보충.",
    badge: "정기 보충",
    items: [
      { id: "bean-1kg", quantity: 2 },
      { id: "tc-03", quantity: 1 },
      { id: "tc-04", quantity: 1 },
      { id: "tc-22", quantity: 1 },
      { id: "tc-02", quantity: 1 },
      { id: "cup-plastic-16", quantity: 1 },
      { id: "lid-clear-16", quantity: 1 },
    ],
  },
  {
    id: "bundle-cleaning",
    name: "오픈 청소·위생 세트",
    description: "머신 클리너·살균 소독제·와이퍼·손걸레·쓰레기통. 개업 전 한 번에 준비.",
    badge: "위생",
    items: [
      { id: "machine-cleaner", quantity: 1 },
      { id: "sanitizer", quantity: 1 },
      { id: "wiper", quantity: 1 },
      { id: "floor-cloth", quantity: 1 },
      { id: "trash-bag", quantity: 2 },
    ],
  },
  {
    id: "bundle-furniture",
    name: "가구·식물 기본 세트",
    description: "2인 테이블 2 + 의자 2세트 + 매거진렉 + 관엽 3점. 8평 매장 기본 구성.",
    badge: "오픈",
    items: [
      { id: "table-milky-600", quantity: 2 },
      { id: "chair-elena", quantity: 2 },
      { id: "magazine-rack", quantity: 1 },
      { id: "plant-hongkong", quantity: 1 },
      { id: "plant-pachira", quantity: 1 },
      { id: "plant-monstera-set", quantity: 1 },
    ],
  },
];

const priceFormatter = new Intl.NumberFormat("ko-KR");

export function formatPrice(price: number) {
  return `${priceFormatter.format(price)}원`;
}

export function getProductById(id: string) {
  return allProducts.find((product) => product.id === id) ?? null;
}

export function findCategoryKeyOf(productId: string) {
  return (
    shopCategories.find((category) =>
      category.products.some((product) => product.id === productId),
    )?.key ?? ""
  );
}

/** 부가세 포함 금액 → 공급가액·부가세 분해. */
export function splitVat(totalIncluded: number) {
  const supply = Math.round(totalIncluded / 1.1);
  return { supply, vat: totalIncluded - supply, total: totalIncluded };
}

export function bundlePrice(bundle: ShopBundle) {
  return bundle.items.reduce((sum, item) => {
    const product = getProductById(item.id);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);
}

export function bundleItemCount(bundle: ShopBundle) {
  return bundle.items.reduce((sum, item) => sum + item.quantity, 0);
}
