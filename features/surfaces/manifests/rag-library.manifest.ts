/**
 * Surface manifest — Knowledge Library (`matrx-user/rag-library`).
 *
 * The user's own RAG corpus and the shared-library catalog beside it:
 *
 *   - `/rag/library`         — every `docproc.processed_documents` row the
 *                              caller owns or curates, with derived page /
 *                              segment / embedding counts, a pipeline status
 *                              badge, a rollup of corpus totals, and the live
 *                              ingest jobs this session started.
 *   - `/rag/library-catalog` — the DISCOVERABLE shared knowledge libraries
 *                              (`rag.fn_list_library_catalog`) with the
 *                              caller's true entitlement per row, plus
 *                              self-service subscribe / unsubscribe.
 *
 * One surface covers both because they answer the same question from two
 * sides — "what knowledge can I retrieve from?" — and the same agents belong
 * in both (audit my corpus, find the doc, tell me what I'm entitled to read).
 * `library_view` says which of the two the user is standing in; every other
 * value is populated on exactly one of them.
 *
 * Emitters (both via `buildRagLibraryContextData` in
 * `features/rag/agent-context/buildRagLibraryContextData.ts`):
 *   - `features/rag/components/library/LibraryPage.tsx`
 *   - `features/rag/components/library-catalog/LibraryCatalogPage.tsx`
 *
 * DELIBERATELY NOT DECLARED: the open document's page text and segment
 * previews. Those belong to `matrx-user/rag-viewer`, which is the surface for
 * one document's contents; the library only ever holds a row summary. The
 * library's detail SHEET loads a `LibraryDocDetail` inside
 * `LibraryDocDetailSheet` and nothing lifts it to the route — only the
 * selected id is declared here, never the body it fetches.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { LIBRARY_STATUS_FILTER_VALUES } from "@/features/rag/constants/libraryStatusFilters";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "library_location",
    label: "Where the user is",
    sortOrder: 100,
    description:
      "Which half of the Knowledge Library is mounted — the user's own corpus or the shared-library catalog.",
  },
  {
    key: "library_rollup",
    label: "Corpus totals",
    sortOrder: 200,
    description:
      "Whole-corpus counts across every processed document the caller owns — the KPI tiles at the top of /rag/library.",
  },
  {
    key: "library_query",
    label: "List query",
    sortOrder: 300,
    description:
      "The search box and status filter shaping the document table, and how many rows survived them.",
  },
  {
    key: "library_documents",
    label: "Documents on screen",
    sortOrder: 400,
    description:
      "The processed-document rows currently listed, and which one the user opened.",
  },
  {
    key: "library_processing",
    label: "Active processing",
    sortOrder: 500,
    description:
      "Ingest / stage jobs this browser session started and is streaming progress for.",
  },
  {
    key: "catalog_browse",
    label: "Shared library catalog",
    sortOrder: 600,
    description:
      "Discoverable shared knowledge libraries and the caller's entitlement to each. Empty on /rag/library.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Where the user is (300-309) ───────────────────────────────────────
  {
    name: "library_view",
    label: "Library view",
    description:
      '"library" when the user is on /rag/library (their own processed documents), "catalog" when on /rag/library-catalog (shared knowledge libraries). Always present — it tells you which of the other groups carry values.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "library_location",
    sortOrder: 300,
  },

  // ── Corpus totals (310-359) ───────────────────────────────────────────
  {
    name: "documents_total",
    label: "Documents total",
    description:
      "Count of every non-trashed top-level processed document the caller owns. Absent in the catalog view and while the rollup is still loading.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "library_rollup",
    sortOrder: 310,
  },
  {
    name: "documents_ready",
    label: "Documents ready",
    description:
      'Documents whose whole pipeline finished — segments present and every segment embedded ("ready" badge). Absent in the catalog view.',
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "library_rollup",
    sortOrder: 315,
  },
  {
    name: "documents_embedding",
    label: "Documents embedding",
    description:
      "Documents with segments whose embeddings are still being written. Absent in the catalog view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "library_rollup",
    sortOrder: 320,
  },
  {
    name: "documents_extracted",
    label: "Documents extracted",
    description:
      "Documents with persisted pages but no segments yet — extraction done, segmentation not run. Absent in the catalog view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "library_rollup",
    sortOrder: 325,
  },
  {
    name: "documents_pending",
    label: "Documents pending or failed",
    description:
      "Documents whose row exists but that never persisted a page — usually an ingestion that failed early. A non-zero value is the thing a user came to this page to find. Absent in the catalog view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "library_rollup",
    sortOrder: 330,
  },
  {
    name: "pages_persisted",
    label: "Pages persisted",
    description:
      "Total extracted pages stored across the caller's whole corpus. Absent in the catalog view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    group: "library_rollup",
    sortOrder: 335,
  },
  {
    name: "segment_count",
    label: "Segments total",
    description:
      'Total retrievable segments ("chunks" in the DB) across the caller\'s corpus. This is the real size of what an agent can retrieve. Absent in the catalog view.',
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    group: "library_rollup",
    sortOrder: 340,
  },
  {
    name: "embeddings_oai",
    label: "OpenAI embeddings",
    description:
      "Segments carrying a legacy OpenAI embedding vector. Absent in the catalog view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    group: "library_rollup",
    sortOrder: 345,
  },
  {
    name: "embeddings_voyage",
    label: "Voyage embeddings",
    description:
      "Segments carrying a current voyage-4-large embedding vector — the model live search actually uses. A gap between this and segment_count means part of the corpus is unsearchable. Absent in the catalog view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    group: "library_rollup",
    sortOrder: 350,
  },
  {
    name: "data_store_count",
    label: "Data stores",
    description:
      "How many data stores the caller can see — the retrieval scopes their documents can be bound into. Absent in the catalog view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "library_rollup",
    sortOrder: 355,
  },
  {
    name: "library_totals",
    label: "Corpus totals summary",
    description:
      "Composite of the whole rollup: `{ documents_total, documents_ready, documents_embedding, documents_extracted, documents_pending, pages_persisted, segments, embeddings_oai, embeddings_voyage, data_stores }`. Absent in the catalog view and until the rollup loads.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 260,
    group: "library_rollup",
    sortOrder: 358,
  },

  // ── List query (360-389) ──────────────────────────────────────────────
  {
    name: "library_search_query",
    label: "Library search query",
    description:
      "Debounced text in the library search box (matched server-side against document name). Empty when not searching, and in the catalog view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "library_query",
    sortOrder: 360,
  },
  {
    name: "library_status_filter",
    label: "Status filter",
    description:
      '"ready", "embedding", "extracted", or "pending" when the user narrowed the table to one pipeline state. Empty when the filter is "All", and in the catalog view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 9,
    group: "library_query",
    sortOrder: 365,
  },
  {
    name: "library_total_matches",
    label: "Total matching documents",
    description:
      "Server-reported total number of documents matching the current search + status filter, before the page limit. Absent in the catalog view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "library_query",
    sortOrder: 370,
  },
  {
    name: "library_visible_count",
    label: "Documents listed",
    description:
      "How many document rows are actually on screen (the page is capped at 100). Lower than library_total_matches when the corpus overflows one page. Absent in the catalog view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "library_query",
    sortOrder: 375,
  },
  {
    name: "library_list_status",
    label: "List load status",
    description:
      '"loading", "loaded", "empty", or "error" — the state of the document table fetch. Absent in the catalog view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 7,
    group: "library_query",
    sortOrder: 380,
  },
  {
    name: "library_filters",
    label: "Library filters",
    description:
      "Composite of everything shaping the document table right now: `{ search_query, status_filter }`. `status_filter` is \"all\" when unfiltered. This is the READ TWIN of the write target of the same name — read it to see what is already applied before narrowing further, because a write REPLACES only the keys it names. Absent in the catalog view.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "library_query",
    sortOrder: 385,
  },

  // ── Documents on screen (390-429) ─────────────────────────────────────
  {
    name: "visible_documents",
    label: "Visible documents",
    description:
      "Array of `{ id, name, status, source_kind, source_id, mime_type, total_pages, pages_persisted, segments, embeddings_voyage, data_store_count, derivation_kind, created_at, updated_at }` for the rows currently listed, in display order. Empty array when nothing matches. Absent in the catalog view. Large — bind it deliberately rather than relying on automatic context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 9000,
    autoContext: false,
    group: "library_documents",
    sortOrder: 390,
  },
  {
    name: "selected_document_id",
    label: "Open document ID",
    description:
      "UUID of the processed document whose detail sheet the user opened from the table. Empty when no row is selected. The sheet's page text and segments are NOT part of this surface — read them on matrx-user/rag-viewer.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "library_documents",
    sortOrder: 395,
  },
  {
    name: "selected_document_name",
    label: "Open document name",
    description:
      "Display name of the selected row, resolved from the visible list. Empty when no row is selected or the selection came from a deep link whose row is not on this page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "library_documents",
    sortOrder: 400,
  },
  {
    name: "document_status_breakdown",
    label: "Status breakdown of listed documents",
    description:
      "Object mapping pipeline status to how many of the CURRENTLY LISTED documents hold it, e.g. `{ ready: 18, pending: 2 }`. Scoped to what is on screen, unlike the corpus rollup. Absent in the catalog view.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    group: "library_documents",
    sortOrder: 405,
  },
  {
    name: "document_source_kinds",
    label: "Source kinds of listed documents",
    description:
      'Object mapping source kind ("cld_file", "note", "code_file", …) to how many of the currently listed documents came from it. Absent in the catalog view.',
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    group: "library_documents",
    sortOrder: 410,
  },

  // ── Active processing (430-459) ───────────────────────────────────────
  {
    name: "active_job_count",
    label: "Running jobs",
    description:
      "How many ingest / stage jobs this browser session started and is still streaming. 0 when nothing is running. Absent in the catalog view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    group: "library_processing",
    sortOrder: 430,
  },
  {
    name: "active_jobs",
    label: "Active jobs",
    description:
      'Array of `{ job_id, title, kind, status, stage, message, current, total, fraction }` for jobs this session started, newest state first. `kind` is "stage" or "pipeline"; `stage` is the running pipeline step (extract / clean / chunk / embed) or empty. Empty array when idle. Absent in the catalog view.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    autoContext: false,
    group: "library_processing",
    sortOrder: 435,
  },

  // ── Shared library catalog (460-499) ──────────────────────────────────
  {
    name: "catalog_library_count",
    label: "Discoverable libraries",
    description:
      "Total number of discoverable shared knowledge libraries returned to this caller, before the search box narrows them. Absent in the library view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "catalog_browse",
    sortOrder: 460,
  },
  {
    name: "catalog_visible_count",
    label: "Libraries listed",
    description:
      'Libraries left after the catalog search box and the "only libraries I can read" checkbox. Absent in the library view.',
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "catalog_browse",
    sortOrder: 465,
  },
  {
    name: "catalog_search_query",
    label: "Catalog search query",
    description:
      "Text in the catalog search box (matches library name, description, short code, and entitling industry). Empty when not searching, and in the library view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    group: "catalog_browse",
    sortOrder: 470,
  },
  {
    name: "catalog_entitled_only",
    label: "Entitled-only filter",
    description:
      'True when the user checked "Only libraries I can read", hiding libraries they are not entitled to. Absent in the library view.',
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "catalog_browse",
    sortOrder: 475,
  },
  {
    name: "catalog_filters",
    label: "Catalog filters",
    description:
      "Composite of everything narrowing the catalog list right now: `{ search_query, entitled_only }`. This is the READ TWIN of the write target of the same name — read it before narrowing further, because a write REPLACES only the keys it names. Absent in the library view.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 50,
    group: "catalog_browse",
    sortOrder: 478,
  },
  {
    name: "catalog_entitled_count",
    label: "Entitled libraries",
    description:
      "How many of the discoverable libraries this caller can actually read right now (any entitlement route). Absent in the library view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "catalog_browse",
    sortOrder: 480,
  },
  {
    name: "catalog_selected_library_id",
    label: "Open library ID",
    description:
      "UUID of the `rag.data_stores` row the user opened in the catalog detail pane (mirrored in `?store_id`). Empty when no library is open, and in the library view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "catalog_browse",
    sortOrder: 485,
  },
  {
    name: "catalog_selected_library",
    label: "Open library",
    description:
      "Composite for the opened catalog row: `{ id, name, short_code, description, kind, member_count, subscribed, entitled_via, entitled_industry_name }`. `entitled_via` is \"organization\", \"industry\", \"global\", or null (not entitled) — it is the honest answer to \"why can I read this?\". Absent when nothing is open, and in the library view.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 340,
    group: "catalog_browse",
    sortOrder: 490,
  },
  {
    name: "catalog_libraries",
    label: "Catalog libraries",
    description:
      "Array of the catalog rows currently listed, each `{ id, name, short_code, description, kind, member_count, subscribed, entitled_via, entitled_industry_name }`, in display order. Empty array when nothing matches. Absent in the library view.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3500,
    autoContext: false,
    group: "catalog_browse",
    sortOrder: 495,
  },
];

/**
 * What an agent may WRITE on the Knowledge Library.
 *
 * The judgment that produced this set, written down because the shape is not
 * obvious from the field list:
 *
 * This surface holds exactly ONE piece of authored content — a document's
 * name. Everything else on screen is either a derived count or a filter. So
 * the target set is deliberately small, and it is built around the one job an
 * agent is genuinely better at here: FINDING a document in a corpus the user
 * cannot eyeball, opening it, and giving it a name a human can search for
 * later. Search → open → rename is one coherent flow, and each of its three
 * steps is a target below.
 *
 * The two filter pairs are COMPOSITE (one object each) rather than four
 * separate targets, following `matrx-user/agents`' `catalog_filters`:
 * "show me only the pending documents matching 'invoice'" is ONE user intent
 * and deserves ONE confirm dialog, not two. Validating the whole object before
 * touching any state also means a half-applied filter is unreachable.
 *
 * DELIBERATELY NOT WRITABLE, and each for its own reason:
 *   - Every rollup and count (`documents_*`, `library_totals`, `segment_count`,
 *     `pages_persisted`, `embeddings_*`, `visible_documents`, `active_jobs`,
 *     `document_status_breakdown`). These are DERIVED — the database's answer,
 *     not a field. A target that "sets" one would be a lie the user then reads
 *     back as truth.
 *   - Ingest, re-embed, and re-process. An embedding run spends real money per
 *     call; the human pressing the button IS the spending gate, and moving that
 *     gate behind an agent's judgment is not a convenience.
 *   - Delete and trash. Destructive stays human, always.
 *   - Catalog subscribe / unsubscribe. That changes what the user is entitled
 *     to read, which is an access decision, not a view decision.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "library_filters",
    label: "Library filters",
    description:
      "Narrows the document table on /rag/library — the same search box and status buttons the user clicks. " +
      "Value is an OBJECT containing ONLY the keys you want to change; each key you send REPLACES that filter outright. " +
      'Keys: `search_query` (string, matched server-side against the document NAME only — not its contents; pass "" to clear it), ' +
      "and `status_filter` (exactly one of: " +
      LIBRARY_STATUS_FILTER_VALUES.map((v) => `"${v}"`).join(" | ") +
      '; "all" clears the filter). ' +
      "Send both in ONE call rather than two — a second call replaces only the keys it names. " +
      "This ONLY changes what is on screen: no document is modified, moved, re-processed or deleted, and nothing is saved. " +
      'Note "pending" means the document FAILED to ingest — filtering to it is how you find broken uploads. ' +
      "After this lands, `visible_documents`, `library_visible_count` and `library_total_matches` are STALE — they describe the table from before your write, so do not report them as what is now on screen.",
    valueType: "object",
    updatesValue: "library_filters",
    mode: "ui",
    applyPolicy: "ask",
    group: "library_query",
    sortOrder: 386,
  },
  {
    name: "selected_document_id",
    label: "Open document",
    description:
      "Opens one processed document's detail sheet on /rag/library — the same thing clicking its row does. " +
      "Value is the document's UUID as a plain string, and it MUST be the `id` of a document in `visible_documents` " +
      "(narrow the table with `library_filters` first if the one you want is not listed; an id that is not on screen is refused rather than guessed at). " +
      'Pass "" to close the sheet and clear the selection. ' +
      "Opening a document changes nothing about it — it only shows the user its pages, segments and processing history. " +
      "Open the document BEFORE writing `selected_document_name`, which can only rename the one that is open.",
    valueType: "string",
    updatesValue: "selected_document_id",
    mode: "ui",
    applyPolicy: "ask",
    group: "library_documents",
    sortOrder: 396,
  },
  {
    name: "selected_document_name",
    label: "Open document name",
    description:
      "RENAMES the document whose detail sheet is currently open, exactly as the sheet's Rename dialog does. " +
      "This one is PERSISTED immediately to the database on approval — it is not staged, and there is no undo, though the user is asked first and can decline. " +
      "Value is the new name as a PLAIN TEXT STRING — not JSON, not a JSON-encoded string, and not wrapped in a code fence. " +
      'Send `Q3 Vendor Agreement — Acme`, never `"Q3 Vendor Agreement"` or `{"name": "..."}`. ' +
      "One line only (no newlines), 1-200 characters after trimming. " +
      "A document must be open first — write `selected_document_id` if none is. " +
      "This is the value worth an agent's judgment on this page: source files arrive named `scan_final_v3.pdf`, and a name describing what the document actually IS makes it findable later. " +
      "Renaming changes the label only — it never re-processes, re-embeds or moves the document, and the file it came from keeps its own name.",
    valueType: "string",
    updatesValue: "selected_document_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "library_documents",
    sortOrder: 401,
  },
  {
    name: "catalog_filters",
    label: "Catalog filters",
    description:
      "Narrows the shared-library list on /rag/library-catalog — the same search box and checkbox the user clicks. " +
      "Value is an OBJECT containing ONLY the keys you want to change; each key you send REPLACES that filter outright. " +
      'Keys: `search_query` (string, matched client-side against library name, description, short code and entitling industry; pass "" to clear it), ' +
      'and `entitled_only` (boolean; true hides libraries the user cannot read — the "Only libraries I can read" checkbox). ' +
      "Send both in ONE call rather than two. " +
      "This ONLY changes what is on screen — it does NOT subscribe the user to anything, unsubscribe them, or change what they are entitled to read. " +
      "After this lands, `catalog_libraries` and `catalog_visible_count` are STALE — they describe the list from before your write.",
    valueType: "object",
    updatesValue: "catalog_filters",
    mode: "ui",
    applyPolicy: "ask",
    group: "catalog_browse",
    sortOrder: 479,
  },
];

export const ragLibraryManifest: SurfaceManifest = {
  surfaceName: "matrx-user/rag-library",
  readiness: "partial",
  readinessNote:
    "Values authored against the live /rag/library + /rag/library-catalog components and both emitters are wired via SurfaceRuntimeProvider; not yet DB-synced and no live non-matching-name binding test run. All four write targets ARE live-verified against a real agent run on /rag/library — apply, decline, an undeclared-target refusal, and a handler throw reaching the agent. catalog_filters' handler is verified by construction on the same seam but its route (/rag/library-catalog) was not separately driven. The detail sheet's LibraryDocDetail body stays undeclared by design — it belongs to matrx-user/rag-viewer.",
  label: "Knowledge Library",
  urlPattern: "/rag/library",
  intro: `<surface_intro>
This is the user's RAG knowledge corpus — the "where did my content go?" pages.
A processed document is one extraction run over a source (a PDF, a note, a code
file). It becomes retrievable only after the pipeline finishes: pages are
extracted, cleaned, split into SEGMENTS, and each segment embedded.

Read library_view FIRST:
  - "library" — the user is on /rag/library looking at documents they own.
                The rollup values (documents_total, documents_ready,
                documents_pending, segment_count, embeddings_voyage) describe
                the whole corpus; the query values describe the table in front
                of them; visible_documents holds the rows themselves.
  - "catalog" — the user is on /rag/library-catalog browsing SHARED knowledge
                libraries published by Matrx. These are read-only and belong
                to someone else. catalog_* values apply; every library_* value
                is empty.

Diagnosis vocabulary the user shares with you: a document is "pending" when it
never persisted a page (ingestion failed early), "extracted" when pages exist
but no segments, "embedding" while vectors are still being written, and "ready"
when it is fully searchable. embeddings_voyage below segment_count means part
of the corpus cannot be retrieved yet.

This surface holds document SUMMARIES only, never their text. To read a
document's pages or segments, use its id on the document viewer surface.
In the catalog, entitled_via is the honest answer to "why can I read this?" —
null means the user cannot read that library at all.

YOU CAN NAVIGATE THIS CORPUS AND NAME ONE DOCUMENT — NOTHING ELSE.
Four targets are writable, and they exist to serve one flow: FIND a document
the user is describing, OPEN it, and give it a name they can find it by later.
  - library_filters   — narrow the table (search_query + status_filter, ONE
                        object, one call)
  - selected_document_id   — open a row from visible_documents
  - selected_document_name — RENAME the open document; persisted on approval
  - catalog_filters   — narrow the catalog list (catalog view only)
Renaming is the one place your judgment produces real value here: a corpus
full of scan_final_v3.pdf is a corpus nobody can search. Read the document's
row first and name it for what it IS.
Everything that SPENDS or DESTROYS is deliberately not writable — ingesting,
re-processing, re-embedding, deleting, and catalog subscribe/unsubscribe.
An embedding run costs real money, so the user's own click is the gate. Hand
them the narrowed list and let them press the button.
Every count and total is DERIVED and cannot be written at all. After any
filter write, the counts and row lists you were given describe the PREVIOUS
view — they were captured when this run started, so do not read them back as
what is now on screen.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One processed-document row as this surface hands it to an agent. */
export interface RagLibraryDocumentEntry {
  id: string;
  name: string;
  status: string;
  source_kind: string;
  source_id: string;
  mime_type: string | null;
  total_pages: number | null;
  pages_persisted: number;
  segments: number;
  embeddings_voyage: number;
  data_store_count: number;
  derivation_kind: string;
  created_at: string;
  updated_at: string;
}

