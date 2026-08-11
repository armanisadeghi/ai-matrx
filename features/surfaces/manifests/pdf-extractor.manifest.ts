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
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  MAX_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
} from "@/features/page-extraction/constants";
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
  {
    key: "pdf_extraction_template",
    label: "Extraction template",
    sortOrder: 550,
    description:
      "The Content-extractor template the user is composing in the right inspector — its name, page scope, chunk geometry and output columns, plus whether the editor is even open.",
  },
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

  // ── Extraction template being composed (700-749) ─────────────────────
  //
  // READ TWINS of this surface's write targets. Added in the same change
  // that made the Content-extractor template agent-writable: a write
  // target whose value an agent cannot read back has no evidence loop, so
  // the agent can neither check what it just staged nor extend rather than
  // replace. (`marketing-site-media` set the precedent of closing a
  // manifest's own readiness gap while landing its write half.)
  //
  // Inherited by `matrx-user/extractor-chunker` / `analysis-studio` /
  // `scanner` per this manifest's stated contract ("the manifest only
  // declares this is wireable"). Only the studio route POPULATES them —
  // the chunked run's server-side bag does not, which is exactly the
  // parent/child split those manifests already document.
  {
    name: "extraction_template_editor",
    label: "Template editor state",
    description:
      "Whether the Content extractors panel is showing the template EDITOR right now, and what it is pointed at: `{ editing, selected_template_id, run_in_flight }`. `editing` false means the panel is showing the saved-template list or the read-only view — the editor inputs are not on screen, and every extraction-template write target refuses in that state. `run_in_flight` true means a chunked extraction is running on this document. Read this BEFORE attempting any extraction-template write.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 120,
    group: "pdf_extraction_template",
    sortOrder: 700,
  },
  {
    name: "extraction_template_draft",
    label: "Extraction template draft",
    description:
      "The in-progress template config the user is composing: `{ template_name, page_range, page_count, chunk_size, chunk_overlap, chunking_strategy, kind, agent_id }`. `page_range` is the verbatim text of the Pages input (e.g. \"1-50, 80-90\"); `page_count` is how many of those pages actually exist in this document. `chunk_size` is null until the user sets it. This is the read twin of the `extraction_template_draft` write target — read it first if you mean to extend the user's config rather than replace parts of it.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 220,
    group: "pdf_extraction_template",
    sortOrder: 710,
  },
  {
    name: "extraction_output_columns",
    label: "Output table columns",
    description:
      "The template's declared Results columns, in order: an array of `{ key, label, type, description?, source }`. Empty array when the template inherits the agent's own output schema instead (the default) or is in text mode. Read twin of the `extraction_output_columns` write target — this is the DEFINITION of the table, never the extracted rows.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 400,
    autoContext: false,
    group: "pdf_extraction_template",
    sortOrder: 720,
  },
];

/**
 * Names of the write targets below, exported so the two handler seams
 * (`PdfStudioShell`'s base refusal set and `ChunkingConfigForm`'s live
 * implementation) can never drift from the manifest by re-typing a string.
 */
export const PDF_EXTRACTOR_WRITE_TARGETS = {
  templateDraft: "extraction_template_draft",
  outputColumns: "extraction_output_columns",
} as const;

