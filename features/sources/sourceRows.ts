/**
 * features/sources/sourceRows.ts
 *
 * The Sources page's pure logic (SOURCE-CONVERGENCE §8.1): how one
 * `docproc.processed_documents` row reads to a person — what kind of thing it
 * is, how it was captured (in words, never a code), how far along it is, and
 * whether it counts as Saved. No React, no Supabase: everything here is a
 * function of the row, so it is tested directly and the list, the facets and
 * the filters can never disagree about what a word means.
 *
 * Screen vocabulary (plan §8): "Save"/"Saved" — never "Keep"; the row is a
 * "Source".
 */

/** The columns the Sources list reads — nothing wider (no bodies). */
export const SOURCE_LIST_COLUMNS = [
  "id",
  "name",
  "source_kind",
  "source_id",
  "mime_type",
  "origin_client",
  "capture_method",
  "canonical_identity",
  "derivation_kind",
  "parent_processed_id",
  "kept_at",
  "clean_content_completed_at",
  "canonical_clean_id",
  "total_pages",
  "organization_id",
  "created_by",
  "visibility",
  "created_at",
  "updated_at",
].join(",");

export interface SourceListRow {
  id: string;
  name: string;
  source_kind: string;
  source_id: string;
  mime_type: string | null;
  origin_client: string | null;
  capture_method: string | null;
  canonical_identity: string | null;
  derivation_kind: string;
  parent_processed_id: string | null;
  kept_at: string | null;
  clean_content_completed_at: string | null;
  canonical_clean_id: string | null;
  total_pages: number | null;
  organization_id: string;
  created_by: string;
  visibility: string;
  created_at: string;
  updated_at: string;
}

export interface SourceAttachment {
  target_type: string;
  target_id: string;
  label: string | null;
}

/**
 * Per-row facts the list reads in one call (`docproc.source_list_facts`).
 *
 * A person's edit (plan §1 rule 4) is the Source's CURRENT version — what
 * people read and what AI must search — so the stage is read from the
 * `current*` facts, never from the listed capture's own chunks (those are the
 * pre-edit text once an edit exists).
 */
export interface SourceFacts {
  /** Chunks on the listed row itself. */
  chunkCount: number;
  /** Entities were found on the listed row's chunks. */
  hasEntities: boolean;
  attachments: SourceAttachment[];
  /** The version people read: the live edit, else the listed row. */
  currentDocumentId: string;
  currentChunkCount: number;
  currentHasEntities: boolean;
  /** Chunks still held by this Source's OTHER versions — old text answering searches. */
  staleChunkCount: number;
  /** An intelligence job for the current version is pending or running. */
  indexing: boolean;
  /** The Source's newest capture (the head of the recapture chain). */
  headDocumentId: string;
}

export interface SourceFactsRow {
  processed_document_id: string;
  chunk_count: number | null;
  has_entities: boolean | null;
  attachments: unknown;
  current_document_id?: string | null;
  current_chunk_count?: number | null;
  current_has_entities?: boolean | null;
  stale_chunk_count?: number | null;
  indexing?: boolean | null;
  head_document_id?: string | null;
}

function asAttachments(value: unknown): SourceAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): SourceAttachment[] => {
    if (!v || typeof v !== "object") return [];
    const r = v as Record<string, unknown>;
    if (typeof r.target_type !== "string" || typeof r.target_id !== "string")
      return [];
    return [
      {
        target_type: r.target_type,
        target_id: r.target_id,
        label: typeof r.label === "string" ? r.label : null,
      },
    ];
  });
}

/**
 * One facts row → `SourceFacts`, or null when the row lacks the
 * current-version columns (an older server function): the caller then shows
 * the stage as unknown — it never falls back to the capture's chunk count,
 * which is exactly the lie this read exists to prevent.
 */
export function sourceFactsFromRow(r: SourceFactsRow): SourceFacts | null {
  if (
    typeof r.current_document_id !== "string" ||
    typeof r.current_chunk_count !== "number" ||
    typeof r.stale_chunk_count !== "number" ||
    typeof r.indexing !== "boolean" ||
    typeof r.current_has_entities !== "boolean" ||
    typeof r.head_document_id !== "string"
  )
    return null;
  return {
    chunkCount: r.chunk_count ?? 0,
    hasEntities: r.has_entities ?? false,
    attachments: asAttachments(r.attachments),
    currentDocumentId: r.current_document_id,
    currentChunkCount: r.current_chunk_count,
    currentHasEntities: r.current_has_entities ?? false,
    staleChunkCount: r.stale_chunk_count,
    indexing: r.indexing,
    headDocumentId: r.head_document_id,
  };
}

