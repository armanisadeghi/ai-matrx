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
 * Each VALUE here corresponds to one item the surface emits per chunk.
 * Some are populated unconditionally (filename, page_numbers); others
 * only when the Job selected the matching `source_variations` entry
 * (clean_text, raw_text, pdf_page). The `alwaysAvailable` flag reflects
 * "guaranteed every launch" — not "always non-empty."
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

/**
 * Surface-specific values the Content Extractor emits per chunk. Order
 * here drives the dropdown order in binding UIs (sort_order).
 */
const surfaceSpecific: SurfaceValue[] = [
  {
    name: "filename",
    label: "Document filename",
    description:
      'Display name of the document being extracted (e.g. "medical-record-2024.pdf"). Populated for every chunk of every run.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 80,
    sortOrder: 300,
  },
  {
    name: "page_numbers",
    label: "Page range",
    description:
      'Human-formatted page range of the current chunk (e.g. "12-15", "3, 7, 9"). Populated for every chunk.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 16,
    sortOrder: 310,
  },
  {
    name: "clean_text",
    label: "Chunk text (cleaned)",
    description:
      "THE content of the current chunk — per-page AI-cleaned text for every page in the chunk, joined with `--- Page N ---` markers. This is the primary input most agents will want. Populated only when the Job's source_variations includes `clean_text`. Empty otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 320,
  },
  {
    name: "raw_text",
    label: "Chunk text (raw OCR)",
    description:
      "THE content of the current chunk as raw OCR (no AI cleanup). Use when you need character-faithful text including OCR artifacts. Populated only when the Job's source_variations includes `raw_text`. Empty otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    sortOrder: 330,
  },
  {
    name: "pdf_page",
    label: "Chunk pages (PDF)",
    description:
      "THE content of the current chunk as PDF page attachments for visual / multi-modal agents (layout-faithful, includes images and tables). Populated only when the Job's source_variations includes `pdf_page`. Empty otherwise. (Phase 3 — wiring TBD.)",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 0,
    sortOrder: 340,
  },
  {
    name: "chunk_index",
    label: "Chunk index",
    description:
      "0-based index of the current chunk within this run. Useful when an agent needs ordering context across the run.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 350,
  },
  {
    name: "chunk_count",
    label: "Total chunks",
    description:
      "Total number of chunks this run will produce. Same value for every chunk in a run.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 360,
  },
  {
    name: "file_id",
    label: "File ID",
    description:
      "UUID of the source `cld_files` row. Useful for tool calls that need to load related metadata.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 370,
  },
  {
    name: "processed_document_id",
    label: "Processed document ID",
    description:
      "UUID of the `processed_documents` row backing this extraction. Empty when the source file has no processed-document derivative.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 380,
  },
  {
    name: "job_id",
    label: "Extraction job ID",
    description:
      "UUID of the `page_extraction_jobs` row driving this run. Stable across all chunks of all runs of this template.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 390,
  },
  {
    name: "run_id",
    label: "Extraction run ID",
    description:
      "UUID of the `page_extraction_runs` row for the in-flight run. Changes every time the user clicks Run.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 400,
  },
];

export const contentExtractorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/content-extractor",
  values: mergeBaselineValues(
    // Baseline values kept for cross-surface consistency. They are NOT
    // the primary entry points for chunked-run agents — `clean_text` /
    // `raw_text` / `pdf_page` are. The mapping editor groups these
    // under a "Show more" footer so they don't crowd the primary view.
    //
    //   `selection` + `content` — back-compat aliases. The surface
    //     duplicates the primary chunk text into these so pre-Phase-2
    //     Jobs whose mappings target them keep working.
    //   `text_before` / `text_after` — baseline standards. This surface
    //     has no "selection within a region" concept, so they're never
    //     populated. Still declared for system consistency; advisory
    //     copy in the editor warns the user.
    //   `context` — escape hatch for free-form additions.
    pickBaseline(
      "selection",
      "content",
      "text_before",
      "text_after",
      "context",
    ),
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
export function createContentExtractorScope(values: {
  // alwaysAvailable: true → required
  filename: string;
  page_numbers: string;
  chunk_index: number;
  chunk_count: number;
  file_id: string;
  job_id: string;
  run_id: string;
  // alwaysAvailable: false → optional
  selection?: string;
  content?: string;
  text_before?: string;
  text_after?: string;
  context?: Record<string, unknown>;
  clean_text?: string;
  raw_text?: string;
  pdf_page?: Record<string, unknown>;
  processed_document_id?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
