"use client";

// features/agent-shortcuts/components/batch/BatchGridParts.tsx
//
// THE BATCH GRID'S SHARED PARTS.
//
// UI-STANDARD P17 names four mechanics that make a batch grid better than N
// single edits, not merely faster: the three-level cascade, the self-healing
// copied mapping, per-row health that GATES the write, and a fill-down that
// states its own limits. Three of them are pure presentation, and they lived
// inside `BatchGrid.tsx` where only the shortcut grid could reach them.
//
// The one binding UI's batch mode (`features/bindings/batch/`) is a SECOND call
// site for the same mechanics over a different noun — places as rows, a job
// holder's inputs as columns. So the parts moved here and `BatchGrid` imports
// them: one status rule, one kind badge, one fill-down shell, two grids. A copy
// would have been the fork this program exists to stop.
//
// Every WORD is a prop. The mechanic is fixed; the vocabulary belongs to the
// domain — the same rule `SurfaceVariableBinding.sourceLabels` already follows,
// because "surface" is exactly as wrong on a job as "shortcut" was.

import { useState } from "react";
import { AlertTriangle, ArrowDownToLine, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

/** What a row's health is measured in: how much is unmapped, and how much of
 * that is REQUIRED. Red gates the write; amber never does. */
export interface RowAttentionLike {
  unmapped: number;
  requiredUnmapped: number;
}

export interface StatusWords {
  /** e.g. (n) => `${n} required unmapped` */
  red: (count: number) => string;
  amber: (count: number) => string;
  green: string;
}

const DEFAULT_STATUS_WORDS: StatusWords = {
  red: (n) => `${n} required unmapped`,
  amber: (n) => `${n} unmapped`,
  green: "Every input on this row is answered",
};

/**
 * P17.3 — per-row health is a dot with a RULE: red = a required input is
 * unmapped, amber = something is unmapped, green = clean. The dot never
 * explains itself in colour alone: it carries the sentence too.
 */
export function RowStatusDot({
  att,
  words = DEFAULT_STATUS_WORDS,
}: {
  att: RowAttentionLike;
  words?: StatusWords;
}) {
  if (att.requiredUnmapped > 0) {
    const text = words.red(att.requiredUnmapped);
    return (
      <span title={text} aria-label={text} role="img">
        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
      </span>
    );
  }
  if (att.unmapped > 0) {
    const text = words.amber(att.unmapped);
    return (
      <span title={text} aria-label={text} role="img">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
      </span>
    );
  }
  return (
    <span title={words.green} aria-label={words.green} role="img">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
    </span>
  );
}

/**
 * ADD or UPDATE, said on the row before anything is written — so "Apply 4"
 * never surprises anyone with a create they expected to be an edit.
 */
export function RowKindBadge({
  kind,
  addTitle,
  updateTitle,
}: {
  kind: "create" | "update";
  addTitle: string;
  updateTitle: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center rounded px-1 text-[9px] font-semibold uppercase tracking-wide",
        kind === "create"
          ? "bg-primary/10 text-primary"
          : "bg-violet-500/10 text-violet-600 dark:text-violet-400",
      )}
      title={kind === "create" ? addTitle : updateTitle}
    >
      {kind === "create" ? "Add" : "Upd"}
    </span>
  );
}

/**
 * P17.4 — FILL-DOWN, STATING ITS OWN LIMITS. The popover always prints what
 * will and will not carry cleanly to every row BEFORE the button is pressed,
 * because a fill that silently half-lands is the defect this sentence exists to
 * prevent.
 *
 * `label` makes the trigger a WORD instead of an icon. The shortcut grid packs
 * fifteen columns into a viewport and keeps the icon; a mandate screen never
 * puts a control on screen the reader has to decode (P3), so it passes one.
 */
export function FillDownButton({
  limits,
  onApply,
  renderControl,
  label,
  title,
  applyLabel = "Apply to all rows",
  width = "w-72",
}: {
  /** The sentence naming what fills cleanly and what does not. Required. */
  limits: string;
  onApply: (value: unknown) => void;
  renderControl: (value: unknown, set: (next: unknown) => void) => React.ReactNode;
  /** Word on the trigger. Omit for the icon-only trigger. */
  label?: string;
  title: string;
  applyLabel?: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<unknown>(undefined);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "shrink-0 text-muted-foreground transition-colors hover:text-primary",
            label &&
              "inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium normal-case hover:border-primary/40",
          )}
          title={title}
          aria-label={title}
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
          {label ? <span>{label}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn(width, "space-y-2 p-3")}>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {limits}
        </p>
        {renderControl(value, setValue)}
        <Button
          size="sm"
          className="h-8 w-full text-xs"
          onClick={() => {
            onApply(value);
            setOpen(false);
          }}
        >
          {applyLabel}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
