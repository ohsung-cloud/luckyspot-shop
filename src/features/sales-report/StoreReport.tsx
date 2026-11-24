import { Card, CardBody, CardHead, Chip, Row, RowList, SUMMARY_ROW } from "@/components/internal/card-ui";

import type { StoreFixedCost } from "@/features/stores/registry-types";

import { capturedLabel, days, manwon, pct, won } from "./format";
import { monthlyForStore, formatWon, type MonthlyPeriod } from "./monthly";
import { ProfitRow } from "./ProfitRow";
import { computeBepAndOrderMode, estimateProfit, monthlyComparison, type ProfitEstimate } from "./profit";
import { RevenueMixMini } from "./RevenueMixDonut";
import { SalesPulseTabs } from "./SalesPulseTabs";
import { storePulse, type StorePulse } from "./trend";
import type { SalesReportSnapshot } from "./types";
import { autoOrderHref, type StoreEntryWithSnapshot } from "./stores";

/**
 * 지점 하나의 매출 리포트 — 토스 앱식 카드 4장.
 *
 *  ① 매출: 이번달/저번달 총매출 + 커피·프린트 비중 도넛 + 예상 순수익 (최상위 위계)
 *  ② 채울 것: 원두·토너·용지 3종 + 원터치 발주
 *  ③ 흐름: 일간·주간·월간 그래프 (카드 안 탭)
 *  ④ 접이식 2장: 발주가 나온 이유 / 확인이 필요한 것 (기본 접힘)
 *
 * 카드 방식: 흰 카드 24px 라운드 · 테두리 없이 여백으로 나눔 · 한 줄에 라벨/숫자 하나씩.
 * 지점별 완전 분리 원칙: 이 컴포넌트는 한 지점 스냅샷만 받고, 더하기 계산이 없다.
 */

const CORE_PATTERN = /원두|토너|A4|용지/i;

type Tone = "red" | "amber" | "ok" | "gray";

function toneDays(value: number | null): Tone {
  if (value === null) return "gray";
  if (value <= 2) return "red";
  if (value <= 4) return "amber";
  return "ok";
}

function tonePct(value: number, red: number, amber: number): Tone {
  if (value <= red) return "red";
  if (value <= amber) return "amber";
  return "ok";
}

const DOT: Record<Tone, string> = {
  red: "bg-[#B3261E]",
  amber: "bg-[#E0A800]",
  ok: "bg-[#1D9F4C]",
  gray: "bg-[#C9CFCB]",
};

