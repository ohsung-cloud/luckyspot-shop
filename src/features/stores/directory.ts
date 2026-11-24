import type { StoreOption, StoreRecord, StoreTaxProfile } from "@/features/stores/types";
import { readSupabaseConfig, SUPABASE_TIMEOUT_MS, supabaseHeaders } from "@/features/supabase/config";

import { findStoreRecord } from "./registry";

/**
 * 지점 목록 조회.
 *
 * 원본은 Supabase `stores` 테이블이고, 이 모듈은 서버에서만 실행된다.
 *  - 브라우저에는 `listStoreOptions()`로 개인정보 없는 값(code·label·address·region)만 내려간다.
 *  - 주문 접수 시에는 `resolveStoreByCode()`로 점주 이름·휴대폰까지 서버에서만 채운다.
 *
 * Supabase가 응답하지 않을 때를 대비해 두 단계를 둔다.
 *  1) 메모리 캐시(10분) — 정상 조회한 값은 그대로 재사용한다.
 *  2) 최소 대체 목록 — 실명·휴대폰 없이 지점명·주소만 담는다(공개 저장소에 안전한 값).
 *     이 경우 주문은 그대로 접수되고, 점주 연락처만 비어 있는 채로 시트에 남는다.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 60 * 1000;

const SELECT_COLUMNS = "store_code,label,address,region,owner_name,phone";

/**
 * Supabase를 못 읽을 때 쓰는 최소 목록.
 * 실명·휴대폰은 담지 않는다. 주소는 /api/stores 응답에도 포함되는 값이다.
 */
const FALLBACK_STORES: StoreRecord[] = [
  {
    address: "서울특별시 강남구 청담동 선릉로 714 도시빌딩 102호",
    code: "STORE_GNG",
    label: "럭키스팟 강남구청점",
    ownerName: null,
    phone: null,
    region: "서울",
  },
  {
    address: "서울시 노원구 화랑로47길 38 (월계동 풍림아이원아파트) 108동 1001호",
    code: "STORE_HYJ",
    label: "럭키스팟 한예종점",
    ownerName: null,
    phone: null,
    region: "서울",
  },
  {
    address: "충주시 남산6길 15 1층 럭키스팟 충주점",
    code: "STORE_CJ",
    label: "럭키스팟 충주점",
    ownerName: null,
    phone: null,
    region: "충북",
  },
  {
    address: "경기 평택시 송탄공원로 146 아주1차아파트 상가동 107호",
    code: "STORE_PT",
    label: "럭키스팟 평택점",
    ownerName: null,
    phone: null,
    region: "경기",
  },
  {
    address: "서울특별시 강남구 청담동 선릉로 714 도시빌딩 102호",
    code: "STORE_HQ",
    label: "럭키스팟 서울본사",
    ownerName: null,
    phone: null,
    region: "서울",
  },
];

/**
 * 레지스트리 시드 지점의 배송지 — 같은 매장이 발주 폼에서 쓰던 확정 주소를 그대로 옮겼다.
 *  · STORE_GNM(강남구청역점) = 예전 코드 STORE_GNG 와 같은 매장
 *  · STORE_PTK(평택점) = 예전 코드 STORE_PT 와 같은 매장
 * 주소를 아직 확인하지 못한 지점(선유로·영등포시장역)은 비워 두고, 주문서에서 직접 입력하게 한다.
 */
const REGISTRY_STORE_ADDRESSES: Record<string, string> = {
  STORE_GNM: "서울특별시 강남구 청담동 선릉로 714 도시빌딩 102호",
  STORE_HYJ: "서울시 노원구 화랑로47길 38 (월계동 풍림아이원아파트) 108동 1001호",
  STORE_PTK: "경기 평택시 송탄공원로 146 아주1차아파트 상가동 107호",
  STORE_CJ: "충주시 남산6길 15 1층 럭키스팟 충주점",
};

type StoreRow = {
  address?: string | null;
  label?: string | null;
  owner_name?: string | null;
  phone?: string | null;
  region?: string | null;
  store_code?: string | null;
};

let cache: { fetchedAt: number; stores: StoreRecord[] } | null = null;
let inFlight: Promise<StoreRecord[]> | null = null;

function toStoreRecord(row: StoreRow): StoreRecord | null {
  const code = row.store_code?.trim();
  const label = row.label?.trim();

  if (!code || !label) return null;

  return {
    address: row.address?.trim() ?? "",
    code,
    label,
    ownerName: row.owner_name?.trim() || null,
    phone: row.phone?.trim() || null,
    region: row.region?.trim() || null,
  };
}

