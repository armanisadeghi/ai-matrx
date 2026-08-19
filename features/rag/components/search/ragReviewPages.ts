import type { RagSearchHit } from "@/features/rag/api/search";

const MAX_REVIEW_PAGES = 12;

function positiveIntegers(values: readonly number[]): number[] {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value > 0)),
  ).sort((a, b) => a - b);
}

/**
 * Build the physical-PDF packet used by Review & Repair. The packet includes
 * every page spanned by the hit, one page before, and one page after. Large or
 * malformed ranges are capped so opening one result can never request an
 * unbounded derivative.
 */
export function buildRagReviewPages(
  pageNumbers: readonly number[] | null | undefined,
  pageNumber: number | null | undefined,
  totalPages?: number | null,
): number[] {
  const anchors = positiveIntegers(
    pageNumbers?.length ? pageNumbers : pageNumber != null ? [pageNumber] : [],
  );
  if (!anchors.length) return [];

  const lastPhysicalPage =
    totalPages != null && Number.isInteger(totalPages) && totalPages > 0
      ? totalPages
      : Number.POSITIVE_INFINITY;
  const start = Math.max(1, anchors[0] - 1);
  const lastAnchor = anchors[anchors.length - 1] ?? anchors[0];
  const end = Math.min(lastPhysicalPage, lastAnchor + 1);
  const pages: number[] = [];
  for (
    let page = start;
    page <= end && pages.length < MAX_REVIEW_PAGES;
    page++
  ) {
    pages.push(page);
  }
  return pages;
}

export function pageCountFromRagHit(hit: RagSearchHit): number | null {
  const direct = hit.metadata.page_count;
  if (typeof direct === "number" && Number.isInteger(direct) && direct > 0) {
    return direct;
  }
  const source = hit.metadata.source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const nested = (source as Record<string, unknown>).page_count;
    if (typeof nested === "number" && Number.isInteger(nested) && nested > 0) {
      return nested;
    }
  }
  return null;
}
