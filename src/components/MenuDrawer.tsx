"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { IconButton } from "@wanteddev/wds";
import { LuckyOutlineButton } from "./LuckyButton";

export type MenuDrawerItem = {
  active?: boolean;
  href: string;
  label: string;
};

export type MenuDrawerProps = {
  activePath?: string;
  ctaHref?: string;
  ctaLabel?: string;
  items?: MenuDrawerItem[];
  open: boolean;
  onClose: () => void;
  phoneLabel?: string;
  phoneNumber?: string;
};

export const DEFAULT_MENU_DRAWER_ITEMS: MenuDrawerItem[] = [
  { href: "/#shop", label: "쇼핑 홈" },
  { href: "/#product", label: "상품 상세" },
  { href: "/#checkout", label: "결제 흐름" },
];

const drawerActionSize = 76;
const drawerActionInnerSize = 44;

const closeButtonSx = {
  width: `${drawerActionSize}px`,
  height: `${drawerActionSize}px`,
  minWidth: `${drawerActionSize}px`,
  minHeight: `${drawerActionSize}px`,
  borderRadius: "0px",
  backgroundColor: "transparent",
  color: "#777777",
  "&:hover:not(:disabled), &:active:not(:disabled)": {
    backgroundColor: "rgba(23, 23, 23, 0.04)",
    color: "#171717",
  },
} as const;

function isActivePath(currentPath: string, href: string) {
  if (currentPath === href) {
    return true;
  }

  if (href === "/") {
    return currentPath === href;
  }

  return currentPath.startsWith(`${href}/`);
}

export default function MenuDrawer({
  activePath,
  ctaHref = "/#checkout",
  ctaLabel = "결제 섹션으로 이동",
  items = DEFAULT_MENU_DRAWER_ITEMS,
  open,
  onClose,
  phoneLabel = "바로 문의",
  phoneNumber = "1551-7157",
}: MenuDrawerProps) {
  const pathname = usePathname();
  const resolvedActivePath = activePath ?? pathname;

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-0 bottom-0 z-30 flex justify-center min-[1200px]:left-1/2 min-[1200px]:right-auto min-[1200px]:w-[480px]">
      <div className="relative w-full max-w-[480px] pointer-events-none">
        <button
          type="button"
          aria-label="메뉴 닫기"
          className="absolute inset-0 bg-[rgba(23,23,23,0.08)] pointer-events-auto"
          onClick={onClose}
        />

        <div
          className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col overflow-hidden bg-white shadow-[0px_12px_40px_rgba(0,0,0,0.08)] pointer-events-auto"
          data-name="MenuDrawer"
          data-node-id="152:5995"
        >
          <div className="absolute right-0 top-0 z-10">
            <IconButton
              aria-label="메뉴 닫기"
              size={drawerActionSize}
              variant="solid"
              onClick={onClose}
              sx={closeButtonSx}
            >
              <span
                aria-hidden="true"
                className="flex items-center justify-center rounded-full bg-white"
                style={{
                  width: `${drawerActionInnerSize}px`,
                  height: `${drawerActionInnerSize}px`,
                }}
              >
                <img
                  src="/assets/icons/close.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-6 w-6 object-contain"
                />
              </span>
            </IconButton>
          </div>

          <div className="flex h-full flex-col" style={{ paddingTop: `${drawerActionSize}px` }}>
            <nav aria-label="메뉴" className="flex flex-col" data-node-id="152:5977">
              {items.map((item) => {
                const active =
                  item.active ??
                  (resolvedActivePath
                    ? isActivePath(resolvedActivePath, item.href)
                    : false);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className="flex h-[54px] items-center px-6 type-body-lg"
                    style={{
                      fontWeight: active ? 600 : 400,
                      color: active ? "#0090FF" : "#171717",
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="px-6 py-3 mt-10">
              <LuckyOutlineButton
                onClick={() => {
                  window.location.href = ctaHref;
                }}
                sx={{
                  minHeight: "48px",
                  paddingInline: "24px",
                  padding: "9px 40px",
                }}
              >
                {ctaLabel}
              </LuckyOutlineButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
