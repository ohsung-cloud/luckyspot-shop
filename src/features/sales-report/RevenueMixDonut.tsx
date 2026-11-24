import { formatWon, type MonthlySummary } from "./monthly";

/**
 * 매출 비중 도넛 — 선택한 달의 커피(로얄선즈) vs 프린트(에스칼프린트).
 *
 * 두 사업자의 집계 기간이 다르다(커피: 달력월, 프린트: 전월 26일~당월 25일 정산).
 * 그래서 비중은 '확인된 금액'만으로 계산하고, 없는 쪽은 회색으로 비워 둔 뒤 이유를 적는다.
 * (예: 11월 프린트는 26일 정산 전 → 커피 100%로 보이지 않게 별도 표기)
 */

/**
 * 히어로 카드용 미니 도넛 — 매출 숫자 옆에 붙여 세로 길이를 늘이지 않는다.
 *
 * 큰 원(RevenueMixDonut)은 [월간] 탭에서 범례·근거와 함께 그대로 보여 주고,
 * 첫 화면에는 "지금 커피·프린트 비중이 이렇게 생겼다"는 그림만 60px로 둔다.
 * 비중(%)은 바로 위 칩에 숫자로 적히므로 원 안에는 달 이름만 넣는다.
 */
export function RevenueMixMini({
  month,
  size = 60,
  tone = "light",
}: {
  month: MonthlySummary | null;
  size?: number;
  /** dark = 검은 히어로 카드 위, light = 흰 카드 위 */
  tone?: "dark" | "light";
}) {
  if (!month) return null;

  const coffee = month.coffee.amount;
  const print = month.print.amount;
  const known = (coffee ?? 0) + (print ?? 0);
  if (known <= 0) return null;

  const coffeePct = coffee ? (coffee / known) * 100 : 0;
  const printPct = print ? (print / known) * 100 : 0;

  const R = 45;
  const CIRC = 2 * Math.PI * R;
  const GAP = 2.4;

  const track = tone === "dark" ? "#2A332E" : "#EFF1F0";
  const coffeeColor = tone === "dark" ? "#FFFFFF" : "#0F1412";
  const printColor = tone === "dark" ? "#1DFF26" : "#1D9F4C";

  return (
    <div
      aria-label={`${month.monthLabel} 매출 비중 — 커피 ${Math.round(coffeePct)}%, 프린트 ${print ? `${Math.round(printPct)}%` : "정산 전"}`}
      className="relative shrink-0"
      data-testid="revenue-mix-mini"
      role="img"
      style={{ height: size, width: size }}
    >
      <svg aria-hidden className="size-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" fill="none" r={R} stroke={track} strokeWidth="13" />
        {coffee ? (
          <circle
            cx="60"
            cy="60"
            fill="none"
            r={R}
            stroke={coffeeColor}
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
            stroke={printColor}
            strokeDasharray={`${Math.max(0, (printPct / 100) * CIRC - GAP)} ${CIRC}`}
            strokeDashoffset={-((coffeePct / 100) * CIRC)}
            strokeWidth="13"
          />
        ) : null}
      </svg>

      <span className="pointer-events-none absolute inset-0 grid place-items-center text-center leading-none">
        <span className="block">
          {print ? (
            <>
              <span className={`block text-[7.5px] font-bold ${tone === "dark" ? "text-white" : "text-[#0F1412]"}`}>
                커피 {Math.round(coffeePct)}%
              </span>
              <span className={`mt-[2px] block text-[7.5px] font-bold ${tone === "dark" ? "text-[#1DFF26]" : "text-[#0B5C2A]"}`}>
                프린트 {Math.round(printPct)}%
              </span>
            </>
          ) : (
            <span className="block text-[7.5px] font-bold text-[#E8C97A]">부분</span>
          )}
        </span>
      </span>
    </div>
  );
}

export function RevenueMixDonut({ month, compact = false }: { month: MonthlySummary | null; compact?: boolean }) {
  if (!month) {
    return (
      <p className="mt-2 rounded-[12px] bg-[#F8F9F9] px-3 py-3 text-[12px] leading-[1.6] text-[#6B746D]">
        이 지점은 아직 수집된 매출이 없어요. 포털을 연결하고 처음 수집되면 여기에 보여요.
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
      <div className={`mt-2 flex items-center ${compact ? "gap-3" : "gap-4"}`}>
        <div className={`relative shrink-0 ${compact ? "size-[96px]" : "size-[124px]"}`}>
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
              <p className={`font-semibold text-[#98A29B] ${compact ? "text-[8px]" : "text-[9.5px]"}`}>
                {month.monthLabel} 합계
              </p>
              <p className={`mt-0.5 font-bold leading-none tabular-nums text-[#0F1412] ${compact ? "text-[9px]" : "text-[12px]"}`}>
                {formatWon(month.total)}
              </p>
              {month.partial ? (
                <p className={`text-[#8A5A00] ${compact ? "mt-0.5 text-[7.5px]" : "mt-1 text-[9px] font-medium"}`}>부분 집계</p>
              ) : null}
            </div>
          </div>
        </div>

        <ul className={`min-w-0 flex-1 ${compact ? "space-y-1.5" : "space-y-2.5"}`}>
          <li>
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[#0F1412]" />
              <span className={`font-bold text-[#0F1412] ${compact ? "text-[11px]" : "text-[12px]"}`}>커피</span>
              <span className={`ml-auto shrink-0 font-bold tabular-nums text-[#0F1412] ${compact ? "text-[13px]" : "text-[15px]"}`}>
                {coffee ? `${Math.round(coffeePct)}%` : "미집계"}
              </span>
            </div>
            <p className={`pl-4 font-semibold tabular-nums text-[#3B4740] ${compact ? "text-[10.5px]" : "text-[12px]"}`}>{formatWon(coffee)}</p>
            <p className={`pl-4 text-[#98A29B] ${compact ? "text-[8.5px]" : "text-[10px]"}`}>{month.coffee.range} · {month.coffee.source}</p>
          </li>
          <li>
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[#1D9F4C]" />
              <span className={`font-bold text-[#0F1412] ${compact ? "text-[11px]" : "text-[12px]"}`}>프린트</span>
              <span className={`ml-auto shrink-0 font-bold tabular-nums text-[#0F1412] ${compact ? "text-[13px]" : "text-[15px]"}`}>
                {print ? `${Math.round(printPct)}%` : month.print.status === "pending" ? "정산 전" : "미집계"}
              </span>
            </div>
            <p className={`pl-4 font-semibold tabular-nums text-[#3B4740] ${compact ? "text-[10.5px]" : "text-[12px]"}`}>{formatWon(print)}</p>
            <p className={`pl-4 text-[#98A29B] ${compact ? "text-[8.5px]" : "text-[10px]"}`}>{month.print.range} · {month.print.source}</p>
          </li>
        </ul>
      </div>

      <p className={`rounded-[14px] bg-[#F7F8F9] px-3 text-[#8B948D] ${compact ? "mt-2 py-2 text-[9.5px] leading-[1.5]" : "mt-3 py-2.5 text-[10.5px] leading-[1.6]"}`}>{month.note}</p>
    </div>
  );
}
