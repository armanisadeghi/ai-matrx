/**
 * Surface manifest — Extractor Chunker (`matrx-user/extractor-chunker`).
 *
 * The Extractor Chunker (page-extraction Jobs) surface runs an agent
 * chunk-by-chunk across a document and persists each structured response
 * anchored to its source page(s). One Job declares: which agent to invoke,
 * the page scope, chunk size, source variations (cleaned text, raw OCR,
 * pdf attachment), and a `variable_mapping` that routes surface values to
 * the agent's named variables.
 *
 * This manifest is the catalog of values a Job can wire its agent's
 * variables to. The Python backend reads the per-Job `variable_mapping`
 * (`{ surface_value_name: agent_variable_name }`) and routes accordingly.
 *
 * **Superset of `matrx-user/pdf-extractor`.** Everything the parent
 * surface exposes (filename, file_id, processed_document_id,
 * current_page, total_pages, page_numbers, scope_kind, using_clean_text,
 * plus baselines) is inherited verbatim. On top of that we add the
 * chunk-only values (`clean_text`, `raw_text`, `pdf_page`,
 * `chunk_index`, `chunk_count`, `job_id`, `run_id`). The mapping
 * editor surfaces "Dynamic chunks" first because those are the
 * primary input — but never withholds the inherited values. If we
 * have it, the user can wire it.
 *
 * The Job's saved `variable_mapping` is the source of truth for which
 * surface keys flow into which agent variables at run time — this
 * manifest is the menu of *available* keys.
 *
 * ── NO `writeTargets` HERE, ON PURPOSE ───────────────────────────────
 * This surface has NO client mount. It is a SERVER-side per-chunk
 * vocabulary catalog that aidream's `_build_surface_vars` fills once per
 * chunk at run time; its only client consumer is `VariableMappingEditor`
 * calling `getManifest()` to populate dropdowns. There is no
 * `SurfaceRuntimeProvider` for `matrx-user/extractor-chunker` anywhere in
 * the app, so write targets declared here would be mirrored and then
 * never offered to a single agent — the `surface-write-targets` skill's
 * "no mounted runtime looks exactly like a broken target" trap.
 *
 * Nor can that be "fixed" by mounting a provider on the studio route, so
 * do not reach for that either. `getSurfaceRuntime()` resolves
 * deepest-first while `surfaceFromPathname()` maps `/tools/pdf-extractor`
 * to the PARENT, so a nested provider for this surface would become the
 * live runtime under a route that still names the parent. The Agents
 * panel's `hasLiveScope` check (`runtime.surfaceName === surfaceName`)
 * would then fail, and every agent run launched from the header would drop
 * the studio's live scope and fall back to "Running without live page
 * context" — trading a read-only surface's write targets for a REGRESSION
 * of the parent's working ones.
 *
 * The Job-builder FORM that campaign chips keep pointing at
 * (`ChunkingConfigForm`, the template editor at
 * `/tools/pdf-extractor/[documentId]`) renders inside `PdfStudioShell`'s
 * provider, so its write targets live on the PARENT surface,
 * `matrx-user/pdf-extractor`: `extraction_template_draft` (partial
 * `{template_name, page_range, chunk_size, chunk_overlap}`) and
 * `extraction_output_columns`. Same page, same URL, mounted surface.
 * See `pdf-extractor.manifest.ts` (`PDF_EXTRACTOR_WRITE_TARGETS` and the
 * doc comment above `writeTargets`) for the full judgment call, including
 * why `agent_id`, `variable_mapping`, `chunking_strategy` and Run are
 * deliberately NOT writable, and the surfaces FEATURE.md Change Log entry
 * of 2026-08-11.
 *
 * This surface has now been assigned three times. Check which surface is
 * MOUNTED before you check which surface is named.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/**
 * Chunk-only values the Content Extractor adds on top of the widget
 * surface. These all describe per-chunk state — they are what makes
 * this surface a chunked-run surface rather than a one-shot one.
 *
 * Note: `filename`, `file_id`, `processed_document_id`, `current_page`,
 * `total_pages`, `page_numbers`, `scope_kind`, `using_clean_text`,
 * `full_document_text`, `current_page_text`, `page_range_text`,
 * `selected_text`, `active_scope_text` are inherited from `pdf-extractor`
 * via `getPdfExtractorSurfaceSpecificValues()` — do not redeclare here.
 *
 * Sort orders 50-99 — these sit BELOW the baseline `selection` (100)
 * and inherited widget values (200+) so the binding editor surfaces
 * "Dynamic chunks" first. Per-chunk text inputs are the primary input
 * on this surface; everything inherited is secondary.
 */
/**
 * The chunker's own sections. Parent group keys (`pdf_document`, `pdf_text`,
 * …) are NOT declared here — inherited values auto-collapse into
 * `inherited:matrx-user/pdf-extractor`.
 */
