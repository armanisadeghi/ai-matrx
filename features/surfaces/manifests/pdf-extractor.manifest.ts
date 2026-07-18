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
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

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
    sortOrder: 430,
  },
];

export const pdfExtractorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/pdf-extractor",
  label: "PDF Extractor",
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
        sortOrder: 9210,
      },
      {
        name: "context",
        label: "Free-form context",
        description: "Loose escape hatch. Prefer the named PDF values above.",
        valueType: "object",
        alwaysAvailable: false,
        typicalCharCount: 1000,
        sortOrder: 9999,
      },
    ],
  ),
};

/** Convenience accessor — the chunked-run surface inherits these values verbatim. */
export function getPdfExtractorSurfaceSpecificValues(): readonly SurfaceValue[] {
  return surfaceSpecific;
}

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
  scope_kind: "full" | "current" | "range" | "selection";
  using_clean_text: boolean;
  // alwaysAvailable: false → optional
  page_range_text?: string;
  selected_text?: string;
  processed_document_id?: string;
  page_numbers?: string;
  selection?: string;
  content?: string;
  text_before?: string;
  text_after?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
