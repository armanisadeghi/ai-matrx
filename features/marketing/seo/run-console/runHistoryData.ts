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
 * merged and rolled up against `chat.request` via the execution_kind/
 * execution_id attribution aidream now stamps on every AI call a run makes
 * (KI-049 attribution fix, 2026-08-25). Both RPCs are admin-gated
 * (`public.is_platform_admin()`), same pattern as the other admin-only
 * reads — this is an /administration surface.
 *
 * Migration: migrations/run_console_attribution_rpcs.sql
 */

import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import type { Database } from "@/types/database.types";

export type RunHistoryEntry =
  Database["public"]["Functions"]["admin_list_run_history"]["Returns"][number];

export type RunAiCall =
  Database["public"]["Functions"]["admin_list_run_ai_calls"]["Returns"][number];

export async function listRunHistory(limit = 50): Promise<RunHistoryEntry[]> {
  const { data, error } = await supabase.rpc("admin_list_run_history", {
    p_limit: limit,
  });
  if (error) throw pgErrorToError(error);
  return data ?? [];
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
