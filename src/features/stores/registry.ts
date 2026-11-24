import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { readSupabaseConfig, SUPABASE_TIMEOUT_MS, supabaseHeaders } from "../supabase/config";
import { type CalibrationEntry, type CalibrationStore } from "../auto-order/calibration";
import { defaultFixedCost, normalizeFixedCost } from "../sales-report/profit";
import { DEMO_PIN, generatePin, hashStorePin, isValidPin, matchesStorePin, normalizePin } from "./pin";
import {
  PRINT_VENDORS,
  STORE_TYPES,
  type CreateStoreInput,
  type CreatedStore,
  type PrintVendorType,
  type StoreFixedCost,
  type StoreEntityProfile,
  type StoreRegistryRecord,
  type StoreStatus,
  type StoreThresholds,
  type StoreType,
  type StoreValidationError,
} from "./registry-types";

/**
 * 매장·점주 어드민 레지스트리 (서버 전용).
 *
 * 두 겹 저장
 *  1) Supabase `stores` · `store_admins` — SQL(마이그레이션
 *     20261123233000_store_registry_and_snapshots.sql)을 실행하면 영구 저장된다.
 *  2) 인메모리(globalThis) — SQL 미적용·키 없음 상태에서도 매장 생성·조회·어드민 발급이
 *     100% 동작하게 한다. 서버리스 인스턴스가 살아 있는 동안 유효하다.
 *
 * 비밀 취급
 *  - 포털 비밀번호 필드는 아예 없다. 받지도 저장하지도 않는다.
 *  - 점주 접근 코드는 발급 직후 한 번만 반환하고, 저장은 SHA-256 해시만 한다.
 *  - 연락처·사업자번호는 서버에서만 원문을 다루고 화면에는 마스킹해서 내보낸다.
 */

const MEMORY_KEY = "__luckyspotStoreRegistryV1";
const STORE_CODE = /^STORE_[A-Z0-9]{2,14}$/;
const ADMIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ADMIN_CODE_LENGTH = 10;

type AdminCredential = {
  storeCode: string;
  codeHash: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type PinCredential = {
  storeCode: string;
  /** SHA-256(고정 접두어 + 지점코드 + PIN) — 원문은 어디에도 없다. */
  pinHash: string;
  setAt: string;
  enabled: boolean;
};

type RegistryMemory = {
  stores: Map<string, StoreRegistryRecord>;
  admins: Map<string, AdminCredential>;
  pins: Map<string, PinCredential>;
  /** Supabase에서 한 번이라도 읽은 매장 (시드 덮어쓰기 방지) */
  hydrated: boolean;
  /** 확장 컬럼(벤더·고정비·PIN·교체학습)을 쓸 수 있는가 — 한 번 실패하면 이 프로세스에서는 끈다. */
  extendedColumns: boolean;
};

function memory(): RegistryMemory {
  const holder = globalThis as unknown as Record<string, RegistryMemory | undefined>;

  if (!holder[MEMORY_KEY]) {
    holder[MEMORY_KEY] = {
      stores: new Map(),
      admins: new Map(),
      pins: new Map(),
      hydrated: false,
      extendedColumns: true,
    };
  }

  return holder[MEMORY_KEY];
}

let warned = false;

function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn(`[store-registry] ${message}`);
}

/* ------------------------------------------------------------------------- */
/* 시드 매장 — 이미 수집·리포트가 돌고 있는 세 지점                                */
/* ------------------------------------------------------------------------- */

function seed(input: {
  code: string;
  label: string;
  shortLabel: string;
  region: string;
  storeType: StoreType;
  ownerName?: string;
  ownerPhone?: string;
}): StoreRegistryRecord {
  const now = "2026-11-23T00:00:00+09:00";

  return {
    code: input.code,
    label: input.label,
    shortLabel: input.shortLabel,
    region: input.region,
    ownerName: input.ownerName ?? "",
    phoneMasked: input.ownerPhone ? maskPhone(input.ownerPhone) : "미등록",
    ownerPhone: input.ownerPhone ?? "",
    storeType: input.storeType,
    status: "active",
    coffeeEntity: { name: "", businessNo: "" },
    printEntity: { name: "", businessNo: "" },
    portals: { loyalsunsStoreId: "", escalprintBranch: "" },
    thresholds: { beanDays: 4, tonerDays: 5, paperDays: 4 },
    printVendor: "escalprint",
    monthlyFixedCost: defaultFixedCost(input.code),
    calibrations: SEED_CALIBRATIONS[input.code] ?? {},
    hasAdminCode: false,
    adminCodeSetAt: null,
    // 시드 지점은 열람 개방 — PIN은 '빠른 재접속'용으로만 두고 잠그지 않는다.
    hasPin: true,
    pinSetAt: now,
    pinEnabled: false,
    createdAt: now,
    updatedAt: now,
    adminPath: `/store/${input.code}`,
  };
}

