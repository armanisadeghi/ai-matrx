/**
 * Backlink workspace vocabulary — tabs, views, anchor groups, tones, and every
 * label a human reads on this surface.
 *
 * Follows the GSC vocabulary-as-const-array pattern
 * (features/marketing/search-console/types.ts): every tab/view/group is one
 * entry here; rendering is a `.map()`. Adding a view = one entry + one filter
 * branch in `backlinks-queries.ts`.
 *
 * PLAIN LANGUAGE IS THE CONTRACT. The person reading this page is world-best
 * at something that is very probably not SEO (root CLAUDE.md, THE MISMATCH
 * RULE). Keys are machine values and never change; labels are written for a
 * smart person who has never heard of a dead-letter queue, an enrichment
 * pipeline, or DR. Where an SEO word IS the thing they came for (backlink,
 * anchor text, referring domain, nofollow) we keep it and explain it once,
 * where it is first shown.
 */

import { humanizeAssessmentValue } from "@/features/marketing/components/backlinks/lib/enrichment";

export const BACKLINK_TABS = [
  {
    key: "overview",
    label: "Overview",
    description:
      "How your links are doing overall — totals, growth, and the biggest names.",
  },
  {
    key: "links",
    label: "Backlinks",
    description:
      "Every link we know about, what we found on the page it comes from, and what to do about it.",
  },
  {
    key: "domains",
    label: "Referring domains",
    description:
      "Every website that links to you, what its pages are like, and what we think of it.",
  },
  {
    key: "anchors",
    label: "Anchors",
    description:
      "The words other sites use when they link to you, and whether any one phrase is over-used.",
  },
  {
    key: "pages",
    label: "Top pages",
    description: "Which of your pages earn links.",
  },
  {
    key: "competitors",
    label: "Competitors",
    description:
      "Sites that link to your competitors too — good places to ask for a link of your own.",
  },
  {
    key: "insights",
    label: "Insights",
    description:
      "Ready-made views of your links: the strongest, the lost, the broken, the risky, and the ones worth acting on.",
  },
] as const;

export type BacklinkTabKey = (typeof BACKLINK_TABS)[number]["key"];

export function isBacklinkTabKey(
  value: string | null,
): value is BacklinkTabKey {
  return BACKLINK_TABS.some((tab) => tab.key === value);
}

/**
 * Insight views — each is a server-filtered slice of the backlink table. The
 * filter itself lives in `backlinks-queries.ts#applyBacklinkLens` so the
 * database does the work; a view is never a client-side re-sort. (`lens` is
 * kept as the internal name and the URL key; the user only ever reads
 * "view".)
 */
export const BACKLINK_LENSES = [
  {
    key: "best",
    label: "Strongest links",
    description:
      "Your most valuable live links — the ones worth protecting first.",
  },
  {
    key: "new",
    label: "New links",
    description:
      "Links you picked up since our last check — worth a quick quality look.",
  },
  {
    key: "lost",
    label: "Lost links",
    description:
      "Links that disappeared. These sites linked to you once, so they are the best places to ask again.",
  },
  {
    key: "broken",
    label: "Broken links",
    description:
      "Links pointing at a page of yours that no longer works. Fix the page, or send that address somewhere that does, and the link counts again.",
  },
  {
    key: "toxic",
    label: "Worth a second look",
    description:
      "Links where something about the page gave us pause. Nothing here is judged bad automatically — you decide.",
  },
  {
    key: "actionable",
    label: "Act now",
    description:
      "Links where we found something worth doing now — a fix, a request, or an update.",
  },
  {
    key: "relevant",
    label: "Closest topic match",
    description:
      "The page linking to you covers closely related subjects to the page it links to.",
  },
  {
    key: "controllable",
    label: "You can probably edit",
    description:
      "Listings, profiles, and placements you can most likely change yourself.",
  },
] as const;

export type BacklinkLensKey = (typeof BACKLINK_LENSES)[number]["key"];

export function isBacklinkLensKey(
  value: string | null,
): value is BacklinkLensKey {
  return BACKLINK_LENSES.some((lens) => lens.key === value);
}

/**
 * The three refresh depths. Keys are the API's `profile` values and never
 * change; the labels say what the user GETS, because "bootstrap" and "core"
 * are engineering words that mean nothing to the person paying for this.
 */
