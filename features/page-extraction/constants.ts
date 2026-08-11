/**
 * features/page-extraction/constants.ts
 *
 * Pure constants. No side effects.
 */

import type {
  ChunkingStrategy,
  ColumnType,
  SourceVariationKind,
} from "@/features/page-extraction/types";

/**
 * Surface name for this feature in the Surface Values system. Matches the
 * `matrx-user/extractor-chunker` row in `ui.ui_surface` and the
 * `extractorChunkerManifest` in
 * `features/surfaces/manifests/extractor-chunker.manifest.ts`.
 *
 * Used by the variable-mapping editor to pull the canonical list of values
 * an agent can be wired to. Also handed to `launchAgentExecution` as
 * `runtime.surfaceName` so agent↔surface binding edges bindings can apply.
 */
export const EXTRACTOR_CHUNKER_SURFACE_NAME = "matrx-user/extractor-chunker";

/** Hard cap — above this we won't even let the user try.
 *  Above ~50 pages per call the medical/legal use case shows quality drops
 *  and per-page provenance starts dissolving. */
export const MAX_CHUNK_SIZE = 50;

/** Minimum non-zero chunk size. */
export const MIN_CHUNK_SIZE = 1;

/** Hard upper bound on concurrency from the UI (matches DB CHECK). */
export const MAX_CONCURRENT_CAP = 20;

/** Marker placed between pages inside a chunk's selection text. */
export const PAGE_MARKER = (pageNumber: number) => `--- Page ${pageNumber} ---`;

/** Realtime channel name per file. */
export const realtimeChannelName = (fileId: string) =>
  `page-extraction:${fileId}`;

// ─── Output columns (vocabulary) ──────────────────────────────────────────

/**
 * The column types a template's output table can declare — the RUNTIME
 * vocabulary behind the `ColumnType` union. The `SchemaEditor` dropdown and
 * the surface write handler that lets an agent stage output columns both read
 * this, so neither can drift from the type by re-typing literals.
 */
export const COLUMN_TYPES: ColumnType[] = [
  "string",
  "number",
  "integer",
  "boolean",
];

// ─── Source variations (UI registry) ──────────────────────────────────────

export interface SourceVariationDef {
  kind: SourceVariationKind;
  label: string;
  description: string;
  /** True if the variation requires per-page text fetched from
   *  `processed_document_pages`. */
  isTextual: boolean;
  /** True when the variation isn't fully wired yet — UI shows a "preview"
   *  affordance but disables it. */
  comingSoon?: boolean;
}

export const SOURCE_VARIATIONS: SourceVariationDef[] = [
  {
    kind: "clean_text",
    label: "Cleaned text",
    description: "Per-page AI-cleaned text (System B output).",
    isTextual: true,
  },
  {
    kind: "raw_text",
    label: "Raw text",
    description: "Per-page raw OCR text (System A output).",
    isTextual: true,
  },
  {
    kind: "pdf_page",
    label: "PDF page (attachment)",
    description:
      "Attach the actual PDF of each page so the agent reads it natively — captures layout, signatures, stamps, and scanned content text can't. Requires a PDF-capable model (Gemini, Claude, GPT).",
    isTextual: false,
  },
];

export const SOURCE_VARIATION_BY_KIND = new Map<
  SourceVariationKind,
  SourceVariationDef
>(SOURCE_VARIATIONS.map((v) => [v.kind, v]));

// ─── Chunking strategies (UI registry) ────────────────────────────────────

export interface ChunkingStrategyDef {
  kind: ChunkingStrategy;
  label: string;
  description: string;
  comingSoon?: boolean;
}

export const CHUNKING_STRATEGIES: ChunkingStrategyDef[] = [
  {
    kind: "pages",
    label: "By page count",
    description: "Fixed number of pages per chunk.",
  },
  {
    kind: "section",
    label: "By section",
    description:
      "One chunk per detected section (uses outline). Coming after Phase A.",
    comingSoon: true,
  },
  {
    kind: "keyword",
    label: "By keyword",
    description:
      "Chunk on pages matching a keyword filter. Coming after Phase A.",
    comingSoon: true,
  },
  {
    kind: "manual",
    label: "Manual selection",
    description: "Hand-pick which pages go in which chunk.",
    comingSoon: true,
  },
];
