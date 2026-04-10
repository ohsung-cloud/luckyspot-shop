"use client";

import React from "react";
import { LuckyChip, type LuckyChipProps } from "@/components/LuckyChip";

type LuckyChipTabItem = {
  disabled?: boolean;
  key: React.Key;
  label: React.ReactNode;
  panelId?: string;
  tabId?: string;
};

type LuckyChipTabOverrides = Omit<
  LuckyChipProps,
  | "active"
  | "aria-controls"
  | "aria-selected"
  | "children"
  | "id"
  | "onClick"
  | "role"
  | "tabIndex"
  | "type"
>;

type LuckyChipTabsProps = {
  "aria-label": string;
  className?: string;
  getChipProps?: (
    item: LuckyChipTabItem,
    index: number,
    selected: boolean,
  ) => LuckyChipTabOverrides | undefined;
  items: LuckyChipTabItem[];
  onChange: (index: number) => void;
  selectedIndex: number;
};

function findEnabledIndex(
  items: LuckyChipTabItem[],
  startIndex: number,
  direction: 1 | -1,
) {
  if (!items.length) {
    return -1;
  }

  let nextIndex = startIndex;

  for (let step = 0; step < items.length; step += 1) {
    nextIndex = (nextIndex + direction + items.length) % items.length;

    if (!items[nextIndex]?.disabled) {
      return nextIndex;
    }
  }

  return -1;
}

export function LuckyChipTabs({
  "aria-label": ariaLabel,
  className,
  getChipProps,
  items,
  onChange,
  selectedIndex,
}: LuckyChipTabsProps) {
  const chipRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  if (!items.length) {
    return null;
  }

  const focusTab = (index: number) => {
    chipRefs.current[index]?.focus();
  };

  const moveSelection = (index: number) => {
    if (index < 0 || index >= items.length || items[index]?.disabled) {
      return;
    }

    onChange(index);
    focusTab(index);
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className={className}>
      {items.map((item, index) => {
        const selected = index === selectedIndex;
        const chipProps = getChipProps?.(item, index, selected);

        return (
          <LuckyChip
            key={item.key}
            {...chipProps}
            ref={(node) => {
              chipRefs.current[index] = node;
            }}
            active={selected}
            aria-controls={item.panelId}
            aria-selected={selected}
            disabled={item.disabled}
            id={item.tabId}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
            onClick={() => moveSelection(index)}
            onKeyDown={(event) => {
              switch (event.key) {
                case "ArrowDown":
                case "ArrowRight": {
                  const nextIndex = findEnabledIndex(items, index, 1);

                  if (nextIndex === -1) {
                    return;
                  }

                  event.preventDefault();
                  moveSelection(nextIndex);
                  return;
                }
                case "ArrowLeft":
                case "ArrowUp": {
                  const nextIndex = findEnabledIndex(items, index, -1);

                  if (nextIndex === -1) {
                    return;
                  }

                  event.preventDefault();
                  moveSelection(nextIndex);
                  return;
                }
                case "Home": {
                  const nextIndex = items.findIndex((tab) => !tab.disabled);

                  if (nextIndex === -1) {
                    return;
                  }

                  event.preventDefault();
                  moveSelection(nextIndex);
                  return;
                }
                case "End": {
                  const nextIndex = items.findLastIndex((tab) => !tab.disabled);

                  if (nextIndex === -1) {
                    return;
                  }

                  event.preventDefault();
                  moveSelection(nextIndex);
                }
              }
            }}
          >
            {item.label}
          </LuckyChip>
        );
      })}
    </div>
  );
}

export type { LuckyChipTabItem, LuckyChipTabsProps };
