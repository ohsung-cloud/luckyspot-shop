"use client";

import { useState } from "react";

import { Card, CardBody, CardHead, Chip, Row, SUMMARY_ROW } from "@/components/internal/card-ui";
import { DEMO_STORES, SCENARIO_LABELS, type DemoScenario } from "@/features/auto-order/demo-pos";
import type { ProposalListResponse } from "@/features/auto-order/types";

import CoreStockCards from "./CoreStockCards";
import CrossForecastLab from "./CrossForecastLab";
import SplitSlips from "./SplitSlips";
import { dateLabel, days, ENTITY_LABEL, packUnit, won } from "./format";

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

const FIELD = "mt-1 h-12 w-full rounded-[14px] bg-[#F7F8F9] px-3.5 text-[14px] font-semibold text-[#0F1412] outline-none focus:bg-[#F1F3F2]";

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
        <p className="text-[12px] font-bold text-[#0B5C2A]">특허 1호 · 본사</p>
        <h1 className="mt-1.5 text-[24px] font-bold leading-[1.3] tracking-[-0.03em] text-[#0F1412]">교차예측 → 사업자 분리 발주</h1>
        <p className="mt-1.5 text-[12px] font-medium leading-[1.55] text-[#8B948D]">
          3종(원두·토너·용지) 소진을 함께 예측해 점주·본사 전표로 나눠요.
        </p>
      </header>

      {notice ? (
        <p className="rounded-[16px] bg-[#EDFBEF] px-4 py-3 text-[12px] font-semibold leading-[1.5] text-[#0B5C2A]">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-[16px] bg-[#FFF2F2] px-4 py-3 text-[12px] font-semibold leading-[1.5] text-[#B3261E]">{error}</p>
      ) : null}

      {loading && !state ? (
        <div className="h-[260px] animate-pulse rounded-[24px] bg-white" />
      ) : state ? (
        <Card>
          <CardHead
            right={<span className="text-[10.5px] font-semibold text-[#A7AFA9]">{dateLabel(state.asOfDate)}</span>}
            sub="잔여일이 기준 안으로 들어오면 발주 대상이 돼요"
            title={`3종 잔여 · ${state.storeLabel}`}
          />
          <CardBody className="pt-2">
            <CoreStockCards
              forecasts={state.run.forecasts}
              telemetry={state.telemetry}
              thresholds={{ beanDays: 4, tonerDays: 5, paperDays: 4 }}
            />

            <div className="mt-3 grid grid-cols-3 divide-x divide-[#F1F3F2] rounded-[16px] bg-[#F7F8F9] py-3">
              <div className="px-2 text-center">
                <p className="text-[10px] font-semibold text-[#A7AFA9]">음료 일평균</p>
                <p className="mt-1 text-[15px] font-bold tabular-nums text-[#0F1412]">{state.run.cafeDailyAvg}</p>
              </div>
              <div className="px-2 text-center">
                <p className="text-[10px] font-semibold text-[#A7AFA9]">출력 일평균</p>
                <p className="mt-1 text-[15px] font-bold tabular-nums text-[#0F1412]">{state.run.printDailyAvg}</p>
              </div>
              <div className="px-2 text-center">
                <p className="text-[10px] font-semibold text-[#A7AFA9]">최대 교차</p>
                <p className="mt-1 text-[15px] font-bold tabular-nums text-[#0F1412]">×{maxCross.toFixed(2)}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <details className="group">
          <summary className={SUMMARY_ROW}>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-[#0F1412]">교차예측 시뮬레이터</span>
              <span className="mt-0.5 block truncate text-[11.5px] font-medium text-[#8B948D]">슬라이더로 바로 확인해요</span>
            </span>
            <span aria-hidden className="text-[16px] font-bold text-[#C2C9C4] transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="border-t border-[#F1F3F2] px-5 py-4">
            <CrossForecastLab />
          </div>
        </details>
      </Card>

      {state ? (
        <>
          {state.hold ? (
            <div className="rounded-[20px] bg-[#FFF8E6] px-5 py-4">
              <Chip tone="amber">이상 감지 · 발주 보류</Chip>
              <h3 className="mt-2 text-[15px] font-bold text-[#0F1412]">{state.anomalies[0]?.title}</h3>
              <p className="mt-1 text-[11.5px] leading-[1.6] text-[#3B4740]">{state.anomalies[0]?.message}</p>
            </div>
          ) : null}

          <Card>
            <CardHead
              right={<Chip tone="gray">승인 전 미리보기</Chip>}
              sub="승인하면 공급처가 각 사업자 앞으로 세금계산서를 발행해요"
              title="사업자별 분기"
            />
            <CardBody className="pt-3">
              {state.splitPreview ? (
                <SplitSlips compact split={state.splitPreview} />
              ) : (
                <p className="rounded-[16px] bg-[#F7F8F9] px-4 py-6 text-center text-[12px] font-medium text-[#8B948D]">
                  {state.hold ? "이상 감지로 보류되어 분기를 만들지 않았어요." : "지금은 발주 대상이 없어요."}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <details className="group">
              <summary className={SUMMARY_ROW}>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold text-[#0F1412]">전체 품목 예측</span>
                  <span className="mt-0.5 block truncate text-[11.5px] font-medium text-[#8B948D]">
                    {state.run.forecasts.length}종 · 기본 소진과 교차 보정
                  </span>
                </span>
                <span aria-hidden className="text-[16px] font-bold text-[#C2C9C4] transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <div className="border-t border-[#F1F3F2] px-5">
                <ul className="divide-y divide-[#F1F3F2]">
                  {state.run.forecasts.map((forecast) => (
                    <li key={forecast.sku} className="py-3">
                      <Row
                        chip={ENTITY_LABEL[forecast.ownerEntityType].replace(" 사업자", "")}
                        chipTone={forecast.ownerEntityType === "franchisee_cafe" ? "green" : "blue"}
                        label={forecast.name}
                        sub={`기본 ${forecast.baseDailyConsumption.toLocaleString("ko-KR", { maximumFractionDigits: 1 })} → 보정 ${forecast.predictedDailyConsumption.toLocaleString("ko-KR", { maximumFractionDigits: 1 })} (×${forecast.crossFactor.toFixed(2)})${forecast.due && !state.hold ? ` · 발주 ${forecast.suggestedQty}${packUnit(forecast.packLabel)}` : ""}`}
                        value={days(forecast.remainingDays)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </Card>
        </>
      ) : null}

      <Card>
        <details className="group">
          <summary className={SUMMARY_ROW}>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-[#0F1412]">실수집 테스트</span>
              <span className="mt-0.5 block truncate text-[11.5px] font-medium text-[#8B948D]">POS 마감을 직접 넣어 예측해요</span>
            </span>
            <span aria-hidden className="text-[16px] font-bold text-[#C2C9C4] transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>

          <div className="border-t border-[#F1F3F2] px-5 py-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] font-semibold text-[#8B948D]">지점</span>
                <select className={FIELD} onChange={(event) => setStoreCode(event.target.value)} value={storeCode}>
                  {DEMO_STORES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-[#8B948D]">시나리오</span>
                <select className={FIELD} onChange={(event) => setScenario(event.target.value as DemoScenario)} value={scenario}>
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
                <span className="text-[11px] font-semibold text-[#8B948D]">하루 음료(잔)</span>
                <input
                  className={`${FIELD} tabular-nums`}
                  inputMode="numeric"
                  onChange={(event) => setDrinksPerDay(Number(event.target.value) || 1)}
                  type="number"
                  value={drinksPerDay}
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-[#8B948D]">하루 출력(매)</span>
                <input
                  className={`${FIELD} tabular-nums`}
                  inputMode="numeric"
                  onChange={(event) => setSheetsPerDay(Number(event.target.value) || 1)}
                  type="number"
                  value={sheetsPerDay}
                />
              </label>
            </div>

            <button
              className="mt-3 h-12 w-full rounded-[14px] bg-[#0F1412] text-[14px] font-bold text-white disabled:opacity-60"
              disabled={simulating}
              onClick={submit}
              type="button"
            >
              {simulating ? "예측하는 중…" : "이 조건으로 예측 실행"}
            </button>
            <p className="mt-1.5 text-[10px] leading-[1.55] text-[#A7AFA9]">
              장부에 남기지 않는 테스트예요. Supabase에 테이블이 있으면 입력분이 쌓여요.
            </p>
          </div>
        </details>
      </Card>

      <Card>
        <details className="group">
          <summary className={SUMMARY_ROW}>
            <span className="block text-[15px] font-bold text-[#0F1412]">계산식 · 상태 전이</span>
            <span aria-hidden className="text-[16px] font-bold text-[#C2C9C4] transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="space-y-1.5 border-t border-[#F1F3F2] px-5 py-4 text-[10.5px] leading-[1.7] text-[#8B948D]">
            <p>기본 소진/일 = Σ(14일 운전값 × 0.9^경과일) ÷ Σ(0.9^경과일) × 단위 소모량</p>
            <p>교차 계수 = 1 + w × clamp(최근 3일 ÷ 직전 주 같은 요일 3일 − 1, −0.4, +0.4)</p>
            <p>잔여일 = 현재고 ÷ (기본 소진 × 교차 계수) · 리드타임+안전재고 안이면 발주</p>
            <p>상태: pending_approval → grace_cancel_window(5분) → confirmed_split / 취소, 이상 시 held_anomaly</p>
            <p>
              출처:{" "}
              {state
                ? state.dataSource === "supabase"
                  ? "Supabase POS 마감"
                  : state.dataSource === "memory"
                    ? "방금 입력한 마감"
                    : "데모 실측 폴백"
                : "—"}
            </p>
          </div>
        </details>
      </Card>

      <p className="px-1 pb-4 text-[10px] leading-[1.6] text-[#B0B7B2]">
        내부용(검색 비노출). {state ? `${won(state.totals.totalAmount)} · 대상 ${state.totals.count}건` : ""}{" "}
        {state ? <span className="ml-1 font-semibold">{state.hold ? "보류" : "정상"}</span> : null}
      </p>
    </div>
  );
}
