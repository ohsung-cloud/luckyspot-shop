import type { ReactNode } from "react";

/**
 * 본사 내부 화면 공통 상단 바.
 * 모바일에서 44px 높이의 홈 링크와 액션 하나만 둔다(검색 비노출 표시 포함).
 */
export default function InternalHeader({
  subtitle,
  action,
  children,
}: {
  subtitle: string;
  action?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <header className="bg-[#0F1412]">
      <div className="mx-auto flex w-full max-w-[760px] items-center justify-between px-4 py-3.5 sm:px-6">
        <a className="flex min-h-11 items-center gap-2.5" href="/">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-[8px] bg-[#1DFF26] text-[13px] font-bold leading-none text-[#0F1412]"
          >
            L
          </span>
          <div className="leading-none">
            <p className="text-[13px] font-semibold tracking-[0.2em] text-white">LUCKY SPOT</p>
            <p className="mt-1 text-[10px] font-medium tracking-[0.14em] text-[#9AA39C]">{subtitle}</p>
          </div>
        </a>

        {children ?? (
          <div className="flex items-center gap-1.5">
            <span className="hidden rounded-full border border-[#2C3730] px-2.5 py-1 text-[10.5px] font-semibold text-[#9AA39C] sm:inline">
              내부 · noindex
            </span>
            {action ? (
              <a
                className="flex h-9 items-center rounded-full bg-[#1DFF26] px-3 text-[12.5px] font-bold text-[#0F1412]"
                href={action.href}
              >
                {action.label}
              </a>
            ) : null}
          </div>
        )}
      </div>
    </header>
  );
}