const groups: SurfaceValueGroup[] = [
  { key: "chunk_input", label: "Chunk input", sortOrder: 100 },
  { key: "chunk_position", label: "Chunk position", sortOrder: 200 },
  { key: "chunk_run", label: "Job and run", sortOrder: 300 },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "clean_text",
    label: "Chunk text (cleaned)",
    description:
      "THE content of the current chunk — per-page AI-cleaned text for every page in the chunk, joined with `--- Page N ---` markers. This is the primary input most agents will want. Populated only when the Job's source_variations includes `clean_text`. Empty otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    group: "chunk_input",
    sortOrder: 50,
  },
  {
    name: "raw_text",
    label: "Chunk text (raw OCR)",
    description:
      "THE content of the current chunk as raw OCR (no AI cleanup). Use when you need character-faithful text including OCR artifacts. Populated only when the Job's source_variations includes `raw_text`. Empty otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    group: "chunk_input",
    sortOrder: 60,
  },
  {
    name: "pdf_page",
    label: "Chunk PDF document",
    description:
      "One native PDF document containing ONLY the current chunk's pages, in chunk order (including configured overlap). Map this attachment source to an agent variable whose input type is Document to activate it. It preserves layout, images, and tables without sending the rest of the source PDF.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 0,
    group: "chunk_input",
    sortOrder: 70,
  },
  {
    name: "chunk_index",
    label: "Chunk index",
    description:
      "0-based index of the current chunk within this run. NOT YET EMITTED — the server chunk builder (aidream `_build_surface_vars`) does not put it in the surface bag; see the manifest header. Resolves empty until that lands.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "chunk_position",
    sortOrder: 80,
  },
  {
    name: "chunk_count",
    label: "Total chunks",
    description:
      "Total number of chunks this run will produce; same value for every chunk. NOT YET EMITTED by the server chunk builder — resolves empty until that lands.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "chunk_position",
    sortOrder: 90,
  },
  {
    name: "job_id",
    label: "Extraction job ID",
    description:
      "UUID of the `page_extraction_jobs` row driving this run. Stable across all chunks of all runs of this template. NOT YET EMITTED by the server chunk builder — resolves empty until that lands.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "chunk_run",
    sortOrder: 95,
  },
  {
    name: "run_id",
    label: "Extraction run ID",
    description:
      "UUID of the `page_extraction_runs` row for the in-flight run. Changes every time the user clicks Run. NOT YET EMITTED by the server chunk builder — resolves empty until that lands.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "chunk_run",
    sortOrder: 99,
  },

  // Overrides of inherited widget values whose semantic shifts in
  // chunked context. Only label + description change; sortOrder
  // stays at the inherited position. Listed LAST so the merge step
  // (last-write wins) picks these over the inherited entries.
  {
    name: "current_page",
    label: "First page of current chunk",
    description:
      "1-indexed page number of the first page in the current chunk. NOT YET EMITTED by the server chunk builder (only the formatted `page_numbers` range is) — resolves empty until that lands.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "chunk_position",
    sortOrder: 400,
  },
  {
    name: "page_numbers",
    label: "Chunk page range",
    description:
      'Human-formatted page range covered by the CURRENT CHUNK (e.g. "12-15"). Each chunk gets its own value. Always populated when running a Job; empty in design-time preview.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 16,
    group: "chunk_position",
    sortOrder: 410,
  },
  {
    name: "filename",
    label: "Job name (sent as filename)",
    description:
      "The server chunk builder sends the JOB's name here, not the source document's filename (aidream `execute_page_chunk` passes `job[\"name\"]`). Always populated during a run. Do not treat it as a document filename — it is the template's label.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 60,
    group: "chunk_run",
    sortOrder: 300,
  },

  // ── Inherited keys the chunked run never emits ───────────────────────
  // The parent guarantees these on the interactive extractor surface. The
  // chunked run assembles its own small bag server-side and includes none
  // of them, so re-declaring them `alwaysAvailable: false` stops the scope
  // helper from promising a guarantee this surface cannot keep.
  {
    name: "full_document_text",
    label: "Full document text (not sent per chunk)",
    description:
      "Inherited from PDF Extractor. A chunked run deliberately sends only the current chunk (that is the whole point) — this is never populated here. Use `clean_text` / `raw_text`.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 0,
    autoContext: false,
    group: "chunk_input",
    sortOrder: 700,
  },
  {
    name: "current_page_text",
    label: "Current page text (not sent per chunk)",
    description:
      "Inherited from PDF Extractor. Not populated in a chunked run — the chunk's text arrives as `clean_text` / `raw_text`.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 0,
    autoContext: false,
    group: "chunk_input",
    sortOrder: 710,
  },
  {
    name: "active_scope_text",
    label: "Selected scope content (not sent per chunk)",
    description:
      "Inherited from PDF Extractor's scope picker, which does not exist in a chunked run — never populated here.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 0,
    autoContext: false,
    group: "chunk_input",
    sortOrder: 720,
  },
  {
    name: "file_id",
    label: "File ID (not sent per chunk)",
    description:
      "Inherited from PDF Extractor. The Job row knows its `file_id`, but the server chunk builder does not put it in the surface bag — not populated here today.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "chunk_run",
    sortOrder: 730,
  },
  {
    name: "total_pages",
    label: "Total pages (not sent per chunk)",
    description:
      "Inherited from PDF Extractor. Not emitted by the server chunk builder — use `page_numbers` for the chunk's own span.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    autoContext: false,
    group: "chunk_position",
    sortOrder: 740,
  },
  {
    name: "scope_kind",
    label: "Scope kind (not applicable here)",
    description:
      "Inherited from PDF Extractor. A chunked run has no scope picker — never populated here.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 0,
    autoContext: false,
    group: "chunk_position",
    sortOrder: 750,
  },
  {
    name: "using_clean_text",
    label: "Using AI-cleaned text (implied by the Job)",
    description:
      "Inherited from PDF Extractor. Not emitted per chunk — the Job's `source_variations` decides whether you get `clean_text`, `raw_text`, or both, and receiving one tells you which.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    autoContext: false,
    group: "chunk_input",
    sortOrder: 760,
  },
];

