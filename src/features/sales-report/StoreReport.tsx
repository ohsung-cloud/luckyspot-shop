import type { StoreFixedCost } from "@/features/stores/registry-types";

import { capturedLabel, days, manwon, pct, won } from "./format";
import { monthlyForStore, formatWon, type MonthlyPeriod } from "./monthly";
import { ProfitRow } from "./ProfitRow";
import { computeBepAndOrderMode, estimateProfit, monthlyComparison, type ProfitEstimate } from "./profit";
import { RevenueMixMini } from "./RevenueMixDonut";
import { SalesPulseTabs } from "./SalesPulseTabs";
import { storePulse, type StorePulse } from "./trend";
import type { SalesReportSnapshot } from "./types";
import { autoOrderHref, type StoreEntry } from "./stores";

/**
 * 지점 하나의 매출 리포트 — 모바일 2~2.5화면 안에 끝나는 3단 구성.
 *
 *  ① 매출: 이번달/저번달 총매출 + 커피·프린트 비중 도넛 (최상위 위계)
 *  ② 원두·토너·용지 3종 + 원터치 발주
 *  ③ 접이식 2개: 교차예측·특허 근거 / 시스템 상태·알림 (기본 접힘)
 *
 * 지점별 완전 분리 원칙: 이 컴포넌트는 한 지점 스냅샷만 받고, 더하기 계산이 없다.
 */

const CORE_PATTERN = /원두|토너|A4|용지/i;

function toneDays(value: number | null) {
  if (value === null) return "border-[#E6E9E7] bg-white text-[#98A29B]";
  if (value <= 2) return "border-[#F3D2D2] bg-[#FFF7F7] text-[#B3261E]";
  if (value <= 4) return "border-[#F0E1B8] bg-[#FFFBF0] text-[#8A5A00]";
  return "border-[#D6EBDD] bg-white text-[#0F1412]";
}

function tonePct(value: number, red: number, amber: number) {
  if (value <= red) return "border-[#F3D2D2] bg-[#FFF7F7] text-[#B3261E]";
  if (value <= amber) return "border-[#F0E1B8] bg-[#FFFBF0] text-[#8A5A00]";
  return "border-[#D6EBDD] bg-white text-[#0F1412]";
}

