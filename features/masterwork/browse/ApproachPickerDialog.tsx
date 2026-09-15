"use client";

// features/masterwork/browse/ApproachPickerDialog.tsx
//
// THE APPROACH PICKER ON THE RULEBOOK PAGE.
//
// The registry used to render in exactly two places, both inside the CREATION
// funnel (`/masterwork/new` step 2 and the module home's "Start here" tiles,
// which only link back into `/masterwork/new`). An EXISTING Rulebook — the
// place an Expert actually spends their time — had no picker, no list and no
// door to one: just a hardcoded three-item `Add ▾` menu naming three of the
// nine lanes, with two more reachable only as an unnamed radio inside a
// dialog. This is the one registry-driven surface that replaces it.
//
// It shows the WHOLE catalog, not the startable subset. Arman, 2026-08-20:
// "there were about twenty of these that I had named. Where are those ones? I
// wanna see all of them here. I wanna see cards for them. And if they're not
// available yet, then it needs to say coming soon."
//
// NO DEAD ENDS: an available Approach launches its lane in place (its
// `intake_query` is handed to the page, which owns the lane state) or opens
// its own page (`launch_href`). A coming-soon Approach renders as a named,
// deliberately inert card — never a button that leads nowhere.

import { Layers, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/spinner";
import { ApproachCard } from "./ApproachCard";
import { useApproachRegistry } from "./useApproachRegistry";
import { type DistillationApproach } from "./approaches";

export interface ApproachPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Launch this Approach's lane. The page owns every lane's state. */
  onLaunch: (approach: DistillationApproach) => void;
}

export function ApproachPickerDialog({
  open,
  onOpenChange,
  onLaunch,
}: ApproachPickerDialogProps) {
  // Read on first open, not on mount — the dialog lives on every Rulebook page.
  // W2 sibling: this printed the engine's own message at the Expert and, like
  // the catalog, gave her nothing to press afterwards.
  const { approaches, error, loading, reload } = useApproachRegistry(open);

  const ready = approaches?.filter((a) => a.availability !== "coming_soon") ?? [];
  const soon = approaches?.filter((a) => a.availability === "coming_soon") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-muted-foreground" />
            Ways to add to this Rulebook
          </DialogTitle>
          <DialogDescription>
            Every way we know of to get what you know out of your head and into
            rules. Pick whichever fits the time you have right now — you can use
            as many as you like, in any order.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={reload}>
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        ) : loading || approaches === null ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ready.map((a) => (
                <ApproachCard
                  key={a.key}
                  approach={a}
                  onSelect={() => {
                    onOpenChange(false);
                    onLaunch(a);
                  }}
                />
              ))}
            </div>

            {soon.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    On the way
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Approaches we have designed and approved but not built yet.
                    They are here so you know what is coming — and so you can
                    tell us which one you want first.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {soon.map((a) => (
                    <ApproachCard key={a.key} approach={a} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
