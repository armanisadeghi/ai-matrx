/**
 * features/page-extraction/utils/chunk-preview.ts
 *
 * Slice a page list into chunks the way the backend will. Used by the
 * Job editor to preview "you will spawn N agent calls" before the user
 * commits.
 */

import { MAX_CHUNK_SIZE, MIN_CHUNK_SIZE } from "@/features/page-extraction/constants";

export function clampChunkSize(value: number): number {
  if (!Number.isFinite(value)) return MIN_CHUNK_SIZE;
  return Math.max(MIN_CHUNK_SIZE, Math.min(MAX_CHUNK_SIZE, Math.floor(value)));
}

export interface ChunkPreview {
  chunkIndex: number;
  pageNumbers: number[];
}

export function previewChunks(
  pages: number[],
  chunkSize: number,
  chunkOverlap = 0,
): ChunkPreview[] {
  const size = clampChunkSize(chunkSize);
  const overlap = Math.max(0, Math.min(size - 1, Math.floor(chunkOverlap)));
  const stride = Math.max(1, size - overlap);
  const result: ChunkPreview[] = [];
  for (let start = 0, idx = 0; start < pages.length; start += stride, idx++) {
    const end = Math.min(pages.length, start + size);
    result.push({
      chunkIndex: idx,
      pageNumbers: pages.slice(start, end),
    });
    if (end >= pages.length) break;
  }
  return result;
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
