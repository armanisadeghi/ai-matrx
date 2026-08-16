/**
 * The vocabulary of the SECOND prospecting method — SERP/keyword prospecting
 * ("who already ranks for the searches my topics live in?"). The competitor
 * link gap answers "who links to my competitors"; this answers "who does
 * Google already trust for my subjects". Both converge on the SAME triage +
 * review + CRM-fold path, so this module deliberately owns only what is NEW:
 * the query variants a run can expand each keyword into, and the streamed
 * stage labels. Review statuses, the unmeasured rule, and the Matrx Authority
 * vocabulary are IMPORTED from `./link-gap` — one triage language, never two.
 *
 * PURE module, same reason as `link-gap.ts`: everything here must be testable
 * without a browser.
 */

import type { components } from "@/types/python-generated/api-types";

/** A search-expansion strategy the server can apply to each seed keyword. */
export type SerpQueryVariant = components["schemas"]["QueryVariant"];

/**
 * Every variant the server understands, with the words a non-technical user
 * reads. The label names the OUTCOME; the explanation says what the search
 * actually looks for — never the operator syntax.
 */
export const SERP_QUERY_VARIANTS: ReadonlyArray<{
  value: SerpQueryVariant;
  label: string;
  explanation: string;
}> = [
  {
    value: "keyword",
    label: "Plain search",
    explanation: "The keyword exactly as you typed it — who ranks for it today.",
  },
  {
    value: "advanced_operator",
    label: "Guest-post footprints",
    explanation: 'Pages that say "write for us" — sites that accept guest articles on this topic.',
  },
  {
    value: "resource_page",
    label: "Resource pages",
    explanation: "Curated link lists and resource roundups on this topic — pages built to link out.",
  },
  {
    value: "listicle",
    label: "Best-of lists",
    explanation: '"Best X" and "top X" articles — lists your business could be added to.',
  },
  {
    value: "hot_off_press",
    label: "Fresh coverage",
    explanation: "Pages published in the last 24 hours — journalists and blogs covering this right now.",
  },
];

export function serpVariantLabel(value: string): string {
  return (
    SERP_QUERY_VARIANTS.find((variant) => variant.value === value)?.label ??
    value
  );
}

/** The keyword-entry limits the server enforces (HTTP 400 past them). */
export const SERP_PROSPECTING_MAX_KEYWORDS = 20;

export const MENTION_COUNT_EXPLAINER =
  "How many of your searches this site already ranks in. The more of your topics it shows up for, the more the search engines already trust it on your subject.";

/** "Ranks in 3 of your searches" — the method's primary signal, in words. */
export function mentionCountLabel(mentionCount: number): string {
  return `Ranks in ${mentionCount} of your search${mentionCount === 1 ? "" : "es"}`;
}

/**
 * The stages a prospecting run reports, in the user's words. The run streams
 * the GENERIC collection vocabulary (`seo.authorized`, `seo.normalized`, …)
 * plus its own terminal event; an event kind with no entry here leaves the
 * current stage alone — a run must never go backwards to a blank label
 * because the server added an event we don't know.
 */
export const SERP_PROSPECTING_STAGES: Record<string, string> = {
  "seo.command_run": "Starting the search",
  "seo.authorized": "Checking your account",
  "seo.budget_checked": "Confirming the budget",
  "seo.run_claimed": "Starting the paid search",
  "seo.run_reused": "Reusing an identical recent search",
  "seo.run_reclaimed": "Picking the search back up",
  "seo.cache_hit": "Reusing recent results",
  "seo.credentials_resolved": "Connecting to the search provider",
  "seo.provider_authenticated": "Connecting to the search provider",
  "seo.provider_request_started": "Running your searches",
  "seo.provider_response": "Reading the results",
  "seo.raw_persisted": "Saving the raw evidence",
  "seo.normalized": "Sorting results into sites",
  "seo.observations_persisted": "Saving the sites we found",
  "seo.completed": "Measuring each site's authority",
  "seo.serp_prospecting_completed": "Prospect list ready",
};
