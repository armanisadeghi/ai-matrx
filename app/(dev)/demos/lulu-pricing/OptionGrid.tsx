"use client";

/**
 * One constrained dimension of the book configuration.
 *
 * Every option is judged live against the rest of the selection: an
 * unavailable option is DISABLED and states its reason inline, in place,
 * on the same keystroke that invalidated it.
 */

import { Check } from "lucide-react";
import { cn } from "@/utils/cn";
import type { LuluOption, OptionAvailability } from "./types";

export interface OptionGridEntry {
  option: LuluOption;
  availability: OptionAvailability;
  /** Presentation label; falls back to the catalog's own label. */
  label?: string;
  /** One short line under the label — what this choice means. */
  hint?: string | null;
}

interface OptionGridProps {
  entries: OptionGridEntry[];
  selectedId: string | null;
  onSelect: (optionId: string) => void;
  columns?: 1 | 2 | 3;
  disabled?: boolean;
}

export function OptionGrid({
  entries,
  selectedId,
  onSelect,
  columns = 2,
  disabled = false,
}: OptionGridProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No options in the catalog for this step yet.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {entries.map(({ option, availability, label, hint }) => {
        const isSelected = option.id === selectedId;
        const isUnavailable = !availability.available;
        // A selected option that just became invalid stays clickable so the
        // user can back out of it; only unselected invalid options lock.
        const isDisabled = disabled || (isUnavailable && !isSelected);
        const secondary = availability.reason ?? hint ?? option.sublabel;
        return (
          <button
            key={option.id}
            type="button"
            disabled={isDisabled}
            aria-pressed={isSelected}
            onClick={() => onSelect(option.id)}
            className={cn(
              "group relative flex min-h-[4.25rem] w-full flex-col justify-center gap-1 rounded-xl border-2 px-4 py-3 text-left transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isSelected
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border bg-card hover:border-primary/40 hover:bg-accent/60",
              isUnavailable &&
                !isSelected &&
                "cursor-not-allowed border-dashed border-border/70 bg-muted/30 hover:border-border/70 hover:bg-muted/30",
              isSelected && isUnavailable && "border-destructive bg-destructive/5",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            {isSelected ? (
              <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" strokeWidth={3} />
              </span>
            ) : null}

            <span
              className={cn(
                "pr-6 text-[0.9375rem] font-semibold leading-tight",
                isUnavailable && !isSelected
                  ? "text-muted-foreground"
                  : "text-foreground",
              )}
            >
              {label ?? option.label}
            </span>

            {secondary ? (
              <span
                className={cn(
                  "pr-6 text-xs leading-snug",
                  availability.reason
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {secondary}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
