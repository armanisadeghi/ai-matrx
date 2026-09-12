"use client";

/**
 * One constrained dimension of the book configuration.
 *
 * Image-first, because these are physical objects: the swatch is the subject
 * and the label captions it. Every option is judged live against the rest of
 * the selection — an unavailable option is DISABLED, visibly drained, and
 * states its reason inline on the same keystroke that invalidated it.
 */

import { Check } from "lucide-react";
import { cn } from "@/utils/cn";
import { OptionSwatch, type SwatchDimension } from "./swatches";
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
  /** Which family of illustration to draw. Omit for a text-only grid. */
  swatch?: SwatchDimension;
}

export function OptionGrid({
  entries,
  selectedId,
  onSelect,
  columns = 2,
  disabled = false,
  swatch,
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
        "grid gap-4",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-2 lg:grid-cols-2",
        columns === 3 && "grid-cols-2 lg:grid-cols-3",
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
              "group relative flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              isSelected
                ? "border-primary shadow-md ring-1 ring-primary"
                : "border-border hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
              isUnavailable &&
                !isSelected &&
                "cursor-not-allowed border-border/60 hover:translate-y-0 hover:border-border/60 hover:shadow-none",
              isSelected && isUnavailable && "border-destructive ring-destructive",
              disabled && "cursor-not-allowed",
            )}
          >
            {swatch ? (
              <div
                className={cn(
                  "relative transition-all",
                  isUnavailable && !isSelected && "opacity-30 grayscale",
                )}
              >
                <OptionSwatch dimension={swatch} value={option.id} />
                {isSelected ? (
                  <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary shadow-sm">
                    <Check
                      className="size-3.5 text-primary-foreground"
                      strokeWidth={3}
                    />
                  </span>
                ) : null}
              </div>
            ) : null}

            <div
              className={cn(
                "flex flex-col gap-1 px-3.5 py-3",
                !swatch && "min-h-[4.25rem] justify-center",
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "text-[0.9375rem] font-semibold leading-tight",
                    isUnavailable && !isSelected
                      ? "text-muted-foreground"
                      : "text-foreground",
                  )}
                >
                  {label ?? option.label}
                </span>
                {!swatch && isSelected ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary">
                    <Check
                      className="size-3 text-primary-foreground"
                      strokeWidth={3}
                    />
                  </span>
                ) : null}
              </span>

              {secondary ? (
                <span
                  className={cn(
                    "text-xs leading-snug",
                    availability.reason
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {secondary}
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
