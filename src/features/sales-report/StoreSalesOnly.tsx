import { Card, CardBody, CardHead, Chip, Row, RowList } from "@/components/internal/card-ui";

import { capturedLabel } from "./format";
import { formatWon, monthlyForStore, type MonthlyPeriod } from "./monthly";
import { RevenueMixMini } from "./RevenueMixDonut";
import { SalesPulseTabs } from "./SalesPulseTabs";
import { storePulse } from "./trend";
import { autoOrderHref, type StoreEntry } from "./stores";

/**
 * 재고·프린트 스냅샷이 아직 없는 지점의 매출 리포트 — 매출 카드 + '아직 없는 것' 카드.
 *
 * 평택점은 로얄선즈 판매정보에서 커피 매출만 실측으로 확보했고,
 * 에스칼프린트 정산본과 기기 재고(토너·용지·원두) 스냅샷은 아직 없다.
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
    <div className="grid gap-3">
      <p className="px-1 text-[11.5px] font-medium leading-[1.55] text-[#8B948D]">
        {store.label} · {store.tagline}
        <span className="mt-1 block text-[10.5px] text-[#A7AFA9]">
          커피 매출은 판매정보 실측 · {capturedLabel("2026-11-24T14:00:00+09:00")} 조회 · 재고는 아직 수집 전이에요
        </span>
      </p>

      {/* ① 매출 — 이 지점에서 확인된 유일한 실측값 */}
      <Card className="min-w-0 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#6B746D]">{month ? `${month.monthLabel} 매출` : "매출"}</p>
            <p className="mt-2 text-[34px] font-bold leading-none tabular-nums tracking-[0.03em] text-[#0F1412]">
              {formatWon(month?.total ?? null)}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Chip tone="gray">확인된 항목만</Chip>
              <span className="text-[10.5px] font-medium text-[#A7AFA9]">{month ? `${month.coffee.range} 기준` : "수집 전"}</span>
            </div>
          </div>
          <RevenueMixMini month={month} size={68} />
        </div>

        <RowList className="mt-4 border-t border-[#F1F3F2]">
          <Row
            dot="bg-[#0F1412]"
            label="커피"
            sub={month ? month.coffee.range : "수집 전"}
            value={formatWon(month?.coffee.amount ?? null)}
          />
          <Row
            dot="bg-[#C9CFCB]"
            label="프린트"
            sub="정산본을 아직 못 받았어요"
            value="미확보"
            valueTone="muted"
          />
        </RowList>

        <p className="mt-4 rounded-[18px] bg-[#F7F8F9] px-4 py-3.5 text-[11.5px] leading-[1.6] text-[#8B948D]">
          월 고정비가 아직 등록되지 않아 예상 순수익은 계산하지 않았어요. 본사 화면에서 고정비를 넣으면 여기에 표시돼요.
        </p>
      </Card>

      {/* ② 흐름 */}
      <Card className="min-w-0">
        <CardHead
          right={<Chip tone="amber">추정</Chip>}
          sub="탭을 눌러 일간·주간·월간을 봐요"
          title="매출 흐름"
        />
        <CardBody className="pt-3">
          <SalesPulseTabs month={month} pulse={pulse} />
        </CardBody>
      </Card>

      {/* ③ 아직 없는 것 — 0으로 채우지 않고 이유를 적는다 */}
      <Card>
        <CardHead right={<Chip tone="gray">프린트 · 재고</Chip>} sub="0원으로 채우지 않고 비워 둬요" title="아직 수집 전인 항목" />
        <CardBody className="pt-2">
          <ul className="space-y-2 text-[11.5px] leading-[1.6] text-[#3B4740]">
            <li className="rounded-[14px] bg-[#F7F8F9] px-3.5 py-3">
              <span className="font-bold">프린트 매출</span> — 정산본을 아직 못 받았어요. 이 지점은 네이버
              플레이스에 인쇄 메뉴가 없어요.
            </li>
            <li className="rounded-[14px] bg-[#F7F8F9] px-3.5 py-3">
              <span className="font-bold">원두·토너·용지</span> — 기기 재고 스냅샷이 없어 잔여일을 계산하지 않았어요.
              수집기가 이 포털을 읽으면 여기에 채워져요.
            </li>
            <li className="rounded-[14px] bg-[#F7F8F9] px-3.5 py-3">
              <span className="font-bold">누적 커피</span> — 10,030,100원 · 4,900건 · 환불 0건(11-24 기준)
            </li>
          </ul>

          <a
            className="mt-4 flex h-[52px] w-full items-center justify-center rounded-[16px] bg-[#F2F4F6] text-[14px] font-bold text-[#3B4740]"
            href={autoOrderHref(store)}
          >
            발주 화면 열기
          </a>
        </CardBody>
      </Card>

      <p className="px-1 pb-2 text-[9.5px] leading-[1.6] text-[#B0B7B2]">
        {store.label} 단독 · 매출은 판매정보 실측 · 재고·프린트는 수집 전 · 내부용
      </p>
    </div>
  );
}
