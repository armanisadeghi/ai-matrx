// features/mandates/admin-list/spend.ts
//
// PURE: the admin mandate list's COST columns' period and model cell (Arman,
// 2026-10-08: "points and actual dollar amounts for a given period").
//
// THE COST is the cost of the mandate's runs over the period — the SAME runs the
// Runs column counts, from the same read (`mandate.admin_run_counts`, ./runs.ts;
// features/mandates/FEATURE.md "A mandate's runs"). It used to be a usage-ledger
// question grouped by `mandate:<key>`, which counted spend the runs did not
// (and missed runs that never carried the name): 221 runs at $0.00 beside
// $109.05 with 0 runs (2026-10-09).
//
// Points are dollars at the `billing.points_per_usd` rate (components/cost),
// exactly as every other admin cost column shows them.

import { MATRX_DRILL_WINDOW_PRESETS } from "@ai-matrx/design-system/data-table";

/** The URL parameter that holds the period. */
export const SPEND_PERIOD_PARAM = "period";

export const DEFAULT_SPEND_PERIOD = "30d";

/** The period choices: the drill window presets (Today … Last 12 months). */
export const SPEND_PERIODS = MATRX_DRILL_WINDOW_PRESETS;

/** The period the address names, or the default for anything it does not know. */
export function parseSpendPeriod(raw: string | null | undefined): string {
  return raw && SPEND_PERIODS.some((preset) => preset.key === raw) ? raw : DEFAULT_SPEND_PERIOD;
}

/**
 * The Model cell: the default Holder's model first (the database puts it
 * there; "Workflow" for a workflow Holder), every other model a binding runs
 * on behind it. `null` = the database answer carried no models.
 */
export function modelCellOf(
  models: readonly string[] | null | undefined,
): { primary: string; others: string[] } | null {
  if (!models || models.length === 0) return null;
  const [primary, ...others] = models;
  return { primary, others };
}