export function StoreReport({
  store,
  period,
  profit,
  pulse,
  fixedCost,
}: {
  store: StoreEntry;
  period: MonthlyPeriod;
  profit?: ProfitEstimate | null;
  pulse?: StorePulse;
  fixedCost?: StoreFixedCost | null;
}) {
  const data: SalesReportSnapshot = store.snapshot;
  const month = monthlyForStore(store.code, period);
  const chart = pulse ?? storePulse({ code: store.code, asOf: data.today, dailyRate: data.revenue.coffee.dailyRate });
  const burst = data.burst;

  // [월간] 탭 전용 — 저번달(확정)·이번달(진행 중) 두 줄 비교. 지점 하나 안에서만.
  const comparison = monthlyComparison({
    previous: estimateProfit({ month: monthlyForStore(store.code, "2026-10"), fixedCost }),
    current: estimateProfit({ month: monthlyForStore(store.code, "2026-11"), fixedCost }),
  });

  const coffeeAmount = month?.coffee.amount ?? null;
  const printAmount = month?.print.amount ?? null;
  const mixKnown = (coffeeAmount ?? 0) + (printAmount ?? 0);
  const bothKnown = coffeeAmount !== null && printAmount !== null && mixKnown > 0;
  const coffeePct = bothKnown ? Math.round((coffeeAmount / mixKnown) * 100) : null;
  const printPct = bothKnown ? Math.round((printAmount / mixKnown) * 100) : null;

  const tonerMin = Math.min(data.print.toner.k, data.print.toner.c, data.print.toner.m, data.print.toner.y);
  const trayAvg = data.print.trayAvgPct;

  const coreOrders = data.orders.proposals.filter(
    (proposal) => CORE_PATTERN.test(proposal.material) && proposal.amount !== null,
  );
  const coreAmount = coreOrders.reduce((sum, proposal) => sum + (proposal.amount ?? 0), 0);
  const coreLabels = coreOrders.map((proposal) => proposal.material).join(" · ");

  // BEP·발주 모드 — 접힘 패널 안에서만 보인다(첫 화면에는 올리지 않는다).
  // 기준일은 위 순수익(estimateProfit)과 같은 '오늘'로 맞춘다 — 같은 카드 안에서 숫자가 엇갈리지 않게.
  const bep = computeBepAndOrderMode({ month, fixedCost, orderAmount: coreAmount });

  const problemStock = data.stock
    .filter((item) => item.status !== "ok")
    .sort((a, b) => (a.daysLeft ?? 9e9) - (b.daysLeft ?? 9e9));
  const emptyStock = data.stock.filter((item) => item.status === "empty");

  return (
    <div className="grid gap-2.5">
      <p className="px-1 text-[11px] text-[#6B746D]">
        {store.label} · 재고 {capturedLabel(data.capturedAt)} 수집 · {store.tagline}
        <span className="mt-0.5 block text-[10px] text-[#98A29B]">매일 08~22시 1시간마다 · 00:05 마감 업데이트</span>
      </p>

      {/* ① 매출 — 최상위 위계 */}
      <section className="rounded-[22px] bg-[#0F1412] p-4 text-white">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-[#1DFF26] px-2.5 py-1 text-[11px] font-bold text-[#0F1412]">
            {month ? `${month.monthLabel} 매출` : "매출"}
          </span>
          <span className="text-[10.5px] text-[#9AA39C]">
            {month ? `${month.coffee.range} · ${month.partial ? "확인된 항목만" : "확정"}` : "수집 전"}
          </span>
        </div>

        <div className="mt-2.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[34px] font-bold leading-none tabular-nums tracking-[-0.03em]">
              {month ? formatWon(month.total) : "—"}
            </p>
            <p className="mt-1.5 flex flex-wrap gap-1.5 text-[10.5px] text-[#C8D0CA]">
              <span className="rounded-full bg-white/10 px-2 py-0.5">
                <span aria-hidden className="mr-1 inline-block size-1.5 rounded-full bg-white align-middle" />
                커피 {coffeePct !== null ? `${coffeePct}% · ` : ""}{month ? formatWon(month.coffee.amount) : "—"}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5">
                <span aria-hidden className="mr-1 inline-block size-1.5 rounded-full bg-[#1DFF26] align-middle" />
                프린트{" "}
                {printAmount !== null
                  ? `${printPct !== null ? `${printPct}% · ` : ""}${formatWon(printAmount)}`
                  : "26일 정산 전"}
              </span>
            </p>
          </div>
          <RevenueMixMini month={month} size={62} />
        </div>

        <ProfitRow fixedCost={fixedCost} profit={profit ?? null} />

        <SalesPulseTabs comparison={comparison} month={month} pulse={chart} />
      </section>

      {/* ② 원두 · 토너 · 용지 + 원터치 발주 */}
      <section className="rounded-[20px] border-2 border-[#0F1412] bg-white p-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold text-[#0F1412]">지금 채울 3가지</h2>
          <span className="text-[10px] text-[#6B746D]">
            {burst.activeWindow ? `${burst.activeWindow.title} 반영` : "평시"}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <div className={`rounded-[14px] border p-2.5 ${toneDays(data.bean.daysLeftWithBurst)}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#3B4740]">원두</span>
              {data.bean.daysLeftWithBurst !== null && data.bean.daysLeftWithBurst <= 4 ? (
                <span className="rounded-full bg-[#0F1412] px-1.5 py-0.5 text-[9px] font-bold text-[#1DFF26]">발주</span>
              ) : null}
            </div>
            <p className="mt-1.5 text-[18px] font-bold leading-none tabular-nums">
              {data.bean.daysLeftWithBurst !== null ? `${data.bean.daysLeftWithBurst.toFixed(1)}일` : "—"}
            </p>
            <p className="mt-1 truncate text-[9.5px] text-[#6B746D]">
              {Math.round(data.bean.stockGrams ?? 0).toLocaleString("ko-KR")}g
            </p>
          </div>

          <div className={`rounded-[14px] border p-2.5 ${tonePct(tonerMin, 10, 30)}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#3B4740]">토너</span>
              {tonerMin <= 30 ? (
                <span className="rounded-full bg-[#0F1412] px-1.5 py-0.5 text-[9px] font-bold text-[#1DFF26]">발주</span>
              ) : null}
            </div>
            <p className="mt-1.5 text-[18px] font-bold leading-none tabular-nums">{tonerMin}%</p>
            <p className="mt-1 truncate text-[9.5px] text-[#6B746D]">
              K {data.print.toner.k}% · C/M/Y {Math.min(data.print.toner.c, data.print.toner.m, data.print.toner.y)}%
            </p>
          </div>

          <div className={`rounded-[14px] border p-2.5 ${tonePct(trayAvg, 15, 40)}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#3B4740]">용지</span>
              {trayAvg <= 40 ? (
                <span className="rounded-full bg-[#0F1412] px-1.5 py-0.5 text-[9px] font-bold text-[#1DFF26]">발주</span>
              ) : null}
            </div>
            <p className="mt-1.5 text-[18px] font-bold leading-none tabular-nums">{trayAvg}%</p>
            <p className="mt-1 truncate text-[9.5px] text-[#6B746D]">
              Tray {data.print.paper.tray1}% · {data.print.paper.tray2}%
            </p>
          </div>
        </div>

        <a
          className={`mt-2.5 flex h-[54px] w-full items-center justify-center rounded-[14px] text-[15.5px] font-bold ${
            coreOrders.length > 0 ? "bg-[#1DFF26] text-[#0F1412]" : "bg-[#F4F5F6] text-[#6B746D]"
          }`}
          href={autoOrderHref(store)}
        >
          {coreOrders.length > 0 ? `3종 발주 · ${won(coreAmount)}` : "3종 모두 충분 · 발주 화면"}
        </a>
        <p className="mt-1 text-center text-[10px] text-[#6B746D]">
          {coreLabels || "잔여일이 기준 안으로 오면 자동 제안"} · 승인 후 5분 취소 가능
        </p>
      </section>

      {/* ③ 접이식 2개 — 기본 접힘 */}
      <details className="rounded-[14px] border border-[#E6E9E7] bg-white px-3.5 py-3">
        <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-bold text-[#3B4740]">
          교차예측 · 특허 근거 보기
          <span className="text-[10px] font-semibold text-[#98A29B]">3종 → 사업자 분리</span>
        </summary>

        <div className="mt-2 flex flex-wrap items-center gap-1 text-[9.5px] font-semibold text-[#3B4740]">
          {["수집", "교차예측", "임계", "사업자 분리", "알림톡"].map((step, index) => (
            <span key={step} className="flex items-center gap-1">
              <span className={`rounded-full px-1.5 py-0.5 ${index === 1 ? "bg-[#0F1412] text-[#1DFF26]" : "bg-[#F4F5F6]"}`}>
                {step}
              </span>
              {index < 4 ? <span className="text-[#B0B7B2]">›</span> : null}
            </span>
          ))}
        </div>

        {/* 손익분기(BEP) · 발주 모드 — 특허 1호 종속항. 접힘 패널 안에서만 보인다. */}
        {bep ? (
          <div className="mt-2 rounded-[10px] bg-[#0F1412] px-2.5 py-2 text-white">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold text-[#C8D0CA]">손익분기(BEP) · 발주 모드</p>
              <span className="shrink-0 rounded-full bg-[#1DFF26] px-1.5 py-0.5 text-[8.5px] font-bold text-[#0F1412]">
                {bep.modeLabel}
              </span>
            </div>

            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full ${bep.reached ? "bg-[#1DFF26]" : "bg-[#EFC94C]"}`}
                style={{ width: `${Math.min(100, Math.max(0, bep.progressPct))}%` }}
              />
            </div>

            <div className="mt-1 flex items-baseline justify-between gap-2 text-[9.5px]">
              <span className="text-[#C8D0CA]">
                BEP 달성률{" "}
                <span className="font-bold tabular-nums text-white">{Math.round(bep.progressPct)}%</span>
              </span>
              <span className={`shrink-0 font-bold ${bep.reached ? "text-[#1DFF26]" : "text-[#EFC94C]"}`}>
                {bep.bepLabel}
              </span>
            </div>

            <p className="mt-1 text-[8.5px] leading-[1.5] text-[#8A948C]">
              일할 고정비 {won(bep.dailyFixedCost)} · 하루 공헌이익 {won(bep.dailyContribution)} · BEP 일매출{" "}
              {won(bep.bepDailyRevenue)}
            </p>
            <p className="text-[8.5px] leading-[1.5] text-[#8A948C]">
              여유 현금 {won(bep.freeCashFlow)} (월말 예상 순수익 − 3종 발주 {won(bep.orderAmount)})
            </p>
            <p className="mt-1 text-[8.5px] leading-[1.5] text-[#9AA39C]">{bep.reason}</p>
          </div>
        ) : null}

        <ul className="mt-2 space-y-1 text-[10.5px] leading-[1.6] text-[#6B746D]">
          <li>
            학사 버스트 {burst.activeWindow ? `${burst.activeWindow.title} (~${burst.activeWindow.end.slice(5).replace("-", "/")})` : "없음"}
            {" → "}프린트 ×{burst.printWeight} · 커피 ×{burst.coffeeWeight}
          </li>
          <li>
            원두 {data.bean.coffeeDrinks}잔 → {data.bean.dailyGrams}g (버스트 {data.bean.dailyGramsWithBurst}g) · 프린트{" "}
            {data.print.cumulativePrintCount.toLocaleString("ko-KR")}매
          </li>
          <li>계산: 기본 = 14일 지수가중(0.9) · 교차 = 1 + w×clamp(최근3일/직전주, ±40%) · 잔여일 = 현재고 ÷ 보정소진</li>
        </ul>

        <div className="mt-2 grid gap-1.5">
          {(["franchisee_cafe", "hq_print"] as const).map((owner) => {
            const proposals = data.orders.proposals.filter((proposal) => proposal.owner === owner);
            const summary = data.orders.byOwner[owner];

            return (
              <div key={owner} className="rounded-[10px] bg-[#F8F9F9] px-2.5 py-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-[#3B4740]">{owner === "franchisee_cafe" ? "점주 사업자(카페)" : "본사 사업자(프린트)"}</span>
                  <span className="font-bold tabular-nums text-[#0F1412]">
                    {won(summary.amount)}
                    {summary.unknownAmount > 0 ? ` + 견적 ${summary.unknownAmount}` : ""}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-[#6B746D]">
                  {proposals.map((proposal) => `${proposal.material}${proposal.amount === null ? "(견적)" : ` ${won(proposal.amount)}`}`).join(" · ") || "없음"}
                </p>
              </div>
            );
          })}
        </div>
      </details>

      <details className="rounded-[14px] border border-[#E6E9E7] bg-white px-3.5 py-3">
        <summary className="flex cursor-pointer items-center justify-between text-[12.5px] font-bold text-[#3B4740]">
          시스템 상태 · 알림 보기
          <span className="rounded-full bg-[#FFF6E0] px-2 py-0.5 text-[9.5px] font-bold text-[#8A5A00]">
            바닥 {emptyStock.length} · 주의 {problemStock.length - emptyStock.length}
          </span>
        </summary>

        <ul className="mt-2 divide-y divide-[#F4F5F6]">
          {problemStock.map((item) => (
            <li key={`${item.material}-${item.slot}`} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#3B4740]">{item.material}</span>
              <span className="shrink-0 text-[9.5px] font-bold text-[#8A5A00]">{item.status === "empty" ? "바닥" : "주의"}</span>
              <span className="w-[54px] shrink-0 text-right text-[10.5px] tabular-nums text-[#6B746D]">
                {item.status === "empty" ? "0%" : item.daysLeft !== null ? days(item.daysLeft) : `${Math.round(item.pct)}%`}
              </span>
            </li>
          ))}
          {problemStock.length === 0 ? <li className="py-1.5 text-[11px] text-[#6B746D]">바닥·주의 품목이 없습니다.</li> : null}
        </ul>

        <p className="mt-2 text-[10px] leading-[1.6] text-[#6B746D]">
          토너 K {data.print.toner.k}% · C {data.print.toner.c}% · M {data.print.toner.m}% · Y {data.print.toner.y}% · 용지 Tray {data.print.paper.tray1}%/{data.print.paper.tray2}%
        </p>
        <p className="text-[10px] leading-[1.6] text-[#6B746D]">
          프린트 {data.revenue.print.month} 실매출 {won(data.revenue.print.total)} (전월 {pct(data.revenue.print.trendPct)})
          {data.revenue.print.currentMonthPending ? " · 이번 달 26일 정산 전" : ""} · 누적 커피 {manwon(data.revenue.coffee.cumulativeTotal)}원
        </p>
        {data.drift.findings.slice(0, 1).map((finding) => (
          <p key={`${finding.product}-${finding.material}`} className="mt-1 rounded-[8px] bg-[#FFF7F7] px-2 py-1.5 text-[10px] leading-[1.5] text-[#3B4740]">
            <span className="font-bold text-[#B3261E]">{finding.severity}</span> {finding.product} · {finding.detail}
          </p>
        ))}
        {data.risk.items.slice(0, 1).map((item) => (
          <p key={item.material} className="mt-1 rounded-[8px] bg-[#FFFBF0] px-2 py-1.5 text-[10px] leading-[1.5] text-[#3B4740]">
            {item.material} · {item.action}
          </p>
        ))}
      </details>

      <p className="px-1 pb-2 text-[9.5px] text-[#B0B7B2]">
        {capturedLabel(data.capturedAt)} · 스키마 {data.schemaVersion} · {store.label} 단독 · 내부용
      </p>
    </div>
  );
}