/** One live processing job as this surface hands it to an agent. */
export interface RagLibraryJobEntry {
  job_id: string;
  title: string;
  kind: string;
  status: string;
  stage: string | null;
  message: string | null;
  current: number | null;
  total: number | null;
  fraction: number | null;
}

/** One shared-library catalog row as this surface hands it to an agent. */
export interface RagLibraryCatalogEntry {
  id: string;
  name: string;
  short_code: string | null;
  description: string | null;
  kind: string;
  member_count: number;
  subscribed: boolean;
  entitled_via: string | null;
  entitled_industry_name: string | null;
}

/**
 * Scope builder for `matrx-user/rag-library`.
 *
 * Only `library_view` is guaranteed — every other value belongs to exactly one
 * of the two routes (or to a load that may not have settled), so it is optional
 * by construction.
 */
export function createRagLibraryScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;

  library_view: string;

  // Corpus totals
  documents_total?: number;
  documents_ready?: number;
  documents_embedding?: number;
  documents_extracted?: number;
  documents_pending?: number;
  pages_persisted?: number;
  segment_count?: number;
  embeddings_oai?: number;
  embeddings_voyage?: number;
  data_store_count?: number;
  library_totals?: Record<string, unknown>;

  // List query
  library_search_query?: string;
  library_status_filter?: string;
  library_filters?: Record<string, unknown>;
  library_total_matches?: number;
  library_visible_count?: number;
  library_list_status?: string;

  // Documents on screen
  visible_documents?: RagLibraryDocumentEntry[];
  selected_document_id?: string;
  selected_document_name?: string;
  document_status_breakdown?: Record<string, number>;
  document_source_kinds?: Record<string, number>;

  // Active processing
  active_job_count?: number;
  active_jobs?: RagLibraryJobEntry[];

  // Shared library catalog
  catalog_library_count?: number;
  catalog_visible_count?: number;
  catalog_search_query?: string;
  catalog_entitled_only?: boolean;
  catalog_filters?: Record<string, unknown>;
  catalog_entitled_count?: number;
  catalog_selected_library_id?: string;
  catalog_selected_library?: RagLibraryCatalogEntry;
  catalog_libraries?: RagLibraryCatalogEntry[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
