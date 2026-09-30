// components/official/drill-explorer/questionParts.ts — A DECLARED QUESTION, WHOLE, ON THE EXPLORER
// (lane DRILL-WAVE1-FIXES, VERIFY-DRILL-WAVE1 F3).
//
// A built-in Saved view, a finding or a definition's default is a door question (`DrillQuestion`):
// list filters, ranges, ad hoc Measures, a group limit, thresholds, a comparison against a chosen
// range, a window of moments. The address (`MatrxDrillQuestion`) says only part of that. Dropping
// the rest opened a WIDER answer with no word (a view of "chat and API only" showed every origin).
//
// So a declared question splits in two and nothing is lost:
//   - the address question — everything the address can say (crumbs, a preset or a from..to window,
//     days or moments, a named comparison, the sort), and
//   - `door` — everything it cannot, carried beside it while the view is open: sent to the door with
//     every ask (the answer stays exactly as narrow as declared) and said on screen in one sentence.
// What the explorer truly cannot DRAW (a Measure made on the spot, a comparison against a chosen
// range) is carried too — so a saved copy keeps it — and named on screen as left out.
// `doorQuestionOf` is the exact inverse: a declared question survives the round trip.

import type { DrillQuestion } from "@ai-matrx/records";
import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import type { DrillHaving, DrillQuestionWithHaving } from "./types";

type AdHoc = Exclude<NonNullable<DrillQuestion["show"]>[number], string>;

/** What a declared question asks that the address cannot hold. */
export interface DrillCarried {
  /** Filters that are not one value: a list ("any of"), a `{from, to}` range, any other door shape. */
  where?: Record<string, unknown>;
  /** Groups per level before Other. */
  limit?: number;
  /** Thresholds on the groups (a finding's rule), applied by the door before the limit. */
  having?: DrillHaving[];
  /** The window's time Dimension, when the question names one. */
  windowKey?: string;
  /** Measures made on the spot, with their place in `show` — asked of nobody here, never drawn. */
  adHoc?: Array<{ at: number; measure: AdHoc }>;
  /** A comparison the address cannot say (a chosen range, a period, to date) — never drawn here. */
  compare?: Exclude<DrillQuestion["compare"], string | undefined>;
  /** The declared question's own path, lane, page and columns (kept so it round-trips). */
  path?: string;
  lane?: DrillQuestion["lane"];
  offset?: number;
  columns?: string[];
}

/** The address question with what it cannot say carried beside it (absent when there is nothing). */
export type ExplorerQuestion = MatrxDrillQuestion & { door?: DrillCarried };

/** The address grammar's window end: a day, or a moment to the minute or second, `Z` or an offset. */
const WINDOW_END = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const NAMED = new Set(["previous_period", "same_period_last_year"]);

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Split a declared question into the address question and what it cannot say. */
export function explorerQuestionParts(q: DrillQuestionWithHaving): ExplorerQuestion {
  const door: DrillCarried = {};
  const where: MatrxDrillQuestion["where"] = [];
  for (const [dim, value] of Object.entries(q.where ?? {})) {
    if (value === null || typeof value === "string") where.push({ dim, value });
    else (door.where ??= {})[dim] = value;
  }

  let window: string | null = null;
  const w = q.window;
  if (w) {
    if (w.key) door.windowKey = w.key;
    if (w.preset) window = w.preset;
    else if (w.from && w.to && WINDOW_END.test(w.from) && WINDOW_END.test(w.to)) window = `${w.from}..${w.to}`;
    else if (w.from || w.to) {
      // An open-ended or unreadable window is still the question's: the door gets it as declared.
      (door.where ??= {})[w.key ?? "at"] = { ...(w.from ? { from: w.from } : {}), ...(w.to ? { to: w.to } : {}) };
    }
  }

  const show: string[] = [];
  (q.show ?? []).forEach((s, at) => {
    if (typeof s === "string") show.push(s);
    else (door.adHoc ??= []).push({ at, measure: s });
  });

  const out: ExplorerQuestion = { by: [...(q.by ?? [])], show, where };
  if (q.across) out.across = q.across;
  if (window) out.window = window;

  const c = q.compare;
  if (typeof c === "string") out.compare = c;
  else if (c && NAMED.has(c.against) && Object.keys(c).every((k) => k === "against")) out.compare = c.against as MatrxDrillQuestion["compare"] & string;
  else if (c) door.compare = c;

  if (q.sort) {
    const measureSort = show.includes(q.sort.key);
    // The door's own default: a Measure largest first, a Dimension in its order.
    out.sort = { key: q.sort.key, direction: q.sort.direction ?? (measureSort ? "desc" : "asc") };
  }
  if (typeof q.limit === "number") door.limit = q.limit;
  if (q.having && q.having.length > 0) door.having = q.having;
  if (q.path) door.path = q.path;
  if (q.lane) door.lane = q.lane;
  if (typeof q.offset === "number") door.offset = q.offset;
  if (q.columns) door.columns = q.columns;
  if (Object.keys(door).length > 0) out.door = door;
  return out;
}

