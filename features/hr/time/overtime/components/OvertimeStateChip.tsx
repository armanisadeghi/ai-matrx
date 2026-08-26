"use client";

/**
 * features/hr/time/overtime/components/OvertimeStateChip.tsx
 *
 * 🚨 The `worked-unapproved` and `auto_flagged` chips carry the word **paid** in the chip text
 * itself, not in a tooltip. A tooltip is not read while somebody scans forty rows, and a manager who
 * reads "Unapproved" with no other word beside it will conclude the hours are being held.
 *
 * The tone for those two is `paid-flag` and it is deliberately NOT the destructive/negative tone:
 * red beside an hours figure reads as "there is a problem with the money", and there is not — the
 * money is fine, the management question is open.
 */

import { cn } from "@/lib/utils";
import {
  OT_STATE_LABEL,
  OT_STATE_MEANING,
  OT_STATE_TONE,
  type OtTone,
  type OvertimeQueueState,
} from "../overtimeVocabulary";

const TONE_CLASS: Record<OtTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  attention: "bg-primary/10 text-primary border-primary/30",
  positive: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  negative: "bg-secondary text-secondary-foreground border-border",
  // Amber, never red: the pay is correct; only the review is open.
  "paid-flag": "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/40",
};

export function OvertimeStateChip({
  state,
  className,
}: {
  state: OvertimeQueueState;
  className?: string;
}) {
  return (
    <span
      title={OT_STATE_MEANING[state]}
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
        TONE_CLASS[OT_STATE_TONE[state]],
        className,
      )}
    >
      {OT_STATE_LABEL[state]}
    </span>
  );
}
