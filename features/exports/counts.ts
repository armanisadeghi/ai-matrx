// features/exports/counts.ts
//
// THE ONE PLACE A NUMBER ON THE EXPORT SCREEN COMES FROM.
//
// 🚨 WHY THIS FILE EXISTS (defect D6, 2026-09-17). While an export was still
// being indexed, the summary strip showed "WITH A FILE —" at the same moment,
// on the same screen, as the list header said "158 of 4,000 items … with an
// attachment". Both were describing the same quantity and neither knew the
// other existed:
//
//   • the strip read `ExportSummary`, which the server publishes only on
//     `library.index.completed`, so mid-index every field of it was null and
//     the strip rendered an em-dash;
//   • the header read `ExportItemsResponse.total` / `filtered_total` from the
//     last items page, which counts rows already written and is therefore
//     real, live and growing;
//   • the "Items" stat read a THIRD source — the index stream's `cumulative`;
//   • the scope count read a FOURTH — its own extra `limit=1` items request,
//     taken at yet another moment.
//
// Four readers, four moments, one quantity. The class fix is that no component
// on this screen reads any of those sources itself. `deriveExportCounts` takes
// every signal that exists, decides ONCE per render which is authoritative for
// each number, and hands back one object; the strip, the details sheet, the
// progress banner and the list header all render from that object, so they
// cannot disagree at any moment.
//
// THE PRECEDENCE, AND WHY. The items endpoint wins over the index stream
// whenever both have something to say, because every number on this screen
// describes rows the person can see, filter and send — and that is exactly
// what the items endpoint counts. The stream's `cumulative` is the reader's
// own progress; it is used only before any page has been read. The published
// summary wins over both, because when it exists the index is finished and it
// is the whole truth.
//
// NOTHING HERE INVENTS A NUMBER. A quantity no source has evidenced is `null`,
// and `formatExportCount` renders that as "counting…" while the index runs and
// "—" when it is not running. A number that can still grow is marked `partial`
// and always says what it is partial OF.

import { formatCount } from "./format";
import type { ExportItemFilter, ExportSummary } from "./types";

/** Which signal a number came from. Carried so a reader can say so, and so a
 *  test can assert two places used the SAME source, not two that agreed. */
export type ExportCountSource = "summary" | "items-read" | "index-stream";

export interface ExportCount {
  /** null = no source has evidenced this number. NEVER a zero stand-in. */
  value: number | null;
  /** The whole `value` is a part of, when it is partial. null when unknown. */
  of: number | null;
  /** True while this number can still grow — the index is still running. */
  partial: boolean;
  source: ExportCountSource | null;
}

const NOTHING: ExportCount = { value: null, of: null, partial: false, source: null };

/** What the page learns from every items read, beyond the rows themselves. */
export interface ExportPageFacts {
  /** The whole Library, as the items endpoint sees it right now. */
  total: number;
  /** What the current filter matches. */
  filteredTotal: number;
  /** The server's own words for the active filter. */
  filterDescription: string;
  /**
   * The filter that read produced, exactly as the endpoint received it.
   *
   * Load-bearing: it is how a filtered read can legitimately supply an
   * UNFILTERED number. A page read narrowed to `has_attachment: true` is a
   * count of the items with an attachment, so mid-index it is the one honest
   * source for the strip's "With a file" — but only when the filter really is
   * that and nothing else, which is what this field lets the derivation check.
   */
  filter: ExportItemFilter;
  /**
   * One sentence per item (or item recipient) the last page read could not
   * read — see `ExportItemsResponse.row_problems`. The list itself already
   * dropped these rows; this is only here so the screen can say so.
   */
  rowProblems: string[];
}

export interface ExportCountsInput {
  /** Published only when the index has finished. */
  summary: ExportSummary | null;
  /** The index stream's cumulative, or null before it has said anything. */
  indexedSoFar: number | null;
  /** True while the index is actually running. */
  indexing: boolean;
  /** The last items page read. */
  facts: ExportPageFacts | null;
}

