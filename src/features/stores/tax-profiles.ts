import { readSupabaseConfig, SUPABASE_TIMEOUT_MS, supabaseHeaders } from "@/features/supabase/config";

/**
 * 지점별 전자세금계산서 발급 정보 — **서버 전용**.
 *
 * 점주가 주문서에 사업자등록번호·상호·대표자·수취 이메일을 직접 입력하지 않는다.
 * 지점 코드만 서버로 오면, 이 모듈이 그 지점에 등록된 사업자 정보를 찾아
 * 주문 기록·발주 알림·구글시트에 붙인다.
 *
 * 지켜야 할 경계
 *  - 이 파일은 서버(API Route)에서만 import 한다. 클라이언트 컴포넌트에서 import 하면
 *    사업자 정보가 브라우저 번들로 나간다(그래서 "use client" 파일에서 절대 쓰지 않는다).
 *  - 어떤 GET API 도 이 값을 그대로 내려주지 않는다. 화면에는 "발급 요청함"만 보인다.
 *  - 값이 없는 지점은 null 을 돌려주고, 주문은 그대로 접수된다(본사가 확인해 채운다).
 *
 * 값을 넣는 곳 (우선순위)
 *  1) 환경변수 `SHOP_TAX_PROFILES` — Vercel 서버 환경변수(브라우저 번들에 안 들어간다)
 *     {"STORE_GNM":{"businessNo":"0000000000","businessName":"상호","ceoName":"대표자",
 *                   "email":"tax@example.com","businessType":"업태","businessItem":"종목"}}
 *  2) Supabase `store_tax_profiles` 테이블 (RLS 켜짐·정책 없음 → 서버 키만 접근)
 *  3) 예전 설계의 Supabase `stores` 컬럼(business_no·business_name·ceo_name·tax_email·…)
 */

export type StoreTaxProfile = {
  /** 사업자등록번호 10자리(숫자만) */
  businessNo: string;
  /** 상호(법인명) */
  businessName: string;
  /** 대표자명 */
  ceoName: string;
  /** 세금계산서 수취 이메일 */
  email: string;
  /** 업태 */
  businessType: string;
  /** 종목 */
  businessItem: string;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const MISSING_RETRY_MS = 60 * 1000;

/**
 * 예전 코드와 지금 코드가 같은 매장을 가리킨다.
 *  · STORE_GNG(강남구청점) = STORE_GNM(강남구청역점)
 *  · STORE_PT(평택점)      = STORE_PTK(평택점)
 * 어느 코드로 주문이 와도 같은 사업자 정보를 찾도록 양쪽을 함께 조회한다.
 */
const STORE_CODE_ALIASES: Record<string, string> = {
  STORE_GNG: "STORE_GNM",
  STORE_GMN: "STORE_GNM",
  STORE_GNM: "STORE_GNG",
  STORE_PT: "STORE_PTK",
  STORE_PTK: "STORE_PT",
};

const STORE_CODE_PATTERN = /^[A-Za-z0-9_-]{2,40}$/;

type CacheEntry = { expiresAt: number; profile: StoreTaxProfile | null };

const cache = new Map<string, CacheEntry>();
let missingTableUntil = 0;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function digits(value: unknown) {
  return text(value).replace(/\D/g, "").slice(0, 10);
}

/**
 * 여러 저장소(환경변수 JSON·DB 컬럼)에서 온 모양을 하나로 맞춘다.
 * snake_case(DB)와 camelCase(환경변수)를 모두 받는다.
 */
function normalize(raw: unknown): StoreTaxProfile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const row = raw as Record<string, unknown>;
  const pick = (camel: string, snake: string) => (row[camel] !== undefined ? row[camel] : row[snake]);

  const profile: StoreTaxProfile = {
    businessNo: digits(pick("businessNo", "business_no")),
    businessName: text(pick("businessName", "business_name")),
    ceoName: text(pick("ceoName", "ceo_name")),
    email: text(pick("email", "tax_email")),
    businessType: text(pick("businessType", "business_type")),
    businessItem: text(pick("businessItem", "business_item")),
  };

  return hasAnyValue(profile) ? profile : null;
}

export function hasAnyValue(profile: StoreTaxProfile | null) {
  if (!profile) return false;
  return Object.values(profile).some((value) => value.length > 0);
}

/**
 * 세금계산서를 실제로 뗄 수 있는 최소 조건 — 사업자번호 10자리·상호·대표자.
 * 수취 이메일은 없어도 홈택스에서 사업자번호로 발급할 수 있어 필수로 두지 않는다(알림에만 표시).
 */
export function isIssuableProfile(profile: StoreTaxProfile | null) {
  if (!profile) return false;

  return (
    profile.businessNo.length === 10 &&
    profile.businessName.length > 0 &&
    profile.ceoName.length > 0
  );
}

