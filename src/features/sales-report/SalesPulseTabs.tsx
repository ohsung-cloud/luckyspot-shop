"use client";

import { useState } from "react";

import { RevenueMixDonut } from "./RevenueMixDonut";
import { formatWon, type MonthlySummary } from "./monthly";
import type { MonthlyCompareRow } from "./profit";
import { shortWon, type StorePulse } from "./trend";

/**
 * 매출 카드 안의 펄스 — [일간][주간][월간] 탭 하나로 세 그림을 돌려 쓴다.
 *
 *  - 일간: 하루 6구간(새벽·아침·점심·오후·저녁·밤) 매출 비중
 *  - 주간: 최근 7일 일별 막대 + **평균 점선**
 *  - 월간: 커피 vs 프린트 비중 도넛 + **월별(저번달 확정 / 이번달 진행 중) 매출·예상 순수익·마진 비교행**
 *
 * 카드 높이를 늘리지 않는 이유: 세 그림을 세로로 쌓으면 1,200px짜리 리포트가 1,600px가 된다.
 * 점주가 익숙한 그림은 그대로 두되, 한 번에 하나만 보여 준다(탭).
 */

type Tab = "daily" | "weekly" | "monthly";

const TABS: { key: Tab; label: string }[] = [
  { key: "daily", label: "일간" },
  { key: "weekly", label: "주간" },
  { key: "monthly", label: "월간" },
];

