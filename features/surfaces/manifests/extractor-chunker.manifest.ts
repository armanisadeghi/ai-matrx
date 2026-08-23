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
 * plus baselines) is inherited verbatim — this file declares NONE of
 * them. On top of that we add the chunk-only values (`clean_text`,
 * `raw_text`, `pdf_page`, `chunk_index`, `chunk_count`, `job_id`,
 * `run_id`, `chunk_first_page`, `job_name`). The mapping editor
 * surfaces "Dynamic chunks" first because those are the primary input
 * — but never withholds the inherited values. If we have it, the user
 * can wire it.
 *
 * ── THE FAMILY DOCTRINE, APPLIED (2026-08-22) ────────────────────────
 * This file used to re-declare ten inherited names to (a) downgrade the
 * reader's `alwaysAvailable` guarantees and (b) correct two descriptions.
 * Both are SHADOWS: one concept, two declarations, and a binding lands on
 * whichever copy its author happened to see. All ten are gone.
 *   • The seven availability-only restatements (`full_document_text`,
 *     `current_page_text`, `active_scope_text`, `file_id`, `total_pages`,
 *     `scope_kind`, `using_clean_text`) plus `page_numbers` are carried by
 *     inheritance. The blanket fact they each restated — the parent's
 *     values describe the INTERACTIVE READER and are not sent per chunk —
 *     is stated once, model-facing, in `intro` below.
 *   • The two genuine semantic differences got their OWN names:
 *     `current_page` (reader position) → `chunk_first_page` (chunk
 *     position), and the Job's label → `job_name`.
 * `job_name` is declared but NOT YET EMITTED: aidream's chunk builder
 * still sends the Job's name under the inherited `filename` key, and nine
 * live Jobs map `filename` today (`docproc.page_extraction_jobs
 * .variable_mapping`). Renaming the wire key is an aidream change — until
 * it lands, `filename` is the key to map and `job_name` is the declared
 * destination. Note that `variable_mapping` is a consumer ledger
 * `pnpm check:surface-impact` cannot see: it reads bindings, shortcuts,
 * write twins and DOM attributes, NOT this table. Query it before you
 * rename anything on this surface.
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

  // ── Concepts this surface OWNS that the parent has no name for ───────
  // THE FAMILY DOCTRINE: a child never re-declares a name its parent
  // conveys. Where the chunked run means something genuinely DIFFERENT
  // from the reader, the concept gets its OWN name here rather than a
  // shadow of the parent's.
  {
    name: "chunk_first_page",
    label: "First page of current chunk",
    description:
      "1-indexed page number of the FIRST page in the current chunk. This is the chunk's own position, not the reader's `current_page` (there is no reader in a chunked run). NOT YET EMITTED by the server chunk builder (only the formatted `page_numbers` range is) — resolves empty until that lands.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "chunk_position",
    sortOrder: 85,
  },
  {
    name: "job_name",
    label: "Job name",
    description:
      "Name of the `page_extraction_jobs` row driving this run — the template's label, NOT the source document's filename. NOT YET EMITTED under this key: the server chunk builder currently sends the Job's name under the inherited `filename` key (aidream `execute_page_chunk` passes `job[\"name\"]`), so map `filename` today and expect it to carry the Job name. Repoint to `job_name` once aidream emits it.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "chunk_run",
    sortOrder: 92,
  },
];

