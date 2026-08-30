/**
 * Workflow Battle data layer.
 *
 * READS + VERDICTS go DIRECTLY to Supabase (`workflow.comparison`,
 * RLS-scoped) — the Python server is not a data layer. COMPUTE (start a
 * comparison, re-run one arm) hits the aidream endpoints, which stream; the
 * durable row is the state of record from the first moment, so a disconnect
 * loses nothing.
 */

import type { AppDispatch } from "@/lib/redux/store";
import { callApi, type ApiCallConfig } from "@/lib/api/call-api";
import type { paths } from "@/types/python-generated/api-types";
import { supabase } from "@/utils/supabase/client";

import type { ComparisonRow } from "./types";

// ---------------------------------------------------------------------------
// Reads (direct Supabase)
// ---------------------------------------------------------------------------

export async function fetchComparison(id: string): Promise<ComparisonRow | null> {
  const { data, error } = await supabase
    .schema("workflow")
    .from("comparison")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Could not load the comparison: ${error.message}`);
  return data;
}

export async function listComparisons(limit = 30): Promise<ComparisonRow[]> {
  const { data, error } = await supabase
    .schema("workflow")
    .from("comparison")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not list comparisons: ${error.message}`);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Verdict (direct Supabase — the human's call, written where it lives)
// ---------------------------------------------------------------------------

export async function saveVerdict(args: {
  comparisonId: string;
  winnerLabel: string | null;
  notes: string;
  userId: string | null;
}): Promise<void> {
  const { error } = await supabase
    .schema("workflow")
    .from("comparison")
    .update({
      verdict_winner: args.winnerLabel,
      verdict_notes: args.notes || null,
      verdict_at: args.winnerLabel ? new Date().toISOString() : null,
      verdict_by: args.winnerLabel ? args.userId : null,
    })
    .eq("id", args.comparisonId);
  if (error) throw new Error(`Could not save the verdict: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Workflow + version pickers (direct Supabase, RLS-scoped)
// ---------------------------------------------------------------------------

export interface WorkflowChoice {
  id: string;
  name: string;
  description: string | null;
  version: number;
}

export async function searchWorkflows(query: string): Promise<WorkflowChoice[]> {
  let q = supabase
    .schema("workflow")
    .from("definition")
    .select("id,name,description,version")
    .is("deleted_at", null)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (query.trim()) q = q.ilike("name", `%${query.trim()}%`);
  const { data, error } = await q;
  if (error) throw new Error(`Could not search workflows: ${error.message}`);
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    version: d.version,
  }));
}

export interface VersionChoice {
  versionNumber: number;
  changedAt: string;
  changeNote: string | null;
}

export async function listWorkflowVersions(
  definitionId: string,
): Promise<VersionChoice[]> {
  const { data, error } = await supabase
    .schema("workflow")
    .from("definition_version")
    .select("version_number,changed_at,change_note")
    .eq("definition_id", definitionId)
    .is("deleted_at", null)
    .order("version_number", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Could not list versions: ${error.message}`);
  return (data ?? []).map((v) => ({
    versionNumber: v.version_number,
    changedAt: v.changed_at,
    changeNote: v.change_note,
  }));
}

// ---------------------------------------------------------------------------
// Compute (aidream endpoints — streaming)
// ---------------------------------------------------------------------------

export interface StartComparisonBody {
  title: string;
  shared_inputs: Record<string, unknown>;
  arms: Array<{
    label: string;
    definition_id: string;
    version_number: number | null;
    input_overrides: Record<string, unknown>;
  }>;
  normalization: Record<string, unknown>;
}

/**
 * DELETE-ME CAST: `/workflows/comparisons` shipped server-side in the same
 * change as this file and enters `types/python-generated/api-types.ts` on the
 * next routine `pnpm sync-types` after the server deploy. Until then the path
 * is asserted onto an existing streaming POST path's type. Remove both casts
 * (here and in `rerunComparisonArm`) once sync-types has run.
 */
const START_PATH = "/workflows/comparisons" as "/podcast/races";

function extractComparisonId(streamText: string): string | null {
  // The typed WorkflowComparisonStartedEvent rides the stream as a data
  // event; the comparison_id is the one field this client needs.
  const match = streamText.match(
    /"comparison_id"\s*:\s*"([0-9a-f-]{36})"/i,
  );
  return match ? match[1] : null;
}

export async function startComparison(
  dispatch: AppDispatch,
  body: StartComparisonBody,
): Promise<{ comparisonId: string | null; error: string | null }> {
  const captured: { text: string | null } = { text: null };
  const config: ApiCallConfig<typeof START_PATH, "POST"> = {
    path: START_PATH,
    method: "POST",
    body: body as never,
    stream: true,
    consumeStream: async (response: Response) => {
      captured.text = await response.text();
    },
  };
  const result = await dispatch(callApi(config));
  if (result.error) {
    return {
      comparisonId: null,
      error: result.error.message || "Could not start the comparison.",
    };
  }
  return {
    comparisonId: captured.text ? extractComparisonId(captured.text) : null,
    error: null,
  };
}

/** DELETE-ME CAST — see `START_PATH`. */
const RERUN_PATH =
  "/workflows/comparisons/{comparison_id}/arms/{arm_index}/rerun" as "/podcast/races/{race_id}/arms/{arm}/rerun";

export async function rerunComparisonArm(
  dispatch: AppDispatch,
  comparisonId: string,
  armIndex: number,
): Promise<{ error: string | null }> {
  const config: ApiCallConfig<typeof RERUN_PATH, "POST"> = {
    path: RERUN_PATH,
    method: "POST",
    pathParams: {
      comparison_id: comparisonId,
      arm_index: String(armIndex),
    } as never,
    stream: true,
    consumeStream: async (response: Response) => {
      await response.text();
    },
    // 409 = the arm's lease is live — an expected domain outcome the UI
    // explains, never a system error.
    expectedErrorStatuses: [409],
  };
  const result = await dispatch(callApi(config));
  if (result.error) {
    return { error: result.error.message || "Could not re-run the arm." };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Run cancel — the CANONICAL per-run path (the row carries each arm's run_id)
// ---------------------------------------------------------------------------

export async function cancelArmRun(
  dispatch: AppDispatch,
  runId: string,
): Promise<{ error: string | null }> {
  const path = "/runs/{run_id}/cancel" satisfies keyof paths;
  const result = await dispatch(
    callApi({
      path,
      method: "POST",
      pathParams: { run_id: runId },
    }),
  );
  if (result.error) {
    return { error: result.error.message || "Could not cancel the run." };
  }
  return { error: null };
}
