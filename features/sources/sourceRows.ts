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

import { withDisplayTitle } from "@/components/markdown-core/plain-title";

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
  "intelligence_policy",
  "total_pages",
  "organization_id",
  "created_by",
  "created_at",
  "updated_at",
  // When the Source entered the person's world — see SOURCE_LIST_ORDER_COLUMN.
  "captured_at",
].join(",");

/**
 * THE order of every Source list: newest by the time the Source entered the
 * person's world (`captured_at`, stamped once when the row lands — the
 * recorded capture time, which a backfill carries over from the original
 * capture, or a backfilled file's upload time), never by the row's birth. On 2026-09-26 the SOURCE-CONVERGENCE backfills landed ~12,000
 * months-old captures, research pages and files with created_at = that day;
 * ordered by created_at they filled the first 100 Saved rows 100/100 and hid
 * everything the person had actually done. `id` makes it a total order.
 */
export const SOURCE_LIST_ORDER_COLUMN = "captured_at";

/**
 * A Source the platform materialized in the background — the backfills stamp
 * `intelligence_policy = 'materialize_only'`, and nothing a person does lands
 * one. It is never "an upload", whatever its kind: the files backfill turned
 * 3,366 of one owner's files (3,324 of them crawler output under
 * `system-files/`) into `cld_file` Sources. As a PostgREST `or` value: rows
 * that are NOT background-materialized.
 */
export const BACKGROUND_MATERIALIZED_POLICY = "materialize_only";
export const NOT_BACKGROUND_MATERIALIZED_OR =
  `intelligence_policy.is.null,intelligence_policy.neq.${BACKGROUND_MATERIALIZED_POLICY}`;

export function isBackgroundMaterialized(
  row: Pick<SourceListRow, "intelligence_policy">,
): boolean {
  return row.intelligence_policy === BACKGROUND_MATERIALIZED_POLICY;
}

/** The time a Source list shows and sorts by (falls back to created_at). */
export function sourceListedAt(
  row: Pick<SourceListRow, "captured_at" | "created_at">,
): string {
  return row.captured_at ?? row.created_at;
}

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
  /** `materialize_only` = landed in the background by a backfill. */
  intelligence_policy?: string | null;
  total_pages: number | null;
  organization_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** When the Source entered the person's world — see SOURCE_LIST_ORDER_COLUMN. */
  captured_at?: string | null;
}

/**
 * The read boundary for a listed Source: its name is shown as TEXT. A producer
 * (a search-result title, a caption track's title) can store markup such as
 * "Why <b>OpenAI</b> is…"; React escapes it, so it would show the literal tags.
 * The one plain-title projection strips it; storage is untouched.
 */
export function listedSource<T extends Pick<SourceListRow, "name">>(row: T): T {
  return withDisplayTitle(row, "name");
}

/**
 * WHOSE Sources a view lists — who captured them, never a privacy filter
 * (Arman 2026-09-26: a Source is organization data; no per-Source privacy).
 *   mine → Sources I captured.   orgs → every Source in the organization.
 */
export function applySourcesScope<
  Q extends { eq: (column: string, value: string) => Q },
