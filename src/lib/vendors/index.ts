import type { NormalizedSnapshot } from "../../features/auto-order/adapters";
import { PRINT_VENDOR_LABELS, PRINT_VENDORS, type PrintVendorType } from "../../features/stores/registry-types";

import { escalprintAdapter } from "./escalprint";
import { genericWebhookAdapter, parseSalesCsv } from "./generic-webhook";
import type { PrintVendorAdapter, VendorCsvResult } from "./types";
import { yupisoftAdapter } from "./yupisoft";

/**
 * 프린트 벤더 어댑터 레지스트리.
 *
 * 매장 레코드의 `printVendor` 값 하나로 수집·정규화·CSV 입구가 갈린다.
 *  - escalprint     : 기존 에스칼프린트 포털 (1호 벤더)
 *  - yupisoft       : 유피소프트 포털/API 스키마
 *  - generic_webhook: 타사 복합기 공용 — 표준 JSON + CSV
 */

export const PRINT_VENDOR_ADAPTERS: Record<PrintVendorType, PrintVendorAdapter> = {
  escalprint: escalprintAdapter,
  yupisoft: yupisoftAdapter,
  generic_webhook: genericWebhookAdapter,
};

export function getPrintVendorAdapter(vendor: string | null | undefined): PrintVendorAdapter {
  const key = (vendor ?? "").trim() as PrintVendorType;
  return PRINT_VENDOR_ADAPTERS[key] ?? PRINT_VENDOR_ADAPTERS.escalprint;
}

export function isPrintVendor(value: unknown): value is PrintVendorType {
  return typeof value === "string" && (PRINT_VENDORS as readonly string[]).includes(value);
}

export function vendorLabel(vendor: string | null | undefined) {
  return isPrintVendor(vendor) ? PRINT_VENDOR_LABELS[vendor] : PRINT_VENDOR_LABELS.escalprint;
}

/** 원본 JSON을 벤더에 맞춰 표준 스냅샷으로 바꾼다. 벤더를 모르면 감지 순서로 시도. */
export function normalizeVendorPayload(input: {
  vendor?: string | null;
  storeCode: string;
  capturedAt?: string;
  raw: Record<string, unknown>;
}): { snapshot: NormalizedSnapshot | null; vendor: PrintVendorType } {
  const adapter = isPrintVendor(input.vendor)
    ? PRINT_VENDOR_ADAPTERS[input.vendor]
    : [escalprintAdapter, yupisoftAdapter, genericWebhookAdapter].find((candidate) => candidate.detect(input.raw)) ??
      escalprintAdapter;

  return {
    snapshot: adapter.normalize(input.raw, { storeCode: input.storeCode, capturedAt: input.capturedAt }),
    vendor: adapter.id,
  };
}

/** CSV를 일일 마감 행으로 판다(공용 벤더 전용). */
export function previewVendorCsv(input: { vendor?: string | null; storeCode: string; csv: string }): VendorCsvResult {
  const adapter = getPrintVendorAdapter(input.vendor);
  if (!adapter.parseCsv) {
    return {
      rows: [],
      accepted: 0,
      skipped: 0,
      warnings: [`${adapter.label} 벤더는 CSV 업로드를 쓰지 않습니다. 표준 JSON 웹훅을 사용해 주세요.`],
      headers: {},
    };
  }

  return adapter.parseCsv(input.csv, { storeCode: input.storeCode });
}

export { escalprintAdapter, genericWebhookAdapter, parseSalesCsv, yupisoftAdapter };
export type { PrintVendorAdapter, VendorCsvResult };
