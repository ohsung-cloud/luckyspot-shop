"use client";

/**
 * 세금계산서 정보의 브라우저 기억 (localStorage) — 서버로 먼저 나가지 않는다.
 *
 *  · 지점별 프로필  : 한 번 입력한 사업자 정보를 같은 지점의 다음 주문에 미리 채운다
 *  · 최근 프로필    : 다른 지점·직접 입력에서도 마지막 값을 제안한다
 *  · 발급 접수 기록 : 주문 완료 화면이 주문번호로 "발급 신청됨"을 보여주는 근거
 *
 * 주문 자체는 항상 서버가 검증한다. 여기 값은 입력을 줄이는 용도일 뿐이다.
 * (사업자등록번호·상호·대표자명은 공개 등록 정보, 이메일은 발급 수취용이다.)
 */

import type { TaxInvoiceRequest } from "@/features/tax-invoice";

const PROFILE_KEY = "ls_tax_profile_v1";
const RECEIPT_KEY = "ls_tax_receipt_v1";
const PROFILE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_STORES = 20;
const MAX_RECEIPTS = 10;

type StoredProfile = { at: string; value: TaxInvoiceRequest };
type ProfileMap = Record<string, StoredProfile>;
type Receipt = { at: string; value: TaxInvoiceRequest };
type ReceiptMap = Record<string, Receipt>;

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!hasStorage()) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    return parsed as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (!hasStorage()) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간이 없으면 입력을 매번 하면 된다.
  }
}

function normalizeProfile(value: unknown): TaxInvoiceRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Partial<TaxInvoiceRequest>;

  if (typeof candidate.requested !== "boolean") return null;

  const text = (input: unknown) => (typeof input === "string" ? input : "");

  return {
    businessItem: text(candidate.businessItem),
    businessName: text(candidate.businessName),
    businessNo: text(candidate.businessNo),
    businessType: text(candidate.businessType),
    ceoName: text(candidate.ceoName),
    email: text(candidate.email),
    requested: candidate.requested,
  };
}

function profileKey(storeCode: string | null | undefined) {
  return storeCode?.trim() || "DIRECT";
}

function readProfileMap(): ProfileMap {
  const map = readJson<ProfileMap>(PROFILE_KEY) ?? {};
  const cutoff = Date.now() - PROFILE_TTL_MS;
  const next: ProfileMap = {};

  for (const [key, entry] of Object.entries(map)) {
    const value = normalizeProfile(entry?.value);
    if (!value) continue;
    if (!(Number(entry?.at ? new Date(entry.at).getTime() : 0) > cutoff)) continue;

    next[key] = { at: entry.at, value };
  }

  return next;
}

/** 그 지점에 저장해 둔 발급 정보 (없으면 null). */
export function readStoredTaxProfile(storeCode: string | null | undefined) {
  const map = readProfileMap();

  return map[profileKey(storeCode)]?.value ?? null;
}

/** 가장 최근에 쓴 발급 정보 — 다른 지점·직접 입력에서 기본값으로 제안한다. */
export function readRecentTaxProfile() {
  const map = readProfileMap();
  const entries = Object.entries(map);

  if (!entries.length) return null;

  entries.sort(([, left], [, right]) => (left.at < right.at ? 1 : -1));

  return entries[0][1].value;
}

/** 발급을 신청한 정보만 저장한다(미신청 상태로 덮어써 지난 값을 지우지 않는다). */
export function saveTaxProfile(storeCode: string | null | undefined, tax: TaxInvoiceRequest | null) {
  if (!tax?.requested) return;

  const map = readProfileMap();
  map[profileKey(storeCode)] = { at: new Date().toISOString(), value: { ...tax, requested: true } };

  const entries = Object.entries(map)
    .sort(([, left], [, right]) => (left.at < right.at ? 1 : -1))
    .slice(0, MAX_STORES);

  writeJson(PROFILE_KEY, Object.fromEntries(entries));
}

/** 주문 완료 화면이 주문번호로 발급 상태를 보여줄 수 있게 남긴다. */
export function saveTaxReceipt(orderId: string, tax: TaxInvoiceRequest | null) {
  if (!orderId || !tax) return;

  const map = readJson<ReceiptMap>(RECEIPT_KEY) ?? {};
  const cutoff = Date.now() - RECEIPT_TTL_MS;

  for (const [key, entry] of Object.entries(map)) {
    if (!(Number(entry?.at ? new Date(entry.at).getTime() : 0) > cutoff)) delete map[key];
  }

  map[orderId] = { at: new Date().toISOString(), value: { ...tax, requested: tax.requested === true } };

  const entries = Object.entries(map)
    .sort(([, left], [, right]) => (left.at < right.at ? 1 : -1))
    .slice(0, MAX_RECEIPTS);

  writeJson(RECEIPT_KEY, Object.fromEntries(entries));
}

export function readTaxReceipt(orderId: string | null | undefined) {
  if (!orderId) return null;

  const map = readJson<ReceiptMap>(RECEIPT_KEY) ?? {};

  return normalizeProfile(map[orderId]?.value);
}
