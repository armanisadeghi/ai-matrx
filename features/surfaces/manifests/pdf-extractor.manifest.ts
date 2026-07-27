/**
 * Surface manifest — PDF Extractor (`matrx-user/pdf-extractor`).
 *
 * Drives one-shot agent runs on `/tools/pdf-extractor` (AI Actions / bound
 * agents). Distinct from the child surface `matrx-user/extractor-chunker`,
 * which runs an agent chunk-by-chunk.
 *
 * The extractor shows a 4-way scope picker (Full doc / Current page /
 * Page range / Selected text) and a list of agent shortcuts attached
 * to this surface. The picker is for the *default* run target — but
 * **every scope is exposed as its own named SurfaceValue regardless of
 * which one is picked**, so an agent author can wire a variable to
 * "always run on the full doc" or "always run on the current page"
 * independent of what the end-user picks. There is also a
 * picker-following value (`active_scope_text`) for agents that should
 * follow the user's choice.
 *
 * The rule: **if the surface can produce a value, the manifest
 * declares it.** Attaching a variable costs us 15 seconds; *not*
 * exposing a value costs the user permanent access. Default to "yes,
 * expose it" — the binding editor groups things for readability.
 *
 * The chunked-run child surface (`matrx-user/extractor-chunker`)
 * inherits every value declared here so an agent that wires
 * `full_document_text` works in both surfaces. Whether each value is
 * *populated* at runtime in the chunked surface is a per-value
 * decision in that surface's runtime code — the manifest only
 * declares "this is wireable".
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/**
 * Canonical sections of the extractor studio, in the order the page reads:
 * which document → what text → where the user is → what else is open →
 * what the pipeline is doing.
 *
 * Children (`extractor-chunker`, `analysis-studio`, `scanner`) must NOT
 * declare these keys — inherited values auto-collapse into
 * `inherited:matrx-user/pdf-extractor`.
 */
const groups: SurfaceValueGroup[] = [
  { key: "pdf_document", label: "Document identity", sortOrder: 100 },
  { key: "pdf_text", label: "Document text", sortOrder: 200 },
  { key: "pdf_reader", label: "Reader state", sortOrder: 300 },
  { key: "pdf_library", label: "Open library", sortOrder: 400 },
  { key: "pdf_pipeline", label: "Processing pipeline", sortOrder: 500 },
  { key: "pdf_legacy", label: "Legacy aliases", sortOrder: 800 },
];

/**
 * Values the PDF Extractor surface emits. The chunked-run child re-exports
 * these via `getPdfExtractorSurfaceSpecificValues()` below, so this array
 * is also the source of truth for "everything extractor-chunker
 * inherits from pdf-extractor."
 *
 * Sort order groups (drives dropdown order in the binding editor):
 *
 *   200-249  Explicit scope-text variables (the user's 4 + active scope)
 *   300-349  Document metadata (filename, ids, page counts)
 *   400-449  Runtime / picker state (current page, scope kind, etc.)
 */
