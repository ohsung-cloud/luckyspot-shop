"use client";

import React from "react";
import { IconButton, type SxProp } from "@wanteddev/wds";
import { IconArrowLeft, IconArrowRight } from "@wanteddev/wds-icon";

type LuckyArrowDirection = "prev" | "next";

type LuckyArrowButtonProps = {
  className?: string;
  direction: LuckyArrowDirection;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  sx?: SxProp;
};

export function LuckyArrowButton({
  className,
  direction,
  disabled,
  onClick,
  sx,
}: LuckyArrowButtonProps) {
  const Icon = direction === "prev" ? IconArrowLeft : IconArrowRight;
  const label = direction === "prev" ? "이전" : "다음";

  return (
    <IconButton
      aria-label={label}
      className={className}
      disabled={disabled}
      onClick={onClick}
      size={48}
      variant="solid"
      sx={[
        {
          width: "48px",
          height: "48px",
          borderRadius: "999px",
          backgroundColor: "#0049AB",
          color: "#FFFFFF",
          "&:hover:not(:disabled), &:active:not(:disabled)": {
            backgroundColor: "#09264C",
          },
          "&:disabled": {
            backgroundColor: "#D7D7D7",
            color: "#FFFFFF",
          },
        },
        sx,
      ]}
    >
      <Icon aria-hidden style={{ fontSize: "24px" }} />
    </IconButton>
  );
}

export type { LuckyArrowButtonProps, LuckyArrowDirection };
