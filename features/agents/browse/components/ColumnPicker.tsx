"use client";

// features/agents/browse/components/ColumnPicker.tsx
//
// The table's opinion is a default, not a decision. Everything BROWSE_COLUMNS
// declares is here; the user's choice persists per surface.

import { Columns3, RotateCcw, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { BROWSE_COLUMNS, DEFAULT_HIDDEN_COLUMNS, type BrowseColumnSpec } from "../columns";

interface Props {
  hiddenColumns: string[];
  /** Owner/org/access carry no information inside "Mine" — hide the toggles too. */
  showSharedColumns: boolean;
  onChange: (hidden: string[]) => void;
}

export function ColumnPicker({
  hiddenColumns,
  showSharedColumns,
  onChange,
}: Props) {
  const available: BrowseColumnSpec[] = BROWSE_COLUMNS.filter(
    (c) => showSharedColumns || !c.scopedToShared,
  );
  const visibleCount = available.filter(
    (c) => !hiddenColumns.includes(c.id),
  ).length;

  const toggle = (spec: BrowseColumnSpec) => {
    if (spec.locked) return;
    onChange(
      hiddenColumns.includes(spec.id)
        ? hiddenColumns.filter((id) => id !== spec.id)
        : [...hiddenColumns, spec.id],
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose columns"
          title="Choose columns"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Columns3 className="h-3.5 w-3.5" />
          <span className="hidden tabular-nums lg:inline">{visibleCount}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-56 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Columns</span>
          <button
            type="button"
            onClick={() => onChange(DEFAULT_HIDDEN_COLUMNS)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {available.map((spec) => {
            const visible = !hiddenColumns.includes(spec.id);
            return (
              <button
                key={spec.id}
                type="button"
                disabled={spec.locked}
                onClick={() => toggle(spec)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  spec.locked
                    ? "cursor-default text-muted-foreground"
                    : "hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                    visible
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40",
                  )}
                >
                  {visible && <Check className="h-2.5 w-2.5" />}
                </span>
                <span className="flex-1 truncate">{spec.label}</span>
                {spec.locked && (
                  <span className="text-[10px] uppercase text-muted-foreground">
                    Always
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
