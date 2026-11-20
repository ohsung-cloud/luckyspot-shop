/**
 * 토스페이먼츠 키 해석 (서버 전용).
 *
 * 환경변수 (Vercel → luckyspot-shop → Settings → Environment Variables)
 *   NEXT_PUBLIC_TOSS_CLIENT_KEY   클라이언트 키(live_gck_… / test_gck_…)
 *   TOSS_SECRET_KEY               시크릿 키(live_gsk_… / test_gsk_…) — 브라우저로 절대 내보내지 않는다
 *
 * 원칙
 *  · 두 값이 모두 있으면 그 키를 쓴다. 둘 다 live_ 로 시작할 때만 실결제 모드다.
 *  · 하나만 있으면 설정이 반쪽이라 결제를 열지 않는다(설정 오류를 조용히 넘기지 않는다).
 *  · 둘 다 없으면 토스페이먼츠 문서용 테스트 키로 "테스트 결제 모드"로 동작한다.
 *    테스트 키는 실제 돈이 나가지 않고, 테스트 모드에서는 알림톡·구글시트 전달도 하지 않는다.
 */

/** 토스페이먼츠 개발자센터 문서에 공개된 결제 연동 테스트 키(테스트 상점). */
export const TOSS_TEST_CLIENT_KEY = "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm";
export const TOSS_TEST_SECRET_KEY = "test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6";

export type TossKeys =
  | { ok: true; clientKey: string; secretKey: string; testMode: boolean }
  | { ok: false; reason: "incomplete" };

function readEnv(name: string) {
  return (process.env[name] ?? "").trim();
}

export function resolveTossKeys(): TossKeys {
  const clientKey = readEnv("NEXT_PUBLIC_TOSS_CLIENT_KEY");
  const secretKey = readEnv("TOSS_SECRET_KEY");

  if (Boolean(clientKey) !== Boolean(secretKey)) {
    return { ok: false, reason: "incomplete" };
  }

  if (clientKey && secretKey) {
    const liveClient = clientKey.startsWith("live_");
    const liveSecret = secretKey.startsWith("live_");

    return { clientKey, ok: true, secretKey, testMode: !(liveClient && liveSecret) };
  }

  return {
    clientKey: TOSS_TEST_CLIENT_KEY,
    ok: true,
    secretKey: TOSS_TEST_SECRET_KEY,
    testMode: true,
  };
}

/** 화면 배지용 — 키가 설정되지 않았으면 테스트 모드로 본다. */
export function isTossTestMode() {
  const keys = resolveTossKeys();

  return keys.ok ? keys.testMode : true;
}

/** 테스트 모드에서는 실제 알림톡·구글시트 전달을 하지 않는다(오발송·운영 데이터 오염 방지). */
export function shouldSuppressOperations(testMode: boolean) {
  return testMode || process.env.TOSS_TEST_SUPPRESS_NOTIFICATIONS === "1";
}
