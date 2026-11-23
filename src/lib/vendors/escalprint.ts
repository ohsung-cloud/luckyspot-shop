import type { NormalizedSnapshot } from "../../features/auto-order/adapters";
import type { EscalprintSnapshotInput } from "../../features/auto-order/adapters/escalprint";
import { normalizeEscalprintSnapshot } from "../../features/auto-order/adapters/escalprint";

import type { PrintVendorAdapter, VendorNormalizeOptions } from "./types";

/**
 * 에스칼프린트 — 기존 포털 어댑터(1호 벤더).
 *
 * 실제 포털 화면에서 확인된 값(토너 K/C/M/Y %, Tray1/2 %, 누적 출력 매수, 월 실매출)을
 * 표준 스냅샷으로 옮긴다. 정규화 본체는 `features/auto-order/adapters/escalprint.ts`에 있고,
 * 여기서는 벤더 계층의 공통 계약(라벨·능력·감지)만 씌운다.
 */

const KEYS = new Set(["device", "toner", "paper", "cumulativePrintCount", "revenue", "escalprint"]);

export const escalprintAdapter: PrintVendorAdapter = {
  id: "escalprint",
  label: "에스칼프린트",
  capabilities: { telemetry: true, revenue: true, csv: false, jsonWebhook: true },

  detect(raw) {
    if (!raw || typeof raw !== "object") return false;
    if ("escalprint" in raw) return true;
    return Object.keys(raw).some((key) => KEYS.has(key)) && !("consumables" in raw);
  },

  normalize(raw, options: VendorNormalizeOptions): NormalizedSnapshot | null {
    const payload = (raw.escalprint ?? raw) as EscalprintSnapshotInput;
    if (!payload || typeof payload !== "object") return null;

    return normalizeEscalprintSnapshot(payload, {
      storeCode: options.storeCode,
      capturedAtFallback: options.capturedAt,
    });
  },
};
