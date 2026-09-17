"use client";

// lib/durable-run/DurableRunAgain.tsx
//
// 🚨 A LANE MEANT TO BE USED AGAIN SAYS SO ON THE SCREEN WHERE IT ENDED.
//
// Cold walk 6, finding 7 (2026-09-17). Shadow-the-inbox finished its first
// thread and offered exactly three things: "Review the drafts", "Interview me
// about the gaps", and "Close". The lane's own doors say "Paste a thread" and
// "Upload an export" — singular, one at a time, obviously many over the weeks —
// and the only way to reach a second one was to leave the Rulebook and come
// back in through the same door. Reproduced live that day on a brand-new
// Rulebook: "1 suggested rule added as drafts", and no affordance on screen
// that leads anywhere but out. NO DEAD ENDS
// (`common-docs/policies/no-dead-ends.md`).
//
// It is the same shape on every "add rules from a source" lane — the result
// screen is a terminus, and the thing a person most wants there is another go —
// so this is one control rather than five, and every one of them keeps the
// SAME words for the same movement: back to this lane's own first step, with
// what the last run produced still acknowledged above it.
//
// What it is NOT: a retry (that is `DurableRunFailure`'s "Try that again",
// which repeats the SAME input), and not a navigation — it never leaves the
// dialog, because leaving is what the dead end already made people do.

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DurableRunAgain({
  label,
  onAgain,
  disabled,
}: {
  /**
   * What the person is doing again, in this lane's own words — "Shadow another
   * thread", "Add another source". Always names the THING, never "Start over":
   * nothing already landed is undone by pressing it, and the wording has to say
   * so on its own.
   */
  label: string;
  /** Back to this lane's first step. Never closes the dialog. */
  onAgain: () => void;
  disabled?: boolean;
}) {
  return (
    <Button size="sm" variant="outline" onClick={onAgain} disabled={disabled}>
      <RotateCcw className="size-3.5" />
      {label}
    </Button>
  );
}
