"use client";

/**
 * Chat · Work · Advanced — the page-mode switch (Amendment 1, A1).
 *
 * It is a PAGE mode, not a composer setting (Inventory: "Top bar, centered, on
 * every layout"), so it renders wherever the host puts it: the top bar of a
 * page, or the header of a docked chat panel (`size="panel"`). Every instance
 * reads and writes the same tab-wide mode.
 *
 * When the header row has no room for three segments beside its actions, the
 * bar size is ONE button naming the mode that opens the three. "No room" is
 * MEASURED on the header's own row (`useCenterControlFit`), never read from the
 * viewport: with the canvas open a 1440px window leaves the main column ~800px,
 * and a viewport breakpoint drew the full switch over the page's actions
 * (2026-10-03). Before the first measurement (server HTML) the `sm:` classes
 * pick the form, so a phone's first paint is already compact.
 */

import { useRef, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { useCenterControlFit } from "@host/features/shell/components/header/useCenterControlFit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@ai-matrx/design-system";
import { cn } from "@ai-matrx/design-system";
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
  const cellRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const fit = useCenterControlFit(cellRef, [fullRef, triggerRef], mode);
  // False in the server HTML and during hydration; the layout effect has
  // measured before the first client paint after that.
  const measured = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const renderSegments = (interactive: boolean) => (
    <div
      role={interactive ? "tablist" : undefined}
      aria-label={interactive ? "Composer mode" : undefined}
      className={cn(
        "shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5",
        panel || !interactive
          ? "inline-flex rounded-lg"
          : measured
            ? "inline-flex rounded-[10px]"
            : "hidden rounded-[10px] sm:inline-flex",
        !interactive && "w-max max-w-none",
        className,
      )}
    >
      {COMPOSER_MODES.map((value) => {
        const on = value === mode;
        return (
          <button
            key={value}
            type="button"
            role={interactive ? "tab" : undefined}
            aria-selected={interactive ? on : undefined}
            tabIndex={interactive ? undefined : -1}
            onClick={interactive ? () => setMode(value) : undefined}
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
  if (panel) return renderSegments(true);
  const triggerClass =
    "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-muted px-2.5 text-sm font-medium text-foreground";
  const triggerFace = (
    <>
      {COMPOSER_MODE_LABELS[mode]}
      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
    </>
  );
  const showFull = measured ? fit.index === 0 : null;
  const showTrigger = measured ? fit.index === 1 : null;
  return (
    <div
      ref={cellRef}
      className="relative flex w-full min-w-0 justify-center"
      data-route-nav-inflow={fit.inflow ? "" : undefined}
    >
      {/* Hidden measurers at natural width (`w-max max-w-none`: the global
          `* { max-width: 100% }` would cap them at this cell). */}
      <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0">
        <div ref={fullRef} className="w-max max-w-none">
          {renderSegments(false)}
        </div>
        <span ref={triggerRef} data-route-nav-min className={cn(triggerClass, "w-max max-w-none")}>
          {triggerFace}
        </span>
      </div>
      {showFull !== false ? renderSegments(true) : null}
      {showTrigger !== false ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Composer mode: ${COMPOSER_MODE_LABELS[mode]}`}
            className={cn(triggerClass, showTrigger == null && "sm:hidden", className)}
          >
            {triggerFace}
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
      ) : null}
    </div>
  );
}

const noopSubscribe = () => () => {};