/**
 * 교체완료 학습 예시값 — 시드 지점은 아직 '교체완료' 버튼을 누른 적이 없어,
 * 화면이 빈 상태로 보이지 않도록 지난 교체 2회를 예시로 둔다(화면에 '예시'라고 적는다).
 */
const SEED_CALIBRATIONS: Record<string, CalibrationStore> = {
  STORE_GNM: {
    "bean-10kg": {
      sku: "bean-10kg",
      lastReplacedAt: "2026-11-16T09:10:00+09:00",
      previousReplacedAt: "2026-11-04T08:40:00+09:00",
      factor: 0.96,
      samples: 2,
      fullCapacity: 10_000,
      note: "실제 11.9일 · 예측 12.4일 → 0.96x (예시)",
    },
    "a4-paper": {
      sku: "a4-paper",
      lastReplacedAt: "2026-11-19T10:30:00+09:00",
      previousReplacedAt: "2026-11-09T09:00:00+09:00",
      factor: 1.04,
      samples: 1,
      fullCapacity: 1_100,
      note: "실제 10.1일 · 예측 9.7일 → 1.04x (예시)",
    },
  },
};

const SEED_STORES: StoreRegistryRecord[] = [
  seed({
    code: "STORE_GNM",
    label: "럭키스팟 강남구청역점",
    shortLabel: "강남구청역점",
    region: "서울 강남",
    storeType: "1평 샵인샵",
  }),
  seed({
    code: "STORE_HYJ",
    label: "럭키스팟 한예종점",
    shortLabel: "한예종점",
    region: "서울 성북",
    storeType: "미지정",
  }),
  seed({
    code: "STORE_PTK",
    label: "럭키스팟 평택점",
    shortLabel: "평택점",
    region: "경기 평택",
    storeType: "미지정",
  }),
];

/* ------------------------------------------------------------------------- */
/* 마스킹·정규화                                                                */
/* ------------------------------------------------------------------------- */

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function maskPhone(value: string) {
  const digits = digitsOnly(value);
  if (digits.length < 7) return "미등록";
  if (digits.length === 11) return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-***-${digits.slice(-4)}`;
  return `${digits.slice(0, 3)}-****-${digits.slice(-2)}`;
}

export function maskBusinessNo(value: string) {
  const digits = digitsOnly(value);
  if (digits.length !== 10) return "미등록";
  return `${digits.slice(0, 3)}-**-***${digits.slice(-2)}`;
}

function shortLabelOf(label: string) {
  const stripped = label.replace(/^럭키스팟\s*/, "").trim();
  return (stripped || label).slice(0, 12);
}

/* ------------------------------------------------------------------------- */
/* 코드 생성                                                                    */
/* ------------------------------------------------------------------------- */

/** 한글 매장명에서 코드 후보를 만든다. 라틴 글자가 있으면 그것을, 없으면 해시 4자를 쓴다. */
export function suggestStoreCode(label: string, taken: Iterable<string> = []) {
  const used = new Set([...taken].map((code) => code.toUpperCase()));
  const latin = label
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

  const base = latin.length >= 2 ? `STORE_${latin}` : `STORE_${hashToken(label)}`;

  if (!used.has(base) && STORE_CODE.test(base)) return base;

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base.slice(0, 18)}${index}`;
    if (!used.has(candidate) && STORE_CODE.test(candidate)) return candidate;
  }

  return `STORE_${hashToken(`${label}|${Date.now()}`)}`;
}

function hashToken(text: string) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  let value = hash >>> 0;
  let token = "";

  for (let index = 0; index < 4; index += 1) {
    token += alphabet[value % alphabet.length];
    value = Math.floor(value / alphabet.length);
  }

  return token;
}

export function normalizeStoreCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
}

export function isValidStoreCode(value: string) {
  return STORE_CODE.test(value);
}