export function StoreReport({
  store,
  period,
  profit,
  pulse,
  fixedCost,
}: {
  store: StoreEntryWithSnapshot;
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
  const previousProfit = estimateProfit({ month: monthlyForStore(store.code, "2026-10"), fixedCost });
  const comparison = monthlyComparison({
    previous: previousProfit,
    current: estimateProfit({ month: monthlyForStore(store.code, "2026-11"), fixedCost }),
  });

  const coffeeAmount = month?.coffee.amount ?? null;
  const printAmount = month?.print.amount ?? null;

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

  const pulseChip =
    chart.dailySource === "measured" ? { tone: "green" as const, label: "실측" } : chart.dailySource === "estimated" ? { tone: "amber" as const, label: "추정" } : { tone: "gray" as const, label: "수집 전" };

  return (
    <div className="grid gap-3">
      <p className="px-1 text-[11.5px] font-medium leading-[1.55] text-[#8B948D]">
        {store.label} · {capturedLabel(data.capturedAt)} 재고 기준 · {store.tagline}
        <span className="mt-1 block text-[10.5px] text-[#A7AFA9]">매일 08~22시 한 시간마다 새로 읽고, 00:05에 마감해요.</span>
      </p>

      {/* ① 매출 — 최상위 위계 */}
      <Card className="min-w-0 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#6B746D]">{month ? `${month.monthLabel} 매출` : "매출"}</p>
            <p className="mt-2 text-[34px] font-bold leading-none tabular-nums tracking-[-0.035em] text-[#0F1412]">
              {month ? formatWon(month.total) : "—"}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Chip tone={month && !month.partial ? "green" : "gray"}>
                {month ? (month.partial ? "확인된 항목만" : "확정") : "수집 전"}
              </Chip>
              <span className="text-[10.5px] font-medium text-[#A7AFA9]">
                {month ? `${month.coffee.range} 기준` : "수집되면 여기에 보여요"}
              </span>
            </div>
          </div>
          <RevenueMixMini month={month} size={68} />
        </div>

        <RowList className="mt-4 border-t border-[#F1F3F2]">
          <Row
            dot="bg-[#0F1412]"
            label="커피"
            sub={month ? `${month.coffee.range} · ${month.coffee.source}` : "수집 전"}
            value={formatWon(coffeeAmount)}
          />
          <Row
            dot={printAmount !== null ? "bg-[#1D9F4C]" : "bg-[#C9CFCB]"}
            label="프린트"
            sub={month ? `${month.print.range} · ${month.print.status === "pending" ? "매월 26일 정산" : month.print.source}` : "수집 전"}
            value={printAmount !== null ? formatWon(printAmount) : "26일 정산 전"}
            valueTone={printAmount !== null ? "ink" : "muted"}
          />
        </RowList>

        <div className="mt-4 rounded-[18px] bg-[#F7F8F9] px-4 py-3.5">
          <ProfitRow
            fixedCost={fixedCost}
            previousNet={previousProfit?.net ?? null}
            profit={profit ?? null}
          />
        </div>
      </Card>

      {/* ② 원두 · 토너 · 용지 + 원터치 발주 */}
      <Card>
        <CardHead sub="원두·토너·용지 잔량이에요" title="채울 때가 됐어요" />
        <CardBody className="pt-2">
          <RowList>
            <StockRow
              badge={data.bean.daysLeftWithBurst !== null && data.bean.daysLeftWithBurst <= 4 ? "발주" : undefined}
              label="원두"
              sub={`${Math.round(data.bean.stockGrams ?? 0).toLocaleString("ko-KR")}g · 하루 ${data.bean.dailyGramsWithBurst}g씩 줄어요`}
              tone={toneDays(data.bean.daysLeftWithBurst)}
              value={data.bean.daysLeftWithBurst !== null ? `${data.bean.daysLeftWithBurst.toFixed(1)}일` : "—"}
            />
            <StockRow
              badge={tonerMin <= 30 ? "발주" : undefined}
              label="토너"
              sub={`K ${data.print.toner.k}% · C/M/Y ${Math.min(data.print.toner.c, data.print.toner.m, data.print.toner.y)}%`}
              tone={tonePct(tonerMin, 10, 30)}
              value={`${tonerMin}%`}
            />
            <StockRow
              badge={trayAvg <= 40 ? "발주" : undefined}
              label="용지"
              sub={`Tray1 ${data.print.paper.tray1}% · Tray2 ${data.print.paper.tray2}%`}
              tone={tonePct(trayAvg, 15, 40)}
              value={`${trayAvg}%`}
            />
          </RowList>

          <a
            className={`mt-4 flex h-[56px] w-full items-center justify-center rounded-[16px] text-[16px] font-bold tracking-[-0.01em] ${
              coreOrders.length > 0 ? "bg-[#1DFF26] text-[#0F1412]" : "bg-[#F2F4F6] text-[#6B746D]"
            }`}
            href={autoOrderHref(store)}
          >
            {coreOrders.length > 0 ? `버튼 한 번으로 발주 · ${won(coreAmount)}` : "지금은 채울 게 없어요"}
          </a>
          <p className="mt-2 text-center text-[10.5px] font-medium leading-[1.5] text-[#A7AFA9]">
            {coreOrders.length > 0 ? "누르면 5분 동안 취소할 수 있어요" : "잔여일이 기준 안으로 오면 버튼이 켜져요"}
            {coreLabels ? ` · ${coreLabels}` : ""}
          </p>
        </CardBody>
      </Card>

      {/* ③ 흐름 */}
      <Card className="min-w-0">
        <CardHead
          right={<Chip tone={pulseChip.tone}>{pulseChip.label}</Chip>}
          sub="탭을 눌러 일간·주간·월간을 봐요"
          title="매출 흐름"
        />
        <CardBody className="pt-3">
          <SalesPulseTabs comparison={comparison} month={month} pulse={chart} />
        </CardBody>
      </Card>

      {/* ④ 접이식 2장 — 기본 접힘 */}
      <Card>
        <details className="group">
          <summary className={SUMMARY_ROW}>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-[#0F1412]">발주가 나온 이유</span>
              <span className="mt-0.5 block truncate text-[11.5px] font-medium text-[#8B948D]">
                교차예측 · 사업자별 전표 · 손익분기
              </span>
            </span>
            <span aria-hidden className="text-[16px] font-bold text-[#C2C9C4] transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>

          <div className="border-t border-[#F1F3F2] px-5 py-4">
            <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold text-[#3B4740]">
              {["수집", "교차예측", "임계", "사업자 분리", "알림톡"].map((step, index) => (
                <span key={step} className="flex items-center gap-1">
                  <span className={`rounded-full px-2 py-1 ${index === 1 ? "bg-[#0F1412] text-[#1DFF26]" : "bg-[#F2F4F6] text-[#6B746D]"}`}>
                    {step}
                  </span>
                  {index < 4 ? <span className="text-[#C2C9C4]">›</span> : null}
                </span>
              ))}
            </div>

            {/* 손익분기(BEP) · 발주 모드 — 특허 1호 종속항. 접힘 패널 안에서만 보인다. */}
            {bep ? (
              <div className="mt-3 rounded-[18px] bg-[#F7F8F9] px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-bold text-[#3B4740]">손익분기 · 발주 모드</p>
                  <Chip tone={bep.reached ? "green" : "amber"}>{bep.modeLabel}</Chip>
                </div>

                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#E3E8E5]">
                  <div
                    className={`h-full rounded-full ${bep.reached ? "bg-[#1D9F4C]" : "bg-[#E0A800]"}`}
                    style={{ width: `${Math.min(100, Math.max(0, bep.progressPct))}%` }}
                  />
                </div>

                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="text-[11.5px] font-medium text-[#6B746D]">
                    달성률 <span className="font-bold tabular-nums text-[#0F1412]">{Math.round(bep.progressPct)}%</span>
                  </span>
                  <span className={`text-[12px] font-bold ${bep.reached ? "text-[#0B5C2A]" : "text-[#8A5A00]"}`}>
                    {bep.bepLabel}
                  </span>
                </div>

                <p className="mt-2 text-[10px] leading-[1.6] text-[#8B948D]">
                  일할 고정비 {won(bep.dailyFixedCost)} · 하루 공헌이익 {won(bep.dailyContribution)} · BEP 일매출{" "}
                  {won(bep.bepDailyRevenue)}
                </p>
                <p className="text-[10px] leading-[1.6] text-[#8B948D]">
                  여유 현금 {won(bep.freeCashFlow)} (월말 예상 순수익 − 3종 발주 {won(bep.orderAmount)})
                </p>
                <p className="mt-1 text-[10px] leading-[1.6] text-[#A7AFA9]">{bep.reason}</p>
              </div>
            ) : null}

            <ul className="mt-3 space-y-1.5 text-[11px] leading-[1.65] text-[#8B948D]">
              <li>
                학사 버스트{" "}
                {burst.activeWindow ? `${burst.activeWindow.title} (~${burst.activeWindow.end.slice(5).replace("-", "/")})` : "없음"}
                {" → "}프린트 ×{burst.printWeight} · 커피 ×{burst.coffeeWeight}
              </li>
              <li>
                원두 {data.bean.coffeeDrinks}잔 → {data.bean.dailyGrams}g (버스트 {data.bean.dailyGramsWithBurst}g) · 프린트{" "}
                {data.print.cumulativePrintCount.toLocaleString("ko-KR")}매
              </li>
              <li>계산: 기본 = 14일 지수가중(0.9) · 교차 = 1 + w×clamp(최근3일/직전주, ±40%) · 잔여일 = 현재고 ÷ 보정소진</li>
            </ul>

            <div className="mt-3 grid gap-2">
              {(["franchisee_cafe", "hq_print"] as const).map((owner) => {
                const proposals = data.orders.proposals.filter((proposal) => proposal.owner === owner);
                const summary = data.orders.byOwner[owner];

                return (
                  <div key={owner} className="rounded-[14px] bg-[#F7F8F9] px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="font-bold text-[#3B4740]">
                        {owner === "franchisee_cafe" ? "점주 사업자(카페)" : "본사 사업자(프린트)"}
                      </span>
                      <span className="font-bold tabular-nums text-[#0F1412]">
                        {won(summary.amount)}
                        {summary.unknownAmount > 0 ? ` + 견적 ${summary.unknownAmount}` : ""}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[10.5px] text-[#8B948D]">
                      {proposals
                        .map((proposal) => `${proposal.material}${proposal.amount === null ? "(견적)" : ` ${won(proposal.amount)}`}`)
                        .join(" · ") || "없음"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </details>
      </Card>

      <Card>
        <details className="group">
          <summary className={SUMMARY_ROW}>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-[#0F1412]">확인이 필요한 것</span>
              <span className="mt-0.5 block truncate text-[11.5px] font-medium text-[#8B948D]">
                바닥·주의 품목과 수집 상태
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <Chip tone={emptyStock.length > 0 ? "red" : problemStock.length > 0 ? "amber" : "green"}>
                {emptyStock.length > 0 ? `바닥 ${emptyStock.length}` : problemStock.length > 0 ? `주의 ${problemStock.length}` : "정상"}
              </Chip>
              <span aria-hidden className="text-[16px] font-bold text-[#C2C9C4] transition-transform group-open:rotate-90">
                ›
              </span>
            </span>
          </summary>

          <div className="border-t border-[#F1F3F2] px-5 py-4">
            <RowList>
              {problemStock.map((item) => (
                <Row
                  key={`${item.material}-${item.slot}`}
                  sub={item.status === "empty" ? "다 떨어졌어요" : "곧 떨어져요"}
                  value={item.status === "empty" ? "0%" : item.daysLeft !== null ? days(item.daysLeft) : `${Math.round(item.pct)}%`}
                  valueTone={item.status === "empty" ? "red" : "amber"}
                  label={item.material}
                />
              ))}
              {problemStock.length === 0 ? (
                <p className="py-3 text-[12px] font-medium text-[#8B948D]">지금은 바닥이거나 주의할 품목이 없어요.</p>
              ) : null}
            </RowList>

            <p className="mt-3 text-[10.5px] leading-[1.6] text-[#8B948D]">
              토너 K {data.print.toner.k}% · C {data.print.toner.c}% · M {data.print.toner.m}% · Y {data.print.toner.y}% · 용지 Tray{" "}
              {data.print.paper.tray1}%/{data.print.paper.tray2}%
            </p>
            <p className="text-[10.5px] leading-[1.6] text-[#8B948D]">
              프린트 {data.revenue.print.month} 실매출 {won(data.revenue.print.total)} (전월 {pct(data.revenue.print.trendPct)})
              {data.revenue.print.currentMonthPending ? " · 이번 달 26일 정산 전" : ""} · 누적 커피{" "}
              {manwon(data.revenue.coffee.cumulativeTotal)}원
            </p>
            {data.drift.findings.slice(0, 1).map((finding) => (
              <p
                key={`${finding.product}-${finding.material}`}
                className="mt-2 rounded-[14px] bg-[#FFF2F2] px-3.5 py-2.5 text-[11px] leading-[1.55] text-[#3B4740]"
              >
                <span className="font-bold text-[#B3261E]">{finding.severity}</span> {finding.product} · {finding.detail}
              </p>
            ))}
            {data.risk.items.slice(0, 1).map((item) => (
              <p key={item.material} className="mt-2 rounded-[14px] bg-[#FFF8E6] px-3.5 py-2.5 text-[11px] leading-[1.55] text-[#3B4740]">
                {item.material} · {item.action}
              </p>
            ))}
          </div>
        </details>
      </Card>

      <p className="px-1 pb-2 text-[9.5px] leading-[1.6] text-[#B0B7B2]">
        {capturedLabel(data.capturedAt)} · 스키마 {data.schemaVersion} · {store.label} 단독 · 내부용
      </p>
    </div>
  );
}

function StockRow({
  label,
  sub,
  value,
  tone,
  badge,
}: {
  label: string;
  sub: string;
  value: string;
  tone: Tone;
  badge?: string;
}) {
  const valueTone = { red: "red", amber: "amber", ok: "ink", gray: "muted" }[tone] as "red" | "amber" | "ink" | "muted";

  return (
    <Row
      chip={badge}
      chipTone="ink"
      dot={DOT[tone]}
      label={label}
      sub={sub}
      value={value}
      valueTone={valueTone}
    />
  );
}
