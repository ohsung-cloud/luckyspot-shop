"use client";

type QuantityStepperProps = {
  quantity: number;
  onChange: (quantity: number) => void;
  /** 화면 낭독기용 품목 이름 */
  label: string;
  size?: "sm" | "md";
};

export default function QuantityStepper({
  quantity,
  onChange,
  label,
  size = "sm",
}: QuantityStepperProps) {
  const dimension = size === "md" ? "h-10 w-10" : "h-9 w-9";

  return (
    <div className="flex items-center justify-between gap-1 rounded-full border border-[var(--ls-line-strong)] bg-white p-1">
      <button
        aria-label={`${label} 수량 줄이기`}
        className={`${dimension} ls-focus grid place-items-center rounded-full text-[#0F1412] transition-colors hover:bg-[#F0F2F1] disabled:text-[#C3C9C4]`}
        disabled={quantity <= 1}
        onClick={() => onChange(quantity - 1)}
        type="button"
      >
        <svg aria-hidden height="14" viewBox="0 0 14 14" width="14">
          <path d="M2 7h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      </button>
      <span
        aria-live="polite"
        className="min-w-[22px] text-center text-[14px] font-semibold tabular-nums text-[#0F1412]"
      >
        {quantity}
      </span>
      <button
        aria-label={`${label} 수량 늘리기`}
        className={`${dimension} ls-focus grid place-items-center rounded-full bg-[#0F1412] text-[#1DFF26] transition-colors hover:bg-[#1B241F]`}
        onClick={() => onChange(quantity + 1)}
        type="button"
      >
        <svg aria-hidden height="14" viewBox="0 0 14 14" width="14">
          <path
            d="M7 2v10M2 7h10"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>
    </div>
  );
}
