// features/rag/components/source-inspector/citedAnchor.ts
//
// Where a citation lands. A citation names its chunk; it does not always name
// its page (a web page, a transcript, a note — the generating agent only knows
// the chunk). The viewer must open AT that chunk, so the chunk's own page(s)
// and time are the anchor whenever the citation carries none. Pure — the
// chunk row is read by `useCitedChunk`.

import { formatDurationMs } from "@ai-matrx/kit/format";

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
  /**
   * The portion the cited text sits in (`docproc.processed_document_pages`):
   * its kind (`page` / `section` / `segment`) and locator (a web section's
   * `heading_path`, a transcript segment's `t0_ms`…). What the place is CALLED
   * comes from here — a web section is never "Page N".
   */
  portion?: CitedPortion | null;
  /** The cited chunk's processed document (when read from its chunk row). */
  documentId?: string | null;
}

/** One `processed_document_pages` row, as far as naming a place needs it. */
export interface CitedPortion {
  portionKind: string | null;
  locator: Record<string, unknown> | null;
  pageNumber: number | null;
}

/** A portion row → its naming facts. */
export function citedPortion(row: {
  portion_kind?: string | null;
  locator?: unknown;
  page_number?: number | null;
}): CitedPortion {
  return {
    portionKind: row.portion_kind ?? null,
    locator:
      row.locator && typeof row.locator === "object" && !Array.isArray(row.locator)
        ? (row.locator as Record<string, unknown>)
        : null,
    pageNumber: row.page_number ?? null,
  };
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

/** "0:00–1:17" for a timed segment; null when the chunk has no time. */
export function timeRangeLabel(t0Ms: number | null, t1Ms: number | null): string | null {
  if (t0Ms == null) return null;
  return t1Ms != null && t1Ms > t0Ms ? `${formatDurationMs(t0Ms)}–${formatDurationMs(t1Ms)}` : formatDurationMs(t0Ms);
}

/** "Page 3" / "Pages 3–5"; null when there are none. */
export function pagesLabel(pages: readonly number[]): string | null {
  if (!pages.length) return null;
  return pages.length === 1 ? `Page ${pages[0]}` : `Pages ${pages[0]}–${pages[pages.length - 1]}`;
}

/** Where inside a Source a citation points — named for what the Source is. */
export interface CitedPlace {
  /** `page` (a PDF/file page), `section` (a web page heading), `time` (a recording), `none`. */
  kind: "page" | "section" | "time" | "none";
  /** "Page 36", "Mechanism › Substrate binding", "2:50–4:13"; null = nothing honest to say. */
  label: string | null;
  /** A recording's start (ms) — the player opens here. */
  seekMs: number | null;
  /** The portion's own page_number (opens the Source page on it). */
  pageNumber: number | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * THE one place-naming function for a citation — the popup, the viewer's
 * header and its cited card all call it with the same inputs, so they always
 * name the same place. A web section says its heading (the page title, the
 * root of the path, is dropped — the chip already names the Source); a
 * recording says its time; only a real page says "Page N". A web page never
 * gets a page number: its "pages" are section ordinals (verify-5: "Page
 * 2992" in the popup, "Page 31" in the viewer, for the References section).
 */
export function citedPlace(
  pages: readonly number[],
  facts: CitedChunkFacts | null | undefined,
): CitedPlace {
  const portion = facts?.portion ?? null;
  const loc = portion?.locator ?? null;
  const pageNumber = portion?.pageNumber ?? pages[0] ?? null;
  const t0 = facts?.t0Ms ?? num(loc?.t0_ms);
  const t1 = facts?.t0Ms != null ? facts.t1Ms : num(loc?.t1_ms);
  if (t0 != null || portion?.portionKind === "segment") {
    const label = timeRangeLabel(t0, t1);
    return { kind: label ? "time" : "none", label, seekMs: t0, pageNumber };
  }
  if (portion?.portionKind === "section") {
    const path = Array.isArray(loc?.heading_path)
      ? (loc.heading_path as unknown[]).map((h) => String(h ?? "").trim()).filter(Boolean)
      : [];
    const shown = path.length > 1 ? path.slice(1) : path;
    const label = shown.length ? shown.join(" › ") : null;
    return { kind: label ? "section" : "none", label, seekMs: null, pageNumber };
  }
  const label = pagesLabel(pages);
  return { kind: label ? "page" : "none", label, seekMs: null, pageNumber };
}
