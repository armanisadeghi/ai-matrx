// components/official/drill-explorer/explorerWords.ts — THE SMALL WORDS THE EXPLORER PRINTS, FROM DATA
// (lane DRILL-LIVE-FIXES, VERIFY-DRILL-LIVE F3, F4, F5, F8).
//
// Each function here turns something the definition or the door already says into a label that fits
// its slot: a records count's noun from the definition's grain ("one row per execution …" → 1,026
// executions, F3), a moment as a date and time in the calendar the numbers are cut in (F4, F8), an id
// no name was found for as a short id (never a whole UUID leading a row), a finding's true group count
// when the door capped the list (F5).

import { isUuidShape } from "@ai-matrx/kit/uuid";

/**
 * The noun one row of a definition is, from its grain sentence ("one row per execution of the AI usage
 * ledger (…)" → "execution"; "one row per ingest run (…)" → "ingest run"; "one row per hour for each
 * organization, …" → "hour"). Null when the grain does not say "one row per".
 */
export function grainNoun(grain: string | null | undefined): string | null {
  const m = /one row per\s+(.+)$/i.exec(grain ?? "");
  if (!m) return null;
  const noun = m[1]!.split(/\s+(?:of|for|with|in|from|per|where|that|whose)\s+|[,(;:—–-]/)[0]!.trim().toLowerCase();
  return noun.length > 0 && noun.length <= 40 ? noun : null;
}

/** "execution" → "executions", "entry" → "entries", "batch" → "batches". */
export function pluralNoun(noun: string, n: number): string {
  if (n === 1) return noun;
  if (/[^aeiou]y$/.test(noun)) return `${noun.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(noun)) return `${noun}es`;
  return `${noun}s`;
}

const ISO_MOMENT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?$/;

/** True for a timestamp string the records read raw ("2026-09-12T23:59:36.392599+00:00"). */
export function isMoment(value: unknown): value is string {
  return typeof value === "string" && ISO_MOMENT.test(value) && !Number.isNaN(new Date(value).getTime());
}

/**
 * A moment as the KG and workflow records print it ("Sep 30, 3:53 PM"), in the calendar the numbers
 * are cut in when the host names one (`timeZone: "UTC"` on the platform lane), else the reader's.
 */
export function momentWords(iso: string, timeZone?: string | undefined): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
}

/** A clock time in the same calendar ("3:50 PM"). */
export function clockWords(iso: string, timeZone?: string | undefined): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
}

/** An id nothing names reads as its first eight characters (the whole id in the cell's tooltip). */
export function shortId(value: string): string | null {
  return isUuidShape(value) ? value.slice(0, 8) : null;
}

/**
 * A finding's count: the groups that meet its rule, true even past the door's group cap (the door's
 * `distinct_groups`), and how many of them the list could hold.
 */
export function findingCount(groupsListed: number, distinctGroups: number | null | undefined): { count: number; capped: boolean } {
  const count = typeof distinctGroups === "number" && distinctGroups > groupsListed ? distinctGroups : groupsListed;
  return { count, capped: count > groupsListed };
}

/**
 * One Measure beside a count, in the header and above the records: a count reads "148 requests"; any
 * other unit names itself first ("Cost 3,773,448 points", "Projected monthly cost 3,578 points").
 */
export function measureFactWords(label: string, unit: string | null | undefined, formatted: string): string {
  if (!unit || unit === "count" || unit === "tokens" || unit === "characters") return `${formatted} ${label.toLowerCase()}`;
  return `${label} ${formatted}`;
}

/**
 * A FAILED ASK IN WORDS (lane DRILL-PRIMITIVE-2): the database's own text never reaches the screen.
 * A timeout says so (the person can narrow the window); anything else is the caller's plain sentence.
 * The raw text stays with the error for the copy-for-AI details.
 */
export function drillFailureWords(raw: string | null | undefined, fallback: string): string {
  const text = raw ?? "";
  if (/statement timeout|canceling statement|timed? ?out|57014|deadline/i.test(text)) return "Took too long to count. Narrow the window.";
  return fallback;
}