/**
 * Write half of the 360 loop — what an agent may put into the Content
 * extractors panel on the right of the PDF studio.
 *
 * WHY THIS SURFACE AND NOT `matrx-user/extractor-chunker`. The campaign
 * assignment named the chunker surface, and on inspection that surface has
 * NO client mount anywhere in the app: `matrx-user/extractor-chunker` is a
 * server-side per-chunk vocabulary catalog (aidream `_build_surface_vars`
 * fills it once per chunk at run time), consumed on the client only by
 * `VariableMappingEditor` calling `getManifest()` to populate dropdowns.
 * `writeTargets` on it would be declared and never offered — the exact
 * "no mounted runtime looks identical to a broken target" trap in the
 * `surface-write-targets` skill. The FORM the assignment actually pointed
 * at (`ChunkingConfigForm`, the template editor at
 * `/tools/pdf-extractor/<documentId>`) lives inside THIS surface's
 * provider (`PdfStudioShell`), so the targets belong here. Same page, same
 * URL, correct surface name.
 *
 * JUDGMENT BAR, applied honestly. A Content-extractor template is a real
 * authored artifact, not a settings screen: the user decides what to call
 * it, which pages of a 400-page document are worth spending an agent on,
 * how many pages the agent can hold at once, how much overlap it needs to
 * not lose a table across a page break, and — the biggest one — what
 * columns the extraction should produce. Every one of those is something
 * an agent that has just READ the document can propose better and faster
 * than a user scrolling for the appendix. Nothing here is identity,
 * ownership, or destructive.
 *
 * TWO targets, not six. `template_name` + `page_range` + `chunk_size` +
 * `chunk_overlap` are ONE act of composing a template, and the page itself
 * says so: "Apply Recommended" patches the range, the size and the overlap
 * in a single dispatch, and the name auto-seeds from the chosen agent.
 * Per the skill's trap ("multiple values in one field object beat five
 * micro-targets when they're edited together"), they are one object target
 * and therefore ONE confirm dialog. Every key is optional and partial, so
 * writing only `{chunk_overlap}` leaves the range the user typed alone.
 * `extraction_output_columns` is split out for the reason
 * `marketing-crawls` split its include/exclude patterns: it is a genuinely
 * separate decision, with its own editor (`SchemaEditor`), its own
 * downstream consumer (the durable Results table), and a shape a user may
 * well accept when they reject the chunk geometry, or the reverse.
 *
 * `mode: "draft"` in the strictest sense. Both handlers dispatch
 * `patchDraft({fileId, patch})` — the SAME Redux action the user's own
 * typing dispatches on every keystroke in that form. The staged value is
 * visible and editable the instant it lands, the Save/Update bar stays
 * exactly as it was, and Cancel restores the saved snapshot. No parallel
 * setter, no raw supabase.
 *
 * WHAT IS NOT WRITABLE, on purpose:
 *  - **Run.** `saveTemplateFromDraft` → `launch()` spends real model budget
 *    running an agent over every chunk of someone's document. The settled
 *    precedent (`podcast-studio`, `image-generate`, `marketing-crawls`) is
 *    that the human press is the gate, and it holds here more than
 *    anywhere: this is the most expensive button on the surface. An agent
 *    may compose the template; only the user commits it. Save is left to
 *    the user for the same reason in miniature — `mode: "draft"` means the
 *    user still presses Update.
 *  - **The extracted text and everything about a run.** `clean_text`,
 *    `raw_text`, `full_document_text`, `current_page_text`, `chunk_index`,
 *    `chunk_count`, `total_pages`, `job_id`, `run_id` are the RECORD of
 *    what the extractor actually produced. An agent writing them would be
 *    fabricating output (the `processed_data`/`ast` rule from
 *    `markdown-editor`). The way an agent moves those values is by
 *    changing the config and letting the pipeline re-run — that IS the
 *    evidence loop on this surface.
 *  - **Deleting run data.** `clearJobResults` permanently drops every chunk
 *    run and result row. Destructive stays human.
 *  - `agent_id` — which agent to run. The surface exposes no agent
 *    catalog, so an agent writing it would be guessing a UUID.
 *  - `variable_mapping` — genuinely valuable, and deliberately deferred:
 *    the keys on the right-hand side are the CHOSEN AGENT's variable names,
 *    which are not surface values here. A write target whose vocabulary the
 *    agent cannot read is a target it can only guess at.
 *  - `chunking_strategy` — "pages" is the only entry in
 *    `CHUNKING_STRATEGIES` that is not `comingSoon`, and the editor renders
 *    no picker for it. A target with one legal value and no UI is the
 *    "pure-mechanical toggle" the bar rejects.
 *  - `kind` (extraction vs validation) and `rag_boost` — mode switches and
 *    a tuning knob nobody would ask an agent to flip.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: PDF_EXTRACTOR_WRITE_TARGETS.templateDraft,
    label: "Extraction template draft",
    description:
      "Stages the Content-extractor template the user is composing in the right inspector. NOTHING runs and nothing is saved — the user still presses Update/Save, and then Run. " +
      "Value: an object with AT LEAST ONE of `{ template_name, page_range, chunk_size, chunk_overlap }`. Each key REPLACES that one field; omit a key to leave it exactly as the user left it (read `extraction_template_draft` first if you mean to extend rather than replace). " +
      "`template_name` — what this reusable template is called; a non-empty string. " +
      '`page_range` — which pages the extraction covers, as the page-range text the input accepts: comma-separated pages and hyphenated spans, e.g. "1-50, 80-90". Every page you name must exist in this document (see `total_pages`); naming a page outside it is an error, not a clamp. ' +
      `\`chunk_size\` — pages per agent call, a whole number from ${MIN_CHUNK_SIZE} to ${MAX_CHUNK_SIZE}. ` +
      "`chunk_overlap` — pages repeated between neighbouring chunks so a table or clause spanning a page break is not cut; a whole number from 0 to chunk_size - 1. " +
      "Refused unless the template EDITOR is open (`extraction_template_editor.editing` is true — the user clicked New or Edit), and refused while an extraction run is in flight on this document.",
    valueType: "object",
    updatesValue: "extraction_template_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "pdf_extraction_template",
    sortOrder: 710,
  },
  {
    name: PDF_EXTRACTOR_WRITE_TARGETS.outputColumns,
    label: "Output table columns",
    description:
      "Stages the Results table definition for the template being edited — the columns every chunk's answer is parsed into. NOTHING runs and nothing is saved; the user still presses Update/Save. " +
      "Value: an ARRAY of column objects, which REPLACES the whole column list (read `extraction_output_columns` first and include the columns you want to keep). Pass an empty array to clear the template schema, which makes the table inherit the agent's own output schema instead. " +
      "Each column is `{ key, label, type, description? }`. `key` — lower_snake_case, unique, and the field name the agent is expected to emit. `label` — the human column header. `type` — one of: string | number | integer | boolean. `description` — optional prose telling the extraction agent what belongs in this column; this is the field worth writing carefully. " +
      "Columns you add are recorded as agent-source columns. " +
      "Refused unless the template EDITOR is open (`extraction_template_editor.editing` is true), and refused while an extraction run is in flight on this document.",
    valueType: "array",
    updatesValue: "extraction_output_columns",
    mode: "draft",
    applyPolicy: "ask",
    group: "pdf_extraction_template",
    sortOrder: 720,
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

You can also WRITE here, through apply_surface_write, but only into the Content
extractors panel in the right inspector — the reusable extraction TEMPLATE the
user composes before running an agent chunk-by-chunk over this document.
\`extraction_template_draft\` stages its name, page range, chunk size and
overlap; \`extraction_output_columns\` stages the Results table definition. Both
only STAGE into the editor — the human still presses Update/Save, and then Run,
which is the button that actually spends model budget over the whole document.
Read \`extraction_template_editor\` FIRST: both targets are refused unless
\`editing\` is true (the user clicked New or Edit) and refused while
\`run_in_flight\` is true. Read \`extraction_template_draft\` /
\`extraction_output_columns\` before writing — the draft target replaces each key
you send, and the columns target replaces the WHOLE list. Nothing about a run is
writable: the extracted text, the chunk counts, the run ids and the results are
the record of what the extractor produced, and deleting run data stays the
user's call. The way you change those is by changing the template and letting
the user re-run it.
</surface_intro>`,
  groups,
  writeTargets,
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
  extraction_template_editor: {
    editing: boolean;
    selected_template_id: string | null;
    run_in_flight: boolean;
  };
  extraction_template_draft: {
    template_name: string;
    page_range: string;
    page_count: number;
    chunk_size: number | null;
    chunk_overlap: number;
    chunking_strategy: string;
    kind: string;
    agent_id: string | null;
  };
  extraction_output_columns: Array<{
    key: string;
    label: string;
    type: string;
    description?: string;
    source: string;
  }>;
  text_before?: string;
  text_after?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
