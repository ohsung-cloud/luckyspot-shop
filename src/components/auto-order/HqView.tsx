"use client";

import { useState } from "react";

import { DEMO_STORES, SCENARIO_LABELS, type DemoScenario } from "@/features/auto-order/demo-pos";
import type { ProposalListResponse } from "@/features/auto-order/types";

import CoreStockCards from "./CoreStockCards";
import CrossForecastLab from "./CrossForecastLab";
import SplitSlips from "./SplitSlips";
import { dateLabel, days, ENTITY_LABEL, ENTITY_TONE, packUnit, won } from "./format";

export type SimulateInput = {
  storeCode: string;
  storeLabel: string;
  scenario: DemoScenario;
  drinksPerDay: number;
  sheetsPerDay: number;
  printSurgePct: number;
  cafeDropPct: number;
};

type HqViewProps = {
  state: ProposalListResponse | null;
  loading: boolean;
  error: string | null;
  simulating: boolean;
  notice: string | null;
  onSimulate: (input: SimulateInput) => void;
};

const SCENARIOS: DemoScenario[] = ["normal", "print_surge", "cafe_drop"];

export default function HqView({ state, loading, error, simulating, notice, onSimulate }: HqViewProps) {
  const [storeCode, setStoreCode] = useState(DEMO_STORES[0].code);
  const [scenario, setScenario] = useState<DemoScenario>("print_surge");
  const [drinksPerDay, setDrinksPerDay] = useState(88);
  const [sheetsPerDay, setSheetsPerDay] = useState(128);

  const store = DEMO_STORES.find((item) => item.code === storeCode) ?? DEMO_STORES[0];

  const submit = () => {
    onSimulate({
      storeCode,
      storeLabel: store.label,
      scenario,
      drinksPerDay,
      sheetsPerDay,
      printSurgePct: 35,
      cafeDropPct: -65,
    });
  };

  const maxCross = state ? Math.max(...state.run.forecasts.map((item) => item.crossFactor)) : 1;

  return (
    <div className="grid gap-3">
      <header className="px-1">
        <p className="text-[12.5px] font-semibold text-[#007A36]">특허 1호 · 본사</p>
        <h1 className="mt-1 text-[23px] font-bold leading-[1.25] tracking-[-0.02em] text-[#0F1412]">
          교차예측 → 사업자 분리 발주
        </h1>
        <p className="mt-1 text-[11.5px] leading-[1.6] text-[#6B746D]">
          3종(원두·토너·용지) 소진을 함께 예측해 점주·본사 전표로 나눕니다.
        </p>
      </header>

      {notice ? (
        <p className="rounded-[12px] bg-[#EDFBEF] px-3 py-2 text-[11.5px] font-semibold text-[#0B5C2A]">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-[12px] bg-[#FFEBEE] px-3 py-2 text-[11.5px] font-semibold text-[#B3261E]">{error}</p>
      ) : null}

      {loading && !state ? (
        <div className="h-[260px] animate-pulse rounded-[20px] bg-white" />
      ) : state ? (
        <section className="rounded-[20px] border-2 border-[#0F1412] bg-white p-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-[#0F1412]">3종 잔여 · {state.storeLabel}</h2>
            <span className="text-[10.5px] text-[#6B746D]">{dateLabel(state.asOfDate)}</span>
          </div>
          <div className="mt-2">
            <CoreStockCards
              forecasts={state.run.forecasts}
              telemetry={state.telemetry}
              thresholds={{ beanDays: 4, tonerDays: 5, paperDays: 4 }}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-[10px] bg-[#F8F9F9] py-1.5">
              <p className="text-[9.5px] text-[#6B746D]">음료 일평균</p>
              <p className="text-[13px] font-bold tabular-nums text-[#0F1412]">{state.run.cafeDailyAvg}</p>
            </div>
            <div className="rounded-[10px] bg-[#F8F9F9] py-1.5">
              <p className="text-[9.5px] text-[#6B746D]">출력 일평균</p>
              <p className="text-[13px] font-bold tabular-nums text-[#0F1412]">{state.run.printDailyAvg}</p>
            </div>
            <div className="rounded-[10px] bg-[#F8F9F9] py-1.5">
              <p className="text-[9.5px] text-[#6B746D]">최대 교차</p>
              <p className="text-[13px] font-bold tabular-nums text-[#0F1412]">×{maxCross.toFixed(2)}</p>
            </div>
          </div>
        </section>
      ) : null}

      <details className="rounded-[16px] border border-[#E6E9E7] bg-white px-3.5 py-3">
        <summary className="cursor-pointer text-[13px] font-bold text-[#3B4740]">교차예측 시뮬레이터 (특허 시연)</summary>
        <div className="mt-2">
          <CrossForecastLab />
        </div>
      </details>

      {state ? (
        <>
          {state.hold ? (
            <section className="rounded-[16px] border-2 border-[#E0A800] bg-[#FFF9EA] p-3.5">
              <p className="text-[11px] font-bold text-[#8A5A00]">이상 감지 · 자동발주 보류</p>
              <h3 className="mt-0.5 text-[15px] font-bold text-[#0F1412]">{state.anomalies[0]?.title}</h3>
              <p className="mt-1 text-[11.5px] leading-[1.55] text-[#3B4740]">{state.anomalies[0]?.message}</p>
            </section>
          ) : null}

          <section className="rounded-[18px] border border-[#E6E9E7] bg-white p-3.5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[14px] font-bold text-[#0F1412]">승인 시 사업자별 분기</h2>
              <span className="text-[10.5px] text-[#6B746D]">승인 전 미리보기</span>
            </div>
            <div className="mt-2">
              {state.splitPreview ? (
                <SplitSlips compact split={state.splitPreview} />
              ) : (
                <p className="rounded-[10px] bg-[#FFF9EA] px-3 py-3 text-center text-[11.5px] text-[#8A5A00]">
                  {state.hold ? "이상 감지로 보류되어 분기가 만들어지지 않았습니다." : "지금은 발주 대상이 없습니다."}
                </p>
              )}
            </div>
          </section>

          <details className="rounded-[16px] border border-[#E6E9E7] bg-white px-3.5 py-3">
            <summary className="cursor-pointer text-[13px] font-bold text-[#3B4740]">
              전체 품목 예측 ({state.run.forecasts.length})
            </summary>
            <ul className="mt-2 divide-y divide-[#F4F5F6]">
              {state.run.forecasts.map((forecast) => (
                <li key={forecast.sku} className="py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[#0F1412]">{forecast.name}</span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ${ENTITY_TONE[forecast.ownerEntityType]}`}>
                      {ENTITY_LABEL[forecast.ownerEntityType].replace(" 사업자", "")}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold tabular-nums text-[#0F1412]">{days(forecast.remainingDays)}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-[1.5] text-[#98A29B]">
                    기본 {forecast.baseDailyConsumption.toLocaleString("ko-KR", { maximumFractionDigits: 1 })} → 보정{" "}
                    {forecast.predictedDailyConsumption.toLocaleString("ko-KR", { maximumFractionDigits: 1 })} (×
                    {forecast.crossFactor.toFixed(2)})
                    {forecast.due && !state.hold ? ` · 발주 ${forecast.suggestedQty}${packUnit(forecast.packLabel)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : null}

      <details className="rounded-[16px] border border-[#E6E9E7] bg-white px-3.5 py-3">
        <summary className="cursor-pointer text-[13px] font-bold text-[#3B4740]">실수집 테스트 (POS 마감 입력)</summary>
        <div className="mt-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-semibold text-[#6B746D]">지점</span>
              <select
                className="mt-1 h-11 w-full rounded-[10px] border border-[#E6E9E7] bg-white px-2 text-[14px] font-semibold text-[#0F1412]"
                onChange={(event) => setStoreCode(event.target.value)}
                value={storeCode}
              >
                {DEMO_STORES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-[#6B746D]">시나리오</span>
              <select
                className="mt-1 h-11 w-full rounded-[10px] border border-[#E6E9E7] bg-white px-2 text-[14px] font-semibold text-[#0F1412]"
                onChange={(event) => setScenario(event.target.value as DemoScenario)}
                value={scenario}
              >
                {SCENARIOS.map((value) => (
                  <option key={value} value={value}>
                    {SCENARIO_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-semibold text-[#6B746D]">하루 음료(잔)</span>
              <input
                className="mt-1 h-11 w-full rounded-[10px] border border-[#E6E9E7] px-2 text-[15px] font-semibold tabular-nums"
                inputMode="numeric"
                onChange={(event) => setDrinksPerDay(Number(event.target.value) || 1)}
                type="number"
                value={drinksPerDay}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold text-[#6B746D]">하루 출력(매)</span>
              <input
                className="mt-1 h-11 w-full rounded-[10px] border border-[#E6E9E7] px-2 text-[15px] font-semibold tabular-nums"
                inputMode="numeric"
                onChange={(event) => setSheetsPerDay(Number(event.target.value) || 1)}
                type="number"
                value={sheetsPerDay}
              />
            </label>
          </div>

          <button
            className="mt-2 h-12 w-full rounded-[12px] bg-[#0F1412] text-[14px] font-bold text-white disabled:opacity-60"
            disabled={simulating}
            onClick={submit}
            type="button"
          >
            {simulating ? "예측하는 중…" : "이 조건으로 예측 실행"}
          </button>
          <p className="mt-1 text-[10px] leading-[1.5] text-[#98A29B]">장부에 쓰지 않는 테스트입니다. Supabase에 테이블이 있으면 입력분이 쌓입니다.</p>
        </div>
      </details>

      <details className="rounded-[16px] border border-[#E6E9E7] bg-white px-3.5 py-3">
        <summary className="cursor-pointer text-[13px] font-bold text-[#3B4740]">계산식 · 상태 전이</summary>
        <div className="mt-2 space-y-1.5 text-[11px] leading-[1.7] text-[#6B746D]">
          <p>기본 소진/일 = Σ(14일 운전값 × 0.9^경과일) ÷ Σ(0.9^경과일) × 단위 소모량</p>
          <p>교차 계수 = 1 + w × clamp(최근 3일 ÷ 직전 주 같은 요일 3일 − 1, −0.4, +0.4)</p>
          <p>잔여일 = 현재고 ÷ (기본 소진 × 교차 계수) · 리드타임+안전재고 안이면 발주</p>
          <p>
            상태: pending_approval → grace_cancel_window(5분) → confirmed_split / 취소, 이상 시 held_anomaly
          </p>
          <p>출처: {state ? (state.dataSource === "supabase" ? "Supabase POS 마감" : state.dataSource === "memory" ? "방금 입력한 마감" : "데모 실측 폴백") : "—"}</p>
        </div>
      </details>

      <p className="px-1 pb-4 text-[10px] leading-[1.6] text-[#98A29B]">
        내부용(검색 비노출). {state ? `${won(state.totals.totalAmount)} · 대상 ${state.totals.count}건` : ""}
      </p>
    </div>
  );
}
