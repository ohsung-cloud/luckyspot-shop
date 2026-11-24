import { capturedLabel } from "./format";
import { formatWon, monthlyForStore, type MonthlyPeriod } from "./monthly";
import { RevenueMixMini } from "./RevenueMixDonut";
import { SalesPulseTabs } from "./SalesPulseTabs";
import { storePulse } from "./trend";
import { autoOrderHref, type StoreEntry } from "./stores";

/**
 * 재고·프린트 스냅샷이 아직 없는 지점의 매출 리포트.
 *
 * 평택점은 로얄선즈 판매정보에서 커피 매출만 실측으로 확보했고,
 * 에스칼프린트 정산본과 기기 재고(토너·용지·원두) 스냅샷은 아직 없다.
 * 그래서 이 화면은 **매출 카드 하나 + '무엇이 아직 없는지' 한 칸**으로 끝낸다.
 *  - 없는 값은 0으로 채우지 않는다(원두 0일·토너 0%처럼 읽히면 발주 판단을 망친다).
 *  - 고정비가 등록되지 않은 지점이라 예상 순수익도 계산해 보여주지 않는다.
 */

export function StoreSalesOnly({ store, period }: { store: StoreEntry; period: MonthlyPeriod }) {
  const month = monthlyForStore(store.code, period);
  const amount = month?.coffee.amount ?? null;
  // 펄스의 '최근 7일'은 고른 달의 끝을 기준으로 그린다 — 10월을 보면서 11월 마지막 주 막대를 그리지 않게.
  const asOf = period === "2026-11" ? "2026-11-24" : "2026-10-31";
  const rangeDays = period === "2026-11" ? 24 : 31;
  const dailyRate = amount === null ? null : Math.round(amount / rangeDays);
  const pulse = storePulse({ code: store.code, asOf, dailyRate });

  return (
    <div className="grid gap-2.5">
      <p className="px-1 text-[11px] text-[#6B746D]">
        {store.label} · 재고 스냅샷 수집 전 · {store.tagline}
        <span className="mt-0.5 block text-[10px] text-[#98A29B]">
          커피 매출은 로얄선즈 판매정보 실측 · {capturedLabel("2026-11-24T14:00:00+09:00")} 조회
        </span>
      </p>

      {/* ① 매출 — 이 지점에서 확인된 유일한 실측값 */}
      <section className="min-w-0 rounded-[22px] bg-[#0F1412] p-4 text-white">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-[#1DFF26] px-2.5 py-1 text-[11px] font-bold text-[#0F1412]">
            {month ? `${month.monthLabel} 매출` : "매출"}
          </span>
          <span className="text-[10.5px] text-[#9AA39C]">
            {month ? `${month.coffee.range} · 확인된 항목만` : "수집 전"}
          </span>
        </div>

        <div className="mt-2.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[34px] font-bold leading-none tabular-nums tracking-[-0.03em]">
              {formatWon(month?.total ?? null)}
            </p>
            <p className="mt-1.5 flex flex-wrap gap-1.5 text-[10.5px] text-[#C8D0CA]">
              <span className="rounded-full bg-white/10 px-2 py-0.5">
                <span aria-hidden className="mr-1 inline-block size-1.5 rounded-full bg-white align-middle" />
                커피 {formatWon(month?.coffee.amount ?? null)}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5">
                <span aria-hidden className="mr-1 inline-block size-1.5 rounded-full bg-[#1DFF26] align-middle" />
                프린트 미확보
              </span>
            </p>
          </div>
          <RevenueMixMini month={month} size={62} />
        </div>

        <p className="mt-2.5 rounded-[10px] bg-white/8 px-2.5 py-2 text-[10.5px] leading-[1.5] text-[#9AA39C]">
          월 고정비가 아직 등록되지 않아 예상 순수익은 계산하지 않습니다. 본사 화면에서 고정비를 넣으면
          여기에 표시됩니다.
        </p>

        <SalesPulseTabs month={month} pulse={pulse} />
      </section>

      {/* ② 아직 없는 것 — 0으로 채우지 않고 이유를 적는다 */}
      <section className="min-w-0 rounded-[20px] border-2 border-[#0F1412] bg-white p-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold text-[#0F1412]">아직 수집 전인 항목</h2>
          <span className="text-[10px] text-[#6B746D]">프린트 · 재고</span>
        </div>

        <ul className="mt-2 space-y-1.5 text-[11px] leading-[1.55] text-[#3B4740]">
          <li className="rounded-[10px] bg-[#F8F9F9] px-2.5 py-2">
            <span className="font-bold">프린트 매출</span> — 에스칼프린트 정산본 미확보. 이 지점은 네이버
            플레이스에 인쇄 메뉴가 없습니다.
          </li>
          <li className="rounded-[10px] bg-[#F8F9F9] px-2.5 py-2">
            <span className="font-bold">원두·토너·용지</span> — 기기 재고 스냅샷이 없어 잔여일을 계산하지
            않았습니다. 수집기가 이 포털을 읽으면 여기에 채워집니다.
          </li>
          <li className="rounded-[10px] bg-[#F8F9F9] px-2.5 py-2">
            <span className="font-bold">누적 커피</span> — 10,030,100원 · 4,900건 · 환불 0건(11-24 기준)
          </li>
        </ul>

        <a
          className="mt-2.5 flex h-11 w-full items-center justify-center rounded-[12px] border border-[#D7DBD9] text-[13px] font-bold text-[#3B4740]"
          href={autoOrderHref(store)}
        >
          발주 화면으로
        </a>
      </section>

      <p className="px-1 pb-2 text-[9.5px] text-[#B0B7B2]">
        {store.label} 단독 · 매출은 로얄선즈 판매정보 실측 · 재고·프린트는 수집 전 · 내부용
      </p>
    </div>
  );
}
