// features/unified-data/standard-field-columns/wholeResult.ts
//
// EVERY ROW THE LIST SELECTS, NOT THE PAGE ON SCREEN (lane 7 W2, fix round 2). A server-paged
// standard list (CRM people: 25 of 465) exports and groups over its WHOLE current result — the
// same filters, search and sort, read from the server page by page in the list's own order. Each
// purpose has its own ceiling knob: an export streams to a file (`custom.export_rows_ceiling`,
// 100,000); a grouped view renders every row in an unvirtualized table (`lists.group_rows_ceiling`,
// 500 — measured to render near 2 s). A read that reaches its ceiling returns what it read and the
// screen says how many it left.

import { knobInt } from "@/lib/knobs/featureKnobs";

/** PostgREST answers at most this many rows per request; the reader pages under it. */
const PAGE = 1000;

export interface WholeResult<TRow> {
  rows: TRow[];
  /** The list's true total for this query. */
  total: number;
  /** Set when the ceiling stopped the read before `total`. */
  ceiling: number | null;
}

export type WholeResultPurpose = "export" | "group";

/** The ceiling knob for this purpose, read once per call (the knob cache keeps it cheap). */
export async function wholeResultCeiling(purpose: WholeResultPurpose): Promise<number> {
  return purpose === "group" ? knobInt("lists", "group_rows_ceiling") : knobInt("custom", "export_rows_ceiling");
}

/**
 * Read the whole result through the list's own page reader. `readRange(from, to)` must apply the
 * list's predicates and its total order (every list here ends its order in `id`), and answer the
 * true total.
 */
export async function readWholeResult<TRow>(
  readRange: (from: number, to: number) => Promise<{ rows: TRow[]; total: number }>,
  ceiling: number | WholeResultPurpose = "export",
): Promise<WholeResult<TRow>> {
  const limit = typeof ceiling === "number" ? ceiling : await wholeResultCeiling(ceiling);
  const rows: TRow[] = [];
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    const to = Math.min(from + PAGE, limit) - 1;
    if (to < from) break;
    const page = await readRange(from, to);
    total = page.total;
    rows.push(...page.rows);
    if (page.rows.length < to - from + 1 || rows.length >= total || rows.length >= limit) break;
  }
  return { rows, total, ceiling: total > rows.length && rows.length >= limit ? limit : null };
}
