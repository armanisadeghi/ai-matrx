"use client";

// features/masterwork/runPrice.tsx
//
// THE PRICE OF ONE MASTERWORK RUN, BEFORE THE CLICK (cold walk 23, defect F).
//
// The Bench dialog has priced its trial since cold walk 16 from "what one run
// of your Masterwork last cost" (aidream
// `services/masterworks/bench/service.py::last_run_cost_usd`: the newest of the
// last three FINISHED runs whose summed `node_outcome.output.usage.cost_usd`
// is above zero). The run box beside it priced nothing, so an Expert learned a
// $1.39 run cost from its row afterwards. This is that same derivation, read
// through the one recent-runs reader (`listRecentRunsForMasterworks`, which
// the server's docstring names as its own source), and rendered through the
// canonical cost chip — points for everyone, dollars only for a system admin
// who flipped the switch. No estimator of our own.

import { useEffect, useState } from "react";
import { CostBadge } from "@/components/cost/CostBadge";
import { listRecentRunsForMasterworks, type MasterworkRun } from "./service";

/** Same window as the server's `last_run_cost_usd` (`.limit(3)` on finished runs). */
const FINISHED_RUNS_PRICED_FROM = 3;
/** Runs read to find those three finished ones among failed and running rows. */
const RUNS_SCANNED = 10;

/** The newest finished run that was priced, among the last three finished. */
export function lastPricedRunCost(runs: MasterworkRun[]): number | null {
  const finished = runs
    .filter((r) => r.status === "completed")
    .slice(0, FINISHED_RUNS_PRICED_FROM);
  for (const r of finished) {
    if (typeof r.cost_usd === "number" && r.cost_usd > 0) return r.cost_usd;
  }
  return null;
}

/**
 * `undefined` while reading or when the read failed (nothing is shown — the
 * box never blanks over a price), `null` when no run has been priced yet,
 * else USD. `refreshKey` re-reads after a run finishes, so the figure after
 * the click is the one just spent.
 */
export function useLastRunCost(
  masterworkId: string,
  refreshKey: number,
): number | null | undefined {
  const [cost, setCost] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() =>
        listRecentRunsForMasterworks([masterworkId], {
          perMasterwork: RUNS_SCANNED,
        }),
      )
      .then((byMasterwork) => {
        if (!cancelled)
          setCost(lastPricedRunCost(byMasterwork[masterworkId] ?? []));
      })
      .catch(() => {
        // The price is enrichment beside the button; a refused read leaves
        // the previous figure (or none), never a dead box.
      });
    return () => {
      cancelled = true;
    };
  }, [masterworkId, refreshKey]);
  return cost;
}

/** "Last run · 27,800 points" beside Run it; "Last run · —" before any priced run. */
export function MasterworkRunPrice({
  masterworkId,
  refreshKey,
}: {
  masterworkId: string;
  refreshKey: number;
}) {
  const cost = useLastRunCost(masterworkId, refreshKey);
  if (cost === undefined) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      data-masterwork-run-price={cost === null ? "unknown" : "known"}
    >
      Last run
      <CostBadge usd={cost} />
    </span>
  );
}
