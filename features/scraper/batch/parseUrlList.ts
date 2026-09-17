// features/scraper/batch/parseUrlList.ts
//
// THE PASTE READER for the batch scrape surface (2026-09-17).
//
// A non-technical person does not curate a clean list. She copies a column out
// of a spreadsheet, a block out of an email, or a paragraph that happens to
// mention four links. All of those must land as a list of pages we will read,
// and the screen must then say — out loud, before anything runs — exactly what
// it understood: how many it found, how many were the same page twice, and how
// many it had to leave behind at the cap.
//
// Nothing here guesses silently: every number the parser drops is returned so
// the surface can say it in words. Normalisation goes through `normalizeUrl`,
// the ONE scrape-target URL rule the rest of the feature already uses, so a
// link this parser accepts is a link the scrape buttons accept.

import { normalizeUrl } from "@/features/scraper/utils/scraper-floating-helpers";

/**
 * How many pages one batch may carry. A ceiling, not taste: the quick-scrape
 * endpoint takes the whole list in one request and streams one envelope per
 * page, so a runaway paste is a very long single HTTP call rather than a queue.
 * 200 is the reviewed starting value (2026-09-17) and is stated to the person
 * whenever a paste exceeds it.
 */
export const BATCH_URL_CAP = 200;

export interface ParsedUrlList {
  /** Normalised, de-duplicated, capped — exactly what will be scraped. */
  urls: string[];
  /** How many valid links the paste contained, before dedupe and the cap. */
  found: number;
  /** How many were the same page listed more than once. */
  duplicates: number;
  /** How many valid links were left behind because of {@link BATCH_URL_CAP}. */
  overCap: number;
  /**
   * Tokens that plainly MEANT to be links (a scheme, or a `www.` prefix) and
   * could not be read as one. Ordinary prose words are not reported here —
   * they were never an attempt.
   */
  unreadable: string[];
}

export const EMPTY_PARSED_URL_LIST: ParsedUrlList = {
  urls: [],
  found: 0,
  duplicates: 0,
  overCap: 0,
  unreadable: [],
};

/** Separators a pasted list actually arrives with. */
const TOKEN_SPLIT = /[\s,;|]+/;

/**
 * Wrapping punctuation a link picks up in the wild: markdown brackets, angle
 * brackets from mail clients, quotes from a spreadsheet, and the sentence
 * punctuation that follows a link in prose.
 */
function unwrapToken(raw: string): string {
  let token = raw.trim();
  // Leading wrappers.
  token = token.replace(/^[<(["'`\[{]+/, "");
  // Trailing wrappers and sentence punctuation. Done last so a real trailing
  // slash survives: only punctuation that cannot end a URL is stripped.
  token = token.replace(/[>)\]}"'`,;:.!?]+$/, "");
  return token;
}

/** Did this token even try to be a link? */
function looksIntentional(token: string): boolean {
  return /:\/\//.test(token) || /^www\./i.test(token);
}

/**
 * A bare host is accepted (`example.com/page`, `docs.python.org`) but a prose
 * word with a dot in it is not treated as an attempt at all. The shape we
 * require: a label, a dot, a 2–24 letter ending, and no spaces.
 */
const BARE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}(\/|\?|#|:\d|$)/i;

/**
 * Read whatever was pasted into the list of pages we will actually open.
 *
 * Pure and cheap — safe to call on every keystroke.
 */
export function parseUrlList(
  text: string,
  cap: number = BATCH_URL_CAP,
): ParsedUrlList {
  if (!text.trim()) return EMPTY_PARSED_URL_LIST;

  const unreadable: string[] = [];
  const ordered: string[] = [];
  const seen = new Set<string>();
  let found = 0;
  let duplicates = 0;

  for (const rawToken of text.split(TOKEN_SPLIT)) {
    const token = unwrapToken(rawToken);
    if (!token) continue;

    const intentional = looksIntentional(token);
    if (!intentional && !BARE_HOST.test(token)) continue;

    const normalized = normalizeUrl(token);
    if (!normalized) {
      if (intentional && !unreadable.includes(token)) unreadable.push(token);
      continue;
    }

    found += 1;
    // Same page listed twice — case-insensitive on the whole address, because
    // that is how a copied column repeats itself.
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    ordered.push(normalized);
  }

  const urls = ordered.slice(0, cap);
  return {
    urls,
    found,
    duplicates,
    overCap: ordered.length - urls.length,
    unreadable,
  };
}

/**
 * The sentence the screen shows under the box. ONE place, so the count a
 * person reads and the list we send can never disagree.
 *
 * Returns `null` when nothing has been pasted yet — the surface shows its own
 * invitation then, not an empty-state sentence dressed as a result.
 */
export function describeParsedUrlList(
  parsed: ParsedUrlList,
  cap: number = BATCH_URL_CAP,
): string | null {
  if (
    parsed.found === 0 &&
    parsed.unreadable.length === 0 &&
    parsed.urls.length === 0
  ) {
    return null;
  }

  const parts: string[] = [];
  parts.push(
    parsed.urls.length === 1
      ? "1 page ready to read."
      : `${parsed.urls.length} pages ready to read.`,
  );
  if (parsed.duplicates > 0) {
    parts.push(
      parsed.duplicates === 1
        ? "1 was the same page twice, so we kept one copy."
        : `${parsed.duplicates} were the same pages listed more than once, so we kept one copy of each.`,
    );
  }
  if (parsed.overCap > 0) {
    parts.push(
      `${parsed.overCap} more did not fit — one batch reads up to ${cap} pages, so remove some or run the rest afterwards.`,
    );
  }
  if (parsed.unreadable.length > 0) {
    const shown = parsed.unreadable.slice(0, 3).join(", ");
    parts.push(
      parsed.unreadable.length === 1
        ? `We could not read ${shown} as a web address.`
        : `We could not read ${parsed.unreadable.length} of them as web addresses (${shown}${parsed.unreadable.length > 3 ? ", and more" : ""}).`,
    );
  }
  return parts.join(" ");
}
