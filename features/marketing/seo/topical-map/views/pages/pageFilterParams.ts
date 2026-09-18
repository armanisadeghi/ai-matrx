// features/marketing/seo/topical-map/views/pages/pageFilterParams.ts
//
// THE PAGES WORKSPACE'S URL FILTER CONTRACT, as a pure function.
//
// A link-in that knows something about WHICH pages the person came to work on
// says so in the query string, and the workspace opens on that answer instead
// of on all 4,000 rows: `?topic=<slug>`, `?disposition=`, `?state=`,
// `?onNoTopic=1` (`?site=` is the route's own, read by `useMapWorkspaceParams`,
// and is not this module's business).
//
// 🚨 AN UNKNOWN VALUE IS NAMED, NEVER SWALLOWED. A URL is typed, pasted, aged
// and edited by hand, so `?state=accpeted` will happen. Ignoring it quietly
// would leave the person reading an unfiltered list they believe is filtered —
// the exact confident lie the rest of this screen exists to prevent. Every
// value that does not exist in the vocabulary comes back in `ignored`, and the
// workspace prints it.
//
// Pure: no store, no hooks, no `useSearchParams`. The caller decides whether
// its host even HAS a URL (only the page host does — a window or canvas would
// otherwise inherit the filters of whatever page is underneath it).

import type { MapPageFilters } from "../../redux/types";
import type {
  PageIntentDisposition,
  PageIntentState,
} from "../../types";

const DISPOSITIONS: readonly PageIntentDisposition[] = [
  "keep",
  "move",
  "merge",
  "redirect",
  "rewrite",
  "delete",
];
const STATES: readonly PageIntentState[] = ["proposed", "accepted", "done"];

/** What a link-in put in the URL, and what could not be honoured. */
export interface PageFilterParams {
  /** Only the keys the URL actually carried — merged over the live filters. */
  filters: Partial<MapPageFilters>;
  /** `key=value` for every parameter that named something that does not exist. */
  ignored: string[];
}

/** `1`, `true` and `yes` mean on; `0`, `false` and `no` mean off. */
function readFlag(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  return null;
}

export function pageFiltersFromSearchParams(
  params: URLSearchParams,
): PageFilterParams {
  const filters: Partial<MapPageFilters> = {};
  const ignored: string[] = [];

  const topic = params.get("topic");
  if (topic !== null) {
    const slug = topic.trim();
    // A slug is checked against the map's own topics by the read, not here —
    // `seo.list_page_intents` answers an unknown slug with an empty list and
    // the screen shows the filter chip, so the person can see what was asked.
    if (slug === "") ignored.push("topic=");
    else filters.topicSlug = slug;
  }

  const disposition = params.get("disposition");
  if (disposition !== null) {
    const value = disposition.trim() as PageIntentDisposition;
    if (DISPOSITIONS.includes(value)) filters.disposition = value;
    else ignored.push(`disposition=${disposition}`);
  }

  const state = params.get("state");
  if (state !== null) {
    const value = state.trim() as PageIntentState;
    if (STATES.includes(value)) filters.state = value;
    else ignored.push(`state=${state}`);
  }

  const onNoTopic = params.get("onNoTopic");
  if (onNoTopic !== null) {
    const flag = readFlag(onNoTopic);
    if (flag === null) ignored.push(`onNoTopic=${onNoTopic}`);
    else filters.onNoTopic = flag;
  }

  return { filters, ignored };
}

/** The sentence the workspace shows when the URL asked for something unreal. */
export function ignoredParamsSentence(ignored: readonly string[]): string {
  return (
    `This link asked for ${ignored.join(" and ")}, which ${ignored.length === 1 ? "is not a value" : "are not values"} ` +
    "this list knows, so it was not applied — the pages below are filtered by everything else in the link."
  );
}
