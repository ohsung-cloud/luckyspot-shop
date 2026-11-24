"use client";

import { useState } from "react";

import { RevenueMixDonut } from "./RevenueMixDonut";
import { formatWon, type MonthlySummary } from "./monthly";
import { COFFEE_CONTRIBUTION_PCT, PRINT_CONTRIBUTION_PCT, type MonthlyCompareRow } from "./profit";
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
 *
 * 토스식: 탭은 회색 트랙 위 흰 손잡이, 막대는 옅은 회색 + 가장 높은 날만 잉크.
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
    tab === "daily"
      ? pulse.hourlyDate?.slice(5).replace("-", "/") ?? "수집 전"
      : tab === "weekly"
        ? "최근 7일"
        : month?.monthLabel ?? "—";

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <div aria-label="매출 흐름" className="flex gap-0.5 rounded-[12px] bg-[#EFF1F2] p-0.5" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.key}
              aria-selected={tab === item.key}
              className={`h-8 rounded-[10px] px-3 text-[12px] font-bold transition-colors ${
                tab === item.key
                  ? "bg-white text-[#0F1412] shadow-[0_1px_3px_rgba(15,20,18,0.10)]"
                  : "text-[#8B948D]"
              }`}
              onClick={() => setTab(item.key)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="ml-auto truncate pl-1 text-[10.5px] font-semibold text-[#A7AFA9]">{hint}</span>
      </div>

      <div className="mt-3 min-h-[150px]">
        {tab === "daily" ? <DailyPanel pulse={pulse} /> : null}
        {tab === "weekly" ? <WeeklyPanel pulse={pulse} /> : null}
        {tab === "monthly" ? <MonthlyPanel comparison={comparison} month={month} /> : null}
      </div>
    </div>
  );
}

const BAR_MAX_PX = 76;

