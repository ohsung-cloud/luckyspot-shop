"use client";

import React from "react";
import { IconButton, type SxProp } from "@wanteddev/wds";

type HeaderProps = {
  center?: React.ReactNode;
  className?: string;
  left?: React.ReactNode;
  menuLabel?: string;
  menuOpen?: boolean;
  onMenuToggle?: React.MouseEventHandler<HTMLButtonElement>;
  right?: React.ReactNode;
  sx?: SxProp;
};

const headerActionSize = 76;
const headerActionInnerSize = 44;

const menuButtonSx = {
  width: `${headerActionSize}px`,
  height: `${headerActionSize}px`,
  minWidth: `${headerActionSize}px`,
  minHeight: `${headerActionSize}px`,
  borderRadius: "0px",
  backgroundColor: "transparent",
  color: "#171717",
  "&:hover:not(:disabled), &:active:not(:disabled)": {
    backgroundColor: "rgba(23, 23, 23, 0.04)",
  },
} as const;

export function Header({
  center,
  className,
  left,
  menuLabel,
  menuOpen = false,
  onMenuToggle,
  right,
  sx,
}: HeaderProps) {
  const iconSrc = menuOpen
    ? "/assets/icons/close.svg"
    : "/assets/icons/menu.svg";
  const ariaLabel = menuLabel ?? (menuOpen ? "메뉴 닫기" : "메뉴 열기");

  return (
    <header
      className="fixed inset-x-0 top-0 z-30 flex justify-center pointer-events-none min-[1200px]:left-1/2 min-[1200px]:w-[480px] min-[1200px]:right-auto"
    >
      <div className="relative w-full max-w-[480px] pointer-events-auto">
        <div
          className={`relative flex min-h-[54px] w-full items-center ${
            className ?? ""
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center">{left}</div>

          {center ? (
            <div
              className="pointer-events-none absolute flex justify-center px-4"
              style={{ insetInline: `${headerActionSize}px` }}
            >
              <div className="min-w-0 truncate">{center}</div>
            </div>
          ) : null}

          <div className="ml-auto flex items-center">
            {right}
            {onMenuToggle ? (
              <IconButton
                aria-label={ariaLabel}
                size={headerActionSize}
                variant="solid"
                onClick={onMenuToggle}
                sx={[menuButtonSx, sx]}
              >
                <span
                  aria-hidden="true"
                  className="flex items-center justify-center rounded-full bg-white"
                  style={{
                    width: `${headerActionInnerSize}px`,
                    height: `${headerActionInnerSize}px`,
                  }}
                >
                  <img
                    src={iconSrc}
                    alt=""
                    aria-hidden="true"
                    className="h-6 w-6 object-contain"
                  />
                </span>
              </IconButton>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

export type { HeaderProps };