function candidateCodes(storeCode: string) {
  const code = storeCode.trim();
  if (!STORE_CODE_PATTERN.test(code)) return [];

  const alias = STORE_CODE_ALIASES[code];

  return alias && alias !== code ? [code, alias] : [code];
}

/* ------------------------------------------------------------------------- */
/* 1) 환경변수 SHOP_TAX_PROFILES                                               */
/* ------------------------------------------------------------------------- */

let envCache: { raw: string; map: Record<string, StoreTaxProfile> } | null = null;

function envProfiles(): Record<string, StoreTaxProfile> {
  const raw = (process.env.SHOP_TAX_PROFILES ?? "").trim();

  if (!raw) return {};
  if (envCache?.raw === raw) return envCache.map;

  const map: Record<string, StoreTaxProfile> = {};

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [code, value] of Object.entries(parsed as Record<string, unknown>)) {
        const profile = normalize(value);
        if (profile) map[code.trim().toUpperCase()] = profile;
      }
    }
  } catch (error) {
    console.error(
      "[tax-profiles] SHOP_TAX_PROFILES 는 JSON 이어야 합니다:",
      error instanceof Error ? error.message : error,
    );
  }

  envCache = { raw, map };

  return map;
}

/* ------------------------------------------------------------------------- */
/* 2) Supabase store_tax_profiles · 3) stores 예전 컬럼                          */
/* ------------------------------------------------------------------------- */

const TABLE_COLUMNS = "store_code,business_no,business_name,ceo_name,tax_email,business_type,business_item";

async function selectOne(
  config: { secret: string; url: string },
  path: string,
): Promise<{ row: unknown; missing: boolean }> {
  try {
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      cache: "no-store",
      headers: supabaseHeaders(config.secret),
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 200);
      // 테이블·컬럼이 아직 없으면(마이그레이션 전) 조용히 다음 저장소로 넘어간다.
      const missing = /PGRST20[0-9]|42P01|42703/i.test(body) || response.status === 404;

      if (!missing) {
        console.error(`[tax-profiles] ${path} 조회 실패 status=${response.status}: ${body}`);
      }

      return { missing, row: null };
    }

    const rows = (await response.json()) as unknown;

    return { missing: false, row: Array.isArray(rows) ? rows[0] : null };
  } catch (error) {
    console.error(
      "[tax-profiles] 조회 오류:",
      error instanceof Error ? error.message : error,
    );

    return { missing: false, row: null };
  }
}

async function fetchFromDatabase(codes: string[]): Promise<StoreTaxProfile | null> {
  const config = readSupabaseConfig();

  if (!config || !codes.length) return null;

  const filter = codes.map((code) => encodeURIComponent(code)).join(",");

  if (Date.now() > missingTableUntil) {
    const table = await selectOne(
      config,
      `store_tax_profiles?select=${TABLE_COLUMNS}&store_code=in.(${filter})&limit=1`,
    );

    const fromTable = normalize(table.row);

    if (fromTable) return fromTable;
    if (table.missing) missingTableUntil = Date.now() + MISSING_RETRY_MS;
  }

  // 예전 마이그레이션(notes/supabase-shop-tax-invoice-migration.sql)의 stores 컬럼.
  for (const code of codes) {
    const legacy = await selectOne(
      config,
      `stores?select=${TABLE_COLUMNS}&store_code=eq.${encodeURIComponent(code)}&limit=1`,
    );

    const fromStores = normalize(legacy.row);

    if (fromStores) return fromStores;
    if (legacy.missing) break;
  }

  return null;
}

/* ------------------------------------------------------------------------- */

/**
 * 지점 코드로 사업자 정보를 찾는다. 없으면 null.
 *
 * @param storeCode 주문서가 보낸 지점 코드(예: STORE_GNM). 개인 배송(DIRECT)이면 null.
 */
export async function findStoreTaxProfile(
  storeCode: string | null | undefined,
): Promise<StoreTaxProfile | null> {
  const codes = candidateCodes(typeof storeCode === "string" ? storeCode : "");

  if (!codes.length) return null;

  const cacheKey = codes.join("|");
  const hit = cache.get(cacheKey);

  if (hit && hit.expiresAt > Date.now()) return hit.profile;

  const fromEnv = envProfiles();

  for (const code of codes) {
    const profile = fromEnv[code.toUpperCase()];

    if (profile) {
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, profile });
      return profile;
    }
  }

  const profile = await fetchFromDatabase(codes);

  // "아직 등록 안 됨"도 짧게 기억해 주문마다 DB 를 다시 치지 않는다.
  cache.set(cacheKey, {
    expiresAt: Date.now() + (profile ? CACHE_TTL_MS : MISSING_RETRY_MS),
    profile,
  });

  return profile;
}

/** 값이 바뀐 직후(본사가 등록·수정) 다음 요청부터 바로 반영되게 한다. */
export function clearStoreTaxProfileCache() {
  cache.clear();
  missingTableUntil = 0;
  envCache = null;
}
