/**
 * features/page-extraction/api/jobs.ts
 *
 * Supabase CRUD for page_extraction_jobs. Direct browser reads/writes are
 * RLS-gated to owners + org members.
 *
 * The generated `Database` types in `types/database.types.ts` don't yet
 * include the page_extraction_* tables (they're regenerated after the
 * migration runs). We cast through `any` here for Phase 1 — once the types
 * are regenerated, the casts can be removed and full type safety returns.
 */

"use client";

import { supabase } from "@/utils/supabase/client";
import type {
  PageExtractionJob,
  PageExtractionJobInsert,
  PageExtractionJobUpdate,
} from "@/features/page-extraction/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const TABLE = "page_extraction_jobs";

export async function listJobsForFile(
  fileId: string,
  opts: { savedOnly?: boolean; includeArchived?: boolean } = {},
): Promise<PageExtractionJob[]> {
  let query = db
    .from(TABLE)
    .select("*")
    .eq("file_id", fileId);
  if (opts.savedOnly !== false) {
    // Default to saved Jobs only — ephemeral/ad-hoc runs aren't worth
    // cluttering the picker. Callers that need everything pass
    // { savedOnly: false }.
    query = query.eq("is_saved", true);
  }
  if (!opts.includeArchived) {
    // Archived (soft-deleted) templates are hidden from the picker but
    // the results they produced remain queryable via job_id.
    query = query.is("archived_at", null);
  }
  query = query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PageExtractionJob[];
}

export async function getJob(jobId: string): Promise<PageExtractionJob | null> {
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PageExtractionJob | null;
}

export async function createJob(
  input: PageExtractionJobInsert,
): Promise<PageExtractionJob> {
  const { data, error } = await db
    .from(TABLE)
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data as PageExtractionJob;
}

export async function updateJob(
  jobId: string,
  patch: PageExtractionJobUpdate,
): Promise<PageExtractionJob> {
  const { data, error } = await db
    .from(TABLE)
    .update(patch)
    .eq("id", jobId)
    .select("*")
    .single();
  if (error) throw error;
  return data as PageExtractionJob;
}

/**
 * Soft-delete (archive) a template. Sets `archived_at` so the row is
 * hidden from listings but the results it produced stay queryable.
 *
 * Use `hardDeleteJob` for a permanent purge (cascades to runs + results
 * via the FK chain).
 */
export async function deleteJob(jobId: string): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .update({ archived_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) throw error;
}

export async function hardDeleteJob(jobId: string): Promise<void> {
  const { error } = await db.from(TABLE).delete().eq("id", jobId);
  if (error) throw error;
}

/**
 * Delete all extraction results for a template without touching the
 * template itself. Used by the "Clear data" affordance on the Results tab.
 *
 * Single transactional RPC (`page_extraction_clear_job_results`,
 * migrations/page_extraction_clear_job_results_rpc.sql). The previous four
 * sequential statements could fail mid-sequence — results deleted but runs
 * intact, or `latest_run_id` left pointing at a deleted run (that final
 * update's error was never even checked).
 */
export async function clearJobResults(jobId: string): Promise<void> {
  const { error } = await db.rpc("page_extraction_clear_job_results", {
    p_job_id: jobId,
  });
  if (error) throw error;
}
