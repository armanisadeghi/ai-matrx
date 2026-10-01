"use client";

// lib/wizard-draft/RunStoppedNotice.tsx
//
// The one notice that goes with `useTabBoundRun`'s `stopped`: what stopped,
// one button that repeats the same request, and a dismiss. Same frame as
// `WizardDraftRestored` beside it.

import { CircleAlert, RotateCcw, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface RunStoppedNoticeProps {
  /** One line: "Making 10 cards stopped when the page closed." */
  message: string;
  /** Repeat the same request — or, for a run stopped while saving, open what it saved to. */
  onRedo: () => void;
  onDismiss?: () => void;
  redoLabel?: string;
  /** Default: the redo arrow. A run stopped while saving opens instead of redoing. */
  redoIcon?: LucideIcon;
}

export function RunStoppedNotice({
  message,
  onRedo,
  onDismiss,
  redoLabel = "Try again",
  redoIcon: RedoIcon = RotateCcw,
}: RunStoppedNoticeProps) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-muted/50 px-4 py-3"
    >
      <CircleAlert className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="min-w-0 flex-1 text-sm text-foreground">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRedo} className="min-h-[36px] gap-1.5">
        <RedoIcon className="h-3.5 w-3.5" />
        {redoLabel}
      </Button>
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          aria-label="Hide this message"
          className="min-h-[36px] px-2 text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
