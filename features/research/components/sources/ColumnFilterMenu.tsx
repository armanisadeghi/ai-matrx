"use client";

import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface ColumnFilterOption {
  id: string;
  label: string;
}

interface ColumnFilterMenuProps {
  /** Human label of the column, used in the "All …" reset row + a11y title. */
  label: string;
  options: ColumnFilterOption[];
  /** Currently selected option id, or null when the column is unfiltered. */
  selectedId: string | null;
  /** null = clear the filter for this column. */
  onSelect: (id: string | null) => void;
  className?: string;
}

/**
 * Compact per-column header filter — a funnel button that opens a single-select
 * popover. Sets the SAME filter state the top SourceFilters bar drives, so the
 * two stay in lockstep. The funnel lights up (primary) while a value is active.
 */
export function ColumnFilterMenu({
  label,
  options,
  selectedId,
  onSelect,
  className,
}: ColumnFilterMenuProps) {
  const active = selectedId != null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Filter by ${label}`}
          aria-label={`Filter by ${label}`}
          className={cn(
            "inline-flex h-4 w-4 items-center justify-center rounded transition-colors",
            active
              ? "text-primary"
              : "text-muted-foreground/40 hover:text-foreground",
            className,
          )}
        >
          <Filter className={cn("h-3 w-3", active && "fill-current")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
            !active && "font-semibold text-foreground",
          )}
        >
          All {label}
        </button>
        <div className="my-1 h-px bg-border/60" />
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {options.map((opt) => {
            const isSelected = opt.id === selectedId;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelect(isSelected ? null : opt.id)}
                className={cn(
                  "flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                  isSelected && "bg-primary/10 font-semibold text-primary",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
