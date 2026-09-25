/**
 * features/page-extraction/api/jobs.ts
 *
 * Supabase CRUD for page_extraction_jobs (`docproc` schema). Direct browser
 * reads/writes are RLS-gated to owners + org members.
 */

"use client";

import { supabase } from "@/utils/supabase/client";
import { docprocDb } from "@/utils/supabase/docprocDb";
import { writeOne } from "@/utils/supabase/writeOne";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { OrganizationContextError } from "@ai-matrx/agents/matrx";
import type {
  PageExtractionJob,
  PageExtractionJobInsert,
  PageExtractionJobUpdate,
} from "@/features/page-extraction/types";

const db = docprocDb(supabase);

const TABLE = "page_extraction_jobs";

export async function listJobsForFile(
  fileId: string,
  opts: { savedOnly?: boolean; includeArchived?: boolean } = {},
): Promise<PageExtractionJob[]> {
  let query = db.from(TABLE).select("*").eq("file_id", fileId);
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

/**
 * Create a template.
 *
 * 🚨 THE ORGANIZATION IS CARRIED FROM THE PARENT FILE, NEVER LEFT TO A
 * TRIGGER. `docproc.page_extraction_jobs` sits behind BOTH the parent-inherit
 * trigger and `public._stamp_org_default`: a row sent without an organization
 * is inherited from its parent when the DB can find one and filed in the
 * WRITER'S PERSONAL organization when it cannot. Either way nothing in this
 * app decided it, which is what the law forbids — the organization is READ and
 * carried, never invented below the boundary
 * (common-docs/policies/context-is-carried-never-rebuilt.md).
 *
 * So: the caller's explicit organization wins; otherwise the PARENT FILE's own
 * organization is read and carried (the template belongs where the document
 * it extracts from belongs); and if the parent cannot answer, the write
 * REFUSES with the remedy rather than letting a trigger pick a workspace the
 * person never chose.
 */
export async function createJob(
  input: PageExtractionJobInsert,
): Promise<PageExtractionJob> {
  const organizationId =
    input.organization_id ?? (await parentFileOrganizationId(input.file_id));
  const { data, error } = await db
    .from(TABLE)
    .insert({ ...input, organization_id: organizationId })
    .select("*")
    .single();
  if (error) throw error;
  return data as PageExtractionJob;
}

/** The organization of the file this template extracts from. */
async function parentFileOrganizationId(fileId: string): Promise<string> {
  const { data, error } = await supabase
    .schema("files")
    .from("files")
    .select("organization_id")
    .eq("id", fileId)
    .maybeSingle();
  if (error) throw error;
  const organizationId = data?.organization_id ?? null;
  if (!organizationId) {
    // Never a trigger's guess, and never silent: say which organization is
    // missing and how to supply it.
    throw new OrganizationContextError(
      "organization_context_required",
      "This extraction template has no organization to be filed under — the file it reads could not be found, or names none. Open the file from the organization it belongs to and try again.",
    );
  }
  return organizationId;
}

/**
 * Duplicate a template under a new name, WITHOUT carrying over its run
 * pointer or results — a fresh shell that shares the same config. Used by
 * the "Run as new" branch of the re-run prompt so a second run lands in its
 * own template ("Invoices (2)") instead of overwriting the first.
 */
export async function cloneJobWithName(
  jobId: string,
  newName: string,
): Promise<PageExtractionJob> {
  const src = await getJob(jobId);
  if (!src)
    throw recordUnavailable({
      entity: "template",
      reason: "unknown",
      recordId: jobId,
    });
  const clone = { ...(src as unknown as Record<string, unknown>) };
  delete clone.id;
  delete clone.created_at;
  delete clone.updated_at;
  delete clone.latest_run_id;
  clone.name = newName;
  clone.archived_at = null;
  // A re-run-as-new should be a first-class, listable template.
  clone.is_saved = true;
  return createJob(clone as PageExtractionJobInsert);
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
  await writeOne(
    db
      .from(TABLE)
      .update({ archived_at: new Date().toISOString() })
      .eq("id", jobId)
      .select("id"),
    { action: "archive", noun: "extraction template" },
  );
}

export async function hardDeleteJob(jobId: string): Promise<void> {
  await writeOne(db.from(TABLE).delete().eq("id", jobId).select("id"), {
    action: "delete",
    noun: "extraction template",
  });
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
  // RPC functions stay in `public` regardless of the `docproc` table move —
  // call through the unscoped client, not `db` (which is `.schema("docproc")`).
  const { error } = await supabase.rpc("page_extraction_clear_job_results", {
    p_job_id: jobId,
  });
  if (error) {
    // P0002 is the RPC's honest "this extraction dataset is not available to
    // you" — the SECURITY INVOKER update matched zero rows, which under RLS is
    // an ACCESS answer just as often as a missing one. The user is looking at
    // the Results tab of this very job, so "not found" is the one answer that
    // is definitely wrong; hand it to AccessGate instead.
    if (error.code === "P0002") {
      throw recordUnavailable({
        entity: "extraction dataset",
        reason: "unknown",
        recordId: jobId,
        token: "page_extraction_job",
        relation: "docproc.page_extraction_jobs",
      });
    }
    throw error;
  }
}
