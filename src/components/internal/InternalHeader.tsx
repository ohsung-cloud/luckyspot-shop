import type { ReactNode } from "react";

/**
 * 본사 내부 화면 공통 상단 바.
 *
 * 토스 앱처럼 흰 바탕 + 굵은 제목 + 오른쪽 액션 하나.
 * 브랜드 표식은 잉크 사각형 안의 네온 그린 'L' 하나로 줄인다.
 * 검색 비노출(noindex)은 각 페이지 metadata가 담당하므로 화면에는 내부용 표시를 작게만 둔다.
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
    <header className="border-b border-[#EBEEF0] bg-white">
      <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <a className="flex min-h-11 min-w-0 items-center gap-2.5" href="/">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-[#0F1412] text-[15px] font-bold leading-none text-[#1DFF26]"
          >
            L
          </span>
          <span className="min-w-0 leading-none">
            <span className="block text-[9.5px] font-bold tracking-[0.18em] text-[#0B5C2A]">LUCKY SPOT</span>
            <span className="mt-1 block truncate text-[15.5px] font-bold tracking-[-0.015em] text-[#0F1412]">
              {subtitle}
            </span>
          </span>
        </a>

        {children ?? (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="hidden rounded-full bg-[#F2F4F6] px-2.5 py-1 text-[10.5px] font-bold text-[#98A29B] sm:inline">
              내부용
            </span>
            {action ? (
              <a
                className="flex h-10 items-center rounded-full bg-[#0F1412] px-3.5 text-[12.5px] font-bold text-white"
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