export const BACKLINK_REFRESH_PROFILES = [
  {
    key: "weekly",
    label: "Quick check (weekly)",
    description: "Totals and what changed since last time. Fast.",
  },
  {
    key: "monthly",
    label: "Full detail (monthly)",
    description:
      "Every individual link, plus the domain, anchor, page, and competitor breakdowns.",
  },
  {
    key: "bootstrap",
    label: "Complete history (first run)",
    description:
      "Everything above plus the full history we can get. Use this the first time, or after a long gap.",
  },
] as const;

export function backlinkRefreshProfileLabel(value: string): string {
  return (
    BACKLINK_REFRESH_PROFILES.find((profile) => profile.key === value)?.label ??
    value
  );
}

/**
 * THE one empty-state sentence for this whole workspace. Eleven surfaces used
 * to repeat "run a Monthly detail or Full bootstrap refresh" verbatim; when
 * the wording is wrong it was wrong in eleven files. Every empty state calls
 * this, so it is written once and reads the same everywhere.
 */
export function backlinkEmptyHint(what: string): string {
  return `We have not collected ${what} yet. Use Refresh at the top of this page — pick "Full detail" or "Complete history" for the deepest look.`;
}

/** Spam-signal cut points (score is 0–100). Tones only — never a verdict. */
export const SPAM_SCORE_WARN_MIN = 16;
export const SPAM_SCORE_TOXIC_MIN = 46;

/** Shown wherever a spam number renders, so "is high bad?" is never a guess. */
export const SPAM_SCORE_EXPLAINER =
  "Spam signals, 0–100. Higher means more of the patterns search engines associate with junk links — lower is better.";

export type SpamTone = "ok" | "warn" | "toxic";

export function spamTone(score: number | null | undefined): SpamTone | null {
  if (score === null || score === undefined) return null;
  if (score >= SPAM_SCORE_TOXIC_MIN) return "toxic";
  if (score >= SPAM_SCORE_WARN_MIN) return "warn";
  return "ok";
}

/**
 * Authority scale: 0–1000, and it climbs steeply — the difference between 700
 * and 800 is far larger than between 100 and 200. Shown wherever an authority
 * number renders so a three-digit number is never a mystery.
 */
export const RANK_SCALE_EXPLAINER =
  "Scored 0–1000 — higher means more authority, and the top of the scale is much harder to reach than the bottom.";

export const DOMAIN_RANK_EXPLAINER = `How much authority the whole linking website carries. ${RANK_SCALE_EXPLAINER}`;
export const PAGE_RANK_EXPLAINER = `How much authority the exact page carrying the link has. ${RANK_SCALE_EXPLAINER}`;

/** Where on the page the link sits (the data service's `semantic_location`). */
export const LINK_PLACEMENTS = [
  { key: "article", label: "Article" },
  { key: "main", label: "Main content" },
  { key: "section", label: "Section" },
  { key: "header", label: "Header" },
  { key: "aside", label: "Sidebar" },
  { key: "footer", label: "Footer" },
] as const;

export const LINK_TYPES = [
  { key: "anchor", label: "Text link" },
  { key: "image", label: "Image link" },
  { key: "redirect", label: "Redirect" },
  { key: "canonical", label: "Canonical tag" },
  { key: "alternate", label: "Alternate-language tag" },
] as const;

export function linkTypeLabel(value: string | null): string {
  return (
    LINK_TYPES.find((type) => type.key === value)?.label ??
    humanizeAssessmentValue(value)
  );
}

export const BACKLINK_STATES = [
  { key: "active", label: "Active" },
  { key: "new", label: "New" },
  { key: "lost", label: "Lost" },
] as const;

export function backlinkStateLabel(value: string | null): string {
  return (
    BACKLINK_STATES.find((state) => state.key === value)?.label ??
    humanizeAssessmentValue(value)
  );
}

export function linkPlacementLabel(value: string | null): string {
  return (
    LINK_PLACEMENTS.find((placement) => placement.key === value)?.label ??
    humanizeAssessmentValue(value)
  );
}

/**
 * How far we have got with reading and reviewing the page a link comes from.
 * These are pipeline states; the labels are what they MEAN to the user —
 * "dead letter" is a message-queue term and must never reach a screen.
 */
export const BACKLINK_ENRICHMENT_STATUSES = [
  { key: "pending", label: "Not reviewed yet" },
  { key: "capturing", label: "Reading the page" },
  { key: "analyzing", label: "Reviewing it" },
  { key: "completed", label: "Reviewed" },
  { key: "failed", label: "Could not finish" },
  { key: "dead_letter", label: "Gave up — needs help" },
] as const;

