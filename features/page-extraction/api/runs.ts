/**
 * features/page-extraction/api/runs.ts
 *
 * Supabase reads for runs / page_runs / results. Writes happen on the
 * aidream side; the browser never inserts these directly.
 */

"use client";

import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { docprocDb } from "@/utils/supabase/docprocDb";
import { writeOne } from "@/utils/supabase/writeOne";
import type {
  PageExtractionPageRun,
  PageExtractionResult,
  PageExtractionRun,
} from "@/features/page-extraction/types";

const docproc = docprocDb(supabase);

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
  await writeOne(
    docproc
      .from("page_extraction_results")
      .update({ payload: nextPayload })
      .eq("id", opts.resultId)
      .select("id"),
    { action: "save", noun: "result" },
  );
}

/**
 * Move one entire run to Trash (soft delete — stamps `deleted_at`). Its
 * `page_extraction_page_runs` chunks and `page_extraction_results` rows follow
 * via the `platform.soft_delete_edge` cascade, and restoring the run from
 * Trash restores exactly those. Every reader here skips trashed rows.
 *
 * If the owning job's `latest_run_id` pointed at this run it is cleared (the
 * same outcome the old `ON DELETE SET NULL` FK produced), and `getLatestRunId`
 * falls back to the newest live run. RLS owner-write applies.
 *
 * This is distinct from `clearJobResults` (which trashes ALL runs for the
 * template) and from archiving the template (`deleteJob`).
 */
export async function deleteRun(runId: string): Promise<void> {
  const trashed = await writeOne(
    docproc
      .from("page_extraction_runs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", runId)
      .select("id, job_id"),
    { action: "delete", noun: "run" },
  );
  const jobId = trashed.job_id ?? null;
  if (jobId) {
    const { error } = await docproc
      .from("page_extraction_jobs")
      .update({ latest_run_id: null })
      .eq("id", jobId)
      .eq("latest_run_id", runId);
    if (error) throw error;
  }
}

export async function getRun(runId: string): Promise<PageExtractionRun | null> {
  const { data, error } = await docproc
    .from("page_extraction_runs")
    .select("*")
    .eq("id", runId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PageExtractionRun | null;
}

export async function listRunsForJob(
  jobId: string,
): Promise<PageExtractionRun[]> {
  const { data, error } = await docproc
    .from("page_extraction_runs")
    .select("*")
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PageExtractionRun[];
}

export async function listPageRunsForRun(
  runId: string,
): Promise<PageExtractionPageRun[]> {
  const { data, error } = await docproc
    .from("page_extraction_page_runs")
    .select("*")
    .is("deleted_at", null)
    .eq("run_id", runId)
    .order("chunk_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PageExtractionPageRun[];
}

export async function listResults(opts: {
  jobId: string;
  runId?: string | null;
}): Promise<PageExtractionResult[]> {
  const rows = await readAllRows(
    ({ from, to }) => {
      let query = docproc
        .from("page_extraction_results")
        .select("*", { count: "exact" })
        .eq("job_id", opts.jobId)
        .is("deleted_at", null);
      if (opts.runId) query = query.eq("run_id", opts.runId);
      return query
        .order("canonical_page", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
    },
    { label: "docproc.page_extraction_results for extraction dataset" },
  );
  return rows as PageExtractionResult[];
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
  const rows = await readAllRows(
    ({ from, to }) =>
      docproc
        .from("page_extraction_results")
        .select("*", { count: "exact" })
        .eq("file_id", fileId)
        .is("deleted_at", null)
        .order("canonical_page", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "docproc.page_extraction_results for extracted file" },
  );
  return rows as PageExtractionResult[];
}

/**
 * Page-scoped extraction references for citation/result surfaces. Unlike the
 * full Extractions workspace, this never pulls every row for a large document:
 * Postgres filters by the durable `source_pages[]` provenance anchor first.
 */
export async function listResultsForFilePage(
  fileId: string,
  pageNumber: number,
  limit = 50,
): Promise<{ results: PageExtractionResult[]; total: number }> {
  const { data, error, count } = await docproc
    .from("page_extraction_results")
    .select("*", { count: "exact" })
    .eq("file_id", fileId)
    .is("deleted_at", null)
    .contains("source_pages", [pageNumber])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return {
    results: (data ?? []) as PageExtractionResult[],
    total: count ?? data?.length ?? 0,
  };
}

export async function getLatestRunId(jobId: string): Promise<string | null> {
  const { data: jobRow, error: jobErr } = await docproc
    .from("page_extraction_jobs")
    .select("latest_run_id")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  // The pointer may name a run that was moved to Trash — only a live run
  // counts as "latest"; otherwise fall back to the newest live run.
  const { data, error } = await docproc
    .from("page_extraction_runs")
    .select("id")
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (jobRow?.latest_run_id) {
    const { data: pointed, error: pointedErr } = await docproc
      .from("page_extraction_runs")
      .select("id")
      .eq("id", jobRow.latest_run_id as string)
      .is("deleted_at", null)
      .maybeSingle();
    if (pointedErr) throw pointedErr;
    if (pointed?.id) return pointed.id as string;
  }
  return (data?.id ?? null) as string | null;
}
