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

import { postJson } from "@/lib/python-client";
import { apiGet, buildPath } from "@/lib/api/typed-client";
import { BackendApiError } from "@/lib/api/errors";
import type { components } from "@/types/python-generated/api-types";
import type { IngestResponse } from "./ingest";

/**
 * The file's full RAG lifecycle status. DERIVED from the generated OpenAPI
 * contract (`FileRagStatusResponse`) — never hand-mirrored, so a backend shape
 * change surfaces as a compile error after `pnpm sync-types` rather than a
 * silent runtime drift.
 */
export type FileRagStatus = components["schemas"]["FileRagStatusResponse"];

/** Display lifecycle state — the backend derives this (job row + doc anchor). */
export type FileRagState = FileRagStatus["state"];

export type FileRagTriggerSource = NonNullable<FileRagStatus["trigger_source"]>;

export type FileRagJobError = components["schemas"]["FileRagJobError"];

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
  const { data } = await apiGet(
    buildPath("/files/{file_id}/rag-status", { file_id: fileId }),
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
  // FastAPI serializes HTTPException(detail={...}) as {"detail": {...}}, and
  // parseHttpError lands that object in `err.detail` — so it must be
  // JSON.stringify'd, NOT template-coerced (which would give "[object Object]"
  // and drop the nested code). `err.message` carries the FastAPI string too.
  const blob =
    JSON.stringify(err.detail ?? "") +
    JSON.stringify(err.details ?? "") +
    (err.message ?? "");
  return blob.includes("rag_already_complete");
}
