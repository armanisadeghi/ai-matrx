"use client";

/**
 * StateCell / StateBadge — the one color-coded, non-emoji treatment for an
 * action state. Reused by the grid cells AND the builder's "is this available"
 * banner so the color language is identical everywhere.
 *
 *   yes     → emerald (wired, callable now)
 *   planned → amber   (designed, not yet wired)
 *   no      → muted   (not applicable — not a writable/readable row)
 */

import { Check, Clock, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ActionState } from "@/features/action-catalog/types";

const STATE_META: Record<
  ActionState,
  { label: string; text: string; bg: string; Icon: typeof Check }
> = {
  yes: {
    label: "Yes",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    Icon: Check,
  },
  planned: {
    label: "Planned",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    Icon: Clock,
  },
  no: {
    label: "No",
    text: "text-muted-foreground",
    bg: "bg-muted/40",
    Icon: Minus,
  },
};

/** A dense grid cell — icon-only with a tooltip, tinted background. */
export function StateCell({ state }: { state: ActionState }) {
  const meta = STATE_META[state];
  const Icon = meta.Icon;
  return (
    <span
      title={meta.label}
      className={cn(
        "inline-flex h-5 w-full items-center justify-center rounded-sm",
        meta.bg,
        meta.text,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

/** A labeled badge — for the builder's prominent state read-out and the legend. */
export function StateBadge({ state }: { state: ActionState }) {
  const meta = STATE_META[state];
  const Icon = meta.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium",
        meta.bg,
        meta.text,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}