export const extractorChunkerManifest: SurfaceManifest = {
  surfaceName: "matrx-user/extractor-chunker",
  readiness: "partial",
  readinessNote:
    "Groups + completeness audited against the server chunk builder; shadows of the parent's vocabulary removed 2026-08-22. Still partial because the RUNTIME EMITTER is server-side (aidream `_build_surface_vars`) and emits only `page_numbers`, `filename` (carrying the JOB name), the requested source variations, and the `selection`/`content` aliases — `chunk_index`, `chunk_count`, `job_id`, `run_id`, `chunk_first_page` and `job_name` are declared here (they are real concepts this surface owns and the FE type contract exports) but resolve empty until that builder is extended. Promote to verified in the same change that lands them.",
  inheritsFrom: "matrx-user/pdf-extractor",
  label: "Extractor Chunker",
  // Where a user CONFIGURES a Job — NOT a route that resolves to this surface.
  // `route-to-surface.ts` maps `/tools/pdf-extractor` to the PARENT on purpose
  // (see the manifest header); this surface has no client mount anywhere. Do
  // not add a mapping or mount a provider for it.
  urlPattern: "/tools/pdf-extractor/[documentId]",
  intro: `<surface_intro>
The Extractor Chunker runs ONE agent across a document chunk-by-chunk and persists
every structured response anchored to the pages it came from. A Job declares the
agent, the page scope, chunk size and overlap, which source variations to send
(AI-cleaned text, raw OCR, a native PDF of the chunk), and a variable mapping from
these surface values to the agent's own variable names.

You are seeing ONE chunk, not the document. \`clean_text\` / \`raw_text\` are the
chunk's content and \`page_numbers\` is the page span it covers — those two are the
primary input. \`page_numbers\` is always populated while a Job is running (it is
optional on the parent reader surface, where a scope picker may leave it empty).
\`pdf_page\` is a native PDF attachment of exactly those pages, activated by mapping
it to a Document-typed agent variable.

EVERY OTHER VALUE ON THIS SURFACE IS INHERITED FROM THE PDF EXTRACTOR AND DESCRIBES
THE INTERACTIVE READER, NOT A CHUNKED RUN — \`full_document_text\`,
\`current_page_text\`, \`active_scope_text\`, \`file_id\`, \`total_pages\`,
\`current_page\`, \`scope_kind\`, \`using_clean_text\`, \`document_summary\`,
\`active_scope\` and the reader/library/pipeline/template values are NOT sent per
chunk and resolve empty here. There is no reader, no scope picker and no open
document in a chunked run. The one exception is \`filename\`, which the server fills
with the JOB's name (its template label), not the source document's filename — the
concept is declared here as \`job_name\`, which the server does not emit yet.
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
export function createExtractorChunkerScope(
  values: {
    // Guaranteed by the server chunk builder on every chunk → required.
    /** Page span of THIS chunk. Inherited (optional on the reader), always sent here. */
    page_numbers: string;
    /** Carries the JOB's name today — see `job_name`; NOT the document filename. */
    filename: string;
    /** Aliases the server chunk builder always fills from the primary variation. */
    selection: string;
    content: string;
    // This surface's own values → optional (declared, not all emitted yet).
    clean_text?: string;
    raw_text?: string;
    chunk_index?: number;
    chunk_count?: number;
    chunk_first_page?: number;
    job_id?: string;
    run_id?: string;
    job_name?: string;
    // `pdf_page` is a native attachment source, assembled server-side after the
    // chunk's page set is known. It is intentionally not an ApplicationScope
    // object or a string variable.
    // Inherited from `matrx-user/pdf-extractor` — every one of these describes
    // the interactive reader and is NEVER sent per chunk, so they stay optional
    // here even where the parent guarantees them. THE FAMILY DOCTRINE would
    // normally make an inherited `alwaysAvailable` key a REQUIRED param; that
    // rule assumes a client mount that can actually emit the parent's bag. This
    // surface has none (it is a server-side per-chunk catalog), so requiring
    // them would force every caller to fabricate values the runtime never sees
    // — a UI lying in the other direction. Whether this surface should inherit
    // `pdf-extractor` at ALL is the open question; see the manifest header.
    full_document_text?: string;
    current_page_text?: string;
    active_scope_text?: string;
    current_page?: number;
    file_id?: string;
    total_pages?: number;
    scope_kind?: "full" | "current" | "range" | "selection";
    using_clean_text?: boolean;
    page_range_text?: string;
    selected_text?: string;
    processed_document_id?: string;
    text_before?: string;
    text_after?: string;
    context?: Record<string, unknown>;
  },
  /**
   * Any inherited `matrx-user/pdf-extractor` payload the caller already has.
   * Spread FIRST in the body so this surface's own chunk keys always win on
   * collision (THE FAMILY DOCTRINE). Defaults to `{}` because the chunked run
   * assembles its bag server-side and has no parent scope to compose from.
   */
  inheritedBase: Partial<SurfaceScopePayload> = {},
): SurfaceScopePayload {
  return { ...inheritedBase, ...values } as SurfaceScopePayload;
}
