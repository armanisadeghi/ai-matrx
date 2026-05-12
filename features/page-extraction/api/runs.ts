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

export async function getRun(runId: string): Promise<PageExtractionRun | null> {
  const { data, error } = await db
    .from("page_extraction_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PageExtractionRun | null;
}

export async function listRunsForJob(
  jobId: string,
): Promise<PageExtractionRun[]> {
  const { data, error } = await db
    .from("page_extraction_runs")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PageExtractionRun[];
}

export async function listPageRunsForRun(
  runId: string,
): Promise<PageExtractionPageRun[]> {
  const { data, error } = await db
    .from("page_extraction_page_runs")
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
  let query = db
    .from("page_extraction_results")
    .select("*")
    .eq("job_id", opts.jobId)
    .order("canonical_page", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (opts.runId) query = query.eq("run_id", opts.runId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PageExtractionResult[];
}

export async function getLatestRunId(
  jobId: string,
): Promise<string | null> {
  const { data: jobRow, error: jobErr } = await db
    .from("page_extraction_jobs")
    .select("latest_run_id")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (jobRow?.latest_run_id) return jobRow.latest_run_id as string;

  const { data, error } = await db
    .from("page_extraction_runs")
    .select("id")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.id ?? null) as string | null;
}
