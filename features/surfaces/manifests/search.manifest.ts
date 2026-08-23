/**
 * Surface manifest — Matrx Search (`matrx-user/search`).
 *
 * The platform's public search engine at `/search`. A search here produces one
 * `web_search_results` kind instance — a provider-neutral collection carrying
 * an optional direct answer and entity card plus web results, news, video,
 * FAQs, discussions, local places and related searches. Everything the page
 * holds comes from that ONE instance and the query in the URL, which is why
 * this manifest is short: there is no hidden editor state to declare.
 *
 * Curated groups (band 0-899):
 *
 *   search_query    What was asked, and of whom
 *   search_results  The answer, section by section, plus the whole collection
 *
 * Emitter: `features/search/components/SearchWorkspace.tsx` — a
 * `SurfaceRuntimeProvider` whose `getScope` reads the search that is on screen
 * at trigger time, so an agent launched here can never reason about a stale
 * result set.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "search_query",
    label: "The search",
    sortOrder: 100,
    description:
      "What the user asked, which service answered it, and what the provider made of the query.",
  },
  {
    key: "search_results",
    label: "The answer",
    sortOrder: 200,
    description:
      "The returned collection, whole and by section — the same pieces the rest of the platform reads.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── The search ────────────────────────────────────────────────────────
  {
    name: "search_query",
    label: "Search query",
    description:
      "Exactly what the user searched for — the `?q=` value in the URL. Empty on the landing state before any search has run.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 40,
    sortOrder: 100,
    group: "search_query",
  },
  {
    name: "search_provider",
    label: "Search provider",
    description:
      "The search service that answered, as the results themselves report it (e.g. 'brave'). Empty until a search has completed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 110,
    group: "search_query",
  },
  {
    name: "altered_query",
    label: "Provider-corrected query",
    description:
      "The query the provider actually ran when it corrected a spelling. Absent when the query was used as typed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 120,
    group: "search_query",
  },
  {
    name: "search_status",
    label: "Search status",
    description:
      '"idle" before any search, "searching" while one is in flight, "done" when results are on screen, "error" when the search failed. Always populated.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 9,
    sortOrder: 130,
    group: "search_query",
  },

  // ── The answer ────────────────────────────────────────────────────────
  {
    name: "search_results",
    label: "Search results",
    description:
      "The whole `web_search_results` kind instance as returned — answer, entity card, results, news, videos, FAQs, discussions, places and related searches. Absent until a search completes. Large: bind a section below instead when only part of it is needed.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 14000,
    sortOrder: 200,
    group: "search_results",
  },
  {
    name: "ai_answer",
    label: "Direct answer",
    description:
      "The provider's direct answer to the query, when it gave one, with the sources it cited. Absent for queries that returned no answer.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 210,
    group: "search_results",
  },
  {
    name: "entity_card",
    label: "Entity card",
    description:
      "The knowledge card about the person, place, or thing the query named, when the provider recognized one. Absent otherwise.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 220,
    group: "search_results",
  },
  {
    name: "web_results",
    label: "Web results",
    description:
      "The ordered web results — title, url, description, site and date each. Empty array when the search returned none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    sortOrder: 230,
    group: "search_results",
  },
  {
    name: "news_results",
    label: "News results",
    description:
      "News stories with their outlet and publication time. Empty array when the query surfaced no news.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 240,
    group: "search_results",
  },
  {
    name: "video_results",
    label: "Video results",
    description:
      "Videos with channel, duration and thumbnail. Empty array when the query surfaced no video.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 250,
    group: "search_results",
  },
  {
    name: "local_places",
    label: "Local places",
    description:
      "Places the query matched, each with rating, price band, opening hours, postal address and coordinates. Empty array for non-local queries.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    sortOrder: 260,
    group: "search_results",
  },
  {
    name: "faq_items",
    label: "Questions",
    description:
      "Questions people also asked, with the provider's answer for each. Empty array when none were returned.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 270,
    group: "search_results",
  },
  {
    name: "discussions",
    label: "Discussions",
    description:
      "Forum and community threads the query matched, with their site and engagement counts. Empty array when none were returned.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    sortOrder: 280,
    group: "search_results",
  },
  {
    name: "related_searches",
    label: "Related searches",
    description:
      "Follow-up queries the provider suggested. Empty array when it suggested none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    autoContext: false,
    sortOrder: 290,
    group: "search_results",
  },
];

export const searchManifest: SurfaceManifest = {
  surfaceName: "matrx-user/search",
  readiness: "partial",
  readinessNote:
    "Values declared and complete against the live page, emitter wired in SearchWorkspace. Not yet verified: no agent role is bound here, so the non-matching-name binding test has not been run.",
  label: "Matrx Search",
  urlPattern: "/search",
  intro: `<surface_intro>
This is Matrx Search: the user types a question or a topic into one box, and the web comes back as finished pieces rather than a list of links — a direct answer when one exists, a card about the thing they named, local places with hours and ratings, news, video, questions other people asked, and discussions.
The query lives in the URL, so search_query is what the address bar says and every value under The answer describes the single result set on screen right now. search_status tells you whether anything is there yet; when it is not "done" the result values are absent rather than stale.
Read search_results only when the whole collection matters — the section values (ai_answer, entity_card, web_results, local_places, …) are the same data cut to what a question usually needs.
The person here is looking something up in the middle of other work. What helps is a shorter path to the one thing they came for, not a summary of everything on the page.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    // Baseline: `selection` (the user can highlight any result text) and
    // `context`. There is no editor here, so the text_before/text_after triad
    // and `content` would be permanent no-shows.
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createSearchScope(values: {
  // alwaysAvailable: true → required
  search_query: string;
  search_status: "idle" | "searching" | "done" | "error";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: string;
  search_provider?: string;
  altered_query?: string;
  search_results?: Record<string, unknown>;
  ai_answer?: Record<string, unknown>;
  entity_card?: Record<string, unknown>;
  web_results?: Record<string, unknown>[];
  news_results?: Record<string, unknown>[];
  video_results?: Record<string, unknown>[];
  local_places?: Record<string, unknown>[];
  faq_items?: Record<string, unknown>[];
  discussions?: Record<string, unknown>[];
  related_searches?: string[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
