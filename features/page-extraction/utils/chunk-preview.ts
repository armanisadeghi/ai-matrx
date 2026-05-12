/**
 * features/page-extraction/utils/chunk-preview.ts
 *
 * In-memory chunk computation. Mirrors what the backend does at run time
 * so what the user sees in the preview is exactly what will be sent.
 *
 * Inputs are deliberately verbose (pages + selected variations + chunk
 * size) — no implicit defaults. The caller must have already validated
 * everything upstream.
 */

import {
  MAX_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
  PAGE_MARKER,
} from "@/features/page-extraction/constants";
import type {
  ChunkPreviewItem,
  ChunkStats,
  SourceVariationKind,
} from "@/features/page-extraction/types";

export function clampChunkSize(value: number): number {
  if (!Number.isFinite(value)) return MIN_CHUNK_SIZE;
  return Math.max(MIN_CHUNK_SIZE, Math.min(MAX_CHUNK_SIZE, Math.floor(value)));
}

/**
 * Per-page text bundle the chunk preview pulls from. The caller assembles
 * this from `processed_document_pages` rows (or whatever source they have)
 * — the preview module is agnostic about where the text came from.
 */
export interface PageTextBundle {
  pageNumber: number;
  /** Map of `SourceVariationKind` → the text for that variation on this
   *  page. Missing entries fall back to empty string in the preview. */
  texts: Partial<Record<SourceVariationKind, string>>;
}

/**
 * Slice a page list into chunks. Mirrors the backend's `_chunk_pages`
 * (size-based, optional overlap).
 */
export function previewChunks({
  pages,
  chunkSize,
  chunkOverlap = 0,
  variations,
}: {
  pages: PageTextBundle[];
  chunkSize: number;
  chunkOverlap?: number;
  variations: SourceVariationKind[];
}): ChunkPreviewItem[] {
  if (pages.length === 0 || variations.length === 0) return [];

  const size = clampChunkSize(chunkSize);
  const overlap = Math.max(0, Math.min(size - 1, Math.floor(chunkOverlap)));
  const stride = Math.max(1, size - overlap);
  const result: ChunkPreviewItem[] = [];

  for (let start = 0, idx = 0; start < pages.length; start += stride, idx++) {
    const end = Math.min(pages.length, start + size);
    const slice = pages.slice(start, end);

    const charsByVariation = {} as Record<SourceVariationKind, number>;
    for (const v of variations) charsByVariation[v] = 0;

    const previewPieces: string[] = [];
    for (const page of slice) {
      previewPieces.push(PAGE_MARKER(page.pageNumber));
      // Join selected variations for this page into one block per page.
      for (const v of variations) {
        const text = (page.texts[v] ?? "").trim();
        if (text) {
          previewPieces.push(text);
          charsByVariation[v] += text.length;
        }
      }
    }

    const preview = previewPieces.join("\n").trim();
    const totalChars = Object.values(charsByVariation).reduce(
      (acc, n) => acc + n,
      0,
    );

    result.push({
      chunkIndex: idx,
      pageNumbers: slice.map((p) => p.pageNumber),
      preview,
      charsByVariation,
      totalChars,
    });

    if (end >= pages.length) break;
  }

  return result;
}

export function computeChunkStats(chunks: ChunkPreviewItem[]): ChunkStats {
  if (chunks.length === 0) {
    return {
      chunkCount: 0,
      totalChars: 0,
      avgChars: 0,
      longestChars: 0,
      shortestChars: 0,
      emptyChunks: 0,
    };
  }
  let total = 0;
  let longest = 0;
  let shortest = Number.MAX_SAFE_INTEGER;
  let empties = 0;
  for (const c of chunks) {
    total += c.totalChars;
    if (c.totalChars > longest) longest = c.totalChars;
    if (c.totalChars < shortest) shortest = c.totalChars;
    if (c.totalChars === 0) empties += 1;
  }
  return {
    chunkCount: chunks.length,
    totalChars: total,
    avgChars: Math.round(total / chunks.length),
    longestChars: longest,
    shortestChars: shortest === Number.MAX_SAFE_INTEGER ? 0 : shortest,
    emptyChunks: empties,
  };
}

/**
 * Format a list of page numbers as a compact human-readable range:
 *   [1,2,3,5,6,9] → "1-3, 5-6, 9"
 */
export function formatPageRange(pages: number[]): string {
  if (pages.length === 0) return "";
  const sorted = [...pages].sort((a, b) => a - b);
  const groups: [number, number][] = [];
  let start = sorted[0];
  let prev = start;
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    groups.push([start, prev]);
    start = n;
    prev = n;
  }
  groups.push([start, prev]);
  return groups.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(", ");
}

/**
 * Parse a free-form page range string into a deduped, sorted array.
 * Throws on invalid input — callers should surround with try/catch.
 *
 *   "1, 3-5, 10"  → [1, 3, 4, 5, 10]
 */
export function parsePageRangeInput(input: string): number[] {
  const out = new Set<number>();
  const trimmed = input.trim();
  if (!trimmed) return [];
  for (const token of trimmed.split(/[,;\s]+/)) {
    if (!token) continue;
    const m = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        throw new Error(`Invalid range: ${token}`);
      }
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let n = lo; n <= hi; n++) out.add(n);
      continue;
    }
    if (/^\d+$/.test(token)) {
      out.add(parseInt(token, 10));
      continue;
    }
    throw new Error(`Invalid token: ${token}`);
  }
  return Array.from(out).sort((a, b) => a - b);
}