export function backlinkReviewStatusLabel(value: string | null): string {
  return (
    BACKLINK_ENRICHMENT_STATUSES.find((status) => status.key === value)
      ?.label ?? humanizeAssessmentValue(value)
  );
}

/** How close the linking page's subject is to the page it links to. */
export const BACKLINK_RELEVANCE_VERDICTS = [
  { key: "strong", label: "Strong match" },
  { key: "moderate", label: "Some match" },
  { key: "weak", label: "Weak match" },
  { key: "irrelevant", label: "Unrelated" },
  { key: "unknown", label: "Not sure" },
] as const;

export function backlinkRelevanceLabel(value: string | null): string {
  return (
    BACKLINK_RELEVANCE_VERDICTS.find((verdict) => verdict.key === value)
      ?.label ?? humanizeAssessmentValue(value)
  );
}

/** What kind of page the link sits on. Keys are the stored `page_type`. */
export const BACKLINK_PAGE_TYPES = [
  { key: "article", label: "Article" },
  { key: "news", label: "News story" },
  { key: "blog", label: "Blog post" },
  { key: "press_release", label: "Press release" },
  { key: "directory", label: "Directory listing" },
  { key: "profile", label: "Profile page" },
  { key: "resource", label: "Resource page" },
  { key: "listicle", label: "List article" },
  { key: "forum", label: "Forum thread" },
  { key: "social", label: "Social post" },
  { key: "ecommerce", label: "Online store" },
  { key: "government", label: "Government site" },
  { key: "academic", label: "School or university" },
  { key: "landing_page", label: "Landing page" },
  { key: "other", label: "Something else" },
  { key: "unknown", label: "Not sure" },
] as const;

export function backlinkPageTypeLabel(value: string | null): string {
  return (
    BACKLINK_PAGE_TYPES.find((pageType) => pageType.key === value)?.label ??
    humanizeAssessmentValue(value)
  );
}

/** Whether the user could change this link themselves if they wanted to. */
export const BACKLINK_CONTROL_LEVELS = [
  { key: "direct", label: "Yes — it's yours to edit" },
  { key: "likely", label: "Probably" },
  { key: "possible", label: "Maybe, with a request" },
  { key: "unlikely", label: "Probably not" },
  { key: "unknown", label: "Not sure" },
] as const;

export function backlinkControlLabel(value: string | null): string {
  return (
    BACKLINK_CONTROL_LEVELS.find((level) => level.key === value)?.label ??
    humanizeAssessmentValue(value)
  );
}

/**
 * What to do about a link. Keys are the stored `recommended_action` values;
 * the labels are the sentence a person would actually say. "Disavow" never
 * appears bare — it is the one action with real consequences, so it reads as
 * a decision to review, not a button that already happened.
 */
export const BACKLINK_RECOMMENDED_ACTIONS = [
  { key: "protect", label: "Keep it safe" },
  { key: "protect_and_monitor", label: "Keep it safe and watch it" },
  { key: "monitor", label: "Just keep an eye on it" },
  { key: "improve_anchor", label: "Improve the wording of the link" },
  { key: "update_listing", label: "Update your listing there" },
  { key: "request_edit", label: "Ask them to change it" },
  { key: "reclaim", label: "Ask for the link back" },
  { key: "fix_target", label: "Fix the page it points to" },
  { key: "remove_request", label: "Ask them to remove it" },
  {
    key: "disavow_review",
    label: "Decide whether to disown this link",
  },
  { key: "investigate", label: "Look into it" },
] as const;

export function backlinkActionLabel(value: string | null): string {
  return (
    BACKLINK_RECOMMENDED_ACTIONS.find((action) => action.key === value)
      ?.label ?? humanizeAssessmentValue(value)
  );
}

/**
 * Whether a link passes SEO credit. This is the user's real question behind
 * the `rel` HTML attribute — an attribute name is never a column header.
 */
export const LINK_CREDIT_EXPLAINER =
  "Whether search engines let this link boost your rankings. Most links do; some are marked so they do not.";

/** Extra `rel` values the data service reports beside follow/nofollow. */
export const LINK_ATTRIBUTE_LABELS: Record<string, string> = {
  sponsored: "Paid placement",
  ugc: "User-posted",
  nofollow: "No credit",
  noopener: "Opens safely",
  noreferrer: "Hides where it came from",
};

export function linkAttributeLabel(value: string): string {
  return LINK_ATTRIBUTE_LABELS[value] ?? humanizeAssessmentValue(value);
}
