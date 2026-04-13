"use client";

import React from "react";
import { IconChevronDown } from "@wanteddev/wds-icon";
import { LuckyButton } from "./LuckyButton";

type LuckyScrollDownButtonProps = {
  ariaLabel?: string;
  className?: string;
  label?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
  scrollToNextSection?: boolean;
};

function getNextSection(currentSection: HTMLElement | null) {
  let nextElement = currentSection?.nextElementSibling;

  while (nextElement) {
    if (nextElement instanceof HTMLElement && nextElement.tagName === "SECTION") {
      return nextElement;
    }

    nextElement = nextElement.nextElementSibling;
  }

  return null;
}

function scrollElementToTop(element: HTMLElement | null) {
  if (!element) {
    return;
  }

  const top = element.getBoundingClientRect().top + window.scrollY;

  window.scrollTo({
    top,
    behavior: "smooth",
  });
}

export function LuckyScrollDownButton({
  ariaLabel = "다음 섹션으로 이동",
  className,
  label = "Scroll",
  onClick,
  scrollToNextSection = false,
}: LuckyScrollDownButtonProps) {
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    onClick?.(event);

    if (event.defaultPrevented || !scrollToNextSection) {
      return;
    }

    const currentSection = event.currentTarget.closest("section");
    const nextSection = getNextSection(currentSection);

    if (!nextSection) {
      return;
    }

    scrollElementToTop(nextSection);
  };

  return (
    <LuckyButton
      appearance="link"
      aria-label={ariaLabel}
      className={`group ${className ?? ""}`}
      onClick={handleClick}
      sx={{
        minHeight: "auto",
        width: "100px",
        paddingInline: "12px",
        paddingBlock: "24px",
        borderRadius: "0px",
        justifyContent: "center",
        color: "#F5F5F5",
        gap: "0px",
        "& > span": {
          display: "flex",
          width: "100%",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          textDecoration: "none",
        },
        "& [data-scroll-label='true']": {
          fontFamily: '"Paperozi", sans-serif',
          fontSize: "14px",
          lineHeight: "20px",
          color: "currentColor",
        },
        "& [data-scroll-icon='true']": {
          display: "flex",
          height: "32px",
          width: "32px",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "9999px",
          backgroundColor: "#F5F5F5",
          color: "#0049AB",
          transition: "background-color 200ms ease, color 200ms ease",
        },
        "&:hover:not(:disabled), &:active:not(:disabled)": {
          backgroundColor: "transparent",
          color: "#E7F7FF",
          boxShadow: "none",
        },
        "&:hover:not(:disabled) [data-scroll-icon='true'], &:active:not(:disabled) [data-scroll-icon='true']": {
          backgroundColor: "#E7F7FF",
          color: "#0090FF",
        },
        "&:focus-visible": {
          outline: "2px solid #E7F7FF",
          outlineOffset: "4px",
        },
      }}
    >
      <>
        <span data-scroll-label="true">{label}</span>
        <span data-scroll-icon="true">
          <IconChevronDown
            aria-hidden
            style={{ fontSize: "16px", color: "currentColor" }}
          />
        </span>
      </>
    </LuckyButton>
  );
}

export type { LuckyScrollDownButtonProps };