function WeeklyPanel({ pulse }: { pulse: StorePulse }) {
  if (pulse.dailySource === "none") {
    return (
      <div className="flex h-[146px] flex-col items-start justify-center gap-1">
        <p className="text-[12px] font-bold text-[#3B4740]">최근 7일 매출</p>
        <p className="text-[11px] leading-[1.6] text-[#8B948D]">{pulse.dailyNote}</p>
      </div>
    );
  }

  const max = Math.max(...pulse.daily.map((day) => day.total), 1);
  const average = pulse.dailyAverage;
  // 평균선은 막대와 같은 좌표계(px)로 그린다 — 눈금과 어긋나지 않게.
  const averagePx = Math.max(2, Math.min(BAR_MAX_PX, (average / max) * BAR_MAX_PX));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-bold text-[#3B4740]">최근 7일 매출</p>
        <p className="text-[10.5px] font-medium text-[#8B948D]">
          <span aria-hidden className="mr-1 inline-block h-0 w-2 border-t border-dashed border-[#1D9F4C] align-middle" />
          하루 평균 <span className="font-bold tabular-nums text-[#0B5C2A]">{shortWon(average)}원</span>
        </p>
      </div>

      <div className="relative mt-2 h-[92px]">
        <div aria-hidden className="absolute inset-x-0 border-t border-dashed border-[#1D9F4C]" style={{ bottom: averagePx }} />

        <div className="flex h-full items-end gap-1.5">
          {pulse.daily.map((day) => {
            const height = Math.max(6, Math.round((day.total / max) * BAR_MAX_PX));
            const peak = day.total === max && pulse.dailySource === "measured";

            return (
              <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <span className={`text-[8.5px] font-bold tabular-nums ${peak ? "text-[#0F1412]" : "text-[#A7AFA9]"}`}>
                  {shortWon(day.total)}
                </span>
                <div
                  className={`w-full rounded-[4px] ${peak ? "bg-[#0F1412]" : "bg-[#E1E7E3]"}`}
                  style={{ height }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 flex gap-1.5">
        {pulse.daily.map((day) => (
          <span key={day.date} className="min-w-0 flex-1 truncate text-center text-[8.5px] font-medium text-[#A7AFA9]">
            {day.label}
          </span>
        ))}
      </div>

      <p className="mt-1.5 truncate text-[9.5px] leading-[1.5] text-[#A7AFA9]">{pulse.dailyNote}</p>
    </div>
  );
}

function DailyPanel({ pulse }: { pulse: StorePulse }) {
  if (!pulse.hourly || pulse.hourly.length === 0) {
    return (
      <div className="flex h-[146px] flex-col items-start justify-center gap-1">
        <p className="text-[12px] font-bold text-[#3B4740]">시간대 매출</p>
        <p className="text-[11px] leading-[1.6] text-[#8B948D]">{pulse.hourlyNote}</p>
      </div>
    );
  }

  const max = Math.max(...pulse.hourly.map((bucket) => bucket.amount), 1);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-bold text-[#3B4740]">시간대 매출</p>
        <p className="text-[10.5px] font-medium text-[#8B948D]">
          {pulse.hourlyDate?.slice(5).replace("-", "/")} 합계{" "}
          <span className="font-bold tabular-nums text-[#0F1412]">{formatWon(pulse.hourlyTotal)}</span>
        </p>
      </div>

      <div className="mt-2 flex h-[92px] items-end gap-2">
        {pulse.hourly.map((bucket) => {
          const peak = bucket.amount === max;

          return (
            <div key={bucket.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className={`text-[8.5px] font-bold tabular-nums ${peak ? "text-[#0F1412]" : "text-[#A7AFA9]"}`}>
                {shortWon(bucket.amount)}
              </span>
              <div
                className={`w-full max-w-[28px] rounded-[4px] ${peak ? "bg-[#0F1412]" : "bg-[#E1E7E3]"}`}
                style={{ height: Math.max(6, Math.round((bucket.amount / max) * BAR_MAX_PX)) }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-2">
        {pulse.hourly.map((bucket) => (
          <div key={bucket.key} className="min-w-0 flex-1 text-center">
            <p className="truncate text-[8.5px] font-bold text-[#3B4740]">{bucket.label}</p>
            <p className="text-[8px] tabular-nums text-[#A7AFA9]">{bucket.share.toFixed(0)}%</p>
          </div>
        ))}
      </div>

      <p className="mt-1.5 truncate text-[9.5px] leading-[1.5] text-[#A7AFA9]">{pulse.hourlyNote}</p>
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
      {comparison && comparison.length > 0 ? <MonthlyCompareRows rows={comparison} /> : null}
      <RevenueMixDonut compact month={month} />
    </div>
  );
}

/** 월별 비교 — [월간] 탭 안에서만. 두 줄 × 핵심 숫자 하나로 끝낸다. */
function MonthlyCompareRows({ rows }: { rows: MonthlyCompareRow[] }) {
  return (
    <div className="divide-y divide-[#F1F3F2]">
      {rows.map((row) => (
        <div key={row.period} className="flex items-baseline justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-bold text-[#0F1412]">{row.label}</p>
            <p className="mt-0.5 truncate text-[10px] leading-[1.45] text-[#A7AFA9]">{row.note}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[14px] font-bold tabular-nums tracking-[0.02em] text-[#0B5C2A]">
              {compactWon(row.net)}
            </p>
            <p className="mt-0.5 text-[10px] font-medium tabular-nums text-[#A7AFA9]">
              매출 {compactWon(row.revenue)} · 마진 {row.marginRate === null ? "—" : `${Math.round(row.marginRate)}%`}
            </p>
          </div>
        </div>
      ))}
      <p className="pt-1.5 text-[9.5px] leading-[1.5] text-[#A7AFA9]">
        지점 하나 안에서만 비교해요 · 커피 공헌이익 {COFFEE_CONTRIBUTION_PCT}% · 프린트 {PRINT_CONTRIBUTION_PCT}% · 고정비 차감
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
