"use client";

import { QUIET_BUTTON, Row, RowList } from "@/components/internal/card-ui";
import type { SkuForecast, TelemetrySummary } from "@/features/auto-order/types";

/**
 * 원두 · 토너 · 용지 3종 — 자동발주·점주 화면 공통.
 *
 * 토스식 한 줄 위계: 왼쪽 라벨 + 짧은 설명, 오른쪽 굵은 잔여일·상태 칩,
 * 필요하면 오른쪽 끝에 '교체완료' 작은 버튼.
 *
 * 사용자 지시(2026-11-23): 발주는 토너·용지·원두만 핵심으로 본다.
 * 컵·뚜껑 등 나머지 품목은 '전체 품목 보기' 접이식으로 내린다.
 */

const CORE = [
  { sku: "bean-10kg", label: "원두", thresholdKey: "bean" as const },
  { sku: "toner-black", label: "토너", thresholdKey: "toner" as const },
  { sku: "a4-paper", label: "용지", thresholdKey: "paper" as const },
];

type Tone = "red" | "amber" | "ok" | "gray";

const DOT: Record<Tone, string> = {
  red: "bg-[#B3261E]",
  amber: "bg-[#E0A800]",
  ok: "bg-[#1D9F4C]",
  gray: "bg-[#C9CFCB]",
};

const VALUE_TONE: Record<Tone, "red" | "amber" | "ink" | "muted"> = {
  red: "red",
  amber: "amber",
  ok: "ink",
  gray: "muted",
};

function daysLabel(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value >= 99) return "99일+";
  return `${value.toFixed(value < 10 ? 1 : 0)}일`;
}

function tone(value: number | null | undefined, threshold: number): Tone {
  if (value === null || value === undefined) return "gray";
  if (value <= 2) return "red";
  if (value <= threshold) return "amber";
  return "ok";
}

export default function CoreStockCards({
  forecasts,
  telemetry,
  thresholds,
  onCalibrate,
  calibrating,
  replacementNotes,
}: {
  forecasts: SkuForecast[];
  telemetry: TelemetrySummary | null;
  thresholds: { beanDays: number; tonerDays: number; paperDays: number };
  /** 교체완료 — 누르면 잔량 100% + 소진 속도 학습(POST /api/stores/[code]/calibrate) */
  onCalibrate?: (sku: string) => void;
  calibrating?: string | null;
  /** "오늘 교체 · 학습 0.96x" 같은 한 줄(있으면 잔량 설명 대신 보여 준다) */
  replacementNotes?: Record<string, string>;
}) {
  return (
    <RowList>
      {CORE.map((item) => {
        const forecast = forecasts.find((entry) => entry.sku === item.sku);
        const limit = thresholds[`${item.thresholdKey}Days` as const];
        const due = Boolean(forecast?.due);
        const status = tone(forecast?.remainingDays, limit);

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
          <Row
            key={item.sku}
            chip={due ? "발주" : undefined}
            chipTone="ink"
            dot={DOT[status]}
            label={item.label}
            sub={replacementNotes?.[item.sku] ?? sub}
            trailing={
              onCalibrate && item.sku !== "toner-color" ? (
                <button
                  className={QUIET_BUTTON}
                  disabled={calibrating === item.sku}
                  onClick={() => onCalibrate(item.sku)}
                  type="button"
                >
                  {calibrating === item.sku ? "기록 중" : "교체완료"}
                </button>
              ) : null
            }
            value={daysLabel(forecast?.remainingDays)}
            valueTone={VALUE_TONE[status]}
          />
        );
      })}
    </RowList>
  );
}