async function fetchStores(): Promise<StoreRecord[] | null> {
  const config = readSupabaseConfig();

  if (!config) {
    console.warn("[stores] SUPABASE_URL·SUPABASE_SECRET_KEY가 없어 지점 목록을 Supabase에서 읽지 못합니다.");
    return null;
  }

  try {
    const response = await fetch(
      `${config.url}/rest/v1/stores?select=${SELECT_COLUMNS}&is_active=eq.true&order=store_code.asc`,
      {
        cache: "no-store",
        headers: supabaseHeaders(config.secret),
        signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      console.error(`[stores] stores 조회 실패 status=${response.status}: ${(await response.text()).slice(0, 200)}`);
      return null;
    }

    const rows = (await response.json()) as StoreRow[];

    if (!Array.isArray(rows)) return null;

    return rows.flatMap((row) => {
      const record = toStoreRecord(row);
      return record ? [record] : [];
    });
  } catch (error) {
    console.error(
      "[stores] stores 조회 오류:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function loadStores(): Promise<StoreRecord[]> {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.stores;

  if (!inFlight) {
    inFlight = fetchStores()
      .then((stores) => {
        if (stores && stores.length) {
          cache = { fetchedAt: Date.now(), stores };
          return stores;
        }

        if (cache) return cache.stores;

        // 실패했을 때는 60초 뒤 다시 시도하도록 짧게만 기억한다.
        cache = { fetchedAt: Date.now() - CACHE_TTL_MS + RETRY_AFTER_FAILURE_MS, stores: FALLBACK_STORES };
        return FALLBACK_STORES;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
}

/** 관리자 화면·서버 로직용. 점주 이름·휴대폰까지 포함한다. */
export async function getStoreDirectory(): Promise<StoreRecord[]> {
  return loadStores();
}

/** 브라우저로 내려도 되는 값만 남긴다. */
export function toStoreOption(store: StoreRecord): StoreOption {
  return { address: store.address, code: store.code, label: store.label, region: store.region };
}

/** 발주 폼 드롭다운용 목록 (개인정보 없음) */
export async function listStoreOptions(): Promise<StoreOption[]> {
  const stores = await loadStores();
  return stores.map(toStoreOption);
}

export async function resolveStoreByCode(code: string): Promise<StoreRecord | null> {
  const stores = await loadStores();
  const found = stores.find((store) => store.code === code) ?? null;
  if (found) return found;

  // 점주 포털(/owner)이 쓰는 레지스트리 지점 — 발주 폼 목록에는 없지만 실재하는 매장이다.
  //  (예: STORE_GNM 강남구청역점, STORE_PTK 평택점 — 예전 코드 STORE_GNG·STORE_PT 로만 목록에 있었다)
  //  이미 목록에 있는 코드의 동작은 그대로 두고, 못 찾은 코드만 여기서 한 번 더 확인한다.
  const record = await findStoreRecord(code).catch(() => null);
  if (!record || record.status !== "active") return null;

  return {
    address: REGISTRY_STORE_ADDRESSES[record.code] ?? "",
    code: record.code,
    label: record.label,
    ownerName: record.ownerName || null,
    phone: record.ownerPhone || null,
    region: record.region || null,
  };
}

export async function resolveStoreByLabel(label: string): Promise<StoreRecord | null> {
  const stores = await loadStores();
  return stores.find((store) => store.label === label) ?? null;
}

/** 세금계산서 기본 정보 컴럼 — 별도 마이그레이션(notes/supabase-shop-tax-invoice-migration.sql) 후에 생긴다. */
const TAX_SELECT_COLUMNS =
  "store_code,business_no,business_name,ceo_name,tax_email,business_type,business_item";
const TAX_COLUMN_RETRY_MS = 60 * 1000;

let taxColumnState: { available: boolean; checkedAt: number } | null = null;

type StoreTaxRow = {
  business_name?: string | null;
  business_no?: string | null;
  business_type?: string | null;
  business_item?: string | null;
  ceo_name?: string | null;
  store_code?: string | null;
  tax_email?: string | null;
};

/**
 * 지점에 등록된 세금계산서 기본 정보를 읽는다.
 *
 *  · 마이그레이션 전(컴럼 없음)에는 null 을 돌려주고, 60초 동안은 다시 시도하지 않는다
 *    (지점 목록 API 의 오류 회피를 위해 stores 조회를 반복하지 않는다).
 *  · 이 응답은 브라우저(점주 주문서)로 내려가므로 no-store 로만 돌려준다.
 *    점주 실명·휴대폰과 달리 사업자등록번호·상호·대표자명은 공개 등록 정보이고,
 *    이메일은 발급 수취용으로 지점이 등록한 값이다.
 */
export async function fetchStoreTaxProfile(code: string): Promise<StoreTaxProfile | null> {
  const config = readSupabaseConfig();

  if (!config) return null;

  if (taxColumnState && !taxColumnState.available) {
    if (Date.now() - taxColumnState.checkedAt < TAX_COLUMN_RETRY_MS) return null;
  }

  try {
    const response = await fetch(
      `${config.url}/rest/v1/stores?select=${TAX_SELECT_COLUMNS}&store_code=eq.${encodeURIComponent(code)}&limit=1`,
      {
        cache: "no-store",
        headers: supabaseHeaders(config.secret),
        signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      const columnMissing = response.status === 400 && /column|PGRST204|42703/i.test(body);

      taxColumnState = { available: false, checkedAt: Date.now() };

      if (columnMissing) {
        console.warn(
          "[stores] 세금계산서 컬럼이 아직 없습니다 — notes/supabase-shop-tax-invoice-migration.sql 을 실행하세요.",
        );
      } else {
        console.error(`[stores] 세금계산서 정보 조회 실패 status=${response.status}: ${body.slice(0, 200)}`);
      }

      return null;
    }

    taxColumnState = { available: true, checkedAt: Date.now() };

    const rows = (await response.json()) as StoreTaxRow[];
    const row = Array.isArray(rows) ? rows[0] : null;

    if (!row) return null;

    const profile: StoreTaxProfile = {
      businessItem: row.business_item?.trim() ?? "",
      businessName: row.business_name?.trim() ?? "",
      businessNo: row.business_no?.replace(/\D/g, "") ?? "",
      businessType: row.business_type?.trim() ?? "",
      ceoName: row.ceo_name?.trim() ?? "",
      email: row.tax_email?.trim() ?? "",
    };

    const filled = Object.values(profile).some((value) => value.length > 0);

    return filled ? profile : null;
  } catch (error) {
    console.error(
      "[stores] 세금계산서 정보 조회 오류:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
