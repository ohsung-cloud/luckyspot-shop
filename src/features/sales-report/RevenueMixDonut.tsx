import { formatWon, type MonthlySummary } from "./monthly";

/**
 * 매출 비중 도넛 — 선택한 달의 커피(로얄선즈) vs 프린트(에스칼프린트).
 *
 * 두 사업자의 집계 기간이 다르다(커피: 달력월, 프린트: 전월 26일~당월 25일 정산).
 * 그래서 비중은 '확인된 금액'만으로 계산하고, 없는 쪽은 회색으로 비워 둔 뒤 이유를 적는다.
 * (예: 11월 프린트는 26일 정산 전 → 커피 100%로 보이지 않게 별도 표기)
 */

export function RevenueMixDonut({ month }: { month: MonthlySummary | null }) {
  if (!month) {
    return (
      <p className="mt-2 rounded-[12px] bg-[#F8F9F9] px-3 py-3 text-[12px] leading-[1.6] text-[#6B746D]">
        이 지점은 아직 수집된 매출이 없습니다. 포털 연동 후 첫 수집부터 표시됩니다.
      </p>
    );
  }

  const coffee = month.coffee.amount;
  const print = month.print.amount;
  const known = (coffee ?? 0) + (print ?? 0);
  const safe = known || 1;
  const coffeePct = coffee ? (coffee / safe) * 100 : 0;
  const printPct = print ? (print / safe) * 100 : 0;

  const R = 45;
  const CIRC = 2 * Math.PI * R;
  const GAP = 2.4;

  return (
    <div>
      <div className="mt-2 flex items-center gap-4">
        <div className="relative size-[124px] shrink-0">
          <svg
            aria-label={`매출 비중 — 커피 ${Math.round(coffeePct)}%, 프린트 ${Math.round(printPct)}%`}
            className="size-full -rotate-90"
            role="img"
            viewBox="0 0 120 120"
          >
            <circle cx="60" cy="60" fill="none" r={R} stroke="#EFF1F0" strokeWidth="13" />
            {coffee ? (
              <circle
                cx="60"
                cy="60"
                fill="none"
                r={R}
                stroke="#0F1412"
                strokeDasharray={`${Math.max(0, (coffeePct / 100) * CIRC - GAP)} ${CIRC}`}
                strokeWidth="13"
              />
            ) : null}
            {print ? (
              <circle
                cx="60"
                cy="60"
                fill="none"
                r={R}
                stroke="#1D9F4C"
                strokeDasharray={`${Math.max(0, (printPct / 100) * CIRC - GAP)} ${CIRC}`}
                strokeDashoffset={-((coffeePct / 100) * CIRC)}
                strokeWidth="13"
              />
            ) : null}
          </svg>

          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-[9.5px] font-semibold text-[#98A29B]">{month.monthLabel} 합계</p>
              <p className="mt-0.5 text-[12px] font-bold leading-none tabular-nums text-[#0F1412]">
                {formatWon(month.total)}
              </p>
              {month.partial ? <p className="mt-1 text-[9px] font-medium text-[#8A5A00]">부분 집계</p> : null}
            </div>
          </div>
        </div>

        <ul className="min-w-0 flex-1 space-y-2.5">
          <li>
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[#0F1412]" />
              <span className="text-[12px] font-bold text-[#0F1412]">커피</span>
              <span className="ml-auto shrink-0 text-[15px] font-bold tabular-nums text-[#0F1412]">
                {coffee ? `${Math.round(coffeePct)}%` : "미집계"}
              </span>
            </div>
            <p className="mt-0.5 pl-4 text-[12px] font-semibold tabular-nums text-[#3B4740]">{formatWon(coffee)}</p>
            <p className="pl-4 text-[10px] text-[#98A29B]">{month.coffee.range} · {month.coffee.source}</p>
          </li>
          <li>
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[#1D9F4C]" />
              <span className="text-[12px] font-bold text-[#0F1412]">프린트</span>
              <span className="ml-auto shrink-0 text-[15px] font-bold tabular-nums text-[#0F1412]">
                {print ? `${Math.round(printPct)}%` : month.print.status === "pending" ? "정산 전" : "미집계"}
              </span>
            </div>
            <p className="mt-0.5 pl-4 text-[12px] font-semibold tabular-nums text-[#3B4740]">{formatWon(print)}</p>
            <p className="pl-4 text-[10px] text-[#98A29B]">{month.print.range} · {month.print.source}</p>
          </li>
        </ul>
      </div>

      <p className="mt-2.5 rounded-[10px] bg-[#F8F9F9] px-3 py-2 text-[10.5px] leading-[1.6] text-[#6B746D]">{month.note}</p>
    </div>
  );
}
