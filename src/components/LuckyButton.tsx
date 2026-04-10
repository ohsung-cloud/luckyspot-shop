"use client";

import React from "react";
import {
  Button as WdsButton,
  TextButton as WdsTextButton,
  type SxProp,
} from "@wanteddev/wds";
import { IconArrowUpRight } from "@wanteddev/wds-icon";

type LuckyButtonAppearance =
  | "fill"
  | "weak"
  | "outline"
  | "link"
  | "line"
  | "ghost";

type LuckyButtonVariant = "fill" | "weak" | "outline" | "link";

type LuckyButtonProps = {
  ariaLabel?: string;
  appearance?: LuckyButtonAppearance;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  href?: string;
  leadingContent?: React.ReactNode;
  loading?: boolean;
  onClick?: React.MouseEventHandler<HTMLElement>;
  rel?: string;
  showLinkIcon?: boolean;
  sx?: SxProp;
  target?: string;
  trailingContent?: React.ReactNode;
  type?: "button" | "submit" | "reset";
};

const sharedTypography = {
  fontFamily: '"Paperozi", sans-serif',
  letterSpacing: "0.16px",
} as const;

const labelTypographyKeys = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
] as const;

function isSxObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && !Array.isArray(value) && typeof value === "object";
}

function getLabelTypographySx(
  typography: Record<string, unknown>,
  sx?: SxProp
): SxProp[] {
  const mirroredTypography: Record<string, unknown> = {};

  if (isSxObject(sx)) {
    const sxObject = sx as Record<string, unknown>;

    for (const key of labelTypographyKeys) {
      if (key in sxObject) {
        mirroredTypography[key] = sxObject[key];
      }
    }
  }

  return [
    { "& > span": typography },
    Object.keys(mirroredTypography).length > 0
      ? { "& > span": mirroredTypography }
      : undefined,
  ].filter(Boolean) as SxProp[];
}

function getBaseElementProps({
  ariaLabel,
  className,
  disabled,
  href,
  leadingContent,
  loading,
  onClick,
  rel,
  sx,
  target,
  trailingContent,
  type,
}: Omit<LuckyButtonProps, "appearance" | "children" | "fullWidth" | "showLinkIcon"> & {
  sx: SxProp[];
}) {
  const as = href ? "a" : "button";

  return {
    as,
    "aria-label": ariaLabel,
    className,
    disabled,
    href,
    leadingContent,
    loading,
    onClick,
    rel,
    sx,
    target,
    trailingContent,
    ...(as === "button" ? { type } : {}),
  };
}

function LuckyFillButton({
  ariaLabel,
  children,
  className,
  disabled,
  fullWidth,
  href,
  leadingContent,
  loading,
  onClick,
  rel,
  sx,
  target,
  trailingContent,
  type = "button",
}: Omit<LuckyButtonProps, "appearance" | "showLinkIcon">) {
  const labelTypography = {
    ...sharedTypography,
    fontSize: "20px",
    fontWeight: 600,
    lineHeight: 1.5,
  };
  const mergedSx = [
    {
      minHeight: "56px",
      borderRadius: "16px",
      paddingInline: "28px",
      backgroundColor: "#0090FF",
      color: "#FFFFFF",
      "&:hover:not(:disabled), &:active:not(:disabled)": {
        backgroundColor: "#0049AB",
      },
      "&:disabled": {
        backgroundColor: "#777777",
        color: "#FFFFFF",
      },
    },
    ...getLabelTypographySx(labelTypography, sx),
    fullWidth ? { width: "100%", justifyContent: "center" } : undefined,
    sx,
  ].filter(Boolean) as SxProp[];

  return (
    <WdsButton
      {...getBaseElementProps({
        ariaLabel,
        className,
        disabled,
        href,
        leadingContent,
        loading,
        onClick,
        rel,
        sx: mergedSx,
        target,
        trailingContent,
        type,
      })}
      color="primary"
      fullWidth={fullWidth}
      variant="solid"
    >
      {children}
    </WdsButton>
  );
}

function LuckyWeakButton({
  ariaLabel,
  children,
  className,
  disabled,
  fullWidth,
  href,
  leadingContent,
  loading,
  onClick,
  rel,
  sx,
  target,
  trailingContent,
  type = "button",
}: Omit<LuckyButtonProps, "appearance" | "showLinkIcon">) {
  const labelTypography = {
    ...sharedTypography,
    fontSize: "20px",
    fontWeight: 600,
    lineHeight: 1.5,
  };
  const mergedSx = [
    {
      minHeight: "56px",
      borderRadius: "16px",
      paddingInline: "28px",
      backgroundColor: "#E7F7FF",
      color: "#0090FF",
      "&:hover:not(:disabled), &:active:not(:disabled)": {
        backgroundColor: "#D7EEFF",
        color: "#0049AB",
      },
      "&:disabled": {
        backgroundColor: "#D7D7D7",
        color: "#777777",
      },
    },
    ...getLabelTypographySx(labelTypography, sx),
    fullWidth ? { width: "100%", justifyContent: "center" } : undefined,
    sx,
  ].filter(Boolean) as SxProp[];

  return (
    <WdsButton
      {...getBaseElementProps({
        ariaLabel,
        className,
        disabled,
        href,
        leadingContent,
        loading,
        onClick,
        rel,
        sx: mergedSx,
        target,
        trailingContent,
        type,
      })}
      color="primary"
      fullWidth={fullWidth}
      variant="solid"
    >
      {children}
    </WdsButton>
  );
}

