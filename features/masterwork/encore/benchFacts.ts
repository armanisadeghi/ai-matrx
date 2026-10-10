// features/masterwork/encore/benchFacts.ts
//
// THE SAME FACTS, SAID THE SAME WAY, WHEREVER A BENCH TRIAL IS SHOWN.
//
// Two surfaces now render a bench verdict: `AuditionProof`'s BenchLine (the
// banked record on the Encore run page) and `RunTheBench` (a trial finishing
// live in the dialog). A blind panel that reads "blind panel of 3, the
// expert's own work won it" in one place and anything else in the other would
// be two renderers of one fact — and the second would drift. So the sentence
// is built once, here, and both call it.
//
// Nothing about what AuditionProof already rendered changed when this moved:
// the strings are byte-identical to the ones it built inline.

import { type CostUnit } from "@ai-matrx/kit/format";
import { formatViewerCost as formatCost } from "@/components/cost/formatAdminCost";
import { currentCostUnit } from "@/components/cost/costUnit";

/** The trial arm's cost, in the viewer's unit (points for everyone, dollars
 *  only for an admin who flipped the switch). */
export function money(
  usd: number | null | undefined,
  // The SUBSCRIBED rate (`useCostDisplay().rate`), so the figure re-renders
  // when the knob lands.
  rate: number | null,
  unit: CostUnit = currentCostUnit(),
): string | null {
  if (usd === null || usd === undefined) return null;
  return formatCost(usd, { rate, unit });
}

/** Whole seconds, or minutes once a trial arm has run long enough to need them. */
export function duration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || seconds <= 0) return null;
  if (seconds < 90) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export interface BenchFactsInput {
  panel_votes: number;
  gt_in_pool: boolean;
  gt_won: boolean;
  c_cost_usd: number | null;
  c_seconds: number | null;
}

/**
 * The three facts a skeptic asks for first: who judged it, whether the
 * expert's own work won the panel it had to win, and what our arm cost.
 *
 * 🚨 THE VOID RULE IS SAID OUT LOUD HERE. GT in the pool and GT not winning
 * means the trial is void, and this sentence says so on the same line as the
 * panel — never in a footnote under a claim.
 */
export function benchFacts(
  v: BenchFactsInput,
  rate: number | null,
  unit: CostUnit = currentCostUnit(),
): string[] {
  return [
    v.panel_votes > 0
      ? `blind panel of ${v.panel_votes}${
          v.gt_in_pool
            ? v.gt_won
              ? ", the expert's own work won it"
              : ", the expert's own work did NOT win it — the trial is void"
            : ""
        }`
      : null,
    money(v.c_cost_usd, rate, unit)
      ? `our arm cost ${money(v.c_cost_usd, rate, unit)}`
      : null,
    v.c_seconds ? `${Math.round(v.c_seconds)}s` : null,
  ].filter((f): f is string => f !== null);
}

/**
 * THE TRIAL'S PRICE, FORMATTED FOR THE VIEWER (review follow-up, 2026-09-30).
 *
 * The server sends the NUMBER (`typical_run_cost_usd`) and the multiple; the
 * screen formats it through the canonical cost display — points for everyone,
 * dollars only behind the system-admin switch, at the organization's knob
 * rate. It used to arrive as server prose with the amounts baked in, which no
 * viewer setting could reach. The ceiling follows the multiple she typed, so
 * the figure is the one that will actually apply. Null when unpriced: the
 * server's note then says why.
 */
export function benchPriceLine(
  typicalRunUsd: number | null | undefined,
  multiple: number,
  format: (usd: number) => string,
): string | null {
  if (typicalRunUsd === null || typicalRunUsd === undefined) return null;
  if (!Number.isFinite(multiple) || multiple <= 0) return null;
  return (
    `Up to ${format(typicalRunUsd * multiple)} for the costliest arm: ` +
    `${multiple}× your last run (${format(typicalRunUsd)}).`
  );
}
