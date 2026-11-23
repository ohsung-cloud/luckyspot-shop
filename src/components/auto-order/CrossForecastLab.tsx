"use client";

import { useMemo, useState } from "react";

import { generateDemoSeries, type DemoScenario } from "@/features/auto-order/demo-pos";
import { forecastStore } from "@/features/auto-order/forecast";
import type { SkuForecast } from "@/features/auto-order/types";

/**
 * 교차예측 시뮬레이터 — 특허 1호 시연용.
 *
 * 슬라이더 두 개(하루 음료·출력)와 시나리오 두 개(프린트 급증·카페 급감)만으로
 * "이종 수요가 원두·토너·용지 소진을 어떻게 동시에 바꾸는지"를 즉시 보여준다.
 * 계산은 화면에서 forecastStore()를 그대로 호출한다(서버·화면이 같은 엔진).
 */

const CORE = ["bean-10kg", "toner-black", "a4-paper"];

function shortDays(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 99) return "99일+";
  return `${value.toFixed(value < 10 ? 1 : 0)}일`;
}

function Slider({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-[11.5px] font-semibold text-[#3B4740]">
        {label}
        <span className="text-[13px] font-bold tabular-nums text-[#0F1412]">
          {value}
          {unit}
        </span>
      </span>
      <input
        className="mt-1 h-9 w-full accent-[#0F1412]"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={1}
        type="range"
        value={value}
      />
    </label>
  );
}

export default function CrossForecastLab() {
  const [drinks, setDrinks] = useState(88);
  const [sheets, setSheets] = useState(128);
  const [printSurge, setPrintSurge] = useState(35);
  const [cafeDrop, setCafeDrop] = useState(0);

  const scenario: DemoScenario = cafeDrop >= 50 ? "cafe_drop" : printSurge > 0 ? "print_surge" : "normal";

  const run = useMemo(() => {
    const rows = generateDemoSeries({
      storeCode: "STORE_LAB",
      cafeBase: drinks,
      printBase: sheets,
      scenario,
      printSurge: printSurge / 100,
      cafeDrop: Math.max(0.01, 1 - cafeDrop / 100),
      days: 21,
    });

    return forecastStore({ storeCode: "STORE_LAB", storeLabel: "시뮬레이션", rows, dataSource: "demo" });
  }, [drinks, sheets, scenario, printSurge, cafeDrop]);

  const core = CORE.map((sku) => run.forecasts.find((forecast) => forecast.sku === sku)).filter(
    (forecast): forecast is SkuForecast => Boolean(forecast),
  );

  return (
    <div className="grid gap-3">
      <div className="rounded-[12px] bg-[#F8F9F9] px-3 py-2.5">
        <Slider label="하루 음료" max={300} min={10} onChange={setDrinks} unit="잔" value={drinks} />
        <div className="mt-1.5">
          <Slider label="하루 출력" max={800} min={10} onChange={setSheets} unit="매" value={sheets} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Slider label="프린트 최근 3일" max={100} min={0} onChange={setPrintSurge} unit="%↑" value={printSurge} />
        <Slider label="카페 최근 3일" max={90} min={0} onChange={setCafeDrop} unit="%↓" value={cafeDrop} />
      </div>

      {run.hold ? (
        <p className="rounded-[10px] bg-[#FFF9EA] px-3 py-2 text-[11.5px] leading-[1.5] text-[#8A5A00]">
          {run.anomalies[0]?.title} — 한쪽만 급감하면 소모가 아니라 장비·결제 이상일 수 있어 발주를 멈춥니다.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[12px] border border-[#E6E9E7]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-[#FAFBFB] text-[10.5px] text-[#6B746D]">
              <th className="px-2 py-1.5 font-semibold">3종</th>
              <th className="px-1 py-1.5 text-right font-semibold">기본/일</th>
              <th className="px-1 py-1.5 text-right font-semibold">교차</th>
              <th className="px-1 py-1.5 text-right font-semibold">보정/일</th>
              <th className="px-2 py-1.5 text-right font-semibold">잔여</th>
            </tr>
          </thead>
          <tbody>
            {core.map((forecast) => (
              <tr key={forecast.sku} className="border-t border-[#F4F5F6] text-[11.5px]">
                <td className="px-2 py-1.5 font-semibold text-[#0F1412]">{forecast.name}</td>
                <td className="px-1 py-1.5 text-right tabular-nums text-[#3B4740]">
                  {forecast.baseDailyConsumption.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}
                </td>
                <td
                  className={`px-1 py-1.5 text-right font-semibold tabular-nums ${
                    forecast.crossFactor > 1.005
                      ? "text-[#007A36]"
                      : forecast.crossFactor < 0.995
                        ? "text-[#B3261E]"
                        : "text-[#98A29B]"
                  }`}
                >
                  ×{forecast.crossFactor.toFixed(2)}
                </td>
                <td className="px-1 py-1.5 text-right font-bold tabular-nums text-[#0F1412]">
                  {forecast.predictedDailyConsumption.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-[#0F1412]">{shortDays(forecast.remainingDays)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-[10px] font-semibold text-[#3B4740]">
        {["수집", "교차예측", "임계", "사업자 분리", "알림톡"].map((step, index) => (
          <span key={step} className="flex items-center gap-1">
            <span className={`rounded-full px-2 py-1 ${index === 1 ? "bg-[#0F1412] text-[#1DFF26]" : "bg-[#F4F5F6]"}`}>
              {step}
            </span>
            {index < 4 ? <span className="text-[#B0B7B2]">›</span> : null}
          </span>
        ))}
      </div>

      <p className="text-[10px] leading-[1.6] text-[#98A29B]">
        시뮬레이션은 장부에 쓰지 않습니다. 프린트 {printSurge}%↑ · 카페 {cafeDrop}%↓ 조건에서 원두·토너·용지 소진이 각각
        교차 보정됩니다(±40% 상한).
      </p>
    </div>
  );
}
