/**
 * features/page-extraction/data-review/data.ts
 *
 * Read layer for the Extraction Data workspace (/knowledge/extractions).
 *
 * The PDF-Studio reader pane only ever queries ONE file's extractions. This
 * workspace is the cross-document catalog: every extraction dataset the user
 * owns (one `page_extraction_jobs` row = one dataset), enriched with its
 * source document name, accurate accumulated row count, and latest-run status
 * — in a fixed, bounded number of round-trips (never N-per-row).
 *
 * RLS scopes every query to the owner + their org, so no explicit owner
 * filter is needed (and adding one would silently hide org-shared datasets).
 */

"use client";

import { supabase } from "@/utils/supabase/client";
import type {
  JobKind,
  PageExtractionJob,
  RunStatus,
} from "@/features/page-extraction/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docproc = (supabase as any).schema("docproc");

/** One dataset row in the cross-document catalog. */
export interface ExtractionCatalogEntry {
  jobId: string;
  name: string;
  kind: JobKind;
  fileId: string;
  processedDocumentId: string | null;
  /** Human source label — the processed document's name, else a short id. */
  sourceName: string;
  sourceTotalPages: number | null;
  /** Accumulated result rows across ALL runs (not just the latest). */
  rowCount: number;
  latestRunId: string | null;
  latestRunStatus: RunStatus | null;
  latestRunFinishedAt: string | null;
  organizationId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The full catalog of the user's saved, non-archived extraction datasets.
 *
 * Round-trips (bounded, independent of dataset count):
 *   1. jobs            — every saved non-archived template
 *   2. documents       — names for the referenced processed_documents
 *   3. runs            — status of each latest_run_id
 *   4. result job_ids  — one scan to tally accurate per-dataset row counts
 */
export async function listExtractionCatalog(opts?: {
  includeArchived?: boolean;
}): Promise<ExtractionCatalogEntry[]> {
  let jobsQuery = docproc
    .from("page_extraction_jobs")
    .select(
      "id, name, kind, file_id, processed_document_id, latest_run_id, organization_id, project_id, created_at, updated_at",
    )
    .eq("is_saved", true)
    .order("updated_at", { ascending: false });
  if (!opts?.includeArchived) jobsQuery = jobsQuery.is("archived_at", null);

  const { data: jobsRaw, error: jobsErr } = await jobsQuery;
  if (jobsErr) throw jobsErr;
  const jobs = (jobsRaw ?? []) as Array<
    Pick<
      PageExtractionJob,
      | "id"
      | "name"
      | "kind"
      | "file_id"
      | "processed_document_id"
      | "latest_run_id"
      | "organization_id"
      | "project_id"
      | "created_at"
      | "updated_at"
    >
  >;
  if (jobs.length === 0) return [];

  const docIds = Array.from(
    new Set(
      jobs
        .map((j) => j.processed_document_id)
        .filter((id): id is string => !!id),
    ),
  );
  const runIds = Array.from(
    new Set(
      jobs.map((j) => j.latest_run_id).filter((id): id is string => !!id),
    ),
  );
  const jobIds = jobs.map((j) => j.id);

  const [docsRes, runsRes, resultsRes] = await Promise.all([
    docIds.length
      ? docproc
          .from("processed_documents")
          .select("id, name, total_pages")
          .in("id", docIds)
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? docproc
          .from("page_extraction_runs")
          .select("id, status, finished_at")
          .in("id", runIds)
      : Promise.resolve({ data: [], error: null }),
    docproc.from("page_extraction_results").select("job_id").in("job_id", jobIds),
  ]);

  if (docsRes.error) throw docsRes.error;
  if (runsRes.error) throw runsRes.error;
  if (resultsRes.error) throw resultsRes.error;

  const docById = new Map<
    string,
    { name: string; total_pages: number | null }
  >();
  for (const d of (docsRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    total_pages: number | null;
  }>) {
    docById.set(d.id, {
      name: d.name ?? "Untitled document",
      total_pages: d.total_pages,
    });
  }

  const runById = new Map<
    string,
    { status: RunStatus; finished_at: string | null }
  >();
  for (const r of (runsRes.data ?? []) as Array<{
    id: string;
    status: RunStatus;
    finished_at: string | null;
  }>) {
    runById.set(r.id, { status: r.status, finished_at: r.finished_at });
  }

  const rowCountByJob = new Map<string, number>();
  for (const row of (resultsRes.data ?? []) as Array<{ job_id: string }>) {
    rowCountByJob.set(row.job_id, (rowCountByJob.get(row.job_id) ?? 0) + 1);
  }

  return jobs.map((j) => {
    const doc = j.processed_document_id
      ? docById.get(j.processed_document_id)
      : undefined;
    const run = j.latest_run_id ? runById.get(j.latest_run_id) : undefined;
    return {
      jobId: j.id,
      name: j.name,
      kind: j.kind,
      fileId: j.file_id,
      processedDocumentId: j.processed_document_id,
      sourceName: doc?.name ?? "PDF document",
      sourceTotalPages: doc?.total_pages ?? null,
      rowCount: rowCountByJob.get(j.id) ?? 0,
      latestRunId: j.latest_run_id,
      latestRunStatus: run?.status ?? null,
      latestRunFinishedAt: run?.finished_at ?? null,
      organizationId: j.organization_id,
      projectId: j.project_id,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
    };
  });
}

/** Bulk delete result rows by id (per-row / bulk delete in the grid). */
export async function deleteResultRows(resultIds: string[]): Promise<void> {
  if (resultIds.length === 0) return;
  const { error } = await docproc
    .from("page_extraction_results")
    .delete()
    .in("id", resultIds);
  if (error) throw error;
}

/** Duplicate a template (job) WITHOUT its results — a fresh dataset shell. */
export async function duplicateJob(jobId: string): Promise<string> {
  const { data: src, error: getErr } = await docproc
    .from("page_extraction_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (getErr) throw getErr;

  const clone = { ...(src as Record<string, unknown>) };
  delete clone.id;
  delete clone.created_at;
  delete clone.updated_at;
  delete clone.latest_run_id;
  clone.name = `${(src as { name: string }).name} (copy)`;
  clone.archived_at = null;

  const { data: created, error: insErr } = await docproc
    .from("page_extraction_jobs")
    .insert(clone)
    .select("id")
    .single();
  if (insErr) throw insErr;
  return (created as { id: string }).id;
}
