/**
 * Backlink workspace vocabulary — tabs, lenses, anchor classes, tones.
 *
 * Follows the GSC vocabulary-as-const-array pattern
 * (features/marketing/search-console/types.ts): every tab/lens/class is one
 * entry here; rendering is a `.map()`. Adding a lens = one entry + one filter
 * branch in `backlinks-queries.ts`.
 */

export const BACKLINK_TABS = [
  {
    key: "overview",
    label: "Overview",
    description: "Profile health, growth trend, and top movers at a glance.",
  },
  {
    key: "links",
    label: "Backlinks",
    description:
      "Every stable backlink with provider facts, source-page judgment, and a next action.",
  },
  {
    key: "domains",
    label: "Referring domains",
    description:
      "The known-site directory: what links here, what its pages are like, and our opinion.",
  },
  {
    key: "anchors",
    label: "Anchors",
    description:
      "Anchor-text distribution and classification — the over-optimization radar.",
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
      "Domains with overlapping link profiles — your outreach prospect seed.",
  },
  {
    key: "insights",
    label: "Insights",
    description:
      "Curated lenses: strongest links, losses, breakage, relevance, control, actions, and risk review.",
  },
] as const;

export type BacklinkTabKey = (typeof BACKLINK_TABS)[number]["key"];

export function isBacklinkTabKey(
  value: string | null,
): value is BacklinkTabKey {
  return BACKLINK_TABS.some((tab) => tab.key === value);
}

/**
 * Insight lenses — each is a server-filtered slice of the observation table.
 * The filter itself lives in `backlinks-queries.ts#applyBacklinkLens` so the
 * database does the work; a lens is never a client-side re-sort.
 */
export const BACKLINK_LENSES = [
  {
    key: "best",
    label: "Strongest links",
    description:
      "Highest-authority active dofollow links — the equity you must protect.",
  },
  {
    key: "new",
    label: "New links",
    description:
      "Recently gained links — verify quality and celebrate the wins.",
  },
  {
    key: "lost",
    label: "Lost links",
    description:
      "Links that disappeared — prime reclaim-outreach candidates (the site already linked once).",
  },
  {
    key: "broken",
    label: "Broken links",
    description:
      "Links pointing at dead or redirecting targets — fix or 301 to reclaim the equity.",
  },
  {
    key: "toxic",
    label: "Risk review",
    description:
      "Captured links whose content evidence warrants review — never an automatic disavow list.",
  },
  {
    key: "actionable",
    label: "Act now",
    description:
      "High-priority fixes, reclamation, listing updates, and edit requests identified from the source page.",
  },
  {
    key: "relevant",
    label: "Highly relevant",
    description:
      "Source pages whose captured topics strongly align with the page they link to.",
  },
  {
    key: "controllable",
    label: "You may control",
    description:
      "Listings, profiles, and placements with a plausible direct or likely edit path.",
  },
] as const;

export type BacklinkLensKey = (typeof BACKLINK_LENSES)[number]["key"];

export function isBacklinkLensKey(
  value: string | null,
): value is BacklinkLensKey {
  return BACKLINK_LENSES.some((lens) => lens.key === value);
}

/** DataForSEO backlink_spam_score is 0–100. These cut points drive provider-signal tones only. */
export const SPAM_SCORE_WARN_MIN = 16;
export const SPAM_SCORE_TOXIC_MIN = 46;

export type SpamTone = "ok" | "warn" | "toxic";

export function spamTone(score: number | null | undefined): SpamTone | null {
  if (score === null || score === undefined) return null;
  if (score >= SPAM_SCORE_TOXIC_MIN) return "toxic";
  if (score >= SPAM_SCORE_WARN_MIN) return "warn";
  return "ok";
}

/**
 * DataForSEO rank scales (backlinks API): 0–1000, logarithmic — comparable in
 * spirit to Ahrefs DR / Moz DA but on a wider scale. Shown wherever a rank
 * number renders so a three-digit rank is never a mystery again.
 */
export const RANK_SCALE_EXPLAINER =
  "DataForSEO Rank, 0–1000 (logarithmic). Roughly comparable to DR/DA × 10 — higher is more authoritative. A provider value of 0 means not ranked; it is not missing data.";

export const DOMAIN_RANK_EXPLAINER = `Authority of the linking domain. ${RANK_SCALE_EXPLAINER}`;
export const PAGE_RANK_EXPLAINER = `Authority of the exact linking page. ${RANK_SCALE_EXPLAINER}`;

/** Semantic placements DataForSEO reports for a link (`semantic_location`). */
export const LINK_PLACEMENTS = [
  { key: "article", label: "Article" },
  { key: "main", label: "Main content" },
  { key: "section", label: "Section" },
  { key: "header", label: "Header" },
  { key: "aside", label: "Sidebar" },
  { key: "footer", label: "Footer" },
] as const;

export const LINK_TYPES = [
  { key: "anchor", label: "Anchor" },
  { key: "image", label: "Image" },
  { key: "redirect", label: "Redirect" },
  { key: "canonical", label: "Canonical" },
  { key: "alternate", label: "Alternate" },
] as const;

export const BACKLINK_STATES = [
  { key: "active", label: "Active" },
  { key: "new", label: "New" },
  { key: "lost", label: "Lost" },
] as const;

export const BACKLINK_ENRICHMENT_STATUSES = [
  { key: "pending", label: "Pending" },
  { key: "capturing", label: "Capturing" },
  { key: "analyzing", label: "Analyzing" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
  { key: "dead_letter", label: "Dead letter" },
] as const;

export const BACKLINK_RELEVANCE_VERDICTS = [
  { key: "strong", label: "Strong" },
  { key: "moderate", label: "Moderate" },
  { key: "weak", label: "Weak" },
  { key: "irrelevant", label: "Irrelevant" },
  { key: "unknown", label: "Unknown" },
] as const;

export const BACKLINK_PAGE_TYPES = [
  "article",
  "news",
  "blog",
  "press_release",
  "directory",
  "profile",
  "resource",
  "listicle",
  "forum",
  "social",
  "ecommerce",
  "government",
  "academic",
  "landing_page",
  "other",
  "unknown",
] as const;

export const BACKLINK_CONTROL_LEVELS = [
  { key: "direct", label: "Direct" },
  { key: "likely", label: "Likely" },
  { key: "possible", label: "Possible" },
  { key: "unlikely", label: "Unlikely" },
  { key: "unknown", label: "Unknown" },
] as const;

export const BACKLINK_RECOMMENDED_ACTIONS = [
  "protect",
  "protect_and_monitor",
  "monitor",
  "improve_anchor",
  "update_listing",
  "request_edit",
  "reclaim",
  "fix_target",
  "remove_request",
  "disavow_review",
  "investigate",
] as const;
