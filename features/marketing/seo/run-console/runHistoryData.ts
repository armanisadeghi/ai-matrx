/**
 * Run Console — run history + per-run AI call detail.
 *
 * Arman's requirement (verbatim): "I need a place where I can go and I can
 * look at the actual runs. And if we made fifty AI calls, I need to be able
 * to click through them one by one and see what they generated, what they
 * did, what the results of them were."
 *
 * Sources: `scheduler.sch_run` (scheduled system tasks) and
 * `seo.collection_run` (durable SEO command runs, provider='aidream'),
 * rolled up against `chat.request` via the execution_kind/execution_id
 * attribution aidream stamps on every AI call a run makes. All three RPCs are
 * admin-gated (`public.is_platform_admin()`).
 *
 * PAGED (2026-09-14). The history read is a stable cursor page
 * (sort_at, execution_kind, execution_id) sized by the knob
 * `marketing.run_console/run_history_page_size`, resolved in the database.
 * A 20-second heartbeat used to fill a fixed 50 rows and bury every SEO run.
 *
 * Migrations: migrations/run_console_attribution_rpcs.sql,
 * migrations/run_console_run_history_paged_filtered.sql
 */

import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@ai-matrx/data";
import type { Database } from "@/types/database.types";
import {
  dayStartIso,
  type RunHistoryFilters,
  type SelectedRunRef,
} from "./runHistoryFilters";

export type RunHistoryEntry =
  Database["public"]["Functions"]["admin_list_run_history"]["Returns"][number];

export type RunHistoryFacet =
  Database["public"]["Functions"]["admin_run_history_facets"]["Returns"][number];

export type RunAiCall =
  Database["public"]["Functions"]["admin_list_run_ai_calls"]["Returns"][number];

/** Where the next page starts — the last row's full sort key. */
export interface RunHistoryCursor {
  at: string;
  kind: string;
  id: string;
}

export interface RunHistoryPage {
  rows: RunHistoryEntry[];
  next: RunHistoryCursor | null;
}

function rangeArgs(filters: RunHistoryFilters) {
  return {
    p_from: dayStartIso(filters.from) ?? undefined,
    // Inclusive calendar day in the UI → exclusive start of the next day here.
    p_to: dayStartIso(filters.to, 1) ?? undefined,
  };
}

export async function listRunHistoryPage(
  filters: RunHistoryFilters,
  cursor: RunHistoryCursor | null,
): Promise<RunHistoryPage> {
  const { data, error } = await supabase.rpc("admin_list_run_history", {
    p_cursor_at: cursor?.at,
    p_cursor_kind: cursor?.kind,
    p_cursor_id: cursor?.id,
    p_kinds: filters.kind ? [filters.kind] : undefined,
    p_task_id: filters.taskId ?? undefined,
    p_operation: filters.operation ?? undefined,
    p_status_groups: filters.statuses.length ? filters.statuses : undefined,
    p_run_id: filters.runId.trim() || undefined,
    p_activity: filters.activity,
    ...rangeArgs(filters),
  });
  if (error) throw pgErrorToError(error);
  const rows = data ?? [];
  const last = rows[rows.length - 1];
  const next =
    last && last.has_more && last.sort_at && last.execution_kind && last.execution_id
      ? { at: last.sort_at, kind: last.execution_kind, id: last.execution_id }
      : null;
  return { rows, next };
}

/** Per task / operation counts for the current kind, status and date filters —
 * the task picker's options and the grouped "left out of this view" rows. */
export async function listRunHistoryFacets(
  filters: RunHistoryFilters,
): Promise<RunHistoryFacet[]> {
  const { data, error } = await supabase.rpc("admin_run_history_facets", {
    p_kinds: filters.kind ? [filters.kind] : undefined,
    p_status_groups: filters.statuses.length ? filters.statuses : undefined,
    ...rangeArgs(filters),
  });
  if (error) throw pgErrorToError(error);
  return data ?? [];
}

/** One run by exact id — a shared link opens its run even when that run is not
 * on the first page of the filtered list. */
export async function getRunHistoryEntry(
  ref: SelectedRunRef,
): Promise<RunHistoryEntry | null> {
  const { data, error } = await supabase.rpc("admin_list_run_history", {
    p_kinds: [ref.kind],
    p_run_id: ref.id,
    p_activity: "all",
  });
  if (error) throw pgErrorToError(error);
  return (data ?? []).find((row) => row.execution_id === ref.id) ?? null;
}

export async function listRunAiCalls(
  executionKind: string,
  executionId: string,
): Promise<RunAiCall[]> {
  const { data, error } = await supabase.rpc("admin_list_run_ai_calls", {
    p_execution_kind: executionKind,
    p_execution_id: executionId,
  });
  if (error) throw pgErrorToError(error);
  return data ?? [];
}
