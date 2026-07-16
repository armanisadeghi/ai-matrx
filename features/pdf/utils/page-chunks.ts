/**
 * Page-number chunking shared by PDF surfaces that must preserve exact source
 * pages. The stride matches the page-extraction backend: chunkSize - overlap.
 */

export const MAX_PDF_CHUNKS_PER_BATCH = 100;

export function chunkPdfPageNumbers(
  pages: readonly number[],
  pagesPerChunk: number,
  overlappingPages = 0,
): number[][] {
  if (pages.length === 0) return [];
  if (pagesPerChunk <= 0) return [[...pages]];

  const overlap = Math.max(
    0,
    Math.min(pagesPerChunk - 1, Math.floor(overlappingPages)),
  );
  const stride = Math.max(1, pagesPerChunk - overlap);
  const chunks: number[][] = [];
  for (let start = 0; start < pages.length; start += stride) {
    const end = Math.min(pages.length, start + pagesPerChunk);
    const chunk = pages.slice(start, end);
    if (chunk.length === 0) break;
    chunks.push(chunk);
    if (end >= pages.length) break;
  }
  return chunks;
}
