/**
 * 시드 지점(코드에 내장된 기본 매장)의 로그인 PIN — 서버 전용.
 *
 * 왜 이 파일이 있나
 *  - 점주 로그인 DB는 기존 `stores` 테이블(+ `pin_hash`)이다. 본사가 PIN을 발급하면
 *    DB의 해시가 기준이 되고, 이 파일은 **DB에 아직 PIN이 없을 때의 기본값**만 정한다.
 *  - 프로덕션에 Supabase 키가 없는 동안에는 DB에 아무것도 남지 않으므로, 점주 PIN을
 *    영구히 바꾸려면 이 표에 값을 적고 배포하는 것이 가장 확실한 길이다(코드가 곧 DB).
 *    Supabase 키가 들어오면 `/api/admin/owners`(또는 `/api/admin/stores/[code]`)의
 *    `set-pin`이 `pin_hash`를 갱신하고, 그때부터는 이 표보다 DB 값이 우선한다.
 *
 * 규칙
 *  - 값은 4자리 숫자 문자열. 원문 그대로 적지 않고, 저장·비교는 `pin.ts`의
 *    HMAC-SHA256 해시로만 한다(여기 적힌 값은 저장소 접근 권한자만 보는 초기 PIN이다).
 *  - 표에 값이 있는 지점은 `DEMO_PIN("0000")`이 더 이상 열리지 않는다.
 *  - 표에 없는 지점은 지금까지처럼 `DEMO_PIN`으로 열린다(시드 지점의 데모 안내).
 *
 * 예) 한예종점 PIN을 4821로 바꾸기
 *   STORE_HYJ: "4821",
 */

export const SEED_PINS: Record<string, string> = {
  // 새로 지정한 지점만 적는다. 비워 두면 시드 지점은 DEMO_PIN("0000")으로 열린다.
};

export function seedPinFor(code: string | null | undefined) {
  const key = (code ?? "").trim().toUpperCase();
  return SEED_PINS[key] ?? null;
}
