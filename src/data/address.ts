/**
 * 발주 페이지의 배송지 선택 값.
 *
 * 지점·점주 정보 중 실명·휴대폰은 공개 저장소에 두지 않는다.
 * 실제 목록은 Supabase `stores` 테이블에 있고, 브라우저는 서버 API(`/api/stores`)를
 * 통해 지점 코드·이름·주소만 받는다. 이 파일에는 개인정보가 없는 기본 값만 둔다.
 */

/** 지점 수령이 아닌 직접 입력 배송지(개인 주문)를 고를 때 쓰는 값 */
export const DIRECT_SHIPPING_VALUE = "DIRECT";

/** 직접 입력 배송지를 고를 때 드롭다운에 보여줄 이름 (기존 주문 기록과 같은 문구) */
export const DIRECT_SHIPPING_LABEL = "기타 배송지 주소입력 (개인주문)";
