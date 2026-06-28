/**
 * features/page-extraction/api/runs.ts
 *
 * Supabase reads for runs / page_runs / results. Writes happen on the
 * aidream side; the browser never inserts these directly.
 *
 * Casts through `any` for Phase 1 — see jobs.ts for the rationale.
 */

"use client";

import { supabase } from "@/utils/supabase/client";
import type {
  PageExtractionPageRun,
  PageExtractionResult,
  PageExtractionRun,
} from "@/features/page-extraction/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docproc = (supabase as any).schema("docproc");

/**
 * Manual cell write — merge a single key into a result row's payload.
 * Used by the Results table for `manual`-source columns (review fields,
 * confirmations, notes). RLS lets the job owner update their own results.
 *
 * Read-modify-write of the whole payload object: the caller passes the
 * row's current payload so we don't round-trip a read first.
 */
export async function updateResultPayloadField(opts: {
  resultId: string;
  currentPayload: Record<string, unknown>;
  key: string;
  value: unknown;
}): Promise<void> {
  const nextPayload = { ...opts.currentPayload, [opts.key]: opts.value };
  const { error } = await docproc
    .schema("docproc").from("page_extraction_results")
    .update({ payload: nextPayload })
    .eq("id", opts.resultId);
  if (error) throw error;
}

/**
 * Permanently delete one entire run: the run row plus everything it produced
 * (its `page_extraction_page_runs` chunks and `page_extraction_results` rows)
 * via the `ON DELETE CASCADE` FK chain. The owning job's `latest_run_id` FK is
 * `ON DELETE SET NULL`, so it self-clears if it pointed here — and
 * `getLatestRunId` falls back to the newest remaining run, so the job still
 * resolves a "latest" execution afterward. RLS owner-write applies.
 *
 * This is distinct from `clearJobResults` (which wipes ALL runs for the
 * template) and from archiving the template (`deleteJob`, which keeps the
 * data queryable).
 */
export async function deleteRun(runId: string): Promise<void> {
  const { error } = await docproc
    .schema("docproc").from("page_extraction_runs")
    .delete()
    .eq("id", runId);
  if (error) throw error;
}

export async function getRun(runId: string): Promise<PageExtractionRun | null> {
  const { data, error } = await docproc
    .schema("docproc").from("page_extraction_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PageExtractionRun | null;
}

export async function listRunsForJob(
  jobId: string,
): Promise<PageExtractionRun[]> {
  const { data, error } = await docproc
    .schema("docproc").from("page_extraction_runs")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PageExtractionRun[];
}

export async function listPageRunsForRun(
  runId: string,
): Promise<PageExtractionPageRun[]> {
  const { data, error } = await docproc
    .schema("docproc").from("page_extraction_page_runs")
    .select("*")
    .eq("run_id", runId)
    .order("chunk_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PageExtractionPageRun[];
}

export async function listResults(opts: {
  jobId: string;
  runId?: string | null;
}): Promise<PageExtractionResult[]> {
  let query = docproc
    .schema("docproc").from("page_extraction_results")
    .select("*")
    .eq("job_id", opts.jobId)
    .order("canonical_page", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (opts.runId) query = query.eq("run_id", opts.runId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PageExtractionResult[];
}

/**
 * Every result row for a file, across every template ("All extractions"
 * view in the main pane). The caller joins these against the jobs list
 * to render a Template column. Ordered by canonical page then creation
 * time so the table is stable when results from different jobs interleave.
 */
export async function listResultsForFile(
  fileId: string,
): Promise<PageExtractionResult[]> {
  const { data, error } = await docproc
    .schema("docproc").from("page_extraction_results")
    .select("*")
    .eq("file_id", fileId)
    .order("canonical_page", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PageExtractionResult[];
}

export async function getLatestRunId(jobId: string): Promise<string | null> {
  const { data: jobRow, error: jobErr } = await docproc
    .schema("docproc").from("page_extraction_jobs")
    .select("latest_run_id")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (jobRow?.latest_run_id) return jobRow.latest_run_id as string;

  const { data, error } = await docproc
    .schema("docproc").from("page_extraction_runs")
    .select("id")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.id ?? null) as string | null;
}
