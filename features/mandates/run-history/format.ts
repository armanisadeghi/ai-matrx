// features/mandates/run-history/format.ts
//
// The words and numbers a run row prints. Pure — tested in __tests__.

import { formatCost, type CostUnit, formatDurationMs, formatRelativeTime } from "@ai-matrx/kit/format";
import type { MandateRun, RunHistoryView, RunRung, RunStatus } from "./service";
import { currentCostUnit } from "@/components/cost/costUnit";

export const STATUS_WORDS: Record<RunStatus, string> = {
  succeeded: "Succeeded",
  warned: "Warned",
  failed: "Failed",
  stopped: "Stopped",
  waiting: "Waiting",
  running: "Running",
};

/** Dot colour per status — semantic tokens only. */
export const STATUS_DOT: Record<RunStatus, string> = {
  succeeded: "bg-success",
  warned: "bg-warning",
  failed: "bg-destructive",
  stopped: "bg-muted-foreground",
  waiting: "bg-warning",
  running: "bg-primary",
};

export const RUNG_WORDS: Record<RunRung, string> = {
  system: "System",
  org: "Organization",
  user: "User",
  run: "Direct",
};

export const RUNG_TITLES: Record<RunRung, string> = {
  system: "The system default decided this run.",
  org: "The organization's choice decided this run.",
  user: "The person's own choice decided this run.",
  run: "An explicit choice for this one run decided it (a test, or a choice made on the page itself).",
};

export const RUNG_NOT_RECORDED =
  "Not recorded — this run happened before the level was stamped on every run (27 Sep 2026).";

export function rungWords(rung: RunRung | null): string {
  return rung ? RUNG_WORDS[rung] : "—";
}

export function rungTitle(rung: RunRung | null): string {
  return rung ? RUNG_TITLES[rung] : RUNG_NOT_RECORDED;
}

const WEEK_MS = 7 * 86_400_000;

/** "3m ago" / "2h ago" / "Sep 21" — the list's time column. Within a week the
 *  package's short voice; past it the calendar date the column always showed. */
export function relativeWhen(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  if (now - then < WEEK_MS) return formatRelativeTime(then, { now });
  const date = new Date(then);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
}

export function absoluteWhen(iso: string): string {
  const then = Date.parse(iso);
  return Number.isFinite(then) ? new Date(then).toLocaleString() : iso;
}

/** A run's cost in the viewer's unit ("538 points"; dollars only for a
 *  system admin who flipped the switch); "—" when not known. */
export function costWords(
  cost: number | null,
  rate: number | null,
  unit: CostUnit = currentCostUnit(),
): string {
  return formatCost(cost, { rate, unit });
}

/** "850ms" / "6.2s" / "11s" / "2m 05s"; "—" when not finished. */
export function durationWords(ms: number | null): string {
  return formatDurationMs(ms, { style: "compact" });
}

/** Who ran it, as the row prints it for this seat. */
export function ranByWords(run: MandateRun, view: RunHistoryView): string {
  const person = view === "mine" ? "You" : run.ranByName ?? "Unknown person";
  if (run.ranByKind === "system") {
    return run.ranById ? `System · for ${view === "mine" ? "you" : person}` : "System";
  }
  return person;
}

export function outputWarningTitle(run: MandateRun): string | null {
  if (!run.outputWarned) return null;
  const keys = run.outputMissingKeys;
  return keys.length > 0
    ? `Output may not fit: the ${run.holderType} that ran does not declare ${keys.join(", ")}.`
    : `Output may not fit: the ${run.holderType} that ran does not declare this job's output.`;
}
