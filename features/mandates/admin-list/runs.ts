// features/mandates/admin-list/runs.ts
//
// PURE + ONE READ: the admin mandate list's RUNS columns (Arman, 2026-10-08:
// "where do I see the number of runs and things like that in the table").
//
// THE SOURCE is `mandate.admin_run_counts(p_since)` — every mandate's run count,
// last run AND cost over the period in ONE database read, all from the same run
// rows as the mandate Test tab's runs list (`mandate.run_history`): ONE
// definition of a mandate's runs (features/mandates/FEATURE.md "A mandate's
// runs"). The Cost and Points columns are these runs' cost. Loaded once per
// period, never awaited by the list.

import { drillWindowRange } from "@ai-matrx/design-system/data-table";
import { supabase } from "@/utils/supabase/client";
import { DEFAULT_SPEND_PERIOD } from "./spend";

/**
 * One mandate's runs over the period; `lastMs` is epoch milliseconds. The
 * inferred share is its Holder agent's runs that carry no mandate name
 * (history from before runs were named) — shown as estimated.
 */
export interface MandateRunsCell {
  runs: number;
  lastMs: number | null;
  /** Dollars those runs cost; `null` = a database answer without costs. */
  usd: number | null;
  inferredRuns: number;
  inferredUsd: number;
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

function numberOf(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** The database answer → cells. Anything unreadable is left out, never zero-filled. */
export function mandateRunsFromAnswer(raw: unknown): MandateRuns {
  const byKey: Record<string, MandateRunsCell> = {};
  if (!raw || typeof raw !== "object") return { byKey };
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as {
      runs?: unknown;
      last?: unknown;
      cost?: unknown;
      inferred_runs?: unknown;
      inferred_cost?: unknown;
    };
    const runs = numberOf(entry.runs);
    if (!key || runs === null) continue;
    const last = typeof entry.last === "string" ? Date.parse(entry.last) : NaN;
    byKey[key] = {
      runs,
      lastMs: Number.isFinite(last) ? last : null,
      usd: numberOf(entry.cost),
      inferredRuns: numberOf(entry.inferred_runs) ?? 0,
      inferredUsd: numberOf(entry.inferred_cost) ?? 0,
    };
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

/**
 * Mandate key → the dollars its runs cost (the Cost / Points columns' source).
 * `unknown` = some cell carried no cost, so an absent key is not "nothing".
 */
export function spendByKeyOf(byKey: Record<string, MandateRunsCell>): {
  byKey: Record<string, number>;
  unknown: boolean;
} {
  const out: Record<string, number> = {};
  let unknown = false;
  for (const [key, cell] of Object.entries(byKey)) {
    if (cell.usd === null) unknown = true;
    else out[key] = cell.usd;
  }
  return { byKey: out, unknown };
}

/** One mandate's cell: no entry once the read landed = no runs in the period. */
export function runsOfKey(
  byKey: Record<string, MandateRunsCell> | null,
  key: string,
): MandateRunsCell | null {
  if (!byKey) return null;
  return byKey[key] ?? { runs: 0, lastMs: null, usd: 0, inferredRuns: 0, inferredUsd: 0 };
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
