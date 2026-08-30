"use client";

// features/mandates/admin/MandateCoverageBoard.tsx
//
// THE COVERAGE BOARD — three counted tiles that filter the list, in the shape
// Arman rated best (SurfacesContainer's readiness rollup): a scoreboard IS the
// work order. Clicking a tile narrows the table to that bucket; clicking it
// again clears.
//
// The two tiles that matter carry their rows INLINE. "33 running on fallback"
// is not a work queue until you can see WHICH mandates and WHOSE Holder is
// carrying them — so orange names its leader and red names its reason, both
// one click from the workbench.

import { CircleAlert, CircleCheck, CircleDashed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  COVERAGE_META,
  type MandateCoverageBucket,
  type MandateCoverageResponse,
} from "@/features/mandates/coverage";

/** How many named rows a strip shows before it counts the rest. */
export const COVERAGE_NAMED_ROW_CAP = 6;

export interface MandateCoverageBoardProps {
  report: MandateCoverageResponse | null;
  loading: boolean;
  /** Verbatim server failure — the board degrades honestly, never to zeros. */
  error: string | null;
  active: MandateCoverageBucket | null;
  onToggle: (bucket: MandateCoverageBucket) => void;
  /** Open a mandate's workbench by key. Absent keys are simply not linked. */
  onOpenMandate: (mandateKey: string) => void;
}

export function MandateCoverageBoard({
  report,
  loading,
  error,
  active,
  onToggle,
  onOpenMandate,
}: MandateCoverageBoardProps) {
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">Coverage is unavailable.</div>
          <div className="text-muted-foreground">
            No mandate can be called assigned or unassigned until aidream
            answers: {error}
          </div>
        </div>
      </div>
    );
  }

  const counts = report?.counts ?? null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {(
          [
            { bucket: "green", icon: CircleCheck },
            { bucket: "orange", icon: CircleDashed },
            { bucket: "red", icon: CircleAlert },
          ] as const
        ).map(({ bucket, icon: Icon }) => {
          const meta = COVERAGE_META[bucket];
          const isActive = active === bucket;
          const count = counts ? counts[bucket] : null;
          return (
            <button
              key={bucket}
              type="button"
              onClick={() => onToggle(bucket)}
              disabled={count === null}
              title={`${meta.description} — click to ${isActive ? "clear the" : "filter by this"} coverage filter`}
              aria-pressed={isActive}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                isActive
                  ? "border-primary bg-muted/40 ring-1 ring-primary"
                  : "border-border bg-card hover:bg-muted/30",
                count === null && "opacity-60",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.iconClassName)} />
                <span className="truncate text-[11px] font-medium">
                  {meta.label}
                </span>
              </span>
              <span className="text-base font-semibold leading-none tabular-nums">
                {count === null ? (loading ? "…" : "—") : count}
              </span>
            </button>
          );
        })}
      </div>

      {report && report.orange.length > 0 ? (
        <NamedRows
          tone="orange"
          heading={`${report.orange.length} running on a fallback Holder`}
          rows={report.orange.map((row) => ({
            key: row.mandate_key,
            detail: row.leader_key
              ? `carried by ${row.leader_key}`
              : row.reason,
          }))}
          onOpenMandate={onOpenMandate}
        />
      ) : null}

      {report && report.red.length > 0 ? (
        <NamedRows
          tone="red"
          heading={`${report.red.length} with nothing assigned`}
          rows={report.red.map((row) => ({
            key: row.mandate_key,
            detail: row.reason,
          }))}
          onOpenMandate={onOpenMandate}
        />
      ) : null}
    </div>
  );
}

function NamedRows({
  tone,
  heading,
  rows,
  onOpenMandate,
}: {
  tone: "orange" | "red";
  heading: string;
  rows: { key: string; detail: string }[];
  onOpenMandate: (mandateKey: string) => void;
}) {
  const shown = rows.slice(0, COVERAGE_NAMED_ROW_CAP);
  const rest = rows.length - shown.length;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-md border px-3 py-2 text-xs",
        tone === "orange"
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-rose-500/40 bg-rose-500/10",
      )}
    >
      <span
        className={cn(
          "font-medium",
          tone === "orange"
            ? "text-amber-700 dark:text-amber-400"
            : "text-rose-700 dark:text-rose-400",
        )}
      >
        {heading}
      </span>
      {shown.map((row) => (
        <Button
          key={row.key}
          size="sm"
          variant="outline"
          className="h-6 font-mono text-[11px]"
          title={row.detail}
          onClick={() => onOpenMandate(row.key)}
        >
          {row.key}
        </Button>
      ))}
      {rest > 0 ? (
        <span className="text-[11px] text-muted-foreground">
          +{rest} more — filter the tile above to see them all
        </span>
      ) : null}
    </div>
  );
}
