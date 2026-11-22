"use client";

type QuantityStepperProps = {
  quantity: number;
  onChange: (quantity: number) => void;
  /** 화면 낭독기용 품목 이름 */
  label: string;
  size?: "sm" | "md";
  /** 허용 범위 — 원두는 1~3박스, 나머지는 1~999개 */
  min?: number;
  max?: number;
};

export default function QuantityStepper({
  quantity,
  onChange,
  label,
  size = "sm",
  min = 1,
  max = 999,
}: QuantityStepperProps) {
  const dimension = size === "md" ? "h-12 w-12" : "h-11 w-11";

  return (
    <div className="flex items-center justify-between gap-1 rounded-full border-2 border-[var(--ls-line-strong)] bg-white p-1">
      <button
        aria-label={`${label} 수량 줄이기`}
        className={`${dimension} ls-focus grid place-items-center rounded-full text-[#0F1412] transition-colors hover:bg-[#F0F2F1] disabled:text-[#A9B4AC]`}
        disabled={quantity <= min}
        onClick={() => onChange(quantity - 1)}
        type="button"
      >
        <svg aria-hidden height="16" viewBox="0 0 14 14" width="16">
          <path d="M2 7h10" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </svg>
      </button>
      <span
        aria-live="polite"
        className="min-w-[30px] text-center text-[17px] font-bold tabular-nums text-[#0F1412]"
      >
        {quantity}
      </span>
      <button
        aria-label={`${label} 수량 늘리기`}
        className={`${dimension} ls-focus grid place-items-center rounded-full bg-[#0F1412] text-[#1DFF26] transition-colors hover:bg-[#1B241F] disabled:bg-[#D5DAD7] disabled:text-[#5F6A63]`}
        disabled={quantity >= max}
        onClick={() => onChange(quantity + 1)}
        type="button"
      >
        <svg aria-hidden height="16" viewBox="0 0 14 14" width="16">
          <path
            d="M7 2v10M2 7h10"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      </button>
    </div>
  );
}