const surfaceSpecific: SurfaceValue[] = [
  // ── Explicit scope-text variables (200-249) ──────────────────────────
  {
    name: "full_document_text",
    label: "Full document text",
    description:
      "Entire document body — AI-cleaned per-page text joined with `--- Page N ---` markers when available, raw OCR otherwise. Always populated when the surface emits. Wire here for an agent that should ALWAYS run on the whole document regardless of what scope the user picks in the UI.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12000,
    group: "pdf_text",
    sortOrder: 200,
  },
  {
    name: "current_page_text",
    label: "Current page text",
    description:
      "Text of the page the user is currently viewing in the PDF pane. Always populated when the surface emits. Wire here for an agent that should ALWAYS run on the current page, independent of the scope picker.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 2000,
    group: "pdf_text",
    sortOrder: 210,
  },
  {
    name: "page_range_text",
    label: "Page range text",
    description:
      "Text of the pages the user has entered in the page-range input (joined with `--- Page N ---` markers). Empty when no page range is currently entered. Wire here for an agent that should run on a user-supplied range regardless of which scope button is highlighted.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    group: "pdf_text",
    sortOrder: 220,
  },
  {
    name: "selected_text",
    label: "Selected text (browser)",
    description:
      "Text the user has currently highlighted in either content pane (browser text selection). Empty when nothing is selected. Wire here for an agent that operates strictly on a user-highlighted snippet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "pdf_text",
    sortOrder: 230,
  },
  {
    name: "active_scope_text",
    label: "Selected scope content",
    description:
      "Runtime mirror of the scope picker — whichever of full document / current page / page range / selected text the user picked at the moment they clicked Run. Wire here for an agent that should follow the user's choice rather than being locked to one specific scope.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    group: "pdf_text",
    sortOrder: 240,
  },

  // ── Document metadata (300-349) ──────────────────────────────────────
  {
    name: "filename",
    label: "Document filename",
    description:
      'Display name of the open PDF (e.g. "medical-record-2024.pdf"). Always populated.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    group: "pdf_document",
    sortOrder: 300,
  },
  {
    name: "file_id",
    label: "File ID",
    description:
      "UUID of the source `cld_files` row. Stable for the lifetime of the document. Useful for tool calls that need to load related metadata or kick off downstream jobs.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "pdf_document",
    sortOrder: 310,
  },
  {
    name: "processed_document_id",
    label: "Processed document ID",
    description:
      "UUID of the `processed_documents` row backing the loaded PDF (per-page text, OCR, cleaned text). Empty when the source file has no processed-document derivative yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "pdf_document",
    sortOrder: 320,
  },
  {
    name: "total_pages",
    label: "Total pages",
    description:
      "Total page count of the loaded PDF. Always populated when the surface emits.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "pdf_document",
    sortOrder: 330,
  },

  // ── Runtime / picker state (400-449) ─────────────────────────────────
  {
    name: "current_page",
    label: "Current page number",
    description:
      "1-indexed page number the user is currently viewing in the PDF pane. Always populated; never zero.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "pdf_reader",
    sortOrder: 400,
  },
  {
    name: "page_numbers",
    label: "Page numbers in active scope",
    description:
      'Human-formatted page range covered by the scope the user picked at run time (e.g. "12-15" for page-range scope, "5" for current-page scope, "1-100" for full-doc scope). Empty when scope is "selection" (browser highlight has no page anchor).',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    group: "pdf_reader",
    sortOrder: 410,
  },
  {
    name: "scope_kind",
    label: "Scope kind",
    description:
      'Which scope the user picked at run time: "full" / "current" / "range" / "selection". Lets an agent reason about what `active_scope_text` actually represents on this run.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    group: "pdf_reader",
    sortOrder: 420,
  },
  {
    name: "using_clean_text",
    label: "Using AI-cleaned text",
    description:
      "True when the surface sourced text from AI-cleaned per-page output; false when only raw OCR was available. Lets an agent decide whether to defensively re-clean or trust the input.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "pdf_reader",
    sortOrder: 430,
  },
  {
    name: "raw_document_text",
    label: "Raw document text",
    description:
      "The document's raw (pre-AI-cleanup) extracted body. Empty when the document only ever had cleaned text. Large — bindable but kept out of automatic context; prefer `full_document_text` unless you specifically need OCR-faithful characters.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 14000,
    autoContext: false,
    group: "pdf_text",
    sortOrder: 250,
  },
  {
    name: "page_texts",
    label: "Per-page text rows",
    description:
      "Every loaded page as `{ page_number, text, cleaned }`, in page order. Empty array when page rows have not loaded. Large — bindable only; use `current_page_text` / `full_document_text` for normal runs.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 14000,
    autoContext: false,
    group: "pdf_text",
    sortOrder: 260,
  },

  // ── Natural composites (COMPLETENESS LAW) ────────────────────────────
  {
    name: "document_summary",
    label: "Document summary",
    description:
      "Composite identity object for the open document: `{ filename, file_id, processed_document_id, total_pages, using_clean_text }`. One binding for everything an agent needs to name and re-fetch this document. Always populated when the surface emits (fields may be empty when no document is open).",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 220,
    group: "pdf_document",
    sortOrder: 340,
  },
  {
    name: "active_scope",
    label: "Active scope summary",
    description:
      "Composite of what the user is about to run on: `{ kind, page_numbers, char_count }`. Pairs with `active_scope_text` so an agent can reason about the scope without re-deriving it. Always populated when the surface emits.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 90,
    group: "pdf_reader",
    sortOrder: 440,
  },

  // ── Reader / workspace view state (450-499) ──────────────────────────
  {
    name: "visible_panes",
    label: "Visible reader panes",
    description:
      'Which reader panes the user has open, e.g. `["pdf","clean","extractions"]`. Empty array when no document is open. Lets an agent know whether the user is looking at the PDF, the cleaned text, or extraction output.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "pdf_reader",
    sortOrder: 450,
  },
  {
    name: "sidebar_view",
    label: "Sidebar view",
    description:
      'Which sidebar list the user has selected in the studio (e.g. "documents", "pages"). Empty when unknown or on surfaces without a sidebar.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "pdf_reader",
    sortOrder: 460,
  },
  {
    name: "find_query",
    label: "In-document search query",
    description:
      "Text currently typed into the studio's in-document find field. Empty when the user is not searching. Strong signal of what the user is actually hunting for.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "pdf_reader",
    sortOrder: 470,
  },

  // ── Open library (500-549) ───────────────────────────────────────────
  {
    name: "library_document_count",
    label: "Documents in library",
    description:
      "How many processed documents are listed in the studio sidebar for this user. Zero when the list is empty or still loading.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "pdf_library",
    sortOrder: 500,
  },
  {
    name: "library_document_names",
    label: "Library document names",
    description:
      "Display names of the documents in the studio sidebar, in list order. Empty array when nothing has loaded. Bindable only — noisy for automatic context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    autoContext: false,
    group: "pdf_library",
    sortOrder: 510,
  },

  // ── Pipeline state (600-649) ─────────────────────────────────────────
  {
    name: "pipeline_running",
    label: "Pipeline running",
    description:
      "True while an extraction / AI-clean / chunk-extraction job is in flight for the open document. False when the studio is idle.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "pdf_pipeline",
    sortOrder: 600,
  },
  {
    name: "pipeline_status",
    label: "Pipeline status",
    description:
      'Human-readable status of the active document\'s post-extraction pipeline (e.g. "cleaning", "embedding", "completed"). Empty when nothing is running and no status has been reported.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "pdf_pipeline",
    sortOrder: 610,
  },
];

