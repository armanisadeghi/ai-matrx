/**
 * features/rag/api/library-ingest.ts
 *
 * Client for P1's admin library-ingest endpoint:
 *
 *   POST /rag/library/stores/{store_id}/ingest   { file_id, profile? }
 *
 * Super-admin only (server-gated). This is the CURATION path — "ingest this
 * file into a shared library store as system-owned content" — distinct from
 * the tenant `/rag/ingest` self-serve path in `./ingest.ts`.
 *
 * Contract status: aidream publishes the signature day 1 but answers
 * `501 Not Implemented` until the full pipeline (system-owner rehome +
 * streamed progress) lands. Callers MUST surface that as a clearly-labeled
 * "pipeline not yet live" state — never swallow it as a generic error. Use
 * `isLibraryIngestNotLive` to detect it.
 */

import { postJson } from "@/lib/python-client";
import { BackendApiError } from "@/lib/api/errors";

export interface LibraryIngestRequest {
  file_id: string;
  profile?: string | null;
}

export interface LibraryIngestResponse {
  status: string;
  detail: string;
}

/** True when the backend answered 501 — the P1 pipeline hasn't shipped. */
export function isLibraryIngestNotLive(err: unknown): boolean {
  return err instanceof BackendApiError && err.status === 501;
}

export async function ingestLibraryFile(
  storeId: string,
  fileId: string,
  opts: { profile?: string | null; signal?: AbortSignal } = {},
): Promise<LibraryIngestResponse> {
  const { data } = await postJson<LibraryIngestResponse, LibraryIngestRequest>(
    `/rag/library/stores/${encodeURIComponent(storeId)}/ingest`,
    { file_id: fileId, profile: opts.profile ?? null },
    { signal: opts.signal },
  );
  return data;
}
