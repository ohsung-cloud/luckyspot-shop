"use client";

/**
 * 본사 내부 화면 공통 탭.
 * `/sales-report` · `/auto-order` · `/admin/stores` 사이를 한 손으로 오간다.
 * 모바일 390px에서 3칸이 각각 44px 이상 터치 영역을 갖도록 만들었다.
 */

const LINKS = [
  { href: "/sales-report", label: "매출 리포트" },
  { href: "/auto-order", label: "자동발주" },
  { href: "/admin/stores", label: "매장·어드민" },
] as const;

export type HqTabKey = (typeof LINKS)[number]["href"];

export default function HqTabs({ active }: { active: HqTabKey }) {
  return (
    <nav aria-label="본사 화면" className="grid grid-cols-3 gap-1">
      {LINKS.map((link) => {
        const on = link.href === active;

        return (
          <a
            key={link.href}
            aria-current={on ? "page" : undefined}
            className={`flex h-11 items-center justify-center rounded-[12px] text-[12.5px] font-bold transition-colors ${
              on
                ? "bg-[#0F1412] text-white"
                : "bg-white text-[#3B4740] shadow-[0_1px_0_rgba(15,20,18,0.04)]"
            }`}
            href={link.href}
          >
            {link.label}
          </a>
        );
      })}
    </nav>
  );
}
