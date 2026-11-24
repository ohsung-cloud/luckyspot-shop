import { Card, CardBody, CardHead, Chip, RowList } from "@/components/internal/card-ui";

import { days, manwon, won } from "./format";
import { formatWon, monthlyForStore, type MonthlyPeriod } from "./monthly";
import type { SalesReportSnapshot } from "./types";
import { STORES_WITH_SNAPSHOT } from "./stores";

/**
 * 두 지점을 **나란히** 놓고 보는 화면 — 토스식 카드 두 장 + 항목별 한 줄 비교.
 *
 * 여기에는 더하기가 없다. 매출·재고 어디에도 두 지점을 합친 숫자를 만들지 않고,
 * 같은 항목끼리 좌우로 비교만 한다(사용자 지시: 합산 금지).
 */

/** 스냅샷 날짜(11/23) — '오늘' 대신 실제 수집일을 적어 하루 지난 값을 오늘로 읽지 않게 한다. */
function shortDate(iso: string) {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function metrics(snapshot: SalesReportSnapshot, period: MonthlyPeriod) {
  const month = monthlyForStore(snapshot.storeCode, period);
  const day = shortDate(snapshot.today);
  const bean = snapshot.bean;
  const stockEmpty = snapshot.stock.filter((item) => item.status === "empty");
  const toner = [snapshot.print.toner.k, snapshot.print.toner.c, snapshot.print.toner.m, snapshot.print.toner.y];

  return [
    {
      key: `커피 ${day}`,
      value: won(snapshot.revenue.coffee.today),
      hint: `${bean.coffeeDrinks}잔 · 전일 ${won(snapshot.revenue.coffee.yesterday)}`,
    },
    {
      key: `커피 ${month?.monthLabel ?? "월"}`,
      value: formatWon(month?.coffee.amount ?? null),
      hint: month
        ? `${month.coffee.range} · ${
            month.coffee.orders
              ? `${month.coffee.orders.toLocaleString("ko-KR")}건`
              : month.coffee.status === "live"
                ? "실시간"
                : "미수집"
          }`
        : "수집 전",
    },
    {
      key: `프린트 ${month?.monthLabel ?? "월"}`,
      value: formatWon(month?.print.amount ?? null),
      hint: month
        ? `${month.print.range} · ${
            month.print.status === "pending" ? "26일 정산 전" : month.print.status === "missing" ? "미수집" : "정산 확정"
          }`
        : "수집 전",
    },
    {
      key: "프린트 누적",
      value: `${snapshot.print.cumulativePrintCount.toLocaleString("ko-KR")}매`,
      hint: `토너 평균 ${snapshot.print.tonerAvgPct}%`,
    },
    {
      key: "토너 최저",
      value: `${Math.min(...toner)}%`,
      hint: `K ${snapshot.print.toner.k} · C ${snapshot.print.toner.c} · M ${snapshot.print.toner.m} · Y ${snapshot.print.toner.y}`,
    },
    { key: "용지", value: `Tray1 ${snapshot.print.paper.tray1}%`, hint: `Tray2 ${snapshot.print.paper.tray2}%` },
    {
      key: "원두 잔여",
      value: `${snapshot.bean.stockPct}%`,
      hint: `${Math.round(snapshot.bean.stockGrams ?? 0).toLocaleString("ko-KR")}g · ${days(snapshot.bean.daysLeftWithBurst)}`,
    },
    {
      key: `${day} 원두 소모`,
      value: `${snapshot.bean.dailyGrams}g`,
      hint: `${snapshot.bean.coffeeDrinks}잔 · 잔당 ${snapshot.bean.avgGramsPerDrink}g`,
    },
    {
      key: "재고 0% 칸",
      value: `${stockEmpty.length}칸`,
      hint: stockEmpty.map((item) => item.material).join(" · ") || "없음",
    },
    { key: "누적 커피 매출", value: manwon(snapshot.revenue.coffee.cumulativeTotal) + "원", hint: "개점 이후" },
  ];
}

export function StoreCompare({ period }: { period: MonthlyPeriod }) {
  // 재고·토너 스냅샷이 있는 지점만 나란히 놓는다 — 평택점은 매출 탭에서 본다(0으로 채우지 않음).
  const columns = STORES_WITH_SNAPSHOT.map((store) => ({ store, rows: metrics(store.snapshot, period) }));
  const keys = columns[0].rows.map((row) => row.key);

  return (
    <div className="grid gap-3">
      <div className="px-1">
        <h1 className="text-[23px] font-bold leading-[1.25] tracking-[-0.03em] text-[#0F1412]">
          두 지점을 같은 항목으로
          <br />
          나란히 봐요
        </h1>
        <p className="mt-2 text-[12px] font-medium leading-[1.6] text-[#8B948D]">
          재고 스냅샷이 있는 두 지점이에요. 두 지점을 더한 값은 이 화면 어디에도 없어요. 평택점은 재고 스냅샷이 들어오면
          여기에 함께 놓여요.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Chip tone="ink">합산하지 않음</Chip>
          <Chip tone="gray">{period === "2026-11" ? "11월" : "10월"}</Chip>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {columns.map(({ store, rows }) => (
          <Card key={store.id}>
            <CardHead
              right={<span className="text-[10.5px] font-semibold text-[#A7AFA9]">{store.region}</span>}
              sub={store.tagline}
              title={store.label}
            />
            <CardBody className="pt-2">
              <RowList>
                {rows.slice(0, 4).map((row) => (
                  <ComparisonCardRow key={row.key} hint={row.hint} label={row.key} value={row.value} />
                ))}
              </RowList>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHead
          right={<span className="text-[10.5px] font-semibold text-[#A7AFA9]">단위는 각 지점 실측</span>}
          sub="왼쪽은 항목, 오른쪽 두 칸은 지점별 값이에요"
          title="항목별 비교"
        />

        <CardBody className="pt-2">
          <div className="grid grid-cols-[84px_1fr_1fr] items-end gap-x-2 border-b border-[#F1F3F2] pb-2 sm:grid-cols-[120px_1fr_1fr]">
            <span className="text-[10px] font-bold text-[#A7AFA9]">항목</span>
            {columns.map(({ store }) => (
              <span key={store.id} className="truncate text-right text-[10px] font-bold text-[#6B746D]">
                {store.shortLabel}
              </span>
            ))}
          </div>

          {keys.map((key) => (
            <div key={key} className="grid grid-cols-[84px_1fr_1fr] items-start gap-x-2 border-b border-[#F6F7F7] py-2.5 last:border-b-0 sm:grid-cols-[120px_1fr_1fr]">
              <span className="min-w-0 text-[11.5px] font-semibold leading-[1.4] text-[#3B4740]">{key}</span>
              {columns.map(({ store, rows }) => {
                const row = rows.find((entry) => entry.key === key);

                return (
                  <span key={store.id} className="min-w-0 text-right">
                    <span className="block truncate text-[12.5px] font-bold tabular-nums text-[#0F1412]">
                      {row?.value ?? "—"}
                    </span>
                    <span className="mt-0.5 block truncate text-[9.5px] leading-[1.4] text-[#A7AFA9]">{row?.hint ?? ""}</span>
                  </span>
                );
              })}
            </div>
          ))}

          <p className="mt-3 rounded-[14px] bg-[#F7F8F9] px-3.5 py-2.5 text-[10.5px] leading-[1.65] text-[#8B948D]">
            합계 줄은 두지 않았어요. 한 지점이 하루 커피 20잔 규모이고 다른 지점이 60잔 규모라 더한 값은 어느 쪽 판단에도 쓰이지
            않아요. 발주·재고는 지점 탭에서 각각 확인해 주세요.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function ComparisonCardRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold text-[#3B4740]">{label}</span>
        <span className="mt-0.5 block truncate text-[10px] leading-[1.4] text-[#A7AFA9]">{hint}</span>
      </span>
      <span className="shrink-0 text-[15px] font-bold tabular-nums tracking-[-0.02em] text-[#0F1412]">{value}</span>
    </div>
  );
}
