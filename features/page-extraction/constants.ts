/**
 * features/page-extraction/constants.ts
 *
 * Pure constants. No side effects.
 */

import type {
  ChunkingStrategy,
  SourceVariationKind,
} from "@/features/page-extraction/types";

/**
 * Surface name for this feature in the Surface Values system. Matches the
 * `matrx-user/content-extractor` row in `public.ui_surface` and the
 * `contentExtractorManifest` in
 * `features/tool-registry/surfaces/manifests/content-extractor.manifest.ts`.
 *
 * Used by the variable-mapping editor to pull the canonical list of values
 * an agent can be wired to. Also handed to `launchAgentExecution` as
 * `runtime.surfaceName` so `agx_agent_surface` bindings can apply.
 */
export const CONTENT_EXTRACTOR_SURFACE_NAME = "matrx-user/content-extractor";

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
      "Each page sent as an attachment so the agent can read it visually. Heavier; slower.",
    isTextual: false,
    comingSoon: true,
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
