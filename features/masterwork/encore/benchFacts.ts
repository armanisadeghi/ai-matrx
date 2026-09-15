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

/** Dollars when it is dollars, cents when a trial arm cost less than one. */
export function money(usd: number | null | undefined): string | null {
  if (usd === null || usd === undefined) return null;
  return usd >= 1 ? `$${usd.toFixed(2)}` : `${(usd * 100).toFixed(1)}¢`;
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
export function benchFacts(v: BenchFactsInput): string[] {
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
    money(v.c_cost_usd) ? `our arm cost ${money(v.c_cost_usd)}` : null,
    v.c_seconds ? `${Math.round(v.c_seconds)}s` : null,
  ].filter((f): f is string => f !== null);
}
