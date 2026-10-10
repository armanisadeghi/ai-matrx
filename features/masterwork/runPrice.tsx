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
import { InfoHint } from "@/components/official/InfoHint";
import { callApi } from "@/lib/api/call-api";
import { postgrestError } from "@/lib/failure/postgrestError";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { paths } from "@ai-matrx/agents/generated/api-types";
import { supabase } from "@/utils/supabase/client";
import { myRunsCreatedBy } from "./encore/service";

/**
 * WHOSE RUNS THE PRICE IS TAKEN FROM — the same runs the host page lists
 * (cold walk 23 leftover). Row security lets an organization member read a
 * teammate's runs, so an unscoped read priced her box from someone else's run
 * while the history beside it listed only hers.
 *
 * - `mine`: runs the viewer started (Encore's "Your recent runs"; any box with
 *   no run list beside it — a price she cannot trace to a run she can see is
 *   the defect).
 * - `visible`: every run row security shows her — only where the page lists
 *   exactly those (the Rulebook's Masterworks page).
 */
export type RunPriceScope = "mine" | "visible";

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
  onlyCreatedBy: string | null,
): Promise<number | null> {
  let runQuery = supabase
    .schema("workflow")
    .from("run")
    .select("id")
    .eq("definition_id", masterworkId)
    .eq("status", "completed")
    .is("deleted_at", null);
  if (onlyCreatedBy) runQuery = runQuery.eq("created_by", onlyCreatedBy);
  const { data: runs, error } = await runQuery
    .order("created_at", { ascending: false })
    .limit(FINISHED_RUNS_PRICED_FROM);
  if (error) throw postgrestError(error, { action: "pricing the finished runs", fallback: "The database refused the read with no reason given." });
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
  scope: RunPriceScope,
): number | null | undefined {
  const [read, setRead] = useState<{
    masterworkId: string;
    cost: number | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => (scope === "mine" ? myRunsCreatedBy() : null))
      .then((createdBy) => readLastRunCost(masterworkId, createdBy))
      .then((cost) => {
        if (!cancelled) setRead({ masterworkId, cost });
      })
      // read-gate-exempt: the last-run price is enrichment beside the Run button; a refused read leaves the figure absent, not wrong
      .catch(() => {
        // The price is enrichment beside the button; a refused read leaves
        // the previous figure (or none), never a dead box.
      });
    return () => {
      cancelled = true;
    };
  }, [masterworkId, refreshKey, scope]);
  // Another Masterwork's price never shows while this one's is being read.
  return read && read.masterworkId === masterworkId ? read.cost : undefined;
}

/**
 * THE PRICE BEFORE THE FIRST RUN (cold walk 24, defect F). Until a Masterwork
 * has run, `useLastRunCost` is null and the first run — the one a first-time
 * Expert makes — was unpriced. aidream
 * `services/masterworks/bench/service.py::estimated_first_run_cost_usd` prices
 * it from the newest finished runs of like Masterworks (same kind, same number
 * of AI steps when enough share it). A SERVER read on purpose: those runs are
 * other people's, which row security never shows her; only the median leaves.
 *
 * Becomes `satisfies keyof paths` once `pnpm sync-types` picks the route up
 * (the BENCH_PROOF_PATH precedent).
 */
export const RUN_ESTIMATE_PATH =
  "/masterworks/{masterwork_id}/run-estimate" as keyof paths;

interface RunEstimateWire {
  estimated_cost_usd: number | null;
  priced_runs: number;
  basis: string | null;
}

/**
 * `undefined` while reading (or not asked), `null` when the server has no
 * estimate or the read failed — the box then says "—", never a dead space —
 * else USD.
 */
export function useFirstRunEstimate(
  masterworkId: string,
  enabled: boolean,
): number | null | undefined {
  const dispatch = useAppDispatch();
  const [read, setRead] = useState<{
    masterworkId: string;
    cost: number | null;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.resolve(
      dispatch(
        callApi({
          path: RUN_ESTIMATE_PATH,
          method: "GET",
          pathParams: { masterwork_id: masterworkId } as never,
          // A viewer who cannot open the Masterwork simply gets "—".
          expectedErrorStatuses: [403],
        }),
      ),
    )
      .then((result) => {
        const wire = (result as { data?: RunEstimateWire }).data;
        const cost = wire?.estimated_cost_usd;
        return typeof cost === "number" && cost > 0 ? cost : null;
      })
      .catch(() => null)
      .then((cost) => {
        if (!cancelled) setRead({ masterworkId, cost });
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, masterworkId, enabled]);
  if (!enabled) return undefined;
  return read && read.masterworkId === masterworkId ? read.cost : undefined;
}

/**
 * "Last run · 27,800 points" beside Run it; before the first priced run,
 * "Estimate · 12,000 points" from like Masterworks, else "Last run · —".
 */
export function MasterworkRunPrice({
  masterworkId,
  refreshKey,
  scope,
}: {
  masterworkId: string;
  refreshKey: number;
  scope: RunPriceScope;
}) {
  const cost = useLastRunCost(masterworkId, refreshKey, scope);
  const estimate = useFirstRunEstimate(masterworkId, cost === null);
  if (cost === undefined) return null;
  if (cost === null && estimate === undefined) return null;
  if (cost === null && typeof estimate === "number") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        data-masterwork-run-price="estimate"
      >
        Estimate
        <CostBadge usd={estimate} />
        <InfoHint text="Typical cost of recent runs of Masterworks like this one." />
      </span>
    );
  }
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
