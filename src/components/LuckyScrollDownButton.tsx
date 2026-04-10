"use client";

import React from "react";
import { IconChevronDown } from "@wanteddev/wds-icon";

type LuckyScrollDownButtonProps = {
  ariaLabel?: string;
  className?: string;
  label?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
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
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
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
    <button
      type="button"
      aria-label={ariaLabel}
      className={`group flex w-[100px] flex-col items-center gap-2 px-3 py-6 text-ui-gray-100 transition-colors duration-200 ease-[ease] hover:text-brand-100 active:text-brand-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-100 ${className ?? ""}`}
      onClick={handleClick}
    >
      <span className="type-body-sm text-[inherit] group-hover:text-[#e7f7ff] group-active:text-brand-400">{label}</span>
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ui-gray-100 text-brand-600 transition-colors duration-200 ease-[ease] group-hover:bg-brand-100 group-hover:text-brand-400 group-active:bg-brand-100 group-active:text-brand-400">
        <IconChevronDown aria-hidden style={{ fontSize: "16px", color: "currentColor" }} />
      </span>
    </button>
  );
}

export type { LuckyScrollDownButtonProps };