export const pdfExtractorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/pdf-extractor",
  readiness: "verified",
  label: "PDF Extractor",
  urlPattern: "/tools/pdf-extractor/[documentId]",
  intro: `<surface_intro>
The PDF Extractor studio is where a user reads and works a single processed PDF:
the source PDF pane, the raw OCR text, the AI-cleaned text, and extraction output,
side by side, with a sidebar of their other processed documents.

Read the values in this order: \`document_summary\` says WHICH document is open,
\`active_scope\` + \`scope_kind\` say WHAT the user pointed the agent at, and
\`active_scope_text\` is that content. \`full_document_text\` and
\`current_page_text\` are always available regardless of the user's pick, so an
agent can be locked to one of them. \`using_clean_text\` tells you whether the text
you got is AI-cleaned or raw OCR — expect OCR artifacts when it is false.
Reader state (\`current_page\`, \`visible_panes\`, \`find_query\`) tells you what the
user is actually looking at right now.
</surface_intro>`,
  groups,
  evidenceSources: [
    {
      kind: "processed_document",
      idValue: "processed_document_id",
      fileIdValue: "file_id",
      labelValue: "filename",
    },
  ],
  values: mergeBaselineValues(
    // Registry also injects the full baseline set. These overrides win so
    // the bind UI doesn't lead with generic editor labels ("Current
    // selection", "Text before selection") that don't match this surface.
    // Real PDF values stay at sort 200–430; legacy aliases sink to 9xxx.
    pickBaseline(
      "selection",
      "content",
      "text_before",
      "text_after",
      "context",
    ),
    [
      ...surfaceSpecific,
      {
        name: "selection",
        label: "Active scope (legacy alias)",
        description:
          "Legacy alias of `active_scope_text` — same value the scope picker chose at Run. Prefer `active_scope_text` for new agents.",
        valueType: "string",
        alwaysAvailable: true,
        typicalCharCount: 4000,
        autoContext: false,
        group: "pdf_legacy",
        sortOrder: 9100,
      },
      {
        name: "content",
        label: "Full document (legacy alias)",
        description:
          "Legacy alias of `full_document_text`. Prefer `full_document_text` for new agents.",
        valueType: "string",
        alwaysAvailable: true,
        typicalCharCount: 12000,
        autoContext: false,
        group: "pdf_legacy",
        sortOrder: 9110,
      },
      {
        name: "text_before",
        label: "Text before (unused here)",
        description:
          "Baseline editor value — not populated on PDF Extractor (no in-region caret). Kept so generic agents that map to it still resolve to empty rather than fail.",
        valueType: "string",
        alwaysAvailable: false,
        typicalCharCount: 0,
        autoContext: false,
        group: "pdf_legacy",
        sortOrder: 9200,
      },
      {
        name: "text_after",
        label: "Text after (unused here)",
        description:
          "Baseline editor value — not populated on PDF Extractor. Kept for generic-agent compatibility; resolves empty.",
        valueType: "string",
        alwaysAvailable: false,
        typicalCharCount: 0,
        autoContext: false,
        group: "pdf_legacy",
        sortOrder: 9210,
      },
      {
        name: "context",
        label: "Free-form context",
        description: "Loose escape hatch. Prefer the named PDF values above.",
        valueType: "object",
        alwaysAvailable: false,
        typicalCharCount: 1000,
        autoContext: false,
        group: "pdf_legacy",
        sortOrder: 9999,
      },
    ],
  ),
};

