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
 * Selection (in order):
 *   1. `files.files.canonical_processed_document_id` — the viewable extract
 *      (`initial_extract`, pages + raw/clean text). Same bridge PDF surfaces use.
 *   2. Newest non-archived row for (`source_kind = 'cld_file'`, `source_id`).
 *      Avoid treating knowledge-asset derivatives (`synthetic_qa`, …) as the
 *      attach/preview target when a canonical extract exists.
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
import { filesDb } from "@/features/files/filesDb";
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

type ProcessedDocRow = {
  id: string;
  derivation_kind: string;
  total_pages: number | null;
  updated_at: string;
  clean_content_completed_at: string | null;
};

function toFoundState(row: ProcessedDocRow): FileDocumentState {
  return {
    kind: "found",
    doc: {
      processed_document_id: row.id,
      derivation_kind: row.derivation_kind,
      total_pages: row.total_pages,
      chunk_count: null,
      has_clean_content: row.clean_content_completed_at != null,
      updated_at: row.updated_at,
    },
  };
}

async function fetchProcessedDocumentById(
  processedDocumentId: string,
): Promise<ProcessedDocRow | null> {
  const { data, error } = await supabase
    .schema("docproc")
    .from("processed_documents")
    .select(
      "id, derivation_kind, total_pages, updated_at, clean_content_completed_at",
    )
    .is("deleted_at", null)
    .eq("id", processedDocumentId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchNewestProcessedDocumentForFile(
  fileId: string,
): Promise<ProcessedDocRow | null> {
  const { data, error } = await supabase
    .schema("docproc")
    .from("processed_documents")
    .select(
      "id, derivation_kind, total_pages, updated_at, clean_content_completed_at",
    )
    .is("deleted_at", null)
    .eq("source_kind", "cld_file")
    .eq("source_id", fileId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Canonical viewable extract for a cloud file — shared with PDF surface links. */
export async function resolveCanonicalProcessedDocumentId(
  fileId: string,
): Promise<string | null> {
  const { data: bridge, error: bridgeError } = await filesDb(supabase)
    .from("files")
    .select("canonical_processed_document_id")
    .is("deleted_at", null)
    .eq("id", fileId)
    .maybeSingle();
  if (bridgeError) throw bridgeError;
  return bridge?.canonical_processed_document_id ?? null;
}

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
      let row: ProcessedDocRow | null = null;

      const canonicalId = await resolveCanonicalProcessedDocumentId(fileId);
      if (canonicalId) {
        row = await fetchProcessedDocumentById(canonicalId);
      }
      if (!row) {
        row = await fetchNewestProcessedDocumentForFile(fileId);
      }

      if (!row) {
        const state: FileDocumentState = { kind: "absent" };
        cache.set(fileId, state);
        return state;
      }

      const state = toFoundState(row);
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

/**
 * Synchronous cache peek — returns the memoised answer if this file was already
 * probed (the RAG badge / preview surfaces prime it), else `undefined`. Lets a
 * synchronous caller (the attach handler) decide the attach shape in the same
 * tick when the answer is already known — avoiding an async round-trip that
 * would let a fast submit race the attach.
 */
export function peekFileDocument(
  fileId: string,
): FileDocumentState | undefined {
  return cache.get(fileId);
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
