/**
 * 시드 지점의 점주 로그인 ID·초기 비밀번호 해시 — 서버 전용.
 *
 * 기준(대표 확정 2026-11-25)
 *   한예종점        luckyspot-hyj        (luckyspot-hyj@naver.com 도 같은 지점)
 *   충주점          luckyspot98
 *   평택점          luckyspot5
 *   강남구청점      luckyspot-gangnam
 *   영등포시장역점  luckyspot-ydp        (luckyspot-yeongdeungpo 도 같은 지점)
 *   선유로점        luckyspot-seonyu
 *   초기 비밀번호는 모두 123456 — 아래에는 **해시만** 둔다(원문은 코드·DB 어디에도 남기지 않는다).
 *   네이버 계정의 실제 비밀번호는 코드에 넣지 않는다. 아이디만 네이버 아이디와 맞춘 것이다.
 *
 * 어떻게 동작하나
 *  - 본사가 `/api/admin/owners`(또는 `/api/admin/stores/[code]`)로 아이디·비밀번호를 바꾸면
 *    Supabase `stores.login_id · password_hash` 가 우선한다. 이 표는 **DB에 값이 없을 때의 기본값**이다.
 *  - Supabase 키가 없는 환경(지금 프로덕션)에서는 이 표 + 인메모리 변경이 기준이다.
 *    영구 변경은 이 파일을 고쳐 배포하는 것이 가장 확실하다.
 *
 * 해시 규칙은 `login-id.ts`의 `hashStorePassword`와 같다.
 *   HMAC-SHA256(key = "luckyspot-store-login|" + 지점코드, message = 비밀번호) → hex
 *   확인: node -e '...' 로 다시 계산해 바꿀 수 있다(비밀번호를 바꿀 때는 새 해시를 적는다).
 */

export type SeedLogin = {
  loginId: string;
  /** 같은 지점으로 들어오는 다른 표기(네이버 메일 주소 등) */
  aliases: string[];
  /** HMAC-SHA256 해시(hex) — 초기 비밀번호 123456 */
  passwordHash: string;
};

export const SEED_LOGINS: Record<string, SeedLogin> = {
  STORE_HYJ: {
    aliases: ["luckyspot-hyj@naver.com"],
    loginId: "luckyspot-hyj",
    passwordHash: "cfc236a29a9006f5f3ccaf90bf73c7fa318b4e786dddcbf13c4e877bcb29eb77",
  },
  STORE_CJ: {
    aliases: [],
    loginId: "luckyspot98",
    passwordHash: "63c1e343cd0e6cf7b3cfdf05470b12c1b5db8b27077c15fbe2630d20f58e4bdf",
  },
  STORE_PTK: {
    aliases: [],
    loginId: "luckyspot5",
    passwordHash: "2e2d8b45e0c7621644a431a02649a137031f1344354cb21c11fe25e1e420f3d3",
  },
  STORE_GNM: {
    aliases: [],
    loginId: "luckyspot-gangnam",
    passwordHash: "dfdbf68e7f3f605ac7e6fe3d0ddeba6f8dbbda48abf84ce528e19c8255a45656",
  },
  STORE_YDP: {
    aliases: ["luckyspot-yeongdeungpo"],
    loginId: "luckyspot-ydp",
    passwordHash: "427433454b3aba5af964a5628ee0fe840d8c5372e931a6790fbbb68c46327388",
  },
  STORE_SYU: {
    aliases: [],
    loginId: "luckyspot-seonyu",
    passwordHash: "26a6a602bdbe27d442a41af6f1cc8d97dd9b32235a18d07d2bcc4fd75aeb95ab",
  },
};

/**
 * 여러 지점을 한 아이디로 관리하는 경우 — 아이디를 넣으면 고를 수 있는 지점 목록을 준다.
 * 네이버 본계정(kwonohsungdesign) 하나에 묶인 직영 3개 지점(강남구청·영등포시장역·선유로)이 그렇다.
 * (기본 로그인은 지점별 개별 아이디다. 이건 보조 수단일 뿐이다.)
 */
export const SEED_LOGIN_GROUPS: Record<string, string[]> = {
  kwonohsungdesign: ["STORE_GNM", "STORE_YDP", "STORE_SYU"],
  "kwonohsungdesign@naver.com": ["STORE_GNM", "STORE_YDP", "STORE_SYU"],
};

export function seedLoginFor(code: string | null | undefined): SeedLogin | null {
  const key = (code ?? "").trim().toUpperCase();
  return SEED_LOGINS[key] ?? null;
}
