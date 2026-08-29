"use client";

/**
 * InstantProcessSheet — the INSTANT lane's result surface: a bottom drawer
 * over the capture screen that streams the intake analysis LIVE as the agent
 * writes it, and that OPENS ON THE SAVED RECORD when you come back to an item
 * you already processed. Rendering rides the ONE canonical pipeline
 * (`<LiveRunDisplay variant="bare">` while a run is bound;
 * `<KindInstanceRender>` for the stored record) — both land on the registered
 * `electronics_intake_analysis` kind component, so live and remembered look
 * identical. Nothing here parses or buckets a stream.
 *
 * 🚨 THE DRAWER IS FULL HEIGHT FROM THE FIRST FRAME. Vaul's `DrawerContent`
 * ships `h-auto`, so a drawer that opens empty and fills with streamed content
 * grows under the reader's thumb for the whole run — the sheet moves while
 * they are trying to read it. `h-[88dvh]` fixes the frame up front and the
 * body scrolls inside it. Do not swap it back to a `max-h-*` cap.
 *
 * Nothing in this drawer owns the result: persistence happened in
 * `useInstantAnalysis` (pointer → result seam → recovery), so closing it,
 * leaving the route, or backgrounding the phone can never lose a run.
 */

import React from "react";
import { BrainCircuit, CheckCircle2, Loader2, PackagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";

import { INSTANT_ANALYSIS_KIND } from "../pipeline-types";

export interface InstantProcessSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  /** The run has been triggered (may precede the conversation existing). */
  pending: boolean;
  isRunning: boolean;
  error: string | null;
  /** The item's saved analysis — this run's, or one from an earlier visit. */
  storedResult: Record<string, unknown> | null;
  /** Rehydrating an earlier run for this item. */
  restoring: boolean;
  /** Run the analysis again on the item's current photos. */
  onReanalyze: () => void;
  /** Close the sheet and advance the capture flow to a fresh item. */
  onNextItem: () => void;
}

export function InstantProcessSheet({
  open,
  onOpenChange,
  conversationId,
  pending,
  isRunning,
  error,
  storedResult,
  restoring,
  onReanalyze,
  onNextItem,
}: InstantProcessSheetProps) {
  // A settled result renders from the SAVED record, not from the transcript:
  // it is the same kind component either way, it cannot get stuck behind a
  // rehydration that returned no request row, and it is what actually
  // persisted. The live path owns the frame only while a run is bound.
  const showStored = Boolean(storedResult) && !isRunning && !pending;
  const storedKind =
    typeof storedResult?.__kind === "string"
      ? storedResult.__kind
      : INSTANT_ANALYSIS_KIND;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[88dvh]">
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle className="flex items-center gap-2 text-base">
            Instant analysis
            {isRunning && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {!isRunning && storedResult && (
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                Saved to the item
              </span>
            )}
          </DrawerTitle>
          <DrawerDescription>
            {isRunning
              ? "The agent is reading this item's photos — results stream in as it works."
              : error
                ? error
                : storedResult
                  ? "This item's saved analysis. Re-analyze after adding photos."
                  : restoring
                    ? "Looking for this item's earlier analysis…"
                    : "Review the analysis, then move on to the next item."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {showStored ? (
            <KindInstanceRender
              kind={storedKind}
              value={storedResult}
              variant="bare"
            />
          ) : (
            <LiveRunDisplay
              conversationId={conversationId}
              pending={pending || (restoring && !storedResult)}
              variant="bare"
              bodyClassName="max-h-none"
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3 pb-safe">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {storedResult && !isRunning && (
            <Button variant="outline" onClick={onReanalyze}>
              <BrainCircuit className="mr-1.5 h-4 w-4" />
              Re-analyze
            </Button>
          )}
          <Button onClick={onNextItem} disabled={isRunning}>
            <PackagePlus className="mr-1.5 h-4 w-4" />
            Next item
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
