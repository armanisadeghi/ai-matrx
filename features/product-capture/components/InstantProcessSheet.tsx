"use client";

/**
 * InstantProcessSheet — the INSTANT lane's result surface: a bottom drawer
 * over the capture screen that streams the intake analysis LIVE as the agent
 * writes it. Rendering rides the ONE canonical pipeline via
 * `<LiveRunDisplay>` (variant "bare" — the drawer is the frame), so the
 * registered `electronics_intake_analysis` kind component appears exactly as
 * it would anywhere else; nothing here parses or buckets the stream.
 *
 * The drawer only shows the run; persistence already happened in
 * `useInstantAnalysis`'s result seam — closing this sheet can never lose the
 * result. "Next item" hands back to the rapid-capture flow.
 */

import React from "react";
import { CheckCircle2, Loader2, PackagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";

export interface InstantProcessSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  /** The run has been triggered (may precede the conversation existing). */
  pending: boolean;
  isRunning: boolean;
  error: string | null;
  /** The result was persisted to the item (payload saved, item processed). */
  saved: boolean;
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
  saved,
  onNextItem,
}: InstantProcessSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88dvh]">
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle className="flex items-center gap-2 text-base">
            Instant analysis
            {isRunning && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {!isRunning && saved && (
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
                : "Review the analysis, then move on to the next item."}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <LiveRunDisplay
            conversationId={conversationId}
            pending={pending}
            variant="bare"
            bodyClassName="max-h-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3 pb-safe">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={false}
          >
            Close
          </Button>
          <Button onClick={onNextItem} disabled={isRunning}>
            <PackagePlus className="mr-1.5 h-4 w-4" />
            Next item
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