// ── Kind ─────────────────────────────────────────────────────────────────────

export type SourceKindGroup =
  "file" | "web_page" | "transcript" | "note" | "pasted_text" | "other";

export const SOURCE_KIND_LABEL: Record<SourceKindGroup, string> = {
  file: "File",
  web_page: "Web page",
  transcript: "Transcript",
  note: "Note",
  pasted_text: "Pasted text",
  other: "Other",
};

export function sourceKindGroup(sourceKind: string): SourceKindGroup {
  switch (sourceKind) {
    case "cld_file":
    case "legacy":
    case "code_file":
      return "file";
    case "scrape_parsed_page":
    case "web_page":
    case "external_url":
      return "web_page";
    case "transcript":
      return "transcript";
    case "note":
      return "note";
    case "inline":
      return "pasted_text";
    default:
      return "other";
  }
}

// ── How it was captured ──────────────────────────────────────────────────────

/**
 * Every `origin_client` the door writes (aidream `landing_types.py`), in the
 * words the origin filter shows. A code this build has not heard of is shown
 * as words too (`codeWords`), never raw.
 */
const CLIENT_WORDS: Record<string, string> = {
  web: "Web app",
  extension: "Extension",
  local: "Desktop",
  cloud_browser: "Cloud browser",
  agent: "Agent",
  research: "Research",
  crawl: "Crawl",
  upload: "Upload",
  transcription: "Transcript",
  youtube: "YouTube",
  backfill: "Backfilled",
};

export const ORIGIN_CLIENTS: readonly string[] = Object.keys(CLIENT_WORDS);