>(
  q: Q,
  scope: { kind: "mine" } | { kind: "orgs"; organizationId: string },
  userId: string,
): Q {
  return scope.kind === "mine"
    ? q.eq("created_by", userId)
    : q.eq("organization_id", scope.organizationId);
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
  /**
   * Whether entity extraction ran on the current version (`not_run` /
   * `running` / `done` / `failed:<sentence>`), when the server reports it.
   */
  entitiesState: string | null;
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
  entities_state?: string | null;
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
    entitiesState: typeof r.entities_state === "string" ? r.entities_state : null,
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

/**
 * Which stored `source_kind` tokens make up each kind a person sees. The ONE
 * table: the Sources page's Kind column and filter, and the Knowledge search
 * page's kind filter (`features/rag/search-controls.ts`), both read it, so a
 * kind the Sources page shows can never be missing from search.
 */
export const SOURCE_KIND_GROUP_KINDS: Record<
  Exclude<SourceKindGroup, "other">,
  readonly string[]
> = {
  file: ["cld_file", "legacy", "code_file"],
  web_page: ["scrape_parsed_page", "web_page", "external_url"],
  transcript: ["transcript"],
  note: ["note"],
  pasted_text: ["inline"],
};

const GROUP_BY_KIND: Record<string, SourceKindGroup> = Object.fromEntries(
  Object.entries(SOURCE_KIND_GROUP_KINDS).flatMap(([group, kinds]) =>
    kinds.map((kind) => [kind, group as SourceKindGroup]),
  ),
);

export function sourceKindGroup(sourceKind: string): SourceKindGroup {
  return GROUP_BY_KIND[sourceKind] ?? "other";
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
  // Plain words (V1-A): "entities" is the index's term for the people, places
  // and ideas it picked out — a person reads "key terms found".
  entities: "Searchable · key terms found",
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

/**
 * THE STAGE RE-READ RULE. "Indexing…" is a claim about a job that is running
 * right now, so a screen that shows it must keep asking until the job ends —
 * a facts row read once and never again showed "Indexing…" for ten minutes on
 * a Source whose job finished twelve seconds after the save (2026-09-27).
 *
 * Returns how long to wait before re-reading the facts, or null when nothing
 * is running and the stage is settled (stop asking). Fast while a job is
 * young (most finish in seconds), slower once it has run a while, never
 * stopping while the server still says a job is open.
 */
export function factsPollDelayMs(
  indexing: boolean,
  elapsedMs: number,
): number | null {
  if (!indexing) return null;
  if (elapsedMs < 60_000) return 2_000;
  if (elapsedMs < 5 * 60_000) return 5_000;
  return 15_000;
}

/** The listed rows whose facts say a job is open — the rows a list re-reads. */
export function indexingIds(facts: ReadonlyMap<string, SourceFacts>): string[] {
  const out: string[] = [];
  facts.forEach((f, id) => {
    if (f.indexing) out.push(id);
  });
  return out.sort();
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
 * pages, agent fetches) are Saved only when someone said so. A Source the
 * platform materialized in the background is never "an upload" — only a
 * Save (`kept_at`) makes it Saved.
 */
export function isSourceSaved(
  row: Pick<
    SourceListRow,
    "kept_at" | "source_kind" | "origin_client" | "intelligence_policy"
  >,
): boolean {
  if (row.kept_at) return true;
  if (isBackgroundMaterialized(row)) return false;
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
  T extends Pick<
    SourceListRow,
    "kept_at" | "source_kind" | "origin_client" | "intelligence_policy"
  >,
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

// ── Paging (the list reads 100 at a time, filtered by the server) ────────────

export const SOURCES_PAGE_SIZE = 100;

/**
 * `isSourceSaved` as a PostgREST `or` filter — the two must mean the same:
 * saved by a person, an upload (no origin recorded, or `upload`), or pasted
 * text from before Save existed — the last two never background-materialized.
 */
export const SAVED_FILTER_OR =
  "kept_at.not.is.null," +
  `and(source_kind.in.(cld_file,legacy,code_file),or(origin_client.is.null,origin_client.eq.upload),or(${NOT_BACKGROUND_MATERIALIZED_OR})),` +
  `and(source_kind.eq.inline,origin_client.is.null,or(${NOT_BACKGROUND_MATERIALIZED_OR}))`;

/** Name-or-address search as a PostgREST `or` filter; `null` for a blank search. */
export function searchFilterOr(search: string): string | null {
  // `,` `(` `)` separate PostgREST filter terms; `%` `*` are wildcards.
  const term = search.replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim();
  if (!term) return null;
  return `name.ilike.%${term}%,canonical_identity.ilike.%${term}%`;
}

/**
 * Add one page to the rows already listed, keeping one row per Source: a
 * recapture supersedes its parent, and the newer recapture usually arrives on
 * an earlier page (newest first), so its parent is dropped when it arrives.
 */
export function appendSourcePage<
  T extends Pick<SourceListRow, "id" | "parent_processed_id" | "derivation_kind">,
>(existing: readonly T[], page: readonly T[]): T[] {
  const seen = new Set(existing.map((r) => r.id));
  return currentVersionsOnly([...existing, ...page.filter((r) => !seen.has(r.id))]);
}

/** One row per Source: originals and recaptures, never derived copies. */
export const ONE_ROW_PER_SOURCE_OR = "parent_processed_id.is.null,derivation_kind.eq.recapture";

/**
 * The list's whole narrowing as ONE PostgREST `or` value (PostgREST takes a
 * single `or` parameter, so several narrowings nest inside one `and(...)`).
 */
export function sourcesListFilter(options: {
  saved: boolean;
  search: string;
}): string {
  const parts = [`or(${ONE_ROW_PER_SOURCE_OR})`];
  if (options.saved) parts.push(`or(${SAVED_FILTER_OR})`);
  const search = searchFilterOr(options.search);
  if (search) parts.push(`or(${search})`);
  return `and(${parts.join(",")})`;
}