/* ------------------------------------------------------------------------- */
/* 점주 접근 코드 — 발급·해시·검증                                                */
/* ------------------------------------------------------------------------- */

export function hashAdminCode(code: string) {
  return createHash("sha256").update(`luckyspot-store-admin|${code.trim().toUpperCase()}`).digest("hex");
}

export function generateAdminCode() {
  let code = "";

  for (let index = 0; index < ADMIN_CODE_LENGTH; index += 1) {
    code += ADMIN_CODE_ALPHABET[randomInt(ADMIN_CODE_ALPHABET.length)];
  }

  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** 해시끼리 상수 시간 비교. 저장된 해시가 없으면 항상 false. */
export function matchesAdminCode(storedHash: string | null, given: string) {
  if (!storedHash || !given) return false;

  const givenHash = Buffer.from(hashAdminCode(given), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (givenHash.length !== stored.length) return false;

  return timingSafeEqual(givenHash, stored);
}

/* ------------------------------------------------------------------------- */
/* Supabase 연동 (best-effort)                                                  */
/* ------------------------------------------------------------------------- */

async function supabaseRequest(path: string, init?: RequestInit): Promise<Response | null> {
  const config = readSupabaseConfig();
  if (!config) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    return await fetch(`${config.url}/rest/v1/${path}`, {
      ...init,
      headers: { ...supabaseHeaders(config.secret), ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
  } catch {
    warnOnce("Supabase에 연결하지 못했습니다 — 인메모리 레지스트리로 계속합니다.");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * stores 테이블에서 읽는 컬럼.
 *
 * 확장 컬럼(print_vendor·monthly_fixed_cost·calibration·pin_*)은 마이그레이션을 실행해야 생긴다.
 * 아직 없으면 400이 오므로, 한 번 실패하면 이 프로세스에서는 기본 컬럼만 읽는다
 * (화면은 인메모리 값으로 계속 동작한다).
 */
const STORE_COLUMNS_BASE =
  "store_code,label,short_label,region,owner_name,phone,store_type,status,coffee_entity_name,coffee_business_no,print_entity_name,print_business_no,loyalsuns_store_id,escalprint_branch,bean_alert_days,toner_alert_days,paper_alert_days,admin_code_set_at,created_at,updated_at";

const STORE_COLUMNS_EXTENDED = `${STORE_COLUMNS_BASE},print_vendor,monthly_fixed_cost,calibration,pin_hash,pin_set_at,pin_enabled`;

async function fetchStoreRows(suffix: string): Promise<Record<string, unknown>[] | null> {
  const build = (columns: string) => `stores?select=${columns}&${suffix}`;
  const extended = memory().extendedColumns;

  let response = await supabaseRequest(build(extended ? STORE_COLUMNS_EXTENDED : STORE_COLUMNS_BASE));

  if (response && response.status >= 400 && memory().extendedColumns) {
    memory().extendedColumns = false;
    response = await supabaseRequest(build(STORE_COLUMNS_BASE));
  }

  if (!response || !response.ok) {
    if (response && response.status >= 400) {
      warnOnce("stores 테이블을 읽지 못했습니다 — SQL 미적용으로 보고 인메모리 레지스트리를 씁니다.");
    }
    return null;
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown>[] | null;
  return Array.isArray(payload) ? payload : null;
}

function rowToRecord(row: Record<string, unknown>): StoreRegistryRecord | null {
  const code = typeof row.store_code === "string" ? row.store_code.trim().toUpperCase() : "";
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (!code || !label) return null;

  const text = (value: unknown, fallback = "") => (typeof value === "string" ? value.trim() : fallback);
  const number = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const storeType = STORE_TYPES.includes(text(row.store_type) as StoreType)
    ? (text(row.store_type) as StoreType)
    : "미지정";
  const status: StoreStatus =
    row.status === "paused" || row.status === "deleted" ? row.status : "active";
  const phone = text(row.phone);
  const adminCodeSetAt = text(row.admin_code_set_at) || null;
  const vendor = text(row.print_vendor);
  const fixedCost = readJsonObject<StoreFixedCost>(row.monthly_fixed_cost);
  const calibrations = readJsonObject<CalibrationStore>(row.calibration);
  const pinSetAt = text(row.pin_set_at) || null;
  const pinHash = text(row.pin_hash);

  if (pinHash) {
    memory().pins.set(code, {
      storeCode: code,
      pinHash,
      setAt: pinSetAt ?? new Date().toISOString(),
      enabled: readBoolean(row.pin_enabled, false),
    });
  }

  return {
    code,
    label,
    shortLabel: text(row.short_label) || shortLabelOf(label),
    region: text(row.region),
    ownerName: text(row.owner_name),
    phoneMasked: phone ? maskPhone(phone) : "미등록",
    ownerPhone: phone,
    storeType,
    status,
    coffeeEntity: { name: text(row.coffee_entity_name), businessNo: text(row.coffee_business_no) },
    printEntity: { name: text(row.print_entity_name), businessNo: text(row.print_business_no) },
    portals: {
      loyalsunsStoreId: text(row.loyalsuns_store_id),
      escalprintBranch: text(row.escalprint_branch),
    },
    thresholds: {
      beanDays: number(row.bean_alert_days, 4),
      tonerDays: number(row.toner_alert_days, 5),
      paperDays: number(row.paper_alert_days, 4),
    },
    printVendor: (PRINT_VENDORS as readonly string[]).includes(vendor) ? (vendor as PrintVendorType) : "escalprint",
    monthlyFixedCost: fixedCost ? normalizeFixedCost(fixedCost) : defaultFixedCost(code),
    calibrations: calibrations ?? {},
    hasAdminCode: Boolean(adminCodeSetAt),
    adminCodeSetAt,
    hasPin: Boolean(pinHash),
    pinSetAt,
    pinEnabled: readBoolean(row.pin_enabled, false),
    createdAt: text(row.created_at) || new Date().toISOString(),
    updatedAt: text(row.updated_at) || new Date().toISOString(),
    adminPath: `/store/${code}`,
  };
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readJsonObject<T>(value: unknown): T | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as T;
}

function recordToRow(record: StoreRegistryRecord) {
  return {
    store_code: record.code,
    label: record.label,
    short_label: record.shortLabel,
    region: record.region || null,
    owner_name: record.ownerName || null,
    phone: record.ownerPhone || null,
    store_type: record.storeType,
    status: record.status,
    is_active: record.status === "active",
    coffee_entity_name: record.coffeeEntity.name || null,
    coffee_business_no: record.coffeeEntity.businessNo || null,
    print_entity_name: record.printEntity.name || null,
    print_business_no: record.printEntity.businessNo || null,
    loyalsuns_store_id: record.portals.loyalsunsStoreId || null,
    escalprint_branch: record.portals.escalprintBranch || null,
    bean_alert_days: record.thresholds.beanDays,
    toner_alert_days: record.thresholds.tonerDays,
    paper_alert_days: record.thresholds.paperDays,
    admin_code_set_at: record.adminCodeSetAt,
    print_vendor: record.printVendor,
    monthly_fixed_cost: record.monthlyFixedCost,
    calibration: record.calibrations,
    pin_enabled: record.pinEnabled,
    pin_set_at: record.pinSetAt,
    updated_at: new Date().toISOString(),
  };
}

async function loadFromSupabase(): Promise<StoreRegistryRecord[] | null> {
  if (!readSupabaseConfig()) return null;

  const payload = await fetchStoreRows("order=label.asc&limit=200");
  if (!payload) return null;

  return payload
    .map(rowToRecord)
    .filter((row): row is StoreRegistryRecord => row !== null);
}

/* ------------------------------------------------------------------------- */
/* 조회                                                                        */
/* ------------------------------------------------------------------------- */

function mergeRecords(remote: StoreRegistryRecord[]) {
  const map = new Map<string, StoreRegistryRecord>();

  for (const record of SEED_STORES) map.set(record.code, record);
  for (const record of memory().stores.values()) map.set(record.code, record);
  for (const record of remote) map.set(record.code, record);

  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

export async function listStoreRecords(): Promise<StoreRegistryRecord[]> {
  const remote = (await loadFromSupabase()) ?? [];
  if (remote.length > 0) memory().hydrated = true;

  return mergeRecords(remote).filter((record) => record.status !== "deleted");
}

export async function findStoreRecord(code: string): Promise<StoreRegistryRecord | null> {
  const key = normalizeStoreCode(code);
  if (!key) return null;

  const cached = memory().stores.get(key) ?? SEED_STORES.find((record) => record.code === key);
  if (cached) return cached;

  const payload = await fetchStoreRows(`store_code=eq.${encodeURIComponent(key)}&limit=1`);
  const row = payload?.[0] ?? null;
  const record = row ? rowToRecord(row) : null;
  if (record) memory().stores.set(record.code, record);

  return record;
}

/* ------------------------------------------------------------------------- */
/* 검증                                                                        */
/* ------------------------------------------------------------------------- */

export function validateCreateInput(input: CreateStoreInput, takenCodes: Iterable<string> = []) {
  const errors: StoreValidationError[] = [];
  const label = (input.label ?? "").trim();
  const ownerName = (input.ownerName ?? "").trim();
  const phone = digitsOnly(input.phone ?? "");
  const code = input.code ? normalizeStoreCode(input.code) : "";
  const taken = new Set([...takenCodes].map((value) => value.toUpperCase()));

  if (label.length < 2 || label.length > 40) {
    errors.push({ field: "label", message: "매장명을 2~40자로 입력해 주세요." });
  }

  if (ownerName.length < 2 || ownerName.length > 20) {
    errors.push({ field: "ownerName", message: "점주명을 2~20자로 입력해 주세요." });
  }

  if (phone.length < 9 || phone.length > 11) {
    errors.push({ field: "phone", message: "연락처를 숫자로 정확히 입력해 주세요." });
  }

  if (input.storeType && !STORE_TYPES.includes(input.storeType)) {
    errors.push({ field: "storeType", message: "매장 형태를 다시 선택해 주세요." });
  }

  if (code) {
    if (!isValidStoreCode(code)) {
      errors.push({ field: "code", message: "매장 코드는 STORE_로 시작하는 영문·숫자 2~14자입니다." });
    } else if (taken.has(code)) {
      errors.push({ field: "code", message: "이미 쓰고 있는 매장 코드입니다." });
    }
  }

  const businessNo = digitsOnly(input.coffeeBusinessNo ?? "");
  const printBusinessNo = digitsOnly(input.printBusinessNo ?? "");

  if (businessNo && businessNo.length !== 10) {
    errors.push({ field: "coffeeBusinessNo", message: "사업자번호는 숫자 10자리입니다." });
  }

  if (printBusinessNo && printBusinessNo.length !== 10) {
    errors.push({ field: "printBusinessNo", message: "사업자번호는 숫자 10자리입니다." });
  }

  return { errors, label, ownerName, phone, code };
}

/* ------------------------------------------------------------------------- */
/* 생성·수정·삭제                                                                */
/* ------------------------------------------------------------------------- */

export async function createStore(
  input: CreateStoreInput,
): Promise<{ ok: true; created: CreatedStore } | { ok: false; errors: StoreValidationError[] }> {
  const existing = await listStoreRecords();
  const check = validateCreateInput(input, existing.map((record) => record.code));
  if (check.errors.length > 0) return { ok: false, errors: check.errors };

  const code = check.code || suggestStoreCode(check.label, existing.map((record) => record.code));
  const now = new Date().toISOString();
  const adminCode = generateAdminCode();
  const admitAt = now;
  const pin = isValidPin(input.pin) ? normalizePin(input.pin) : generatePin();
  const pinHash = hashStorePin(code, pin);

  const record: StoreRegistryRecord = {
    code,
    label: check.label,
    shortLabel: shortLabelOf(check.label),
    region: (input.region ?? "").trim().slice(0, 20),
    ownerName: check.ownerName,
    phoneMasked: maskPhone(check.phone),
    ownerPhone: check.phone,
    storeType: input.storeType ?? "미지정",
    status: "active",
    coffeeEntity: {
      name: (input.coffeeEntityName ?? "").trim().slice(0, 40),
      businessNo: digitsOnly(input.coffeeBusinessNo ?? ""),
    },
    printEntity: {
      name: (input.printEntityName ?? "").trim().slice(0, 40),
      businessNo: digitsOnly(input.printBusinessNo ?? ""),
    },
    portals: {
      loyalsunsStoreId: (input.loyalsunsStoreId ?? "").trim().slice(0, 40),
      escalprintBranch: (input.escalprintBranch ?? "").trim().slice(0, 40),
    },
    thresholds: {
      beanDays: clampDays(input.thresholds?.beanDays, 4),
      tonerDays: clampDays(input.thresholds?.tonerDays, 5),
      paperDays: clampDays(input.thresholds?.paperDays, 4),
    },
    printVendor: (PRINT_VENDORS as readonly string[]).includes(input.printVendor ?? "")
      ? (input.printVendor as PrintVendorType)
      : "escalprint",
    monthlyFixedCost: input.monthlyFixedCost
      ? normalizeFixedCost({ ...defaultFixedCost(code), ...input.monthlyFixedCost })
      : defaultFixedCost(code),
    calibrations: {},
    hasAdminCode: true,
    adminCodeSetAt: admitAt,
    hasPin: true,
    pinSetAt: now,
    pinEnabled: true,
    createdAt: now,
    updatedAt: now,
    adminPath: `/store/${code}`,
  };

  memory().stores.set(code, record);
  memory().admins.set(code, {
    storeCode: code,
    codeHash: hashAdminCode(adminCode),
    createdAt: now,
    lastUsedAt: null,
  });
  memory().pins.set(code, { storeCode: code, pinHash, setAt: now, enabled: true });

  // Supabase에는 매장 → 어드민 순으로 쓴다(외래키). 실패해도 화면은 그대로 동작한다.
  await writeStoreRow(record, { pinHash });

  await supabaseRequest("store_admins?on_conflict=store_code,role", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        store_code: code,
        role: "owner",
        name: check.ownerName,
        invite_code_hash: hashAdminCode(adminCode),
        status: "active",
        invited_at: now,
      },
    ]),
  });

  return {
    ok: true,
    created: {
      store: record,
      adminCode,
      adminUrl: `/store/${code}?key=${encodeURIComponent(adminCode)}`,
      pin,
    },
  };
}

/**
 * stores 행 쓰기 — 확장 컬럼이 아직 없으면(마이그레이션 전) 기본 컬럼만 다시 쓴다.
 * 새 설정은 인메모리에 남아 화면은 그대로 동작하고, SQL을 실행하면 영구 저장된다.
 */
async function writeStoreRow(record: StoreRegistryRecord, extra: { pinHash?: string | null } = {}) {
  const row = { ...recordToRow(record), ...(extra.pinHash ? { pin_hash: extra.pinHash } : {}) };

  const write = (body: Record<string, unknown>) =>
    supabaseRequest("stores?on_conflict=store_code", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([body]),
    });

  const response = await write(row);
  if (response && response.ok) return;

  if (response && response.status >= 400) {
    memory().extendedColumns = false;
    const legacyKeys = new Set(STORE_COLUMNS_BASE.split(","));
    const legacyRow: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) if (legacyKeys.has(key)) legacyRow[key] = value;

    const retry = await write(legacyRow);
    if (!retry || !retry.ok) {
      warnOnce("stores 테이블에 쓰지 못했습니다 — SQL 미적용일 수 있습니다(인메모리로 계속).");
    }
  }
}

function clampDays(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(30, Math.max(1, Math.round(value)));
}

export async function updateStoreStatus(code: string, status: StoreStatus) {
  const record = await findStoreRecord(code);
  if (!record) return null;

  const next: StoreRegistryRecord = { ...record, status, updatedAt: new Date().toISOString() };
  memory().stores.set(next.code, next);

  await supabaseRequest(`stores?store_code=eq.${encodeURIComponent(next.code)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status, is_active: status === "active", updated_at: next.updatedAt }),
  });

  return next;
}

export async function updateStoreThresholds(code: string, thresholds: Partial<StoreThresholds>) {
  const record = await findStoreRecord(code);
  if (!record) return null;

  const next: StoreRegistryRecord = {
    ...record,
    thresholds: {
      beanDays: clampDays(thresholds.beanDays, record.thresholds.beanDays),
      tonerDays: clampDays(thresholds.tonerDays, record.thresholds.tonerDays),
      paperDays: clampDays(thresholds.paperDays, record.thresholds.paperDays),
    },
    updatedAt: new Date().toISOString(),
  };

  memory().stores.set(next.code, next);

  await supabaseRequest(`stores?store_code=eq.${encodeURIComponent(next.code)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      bean_alert_days: next.thresholds.beanDays,
      toner_alert_days: next.thresholds.tonerDays,
      paper_alert_days: next.thresholds.paperDays,
      updated_at: next.updatedAt,
    }),
  });

  return next;
}

