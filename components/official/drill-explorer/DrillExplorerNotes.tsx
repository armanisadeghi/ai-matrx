"use client";

// components/official/drill-explorer/DrillExplorerNotes.tsx — WHAT THE ANSWER'S NOTE ROW SAYS, AS STATE
// (lane DRILL-LIVE-FIXES; policy common-docs/policies/interface-text-is-layout.md, Arman 2026-09-30).
//
// The note row under the answer used to be a paragraph: the auto grain's reason, the reconciliation
// sentence, the open view's conditions, "the schedule is behind", every knob that could not be read with
// its remedy, and every sentence the door said — one line that wrapped to four on a phone. Each is now a
// chip in one row, its label ≤ 3 words and its detail in a tooltip (≤ 140) or, for the door's own
// sentences (server text, several at once), a "Notes" popover listing them.
//
//   By day          the auto grain, when the person grouped by time          (tooltip: why)
//   Model calls 80% the reconciliation, measured                             (tooltip: the two numbers)
//   View: <name> ✕  the open Saved view's extra conditions                   (tooltip: the conditions)
//   Defaults        a setting that could not be read (package line in use)   (tooltip: which)
//   Notes (n)       the door's sentences + a name lookup that failed          (popover)
//   Recount failed  the host's recount error                                 (tooltip)

import { X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";

import { InfoHint } from "@/components/official/InfoHint";

import { Button } from "@ai-matrx/design-system/controls";
export interface DrillNoteChip {
  key: string;
  label: string;
  /** One sentence, ≤ 140 characters. */
  tip?: string | undefined;
  tone?: "muted" | "warn" | "error";
  attrs?: Record<string, string> | undefined;
  /** A close control (the open view's "show without its conditions"). */
  onClear?: { label: string; run: () => void } | undefined;
}

/** A tooltip never runs past its budget: a longer sentence is cut at a word with an ellipsis. */
export function tipWords(text: string, budget = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= budget) return t;
  const cut = t.slice(0, budget - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > budget * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.—-]+$/, "")}…`;
}

const TONE: Record<NonNullable<DrillNoteChip["tone"]>, string> = {
  muted: "bg-muted text-muted-foreground",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  error: "bg-destructive/10 text-destructive-ink",
};

export function DrillExplorerNotes({ chips, notes }: { chips: readonly DrillNoteChip[]; notes: readonly string[] }) {
  if (chips.length === 0 && notes.length === 0) return null;
  return (
    <span data-drill-explorer-notes className="inline-flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span
          key={c.key}
          {...c.attrs}
          className={`inline-flex max-w-[16rem] items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${TONE[c.tone ?? "muted"]}`}
        >
          <span className="truncate">{c.label}</span>
          {c.tip ? <InfoHint text={tipWords(c.tip)} label={c.label} /> : null}
          {c.onClear ? (
            <Button variant="quiet" icon={<X />} aria-label={c.onClear.label} title={c.onClear.label} data-drill-explorer-carried-drop onClick={c.onClear.run} />
          ) : null}
        </span>
      ))}
      {notes.length > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" data-drill-explorer-says className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
              {`Notes (${notes.length})`}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] p-2">
            <ul className="space-y-1.5 type-secondary text-muted-foreground">
              {notes.map((n) => (
                <li key={n} data-drill-explorer-said>
                  {n}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </span>
  );
}
