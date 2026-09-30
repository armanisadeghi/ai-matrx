// features/rag/components/source-inspector/citedAnchor.ts
//
// Where a citation lands. A citation names its chunk; it does not always name
// its page (a web page, a transcript, a note — the generating agent only knows
// the chunk). The viewer must open AT that chunk, so the chunk's own page(s)
// and time are the anchor whenever the citation carries none. Pure — the
// chunk row is read by `useCitedChunk`.

/** What the viewer needs from the cited chunk's own row. */
export interface CitedChunkFacts {
  pageNumbers: number[] | null;
  /**
   * The citation names a resolver PART (`<source id>:<n>`, a document with no
   * search index yet), not an indexed chunk: there is no chunk card to
   * highlight — the viewer shows the cited passage on its page instead.
   */
  part?: boolean;
  /** Transcript segments carry their time (ms) — a video has no pages. */
  t0Ms: number | null;
  t1Ms: number | null;
}

/** The chunk row's facts, from `rag.kg_chunks` (`page_numbers`, `metadata`). */
export function citedChunkFacts(row: {
  page_numbers?: number[] | null;
  metadata?: unknown;
}): CitedChunkFacts {
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const ms = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    pageNumbers: Array.isArray(row.page_numbers) ? row.page_numbers : null,
    t0Ms: ms(meta.t0_ms),
    t1Ms: ms(meta.t1_ms),
  };
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** A real indexed chunk id (a uuid). */
export function isChunkId(id: string): boolean {
  return new RegExp(`^${UUID}$`, "i").test(id);
}

/**
 * A resolver part id — `<document id>:<n>`, the n-th page that has text
 * (`source_resolution.py` names page-grounded parts this way). Null otherwise.
 */
export function parsePartId(id: string): { documentId: string; ordinal: number } | null {
  const m = new RegExp(`^(${UUID}):(\\d+)$`, "i").exec(id);
  if (!m) return null;
  const ordinal = Number.parseInt(m[2]!, 10);
  return ordinal >= 1 ? { documentId: m[1]!, ordinal } : null;
}

/**
 * The page a part id points at: the `ordinal`-th page (by page number) that
 * has text — the same count the server used when it named the part. Null when
 * the document has fewer pages with text.
 */
export function pageForPartOrdinal(
  rows: ReadonlyArray<{ page_number: number | null; raw_char_count?: number | null; cleaned_char_count?: number | null }>,
  ordinal: number,
): number | null {
  const withText = rows
    .filter((r) => r.page_number != null && ((r.cleaned_char_count ?? 0) > 0 || (r.raw_char_count ?? 0) > 0))
    .map((r) => r.page_number as number)
    .sort((a, b) => a - b);
  return withText[ordinal - 1] ?? null;
}

function cleanPages(raw: readonly number[]): number[] {
  return [...new Set(raw)]
    .filter((n) => Number.isFinite(n) && n >= 1)
    .sort((a, b) => a - b);
}

/**
 * The page(s) the citation anchors to: the citation's own pages when it has
 * them, else the cited chunk's pages. Empty = unknown.
 */
export function citedPages(
  pageNumbers: readonly number[] | null | undefined,
  pageNumber: number | null | undefined,
  chunk: CitedChunkFacts | null | undefined,
): number[] {
  const own =
    pageNumbers && pageNumbers.length
      ? cleanPages(pageNumbers)
      : pageNumber != null
        ? cleanPages([pageNumber])
        : [];
  if (own.length) return own;
  return chunk?.pageNumbers ? cleanPages(chunk.pageNumbers) : [];
}

/** The 1-based page the viewer opens on. */
export function citedTargetPage(pages: readonly number[]): number {
  return Math.max(1, pages[0] ?? 1);
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** "0:00–1:17" for a timed segment; null when the chunk has no time. */
export function timeRangeLabel(t0Ms: number | null, t1Ms: number | null): string | null {
  if (t0Ms == null) return null;
  return t1Ms != null && t1Ms > t0Ms ? `${clock(t0Ms)}–${clock(t1Ms)}` : clock(t0Ms);
}

/** "Page 3" / "Pages 3–5"; null when there are none. */
export function pagesLabel(pages: readonly number[]): string | null {
  if (!pages.length) return null;
  return pages.length === 1 ? `Page ${pages[0]}` : `Pages ${pages[0]}–${pages[pages.length - 1]}`;
}
