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

import { createClient } from "@/utils/supabase/client";
import type { PerfCollector, PerfSample, PerfVitals, PerfWatch, PerfWatchEdit } from "./model";


export interface PerfSnapshot {
  watches: PerfWatch[];
  /** Per watch: newest sample and markers (with their words) and up to BOARD_POINTS evenly spaced numbers of the last 7 days. */
  recent: PerfSample[];
  /** Every perf cron job's newest run (the probe's two seat groups included). */
  collectors: PerfCollector[];
  /** Page-speed loads per route over the roll-up window; null if the board did not answer with it. */
  vitals: PerfVitals | null;
}

/** Sparkline points kept per watch; the board caps the request at 120 whatever is asked. */
export const BOARD_POINTS = 30;

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
  // One call: every watch + per watch its newest sample, its markers and an evenly spaced sparkline
  // series (ops.perf_watch_board). Paging every raw 7-day sample used to cost hundreds of requests.
  const { data, error } = await ops().rpc("perf_watch_board", { p_days: 7, p_points: BOARD_POINTS });
  if (error) throw new Error(error.message);
  const board = (data ?? {}) as { watches?: PerfWatch[]; recent?: PerfSample[]; collectors?: PerfCollector[]; vitals?: PerfVitals };
  return { watches: board.watches ?? [], recent: board.recent ?? [], collectors: board.collectors ?? [], vitals: board.vitals ?? null };
}

async function loadHistory(watchId: string): Promise<PerfSample[]> {
  // One call: the watch's newest samples (ops.perf_watch_history, default 2,000).
  const { data, error } = await ops().rpc("perf_watch_history", { p_check_id: watchId, p_limit: 2000 });
  if (error) throw new Error(error.message);
  return (data ?? []) as PerfSample[];
}

async function updateWatch(edit: PerfWatchEdit): Promise<void> {
  const { error } = await ops().rpc("perf_watch_update", edit);
  if (error) throw new Error(error.message);
}

export const livePerfSource: PerfSource = { loadSnapshot, loadHistory, updateWatch };
