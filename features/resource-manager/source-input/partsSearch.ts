/**
 * Finding a part of a Source — THE one matcher, used by the Source card's
 * "Choose parts" and by "Review what goes in".
 *
 * A query is one of:
 *   - a page number ("12") — the part that covers that page;
 *   - a page range ("3-10", "3–10", "3 to 10") — every part inside it;
 *   - words — every word must appear in the part's label or its preview (the
 *     opening words the manifest carries, contract amendment A5), matched here;
 *     or the part is one the server found holding every word in its full text
 *     (`POST /sources/parts/search`, via `useSourcePartsSearch`).
 *
 * A part spanning several pages ("Pages 22–24") covers each of them: the
 * manifest's numeric `page` is its first page and the label names the span.
 *
 * V1-A: the search promised "words" but matched only labels, so
 * "photosynthesis" found nothing in a biology course.
 */

import type { SourceManifestSegment } from "@ai-matrx/agents/sources";

/** A manifest part, with the A5 preview (optional on the wire). */
export type SourcePart = SourceManifestSegment & { preview?: string };

/** The ids of parts the server found holding every word (`useSourcePartsSearch`). */
export type PartMatchIds = ReadonlySet<string>;

const RANGE_RE = /^(\d+)\s*(?:-|–|—|to)\s*(\d+)$/;
const SPAN_RE = /(\d+)\s*[–—-]\s*(\d+)/;

/** The pages a part covers: its label's span ("Pages 22–24") or its one page. */
export function partPages(part: SourcePart): [number, number] | null {
  if (part.page === undefined || part.page === null) return null;
  const span = /^pages?\s/i.test(part.label) ? SPAN_RE.exec(part.label) : null;
  if (span) return [Number(span[1]), Number(span[2])];
  return [part.page, part.page];
}

/** True when a query is words (not a page or a range) — only then is the text searched. */
export function isWordQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  return q.length > 0 && !/^\d+$/.test(q) && !RANGE_RE.test(q);
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}

export function matchesPart(part: SourcePart, query: string, serverMatches?: PartMatchIds): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const pages = partPages(part);
  const range = RANGE_RE.exec(q);
  if (range && pages) {
    const from = Math.min(Number(range[1]), Number(range[2]));
    const to = Math.max(Number(range[1]), Number(range[2]));
    return pages[0] <= to && pages[1] >= from;
  }
  if (/^\d+$/.test(q) && pages) {
    const n = Number(q);
    return pages[0] <= n && n <= pages[1];
  }
  if (part.id.toLowerCase() === q) return true;
  if (serverMatches?.has(part.id)) return true;
  const haystack = normalise([part.label, part.preview ?? ""].join(" "));
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** The parts a query shows, in the Source's own order. */
export function findParts<T extends SourcePart>(
  parts: readonly T[],
  query: string,
  serverMatches?: PartMatchIds,
): T[] {
  return parts.filter((p) => matchesPart(p, query, serverMatches));
}