export interface ExportCounts {
  indexing: boolean;
  /** Everything in the export. */
  total: ExportCount;
  /** What the filter on screen right now matches. */
  filtered: ExportCount;
  /** The server's own words for that filter, or "". */
  filterDescription: string;
  outbound: ExportCount;
  withAttachments: ExportCount;
  words: ExportCount;
  characters: ExportCount;
}

/**
 * Is this read narrowed to exactly one axis with exactly this value?
 *
 * A read filtered to attachments AND a date range counts something narrower
 * than "items with an attachment", so it must not be offered as that number.
 * Anything with a preset is opaque to us by design (the server resolves it),
 * so it never qualifies.
 */
function isSoleFilter(
  filter: ExportItemFilter,
  key: keyof ExportItemFilter,
  value: unknown,
): boolean {
  const keys = Object.keys(filter).filter(
    (k) => filter[k as keyof ExportItemFilter] !== undefined,
  );
  return keys.length === 1 && keys[0] === key && filter[key] === value;
}

export function deriveExportCounts(input: ExportCountsInput): ExportCounts {
  const { summary, indexedSoFar, indexing, facts } = input;

  // ── The whole export ──────────────────────────────────────────────────
  let total: ExportCount = NOTHING;
  if (summary) {
    total = {
      value: summary.total_items,
      of: null,
      partial: false,
      source: "summary",
    };
  } else if (facts) {
    total = {
      value: facts.total,
      of: null,
      partial: indexing,
      source: "items-read",
    };
  } else if (indexedSoFar !== null) {
    total = {
      value: indexedSoFar,
      of: null,
      partial: indexing,
      source: "index-stream",
    };
  }

  // ── What the filter on screen matches ─────────────────────────────────
  const filtered: ExportCount = facts
    ? {
        value: facts.filteredTotal,
        of: total.value,
        partial: indexing,
        source: "items-read",
      }
    : NOTHING;

  /**
   * One signal-count — "how many items are X" — from whichever source can
   * honestly answer it at this instant. The summary when it exists; otherwise
   * the current page read, but ONLY when that read is narrowed to exactly this
   * axis, so the number means what the label says.
   */
  function signal(
    fromSummary: number | null | undefined,
    key: keyof ExportItemFilter,
    value: unknown,
  ): ExportCount {
    if (summary && fromSummary !== null && fromSummary !== undefined) {
      return {
        value: fromSummary,
        of: summary.total_items,
        partial: false,
        source: "summary",
      };
    }
    if (facts && isSoleFilter(facts.filter, key, value)) {
      return {
        value: facts.filteredTotal,
        of: facts.total,
        partial: indexing,
        source: "items-read",
      };
    }
    return NOTHING;
  }

  return {
    indexing,
    total,
    filtered,
    filterDescription: facts?.filterDescription ?? "",
    outbound: signal(
      summary?.counts_by_direction?.outbound ?? (summary ? 0 : null),
      "direction",
      "outbound",
    ),
    withAttachments: signal(summary?.with_attachments, "has_attachment", true),
    // Words and characters exist in ONE source and are shown in one place, so
    // there is nothing for them to disagree with — and no honest way to guess
    // them from a row count.
    words: summary
      ? { value: summary.total_words, of: null, partial: false, source: "summary" }
      : NOTHING,
    characters: summary
      ? { value: summary.total_chars, of: null, partial: false, source: "summary" }
      : NOTHING,
  };
}

/**
 * The words for one count. The ONLY function that turns an `ExportCount` into
 * something a person reads, so "158 of 4,000 read so far" is written once.
 */
export function formatExportCount(count: ExportCount, indexing: boolean): string {
  if (count.value === null) return indexing ? "counting…" : "—";
  if (!count.partial) return formatCount(count.value);
  if (count.of !== null && count.of !== count.value) {
    return `${formatCount(count.value)} of ${formatCount(count.of)} read so far`;
  }
  return `${formatCount(count.value)} read so far`;
}
