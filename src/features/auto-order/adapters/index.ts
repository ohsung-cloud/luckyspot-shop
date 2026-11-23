import type { EscalprintSnapshotInput } from "./escalprint";
import { normalizeEscalprintSnapshot } from "./escalprint";
import type { LoyalsunsSnapshotInput } from "./loyalsuns";
import { normalizeLoyalsunsSnapshot } from "./loyalsuns";
import { kstDate, type NormalizedSnapshot, normalizeCapturedAt } from "./types";

export type { EscalprintSnapshotInput } from "./escalprint";
export type { LoyalsunsSnapshotInput } from "./loyalsuns";
export type { NormalizedSnapshot } from "./types";

/** ingest-pos가 받는 포털 스냅샷 봉투. 한 번에 두 사이트를 함께 보내도 된다. */
export type SnapshotEnvelope = {
  capturedAt?: string;
  source?: "escalprint" | "loyalsuns" | "both";
  escalprint?: EscalprintSnapshotInput;
  loyalsuns?: LoyalsunsSnapshotInput;
};

/** 봉투가 없이 포털 원본만 온 경우(device/toner 키, bestsellers 키)를 알아본다. */
export function detectSnapshotEnvelope(payload: Record<string, unknown>): SnapshotEnvelope | null {
  if (payload.snapshot && typeof payload.snapshot === "object") {
    return payload.snapshot as SnapshotEnvelope;
  }

  const looksEscalprint = "device" in payload || "toner" in payload || "paper" in payload;
  const looksLoyalsuns = "bestsellers" in payload || "machine" in payload;

  if (looksEscalprint && looksLoyalsuns) {
    return { escalprint: payload as EscalprintSnapshotInput, loyalsuns: payload as LoyalsunsSnapshotInput };
  }
  if (looksEscalprint) return { source: "escalprint", escalprint: payload as EscalprintSnapshotInput };
  if (looksLoyalsuns) return { source: "loyalsuns", loyalsuns: payload as LoyalsunsSnapshotInput };

  return null;
}

export function normalizeSnapshotEnvelope(
  envelope: SnapshotEnvelope,
  options: { storeCode: string },
): NormalizedSnapshot[] {
  const capturedAtFallback = normalizeCapturedAt(envelope.capturedAt);
  const snapshots: NormalizedSnapshot[] = [];

  if (envelope.escalprint || envelope.source === "escalprint" || envelope.source === "both") {
    snapshots.push(
      normalizeEscalprintSnapshot(envelope.escalprint ?? {}, {
        storeCode: options.storeCode,
        capturedAtFallback,
      }),
    );
  }

  if (envelope.loyalsuns || envelope.source === "loyalsuns" || envelope.source === "both") {
    snapshots.push(
      normalizeLoyalsunsSnapshot(envelope.loyalsuns ?? {}, {
        storeCode: options.storeCode,
        capturedAtFallback,
      }),
    );
  }

  return snapshots.map((snapshot) => ({ ...snapshot, salesDate: kstDate(snapshot.capturedAt) }));
}