function LuckyOutlineButton({
  ariaLabel,
  children,
  className,
  disabled,
  fullWidth,
  href,
  leadingContent,
  loading,
  onClick,
  rel,
  sx,
  target,
  trailingContent,
  type = "button",
}: Omit<LuckyButtonProps, "appearance" | "showLinkIcon">) {
  const labelTypography = {
    fontFamily: '"Paperozi", sans-serif',
    fontSize: "16px",
    fontWeight: 400,
    lineHeight: "28px",
    letterSpacing: "-0.025em",
  };
  const mergedSx = [
    {
      minHeight: "56px",
      borderRadius: "16px",
      paddingInline: "28px",
      backgroundColor: "transparent",
      border: "1px solid #0090FF",
      color: "#0090FF",
      "&:hover:not(:disabled), &:active:not(:disabled)": {
        backgroundColor: "transparent",
        borderColor: "#0049AB",
        color: "#0049AB",
      },
      "&:disabled": {
        backgroundColor: "transparent",
        borderColor: "#777777",
        color: "#777777",
      },
    },
    ...getLabelTypographySx(labelTypography, sx),
    fullWidth ? { width: "100%", justifyContent: "center" } : undefined,
    sx,
  ].filter(Boolean) as SxProp[];

  return (
    <WdsButton
      {...getBaseElementProps({
        ariaLabel,
        className,
        disabled,
        href,
        leadingContent,
        loading,
        onClick,
        rel,
        sx: mergedSx,
        target,
        trailingContent,
        type,
      })}
      color="primary"
      fullWidth={fullWidth}
      variant="outlined"
    >
      {children}
    </WdsButton>
  );
}

function LuckyLinkButton({
  ariaLabel,
  children,
  className,
  disabled,
  fullWidth,
  href,
  leadingContent,
  loading,
  onClick,
  rel,
  showLinkIcon = false,
  sx,
  target,
  trailingContent,
  type = "button",
}: Omit<LuckyButtonProps, "appearance">) {
  const labelTypography = {
    fontFamily: '"Paperozi", sans-serif',
    fontSize: "16px",
    fontWeight: 400,
    lineHeight: "28px",
    letterSpacing: "-0.025em",
  };
  const resolvedTrailingContent =
    trailingContent ??
    (showLinkIcon ? (
      <span data-lucky-link-icon="true" aria-hidden="true">
        <IconArrowUpRight style={{ fontSize: "24px" }} />
      </span>
    ) : undefined);
  const mergedSx = [
    {
      minHeight: "56px",
      borderRadius: "16px",
      paddingInline: "0px",
      backgroundColor: "transparent",
      color: "#0090FF",
      textDecoration: "none",
      gap: "8px",
      boxShadow: "none",
      "& > [wds-component='with-interaction']": {
        display: "none",
      },
      "& [data-lucky-link-icon='true']": {
        display: "inline-flex",
        transition: "transform 200ms ease, color 200ms ease",
      },
      "&:hover:not(:disabled), &:active:not(:disabled)": {
        backgroundColor: "transparent",
        color: "#0049AB",
        boxShadow: "none",
      },
      "&:hover:not(:disabled) [data-lucky-link-icon='true'], &:active:not(:disabled) [data-lucky-link-icon='true']": {
        transform: "translate(2px, -2px)",
      },
      "&:disabled": {
        backgroundColor: "transparent",
        color: "#777777",
        boxShadow: "none",
      },
      "& > span": {
        textDecoration: "underline",
      },
    },
    ...getLabelTypographySx(labelTypography, sx),
    fullWidth
      ? {
          width: "100%",
          justifyContent: resolvedTrailingContent ? "space-between" : "center",
        }
      : undefined,
    sx,
  ].filter(Boolean) as SxProp[];

  return (
    <WdsTextButton
      {...getBaseElementProps({
        ariaLabel,
        className,
        disabled,
        href,
        leadingContent,
        loading,
        onClick,
        rel,
        sx: mergedSx,
        target,
        trailingContent: resolvedTrailingContent,
        type,
      })}
    >
      {children}
    </WdsTextButton>
  );
}

function normalizeAppearance(
  appearance: LuckyButtonAppearance
): LuckyButtonVariant {
  if (appearance === "line") {
    return "outline";
  }

  if (appearance === "ghost") {
    return "link";
  }

  return appearance;
}

export function LuckyButton({
  ariaLabel,
  appearance = "fill",
  children,
  className,
  disabled,
  fullWidth,
  href,
  leadingContent,
  loading,
  onClick,
  rel,
  showLinkIcon = false,
  sx,
  target,
  trailingContent,
  type = "button",
}: LuckyButtonProps) {
  const variant = normalizeAppearance(appearance);
  const sharedProps = {
    ariaLabel,
    children,
    className,
    disabled,
    fullWidth,
    href,
    leadingContent,
    loading,
    onClick,
    rel,
    sx,
    target,
    trailingContent,
    type,
  };

  switch (variant) {
    case "weak":
      return <LuckyWeakButton {...sharedProps} />;
    case "outline":
      return <LuckyOutlineButton {...sharedProps} />;
    case "link":
      return <LuckyLinkButton {...sharedProps} showLinkIcon={showLinkIcon} />;
    case "fill":
    default:
      return <LuckyFillButton {...sharedProps} />;
  }
}

export {
  LuckyFillButton,
  LuckyLinkButton,
  LuckyOutlineButton,
  LuckyWeakButton,
};

export type { LuckyButtonAppearance, LuckyButtonProps, LuckyButtonVariant };
