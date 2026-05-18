/**
 * features/files/api/document-lookup.ts
 *
 * Resolve `cld_files.id → processed_documents.id` so the cloud-files
 * surfaces (PreviewPane, context menu, lineage chips) can integrate
 * with the RAG team's document model without baking the doc id into
 * `cld_files`.
 *
 * Endpoint (shipped 2026-05-05, Bundle C — see from_python/UPDATES.md):
 *
 *   GET /files/{file_id}/document
 *     200 → FileDocumentLookup       (latest processed_documents row)
 *     404 → "no_processed_document"  (file has not been ingested yet)
 *
 * Non-404 failures (network / 5xx) are treated as "lookup unavailable"
 * (not "no document"), so a transient outage doesn't trick the UI
 * into hiding the Document tab forever.
 *
 * The lookup result is memoised at module scope for the lifetime of
 * the page — these answers don't change without a `/rag/ingest` call,
 * which the FE explicitly invalidates by calling `clearFileDocumentCache`.
 */
import { BackendApiError } from "@/lib/api/errors";
import { getJson } from "@/lib/python-client";

export interface FileDocumentLookup {
  /** processed_documents.id — the doc id used by `/api/document/{id}`. */
  processed_document_id: string;
  derivation_kind: string;
  total_pages: number | null;
  chunk_count: number;
  has_clean_content: boolean;
  updated_at: string;
}

export type FileDocumentState =
  /** A processed_documents row exists for this file. */
  | { kind: "found"; doc: FileDocumentLookup }
  /** Endpoint returned 404 — the file has not been ingested. */
  | { kind: "absent" }
  /** Endpoint not yet implemented or transient failure — try again later. */
  | { kind: "unavailable"; reason: string };

const cache = new Map<string, FileDocumentState>();
const inflight = new Map<string, Promise<FileDocumentState>>();

/**
 * Probe the file → document lookup. Memoised per session; safe to
 * call from many components in parallel (de-duped via `inflight`).
 */
export async function lookupFileDocument(
  fileId: string,
): Promise<FileDocumentState> {
  const cached = cache.get(fileId);
  if (cached) return cached;
  const pending = inflight.get(fileId);
  if (pending) return pending;

  const promise = (async (): Promise<FileDocumentState> => {
    try {
      const { data } = await getJson<FileDocumentLookup>(
        `/files/${encodeURIComponent(fileId)}/document`,
      );
      const state: FileDocumentState = { kind: "found", doc: data };
      cache.set(fileId, state);
      return state;
    } catch (err) {
      if (err instanceof BackendApiError && err.status === 404) {
        const state: FileDocumentState = { kind: "absent" };
        cache.set(fileId, state);
        return state;
      }
      // Anything else — endpoint doesn't exist yet (Python ships item 14
      // and this gracefully starts working) or a transient backend
      // failure. Don't cache permanently; let a re-mount try again.
      const reason = err instanceof Error ? err.message : "Lookup unavailable";
      return { kind: "unavailable", reason };
    } finally {
      inflight.delete(fileId);
    }
  })();

  inflight.set(fileId, promise);
  return promise;
}

/** Drop the cached answer — call after kicking off `/rag/ingest`. */
export function clearFileDocumentCache(fileId?: string): void {
  if (fileId) {
    cache.delete(fileId);
    inflight.delete(fileId);
  } else {
    cache.clear();
    inflight.clear();
  }
}

/**
 * Direct-write entry — the ingest stream emits the new
 * `processed_document_id` on completion, no need to round-trip again.
 */
export function recordFileDocument(
  fileId: string,
  doc: FileDocumentLookup,
): void {
  cache.set(fileId, { kind: "found", doc });
}
