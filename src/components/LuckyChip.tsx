"use client";

import React from "react";
import { Chip as WdsChip, type SxProp } from "@wanteddev/wds";

type LuckyChipTone = "primary" | "default" | "pressed";

type LuckyChipProps = React.ComponentProps<typeof WdsChip> & {
  selectedTone?: LuckyChipTone;
  tone?: LuckyChipTone;
};

const chipStyles: Record<LuckyChipTone, SxProp> = {
  primary: {
    backgroundColor: "#0049AB",
    border: "0.833px solid #0049AB",
    color: "#FFFFFF",
  },
  default: {
    backgroundColor: "transparent",
    border: "0.833px solid #777777",
    color: "#777777",
  },
  pressed: {
    backgroundColor: "#E7F7FF",
    border: "0.833px solid #0049AB",
    color: "#0049AB",
  },
};

const LuckyChip = React.forwardRef<HTMLButtonElement, LuckyChipProps>(
  function LuckyChip(
    {
      active,
      children,
      disableInteraction,
      onClick,
      selectedTone = "pressed",
      size = "medium",
      sx,
      tone = "default",
      ...props
    },
    ref,
  ) {
    const resolvedTone = active ? selectedTone : tone;

    return (
      <WdsChip
        {...props}
        ref={ref}
        active={active}
        disableInteraction={disableInteraction ?? !onClick}
        onClick={onClick}
        size={size}
        sx={[
          {
            minHeight: "40px",
            paddingInline: "13.333px",
            borderRadius: "999px",
            fontFamily: '"Paperozi", sans-serif',
            fontSize: "16px",
            fontWeight: 400,
            lineHeight: 1.7,
            letterSpacing: "0.16px",
            transition: "all 0.2s ease",
          },
          chipStyles[resolvedTone],
          sx,
        ]}
      >
        {children}
      </WdsChip>
    );
  },
);

LuckyChip.displayName = "LuckyChip";

export type { LuckyChipProps, LuckyChipTone };
export { LuckyChip };