/** 점주 접근 코드 재발급. 이전 코드는 즉시 무효가 된다. */
export async function regenerateAdminCode(code: string) {
  const record = await findStoreRecord(code);
  if (!record) return null;

  const adminCode = generateAdminCode();
  const now = new Date().toISOString();
  const next: StoreRegistryRecord = {
    ...record,
    hasAdminCode: true,
    adminCodeSetAt: now,
    updatedAt: now,
  };

  memory().stores.set(next.code, next);
  memory().admins.set(next.code, {
    storeCode: next.code,
    codeHash: hashAdminCode(adminCode),
    createdAt: now,
    lastUsedAt: null,
  });

  await supabaseRequest(`stores?store_code=eq.${encodeURIComponent(next.code)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ admin_code_set_at: now, updated_at: now }),
  });

  await supabaseRequest("store_admins?on_conflict=store_code,role", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        store_code: next.code,
        role: "owner",
        name: record.ownerName || null,
        invite_code_hash: hashAdminCode(adminCode),
        status: "active",
        invited_at: now,
      },
    ]),
  });

  return { store: next, adminCode, adminUrl: `/store/${next.code}?key=${encodeURIComponent(adminCode)}` };
}

/** 점주의 접근 코드 검증. 코드가 설정되지 않은 매장(시드)은 열람을 허용한다. */
export async function verifyAdminAccess(record: StoreRegistryRecord, given: string | null | undefined) {
  if (!record.hasAdminCode) return true;
  if (!given) return false;

  const cached = memory().admins.get(record.code);
  if (cached) return matchesAdminCode(cached.codeHash, given);

  const response = await supabaseRequest(
    `store_admins?select=invite_code_hash&store_code=eq.${encodeURIComponent(record.code)}&role=eq.owner&limit=1`,
  );

  if (!response || !response.ok) return false;

  const payload = (await response.json().catch(() => null)) as Record<string, unknown>[] | null;
  const hash = Array.isArray(payload) && typeof payload[0]?.invite_code_hash === "string"
    ? payload[0].invite_code_hash
    : null;

  if (hash) {
    memory().admins.set(record.code, {
      storeCode: record.code,
      codeHash: hash,
      createdAt: record.adminCodeSetAt ?? new Date().toISOString(),
      lastUsedAt: null,
    });
  }

  return matchesAdminCode(hash, given);
}

/** GitHub Actions Secrets에 넣을 키 이름 — 비밀번호는 앱이 아니라 GitHub에만 둔다. */
export function portalSecretKeys(code: string) {
  const suffix = code.replace(/^STORE_/, "").replace(/[^A-Z0-9]/g, "");
  return {
    loyalsunsId: `LOYALSUNS_${suffix}_ID`,
    loyalsunsPassword: `LOYALSUNS_${suffix}_PW`,
    escalprintId: `ESCALPRINT_${suffix}_ID`,
    escalprintPassword: `ESCALPRINT_${suffix}_PW`,
  };
}

/* ------------------------------------------------------------------------- */
/* 설정 — 프린트 벤더 · 월 고정비 · PIN · 교체완료 학습                          */
/* ------------------------------------------------------------------------- */

/** 매장 설정(프린트 벤더·월 고정비·PIN 잠금) 변경. */
export async function updateStoreSettings(
  code: string,
  input: {
    printVendor?: string;
    monthlyFixedCost?: Partial<StoreFixedCost>;
    pinEnabled?: boolean;
  },
): Promise<StoreRegistryRecord | null> {
  const record = await findStoreRecord(code);
  if (!record) return null;

  const next: StoreRegistryRecord = {
    ...record,
    printVendor: (PRINT_VENDORS as readonly string[]).includes(input.printVendor ?? "")
      ? (input.printVendor as PrintVendorType)
      : record.printVendor,
    monthlyFixedCost: input.monthlyFixedCost
      ? normalizeFixedCost({ ...record.monthlyFixedCost, ...input.monthlyFixedCost })
      : record.monthlyFixedCost,
    pinEnabled: typeof input.pinEnabled === "boolean" ? input.pinEnabled : record.pinEnabled,
    updatedAt: new Date().toISOString(),
  };

  memory().stores.set(next.code, next);

  const cached = memory().pins.get(next.code);
  if (cached) memory().pins.set(next.code, { ...cached, enabled: next.pinEnabled });

  await supabaseRequest(`stores?store_code=eq.${encodeURIComponent(next.code)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      print_vendor: next.printVendor,
      monthly_fixed_cost: next.monthlyFixedCost,
      pin_enabled: next.pinEnabled,
      updated_at: next.updatedAt,
    }),
  });

  return next;
}

