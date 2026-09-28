// features/mandates/run-history/format.ts
//
// The words and numbers a run row prints. Pure — tested in __tests__.

import { formatCost, type CostUnit } from "@ai-matrx/kit/format";
import type { MandateRun, RunHistoryView, RunRung, RunStatus } from "./service";

export const STATUS_WORDS: Record<RunStatus, string> = {
  succeeded: "Succeeded",
  failed: "Failed",
  stopped: "Stopped",
  waiting: "Waiting",
  running: "Running",
};

/** Dot colour per status — semantic tokens only. */
export const STATUS_DOT: Record<RunStatus, string> = {
  succeeded: "bg-success",
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

/** "3m ago" / "2h ago" / "Sep 21" — the list's time column. */
export function relativeWhen(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
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
export function costWords(cost: number | null, unit: CostUnit = "points"): string {
  return formatCost(cost, { unit });
}

/** "850ms" / "11.0s" / "2m 05s"; "—" when not finished. */
export function durationWords(ms: number | null): string {
  if (ms === null || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
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
