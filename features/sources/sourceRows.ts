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
  "owner_id",
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
  owner_id: string;
  visibility: string;
  created_at: string;
  updated_at: string;
}

export interface SourceAttachment {
  target_type: string;
  target_id: string;
  label: string | null;
}

/** Per-row facts the list reads in one call (`docproc.source_list_facts`). */
export interface SourceFacts {
  chunkCount: number;
  entityCount: number;
  attachments: SourceAttachment[];
}

// ── Kind ─────────────────────────────────────────────────────────────────────

export type SourceKindGroup = "file" | "web_page" | "transcript" | "note" | "pasted_text" | "other";

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

const CLIENT_WORDS: Record<string, string> = {
  web: "Web app",
  extension: "Browser extension",
  local: "Desktop app",
  cloud_browser: "Cloud browser",
  agent: "An agent",
  research: "Research",
  crawl: "Site crawl",
  upload: "Upload",
  transcription: "Transcription",
  youtube: "YouTube",
  backfill: "Imported",
};

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
export function captureWords(row: Pick<SourceListRow, "origin_client" | "capture_method" | "source_kind">): string {
  const client = row.origin_client ? (CLIENT_WORDS[row.origin_client] ?? row.origin_client) : null;
  const method = row.capture_method ? (METHOD_WORDS[row.capture_method] ?? row.capture_method) : null;
  if (client && method) return `${client} · ${method}`;
  if (client) return client;
  if (sourceKindGroup(row.source_kind) === "file") return "Upload";
  return "Not recorded";
}

/** The facet value for "how it was captured" — the client in words. */
export function captureClientLabel(row: Pick<SourceListRow, "origin_client" | "source_kind">): string {
  if (row.origin_client) return CLIENT_WORDS[row.origin_client] ?? row.origin_client;
  return sourceKindGroup(row.source_kind) === "file" ? "Upload" : "Not recorded";
}

// ── Stage ────────────────────────────────────────────────────────────────────

export type SourceStage = "raw" | "cleaned" | "searchable" | "entities";

export const SOURCE_STAGE_LABEL: Record<SourceStage, string> = {
  raw: "Raw only",
  cleaned: "Cleaned",
  searchable: "Searchable",
  entities: "Entities",
};

/**
 * The furthest stage this Source reached. `facts` is absent while the per-row
 * read is in flight or failed — the caller renders that as unknown, never as
 * "Raw only".
 */
export function sourceStage(
  row: Pick<SourceListRow, "clean_content_completed_at" | "canonical_clean_id">,
  facts: Pick<SourceFacts, "chunkCount" | "entityCount">,
): SourceStage {
  if (facts.entityCount > 0) return "entities";
  if (facts.chunkCount > 0) return "searchable";
  if (row.clean_content_completed_at || row.canonical_clean_id) return "cleaned";
  return "raw";
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
  if (group === "file" && (row.origin_client == null || row.origin_client === "upload")) return true;
  if (group === "pasted_text" && row.origin_client == null) return true;
  return false;
}

export type SavedFilter = "saved" | "all";

/** The page opens on Saved; "All captures" is one obvious toggle away. */
export const DEFAULT_SAVED_FILTER: SavedFilter = "saved";

export function applySavedFilter<T extends Pick<SourceListRow, "kept_at" | "source_kind" | "origin_client">>(
  rows: readonly T[],
  filter: SavedFilter,
): T[] {
  return filter === "all" ? [...rows] : rows.filter(isSourceSaved);
}

// ── Versions ─────────────────────────────────────────────────────────────────

/**
 * One row per Source: a recapture supersedes its parent, so the parent (an
 * older version of the same page) is dropped. Derived documents (cleaned
 * copies, forks, structured extracts) are never listed — the query already
 * excludes them; this is the second half of "one row per Source".
 */
export function currentVersionsOnly<T extends Pick<SourceListRow, "id" | "parent_processed_id" | "derivation_kind">>(
  rows: readonly T[],
): T[] {
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
export function isFileCanonicalExtract(row: Pick<SourceListRow, "source_kind" | "derivation_kind">): boolean {
  return (
    (row.source_kind === "cld_file" || row.source_kind === "legacy") &&
    (row.derivation_kind === "initial_extract" || row.derivation_kind === "legacy_import")
  );
}

/** Words for an attachment's kind, e.g. "research_topic" → "Research topic". */
export function attachmentTypeWords(token: string): string {
  const words = token.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
