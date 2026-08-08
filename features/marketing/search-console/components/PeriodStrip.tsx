"use client";

/**
 * The period strip — one slim row at the top of the Dig Here and Insights
 * tabs stating, in plain dates, exactly what window the results below cover
 * ("Evaluating Jul 9 – Aug 5, 2026 vs Jun 11 – Jul 8, 2026"), flagging an
 * auto-derived compare, and embedding the SAME RangeCompareControl the
 * header uses. Both write URL state, so the header and the strip can never
 * disagree. Deltas without a visible window read as broken — this is the
 * fix, in the one place the user is actually looking.
 */

import { CalendarRange } from "lucide-react";
import {
  RangeCompareControl,
  type RangeCompareValue,
} from "@/features/marketing/search-console/components/RangeCompareControl";
import { describeGscPeriods } from "@/features/marketing/search-console/lib/format";
import type { GscResolvedPeriods } from "@/features/marketing/search-console/types";

export function GscPeriodStrip({
  periods,
  compareAuto = false,
  note,
  value,
  onChange,
  disabled,
}: {
  /** The EFFECTIVE resolved windows (including a forced/auto compare). */
  periods: GscResolvedPeriods;
  /** True when the compare window was auto-derived rather than selected. */
  compareAuto?: boolean;
  /** Replaces the period sentence for views with a fixed window (Juice). */
  note?: string;
  value: RangeCompareValue;
  onChange: (next: RangeCompareValue) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-border bg-card px-2.5 py-1">
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarRange className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0">
          {note ?? describeGscPeriods(periods, compareAuto)}
        </span>
      </p>
      <RangeCompareControl value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}
