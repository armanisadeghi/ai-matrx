/**
 * features/file-analysis/content/utils.ts
 *
 * Helpers shared by the content renderers — typed shape narrowing of the
 * detector payloads + a small "find result by kind" helper.
 */

import type { FileAnalysisResultRow } from "@/features/file-analysis/api/file-analysis";

export function findResult(
  results: FileAnalysisResultRow[],
  kind: string,
  tier?: string,
): FileAnalysisResultRow | undefined {
  if (tier) {
    return results.find(
      (r) => r.detector_kind === kind && r.confidence_tier === tier,
    );
  }
  return results.find((r) => r.detector_kind === kind);
}

export function allResults(
  results: FileAnalysisResultRow[],
  kind: string,
): FileAnalysisResultRow[] {
  return results.filter((r) => r.detector_kind === kind);
}

// ─── Typed shape narrowing of payloads ──────────────────────────────────────

export interface TextExtractionPagePayload {
  page_number: number;
  text?: string;
  text_ocr?: string;
  chars: number;
  source?: "native" | "ocr" | "mixed";
  ocr_confidence?: number | null;
}

export interface TextExtractionPayload {
  pages: TextExtractionPagePayload[];
  coverage?: Record<string, unknown>;
  ocr_pages_needed?: number[];
}

export interface OutlineEntry {
  index: number;
  level: number;
  title: string;
  page_number: number;
  page_id?: string | null;
  parent_index: number | null;
}

export interface OutlinePayload {
  entries: OutlineEntry[];
}

export interface MetadataPayload {
  page_count: number;
  is_encrypted: boolean;
  is_pdf?: boolean;
  needs_pass?: boolean;
  info: Record<string, string | undefined>;
  pages: Array<{ page_number: number; width: number; height: number; rotation: number }>;
}

export interface ClassificationPagePayload {
  page_number: number;
  page_class: string;
  confidence: number;
  indicators: string[];
}

export interface ClassificationPayload {
  page_count: number;
  pages: ClassificationPagePayload[];
  classifier_version?: string;
}

export interface TableCellPayload {
  row: number;
  col: number;
  text: string | null;
}

export interface TablePayload {
  page_number: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  row_count: number;
  col_count: number;
  cells: TableCellPayload[];
  markdown?: string;
}

export interface TablesPayload {
  page_count: number;
  tables: TablePayload[];
}

export interface EmbeddedImagePlacementPayload {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface EmbeddedImagePayload {
  page_number: number;
  xref: number;
  width: number;
  height: number;
  bpc: number;
  colorspace: string;
  filter: string;
  smask?: number;
  placements: EmbeddedImagePlacementPayload[];
}

export interface EmbeddedImagesPayload {
  images: EmbeddedImagePayload[];
}

export interface PiiCandidateSpan {
  pattern_id: string;
  category: string;
  page_number: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  char_start: number;
  char_end: number;
  masked_preview: string;
  match_hash: string;
  validator_passed: boolean;
  confidence_tier: string;
}

export interface PiiCandidatesPayload {
  spans: PiiCandidateSpan[];
}

export interface RepeatedRegionBboxPayload {
  page_number: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  raw_text: string;
}

export interface RepeatedRegionPayload {
  region_id: string;
  kind: string;
  text_template: string;
  pages: number[];
  bbox_per_page: RepeatedRegionBboxPayload[];
  confidence: number;
}

export interface RepeatedRegionsPayload {
  page_count: number;
  regions: RepeatedRegionPayload[];
}

export interface DuplicatePageGroup {
  hash?: string;
  pages: number[];
  count: number;
  max_hamming?: number;
  threshold?: number;
}

export interface DuplicatePagesPayload {
  groups: DuplicatePageGroup[];
  page_hashes?: Record<string, string>;
  fingerprints?: Record<string, string>;
  page_phash?: Record<string, string>;
}

export function asObject<T>(value: unknown): T | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as T;
  return null;
}
