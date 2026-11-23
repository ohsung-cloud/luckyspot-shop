"use client";

import { useState } from "react";

import { DEMO_STORES, SCENARIO_LABELS, type DemoScenario } from "@/features/auto-order/demo-pos";
import type { ProposalListResponse } from "@/features/auto-order/types";

import SplitSlips from "./SplitSlips";
import { dateLabel, days, ENTITY_LABEL, ENTITY_TONE, pct, won } from "./format";

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
    <div className="grid gap-4">
      <header className="px-1">
        <p className="text-[14px] font-semibold text-[#007A36]">특허 1호 · 본사 실증 뷰</p>
        <h1 className="mt-1.5 text-[25px] font-bold leading-[1.3] tracking-[-0.02em] text-[#0F1412] sm:text-[29px]">
          이종 매출 교차예측과
          <br />
          다중사업자 발주·세금계산서 분기
        </h1>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-[#6B746D]">
          POS 마감을 넣으면 ① 기본 소진량 ② 교차 보정 ③ 이상 보류 ④ 사업자 분기까지 한 번에 계산합니다.
        </p>
      </header>

      {notice ? (
        <p className="rounded-[14px] bg-[#EDFBEF] px-4 py-3 text-[13px] font-semibold text-[#0B5C2A]">{notice}</p>
      ) : null}

      {error ? (
        <p className="rounded-[14px] bg-[#FFEBEE] px-4 py-3 text-[13px] font-semibold text-[#B3261E]">{error}</p>
      ) : null}

      <section className="rounded-[22px] border border-[#E6E9E7] bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[#0F1412]">테스트용 POS 시뮬레이션 입력</h2>
          <span className="rounded-full bg-[#F4F5F6] px-2.5 py-1 text-[11px] font-semibold text-[#6B746D]">
            {simulating ? "계산 중…" : "실행 대기"}
          </span>
        </div>

        <label className="mt-3 block text-[12px] font-semibold text-[#6B746D]">지점</label>
        <select
          className="mt-1 h-12 w-full rounded-[12px] border border-[#E6E9E7] bg-white px-3 text-[14px] font-semibold text-[#0F1412]"
          onChange={(event) => setStoreCode(event.target.value)}
          value={storeCode}
        >
          {DEMO_STORES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label} ({item.code})
            </option>
          ))}
        </select>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {SCENARIOS.map((value) => (
            <button
              key={value}
              className={`h-11 rounded-[12px] border text-[12.5px] font-bold ${
                scenario === value
                  ? "border-[#0F1412] bg-[#0F1412] text-white"
                  : "border-[#E6E9E7] bg-white text-[#3B4740]"
              }`}
              onClick={() => setScenario(value)}
              type="button"
            >
              {SCENARIO_LABELS[value]}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[12px] font-semibold text-[#6B746D]">하루 음료(잔)</span>
            <input
              className="mt-1 h-12 w-full rounded-[12px] border border-[#E6E9E7] px-3 text-[15px] font-semibold tabular-nums text-[#0F1412]"
              inputMode="numeric"
              max={3000}
              min={1}
              onChange={(event) => setDrinksPerDay(Number(event.target.value) || 1)}
              type="number"
              value={drinksPerDay}
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-semibold text-[#6B746D]">하루 출력(매)</span>
            <input
              className="mt-1 h-12 w-full rounded-[12px] border border-[#E6E9E7] px-3 text-[15px] font-semibold tabular-nums text-[#0F1412]"
              inputMode="numeric"
              max={8000}
              min={1}
              onChange={(event) => setSheetsPerDay(Number(event.target.value) || 1)}
              type="number"
              value={sheetsPerDay}
            />
          </label>
        </div>

        <button
          className="mt-3 h-12 w-full rounded-[14px] bg-[#0F1412] text-[15px] font-bold text-white disabled:opacity-60"
          disabled={simulating}
          onClick={submit}
          type="button"
        >
          {simulating ? "예측하는 중…" : "이 조건으로 예측 실행"}
        </button>
        <p className="mt-2 text-[11.5px] leading-[1.6] text-[#98A29B]">
          장부에 쓰지 않는 시뮬레이션입니다. 실제 Supabase에 테이블이 있으면 입력분이 쌓입니다.
        </p>
      </section>

      {loading && !state ? (
        <div className="h-[280px] animate-pulse rounded-[22px] bg-white" />
      ) : null}

      {state ? (
        <>
          <section className="grid grid-cols-3 gap-2">
            <div className="rounded-[16px] bg-white p-3 text-center">
              <p className="text-[11px] text-[#6B746D]">음료 일평균</p>
              <p className="mt-1 text-[20px] font-bold tabular-nums text-[#0F1412]">{state.run.cafeDailyAvg}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-[#007A36]">{pct(state.run.cafeRecentRatio - 1)} 최근</p>
            </div>
            <div className="rounded-[16px] bg-white p-3 text-center">
              <p className="text-[11px] text-[#6B746D]">출력 일평균</p>
              <p className="mt-1 text-[20px] font-bold tabular-nums text-[#0F1412]">{state.run.printDailyAvg}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-[#243B8F]">{pct(state.run.printRecentRatio - 1)} 최근</p>
            </div>
            <div className="rounded-[16px] bg-white p-3 text-center">
              <p className="text-[11px] text-[#6B746D]">최대 교차 보정</p>
              <p className="mt-1 text-[20px] font-bold tabular-nums text-[#0F1412]">×{maxCross.toFixed(2)}</p>
              <p className="mt-0.5 text-[11px] text-[#6B746D]">{dateLabel(state.asOfDate)} 기준</p>
            </div>
          </section>

          {state.hold ? (
            <section className="rounded-[20px] border-2 border-[#E0A800] bg-[#FFF9EA] p-4">
              <p className="text-[12px] font-bold text-[#8A5A00]">이상 감지 · 자동발주 보류</p>
              <h3 className="mt-1 text-[17px] font-bold text-[#0F1412]">{state.anomalies[0]?.title}</h3>
              <p className="mt-1.5 text-[13px] leading-[1.6] text-[#3B4740]">{state.anomalies[0]?.message}</p>
              <p className="mt-2 text-[12px] tabular-nums text-[#8A5A00]">
                음료 {pct(state.anomalies[0]?.cafeRatio ? state.anomalies[0].cafeRatio - 1 : 0)} · 프린트{" "}
                {pct(state.anomalies[0]?.printRatio ? state.anomalies[0].printRatio - 1 : 0)}
              </p>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-[22px] border border-[#E6E9E7] bg-white">
            <div className="flex items-center justify-between border-b border-[#EFF1F0] px-4 py-3">
              <h2 className="text-[15px] font-bold text-[#0F1412]">SKU별 소진 예측</h2>
              <span className="text-[11.5px] text-[#6B746D]">14일 창 · 지수가중 0.9</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr className="bg-[#FAFBFB] text-[11.5px] text-[#6B746D]">
                    <th className="px-3 py-2 font-semibold">품목</th>
                    <th className="px-2 py-2 font-semibold">사업자</th>
                    <th className="px-2 py-2 text-right font-semibold">기본/일</th>
                    <th className="px-2 py-2 text-right font-semibold">교차</th>
                    <th className="px-2 py-2 text-right font-semibold">보정/일</th>
                    <th className="px-2 py-2 text-right font-semibold">잔여</th>
                    <th className="px-3 py-2 text-right font-semibold">판정</th>
                  </tr>
                </thead>
                <tbody>
                  {state.run.forecasts.map((forecast) => (
                    <tr key={forecast.sku} className="border-t border-[#F4F5F6] text-[12.5px]">
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-[#0F1412]">{forecast.name}</p>
                        <p className="text-[11px] text-[#98A29B]">{forecast.evidenceLine}</p>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${ENTITY_TONE[forecast.ownerEntityType]}`}>
                          {ENTITY_LABEL[forecast.ownerEntityType]}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-[#3B4740]">
                        {forecast.baseDailyConsumption.toLocaleString("ko-KR")}
                      </td>
                      <td
                        className={`px-2 py-2.5 text-right font-semibold tabular-nums ${
                          forecast.crossFactor > 1.005 ? "text-[#007A36]" : forecast.crossFactor < 0.995 ? "text-[#B3261E]" : "text-[#98A29B]"
                        }`}
                      >
                        ×{forecast.crossFactor.toFixed(2)}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-[#0F1412]">
                        {forecast.predictedDailyConsumption.toLocaleString("ko-KR")}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-[#0F1412]">{days(forecast.remainingDays)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {state.hold ? (
                          <span className="rounded-full bg-[#FFF6E0] px-2 py-0.5 text-[10.5px] font-bold text-[#8A5A00]">보류</span>
                        ) : forecast.due ? (
                          <span className="rounded-full bg-[#EDFBEF] px-2 py-0.5 text-[10.5px] font-bold text-[#0B5C2A]">
                            발주 {forecast.suggestedQty}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#98A29B]">정상</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-[22px] border border-[#E6E9E7] bg-white p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-bold text-[#0F1412]">승인 시 사업자별 분기 결과</h2>
              <span className="text-[11.5px] text-[#6B746D]">미리보기 · 승인 전</span>
            </div>
            <p className="mt-1 text-[12px] leading-[1.6] text-[#6B746D]">
              1건의 통합 승인이 점주 사업자(카페)와 본사 사업자(프린트) 발주 전표로 갈라지고, 공급처별 세금계산서 수신
              주체가 함께 지정됩니다.
            </p>
            <div className="mt-3">
              {state.splitPreview ? (
                <SplitSlips split={state.splitPreview} />
              ) : (
                <p className="rounded-[14px] bg-[#FFF9EA] px-4 py-5 text-center text-[12.5px] text-[#8A5A00]">
                  {state.hold ? "이상 감지로 보류되어 분기가 만들어지지 않았습니다." : "지금은 발주 대상이 없습니다."}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-[22px] border border-[#E6E9E7] bg-white p-4">
            <h2 className="text-[15px] font-bold text-[#0F1412]">상태 전이 (5분 유예)</h2>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold">
              <span className="rounded-full bg-[#F4F5F6] px-2.5 py-1 text-[#3B4740]">pending_approval</span>
              <span className="text-[#98A29B]">→</span>
              <span className="rounded-full bg-[#0F1412] px-2.5 py-1 text-[#1DFF26]">grace_cancel_window (5분)</span>
              <span className="text-[#98A29B]">→</span>
              <span className="rounded-full bg-[#EDFBEF] px-2.5 py-1 text-[#0B5C2A]">confirmed_split</span>
              <span className="text-[#98A29B]">/</span>
              <span className="rounded-full bg-[#FFEBEE] px-2.5 py-1 text-[#B3261E]">canceled</span>
            </div>
            <p className="mt-2 text-[11.5px] leading-[1.6] text-[#6B746D]">
              단측 급감이 감지되면 pending 앞에서 held_anomaly로 잠깁니다. 취소는 만료 전에만, 확정은 만료 후에만 서버가
              허용합니다.
            </p>
          </section>

          <details className="rounded-[18px] border border-[#E6E9E7] bg-white px-4 py-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-[#3B4740]">
              계산식 · 데이터 출처
            </summary>
            <div className="mt-2 space-y-1.5 text-[12px] leading-[1.7] text-[#6B746D]">
              <p>
                기본 소진/일 = Σ(최근 14일 운전값 × 0.9^경과일) ÷ Σ(0.9^경과일) × 단위 소모량
              </p>
              <p>교차 계수 = 1 + w × clamp(최근 3일 평균 ÷ 직전 주 같은 요일 3일 평균 − 1, −0.4, +0.4)</p>
              <p>잔여일 = 현재고 ÷ (기본 소진/일 × 교차 계수)</p>
              <p>발주 수량 = ceil((리드타임 + 안전재고일 + 7일) × 일 소진 − 현재고) ÷ 발주 단위, 상한 적용</p>
              <p>
                데이터:{" "}
                {state.dataSource === "supabase"
                  ? "Supabase pos_daily_sales"
                  : state.dataSource === "memory"
                    ? "방금 입력한 마감(인메모리)"
                    : "데모 실측 폴백"}
              </p>
            </div>
          </details>

          <p className="px-1 text-[11.5px] leading-[1.7] text-[#98A29B]">
            이 화면은 출원 전 공개 금지선에 따라 검색 비노출(noindex)로 두었습니다. 발주 금액 합계{" "}
            {won(state.totals.totalAmount)} · 대상 {state.totals.count}건.
          </p>
        </>
      ) : null}
    </div>
  );
}
