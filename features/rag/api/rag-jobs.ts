/**
 * features/rag/api/rag-jobs.ts
 *
 * Client for the scheduled auto-RAG lifecycle (aidream kg_032):
 *
 *   GET  /files/{id}/rag-status  — scheduled / running / completed / failed
 *   POST /files/{id}/ingest      — on-demand trigger (cancels the scheduled
 *                                  job; 409 `rag_already_complete` if done)
 *   POST /files/{id}/refresh     — re-run a completed file (new derivative)
 *
 * Auth header + base URL + error normalisation come from python-client, so
 * a non-2xx throws a typed `BackendApiError` (see `isRagAlreadyComplete`).
 */

import { getJson, postJson } from "@/lib/python-client";
import { BackendApiError } from "@/lib/api/errors";
import type { IngestResponse } from "./ingest";

/** Display lifecycle state — the backend derives this (job row + doc anchor). */
export type FileRagState =
  | "not_scheduled"
  | "scheduled"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type FileRagTriggerSource =
  | "auto"
  | "upload_flag"
  | "on_demand"
  | "refresh";

export interface FileRagJobError {
  error_type: string;
  message: string;
}

export interface FileRagStatus {
  file_id: string;
  state: FileRagState;
  job_id: string | null;
  trigger_source: FileRagTriggerSource | null;
  scheduled_for: string | null; // ISO 8601 (UTC)
  started_at: string | null;
  completed_at: string | null;
  attempt_count: number;
  skipped_reason: string | null;
  error: FileRagJobError | null;
  processed_document_id: string | null;
  chunk_count: number;
  document_updated_at: string | null;
}

/** The on-demand ingest / refresh response (mirrors aidream FileIngestResponse). */
export interface FileIngestResult extends IngestResponse {
  chunks_reused?: number;
  skipped_reason?: string | null;
  suggestions_created?: number;
  job_id?: string | null;
}

export async function fetchFileRagStatus(
  fileId: string,
  signal?: AbortSignal,
): Promise<FileRagStatus> {
  const { data } = await getJson<FileRagStatus>(
    `/files/${encodeURIComponent(fileId)}/rag-status`,
    { signal },
  );
  return data;
}

/** On-demand trigger. Cancels any deferred auto-RAG job server-side. */
export async function triggerFileIngestNow(
  fileId: string,
  opts: { force?: boolean; signal?: AbortSignal } = {},
): Promise<FileIngestResult> {
  const { data } = await postJson<FileIngestResult>(
    `/files/${encodeURIComponent(fileId)}/ingest`,
    { force: opts.force ?? false },
    { signal: opts.signal },
  );
  return data;
}

/** Re-run a completed file (new processed_documents derivative). Streams
 * server-side; this returns once the stream is accepted. */
export async function refreshFileRag(
  fileId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<void> {
  await postJson<unknown>(
    `/files/${encodeURIComponent(fileId)}/refresh`,
    {},
    { signal: opts.signal },
  );
}

/**
 * True when an error is the backend's 409 `rag_already_complete`. Defensive:
 * matches the typed code OR the raw payload text, so it works whether the
 * envelope arrives as `{code}` or nested under FastAPI's `{detail:{code}}`.
 */
export function isRagAlreadyComplete(err: unknown): err is BackendApiError {
  if (!(err instanceof BackendApiError)) return false;
  if (err.status !== 409) return false;
  if (err.code === "rag_already_complete") return true;
  const blob = `${err.detail ?? ""}${JSON.stringify(err.details ?? "")}`;
  return blob.includes("rag_already_complete");
}
