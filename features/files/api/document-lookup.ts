/**
 * features/files/api/document-lookup.ts
 *
 * Resolve `cld_files.id → processed_documents` so the cloud-files surfaces
 * (RAG badge, RAG-status column, PreviewPane Document/Info tabs, lineage
 * chips) can tell whether a file has been ingested for RAG.
 *
 * ── Architecture (2026-05-20): DIRECT Supabase read ────────────────────────
 *
 * `processed_documents` is a plain `public` table protected by RLS
 * (`owner_id = auth.uid()` + an org-member SELECT policy). The browser is
 * already authorized to read it, so we query supabase-js directly instead of
 * round-tripping through the Python backend.
 *
 * This reverses an anti-pattern: the old `GET /files/{id}/document` proxy used
 * Python purely as a database reader. Because the RAG badge renders inline on
 * every file row, that proxy fired once per row on every list render AND once
 * per upload — a guaranteed 404 at upload time (upload never ingests) — all to
 * read one metadata table the client can read itself. Python is for compute /
 * file bytes / cross-service work, never as a proxy for an RLS-readable table.
 *
 * Selection: latest non-archived `processed_documents` row anchored to the
 * file via (`source_kind = 'cld_file'`, `source_id = <file id>`), newest first.
 *
 * `chunk_count` is intentionally NOT resolved here. RAG chunks live in the
 * `rag` schema (`rag.kg_chunks`), which is not exposed to PostgREST, so the
 * count needs the server. It is left `null`; detail surfaces render it only
 * when known. Tracked as a server-side ask in
 * `docs/SERVER_SIDE_REQUESTS.md` (expose a chunk count on the row or via a
 * `public` view).
 *
 * The result is memoised at module scope for the page lifetime — these answers
 * don't change without a `/rag/ingest` call, which the FE invalidates by
 * calling `clearFileDocumentCache`.
 */
import { supabase } from "@/utils/supabase/client";
import { extractErrorMessage } from "@/utils/errors";

export interface FileDocumentLookup {
  /** processed_documents.id — the doc id used by `/rag/viewer/{id}`. */
  processed_document_id: string;
  derivation_kind: string;
  total_pages: number | null;
  /**
   * Number of RAG chunks. The chunks live in the `rag` schema (not
   * browser-readable), so the direct lookup leaves this `null`; it is only
   * populated when a server-supplied count is recorded via
   * `recordFileDocument`. Detail surfaces render it only when non-null.
   */
  chunk_count: number | null;
  has_clean_content: boolean;
  updated_at: string;
}

export type FileDocumentState =
  /** A processed_documents row exists for this file. */
  | { kind: "found"; doc: FileDocumentLookup }
  /** No (non-archived) processed_documents row — the file isn't ingested. */
  | { kind: "absent" }
  /** Transient failure (network / schema) — try again later. */
  | { kind: "unavailable"; reason: string };

const cache = new Map<string, FileDocumentState>();
const inflight = new Map<string, Promise<FileDocumentState>>();

/**
 * Probe the file → document lookup. Memoised per session; safe to call from
 * many components in parallel (de-duped via `inflight`).
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
      const { data, error } = await (supabase as any)
        .schema("docproc")
        .from("processed_documents")
        .select(
          "id, derivation_kind, total_pages, updated_at, clean_content_completed_at",
        )
        .eq("source_kind", "cld_file")
        .eq("source_id", fileId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        // RLS filters rows, it never errors — so an error here is a real
        // transient/network/schema problem. Don't cache; let a re-mount retry.
        return { kind: "unavailable", reason: error.message };
      }

      if (!data) {
        // Zero rows visible under RLS = not ingested (or not readable). Either
        // way the surfaces treat it the same: offer "Process this file".
        const state: FileDocumentState = { kind: "absent" };
        cache.set(fileId, state);
        return state;
      }

      const state: FileDocumentState = {
        kind: "found",
        doc: {
          processed_document_id: data.id,
          derivation_kind: data.derivation_kind,
          total_pages: data.total_pages,
          chunk_count: null,
          has_clean_content: data.clean_content_completed_at != null,
          updated_at: data.updated_at,
        },
      };
      cache.set(fileId, state);
      return state;
    } catch (err) {
      return { kind: "unavailable", reason: extractErrorMessage(err) };
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
 * `processed_document_id` (and, when available, the server-counted
 * `chunk_count`) on completion, so callers can seed the cache without a
 * round-trip.
 */
export function recordFileDocument(
  fileId: string,
  doc: FileDocumentLookup,
): void {
  cache.set(fileId, { kind: "found", doc });
}
