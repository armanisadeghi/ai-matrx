/**
 * features/files/components/surfaces/desktop/RagFilterPicker.tsx
 *
 * Multi-select dropdown body for the Knowledge-status column header. Shows
 * one row per status — Indexed / Not indexed / Checking / Unknown —
 * with the live count from the current dataset. The header includes a
 * "Refresh" button that re-runs the prefetch thunk for every visible
 * file id (force=true), which is how users invalidate stale answers
 * after a `/knowledge/ingest` they did from another surface.
 *
 * State lives in `cloudFiles.ui.columnFilters.rag`. This component is
 * presentational; the host wires `value`/`onChange` and the refresh
 * callback.
 */

"use client";

import { Lightbulb, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import type { RagFilter, RagStatus } from "@/features/files/types";

interface StatusMeta {
  status: RagStatus;
  label: string;
  /** Render-only — used purely for visual rhythm, the cell renders its
   *  own dot/icon. */
  swatch: React.ReactNode;
}

const STATUS_META: ReadonlyArray<StatusMeta> = [
  {
    status: "indexed",
    label: "Indexed",
    swatch: (
      <Lightbulb className="h-3 w-3 text-primary" aria-hidden="true" />
    ),
  },
  {
    status: "not_indexed",
    label: "Not indexed",
    swatch: (
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
      />
    ),
  },
  {
    status: "pending",
    label: "Checking…",
    swatch: (
      <Loader2
        className="h-3 w-3 text-muted-foreground animate-spin"
        aria-hidden="true"
      />
    ),
  },
  {
    status: "unknown",
    label: "Unknown",
    swatch: (
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30"
      />
    ),
  },
];

export interface RagFilterPickerProps {
  value: RagFilter;
  onChange: (next: RagFilter) => void;
  /** Optional per-status counts shown as a right-aligned tabular number. */
  counts?: Partial<Record<RagStatus, number>>;
  /** True when a batch fetch is in flight — disables the refresh button
   *  and shows a spinner. */
  isFetching?: boolean;
  /** Click handler for the column-scoped refresh button. */
  onRefresh?: () => void;
  className?: string;
}

export function RagFilterPicker({
  value,
  onChange,
  counts,
  isFetching = false,
  onRefresh,
  className,
}: RagFilterPickerProps) {
  const selected = new Set(value);

  const toggle = (status: RagStatus) => {
    const next = new Set(selected);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    onChange(Array.from(next));
  };

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {value.length === 0 ? "Any status" : `${value.length} selected`}
        </span>
        <div className="flex items-center gap-1">
          {value.length > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="text-[10px] font-medium text-primary hover:underline"
            >
              Clear
            </button>
          ) : null}
          {onRefresh ? (
            <button
              type="button"
              disabled={isFetching}
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              title="Re-fetch Knowledge status for the current view"
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                "text-muted-foreground hover:bg-accent hover:text-foreground",
                isFetching && "pointer-events-none opacity-50",
              )}
            >
              <RefreshCw
                className={cn(
                  "h-3 w-3",
                  isFetching && "animate-spin",
                )}
                aria-hidden="true"
              />
              Refresh
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col">
        {STATUS_META.map((row) => {
          const checked = selected.has(row.status);
          const count = counts?.[row.status] ?? 0;
          const dim = count === 0 && !checked;
          return (
            <button
              key={row.status}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle(row.status);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent",
                checked && "bg-accent",
                dim && "opacity-60",
              )}
            >
              <Checkbox
                checked={checked}
                aria-label={row.label}
                className="pointer-events-none"
                tabIndex={-1}
              />
              <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {row.swatch}
              </span>
              <span className="flex-1 truncate font-medium text-foreground">
                {row.label}
              </span>
              <span className="tabular-nums text-[10px] text-muted-foreground">
                {count > 0 ? count.toLocaleString() : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
