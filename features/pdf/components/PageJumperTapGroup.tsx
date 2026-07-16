"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  ChevronLeftTapButton,
  ChevronRightTapButton,
} from "@/components/icons/tap-buttons";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";

export interface PageJumperTapGroupProps {
  /** 1-based page number, or null when no page is selected. */
  activePage: number | null;
  totalPages: number;
  onJumpToPage: (pageNumber: number) => void;
  /** Slimmer group geometry for dense toolbars (e.g. library page header). */
  compact?: boolean;
  className?: string;
}

/** Compact `‹ N/total ›` page jumper — glass tap-group with an inline input. */
export function PageJumperTapGroup({
  activePage,
  totalPages,
  onJumpToPage,
  compact = false,
  className,
}: PageJumperTapGroupProps) {
  const total = Math.max(totalPages, 0);
  const [draft, setDraft] = React.useState("");

  // Sync the draft when the active page changes — derived-state pattern
  // (render-phase set with prop tracking), not an effect.
  const [syncedPage, setSyncedPage] = React.useState<number | null>(null);
  if (activePage !== syncedPage) {
    setSyncedPage(activePage);
    if (activePage != null) setDraft(String(activePage));
  }

  const submit = () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 1) return;
    onJumpToPage(Math.min(n, Math.max(total, 1)));
  };

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap",
        className,
      )}
    >
      <TapTargetButtonGroup className={cn("shrink-0", compact && "h-8")}>
        <ChevronLeftTapButton
          variant="group"
          tooltip={false}
          onClick={() =>
            activePage && activePage > 1 && onJumpToPage(activePage - 1)
          }
          disabled={!activePage || activePage <= 1}
          ariaLabel="Previous page"
        />

        <div
          className={cn(
            "flex items-center justify-center",
            compact ? "h-7" : "h-8",
          )}
        >
          <div className="matrx-tap-pill matrx-tap-pill-sm matrx-tap-pill-inline-sm flex items-center gap-0 px-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  submit();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className={cn(
                "rounded-sm bg-muted/80 text-center text-[10px] leading-none tabular-nums outline-none ring-1 ring-inset ring-border/80 focus-visible:bg-background focus-visible:ring-primary/50",
                compact
                  ? "h-4 w-[4ch] min-w-[4ch] max-w-[4ch]"
                  : "h-5 w-[5ch] min-w-[5ch] max-w-[5ch]",
              )}
              inputMode="numeric"
              aria-label="Current page"
            />
            <span className="text-[11px] pl-1 leading-none tabular-nums text-muted-foreground">
              of {total.toLocaleString()}
            </span>
          </div>
        </div>

        <ChevronRightTapButton
          variant="group"
          tooltip={false}
          onClick={() =>
            activePage &&
            total > 0 &&
            activePage < total &&
            onJumpToPage(activePage + 1)
          }
          disabled={!activePage || total <= 0 || activePage >= total}
          ariaLabel="Next page"
        />
      </TapTargetButtonGroup>
    </div>
  );
}
