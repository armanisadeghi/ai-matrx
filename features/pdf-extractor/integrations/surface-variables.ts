/**
 * features/pdf-extractor/integrations/surface-variables.ts
 *
 * The PDF Extractor's contract with the page-extraction system. Given a
 * chunk of pages, produce the canonical SurfaceChunkVariables that a Job's
 * variable_mapping can translate into agent variable names.
 *
 * Surfaces declare the contract; jobs do the mapping. Adding a new
 * canonical variable means: (a) add it to SurfaceChunkVariables in
 * features/page-extraction/types.ts, (b) populate it here, (c) jobs that
 * want to use it add a mapping entry.
 */

import type { PdfPageRow } from "@/features/pdf-extractor/hooks/useProcessedDocumentPages";
import { PAGE_MARKER } from "@/features/page-extraction/constants";
import { formatPageRange } from "@/features/page-extraction/utils/chunk-preview";
import type { SurfaceChunkVariables } from "@/features/page-extraction/types";

export interface BuildPdfChunkVariablesInput {
  /** All pages of the doc (for context before/after lookup). */
  pages: PdfPageRow[];
  /** 1-based page numbers in the current chunk. */
  chunkPageNumbers: number[];
  /** Document display name. */
  filename: string;
  /** Prefer cleaned text when available; falls back to raw OCR. */
  preferCleaned?: boolean;
}

function pageText(p: PdfPageRow, preferCleaned: boolean): string {
  if (preferCleaned && p.cleanedText) return p.cleanedText;
  return p.rawText ?? "";
}

/**
 * Build the canonical chunk variables for the PDF Extractor surface. The
 * Job's `variable_mapping` translates these keys to whatever the agent's
 * variables are called.
 */
export function buildPdfChunkVariables(
  input: BuildPdfChunkVariablesInput,
): SurfaceChunkVariables {
  const { pages, chunkPageNumbers, filename } = input;
  const preferCleaned = input.preferCleaned !== false;

  const chunkSet = new Set(chunkPageNumbers);
  const chunkPages = pages.filter((p) => chunkSet.has(p.pageNumber));

  // Build selection text with --- Page N --- markers between pages.
  const selection = chunkPages
    .map(
      (p) =>
        `${PAGE_MARKER(p.pageNumber)}\n${pageText(p, preferCleaned)}`.trim(),
    )
    .filter(Boolean)
    .join("\n\n");

  // text_before / text_after — single-page surrounding context (cheap).
  const firstChunkPage = chunkPageNumbers[0];
  const lastChunkPage = chunkPageNumbers[chunkPageNumbers.length - 1];
  const beforePage =
    typeof firstChunkPage === "number"
      ? pages.find((p) => p.pageNumber === firstChunkPage - 1)
      : undefined;
  const afterPage =
    typeof lastChunkPage === "number"
      ? pages.find((p) => p.pageNumber === lastChunkPage + 1)
      : undefined;

  return {
    selection,
    content: selection,
    filename,
    page_numbers: formatPageRange(chunkPageNumbers),
    ...(beforePage
      ? { text_before: pageText(beforePage, preferCleaned) }
      : {}),
    ...(afterPage
      ? { text_after: pageText(afterPage, preferCleaned) }
      : {}),
  };
}

/**
 * Helper for one-shot scope previews — what would get sent if we ran an
 * extraction across these specific pages right now (single chunk).
 */
export function previewSelectionForPages(
  pages: PdfPageRow[],
  pageNumbers: number[],
  filename: string,
): string {
  return buildPdfChunkVariables({
    pages,
    chunkPageNumbers: pageNumbers,
    filename,
  }).selection;
}
