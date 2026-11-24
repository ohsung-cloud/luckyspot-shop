import type { ReactNode } from "react";

/**
 * 내부 화면(매출 리포트 · 점주 어드민 · 자동발주) 공용 카드 조각.
 *
 * 토스 앱의 카드 방식을 브랜드 폰트·컬러 위에 얹는다.
 *  - 회색 바탕(#F4F5F6) 위에 흰 카드 하나(24px 라운드, 테두리 없이 옅은 그림자).
 *  - 카드 안은 한 줄 위계: 왼쪽 라벨 + 짧은 설명 / 오른쪽 굵은 숫자·상태 칩.
 *  - 강조는 네온 그린(#1DFF26)과 잉크 블랙(#0F1412)만 쓴다. 토스 블루·토스 폰트는 쓰지 않는다.
 */

export type ChipTone = "ink" | "brand" | "green" | "amber" | "red" | "gray" | "blue" | "white";

const CHIP_TONE: Record<ChipTone, string> = {
  ink: "bg-[#0F1412] text-[#1DFF26]",
  brand: "bg-[#1DFF26] text-[#0F1412]",
  green: "bg-[#EDFBEF] text-[#0B5C2A]",
  amber: "bg-[#FFF6E0] text-[#8A5A00]",
  red: "bg-[#FFF2F2] text-[#B3261E]",
  gray: "bg-[#F2F4F6] text-[#6B746D]",
  blue: "bg-[#EEF2FF] text-[#243B8F]",
  white: "bg-white text-[#3B4740] shadow-[0_1px_3px_rgba(15,20,18,0.10)]",
};

export function Chip({
  children,
  tone = "gray",
  className = "",
}: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold leading-none ${CHIP_TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-[24px] bg-white shadow-[0_1px_2px_rgba(15,20,18,0.04)] ${className}`}>
      {children}
    </section>
  );
}

export function CardHead({
  title,
  sub,
  right,
  className = "",
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 px-5 pt-5 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-[16px] font-bold leading-[1.35] tracking-[-0.015em] text-[#0F1412]">{title}</h2>
        {sub ? <p className="mt-1 text-[12px] font-medium leading-[1.5] text-[#8B948D]">{sub}</p> : null}
      </div>
      {right ? <div className="shrink-0 pt-0.5">{right}</div> : null}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>;
}

export function RowList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-[#F1F3F2] ${className}`}>{children}</div>;
}

const VALUE_TONE = {
  ink: "text-[#0F1412]",
  green: "text-[#0B5C2A]",
  amber: "text-[#8A5A00]",
  red: "text-[#B3261E]",
  muted: "text-[#98A29B]",
} as const;

export function Row({
  label,
  sub,
  value,
  valueSub,
  valueTone = "ink",
  dot,
  chip,
  chipTone = "gray",
  trailing,
  href,
  onClick,
  className = "",
}: {
  label: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  valueSub?: ReactNode;
  valueTone?: keyof typeof VALUE_TONE;
  /** 왼쪽 작은 색 점 (예: "bg-[#0F1412]") */
  dot?: string;
  chip?: ReactNode;
  chipTone?: ChipTone;
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const content = (
    <>
      {dot ? <span aria-hidden className={`size-2 shrink-0 rounded-full ${dot}`} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold leading-[1.35] text-[#0F1412]">{label}</span>
        {sub ? (
          <span className="mt-0.5 block truncate text-[11.5px] font-medium leading-[1.45] text-[#8B948D]">{sub}</span>
        ) : null}
      </span>
      {value !== undefined ? (
        <span className="shrink-0 text-right">
          <span className={`block text-[17px] font-bold leading-[1.25] tabular-nums tracking-[-0.02em] ${VALUE_TONE[valueTone]}`}>
            {value}
          </span>
          {valueSub ? (
            <span className="mt-0.5 block text-[10.5px] font-semibold leading-none text-[#98A29B]">{valueSub}</span>
          ) : null}
        </span>
      ) : null}
      {chip ? <Chip tone={chipTone}>{chip}</Chip> : null}
      {trailing}
    </>
  );

  const classes = `flex min-h-[52px] w-full items-center gap-2.5 py-3 text-left ${className}`;

  if (href) {
    return (
      <a className={classes} href={href}>
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button className={classes} onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}

/** 카드 하단의 꽉 찬 기본 버튼 (브랜드 네온 그린) */
export const CTA =
  "flex h-[56px] w-full items-center justify-center rounded-[16px] bg-[#1DFF26] text-[16px] font-bold tracking-[-0.01em] text-[#0F1412] transition-colors hover:bg-[#3BE93F] disabled:opacity-50";

/** 보조 버튼 (잉크) */
export const CTA_INK =
  "flex h-[52px] w-full items-center justify-center rounded-[16px] bg-[#0F1412] text-[15px] font-bold text-white transition-colors hover:bg-[#232B26] disabled:opacity-50";

/** 목록 안에서 쓰는 작은 회색 버튼 */
export const QUIET_BUTTON =
  "flex h-9 shrink-0 items-center justify-center rounded-full bg-[#F2F4F6] px-3 text-[11.5px] font-bold text-[#3B4740] transition-colors hover:bg-[#E9ECEB] disabled:opacity-50";

/** 카드 안 구분선 */
export const HAIRLINE = "border-t border-[#F1F3F2]";

/** 접이식 카드의 summary 한 줄 */
export const SUMMARY_ROW =
  "flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden";