export const extractorChunkerManifest: SurfaceManifest = {
  surfaceName: "matrx-user/extractor-chunker",
  readiness: "partial",
  readinessNote:
    "Groups + completeness audited against the server chunk builder. Still partial because the RUNTIME EMITTER is server-side (aidream `_build_surface_vars`) and emits only `page_numbers`, `filename` (the JOB name), the requested source variations, and the `selection`/`content` aliases — `chunk_index`, `chunk_count`, `job_id`, `run_id`, `current_page`, `file_id` are declared here (they are real concepts this surface owns and the FE type contract exports) but resolve empty until that builder is extended. Promote to verified in the same change that lands them.",
  inheritsFrom: "matrx-user/pdf-extractor",
  label: "Extractor Chunker",
  urlPattern: "/tools/pdf-extractor/[documentId]",
  intro: `<surface_intro>
The Extractor Chunker runs ONE agent across a document chunk-by-chunk and persists
every structured response anchored to the pages it came from. A Job declares the
agent, the page scope, chunk size and overlap, which source variations to send
(AI-cleaned text, raw OCR, a native PDF of the chunk), and a variable mapping from
these surface values to the agent's own variable names.

You are seeing ONE chunk, not the document. \`clean_text\` / \`raw_text\` are the
chunk's content and \`page_numbers\` is the page span it covers — those two are the
primary input. \`pdf_page\` is a native PDF attachment of exactly those pages,
activated by mapping it to a Document-typed agent variable. Everything inherited
from the PDF Extractor surface describes the interactive reader, not a chunked run,
and is not sent per chunk. Note that \`filename\` carries the JOB's name here, not
the source document's filename.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    // Baseline:
    //   `selection` + `content` — back-compat aliases. The runtime
    //     duplicates the primary chunk text into these so pre-Phase-2
    //     Jobs whose mappings target them keep working.
    //   `text_before` / `text_after` — unused on this surface (no
    //     "selection within a region" concept). Declared for
    //     cross-surface consistency.
    //   `context` — escape hatch for free-form additions.
    pickBaseline(
      "selection",
      "content",
      "text_before",
      "text_after",
      "context",
    ),
    // Only OWN values here. The parent's vocabulary arrives through
    // `inheritsFrom` and auto-collapses into the synthesized
    // `inherited:matrx-user/pdf-extractor` group — re-listing it would
    // drag the parent's group keys onto this surface, which children
    // must never declare. Own entries that re-declare an inherited name
    // (`page_numbers`, `current_page`, `filename`, …) still win.
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper. The page-extraction launching code calls this
 * when assembling its per-chunk `ApplicationScope` so TypeScript catches
 * missing required keys and unknown keys at the callsite.
 *
 * Required keys (no `?`) mirror every value declared `alwaysAvailable: true`
 * in the manifest above. Optional keys (`?`) mirror `alwaysAvailable: false`.
 *
 * NOTE: extraction Runs currently flow through the Python streaming
 * endpoint (`POST /page-extraction/runs/stream`) rather than the
 * standard `launchAgentExecution` thunk, so this helper is primarily a
 * documentation + type-safety contract today. When the run path gets
 * unified, the same payload will be handed to the launch thunk via
 * `runtime.applicationScope` + `runtime.surfaceName`.
 */
export function createExtractorChunkerScope(values: {
  // alwaysAvailable: true → required
  page_numbers: string;
  /** The JOB's name — see the value's description; NOT the document filename. */
  filename: string;
  /** Aliases the server chunk builder always fills from the primary variation. */
  selection: string;
  content: string;
  // alwaysAvailable: false → optional (chunk-specific)
  clean_text?: string;
  raw_text?: string;
  chunk_index?: number;
  chunk_count?: number;
  job_id?: string;
  run_id?: string;
  current_page?: number;
  // alwaysAvailable: false → optional (inherited, never sent per chunk)
  full_document_text?: string;
  current_page_text?: string;
  active_scope_text?: string;
  file_id?: string;
  total_pages?: number;
  scope_kind?: "full" | "current" | "range" | "selection";
  using_clean_text?: boolean;
  // `pdf_page` is a native attachment source, assembled server-side after the
  // chunk's page set is known. It is intentionally not an ApplicationScope
  // object or a string variable.
  page_range_text?: string;
  selected_text?: string;
  processed_document_id?: string;
  text_before?: string;
  text_after?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