/** 점주 4자리 PIN 재발급 — 새 PIN은 이 응답에 한 번만 실린다. */
export async function regeneratePin(code: string): Promise<{ store: StoreRegistryRecord; pin: string } | null> {
  const record = await findStoreRecord(code);
  if (!record) return null;

  const pin = generatePin();
  const pinHash = hashStorePin(record.code, pin);
  const now = new Date().toISOString();

  const next: StoreRegistryRecord = {
    ...record,
    hasPin: true,
    pinSetAt: now,
    pinEnabled: true,
    updatedAt: now,
  };

  memory().stores.set(next.code, next);
  memory().pins.set(next.code, { storeCode: next.code, pinHash, setAt: now, enabled: true });

  await supabaseRequest(`stores?store_code=eq.${encodeURIComponent(next.code)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ pin_hash: pinHash, pin_set_at: now, pin_enabled: true, updated_at: now }),
  });

  return { store: next, pin };
}

/**
 * 점주 PIN 검증.
 *  - 메모리(이 프로세스에서 발급·검증한 것) → Supabase(pin_hash) 순.
 *  - 시드 지점은 아직 pin_hash가 DB에 없어서 데모 PIN(0000)으로 연다.
 *  - 컬럼이 아직 없으면(SQL 미적용) 시드만 데모 PIN으로 통과한다.
 */
export async function verifyStorePin(record: StoreRegistryRecord, given: string | null | undefined) {
  if (!isValidPin(given)) return false;

  const cached = memory().pins.get(record.code);
  if (cached) return matchesStorePin(cached.pinHash, record.code, given);

  if (readSupabaseConfig()) {
    const response = await supabaseRequest(
      `stores?select=pin_hash,pin_enabled&store_code=eq.${encodeURIComponent(record.code)}&limit=1`,
    );

    if (response && response.ok) {
      const payload = (await response.json().catch(() => null)) as Record<string, unknown>[] | null;
      const hash = payload?.[0] && typeof payload[0].pin_hash === "string" ? payload[0].pin_hash : null;

      if (hash) {
        memory().pins.set(record.code, {
          storeCode: record.code,
          pinHash: hash,
          setAt: record.pinSetAt ?? new Date().toISOString(),
          enabled: readBoolean(payload?.[0]?.pin_enabled, record.pinEnabled),
        });

        return matchesStorePin(hash, record.code, given);
      }
    }
  }

  // 시드 지점 — 본사가 PIN을 따로 발급하기 전까지 데모 PIN.
  if (!record.hasAdminCode) return normalizePin(given) === DEMO_PIN;

  return false;
}

/** 교체완료 학습 기록 저장(지점 레코드의 calibrations에 SKU별로 덮어쓴다). */
export async function saveCalibration(
  code: string,
  entry: CalibrationEntry,
): Promise<StoreRegistryRecord | null> {
  const record = await findStoreRecord(code);
  if (!record) return null;

  const next: StoreRegistryRecord = {
    ...record,
    calibrations: { ...record.calibrations, [entry.sku]: entry },
    updatedAt: new Date().toISOString(),
  };

  memory().stores.set(next.code, next);

  await supabaseRequest(`stores?store_code=eq.${encodeURIComponent(next.code)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ calibration: next.calibrations, updated_at: next.updatedAt }),
  });

  return next;
}

/** 교체완료 1회를 이력표(`calibration_logs`)에 남긴다 — 실패해도 화면 동작에는 영향 없음. */
export async function logCalibration(input: {
  storeCode: string;
  sku: string;
  entry: CalibrationEntry;
  actualDays: number | null;
  expectedDays: number | null;
}): Promise<void> {
  await supabaseRequest("calibration_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        store_code: input.storeCode,
        sku: input.sku,
        replaced_at: input.entry.lastReplacedAt,
        previous_replaced_at: input.entry.previousReplacedAt,
        actual_days: input.actualDays,
        expected_days: input.expectedDays,
        factor: input.entry.factor,
        samples: input.entry.samples,
        full_capacity: input.entry.fullCapacity,
        note: input.entry.note,
      },
    ]),
  });
}

export function publicEntity(entity: StoreEntityProfile) {
  return { name: entity.name, businessNoMasked: entity.businessNo ? maskBusinessNo(entity.businessNo) : "미등록" };
}
