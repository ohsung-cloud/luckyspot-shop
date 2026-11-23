import { escalprintAdapter } from "./escalprint.mjs";
import { genericWebhookAdapter } from "./generic-webhook.mjs";
import { resolveVendorType, VENDOR_LABELS, VENDOR_TYPES } from "./types.mjs";
import { yupisoftAdapter } from "./yupisoft.mjs";

/**
 * 벤더 어댑터 레지스트리 (수집기).
 *
 * 지점 레코드의 `printVendor`(없으면 escalprint)로 어댑터를 고른다.
 * 어느 벤더든 앱으로 보내는 본문은 `storeCode + snapshot` 표준 봉투다.
 *
 *   const adapter = getAdapter(store.printVendor);
 *   const body = adapter.envelope({ store, capturedAt, escalprint, yupisoft, generic });
 */

export const ADAPTERS = {
  escalprint: escalprintAdapter,
  yupisoft: yupisoftAdapter,
  generic_webhook: genericWebhookAdapter,
};

export function getAdapter(vendor) {
  return ADAPTERS[resolveVendorType(vendor)];
}

/** 이 지점을 수집하려면 어떤 포털을 열어야 하는가. */
export function portalsFor(vendor) {
  const adapter = getAdapter(vendor);
  return adapter.id === "generic_webhook" ? ["loyalsuns"] : ["loyalsuns", adapter.id];
}

export { escalprintAdapter, genericWebhookAdapter, yupisoftAdapter, VENDOR_LABELS, VENDOR_TYPES };
