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

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/spinner";
import { ApproachCard } from "./ApproachCard";
import {
  fetchDistillationApproaches,
  type DistillationApproach,
} from "./approaches";

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
  const [approaches, setApproaches] = useState<DistillationApproach[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // Read on first open, not on mount — the dialog lives on every Rulebook page.
  useEffect(() => {
    if (!open || approaches !== null) return;
    let cancelled = false;
    fetchDistillationApproaches()
      .then((rows) => {
        if (!cancelled) setApproaches(rows);
      })
      .catch((err: unknown) => {
        // LOUD RECOVERY — the surface says what went wrong, never shows an
        // empty catalog as if there were nothing to offer.
        console.error("[masterwork] Approach registry read failed", err);
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load the ways to add.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [open, approaches]);

  const ready = approaches?.filter((a) => a.availability !== "coming_soon") ?? [];
  const soon = approaches?.filter((a) => a.availability === "coming_soon") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
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
          <p className="py-8 text-center text-sm text-destructive">{error}</p>
        ) : approaches === null ? (
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
