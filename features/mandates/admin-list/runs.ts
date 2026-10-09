// features/mandates/admin-list/runs.ts
//
// PURE + ONE READ: the admin mandate list's RUNS columns (Arman, 2026-10-08:
// "where do I see the number of runs and things like that in the table").
//
// THE SOURCE is `mandate.admin_run_counts(p_since)` — every mandate's run count
// and last run over the period in ONE database read, with the SAME definition
// of a run as the mandate Test tab's runs list (`mandate.run_history`). Loaded
// once per period beside the spend, never awaited by the list.

import { drillWindowRange } from "@ai-matrx/design-system/data-table";
import { supabase } from "@/utils/supabase/client";
import { DEFAULT_SPEND_PERIOD } from "./spend";

/** One mandate's runs over the period; `lastMs` is epoch milliseconds. */
export interface MandateRunsCell {
  runs: number;
  lastMs: number | null;
}

export interface MandateRuns {
  /** Mandate key → runs. A key absent here had none in the period. */
  byKey: Record<string, MandateRunsCell>;
}

/** The moment the period starts (the same windows the cost column uses). */
export function runsSince(period: string, now: Date = new Date()): string {
  const range = drillWindowRange(period, now) ?? drillWindowRange(DEFAULT_SPEND_PERIOD, now);
  return range?.from ?? now.toISOString();
}

/** The database answer → cells. Anything unreadable is left out, never zero-filled. */
export function mandateRunsFromAnswer(raw: unknown): MandateRuns {
  const byKey: Record<string, MandateRunsCell> = {};
  if (!raw || typeof raw !== "object") return { byKey };
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as { runs?: unknown; last?: unknown };
    const runs = typeof entry.runs === "number" ? entry.runs : Number(entry.runs);
    if (!key || !Number.isFinite(runs)) continue;
    const last = typeof entry.last === "string" ? Date.parse(entry.last) : NaN;
    byKey[key] = { runs, lastMs: Number.isFinite(last) ? last : null };
  }
  return { byKey };
}

/** `p_facts.runs` / `p_facts.lastRun` — only once the period's runs have been read. */
export function runsFactsOf(
  byKey: Record<string, MandateRunsCell> | null,
): { runs?: Record<string, number>; lastRun?: Record<string, number> } {
  if (!byKey) return {};
  const runs: Record<string, number> = {};
  const lastRun: Record<string, number> = {};
  for (const [key, cell] of Object.entries(byKey)) {
    runs[key] = cell.runs;
    if (cell.lastMs !== null) lastRun[key] = Math.floor(cell.lastMs / 1000);
  }
  return { runs, lastRun };
}

/** One mandate's cell: no entry once the read landed = no runs in the period. */
export function runsOfKey(
  byKey: Record<string, MandateRunsCell> | null,
  key: string,
): MandateRunsCell | null {
  if (!byKey) return null;
  return byKey[key] ?? { runs: 0, lastMs: null };
}

/** The mandate's Test tab, on its runs. */
export function runsTabHref(recordHref: string): string {
  return `${recordHref}${recordHref.includes("?") ? "&" : "?"}tab=runs`;
}

/** The read itself (platform admins only; the database refuses anyone else). */
export async function fetchMandateRuns(period: string): Promise<MandateRuns> {
  const { data, error } = await supabase
    .schema("mandate" as never)
    .rpc("admin_run_counts" as never, { p_since: runsSince(period) } as never);
  if (error) {
    throw new Error(
      error.code === "57014"
        ? "The run counts took too long to answer. Try again in a moment."
        : `Run counts: ${error.message}`,
    );
  }
  return mandateRunsFromAnswer(data);
}
