import { Card, CardBody, CardHead, Chip, Row, RowList } from "@/components/internal/card-ui";

import type { StoreFixedCost } from "@/features/stores/registry-types";

import { capturedLabel } from "./format";
import { formatWon, monthlyForStore, type MonthlyPeriod } from "./monthly";
import { ProfitRow } from "./ProfitRow";
import { estimateProfit, fixedCostTotal, type ProfitEstimate } from "./profit";
import { RevenueMixMini } from "./RevenueMixDonut";
import { SalesPulseTabs } from "./SalesPulseTabs";
import { storePulse } from "./trend";
import { autoOrderHref, type StoreEntry } from "./stores";

/**
 * 재고·프린트 스냅샷이 아직 없는 지점의 매출 리포트 — 매출 카드 + '아직 없는 것' 카드.
 *
 * 평택점은 로얄선즈, 영등포시장역점은 메일빈, 선유로점은 유로커피에서 커피 매출만 실측으로 확보했다.
 *  - 없는 값은 0으로 채우지 않는다(원두 0일·토너 0%처럼 읽히면 발주 판단을 망친다).
 *  - 고정비가 등록된 지점은 예상 순수익까지 보여 주고, 없으면 계산하지 않은 이유를 적는다.
 *  - 지점마다 다른 설명(프린트 유무·기기 재고·월별 매출)은 아래 COPY 표에만 둔다 —
 *    화면 구조는 세 지점이 같고 글자만 다르다(같은 카드, 같은 높이).
 *  - 지점 숫자는 합산하지 않는다. 이 컴포넌트는 지점 하나의 월 요약만 받는다.
 */

type SalesOnlyCopy = {
  /** 머리말 둘째 줄에서 '커피 매출은 ○○ 실측'의 ○○ */
  source: string;
  /** 머리말 둘째 줄 끝 — 이 지점에서 아직 없는 것 */
  tail: string;
  /** 매출 카드 아래 한 줄 경고(기기 재고 등). 없으면 그리지 않는다. */
  alert?: string;
  /** 셋째 카드 제목·부제·오른쪽 칩 */
  cardTitle: string;
  cardSub: string;
  cardChip: string;
  /** 셋째 카드 목록 */
  items: { title: string; body: string }[];
  /** 10월(저번달) 순수익 계산에 딸리는 한 줄 — 개점 첫 달처럼 비교가 왜곡되는 달에만 */
  octoberNote?: string;
};

const COPY: Record<string, SalesOnlyCopy> = {
  // 평택점 — 로얄선즈 커피만 실측, 프린트·재고 스냅샷 없음(11-24 조회)
  STORE_PTK: {
    source: "로얄선즈",
    tail: "재고는 아직 수집 전이에요",
    cardTitle: "아직 수집 전인 항목",
    cardSub: "0원으로 채우지 않고 비워 둬요",
    cardChip: "프린트·재고",
    items: [
      {
        title: "프린트 매출",
        body: "정산본을 아직 못 받았어요. 이 지점은 네이버 플레이스에 인쇄 메뉴가 없어요.",
      },
      {
        title: "원두·토너·용지",
        body: "기기 재고 스냅샷이 없어 잔여일을 계산하지 않았어요. 수집기가 이 포털을 읽으면 여기에 채워져요.",
      },
      { title: "누적 커피", body: "10,030,100원 · 4,900건 · 환불 0건(11-24 기준)" },
    ],
  },
  // 영등포시장역점 — 메일빈(휴니크) 커피 실측. 프린트 2대는 에스칼프린트 정산본 미확보.
  STORE_YDP: {
    source: "메일빈",
    tail: "기기 재고는 포털에만 있어요",
    alert: "메일빈 기기 재고 — 밀크 파우더 0%(리필 필요) · 컵1 61% · 컵2 71% · 1칸원두 71% · 2칸원두 93% (11-26 22:35 기준)",
    cardTitle: "아직 수집 전인 항목",
    cardSub: "프린트 정산본·기기 재고를 아직 못 읽었어요",
    cardChip: "프린트·재고",
    items: [
      {
        title: "프린트 매출",
        body: "프린트 2대를 운영하지만 에스칼프린트 계정이 아직 연결되지 않아 정산본을 못 읽었어요.",
      },
      {
        title: "기기 재고",
        body: "메일빈 대시보드에 칸별 잔량(%)은 있지만 이 화면 수집기가 아직 읽지 않아요. 위 경고 줄에 마지막으로 확인한 값만 적어 뒀어요.",
      },
      { title: "월별 매출", body: "9월 0원(개점 전) · 10월 274,000원 · 11월 931,200원(11-26 22:35 기준)" },
    ],
    octoberNote:
      "10월은 개점 첫 달이라 매출이 거의 없어요. 월 고정비를 전액 빼서 순수익이 큰 마이너스로 보여요 — 실제 월 실적과 비교하는 값은 아니에요.",
  },
  // 선유로점 — 유로커피 VCMS 커피 실측. 인쇄 메뉴가 아예 없다.
  STORE_SYU: {
    source: "유로커피",
    tail: "인쇄 메뉴가 없어요",
    cardTitle: "이 지점 기준",
    cardSub: "인쇄가 없는 매장이라 커피만 집계해요",
    cardChip: "인쇄 없음",
    items: [
      { title: "프린트", body: "인쇄 메뉴가 없는 매장이라 프린트 매출이 없어요(0원이 아니라 '없음')." },
      {
        title: "기기 재고",
        body: "유로 대시보드에는 잔량이 나오지 않아요. 원두·부자재는 본사 발주로 관리해요.",
      },
      {
        title: "월별 매출",
        body: "6월 3,010,796 · 7월 2,811,400 · 8월 2,636,597 · 9월 2,567,462 · 10월 2,463,907 · 11월 1,810,709원(26일까지)",
      },
      { title: "12월 1일 양도 예정", body: "11월 숫자는 26일까지 집계예요. 양도 전 마지막 달 실적입니다." },
    ],
  },
};

