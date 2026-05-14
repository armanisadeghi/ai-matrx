/**
 * Surface manifest — Content Extractor (`matrx-user/content-extractor`).
 *
 * The Content Extractor (a.k.a. page-extraction) surface runs an agent
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
 * **Superset of `matrx-user/pdf-widgets`.** Everything the widgets
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
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/tool-registry/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import { getPdfWidgetsSurfaceSpecificValues } from "./pdf-widgets.manifest";

/**
 * Chunk-only values the Content Extractor adds on top of the widget
 * surface. These all describe per-chunk state — they are what makes
 * this surface a chunked-run surface rather than a one-shot one.
 *
 * Note: `filename`, `file_id`, `processed_document_id`, `current_page`,
 * `total_pages`, `page_numbers`, `scope_kind`, `using_clean_text`,
 * `full_document_text`, `current_page_text`, `page_range_text`,
 * `selected_text`, `active_scope_text` are inherited from `pdf-widgets`
 * via `getPdfWidgetsSurfaceSpecificValues()` — do not redeclare here.
 *
 * Sort orders 50-99 — these sit BELOW the baseline `selection` (100)
 * and inherited widget values (200+) so the binding editor surfaces
 * "Dynamic chunks" first. Per-chunk text inputs are the primary input
 * on this surface; everything inherited is secondary.
 */
const surfaceSpecific: SurfaceValue[] = [
  {
    name: "clean_text",
    label: "Chunk text (cleaned)",
    description:
      "THE content of the current chunk — per-page AI-cleaned text for every page in the chunk, joined with `--- Page N ---` markers. This is the primary input most agents will want. Populated only when the Job's source_variations includes `clean_text`. Empty otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
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
    sortOrder: 60,
  },
  {
    name: "pdf_page",
    label: "Chunk pages (PDF)",
    description:
      "THE content of the current chunk as PDF page attachments for visual / multi-modal agents (layout-faithful, includes images and tables). Populated only when the Job's source_variations includes `pdf_page`. Empty otherwise. (Phase 3 — wiring TBD.)",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 0,
    sortOrder: 70,
  },
  {
    name: "chunk_index",
    label: "Chunk index",
    description:
      "0-based index of the current chunk within this run. Useful when an agent needs ordering context across the run.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 80,
  },
  {
    name: "chunk_count",
    label: "Total chunks",
    description:
      "Total number of chunks this run will produce. Same value for every chunk in a run.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 90,
  },
  {
    name: "job_id",
    label: "Extraction job ID",
    description:
      "UUID of the `page_extraction_jobs` row driving this run. Stable across all chunks of all runs of this template.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 95,
  },
  {
    name: "run_id",
    label: "Extraction run ID",
    description:
      "UUID of the `page_extraction_runs` row for the in-flight run. Changes every time the user clicks Run.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
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
      "1-indexed page number of the first page in the current chunk. Useful for ordering or sub-page anchoring. Always populated when running a Job.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
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
    sortOrder: 410,
  },
];

export const contentExtractorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/content-extractor",
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
    // Inherited widget values FIRST, then chunk-specific entries. The
    // merge step is last-write-wins by `name`, so any entry in
    // `surfaceSpecific` that re-declares an inherited name (e.g.
    // `page_numbers`, `current_page` whose semantics differ in
    // chunked context) overrides the widget version.
    [...getPdfWidgetsSurfaceSpecificValues(), ...surfaceSpecific],
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
export function createContentExtractorScope(values: {
  // alwaysAvailable: true → required (chunk-specific)
  chunk_index: number;
  chunk_count: number;
  job_id: string;
  run_id: string;
  // alwaysAvailable: true → required (inherited from pdf-widgets)
  full_document_text: string;
  current_page_text: string;
  active_scope_text: string;
  filename: string;
  file_id: string;
  total_pages: number;
  current_page: number;
  scope_kind: "full" | "current" | "range" | "selection";
  using_clean_text: boolean;
  // alwaysAvailable: false → optional (chunk-specific)
  clean_text?: string;
  raw_text?: string;
  pdf_page?: Record<string, unknown>;
  // alwaysAvailable: false → optional (inherited from pdf-widgets)
  page_range_text?: string;
  selected_text?: string;
  processed_document_id?: string;
  page_numbers?: string;
  // baseline back-compat aliases (selection ≈ active_scope_text, content ≈ full_document_text)
  selection?: string;
  content?: string;
  text_before?: string;
  text_after?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
