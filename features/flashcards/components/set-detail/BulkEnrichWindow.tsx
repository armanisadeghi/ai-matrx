"use client";

/**
 * @registry-status: inline-window
 * BulkEnrichWindow — THE LIVE ENRICHMENT CASCADE.
 *
 * This window used to be a progress bar and a list of status rows. That was
 * mechanically correct and experientially wrong: the platform has a registered,
 * purpose-built `card_enrichment` component, and this surface was showing a
 * spinner instead of it. Now the deck fills up with real content in front of
 * the user — each card mounts the moment its run starts (front and back
 * readable immediately) and its layers materialize inside it one by one, drawn
 * by that component. See `EnrichingCardTile` for the per-card contract.
 *
 * What the window itself owns:
 *   • the honest headline count ("6 of 80 cards enriched") and a Cancel that
 *     actually stops the cursor;
 *   • the cascade order — cards that have been reached, in plan order, with the
 *     untouched tail collapsed to a count instead of eighty dead tiles;
 *   • keeping the active card in view, so watching it requires no scrolling;
 *   • the settling summary: enriched / nothing-to-add / failed / re-enriched by
 *     request / already-had-layers, with failed cards still on screen and their
 *     reasons intact. One failed card never ends the run, and the ending never
 *     rounds a failure away.
 *
 * A floating window (not a block at the top of the page) for the same reason
 * `IllustrateSetWindow` is: the deck must not shove around while the learner
 * reads it. `WindowPanel` renders as a mobile surface below 768px, so the
 * cascade is a single-column feed on a phone.
 *
 * Rendered inline by `SetDetailView` — the run state and its callbacks live in
 * the page.
 */

import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { EnrichingCardTile } from "./EnrichingCardTile";
import {
  bulkEnrichCounts,
  bulkEnrichProgressLabel,
  bulkEnrichSummary,
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
  const { width, height } = computeViewportSize();

  // Cards the run has actually reached. The untouched tail is a count line —
  // mounting a kind renderer per queued card would cost a lot and say nothing.
  const reached = run.cards.filter((c) => c.status !== "waiting");
  const queued = run.cards.length - reached.length;

  // Keep the card being worked on in view without stealing the page's scroll.
  const activeId = run.cards.find((c) => c.status === "running")?.cardId ?? null;
  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!activeId) return;
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

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
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          {live ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
            {live
              ? bulkEnrichProgressLabel(run)
              : run.phase === "cancelled"
                ? `Stopped — ${bulkEnrichSummary(run)}`
                : bulkEnrichSummary(run)}
          </span>
          {live && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
        </div>
        {live && counts.layersAdded > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {counts.layersAdded} new layer
            {counts.layersAdded === 1 ? "" : "s"} written so far
            {run.fromSelection ? " across the cards you picked" : ""}.
          </p>
        )}
        {!live && counts.failed > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The failed cards are untouched — run it again and only they will be
            picked up.
          </p>
        )}
        {!live && run.phase !== "idle" && counts.enriched > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Open any card in Study to read its new layers under &ldquo;More on
            this card&rdquo;.
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {run.cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {run.alreadyEnriched > 0
              ? `Every card in this set already has detail layers (${run.alreadyEnriched}). Nothing to do — select the cards you want more on and run it again.`
              : "No cards to enrich."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {reached.map((card) => (
                <div
                  key={card.cardId}
                  ref={card.cardId === activeId ? activeRef : undefined}
                  className="min-w-0"
                >
                  <EnrichingCardTile card={card} />
                </div>
              ))}
            </div>
            {queued > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {queued} more card{queued === 1 ? "" : "s"}{" "}
                {live ? "queued" : "not started"}.
              </p>
            )}
            {run.alreadyEnriched > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {run.alreadyEnriched} card
                {run.alreadyEnriched === 1 ? "" : "s"} skipped — they already
                have layers. Select them to enrich them anyway.
              </p>
            )}
          </>
        )}
      </div>
    </WindowPanel>
  );
}

function computeViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 720, height: 600 };
  return {
    // Wider than the old status list: this window now shows real card content
    // side by side, and cramming it to 55% made every layer a two-word column.
    width: Math.min(Math.round(window.innerWidth * 0.7), 900),
    height: Math.min(Math.round(window.innerHeight * 0.8), 820),
  };
}

export default BulkEnrichWindow;
