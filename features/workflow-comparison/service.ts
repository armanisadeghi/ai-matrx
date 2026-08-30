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
import { callApi } from "@/lib/api/call-api";
import type { paths } from "@/types/python-generated/api-types";
import { supabase } from "@/utils/supabase/client";

import type { ComparisonRow } from "./types";

// ---------------------------------------------------------------------------
// Reads (direct Supabase)
// ---------------------------------------------------------------------------

export async function fetchComparison(
  id: string,
): Promise<ComparisonRow | null> {
  void id;
  throw new Error(
    "Workflow Battle is unavailable until its live contract is deployed.",
  );
}

export async function listComparisons(limit = 30): Promise<ComparisonRow[]> {
  void limit;
  throw new Error(
    "Workflow Battle is unavailable until its live contract is deployed.",
  );
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
  void args;
  throw new Error(
    "Workflow Battle is unavailable until its live contract is deployed.",
  );
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

export async function searchWorkflows(
  query: string,
): Promise<WorkflowChoice[]> {
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

export async function startComparison(
  dispatch: AppDispatch,
  body: StartComparisonBody,
): Promise<{ comparisonId: string | null; error: string | null }> {
  void dispatch;
  void body;
  return {
    comparisonId: null,
    error:
      "Workflow Battle is unavailable until its live contract is deployed.",
  };
}

export async function rerunComparisonArm(
  dispatch: AppDispatch,
  comparisonId: string,
  armIndex: number,
): Promise<{ error: string | null }> {
  void dispatch;
  void comparisonId;
  void armIndex;
  return {
    error:
      "Workflow Battle is unavailable until its live contract is deployed.",
  };
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
