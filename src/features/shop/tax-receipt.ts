"use client";

/**
 * 주문 완료 화면이 "세금계산서 발급을 신청했는가"만 보여주기 위한 브라우저 기억.
 *
 * 2026-11-26 변경
 *  - 예전에는 사업자등록번호·상호·대표자·이메일까지 localStorage 에 남겼다(입력칸 프리필용).
 *    지금은 그 정보가 서버에만 있으므로, 브라우저에는 **발급 요청 여부(불린)** 만 남긴다.
 */

const RECEIPT_KEY = "ls_tax_receipt_v2";
const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECEIPTS = 20;

type ReceiptMap = Record<string, { at: string; requested: boolean }>;

function storage() {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readMap(): ReceiptMap {
  const store = storage();
  if (!store) return {};

  try {
    const raw = store.getItem(RECEIPT_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const cutoff = Date.now() - RECEIPT_TTL_MS;
    const next: ReceiptMap = {};

    for (const [orderId, entry] of Object.entries(parsed as ReceiptMap)) {
      if (typeof entry?.requested !== "boolean") continue;
      if (!(Number(entry?.at ? new Date(entry.at).getTime() : 0) > cutoff)) continue;

      next[orderId] = { at: entry.at, requested: entry.requested };
    }

    return next;
  } catch {
    return {};
  }
}

/** 발급을 신청한 주문만 남긴다(미신청이면 지난 값을 덮어쓰지 않는다). */
export function saveTaxReceipt(orderId: string, requested: boolean) {
  if (!orderId || !requested) return;

  const store = storage();
  if (!store) return;

  const map = readMap();
  map[orderId] = { at: new Date().toISOString(), requested: true };

  const entries = Object.entries(map)
    .sort(([, left], [, right]) => (left.at < right.at ? 1 : -1))
    .slice(0, MAX_RECEIPTS);

  try {
    store.setItem(RECEIPT_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // 저장 공간이 없으면 완료 화면이 안내 한 줄을 못 보여줄 뿐이다.
  }
}

/** 그 주문에 발급을 신청했는가. 기록이 없으면 null(화면에 줄을 그리지 않는다). */
export function readTaxReceipt(orderId: string | null | undefined): boolean | null {
  if (!orderId) return null;

  const entry = readMap()[orderId];

  return typeof entry?.requested === "boolean" ? entry.requested : null;
}
