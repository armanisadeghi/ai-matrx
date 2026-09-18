"use client";

// features/exports/components/IndexProgress.tsx
//
// The index runs on the server whether or not anybody is watching, so this is
// a live readout, never a gate. Two states earn a banner: it is running (the
// count climbs, which is the proof it is alive), and it FAILED — in which case
// it says how much it did index before it broke and offers the retry, because
// "0 of 4 GB, try again" and "31,402 items, then it broke" are different facts
// and only one of them is true.

import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCount } from "../format";
import type { ExportCounts } from "../counts";

export type IndexPhase = "idle" | "starting" | "running" | "completed" | "failed";

export interface IndexState {
  phase: IndexPhase;
  cumulative: number;
  elapsedMs: number;
  message: string | null;
  partialTotal: number | null;
}

export const IDLE_INDEX_STATE: IndexState = {
  phase: "idle",
  cumulative: 0,
  elapsedMs: 0,
  message: null,
  partialTotal: null,
};

/**
 * 🚨 D6: the running readout says `counts.total`, NOT `state.cumulative`.
 *
 * The stream's cumulative is the reader's own progress and the items endpoint
 * counts the rows that are actually browsable; both were on this screen at
 * once, under labels a person reads as the same number. The cumulative still
 * feeds the derivation (it is the only signal before the first page read) —
 * it just no longer reaches the screen on its own. The elapsed seconds and the
 * failure sentence are this banner's own facts and stay here.
 */
export function IndexProgress({
  state,
  counts,
  onRetry,
}: {
  state: IndexState;
  counts: ExportCounts;
  onRetry: () => void;
}) {
  if (state.phase === "starting" || state.phase === "running") {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        <span className="min-w-0 flex-1 truncate">
          {state.phase === "starting" || counts.total.value === null
            ? "Reading the archive…"
            : counts.total.partial
              ? `${formatCount(counts.total.value)} items read so far`
              : `Found ${formatCount(counts.total.value)} items`}
        </span>
        {state.elapsedMs > 0 && (
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {Math.round(state.elapsedMs / 1000)}s
          </span>
        )}
      </div>
    );
  }

  if (state.phase === "failed") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5">
        <p className="flex items-start gap-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0">
            Indexing stopped
            {state.partialTotal !== null && (
              <>
                {" "}
                after {formatCount(state.partialTotal)}{" "}
                {state.partialTotal === 1 ? "item" : "items"}
              </>
            )}
            . {state.message ?? "The server gave no reason."}{" "}
            {state.partialTotal !== null && state.partialTotal > 0 && (
              <>Those items are below and are real — the rest is missing.</>
            )}
          </span>
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" />
          Index it again
        </Button>
      </div>
    );
  }

  return null;
}
