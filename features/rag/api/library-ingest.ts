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
 * The endpoint is a canonical matrx-connect NDJSON stream. This client consumes
 * that stream through `postNdjson` and resolves only after the terminal
 * `rag.ingest.result` event arrives.
 */

import { postNdjson } from "@/lib/python-client";
import { BackendApiError } from "@/lib/api/errors";

export interface LibraryIngestRequest {
  file_id: string;
  profile?: string | null;
}

export interface LibraryIngestResponse {
  detail: string;
}

export async function ingestLibraryFile(
  storeId: string,
  fileId: string,
  opts: { profile?: string | null; signal?: AbortSignal } = {},
): Promise<LibraryIngestResponse> {
  for await (const event of postNdjson<LibraryIngestRequest>(
    `/rag/library/stores/${encodeURIComponent(storeId)}/ingest`,
    { file_id: fileId, profile: opts.profile ?? null },
    { signal: opts.signal },
  )) {
    if (event.event === "error") {
      throw new BackendApiError({
        code: event.data.code ?? event.data.error_type,
        detail: event.data.message,
        userMessage: event.data.user_message ?? event.data.message,
        details: event.data.details,
      });
    }

    if (
      event.event !== "data" ||
      !("kind" in event.data) ||
      event.data.kind !== "rag.ingest.result"
    ) {
      continue;
    }

    const resultError =
      "error" in event.data && typeof event.data.error === "string"
        ? event.data.error
        : null;
    if (resultError) {
      throw new BackendApiError({
        code: "library_ingest_failed",
        detail: resultError,
        userMessage: resultError,
      });
    }

    const chunksWritten =
      "chunks_written" in event.data &&
      typeof event.data.chunks_written === "number"
        ? event.data.chunks_written
        : 0;
    const embeddingsWritten =
      "embeddings_written" in event.data &&
      typeof event.data.embeddings_written === "number"
        ? event.data.embeddings_written
        : 0;
    const skippedUnchanged =
      "skipped_unchanged" in event.data &&
      event.data.skipped_unchanged === true;

    return {
      detail: skippedUnchanged
        ? "Library content was already current; no new chunks were needed."
        : `Ingested ${chunksWritten} chunks and wrote ${embeddingsWritten} embeddings.`,
    };
  }

  throw new BackendApiError({
    code: "library_ingest_incomplete",
    detail: "Library ingest stream ended without a rag.ingest.result event",
    userMessage: "The ingest ended without a final result. Please retry.",
  });
}
