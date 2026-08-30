"use client";

/**
 * One constrained dimension of the book configuration.
 *
 * Every option is judged live against the rest of the selection: an
 * unavailable option is DISABLED and states its reason inline, in place,
 * on the same keystroke that invalidated it.
 */

import { Check, Ban } from "lucide-react";
import { cn } from "@/utils/cn";
import type { LuluOption, OptionAvailability } from "./types";

export interface OptionGridEntry {
  option: LuluOption;
  availability: OptionAvailability;
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
        "grid gap-2",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {entries.map(({ option, availability }) => {
        const isSelected = option.id === selectedId;
        const isDisabled = disabled || !availability.available;
        return (
          <button
            key={option.id}
            type="button"
            disabled={isDisabled}
            aria-pressed={isSelected}
            onClick={() => onSelect(option.id)}
            className={cn(
              "group flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
              isSelected
                ? "border-primary bg-primary/10"
                : "border-border bg-card hover:bg-accent",
              isDisabled &&
                "cursor-not-allowed border-dashed border-border bg-muted/40 opacity-60 hover:bg-muted/40",
            )}
          >
            <span className="flex items-center gap-1.5">
              {isSelected ? (
                <Check className="size-3.5 shrink-0 text-primary" />
              ) : isDisabled ? (
                <Ban className="size-3.5 shrink-0 text-muted-foreground" />
              ) : null}
              <span
                className={cn(
                  "text-sm font-medium",
                  isDisabled ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {option.label}
              </span>
            </span>
            {availability.reason ? (
              <span className="text-xs text-destructive">
                {availability.reason}
              </span>
            ) : option.sublabel ? (
              <span className="text-xs text-muted-foreground">
                {option.sublabel}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
