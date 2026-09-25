// components/rich-editor/core/find-replace.ts
//
// Find & replace that knows what it must not touch. Protected content —
// every island the tokenizer names (kind JSON, XML sections, code fences,
// math, HTML, anchors, {{variables}}, citations) — is skipped unless the person
// explicitly turns "Include protected content" on. Skipped matches are still
// COUNTED, so the panel can say "3 more inside protected content" instead of
// silently finding nothing.

import { listIslands, tokenizeSource } from "@ai-matrx/content-ir/source";

export interface FindOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  includeProtected?: boolean;
}

export interface FindMatch {
  start: number;
  end: number;
  /** The match overlaps protected content. */
  inProtected: boolean;
  /** The stored bytes of the island it overlaps (for the explicit-edit record). */
  islandRaw: string | null;
}

export interface FindResult {
  /** Matches the replace may act on. */
  matches: FindMatch[];
  /** Matches left out because they sit in protected content. */
  skippedProtected: number;
  /** A readable reason when the pattern is invalid. */
  error: string | null;
}

const MAX_MATCHES = 5000;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The one pattern builder both views use. Null when the query is empty or invalid. */
export function buildFindRegex(
  query: string,
  options: FindOptions = {},
): { regex: RegExp | null; error: string | null } {
  if (!query) return { regex: null, error: null };
  let source = options.regex ? query : escapeRegExp(query);
  if (options.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  try {
    return { regex: new RegExp(source, `gu${options.caseSensitive ? "" : "i"}`), error: null };
  } catch (error) {
    return {
      regex: null,
      error: `That pattern is not valid: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Ranges of every island in the text, in order, with the island's bytes. */
export function protectedRanges(text: string): Array<[number, number, string]> {
  return listIslands(tokenizeSource(text)).map((island) => [island.start, island.end, island.raw]);
}

export function findMatches(text: string, query: string, options: FindOptions = {}): FindResult {
  const { regex, error } = buildFindRegex(query, options);
  if (!regex) return { matches: [], skippedProtected: 0, error };
  const ranges = protectedRanges(text);
  const matches: FindMatch[] = [];
  let skippedProtected = 0;
  let rangeIndex = 0;
  for (const match of text.matchAll(regex)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (end === start) continue;
    while (rangeIndex < ranges.length && (ranges[rangeIndex]?.[1] ?? 0) <= start) rangeIndex += 1;
    const range = ranges[rangeIndex];
    const inProtected = Boolean(range && range[0] < end && range[1] > start);
    if (inProtected && !options.includeProtected) {
      skippedProtected += 1;
      continue;
    }
    matches.push({ start, end, inProtected, islandRaw: inProtected && range ? range[2] : null });
    if (matches.length >= MAX_MATCHES) break;
  }
  return { matches, skippedProtected, error: null };
}

/** The replacement text for one match (`$1` groups work in regex mode). */
export function replacementFor(
  matched: string,
  query: string,
  replacement: string,
  options: FindOptions = {},
): string {
  if (!options.regex) return replacement;
  const { regex } = buildFindRegex(query, options);
  if (!regex) return replacement;
  return matched.replace(new RegExp(regex.source, regex.flags.replace("g", "")), replacement);
}

/** Apply a replacement to the given matches (non-overlapping, in order). */
export function replaceMatches(
  text: string,
  matches: readonly FindMatch[],
  query: string,
  replacement: string,
  options: FindOptions = {},
): string {
  let out = "";
  let cursor = 0;
  for (const match of matches) {
    out += text.slice(cursor, match.start);
    out += replacementFor(text.slice(match.start, match.end), query, replacement, options);
    cursor = match.end;
  }
  return out + text.slice(cursor);
}
