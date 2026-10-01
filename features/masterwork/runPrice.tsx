"use client";

// features/masterwork/runPrice.tsx
//
// THE PRICE OF ONE MASTERWORK RUN, BEFORE THE CLICK (cold walk 23, defect F).
//
// The Bench dialog has priced its trial since cold walk 16 from "what one run
// of your Masterwork last cost" (aidream
// `services/masterworks/bench/service.py::last_run_cost_usd`: the newest of the
// last three FINISHED, non-archived runs whose summed non-archived
// `node_outcome.output.usage.cost_usd` is above zero). The run box beside it
// priced nothing, so an Expert learned a $1.39 run cost from its row
// afterwards. This is that query, clause for clause — no estimator of our
// own — rendered through the canonical cost chip: points for everyone,
// dollars only for a system admin who flipped the switch.
//
// Deliberately NOT `listRecentRunsForMasterworks`: that reader keeps archived
// rows and failed runs in its window and reads run previews this chip never
// shows, so it would price from different runs than the Bench, at three
// queries per box (review of 764317031e).

import { useEffect, useState } from "react";
import { CostBadge } from "@/components/cost/CostBadge";
import { supabase } from "@/utils/supabase/client";

/** Same window as the server's `last_run_cost_usd` (`.limit(3)`). */
const FINISHED_RUNS_PRICED_FROM = 3;

export interface PricedRun {
  status: string;
  cost_usd: number | null;
}

/** The newest finished run that was priced, among the last three finished. */
export function lastPricedRunCost(runs: PricedRun[]): number | null {
  const finished = runs
    .filter((r) => r.status === "completed")
    .slice(0, FINISHED_RUNS_PRICED_FROM);
  for (const r of finished) {
    if (typeof r.cost_usd === "number" && r.cost_usd > 0) return r.cost_usd;
  }
  return null;
}

/** The server's `last_run_cost_usd`, read client-side. Throws on a refused read. */
export async function readLastRunCost(
  masterworkId: string,
): Promise<number | null> {
  const { data: runs, error } = await supabase
    .schema("workflow")
    .from("run")
    .select("id")
    .eq("definition_id", masterworkId)
    .eq("status", "completed")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(FINISHED_RUNS_PRICED_FROM);
  if (error) throw error;
  const ids = (runs ?? []).map((r) => String(r.id));
  if (ids.length === 0) return null;
  const { data: outcomes, error: outcomeError } = await supabase
    .schema("workflow")
    .from("node_outcome")
    // Widened to `string`: the JSON-path alias sends the literal-type parser
    // into TS2589 (the same boundary `listRecentRunsForMasterworks` states).
    .select("run_id, cost:output->usage->>cost_usd" as string)
    .in("run_id", ids)
    .is("deleted_at", null)
    .returns<{ run_id: string; cost: string | null }[]>();
  if (outcomeError) throw outcomeError;
  const total = new Map<string, number>();
  for (const row of outcomes ?? []) {
    const cost = row.cost === null ? NaN : Number(row.cost);
    if (Number.isFinite(cost))
      total.set(row.run_id, (total.get(row.run_id) ?? 0) + cost);
  }
  return lastPricedRunCost(
    ids.map((id) => ({ status: "completed", cost_usd: total.get(id) ?? null })),
  );
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
  const [read, setRead] = useState<{
    masterworkId: string;
    cost: number | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => readLastRunCost(masterworkId))
      .then((cost) => {
        if (!cancelled) setRead({ masterworkId, cost });
      })
      .catch(() => {
        // The price is enrichment beside the button; a refused read leaves
        // the previous figure (or none), never a dead box.
      });
    return () => {
      cancelled = true;
    };
  }, [masterworkId, refreshKey]);
  // Another Masterwork's price never shows while this one's is being read.
  return read && read.masterworkId === masterworkId ? read.cost : undefined;
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