/** The exact inverse: the address question and what it carries, as the door question it came from. */
export function doorQuestionOf(q: ExplorerQuestion): DrillQuestionWithHaving {
  const door = q.door ?? {};
  const out: DrillQuestionWithHaving = {};
  if (q.by.length > 0) out.by = [...q.by];
  if (q.across) out.across = q.across;
  const show: NonNullable<DrillQuestion["show"]> = [...q.show];
  for (const { at, measure } of door.adHoc ?? []) show.splice(at, 0, measure);
  if (show.length > 0) out.show = show;
  const where: Record<string, unknown> = {};
  for (const c of q.where) where[c.dim] = c.value;
  let windowFromWhere: { from?: string; to?: string } | null = null;
  for (const [dim, value] of Object.entries(door.where ?? {})) {
    if (!q.window && dim === (door.windowKey ?? "at") && isPlainRecord(value) && !Array.isArray(value) && ("from" in value || "to" in value) && Object.keys(value).every((k) => k === "from" || k === "to")) {
      windowFromWhere = value as { from?: string; to?: string };
      continue;
    }
    where[dim] = value;
  }
  if (Object.keys(where).length > 0) out.where = where;
  if (q.window) {
    const range = q.window.split("..");
    out.window = {
      ...(door.windowKey ? { key: door.windowKey } : {}),
      ...(range.length === 2 ? { from: range[0]!, to: range[1]! } : { preset: q.window }),
    };
  } else if (windowFromWhere) {
    out.window = { ...(door.windowKey ? { key: door.windowKey } : {}), ...windowFromWhere };
  }
  if (door.compare) out.compare = door.compare;
  else if (q.compare) out.compare = q.compare;
  if (q.sort) out.sort = { key: q.sort.key, direction: q.sort.direction };
  if (door.limit !== undefined) out.limit = door.limit;
  if (door.having) out.having = door.having;
  if (door.path) out.path = door.path;
  if (door.lane) out.lane = door.lane;
  if (door.offset !== undefined) out.offset = door.offset;
  if (door.columns) out.columns = door.columns;
  return out;
}

/** The address question alone (what the URL holds) and its carried part. */
export function splitExplorerQuestion(q: ExplorerQuestion): { question: MatrxDrillQuestion; door: DrillCarried | null } {
  const { door, ...question } = q;
  return { question, door: door && Object.keys(door).length > 0 ? door : null };
}

/** What the door is asked beyond the address: merged into every ask while the view is open. */
export function carriedAsk(door: DrillCarried | null | undefined): Partial<DrillQuestionWithHaving> {
  if (!door) return {};
  return {
    ...(door.limit !== undefined ? { limit: door.limit } : {}),
    ...(door.having ? { having: door.having } : {}),
  };
}

// ── the sentence ────────────────────────────────────────────────────────────

const opWords: Record<string, string> = { sum: "total", avg: "average", min: "smallest", max: "largest", count: "count", count_distinct: "number of distinct", median: "median" };

function valueWords(value: unknown): string {
  if (Array.isArray(value)) {
    const words = value.map((v) => (v === null ? "none" : String(v)));
    return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`;
  }
  if (isPlainRecord(value)) {
    const from = value.from != null ? String(value.from) : null;
    const to = value.to != null ? String(value.to) : null;
    if (from || to) return from && to ? `from ${from} to before ${to}` : from ? `from ${from}` : `before ${to}`;
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * The on-screen words for what a view carries: `kept` is what still narrows the answer (it IS
 * asked), `leftOut` what this screen cannot draw. `labelOf` turns a Dimension or Measure key into
 * its words.
 */
export function carriedWords(door: DrillCarried | null | undefined, labelOf: (key: string) => string): { kept: string | null; leftOut: string | null } {
  if (!door) return { kept: null, leftOut: null };
  const kept: string[] = [];
  for (const [dim, value] of Object.entries(door.where ?? {})) {
    kept.push(`${labelOf(dim)} ${Array.isArray(value) ? "is " : ""}${valueWords(value)}`);
  }
  for (const h of door.having ?? []) {
    const m = labelOf(h.measure);
    const op = h.op === ">" ? "above" : "at least";
    if (h.share_of_total !== undefined) kept.push(`only groups whose ${m} is ${op} ${h.share_of_total}% of the window's total`);
    else if (h.times_median !== undefined) kept.push(`only groups whose ${m} is ${op} ${h.times_median}× the median group${h.median_nonzero ? " (of groups above zero)" : ""}`);
    else if (h.value !== undefined) kept.push(`only groups whose ${m} is ${op} ${h.value.toLocaleString()}`);
  }
  if (door.limit !== undefined) kept.push(`at most ${door.limit.toLocaleString()} groups per level before the rest`);

  const leftOut: string[] = [];
  for (const { measure } of door.adHoc ?? []) {
    leftOut.push(`the ${opWords[measure.op] ?? measure.op}${measure.of ? ` of ${labelOf(measure.of)}` : ""} (a Measure made for this view)`);
  }
  if (door.compare) {
    const c = door.compare;
    const against =
      c.against === "range" && c.from && c.to ? `${valueWords({ from: c.from, to: c.to })}` : c.against === "same_period_last_year" ? "the same period last year" : "the period before";
    leftOut.push(`the comparison with ${against}${c.period ? ` by ${c.period}` : ""}${c.to_date ? " to date" : ""}`);
  }
  return {
    kept: kept.length > 0 ? `This view also narrows the answer: ${kept.join("; ")}.` : null,
    leftOut: leftOut.length > 0 ? `Left out here, because this screen cannot draw it: ${leftOut.join("; ")}.` : null,
  };
}
