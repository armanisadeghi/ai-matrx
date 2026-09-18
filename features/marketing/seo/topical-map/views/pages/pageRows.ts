// features/marketing/seo/topical-map/views/pages/pageRows.ts
//
// The pages workspace's CLIENT-SIDE narrowing, kept pure so it can be tested
// against the bytes `seo.list_page_intents` actually returns.
//
// 🚨 THE DIVISION OF LABOUR, AND WHY IT IS STATED OUT LOUD ON THE SCREEN.
// `seo.list_page_intents` narrows by site, topic slug, disposition and state —
// those four are SERVER filters and they narrow the whole result set. Nothing
// else does. Text, traffic and source are narrowed HERE, over the one page of
// rows the read returned, which means they answer a smaller question than they
// look like they answer: "of the 200 loaded, these match". The table says so in
// its header whenever one of them is on (see `narrowingSentence`), because a
// filter that silently searches one page of a 4,000-page site is the confident
// lie this file exists to prevent.
//
// ABSENT IS NOT ZERO. `PageIntentPageRef` extends `PagePerformance`, so its
// type says `clicks` is always a number — but the server strips a key rather
// than sending null, and a `web_page` pointer the caller cannot open carries no
// traffic at all. So `pageTrafficNumbers` checks the key at RUNTIME instead of
// trusting the type, and a row with no reading matches NEITHER traffic filter:
// it is not low-traffic and it is not trafficked, it is unmeasured. `clicks: 0`
// is a real zero and matches `low` (with the default knob) like any other
// number would.

import type { MapPageFilters } from "../../redux/types";
import type { PageIntentItem } from "../../types";

/**
 * The page's traffic reading, or null when the row carries none.
 *
 * The `in` test is deliberate and is NOT redundant with the type: see the
 * header. A reader that does `item.page.clicks ?? 0` prints a confident "0
 * clicks" for a page nobody measured.
 */
export function pageTrafficNumbers(
  item: PageIntentItem,
): { clicks: number; impressions: number } | null {
  const page = item.page;
  if (!("clicks" in page) || typeof page.clicks !== "number") return null;
  return {
    clicks: page.clicks,
    // A row carrying clicks but no impressions is not a zero either; it is the
    // same absence, reported on the column that owns it.
    impressions: typeof page.impressions === "number" ? page.impressions : Number.NaN,
  };
}

/** True when the row carries an impressions reading. */
export function hasImpressions(item: PageIntentItem): boolean {
  const page = item.page;
  return "impressions" in page && typeof page.impressions === "number";
}

/** Which filters this file — not the server — applies. */
export const CLIENT_SIDE_PAGE_FILTER_KEYS = ["text", "traffic", "source"] as const;

/** True when any narrowing this file performs is switched on. */
export function hasClientSideNarrowing(filters: MapPageFilters): boolean {
  return filters.text.trim() !== "" || filters.traffic !== "all" || filters.source !== null;
}

/** True when ANY filter — server or client — is narrowing the list. */
export function hasAnyPageFilter(filters: MapPageFilters): boolean {
  return (
    hasClientSideNarrowing(filters) ||
    filters.topicSlug !== null ||
    filters.disposition !== null ||
    filters.state !== null ||
    filters.regionSlug !== null
  );
}

function matchesText(item: PageIntentItem, needle: string): boolean {
  const haystack = `${item.page.url ?? ""} ${item.page.label ?? ""}`.toLowerCase();
  return haystack.includes(needle);
}

function matchesTraffic(
  item: PageIntentItem,
  traffic: MapPageFilters["traffic"],
  lowTrafficClicksMax: number,
): boolean {
  if (traffic === "all") return true;
  const numbers = pageTrafficNumbers(item);
  // Unmeasured matches neither side. The filter bar says this in words so the
  // person is not left wondering where a row went.
  if (numbers === null) return false;
  return traffic === "low"
    ? numbers.clicks <= lowTrafficClicksMax
    : numbers.clicks > lowTrafficClicksMax;
}

export interface NarrowedPageRows {
  /** The rows that survived, in the order the server returned them. */
  rows: readonly PageIntentItem[];
  /** How many rows the read returned into this page, before narrowing. */
  loaded: number;
  /** True when at least one client-side filter is on. */
  narrowed: boolean;
  /** How many loaded rows this narrowing removed. */
  hidden: number;
}

/**
 * Narrows ONE LOADED PAGE of `seo.list_page_intents` rows by the filters the
 * server does not take. Pure: no store, no hooks, no knob reader — the caller
 * passes `pages_low_traffic_clicks_max` in.
 */
export function narrowPageRows(
  items: readonly PageIntentItem[],
  filters: MapPageFilters,
  lowTrafficClicksMax: number,
): NarrowedPageRows {
  const narrowed = hasClientSideNarrowing(filters);
  if (!narrowed) {
    return { rows: items, loaded: items.length, narrowed: false, hidden: 0 };
  }
  const needle = filters.text.trim().toLowerCase();
  const rows = items.filter((item) => {
    if (needle !== "" && !matchesText(item, needle)) return false;
    if (!matchesTraffic(item, filters.traffic, lowTrafficClicksMax)) return false;
    if (filters.source !== null && item.intent?.source !== filters.source) return false;
    return true;
  });
  return { rows, loaded: items.length, narrowed: true, hidden: items.length - rows.length };
}

/**
 * The sentence the table header carries while a client-side filter is on.
 *
 * It names BOTH numbers on purpose: the person is looking at a subset of a
 * subset, and the only honest way to say that is to say which page they are
 * standing on and how big the whole answer is.
 */
export function narrowingSentence(narrowedCount: number, loaded: number, total: number): string {
  return (
    `Narrowed to ${narrowedCount} within the ${loaded} loaded of ${total} — ` +
    "page through to see the rest."
  );
}

/**
 * The counts the progress strip reports over the LOADED rows. Absent is not
 * zero here either: a row with no intent is counted in neither bucket and
 * `withIntent` says how many rows had one at all.
 */
export interface LoadedIntentProgress {
  proposed: number;
  accepted: number;
  done: number;
  withIntent: number;
  loaded: number;
}

export function loadedIntentProgress(
  items: readonly PageIntentItem[],
): LoadedIntentProgress {
  let proposed = 0;
  let accepted = 0;
  let done = 0;
  let withIntent = 0;
  for (const item of items) {
    if (!item.intent) continue;
    withIntent += 1;
    if (item.intent.state === "proposed") proposed += 1;
    else if (item.intent.state === "accepted") accepted += 1;
    else if (item.intent.state === "done") done += 1;
  }
  return { proposed, accepted, done, withIntent, loaded: items.length };
}

/** The `proposed` rows of the loaded page — what the review deck reviews. */
export function proposedIntentRows(
  items: readonly PageIntentItem[],
): readonly PageIntentItem[] {
  return items.filter((item) => item.intent?.state === "proposed");
}
