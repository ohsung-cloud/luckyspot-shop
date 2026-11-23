import type { SalesReportSnapshot } from "./types";

type Revenue = SalesReportSnapshot["revenue"];

function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

/**
 * 매출 비중 도넛 — 커피(로얄선즈) vs 프린트(에스칼프린트).
 *
 * 두 숫자의 기간 기준이 다르다(커피: 당월 1일~오늘 누적, 프린트: 직전 청구월 실매출).
 * 비중을 한눈에 보이게 하되, 아래 주석에서 기간 차이와 하루 평균 기준 비중을 함께 밝힌다.
 */
export function RevenueMixDonut({ revenue, today }: { revenue: Revenue; today: string }) {
  const coffee = revenue.coffee;
  const print = revenue.print;

  const total = coffee.month + print.total;
  const safeTotal = total || 1;
  const coffeePct = (coffee.month / safeTotal) * 100;
  const printPct = 100 - coffeePct;

  const [, todayMonth, todayDay] = today.split("-").map(Number);
  const coffeeRange = `${todayMonth}/1~${todayDay}`;
  const printMonthLabel = `${Number(print.month.slice(5, 7))}월`;

  const [printYear, printMonth] = print.month.split("-").map(Number);
  const printDays = new Date(printYear, printMonth, 0).getDate();
  const printDaily = print.total / printDays;
  const dailyTotal = coffee.dailyRate + printDaily || 1;
  const coffeeDailyPct = Math.round((coffee.dailyRate / dailyTotal) * 100);
  const printDailyPct = 100 - coffeeDailyPct;

  const R = 45;
  const CIRC = 2 * Math.PI * R;
  const GAP = 2.4;
  const coffeeArc = Math.max(0, (coffeePct / 100) * CIRC - GAP);
  const printArc = Math.max(0, (printPct / 100) * CIRC - GAP);

  return (
    <div>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative size-[136px] shrink-0 sm:size-[152px]">
          <svg
            viewBox="0 0 120 120"
            className="size-full -rotate-90"
            role="img"
            aria-label={`매출 비중 — 커피 ${coffeePct.toFixed(1)}%, 프린트 ${printPct.toFixed(1)}%`}
          >
            <circle cx="60" cy="60" r={R} fill="none" stroke="#EFF1F0" strokeWidth="13" />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke="#0F1412"
              strokeWidth="13"
              strokeDasharray={`${coffeeArc} ${CIRC}`}
            />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke="#1D9F4C"
              strokeWidth="13"
              strokeDasharray={`${printArc} ${CIRC}`}
              strokeDashoffset={-((coffeePct / 100) * CIRC)}
            />
          </svg>

          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-[10px] font-semibold text-[#98A29B]">합계</p>
              <p className="mt-0.5 text-[12.5px] font-bold leading-none tabular-nums text-[#0F1412]">{won(total)}</p>
              <p className="mt-1 text-[9.5px] font-medium text-[#B0B7B2]">커피 + 프린트</p>
            </div>
          </div>
        </div>

        <ul className="min-w-0 flex-1 space-y-3">
          <li>
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[#0F1412]" />
              <span className="text-[12.5px] font-bold text-[#0F1412]">커피</span>
              <span className="truncate text-[10.5px] text-[#98A29B]">로얄선즈</span>
              <span className="ml-auto shrink-0 text-[18px] font-bold leading-none tabular-nums text-[#0F1412]">
                {coffeePct.toFixed(1)}%
              </span>
            </div>
            <p className="mt-1 pl-4 text-[12.5px] font-semibold tabular-nums text-[#3B4740]">{won(coffee.month)}</p>
            <p className="pl-4 text-[10.5px] text-[#98A29B]">{coffeeRange} 누적</p>
          </li>
          <li>
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[#1D9F4C]" />
              <span className="text-[12.5px] font-bold text-[#0F1412]">프린트</span>
              <span className="truncate text-[10.5px] text-[#98A29B]">에스칼프린트</span>
              <span className="ml-auto shrink-0 text-[18px] font-bold leading-none tabular-nums text-[#0F1412]">
                {printPct.toFixed(1)}%
              </span>
            </div>
            <p className="mt-1 pl-4 text-[12.5px] font-semibold tabular-nums text-[#3B4740]">{won(print.total)}</p>
            <p className="pl-4 text-[10.5px] text-[#98A29B]">{printMonthLabel} 실매출</p>
          </li>
        </ul>
      </div>

      <p className="mt-3.5 rounded-[12px] bg-[#F8F9F9] px-3 py-2.5 text-[11px] leading-[1.65] text-[#6B746D]">
        커피 {coffeeRange} 누적, 프린트 {printMonthLabel} 실매출{print.currentMonthPending ? "(이번 달은 청구 마감 전)" : ""}
        — 기간이 달라 비중은 참고용입니다. 하루 평균으로 맞추면 커피 {coffeeDailyPct}% · 프린트 {printDailyPct}%
        (커피 {won(coffee.dailyRate)} · 프린트 {won(printDaily)})입니다.
      </p>
    </div>
  );
}
