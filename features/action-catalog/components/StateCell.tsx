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

import { Braces, Check, Clock, Loader2, Minus } from "lucide-react";

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
export function StateCell({
  state,
  toggleLabel,
  inspectLabel,
  busy = false,
  onToggle,
  onInspect,
}: {
  state: ActionState;
  toggleLabel?: string;
  inspectLabel?: string;
  busy?: boolean;
  onToggle?: () => void;
  onInspect?: () => void;
}) {
  const meta = STATE_META[state];
  const Icon = meta.Icon;
  if (onToggle || onInspect) {
    return (
      <span className="flex h-6 w-full items-center gap-0.5">
        <button
          type="button"
          title={toggleLabel ?? meta.label}
          disabled={!onToggle || busy}
          onClick={onToggle}
          className={cn(
            "inline-flex h-5 min-w-0 flex-1 items-center justify-center rounded-sm transition-colors",
            meta.bg,
            meta.text,
            onToggle && "hover:ring-1 hover:ring-current",
          )}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Icon className="h-3.5 w-3.5" />
          )}
        </button>
        {onInspect ? (
          <button
            type="button"
            title={inspectLabel ?? "Inspect shape"}
            onClick={onInspect}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Braces className="h-3 w-3" />
          </button>
        ) : null}
      </span>
    );
  }
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