export function StoreSalesOnly({
  store,
  period,
  profit,
  fixedCost,
}: {
  store: StoreEntry;
  period: MonthlyPeriod;
  profit?: ProfitEstimate | null;
  fixedCost?: StoreFixedCost | null;
}) {
  const copy = COPY[store.code] ?? COPY.STORE_PTK;
  const month = monthlyForStore(store.code, period);
  const amount = month?.coffee.amount ?? null;

  // 펄스의 '최근 7일'은 고른 달의 끝을 기준으로 그린다 — 10월을 보면서 11월 마지막 주 막대를 그리지 않게.
  const readAt = store.latestReadAt ?? "2026-11-24T14:00:00+09:00";
  const asOf = period === "2026-11" ? readAt.slice(0, 10) : "2026-10-31";
  const daysSoFar = Number(asOf.slice(8, 10)) || 1;
  const dailyRate = amount === null ? null : Math.round(amount / daysSoFar);
  const pulse = storePulse({ code: store.code, asOf, dailyRate });

  const hasFixedCost = fixedCostTotal(fixedCost) > 0;
  const previousProfit = estimateProfit({ month: monthlyForStore(store.code, "2026-10"), fixedCost });
  const printAmount = month?.print.amount ?? null;
  const printLabel =
    printAmount !== null
      ? formatWon(printAmount)
      : month?.print.source === "인쇄 없음"
        ? "없음"
        : month?.print.status === "pending"
          ? "26일 정산 전"
          : month?.print.status === "missing"
            ? "미확보"
            : "—";
  const pulseChip =
    pulse.dailySource === "measured"
      ? { tone: "green" as const, label: "실측" }
      : pulse.dailySource === "estimated"
        ? { tone: "amber" as const, label: "추정" }
        : { tone: "gray" as const, label: "수집 전" };

  return (
    <div className="grid gap-3">
      <p className="px-1 text-[11.5px] font-medium leading-[1.55] text-[#8B948D]">
        {store.label} · {store.tagline}
        <span className="mt-1 block text-[10.5px] text-[#A7AFA9]">
          커피 매출은 {copy.source} 실측 · {capturedLabel(readAt)} 조회 · {copy.tail}
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
          {/* 매출 비중 도넛은 두 매출(커피·프린트)이 다 확인된 지점에서만 그린다 — 한 쪽만 있으면 '부분'으로 잘못 읽힌다. */}
          {printAmount !== null ? <RevenueMixMini month={month} size={68} /> : null}
        </div>

        <RowList className="mt-4 border-t border-[#F1F3F2]">
          <Row
            dot="bg-[#0F1412]"
            label="커피"
            sub={month ? month.coffee.range : "수집 전"}
            value={formatWon(month?.coffee.amount ?? null)}
          />
          <Row
            dot={printAmount !== null ? "bg-[#1D9F4C]" : "bg-[#C9CFCB]"}
            label="프린트"
            sub={printAmount !== null ? month?.print.range ?? "" : month?.print.note ?? "정산본을 아직 못 받았어요"}
            value={printLabel}
            valueTone={printAmount !== null ? "ink" : "muted"}
          />
        </RowList>

        {hasFixedCost ? (
          <div className="mt-4 rounded-[18px] bg-[#F7F8F9] px-4 py-3.5">
            <ProfitRow
              fixedCost={fixedCost}
              note={period === "2026-10" ? copy.octoberNote : undefined}
              previousNet={previousProfit?.net ?? null}
              profit={profit ?? null}
            />
          </div>
        ) : (
          <p className="mt-4 rounded-[18px] bg-[#F7F8F9] px-4 py-3.5 text-[11.5px] leading-[1.6] text-[#8B948D]">
            월 고정비가 아직 등록되지 않아 예상 순수익은 계산하지 않았어요. 본사 화면에서 고정비를 넣으면 여기에 표시돼요.
          </p>
        )}

        {copy.alert ? (
          <p className="mt-3 rounded-[14px] bg-[#FFF8E6] px-3.5 py-2.5 text-[11px] leading-[1.55] text-[#3B4740]">
            {copy.alert}
          </p>
        ) : null}
      </Card>

      {/* ② 흐름 */}
      <Card className="min-w-0">
        <CardHead
          right={<Chip tone={pulseChip.tone}>{pulseChip.label}</Chip>}
          sub="탭을 눌러 일간·주간·월간을 봐요"
          title="매출 흐름"
        />
        <CardBody className="pt-3">
          <SalesPulseTabs month={month} pulse={pulse} />
        </CardBody>
      </Card>

      {/* ③ 아직 없는 것 — 0으로 채우지 않고 이유를 적는다 */}
      <Card>
        <CardHead right={<Chip tone="gray">{copy.cardChip}</Chip>} sub={copy.cardSub} title={copy.cardTitle} />
        <CardBody className="pt-2">
          <ul className="space-y-2 text-[11.5px] leading-[1.6] text-[#3B4740]">
            {copy.items.map((item) => (
              <li key={item.title} className="rounded-[14px] bg-[#F7F8F9] px-3.5 py-3">
                <span className="font-bold">{item.title}</span> — {item.body}
              </li>
            ))}
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
        {store.label} 단독 · 매출은 {copy.source} 실측 · 재고·프린트는 수집 전 · 내부용
      </p>
    </div>
  );
}
