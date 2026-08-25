"use client";

/**
 * @registry-status: inline-window
 * BulkEnrichWindow — the live surface for "Enrich every card in this set".
 *
 * Two lives, one window (same shape as `IllustrateSetWindow`, and the same
 * reason: a spinner is never the answer, and a block at the top of the page
 * would shove the deck around while the learner reads it):
 *
 *   1. WHILE RUNNING — a real count ("6 of 80 cards enriched"), a progress bar,
 *      the canonical `LiveRunProgress` rows one per card, and a Cancel that
 *      actually stops the cursor.
 *   2. WHEN IT SETTLES — the truthful summary: enriched / nothing-to-add /
 *      failed / already-had-layers, with the failed cards still listed and
 *      their reasons intact. One failed card never ends the run, and the
 *      ending never rounds a failure away.
 *
 * Rendered inline by `SetDetailView` (not a registered overlay) — the run state
 * and its callbacks live in the page.
 */

import { AlertTriangle, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { LiveRunProgress } from "@/features/agents/components/live-run/LiveRunProgress";
import {
  bulkEnrichCounts,
  bulkEnrichProgressLabel,
  bulkEnrichSummary,
  toBulkEnrichProgressState,
  type BulkEnrichRunState,
} from "./bulkEnrichRun";

export interface BulkEnrichWindowProps {
  run: BulkEnrichRunState;
  setName: string;
  onClose: () => void;
  onCancel: () => void;
}

export function BulkEnrichWindow({
  run,
  setName,
  onClose,
  onCancel,
}: BulkEnrichWindowProps) {
  const live = run.phase === "running";
  const counts = bulkEnrichCounts(run);
  const pct =
    counts.total === 0
      ? 100
      : Math.round((counts.processed / counts.total) * 100);
  const { width, height } = computeViewportSize();

  return (
    <WindowPanel
      id="flashcard-bulk-enrich-window"
      title={live ? `Enriching ${setName}` : `Enrichment done — ${setName}`}
      onClose={onClose}
      minWidth={380}
      minHeight={320}
      width={width}
      height={height}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {/* The headline count — the thing that was missing entirely. */}
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          {live ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : (
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
            {live
              ? bulkEnrichProgressLabel(run)
              : run.phase === "cancelled"
                ? `Stopped — ${bulkEnrichSummary(run)}`
                : bulkEnrichSummary(run)}
          </span>
          {live && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {!live && counts.failed > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The failed cards are untouched — run it again and only they will be
            picked up.
          </p>
        )}
        {!live && run.phase !== "idle" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Open any card in Study to read its new layers under &ldquo;More on
            this card&rdquo;.
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {run.cards.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {run.alreadyEnriched > 0
              ? `Every card in this set already has detail layers (${run.alreadyEnriched}). Nothing to do.`
              : "No cards to enrich."}
          </p>
        ) : (
          <LiveRunProgress progress={toBulkEnrichProgressState(run, setName)} />
        )}
      </div>
    </WindowPanel>
  );
}

function computeViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 640, height: 560 };
  return {
    width: Math.min(Math.round(window.innerWidth * 0.55), 720),
    height: Math.min(Math.round(window.innerHeight * 0.75), 760),
  };
}

export default BulkEnrichWindow;
