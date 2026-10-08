/**
 * features/admin/performance-watch/service.ts
 *
 * Reads for /administration/reporting/performance. A watch is an `ops.proof_check` row with
 * `kind='perf'`; its history is `ops.perf_sample` (common-docs/systems/architecture/observability/
 * performance-watch/PLAN.md §1, §3). Both are platform-admin-read: the browser client on
 * /administration carries the admin lane (`utils/supabase/adminLane.ts`). This module never writes.
 *
 * The perf columns are not in the generated types yet, so the client is used untyped and the rows
 * are the narrow shapes in model.ts.
 */

import { readAllRows } from "@ai-matrx/data/db";
import { createClient } from "@/utils/supabase/client";
import type { PerfSample, PerfWatch } from "./model";

const WATCH_COLUMNS =
  "id, slug, label, owner, source_feature, is_active, live_every_seconds, perf_kind, perf_subject, budget_ms, budget_stat, perf_state, perf_state_since, perf_baseline_ms, perf_baseline_pinned, perf_last_alert_at";
const SAMPLE_COLUMNS =
  "id, check_id, measured_at, source, n, p50_ms, p95_ms, max_ms, mean_ms, calls, errors, bytes, release_sha, state_after, note";

export interface PerfSnapshot {
  watches: PerfWatch[];
  /** Samples of the last 7 days for every watch (list view: newest number + sparkline). */
  recent: PerfSample[];
}

export interface PerfSource {
  loadSnapshot: () => Promise<PerfSnapshot>;
  /** Every sample of one watch, newest first. */
  loadHistory: (watchId: string) => Promise<PerfSample[]>;
}

type Untyped = {
  schema: (s: string) => { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
};

function ops() {
  return (createClient() as unknown as Untyped).schema("ops");
}

async function loadSnapshot(): Promise<PerfSnapshot> {
  const since = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
  const watches = await readAllRows<PerfWatch>(
    ({ from, to }) =>
      ops()
        .from("proof_check")
        .select(WATCH_COLUMNS, { count: "exact" })
        .eq("kind", "perf")
        .is("deleted_at", null)
        .order("slug", { ascending: true })
        .range(from, to),
    { label: "ops.proof_check (perf watches)" },
  );
  const recent = await readAllRows<PerfSample>(
    ({ from, to }) =>
      ops()
        .from("perf_sample")
        .select(SAMPLE_COLUMNS, { count: "exact" })
        .is("deleted_at", null)
        .gte("measured_at", since)
        .order("measured_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "ops.perf_sample (last 7 days)" },
  );
  return { watches, recent };
}

async function loadHistory(watchId: string): Promise<PerfSample[]> {
  return readAllRows<PerfSample>(
    ({ from, to }) =>
      ops()
        .from("perf_sample")
        .select(SAMPLE_COLUMNS, { count: "exact" })
        .eq("check_id", watchId)
        .is("deleted_at", null)
        .order("measured_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    { label: `ops.perf_sample (watch ${watchId})` },
  );
}

export const livePerfSource: PerfSource = { loadSnapshot, loadHistory };