export function SalesPulseTabs({
  pulse,
  month,
  comparison,
  initialTab = "weekly",
}: {
  pulse: StorePulse;
  month: MonthlySummary | null;
  /** [월간] 탭에서만 쓰는 월별 비교행(이번달·저번달). */
  comparison?: MonthlyCompareRow[];
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const hint =
    tab === "daily" ? pulse.hourlyDate?.slice(5).replace("-", "/") ?? "수집 전" : tab === "weekly" ? "최근 7일" : month?.monthLabel ?? "—";

  return (
    <div className="mt-2.5 rounded-[14px] bg-white p-2.5 text-[#0F1412]">
      <div className="flex items-center gap-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            aria-selected={tab === item.key}
            className={`h-7 rounded-full px-2.5 text-[10.5px] font-bold transition-colors ${
              tab === item.key ? "bg-[#0F1412] text-[#1DFF26]" : "bg-[#F4F5F6] text-[#6B746D]"
            }`}
            onClick={() => setTab(item.key)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto truncate pl-1 text-[9px] font-semibold text-[#98A29B]">{hint}</span>
      </div>

      <div className="mt-2 min-h-[152px]">
        {tab === "daily" ? <DailyPanel pulse={pulse} /> : null}
        {tab === "weekly" ? <WeeklyPanel pulse={pulse} /> : null}
        {tab === "monthly" ? <MonthlyPanel comparison={comparison} month={month} /> : null}
      </div>
    </div>
  );
}

const BAR_MAX_PX = 72;

function WeeklyPanel({ pulse }: { pulse: StorePulse }) {
  const max = Math.max(...pulse.daily.map((day) => day.total), 1);
  const average = pulse.dailyAverage;
  // 평균선은 막대와 같은 좌표계(px)로 그린다 — 눈금과 어긋나지 않게.
  const averagePx = Math.max(2, Math.min(BAR_MAX_PX, (average / max) * BAR_MAX_PX));

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[10.5px] font-bold text-[#3B4740]">최근 7일 일별 매출</p>
        <p className="text-[9.5px] text-[#6B746D]">
          <span aria-hidden className="mr-1 inline-block h-0 w-2 border-t border-dashed border-[#1D9F4C] align-middle" />
          평균 <span className="font-bold tabular-nums text-[#0B5C2A]">{shortWon(average)}원</span>
        </p>
      </div>

      <div className="relative mt-1 h-[86px]">
        <div
          aria-hidden
          className="absolute inset-x-0 border-t border-dashed border-[#1D9F4C]"
          style={{ bottom: averagePx }}
        />

        <div className="flex h-full items-end gap-1">
          {pulse.daily.map((day) => {
            const height = Math.max(6, Math.round((day.total / max) * BAR_MAX_PX));
            const peak = day.total === max;

            return (
              <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
                <span className="text-[8px] font-bold tabular-nums text-[#6B746D]">{shortWon(day.total)}</span>
                <div
                  className={`w-full rounded-t-[3px] ${peak ? "bg-[#1D9F4C]" : "bg-[#2C3B34]"}`}
                  style={{ height }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1 flex gap-1">
        {pulse.daily.map((day) => (
          <span key={day.date} className="min-w-0 flex-1 truncate text-center text-[7.5px] text-[#98A29B]">
            {day.label}
          </span>
        ))}
      </div>

      <p className="mt-1 truncate text-[8.5px] leading-[1.5] text-[#98A29B]">{pulse.dailyNote}</p>
    </div>
  );
}

function DailyPanel({ pulse }: { pulse: StorePulse }) {
  if (!pulse.hourly || pulse.hourly.length === 0) {
    return (
      <div className="flex h-[148px] flex-col items-start justify-center gap-1">
        <p className="text-[10.5px] font-bold text-[#3B4740]">시간대 매출</p>
        <p className="text-[10px] leading-[1.6] text-[#6B746D]">{pulse.hourlyNote}</p>
      </div>
    );
  }

  const max = Math.max(...pulse.hourly.map((bucket) => bucket.amount), 1);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[10.5px] font-bold text-[#3B4740]">시간대 매출</p>
        <p className="text-[9.5px] text-[#6B746D]">
          {pulse.hourlyDate?.slice(5).replace("-", "/")} 합계{" "}
          <span className="font-bold tabular-nums text-[#0F1412]">{formatWon(pulse.hourlyTotal)}</span>
        </p>
      </div>

      <div className="mt-1.5 flex h-[86px] items-end gap-1.5">
        {pulse.hourly.map((bucket) => (
          <div key={bucket.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
            <span className="text-[8px] font-bold tabular-nums text-[#6B746D]">{shortWon(bucket.amount)}</span>
            <div
              className="w-full max-w-[26px] rounded-t-[3px] bg-[#1D9F4C]"
              style={{ height: Math.max(6, Math.round((bucket.amount / max) * BAR_MAX_PX)) }}
            />
          </div>
        ))}
      </div>

      <div className="mt-1 flex gap-1.5">
        {pulse.hourly.map((bucket) => (
          <div key={bucket.key} className="min-w-0 flex-1 text-center">
            <p className="truncate text-[8px] font-bold text-[#3B4740]">{bucket.label}</p>
            <p className="text-[7.5px] tabular-nums text-[#98A29B]">{bucket.share.toFixed(0)}%</p>
          </div>
        ))}
      </div>

      <p className="mt-1 truncate text-[8.5px] leading-[1.5] text-[#98A29B]">{pulse.hourlyNote}</p>
    </div>
  );
}

function MonthlyPanel({
  month,
  comparison,
}: {
  month: MonthlySummary | null;
  comparison?: MonthlyCompareRow[];
}) {
  return (
    <div>
      {comparison && comparison.length > 0 ? <MonthlyCompareTable rows={comparison} /> : null}
      <RevenueMixDonut compact month={month} />
    </div>
  );
}

/** 월별 비교행 — [월간] 탭 안에서만. 두 줄 × 세 숫자로 끝낸다. */
function MonthlyCompareTable({ rows }: { rows: MonthlyCompareRow[] }) {
  return (
    <div className="mt-1.5 overflow-hidden rounded-[10px] border border-[#E6E9E7]">      <div className="grid grid-cols-[1.35fr_auto_auto_auto] items-center gap-x-1.5 bg-[#F8F9F9] px-2 py-1 text-[8.5px] font-bold text-[#6B746D]">
        <span>월별 비교</span>
        <span className="w-[54px] text-right">매출</span>
        <span className="w-[54px] text-right">예상 순수익</span>
        <span className="w-[34px] text-right">마진</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.period}
          className="grid grid-cols-[1.35fr_auto_auto_auto] items-center gap-x-1.5 border-t border-[#F1F2F2] px-2 py-1.5"
        >
          <span className="min-w-0">
            <span className="block truncate text-[10px] font-bold text-[#0F1412]">{row.label}</span>
            <span className="block truncate text-[8px] text-[#98A29B]">{row.note}</span>
          </span>
          <span className="w-[54px] text-right text-[9.5px] tabular-nums text-[#3B4740]">
            {compactWon(row.revenue)}
          </span>
          <span className="w-[54px] text-right text-[9.5px] font-bold tabular-nums text-[#0F1412]">
            {compactWon(row.net)}
          </span>
          <span className="w-[34px] text-right text-[9.5px] font-bold tabular-nums text-[#007A36]">
            {row.marginRate === null ? "—" : `${Math.round(row.marginRate)}%`}
          </span>
        </div>
      ))}
      <p className="border-t border-[#F1F2F2] bg-white px-2 py-1 text-[8px] leading-[1.5] text-[#98A29B]">
        지점 하나 안에서만 비교 · 커피 원가 15.8% · 프린트 변동비 28% · 고정비 차감
      </p>
    </div>
  );
}

/** "2,221천" / "−120천" — 좌우 폭이 흔들리지 않게 짧게. */
function compactWon(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1_000).toLocaleString("ko-KR")}천`;
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}`;
}
