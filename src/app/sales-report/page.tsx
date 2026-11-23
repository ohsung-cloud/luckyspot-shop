import type { Metadata } from "next";

import snapshotJson from "@/data/sales-report/snapshot-2026-11-23.json";
import type { SalesReportSnapshot } from "@/features/sales-report/types";

/**
 * 통합 매출 리포트 — 에스칼프린트(프린트) + 로얄선즈(커피) 실수집 스냅샷.
 *
 * 데이터: 두 사이트 수집기(two-site-collector) 2026-11-23 12:10 KST 분석 결과.
 * 화면 순서는 점주가 매일 보는 순서다.
 *   ① 오늘·이달 커피 매출 → ② 통합 월 런레이트 → ③ 프린트 월별 추이
 *   → ④ 원두 소모·잔여일 → ⑤ 소모품 잔여 → ⑥ 이상 징후 → ⑦ 프린트 장비
 *   → ⑧ 추천 발주(사업자 분리) → 발주 승인 연결
 *
 * 내부용: 검색 비노출(noindex). 홈페이지 메뉴에는 걸지 않는다.
 */

const data = snapshotJson as unknown as SalesReportSnapshot;

export const metadata: Metadata = {
  title: "통합 매출 리포트 | 럭키스팟",
  description: "에스칼프린트·로얄선즈 실수집 매출과 소모품·발주 리포트(내부용).",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

const ENTITY_LABEL = {
  franchisee_cafe: "점주 사업자",
  hq_print: "본사 사업자",
} as const;

function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function manwon(value: number) {
  return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만`;
}

function pct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function days(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value >= 999) return "1년+";
  return `${value.toFixed(1)}일`;
}

/** 수집 시각을 KST로 표시한다(서버가 UTC여도 12:10으로 보이게). */
function capturedLabel(iso: string) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}월 ${get("day")}일 ${get("hour")}:${get("minute")}`;
}

const STATUS_META = {
  empty: { label: "바닥", className: "bg-[#FFEBEE] text-[#B3261E]" },
  watch: { label: "주의", className: "bg-[#FFF6E0] text-[#8A5A00]" },
  ok: { label: "정상", className: "bg-[#EDFBEF] text-[#0B5C2A]" },
} as const;

const STATUS_ORDER = { empty: 0, watch: 1, ok: 2 } as const;

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-[#E6E9E7] bg-white p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold text-[#0F1412]">{title}</h2>
        {caption ? <span className="text-[11.5px] text-[#6B746D]">{caption}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Gauge({ label, pctValue }: { label: string; pctValue: number }) {
  const tone = pctValue <= 20 ? "bg-[#E5484D]" : pctValue <= 40 ? "bg-[#E0A800]" : "bg-[#1D9F4C]";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-semibold text-[#3B4740]">{label}</span>
        <span className="text-[12.5px] font-bold tabular-nums text-[#0F1412]">{Math.round(pctValue)}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#EFF1F0]">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, Math.min(100, pctValue))}%` }} />
      </div>
    </div>
  );
}

export default function SalesReportPage() {
  const coffee = data.revenue.coffee;
  const print = data.revenue.print;
  const bean = data.bean;
  const burst = data.burst;

  const monthsDesc = print.history;
  const months = [...monthsDesc].reverse();
  const maxMonth = Math.max(...months.map((month) => month.total), 1);

  const stock = [...data.stock].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.daysLeft ?? 9e9) - (b.daysLeft ?? 9e9),
  );

  const emptyStock = stock.filter((item) => item.status === "empty");
  const watchStock = stock.filter((item) => item.status === "watch");

  const cafeOrders = data.orders.proposals.filter((proposal) => proposal.owner === "franchisee_cafe");
  const printOrders = data.orders.proposals.filter((proposal) => proposal.owner === "hq_print");
  const knownOrderTotal = data.orders.proposals.reduce((sum, proposal) => sum + (proposal.amount ?? 0), 0);

  return (
    <main className="min-h-screen bg-[#F4F5F6]">
      <header className="bg-[#0F1412]">
        <div className="mx-auto flex w-full max-w-[760px] items-center justify-between px-4 py-3.5 sm:px-6">
          <a className="flex items-center gap-2.5" href="/">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-[8px] bg-[#1DFF26] text-[13px] font-bold leading-none text-[#0F1412]"
            >
              L
            </span>
            <div className="leading-none">
              <p className="text-[13px] font-semibold tracking-[0.2em] text-white">LUCKY SPOT</p>
              <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-[#9AA39C]">통합 매출 리포트</p>
            </div>
          </a>

          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-[#2C3730] px-2.5 py-1 text-[10.5px] font-semibold text-[#9AA39C]">
              내부 · noindex
            </span>
            <a
              className="flex h-9 items-center rounded-full bg-[#1DFF26] px-3 text-[12.5px] font-bold text-[#0F1412]"
              href="/auto-order?storeCode=STORE_GNM"
            >
              자동발주
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[760px] px-4 py-5 pb-28 sm:px-6 sm:py-7 sm:pb-28">
        <div className="grid gap-3.5">
          <header className="px-1">
            <p className="text-[13.5px] font-semibold text-[#007A36]">{data.storeLabel}</p>
            <h1 className="mt-1.5 text-[26px] font-bold leading-[1.3] tracking-[-0.02em] text-[#0F1412] sm:text-[30px]">
              오늘 매출과 남은 재료,
              <br />
              이 화면 하나로 봅니다
            </h1>
            <p className="mt-1.5 text-[12.5px] text-[#6B746D]">
              {capturedLabel(data.capturedAt)} 수집 · 에스칼프린트 + 로얄선즈
            </p>
            {burst.activeWindow ? (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                <span className="rounded-full bg-[#0F1412] px-2.5 py-1 font-bold text-[#1DFF26]">
                  학사 버스트
                </span>
                <span className="text-[#3B4740]">
                  {burst.activeWindow.title} (~{burst.activeWindow.end.slice(5).replace("-", "/")})
                </span>
                <span className="text-[#6B746D]">
                  프린트 ×{burst.printWeight} · 커피 ×{burst.coffeeWeight}
                </span>
              </p>
            ) : null}
          </header>

          {/* ① 오늘·이달 커피 매출 */}
          <section className="rounded-[24px] bg-[#0F1412] p-5 text-white">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-[#1DFF26] px-2.5 py-1 text-[11.5px] font-bold text-[#0F1412]">
                커피 매출
              </span>
              <span className="text-[11.5px] text-[#9AA39C]">오늘은 집계 중</span>
            </div>

            <p className="mt-4 text-[12px] text-[#9AA39C]">오늘 (12:10까지)</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <p className="text-[32px] font-bold leading-none tabular-nums tracking-[-0.02em] sm:text-[38px]">{won(coffee.today)}</p>
              <span className={`text-[13px] font-bold ${coffee.trendPct >= 0 ? "text-[#1DFF26]" : "text-[#FF8A8A]"}`}>
                {pct(coffee.trendPct)}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] text-[#9AA39C]">
              어제 하루 {won(coffee.yesterday)} 대비 · 오늘은 아직 집계 중이라 낮게 보입니다
            </p>

            <div className="mt-4 grid grid-cols-2 gap-1.5">
              <div className="rounded-[14px] bg-white/8 px-3 py-3">
                <p className="text-[11px] text-[#9AA39C]">이달</p>
                <p className="mt-1 text-[17px] font-bold tabular-nums">{won(coffee.month)}</p>
              </div>
              <div className="rounded-[14px] bg-white/8 px-3 py-3">
                <p className="text-[11px] text-[#9AA39C]">일평균</p>
                <p className="mt-1 text-[17px] font-bold tabular-nums">{won(coffee.dailyRate)}</p>
              </div>
              <div className="col-span-2 rounded-[14px] bg-white/8 px-3 py-3">
                <p className="text-[11px] text-[#9AA39C]">누적 (개점 이후)</p>
                <p className="mt-1 text-[17px] font-bold tabular-nums">{manwon(coffee.cumulativeTotal)}원</p>
              </div>
            </div>
          </section>

          {/* ② 통합 런레이트 */}
          <Section title="통합 월 런레이트" caption="방향성 지표">
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[28px] font-bold leading-none tabular-nums text-[#0F1412]">
                  {won(data.revenue.blended.monthlyRunRate)}
                </p>
                <p className="mt-1 text-[12px] text-[#6B746D]">
                  하루 {won(data.revenue.blended.dailyRate)} · 커피 + 프린트
                </p>
              </div>
              <span className="rounded-full bg-[#F4F5F6] px-2.5 py-1 text-[11px] font-semibold text-[#6B746D]">
                커피 1,059,700 + 프린트 500,200
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-[1.6] text-[#98A29B]">{data.revenue.blended.basis}</p>
          </Section>

          {/* ③ 프린트 월별 추이 */}
          <Section title="프린트 월별 추이" caption={`${print.month} ${won(print.total)}`}>
            <ul className="mt-3 space-y-2">
              {months.map((month) => (
                <li key={month.month} className="flex items-center gap-2">
                  <span className="w-[52px] shrink-0 text-[11.5px] font-semibold tabular-nums text-[#6B746D]">
                    {month.month.slice(2).replace("-", ".")}
                  </span>
                  <div className="h-5 flex-1 overflow-hidden rounded-[6px] bg-[#F4F5F6]">
                    <div
                      className={`h-full rounded-[6px] ${month.month === print.month ? "bg-[#0F1412]" : "bg-[#9FE3A6]"}`}
                      style={{ width: `${Math.max(3, (month.total / maxMonth) * 100)}%` }}
                    />
                  </div>
                  <span className="w-[74px] shrink-0 text-right text-[11.5px] font-bold tabular-nums text-[#0F1412]">
                    {manwon(month.total)}
                  </span>
                  <span
                    className={`w-[48px] shrink-0 text-right text-[10.5px] tabular-nums ${
                      month.changePct !== null && month.changePct < 0 ? "text-[#B3261E]" : "text-[#007A36]"
                    }`}
                  >
                    {month.changePct === null ? "—" : pct(month.changePct)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[11.5px] leading-[1.6] text-[#6B746D]">
              {print.month} 실매출 {won(print.total)} (환불 {won(print.refund)} 차감 전 기준) · 전월 대비{" "}
              {pct(print.trendPct)}
              {print.currentMonthPending ? " · 이번 달은 청구 마감 전" : ""}
            </p>
          </Section>

          {/* ④ 원두 */}
          <Section title="원두 소모·잔여" caption="메뉴 구성 기준">
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-[16px] bg-[#EDFBEF] p-3.5">
                <p className="text-[11.5px] font-semibold text-[#0B5C2A]">오늘 원두</p>
                <p className="mt-1 text-[24px] font-bold leading-none tabular-nums text-[#0F1412]">
                  {bean.dailyGrams}g
                </p>
                <p className="mt-1 text-[11px] text-[#3B4740]">
                  버스트 반영 {bean.dailyGramsWithBurst}g · {bean.coffeeDrinks}잔
                </p>
              </div>
              <div className="rounded-[16px] bg-[#F4F5F6] p-3.5">
                <p className="text-[11.5px] font-semibold text-[#3B4740]">남은 원두</p>
                <p className="mt-1 text-[24px] font-bold leading-none tabular-nums text-[#0F1412]">
                  {days(bean.daysLeftWithBurst)}
                </p>
                <p className="mt-1 text-[11px] text-[#6B746D]">
                  {Math.round(bean.stockGrams).toLocaleString("ko-KR")}g · 약 {bean.servingsLeft}잔
                </p>
              </div>
            </div>

            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#EFF1F0]">
              <div
                className="h-full rounded-full bg-[#1D9F4C]"
                style={{ width: `${Math.max(4, Math.min(100, bean.stockPct))}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-[#98A29B]">
              재고 {bean.stockPct}% · 평시 기준 {days(bean.daysLeftPlain)} · 안전재고 4일
            </p>

            <table className="mt-3 w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#EFF1F0] text-[10.5px] text-[#6B746D]">
                  <th className="py-1.5 font-semibold">메뉴</th>
                  <th className="py-1.5 text-right font-semibold">잔</th>
                  <th className="py-1.5 text-right font-semibold">g/잔</th>
                  <th className="py-1.5 text-right font-semibold">원두</th>
                  <th className="hidden py-1.5 text-right font-semibold sm:table-cell">기계 로그</th>
                </tr>
              </thead>
              <tbody>
                {bean.rows.map((row) => (
                  <tr key={row.product} className="border-b border-[#F6F7F7] text-[12px]">
                    <td className="py-2 font-semibold text-[#0F1412]">{row.product}</td>
                    <td className="py-2 text-right tabular-nums text-[#3B4740]">{row.drinks}</td>
                    <td className="py-2 text-right tabular-nums text-[#3B4740]">{row.gramsPerDrink}</td>
                    <td className="py-2 text-right font-bold tabular-nums text-[#0F1412]">{row.totalGrams}g</td>
                    <td className="hidden py-2 text-right tabular-nums text-[#98A29B] sm:table-cell">
                      {row.machineGrams === null ? "—" : `${row.machineGrams}g`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] leading-[1.6] text-[#98A29B]">
              아메리카노 9g · 투샷 15g · 카페라떼 7g · 아샷추 7g (대표 확정). 기계 로그 값은 대조용입니다.
            </p>
          </Section>

          {/* ⑤ 소모품 잔여 */}
          <Section
            title="소모품 잔여"
            caption={`바닥 ${emptyStock.length} · 주의 ${watchStock.length}`}
          >
            <ul className="mt-3 divide-y divide-[#F4F5F6]">
              {stock.map((item) => {
                const meta = STATUS_META[item.status];
                const meter = Math.max(2, Math.min(100, item.status === "empty" ? 0 : item.pct));

                return (
                  <li key={`${item.material}-${item.slot}`} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[#0F1412]">
                        {item.material}
                        {item.slot.replace(/\s/g, "") !== item.material.replace(/\s/g, "") ? (
                          <span className="ml-1.5 text-[10.5px] font-normal text-[#98A29B]">{item.slot}</span>
                        ) : null}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${meta.className}`}>
                        {meta.label}
                      </span>
                      <span className="w-[64px] shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-[#3B4740]">
                        {item.status === "empty"
                          ? "0%"
                          : item.daysLeft !== null
                            ? days(item.daysLeft)
                            : item.pct > 200
                              ? "충분"
                              : `${Math.round(item.pct)}%`}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#EFF1F0]">
                      <div
                        className={`h-full rounded-full ${
                          item.status === "empty" ? "bg-[#E5484D]" : item.status === "watch" ? "bg-[#E0A800]" : "bg-[#1D9F4C]"
                        }`}
                        style={{ width: `${meter}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* ⑥ 이상 징후 */}
          <Section title="이상 징후" caption={data.drift.summary}>
            <ul className="mt-3 space-y-2">
              {data.drift.findings.map((finding) => (
                <li
                  key={`${finding.product}-${finding.material}`}
                  className="rounded-[14px] border border-[#F3D2D2] bg-[#FFF7F7] px-3.5 py-3"
                >
                  <p className="text-[11px] font-bold text-[#B3261E]">
                    {finding.severity.toUpperCase()} · {finding.type}
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-[#0F1412]">
                    {finding.product} · {finding.detail}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-[1.6] text-[#6B746D]">{finding.hint}</p>
                </li>
              ))}
              {data.risk.items.map((item) => (
                <li
                  key={item.material}
                  className="rounded-[14px] border border-[#F0E1B8] bg-[#FFFBF0] px-3.5 py-3"
                >
                  <p className="text-[11px] font-bold text-[#8A5A00]">재고 0 · {item.slot}</p>
                  <p className="mt-1 text-[13px] font-semibold text-[#0F1412]">{item.material}</p>
                  <p className="mt-1 text-[11.5px] leading-[1.6] text-[#6B746D]">{item.action}</p>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-[#98A29B]">
              오늘 매출 중 아이스 비중 {(data.risk.icedShare * 100).toFixed(0)}% — 얼음·컵 소모와 함께 봐야 합니다.
            </p>
          </Section>

          {/* ⑦ 프린트 장비 */}
          <Section title="프린트 장비" caption={`누적 ${data.print.cumulativePrintCount.toLocaleString("ko-KR")}매`}>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
              <Gauge label="토너 K" pctValue={data.print.toner.k} />
              <Gauge label="토너 C" pctValue={data.print.toner.c} />
              <Gauge label="토너 M" pctValue={data.print.toner.m} />
              <Gauge label="토너 Y" pctValue={data.print.toner.y} />
              <Gauge label="용지 Tray1" pctValue={data.print.paper.tray1} />
              <Gauge label="용지 Tray2" pctValue={data.print.paper.tray2} />
            </div>
            <p className="mt-2 text-[11.5px] leading-[1.6] text-[#6B746D]">
              토너 평균 {data.print.tonerAvgPct}% · 용지 평균 {data.print.trayAvgPct}% ·{" "}
              {data.print.hasCounterHistory ? "출력 매수 계산 가능" : "누적 카운터 2점이 쌓이면 하루 출력량이 계산됩니다"}
            </p>
            {data.print.nextParts.map((part) => (
              <p key={part.name} className="mt-2 rounded-[12px] bg-[#F4F5F6] px-3 py-2 text-[11.5px] text-[#3B4740]">
                다음 소모품 · {part.name} {won(part.price)} — {part.note}
              </p>
            ))}
          </Section>

          {/* ⑧ 추천 발주 */}
          <section className="rounded-[24px] border-2 border-[#0F1412] bg-white p-4 sm:p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-bold text-[#0F1412]">추천 발주</h2>
              <span className="text-[11.5px] text-[#6B746D]">사업자 분리</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-[1.6] text-[#6B746D]">
              점주 사업자(카페)와 본사 사업자(프린트)로 나눠 발주합니다. 견적이 필요한 품목은 금액을 비워 두었습니다.
            </p>

            <div className="mt-3 grid gap-2">
              {(Object.keys(data.orders.byOwner) as ("franchisee_cafe" | "hq_print")[]).map((owner) => {
                const summary = data.orders.byOwner[owner];
                const proposals = owner === "franchisee_cafe" ? cafeOrders : printOrders;

                return (
                  <div key={owner} className="rounded-[16px] border border-[#E6E9E7] p-3.5">
                    <div className="flex items-center justify-between">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          owner === "franchisee_cafe" ? "bg-[#EDFBEF] text-[#0B5C2A]" : "bg-[#EEF2FF] text-[#243B8F]"
                        }`}
                      >
                        {ENTITY_LABEL[owner]}
                      </span>
                      <span className="text-[15px] font-bold tabular-nums text-[#0F1412]">
                        {won(summary.amount)}
                        {summary.unknownAmount > 0 ? ` + 견적 ${summary.unknownAmount}건` : ""}
                      </span>
                    </div>

                    <ul className="mt-2 space-y-2">
                      {proposals.map((proposal) => (
                        <li key={proposal.material} className="text-[12.5px]">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-[#0F1412]">
                              {proposal.material}
                              {proposal.packLabel ? (
                                <span className="ml-1 text-[11px] font-normal text-[#98A29B]">
                                  {proposal.packLabel}
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 tabular-nums text-[#3B4740]">
                              {proposal.amount === null ? "견적 필요" : won(proposal.amount)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] leading-[1.5] text-[#98A29B]">{proposal.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-baseline justify-between border-t border-dashed border-[#E6E9E7] pt-3">
              <span className="text-[12px] text-[#6B746D]">확정 금액 합계</span>
              <span className="text-[19px] font-bold tabular-nums text-[#0F1412]">{won(knownOrderTotal)}</span>
            </div>

            <a
              className="mt-3 flex h-[62px] w-full items-center justify-center rounded-[18px] bg-[#1DFF26] text-[19px] font-bold text-[#0F1412]"
              href="/auto-order?storeCode=STORE_GNM"
            >
              사업자별로 나눠 발주 승인
            </a>
            <p className="mt-2 text-center text-[11px] text-[#6B746D]">
              승인하면 5분 동안 취소할 수 있고, 그 뒤 점주·본사 사업자 발주로 확정됩니다.
            </p>
          </section>

          {/* 각주 */}
          <footer className="rounded-[18px] bg-white px-4 py-3.5">
            <p className="text-[11px] font-semibold text-[#3B4740]">계산 기준</p>
            <ul className="mt-1.5 space-y-1 text-[11px] leading-[1.65] text-[#98A29B]">
              {data.assumptions.slice(0, 4).map((assumption) => (
                <li key={assumption}>· {assumption}</li>
              ))}
            </ul>
            <p className="mt-2 text-[10.5px] text-[#B0B7B2]">
              수집 {capturedLabel(data.capturedAt)} · 스키마 {data.schemaVersion} · 내부용(검색 비노출)
            </p>
          </footer>
        </div>
      </div>

      {/* 모바일에서도 바로 발주로 이어지게 — 하단 고정 */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E6E9E7] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[760px] items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10.5px] text-[#6B746D]">추천 발주</p>
            <p className="text-[16px] font-bold tabular-nums text-[#0F1412]">{won(knownOrderTotal)}</p>
          </div>
          <a
            className="flex h-12 flex-1 items-center justify-center rounded-[14px] bg-[#1DFF26] text-[15.5px] font-bold text-[#0F1412]"
            href="/auto-order?storeCode=STORE_GNM"
          >
            사업자별로 나눠 발주
          </a>
        </div>
      </div>
    </main>
  );
}