function codeWords(code: string): string {
  const words = code.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function clientWords(code: string): string {
  return CLIENT_WORDS[code] ?? codeWords(code);
}

const METHOD_WORDS: Record<string, string> = {
  http: "direct fetch",
  browser: "server browser",
  residential: "your network",
  own_browser: "your browser",
  human_drive: "you drove the page",
  native: "as written",
  ocr: "read from images",
  captions: "captions",
  speech: "speech to text",
};

/**
 * "Browser extension · your browser". A row landed before the door existed
 * carries no provenance: a file says "Upload" (that is how every such file
 * arrived); anything else says so plainly rather than guessing.
 */
export function captureWords(
  row: Pick<SourceListRow, "origin_client" | "capture_method" | "source_kind">,
): string {
  const client = row.origin_client ? clientWords(row.origin_client) : null;
  const method = row.capture_method
    ? (METHOD_WORDS[row.capture_method] ?? codeWords(row.capture_method))
    : null;
  if (client && method) return `${client} · ${method}`;
  if (client) return client;
  if (sourceKindGroup(row.source_kind) === "file") return "Upload";
  return "Not recorded";
}

/** The facet value for "how it was captured" — the client in words. */
export function captureClientLabel(
  row: Pick<SourceListRow, "origin_client" | "source_kind">,
): string {
  if (row.origin_client) return clientWords(row.origin_client);
  return sourceKindGroup(row.source_kind) === "file"
    ? "Upload"
    : "Not recorded";
}

// ── Transcript facts ─────────────────────────────────────────────────────────

/**
 * A transcript Source's segment count: its portions (one per segment, the
 * door's `total_pages`). `null` for any other kind or when not recorded.
 */
export function transcriptSegmentCount(
  row: Pick<SourceListRow, "source_kind" | "total_pages">,
): number | null {
  if (sourceKindGroup(row.source_kind) !== "transcript") return null;
  return row.total_pages && row.total_pages > 0 ? row.total_pages : null;
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * "1:49 · 51 segments" from the facts the Source holds — the last segment's
 * end (`locator.t1_ms`) and its segment count. Says only what it knows; `null`
 * when it knows neither, so the cell shows nothing rather than a guess.
 */
export function transcriptLengthWords(
  segments: number | null,
  lastSegmentEndMs: number | null,
): string | null {
  const parts: string[] = [];
  if (lastSegmentEndMs && lastSegmentEndMs > 0) parts.push(clock(lastSegmentEndMs));
  if (segments && segments > 0)
    parts.push(`${segments} ${segments === 1 ? "segment" : "segments"}`);
  return parts.length ? parts.join(" · ") : null;
}

// ── Stage ────────────────────────────────────────────────────────────────────

export type SourceStage =
  "not_searchable" | "indexing" | "searchable" | "entities" | "stale";

export const SOURCE_STAGE_LABEL: Record<SourceStage, string> = {
  not_searchable: "Not yet searchable",
  indexing: "Indexing…",
  searchable: "Searchable",
  entities: "Searchable · entities",
  stale: "Index stale — re-index",
};

/**
 * Where the Source's CURRENT version stands for search. `facts` is absent
 * while the per-row read is in flight or failed — the caller renders that as
 * unknown, never as a stage.
 *
 *   indexing   — a job for the current version is open (it will replace any
 *                old chunks when it finishes).
 *   entities / searchable — the current version has chunks.
 *   stale      — the current version has none, but an older version still
 *                does: searches answer with text people no longer read.
 *   not_searchable — nothing is indexed.
 */
export function sourceStage(
  facts: Pick<
    SourceFacts,
    "currentChunkCount" | "currentHasEntities" | "staleChunkCount" | "indexing"
  >,
): SourceStage {
  if (facts.indexing) return "indexing";
  if (facts.currentChunkCount > 0)
    return facts.currentHasEntities ? "entities" : "searchable";
  if (facts.staleChunkCount > 0) return "stale";
  return "not_searchable";
}

/** What one row's Stage cell shows: the stage, or the state of reading it. */
export type StageCellState = SourceStage | "checking" | "read_failed";

export const STAGE_CELL_LABEL: Record<"checking" | "read_failed", string> = {
  checking: "Checking…",
  read_failed: "Couldn't read status",
};

/**
 * A row with facts shows its stage — whatever happened to other batches. A row
 * without facts is "checking" while its read (or retry) runs, and otherwise a
 * failed read with a retry: never a bare "Unknown".
 */
export function stageCellState(
  facts: SourceFacts | undefined,
  read: { loading: boolean; failed: boolean; retrying: boolean },
): StageCellState {
  if (facts) return sourceStage(facts);
  if (read.retrying || (read.loading && !read.failed)) return "checking";
  return "read_failed";
}

// ── Saved ────────────────────────────────────────────────────────────────────

/**
 * A Source is Saved when a person saved it (`kept_at`), or when it is a file
 * someone deliberately uploaded before Save existed: an upload IS a save —
 * nobody uploads a PDF by accident — and hiding 300 uploaded files behind a
 * default "Saved" filter would read as "my files are gone". Captures (web
 * pages, agent fetches) are Saved only when someone said so.
 */
export function isSourceSaved(
  row: Pick<SourceListRow, "kept_at" | "source_kind" | "origin_client">,
): boolean {
  if (row.kept_at) return true;
  const group = sourceKindGroup(row.source_kind);
  if (
    group === "file" &&
    (row.origin_client == null || row.origin_client === "upload")
  )
    return true;
  if (group === "pasted_text" && row.origin_client == null) return true;
  return false;
}

export type SavedFilter = "saved" | "all";

/** The page opens on Saved; "All captures" is one obvious toggle away. */
export const DEFAULT_SAVED_FILTER: SavedFilter = "saved";

export function applySavedFilter<
  T extends Pick<SourceListRow, "kept_at" | "source_kind" | "origin_client">,
>(rows: readonly T[], filter: SavedFilter): T[] {
  return filter === "all" ? [...rows] : rows.filter(isSourceSaved);
}

// ── Versions ─────────────────────────────────────────────────────────────────

/**
 * One row per Source: a recapture supersedes its parent, so the parent (an
 * older version of the same page) is dropped. Derived documents (cleaned
 * copies, forks, structured extracts) are never listed — the query already
 * excludes them; this is the second half of "one row per Source".
 */
export function currentVersionsOnly<
  T extends Pick<
    SourceListRow,
    "id" | "parent_processed_id" | "derivation_kind"
  >,
>(rows: readonly T[]): T[] {
  const superseded = new Set(
    rows
      .filter((r) => r.derivation_kind === "recapture" && r.parent_processed_id)
      .map((r) => r.parent_processed_id as string),
  );
  return rows.filter(
    (r) =>
      !superseded.has(r.id) &&
      (r.parent_processed_id == null || r.derivation_kind === "recapture"),
  );
}

/** A canonical file extract is removed with its file, never on its own. */
export function isFileCanonicalExtract(
  row: Pick<SourceListRow, "source_kind" | "derivation_kind">,
): boolean {
  return (
    (row.source_kind === "cld_file" || row.source_kind === "legacy") &&
    (row.derivation_kind === "initial_extract" ||
      row.derivation_kind === "legacy_import")
  );
}

/** Words for an attachment's kind, e.g. "research_topic" → "Research topic". */
export function attachmentTypeWords(token: string): string {
  const words = token.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
