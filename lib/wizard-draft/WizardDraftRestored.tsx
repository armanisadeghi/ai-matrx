"use client";

// lib/wizard-draft/WizardDraftRestored.tsx
//
// WE PUT SOMETHING BACK — SAY SO (cold walk 6, 2026-09-17).
//
// A wizard that quietly re-fills its own fields is not being helpful, it is
// lying about what the person is looking at. On /masterwork/new an Expert
// typed her goal, wandered off to the catalog and came back; the textarea
// already held the old sentence with nothing saying so, she read it as the
// empty page she still had to fill in, clicked where her eye landed and typed
// her sentence INTO the old one. The Rulebook was created with
// `prefix + whole sentence + suffix` as its goal.
//
// This is the one notice that goes with `useWizardDraft`'s `applyOnce`.
// One short line says what happened ("From last time", beside the restore
// icon — V5-A: a bare "Restored" said nothing about when; "Restored from last
// time" wrapped on a phone); the "Start fresh"
// button and the dismiss are the two things they can do about it. The longer
// sentence (what was put back) is the accessible name, never a visible line —
// copy law R9, 2026-09-30: a sentence that restates its own button is noise.

import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WizardDraftRestoredProps {
  /**
   * What was put back, in the person's words — the notice's accessible name
   * ("We put back <what> from last time"). Keep it concrete.
   */
  what?: string;
  /** Empty the form and drop the saved draft. */
  onStartFresh: () => void;
  /** "I see it, leave it" — hides the notice, keeps the text. */
  onDismiss: () => void;
  startFreshLabel?: string;
}

export function WizardDraftRestored({
  what = "what you started writing",
  onStartFresh,
  onDismiss,
  startFreshLabel = "Start fresh",
}: WizardDraftRestoredProps) {
  return (
    <div
      role="status"
      aria-label={`We put back ${what} from last time`}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-muted/50 px-4 py-3"
    >
      <RotateCcw className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-sm leading-tight text-foreground">
        From last time
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onStartFresh}
      >
        {startFreshLabel}
      </Button>
      <Button
        type="button"
        variant="quiet"
        onClick={onDismiss}
        aria-label="Keep it and hide this message"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
