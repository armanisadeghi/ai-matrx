"use client";

// features/masterwork/sitting/SittingResumed.tsx
//
// WHAT A LANE SAYS WHEN IT PUTS WORK BACK.
//
// A silent restore is its own kind of lie, and so is a silent loss. Every
// Masterwork capture lane that keeps a sitting renders exactly this, in the
// Expert's own words, with the one control that matters: throw it away.
//
// It is a NOTICE, never an alarm — nothing went wrong, the product simply did
// not lose her work.

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SittingResumed({
  /** What was put back, in the Expert's words: "the work you were marking up". */
  what,
  onDiscard,
  onAcknowledge,
}: {
  what: string;
  onDiscard: () => void;
  onAcknowledge?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-muted/50 px-3 py-2">
      <RotateCcw className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="flex-1 text-sm text-foreground">
        We kept {what} from last time and put it back. Carry on where you left
        off, or start again with nothing.
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onDiscard}>
          Start again
        </Button>
        {onAcknowledge ? (
          <Button size="sm" variant="ghost" onClick={onAcknowledge}>
            Got it
          </Button>
        ) : null}
      </div>
    </div>
  );
}
