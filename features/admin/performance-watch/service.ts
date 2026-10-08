/**
 * features/admin/performance-watch/service.ts
 *
 * Reads for /administration/reporting/performance. A watch is an `ops.proof_check` row with
 * `kind='perf'`; its history is `ops.perf_sample` (common-docs/systems/architecture/observability/
 * performance-watch/PLAN.md §1, §3). Both are platform-admin-read: the browser client on
 * /administration carries the admin lane (`utils/supabase/adminLane.ts`). The one write is the
 * platform-admin edit door `ops.perf_watch_update` (budget, pause/resume, pin baseline; wave 2).
 * Typed by the generated `Database["ops"]`.
 */

import { readAllRows } from "@ai-matrx/data/db";
import { createClient } from "@/utils/supabase/client";
import type { PerfSample, PerfWatch, PerfWatchEdit } from "./model";

const WATCH_COLUMNS =
  "id, slug, label, owner, source_feature, is_active, live_every_seconds, perf_kind, perf_subject, budget_ms, budget_stat, perf_state, perf_state_since, perf_baseline_ms, perf_baseline_pinned, perf_last_alert_at, metadata";
const SAMPLE_COLUMNS =
  "id, check_id, measured_at, source, n, p50_ms, p95_ms, max_ms, mean_ms, calls, errors, bytes, release_sha, state_after, note, metadata";

export interface PerfSnapshot {
  watches: PerfWatch[];
  /** Samples of the last 7 days for every watch (list view: newest number + sparkline). */
  recent: PerfSample[];
}

export interface PerfSource {
  loadSnapshot: () => Promise<PerfSnapshot>;
  /** Every sample of one watch, newest first. */
  loadHistory: (watchId: string) => Promise<PerfSample[]>;
  /** Edit one watch through ops.perf_watch_update (platform admins only). */
  updateWatch: (edit: PerfWatchEdit) => Promise<void>;
}

function ops() {
  return createClient().schema("ops");
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

async function updateWatch(edit: PerfWatchEdit): Promise<void> {
  const { error } = await ops().rpc("perf_watch_update", edit);
  if (error) throw new Error(error.message);
}

export const livePerfSource: PerfSource = { loadSnapshot, loadHistory, updateWatch };
