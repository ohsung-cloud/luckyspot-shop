import { formatWon } from "./monthly";
import { FIXED_COST_LABELS, type ProfitEstimate } from "./profit";

/**
 * 매출 히어로 카드 안의 '예상 순수익' — 한 줄 요약 + 탭하면 내역.
 *
 * 심플 이즈 베스트
 *  - 기본 화면에는 한 줄만 둔다(매출 숫자를 가리지 않게).
 *  - 탭하면 커피 원가·프린트 변동비·고정비·순수익이 순서대로 펼쳐진다.
 *  - 지점 합산은 없다. 이 카드는 지점 하나의 월 요약만 받는다.
 */

export function ProfitRow({
  profit,
  fixedCost,
  note,
}: {
  profit: ProfitEstimate | null;
  fixedCost?: { rent: number; maintenance: number; internet: number; solution: number } | null;
  note?: string;
}) {
  if (!profit) {
    return (
      <p className="mt-2.5 rounded-[10px] bg-white/8 px-2.5 py-2 text-[10.5px] text-[#9AA39C]">
        예상 순수익 — 이 달 매출이 아직 없습니다.
      </p>
    );
  }

  const margin = profit.marginRate === null ? "—" : `${profit.marginRate.toFixed(1)}%`;
  // 월 고정비가 비어 있으면 이 순수익은 고정비를 빼기 전 값이다 — 마진율을 그대로 보여 주면 실제보다 좋아 보인다.
  const hasFixedCost = (fixedCost?.rent ?? 0) + (fixedCost?.maintenance ?? 0) + (fixedCost?.internet ?? 0) + (fixedCost?.solution ?? 0) > 0;
  const fixedText = FIXED_COST_LABELS.filter((item) => (fixedCost?.[item.key] ?? 0) > 0)
    .map((item) => `${item.label} ${Math.round((fixedCost?.[item.key] ?? 0) / 10_000).toLocaleString("ko-KR")}만`)
    .join(" · ");

  return (
    <details className="mt-2.5 rounded-[10px] bg-white/8 px-2.5 py-1.5">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-[11.5px]">
        <span className="truncate text-[#C8D0CA]">
          {profit.monthLabel} 예상 순수익{hasFixedCost ? "" : "(고정비 전)"}{" "}
          <span className="font-bold tabular-nums text-[#1DFF26]">{formatWon(profit.net)}</span>
        </span>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ${
            hasFixedCost ? "bg-[#1DFF26] text-[#0F1412]" : "bg-[#EFC94C] text-[#0F1412]"
          }`}
        >
          {hasFixedCost ? `마진 ${margin}` : "고정비 미등록"}
        </span>
      </summary>

      <div className="mt-1.5 space-y-1 border-t border-white/10 pt-1.5">
        {profit.lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-2 text-[10px]">
            <span className={`min-w-0 truncate ${line.tone === "total" ? "font-bold text-white" : "text-[#C8D0CA]"}`}>
              {line.label}
              {line.note ? <span className="ml-1 text-[9px] text-[#8A948C]">{line.note}</span> : null}
            </span>
            <span
              className={`shrink-0 font-bold tabular-nums ${
                line.tone === "total" ? "text-[#1DFF26]" : line.tone === "minus" ? "text-[#FFB4A8]" : "text-white"
              }`}
            >
              {line.amount === null ? "—" : `${line.amount < 0 ? "−" : ""}${formatWon(Math.abs(line.amount))}`}
            </span>
          </div>
        ))}

        <p className="pt-0.5 text-[9px] leading-[1.6] text-[#8A948C]">
          {profit.note} 커피 원가 {(15.8).toFixed(1)}% · 프린트 변동비·로열티 28% 기준.
        </p>
        {fixedText ? <p className="text-[9px] leading-[1.6] text-[#8A948C]">월 고정비 {fixedText}</p> : null}
        {note ? <p className="text-[9px] leading-[1.6] text-[#8A948C]">{note}</p> : null}
      </div>
    </details>
  );
}
