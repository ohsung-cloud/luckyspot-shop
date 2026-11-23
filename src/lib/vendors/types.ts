import type { NormalizedSnapshot } from "../../features/auto-order/adapters";
import type { PosDailySales } from "../../features/auto-order/types";
import type { PrintVendorType } from "../../features/stores/registry-types";

/**
 * 프린트 복합기 멀티벤더 어댑터 (`PrintVendorAdapter`).
 *
 * 왜 계층이 필요한가
 *  - 매장마다 복합기 포털이 다르다(에스칼프린트 / 유피소프트 / 그 밖의 타사).
 *    앱 안쪽은 **표준 스냅샷(NormalizedSnapshot)** 하나만 알면 되도록,
 *    벤더별 차이는 이 폴더에서 흡수한다.
 *
 * 계약
 *  - `normalize(raw)` : 벤더 원본 JSON → 표준 스냅샷(장비 %·누적 카운터·매출·베스트셀러)
 *  - `detect(raw)`    : 이 벤더의 원본인가(수집기가 자동으로 골라 보낼 때)
 *  - `parseCsv(csv)`  : CSV 마감 업로드(타사 공용만) → 일일 마감 행 + 경고
 *
 * 원칙
 *  - 모르는 값은 0이 아니라 null로 남긴다(없는 값을 0으로 읽으면 '매출 급감'으로 오인된다).
 *  - 비밀번호·세션은 여기서 다루지 않는다(포털 로그인은 수집기, 키는 GitHub Secrets).
 */

export type VendorCapabilities = {
  /** 토너 %·트레이 % 같은 장비 상태를 주는가 */
  telemetry: boolean;
  /** 매출(일/월)을 주는가 */
  revenue: boolean;
  /** CSV 마감 업로드를 받는가 */
  csv: boolean;
  /** 표준 JSON 웹훅(/api/auto-order/ingest-pos)을 받는가 */
  jsonWebhook: boolean;
};

export type VendorNormalizeOptions = {
  storeCode: string;
  capturedAt?: string;
};

export interface PrintVendorAdapter {
  id: PrintVendorType;
  label: string;
  capabilities: VendorCapabilities;
  /** 이 벤더 원본이면 표준 스냅샷, 아니면 null */
  normalize(raw: Record<string, unknown>, options: VendorNormalizeOptions): NormalizedSnapshot | null;
  /** 원본만 보고 이 벤더인지 알아본다 */
  detect(raw: Record<string, unknown>): boolean;
  /** 타사 공용 CSV만 지원. 그 밖의 벤더는 null. */
  parseCsv?(csv: string, options: VendorNormalizeOptions): VendorCsvResult;
}

export type VendorCsvRow = PosDailySales;

export type VendorCsvResult = {
  rows: VendorCsvRow[];
  accepted: number;
  skipped: number;
  warnings: string[];
  /** 헤더에서 알아본 열 이름 — 미리보기에 그대로 보여준다 */
  headers: Record<string, string>;
};

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/[,\s원%매잔건장개gG]/g, "").replace(/^\+/, "");
  if (cleaned === "" || cleaned === "-") return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function asPct(value: unknown): number | null {
  const parsed = asNumber(value);
  if (parsed === null) return null;

  // 0.62 처럼 비율로 오는 벤더도 받아 준다.
  const normalized = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
  return Math.max(0, Math.min(100, Math.round(normalized * 10) / 10));
}

export function asText(value: unknown, max = 80): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text.length === 0 ? null : text.slice(0, max);
}

export function kstDateOf(value: string | number | Date | null | undefined): string {
  const date = value === null || value === undefined ? new Date() : new Date(value);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(safe);
}
