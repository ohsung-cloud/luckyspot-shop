import type { OwnerEntityType } from "@/features/auto-order/types";

export const ENTITY_LABEL: Record<OwnerEntityType, string> = {
  franchisee_cafe: "점주 사업자",
  hq_print: "본사 사업자",
};

export const ENTITY_TONE: Record<OwnerEntityType, string> = {
  franchisee_cafe: "bg-[#EDFBEF] text-[#0B5C2A]",
  hq_print: "bg-[#EEF2FF] text-[#243B8F]",
};

export function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function days(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 99) return "99일+";
  return `${value.toFixed(1)}일`;
}

export function clock(totalSeconds: number) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function pct(value: number) {
  const rounded = Math.round(value * 100);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

export function dateLabel(iso: string) {
  if (!iso) return "-";
  const [, month, day] = iso.split("-");
  if (!month || !day) return iso;
  return `${Number(month)}/${Number(day)}`;
}

export function remainingTone(remainingDays: number) {
  if (remainingDays <= 2) return "bg-[#FFEBEE] text-[#B3261E]";
  if (remainingDays <= 4) return "bg-[#FFF6E0] text-[#8A5A00]";
  return "bg-[#EDFBEF] text-[#0B5C2A]";
}
