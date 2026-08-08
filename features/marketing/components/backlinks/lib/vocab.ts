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
      "Every stored backlink with authority, placement, and link attributes.",
  },
  {
    key: "domains",
    label: "Referring domains",
    description: "Which domains link here, and how much they are worth.",
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
      "Curated lenses: strongest links, losses, breakage, and toxic risk.",
  },
] as const;

export type BacklinkTabKey = (typeof BACKLINK_TABS)[number]["key"];

export function isBacklinkTabKey(value: string | null): value is BacklinkTabKey {
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
    label: "Toxic risk",
    description:
      "Links with an elevated spam score (16+), worst first — review for outreach removal or disavow.",
  },
] as const;

export type BacklinkLensKey = (typeof BACKLINK_LENSES)[number]["key"];

export function isBacklinkLensKey(
  value: string | null,
): value is BacklinkLensKey {
  return BACKLINK_LENSES.some((lens) => lens.key === value);
}

/** DataForSEO backlink_spam_score is 0–100. These cut points drive tones + the toxic lens. */
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
  "DataForSEO Rank, 0–1000 (logarithmic). Roughly comparable to DR/DA × 10 — higher is more authoritative.";

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
