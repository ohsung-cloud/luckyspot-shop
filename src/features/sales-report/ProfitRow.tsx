import { Chip } from "@/components/internal/card-ui";

import { formatWon } from "./monthly";
import { FIXED_COST_LABELS, type ProfitEstimate } from "./profit";

/**
 * 매출 카드 안의 '예상 순수익' — 토스식 한 줄 요약 + 탭하면 내역.
 *
 *  - 첫 화면에는 한 줄만 둔다(매출 숫자를 가리지 않게).
 *  - 탭하면 커피 · 프린트 · 고정비 · 순수익이 순서대로 펼쳐진다.
 *  - 지점 합산은 없다. 이 카드는 지점 하나의 월 요약만 받는다.
 *  - 흰 카드 위에 얹는 밝은 톤으로만 쓴다(잉크 글자 · 그린 강조).
 */

export function ProfitRow({
  profit,
  fixedCost,
  note,
  previousNet,
}: {
  profit: ProfitEstimate | null;
  fixedCost?: { rent: number; maintenance: number; internet: number; solution: number } | null;
  note?: string;
  /** 지난달 순수익 — 있으면 아래에 한 줄로만 적는다(비교 주장은 하지 않는다). */
  previousNet?: number | null;
}) {
  if (!profit) {
    return <p className="text-[12.5px] font-medium leading-[1.5] text-[#8B948D]">이 달 매출이 아직 없어 예상 순수익을 계산하지 않았어요.</p>;
  }

  const margin = profit.marginRate === null ? "—" : `${profit.marginRate.toFixed(1)}%`;
  // 월 고정비가 비어 있으면 이 순수익은 고정비를 빼기 전 값이다 — 마진율을 그대로 보여 주면 실제보다 좋아 보인다.
  const hasFixedCost =
    (fixedCost?.rent ?? 0) + (fixedCost?.maintenance ?? 0) + (fixedCost?.internet ?? 0) + (fixedCost?.solution ?? 0) > 0;
  const fixedText = FIXED_COST_LABELS.filter((item) => (fixedCost?.[item.key] ?? 0) > 0)
    .map((item) => `${item.label} ${Math.round((fixedCost?.[item.key] ?? 0) / 10_000).toLocaleString("ko-KR")}만`)
    .join(" · ");

  const subline = !hasFixedCost
    ? "월 고정비를 넣으면 실제 순수익이 보여요"
    : profit.partial && profit.prorated
      ? "프린트는 26일 정산 전 · 고정비는 경과일만큼만 뺐어요"
      : profit.partial
        ? "프린트는 26일 정산 전이라 커피만 계산했어요"
        : profit.prorated
          ? "고정비는 오늘까지 며칠치만 뺐어요"
          : "확정된 매출로 계산했어요";

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-bold text-[#3B4740]">{profit.monthLabel} 예상 순수익</span>
            <Chip tone={hasFixedCost ? "green" : "amber"}>{hasFixedCost ? `마진 ${margin}` : "고정비 미등록"}</Chip>
          </span>
          <span className="mt-1 block text-[11.5px] font-medium leading-[1.45] text-[#8B948D]">{subline}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={`text-[22px] font-bold leading-none tabular-nums tracking-[-0.03em] ${profit.net !== null && profit.net < 0 ? "text-[#B3261E]" : "text-[#0B5C2A]"}`}>
            {formatWon(profit.net)}
          </span>
          <span aria-hidden className="text-[15px] font-bold text-[#C2C9C4] transition-transform group-open:rotate-90">
            ›
          </span>
        </span>
      </summary>

      <div className="mt-3 border-t border-[#EDF0EE] pt-3">
        <Row
          label="커피"
          sub={
            profit.coffeeRevenue === null
              ? "이번 달 커피 매출이 아직 없어요"
              : `매출 ${formatWon(profit.coffeeRevenue)}에서 원가 15.8%를 뺐어요`
          }
          value={formatWon(profit.coffeeProfit)}
        />
        <Row
          label="프린트"
          sub={
            profit.printRevenue === null
              ? "26일 정산 전이라 아직 비어 있어요"
              : `매출 ${formatWon(profit.printRevenue)}에서 변동비·로열티 28%를 뺐어요`
          }
          value={formatWon(profit.printProfit)}
          valueTone={profit.printProfit === null ? "muted" : "ink"}
        />
        <Row
          label="월 고정비"
          sub={
            profit.fixedCostTotal <= 0
              ? "등록된 고정비가 없어요"
              : profit.prorated
                ? `${formatWon(profit.fixedCostTotal)} 중 ${Math.round(profit.proratedRatio * 100)}%만 뺐어요`
                : `${formatWon(profit.fixedCostTotal)} 전액을 뺐어요`
          }
          value={profit.fixedCostApplied > 0 ? `−${formatWon(profit.fixedCostApplied)}` : "—"}
          valueTone={profit.fixedCostApplied > 0 ? "red" : "muted"}
        />

        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-[#EDF0EE] pt-3">
          <span className="text-[13.5px] font-bold text-[#0F1412]">예상 순수익</span>
          <span className="text-[18px] font-bold tabular-nums tracking-[-0.02em] text-[#0B5C2A]">{formatWon(profit.net)}</span>
        </div>

        {previousNet !== undefined && previousNet !== null ? (
          <p className="mt-2 text-[11.5px] font-medium text-[#8B948D]">지난달 순수익 {formatWon(previousNet)}</p>
        ) : null}

        <p className="mt-2 text-[10.5px] leading-[1.55] text-[#A7AFA9]">
          커피 원가 15.8% · 프린트 변동비·로열티 28% 기준이에요.
          {fixedText ? ` 월 고정비 ${fixedText}.` : ""}
        </p>
        {note ? <p className="mt-1 text-[10.5px] leading-[1.55] text-[#A7AFA9]">{note}</p> : null}
      </div>
    </details>
  );
}

function Row({
  label,
  sub,
  value,
  valueTone = "ink",
}: {
  label: string;
  sub: string;
  value: string;
  valueTone?: "ink" | "red" | "muted";
}) {
  const tone = {
    ink: "text-[#0F1412]",
    red: "text-[#B3261E]",
    muted: "text-[#98A29B]",
  }[valueTone];

  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-[#3B4740]">{label}</p>
        <p className="mt-0.5 text-[10.5px] leading-[1.45] text-[#A7AFA9]">{sub}</p>
      </div>
      <p className={`shrink-0 text-[13px] font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
