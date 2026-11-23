/**
 * 지점 정의와 자격증명 조회.
 *
 * 자격증명은 **오직 환경변수**에서 읽는다. 저장소·코드·로그에 값을 남기지 않는다.
 *   LOYALSUNS_<ENV>_ID / LOYALSUNS_<ENV>_PW
 *   ESCAL_<ENV>_ID     / ESCAL_<ENV>_PW      (ESCALPRINT_<ENV>_* 도 같은 값으로 인정)
 *
 * 없는 지점은 "설정 안 됨"으로 건너뛴다 — 실패가 아니라 아직 연결하지 않은 상태다.
 */

export const PORTALS = ["loyalsuns", "escalprint"];

export const STORES = {
  STORE_GNM: {
    storeCode: "STORE_GNM",
    storeId: "gangnam",
    label: "럭키스팟 강남구청역점",
    env: "GNM",
  },
  STORE_HYJ: {
    storeCode: "STORE_HYJ",
    storeId: "hanyeojong",
    label: "럭키스팟 한예종점",
    env: "HYJ",
  },
};

export const STORE_CODES = Object.keys(STORES);

export function resolveStores(requested) {
  const value = (requested ?? "all").trim();
  if (!value || value.toLowerCase() === "all") return STORE_CODES.map((code) => STORES[code]);

  const normalized = value.toUpperCase();
  const codes = normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const resolved = [];
  for (const code of codes) {
    if (!STORES[code]) throw new Error(`알 수 없는 지점 코드: ${code} (사용 가능: all, ${STORE_CODES.join(", ")})`);
    resolved.push(STORES[code]);
  }
  return resolved;
}

function env(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * 지점의 포털 자격증명. 값이 하나라도 없으면 null(그 포털은 건너뛴다).
 * 반환값은 절대 로그로 출력하지 않는다.
 */
export function credentialsFor(store) {
  const escalId = env(`ESCAL_${store.env}_ID`) ?? env(`ESCALPRINT_${store.env}_ID`);
  const escalPw = env(`ESCAL_${store.env}_PW`) ?? env(`ESCALPRINT_${store.env}_PW`);

  return {
    loyalsuns:
      env(`LOYALSUNS_${store.env}_ID`) && env(`LOYALSUNS_${store.env}_PW`)
        ? { id: env(`LOYALSUNS_${store.env}_ID`), password: env(`LOYALSUNS_${store.env}_PW`) }
        : null,
    escalprint: escalId && escalPw ? { id: escalId, password: escalPw } : null,
  };
}

/** 어떤 환경변수가 비어 있는지(이름만) 알려 준다 — 값은 절대 담지 않는다. */
export function missingCredentialNames(store) {
  const names = [];
  if (!env(`LOYALSUNS_${store.env}_ID`)) names.push(`LOYALSUNS_${store.env}_ID`);
  if (!env(`LOYALSUNS_${store.env}_PW`)) names.push(`LOYALSUNS_${store.env}_PW`);
  if (!(env(`ESCAL_${store.env}_ID`) ?? env(`ESCALPRINT_${store.env}_ID`))) names.push(`ESCAL_${store.env}_ID`);
  if (!(env(`ESCAL_${store.env}_PW`) ?? env(`ESCALPRINT_${store.env}_PW`))) names.push(`ESCAL_${store.env}_PW`);
  return names;
}

/** 자식 프로세스/스텝 요약에 남기기 전에 비밀번호 환경값을 지운다(방어용). */
export function redact(text) {
  if (typeof text !== "string") return text;
  let out = text;
  for (const [key, value] of Object.entries(process.env)) {
    if (!/(_PW|_PASSWORD|SECRET|TOKEN)$/i.test(key)) continue;
    if (!value || value.length < 4) continue;
    out = out.split(value).join("***");
  }
  return out;
}
