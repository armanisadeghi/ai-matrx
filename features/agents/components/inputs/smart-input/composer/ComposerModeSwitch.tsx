"use client";

/**
 * Chat · Work · Advanced — the page-mode switch (Amendment 1, A1).
 *
 * It is a PAGE mode, not a composer setting (Inventory: "Top bar, centered, on
 * every layout"), so it renders wherever the host puts it: the top bar of a
 * page, or the header of a docked chat panel (`size="panel"`). Every instance
 * reads and writes the same tab-wide mode.
 *
 * On a phone the top bar has no room for three segments beside its icons, so
 * below `sm` the bar size is ONE button naming the mode that opens the three.
 */

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  COMPOSER_MODES,
  COMPOSER_MODE_LABELS,
  type ComposerMode,
} from "./composer-types";
import { useComposerMode } from "./useComposerMode";

interface ComposerModeSwitchProps {
  /** Server-read "last mode used" cookie, for a first paint with no flash. */
  initialMode?: ComposerMode | null;
  size?: "bar" | "panel";
  className?: string;
}

export function ComposerModeSwitch({
  initialMode,
  size = "bar",
  className,
}: ComposerModeSwitchProps) {
  const { mode, setMode } = useComposerMode(initialMode);
  const panel = size === "panel";
  const segments = (
    <div
      role="tablist"
      aria-label="Composer mode"
      className={cn(
        "shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5",
        panel
          ? "inline-flex rounded-lg"
          : "hidden rounded-[10px] sm:inline-flex",
        className,
      )}
    >
      {COMPOSER_MODES.map((value) => {
        const on = value === mode;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setMode(value)}
            className={cn(
              "whitespace-nowrap font-medium transition-colors",
              panel
                ? "h-[22px] rounded-md px-2 text-xs"
                : "h-7 rounded-lg px-3.5 text-sm",
              on
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {COMPOSER_MODE_LABELS[value]}
          </button>
        );
      })}
    </div>
  );
  if (panel) return segments;
  return (
    <>
      {segments}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Composer mode: ${COMPOSER_MODE_LABELS[mode]}`}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-muted px-2.5 text-sm font-medium text-foreground sm:hidden",
              className,
            )}
          >
            {COMPOSER_MODE_LABELS[mode]}
            <ChevronDown
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuRadioGroup
            value={mode}
            onValueChange={(value) => {
              const next = COMPOSER_MODES.find((m) => m === value);
              if (next) setMode(next);
            }}
          >
            {COMPOSER_MODES.map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {COMPOSER_MODE_LABELS[value]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
