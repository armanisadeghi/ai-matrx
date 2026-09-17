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
// Plain English for someone who has never used software like this: what
// happened, and the two things they can do about it.

import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WizardDraftRestoredProps {
  /**
   * What was put back, in the person's words — completes "We put back
   * <what> from last time." Keep it concrete ("what you started writing").
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
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-muted/50 px-4 py-3"
    >
      <RotateCcw className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <p className="min-w-[12rem] flex-1 text-sm text-foreground">
        We put back {what} here last time. Change it, or start fresh.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onStartFresh}
        className="min-h-[36px]"
      >
        {startFreshLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDismiss}
        aria-label="Keep it and hide this message"
        className="min-h-[36px] px-2 text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