/** The four scopes the extractor's picker can point an agent at. */
export type PdfExtractorScopeKind = "full" | "current" | "range" | "selection";

/**
 * Type-safe payload helper. The PDF Extractor surface code calls this
 * when assembling its `ApplicationScope` so TypeScript catches missing
 * required keys and unknown keys at the callsite.
 *
 * Required keys (no `?`) mirror every value declared `alwaysAvailable: true`
 * in the manifest above; optional keys (`?`) mirror `alwaysAvailable: false`.
 *
 * Note: `selection` and `content` are baseline aliases — the runtime
 * caller should populate them by duplicating `active_scope_text` and
 * `full_document_text` so existing agents wired to the baseline keys
 * keep working.
 */
export function createPdfExtractorScope(values: {
  // alwaysAvailable: true → required
  full_document_text: string;
  current_page_text: string;
  active_scope_text: string;
  filename: string;
  file_id: string;
  total_pages: number;
  current_page: number;
  scope_kind: PdfExtractorScopeKind;
  using_clean_text: boolean;
  document_summary: {
    filename: string;
    file_id: string;
    processed_document_id: string;
    total_pages: number;
    using_clean_text: boolean;
  };
  active_scope: {
    kind: "full" | "current" | "range" | "selection";
    page_numbers: string;
    char_count: number;
  };
  selection: string;
  content: string;
  // alwaysAvailable: false → optional
  page_range_text?: string;
  selected_text?: string;
  processed_document_id?: string;
  page_numbers?: string;
  raw_document_text?: string;
  page_texts?: Array<{
    page_number: number;
    text: string;
    cleaned: boolean;
  }>;
  visible_panes?: string[];
  sidebar_view?: string;
  find_query?: string;
  library_document_count?: number;
  library_document_names?: string[];
  pipeline_running?: boolean;
  pipeline_status?: string;
  text_before?: string;
  text_after?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
