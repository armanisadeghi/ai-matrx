"use client";

// lib/wizard-draft/WizardAnswersLost.tsx
//
// What a person sees when the URL asks for a later step and the answers that
// step is built from are not there (W43). Plain words, one reason, one way
// forward — never a complete-looking step built from defaults, and never a
// silent bounce back to step 1.

import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WizardAnswersLostProps {
  /** What the person was in the middle of, in their words ("your answers"). */
  what?: string;
  /** Takes them back to the first step. */
  onStartOver: () => void;
  startOverLabel?: string;
}

export function WizardAnswersLost({
  what = "your answers",
  onStartOver,
  startOverLabel = "Start again",
}: WizardAnswersLostProps) {
  return (
    <div
      role="alert"
      className="space-y-4 rounded-xl border border-border bg-card p-6"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-500" />
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">
            We could not find {what}
          </h2>
          <p className="text-sm text-muted-foreground">
            This link points to a later step, but {what} are not on this device
            any more — they may have been saved on another device, or too long
            ago. Nothing was created. Start again and it will only take a
            moment.
          </p>
        </div>
      </div>
      <Button onClick={onStartOver} className="min-h-[44px] gap-2">
        <ArrowLeft className="h-4 w-4" />
        {startOverLabel}
      </Button>
    </div>
  );
}
