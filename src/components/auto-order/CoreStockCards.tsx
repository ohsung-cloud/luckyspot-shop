"use client";

import type { SkuForecast, TelemetrySummary } from "@/features/auto-order/types";

/**
 * 원두 · 토너 · 용지 3종 카드 — 자동발주·점주 화면 공통.
 *
 * 사용자 지시(2026-11-23): 발주는 토너·용지·원두만 핵심으로 본다.
 * 컵·뚜껑 등 나머지 품목은 '전체 품목 보기' 접이식으로 내린다.
 */

const CORE = [
  { sku: "bean-10kg", label: "원두", thresholdKey: "bean" as const },
  { sku: "toner-black", label: "토너", thresholdKey: "toner" as const },
  { sku: "a4-paper", label: "용지", thresholdKey: "paper" as const },
];

function daysLabel(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value >= 99) return "99일+";
  return `${value.toFixed(value < 10 ? 1 : 0)}일`;
}

function tone(value: number | null | undefined, threshold: number) {
  if (value === null || value === undefined) return "border-[#E6E9E7] bg-white text-[#98A29B]";
  if (value <= 2) return "border-[#F3D2D2] bg-[#FFF7F7] text-[#B3261E]";
  if (value <= threshold) return "border-[#F0E1B8] bg-[#FFFBF0] text-[#8A5A00]";
  return "border-[#D6EBDD] bg-white text-[#0F1412]";
}

export default function CoreStockCards({
  forecasts,
  telemetry,
  thresholds,
}: {
  forecasts: SkuForecast[];
  telemetry: TelemetrySummary | null;
  thresholds: { beanDays: number; tonerDays: number; paperDays: number };
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {CORE.map((item) => {
        const forecast = forecasts.find((entry) => entry.sku === item.sku);
        const limit = thresholds[`${item.thresholdKey}Days` as const];
        const due = Boolean(forecast?.due);

        const sub =
          item.sku === "bean-10kg"
            ? forecast
              ? `${Math.round(forecast.stockOnHand).toLocaleString("ko-KR")}g · ${forecast.predictedDailyConsumption.toFixed(0)}g/일`
              : "수집 전"
            : item.sku === "toner-black"
              ? telemetry
                ? `K ${telemetry.toner.k ?? "—"}% · C/M/Y ${Math.min(
                    ...[telemetry.toner.c, telemetry.toner.m, telemetry.toner.y].filter(
                      (value): value is number => typeof value === "number",
                    ),
                    100,
                  )}%`
                : forecast
                  ? `${Math.round(forecast.stockOnHand).toLocaleString("ko-KR")}g · ${forecast.predictedDailyConsumption.toFixed(1)}g/일`
                  : "수집 전"
              : telemetry
                ? `Tray ${telemetry.paper.tray1 ?? "—"}% · ${telemetry.paper.tray2 ?? "—"}%`
                : forecast
                  ? `${Math.round(forecast.stockOnHand).toLocaleString("ko-KR")}매 · ${forecast.predictedDailyConsumption.toFixed(0)}매/일`
                  : "수집 전";

        return (
          <div key={item.sku} className={`rounded-[16px] border p-2.5 ${tone(forecast?.remainingDays, limit)}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-bold text-[#3B4740]">{item.label}</span>
              {due ? (
                <span className="rounded-full bg-[#0F1412] px-1.5 py-0.5 text-[9.5px] font-bold text-[#1DFF26]">발주</span>
              ) : null}
            </div>
            <p className="mt-1.5 text-[19px] font-bold leading-none tabular-nums tracking-[-0.02em]">
              {daysLabel(forecast?.remainingDays)}
            </p>
            <p className="mt-1 truncate text-[10px] text-[#6B746D]">{sub}</p>
          </div>
        );
      })}
    </div>
  );
}
