/**
 * 벤더 어댑터 계약 (수집기 쪽)
 *
 * 앱(`src/lib/vendors`)과 **같은 계약**을 수집기에서도 쓴다.
 * 수집기는 벤더별로 '무엇을 읽을 수 있는지'만 알고, 보내는 본문은 항상 표준 봉투다.
 *  - escalprint     : 포털 화면(토너 %·트레이 %·누적 카운터·월 정산)
 *  - yupisoft       : 포털/API JSON(장비·소모품 레벨·일/월 매출)
 *  - generic_webhook: 그 밖의 타사 — 표준 JSON 웹훅 + CSV(사람이 올림)
 *
 * 이 파일은 값 계산을 하지 않는다(정규화 본체는 앱의 어댑터). 수집기는
 * "어떤 포털을 열고, 어떤 필드를 긁어, 어떤 키로 보낼지"만 정한다.
 */

export const VENDOR_TYPES = ["escalprint", "generic_webhook", "yupisoft"];

export const VENDOR_LABELS = {
  escalprint: "에스칼프린트",
  generic_webhook: "타사 복합기(공용)",
  yupisoft: "유피소프트",
};

/**
 * @typedef {Object} CollectorVendorAdapter
 * @property {string} id
 * @property {string} label
 * @property {boolean} browser          브라우저 로그인 수집이 필요한가
 * @property {string[]} credentialEnv   필요한 환경변수 접미사 목록(값은 로그로 내보내지 않는다)
 * @property {(entry: object) => object} envelope  지점별 봉투(ingest-pos 본문) 만들기
 */

/** @returns {CollectorVendorAdapter} */
export function createAdapter(input) {
  return {
    id: input.id,
    label: input.label,
    browser: Boolean(input.browser),
    credentialEnv: input.credentialEnv ?? [],
    envelope: input.envelope,
  };
}

/** 알 수 없는 벤더는 에스칼프린트로 본다(기존 동작 유지). */
export function resolveVendorType(value) {
  const key = String(value ?? "").trim();
  return VENDOR_TYPES.includes(key) ? key : "escalprint";
}
