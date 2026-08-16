/**
 * The SECOND level of a website: every sub-view inside a site section.
 *
 * `route-sections.ts` declares the 21 sections (level 1 — real routes). This
 * file declares what lives INSIDE them. Before it existed, twelve sections
 * carried their own sub-navigation built five different ways — Radix `Tabs`,
 * `?view=`, `?tab=`, plain `useState`, and one real sub-route family — so the
 * platform could not answer "what surfaces does a website have?" without
 * reading twelve components.
 *
 * A sub-view is content the section can show INSTEAD of its default: a
 * different query, a different table, a different job. It gets a URL.
 *
 * A FILTER is not a sub-view. `?scope=dismissed` on Pages, `?coverage=` on
 * Pages, and Discovery's pending/confirmed/dismissed all partition ONE list and
 * stay filters. The test: if it changes which rows you see, it is a filter; if
 * it changes what the page IS, it is a sub-view.
 *
 * Consumed by:
 *   • the site header (renders the ACTIVE section's sub-views — 3-7 items, the
 *     range where `RouteModeNav` reaches its icon+label variant)
 *   • the marketing sidebar (counts and reaches them)
 *   • `site-subviews.test.ts` (the completeness guard — a sub-view that exists
 *     in a component and not here, or here and not there, fails the build)
 */

export interface MarketingSubView {
  /** URL identity: a `?view=` value or path segment. */
  id: string;
  label: string;
}

export type MarketingSubViewHrefStyle = "query" | "path";

export interface MarketingSectionSubViews {
  /** A `slug` from `MARKETING_SITE_SECTIONS`. */
  section: string;
  /** In display order. The FIRST entry is the bare section URL. */
  views: readonly MarketingSubView[];
  /** Query params by default; path sections render children as `/[view]`. */
  hrefStyle?: MarketingSubViewHrefStyle;
}

export const AI_VISIBILITY_SUBVIEWS = [
  { id: "overview", label: "Overview" },
  { id: "claims", label: "Claims" },
  { id: "sources", label: "Sources" },
  { id: "signals", label: "Decision signals" },
  { id: "history", label: "History" },
] as const satisfies readonly MarketingSubView[];

export const MARKETING_SITE_SUBVIEWS = [
  {
    section: "structure",
    views: [
      { id: "tree", label: "Tree" },
      { id: "columns", label: "Columns" },
    ],
  },
  {
    // Media is what this WEBSITE's own media is: the images and videos
    // observed on it, and the standards it holds them to. Library, Research,
    // Sources and Generate moved to the brand's asset desk on 2026-08-15 —
    // all four read brand- or org-scoped data, so rendering them here told two
    // sites under one brand they each had their own library when they were
    // editing the same rows. `marketingRoutes.brandAssets` is the door.
    section: "media",
    views: [
      { id: "crawled", label: "Crawled" },
      { id: "videos", label: "Videos" },
      { id: "standards", label: "Standards" },
    ],
  },
  {
    section: "links",
    views: [
      { id: "graph", label: "Graph" },
      { id: "external", label: "External" },
      { id: "plan", label: "Plan" },
      { id: "table", label: "Table" },
    ],
  },
  {
    section: "authority",
    views: [
      { id: "map", label: "Map" },
      { id: "routes", label: "Routes" },
      { id: "evidence", label: "Evidence" },
    ],
  },
  {
    section: "backlinks",
    views: [
      { id: "overview", label: "Overview" },
      { id: "links", label: "Backlinks" },
      // What HAPPENED to the links we already have (seo.backlink_change_event,
      // written nightly). A different question from the Backlinks table, which
      // shows the links as they stand right now.
      { id: "changes", label: "Link changes" },
      // Who wrote about this brand (seo.coverage_mention, filled every 30 min
      // from the free news index and then verified by our own crawl). A
      // different question again: backlinks are what a site GAVE you, coverage
      // is what the world SAID about you — most of which never links.
      { id: "coverage", label: "Coverage" },
      { id: "domains", label: "Referring domains" },
      { id: "anchors", label: "Anchors" },
      { id: "pages", label: "Top pages" },
      { id: "competitors", label: "Competitors" },
      // The site-wide competitor link gap: the sites that link to confirmed
      // competitors and not to us. A different question, a different table and
      // a paid run of its own — not a filter over the backlinks we already
      // have, which are by definition the links we DID get.
      { id: "prospects", label: "Prospects" },
      { id: "insights", label: "Insights" },
    ],
  },
  {
    // The six tabs BELOW these (Overview, Theories, Implementation, Live
    // results, Assessments, Timeline) belong to ONE selected change set — a
    // third level, and the only one in the site whose parent is a record rather
    // than a section. They deliberately stay in the page and use `?changeTab=`
    // because `?view=` belongs to this tracked/untracked level.
    section: "changes",
    views: [
      { id: "tracked", label: "Tracked" },
      { id: "untracked", label: "Untracked" },
    ],
  },
  {
    section: "reputation",
    views: [
      { id: "brief", label: "Decision brief" },
      { id: "cases", label: "Cases" },
      { id: "publications", label: "Publications" },
      { id: "narratives", label: "Narratives" },
      { id: "evidence", label: "Evidence" },
    ],
  },
  {
    section: "keywords",
    views: [
      { id: "performance", label: "Performance" },
      { id: "classification", label: "Classification" },
    ],
  },
  {
    section: "ai-visibility",
    views: AI_VISIBILITY_SUBVIEWS,
    hrefStyle: "path",
  },
  {
    section: "settings",
    views: [
      { id: "site", label: "Site" },
      { id: "integrations", label: "Integrations" },
      { id: "access-users", label: "User access" },
      { id: "access-organizations", label: "Organization access" },
      { id: "access-public", label: "Public access" },
      { id: "intake", label: "Intake" },
    ],
  },
] as const satisfies readonly MarketingSectionSubViews[];

/**
 * The same registry at its declared width. `as const satisfies` narrows each
 * entry to its literal shape, so an optional field like `hrefStyle` vanishes
 * from the union — reading it needs the interface type, not the inferred one.
 */
const ENTRIES: readonly MarketingSectionSubViews[] = MARKETING_SITE_SUBVIEWS;

/** The sub-views of one section, or an empty list when it has none. */
export function listMarketingSubViews(
  section: string,
): readonly MarketingSubView[] {
  return ENTRIES.find((entry) => entry.section === section)?.views ?? [];
}

/** The view rendered at the bare section URL. */
export function defaultMarketingSubView(
  section: string,
): MarketingSubView | undefined {
  return listMarketingSubViews(section)[0];
}

export function isMarketingSubView(section: string, value: string): boolean {
  return listMarketingSubViews(section).some((view) => view.id === value);
}

export function marketingSubViewHrefStyle(
  section: string,
): MarketingSubViewHrefStyle {
  return (
    ENTRIES.find((entry) => entry.section === section)?.hrefStyle ?? "query"
  );
}

/**
 * The href for a sub-view. Query-style sections use `?view=`; path-style
 * sections use `/[view]`. The default is always the bare section URL.
 */
export function marketingSubViewHref(
  sectionHref: string,
  section: string,
  viewId: string,
): string {
  const first = defaultMarketingSubView(section);
  if (!first || viewId === first.id) return sectionHref;
  return marketingSubViewHrefStyle(section) === "path"
    ? `${sectionHref}/${viewId}`
    : `${sectionHref}?view=${viewId}`;
}

/** Every destination inside a site: one per section, plus one per sub-view. */
export function countMarketingSiteDestinations(sectionCount: number): number {
  return (
    sectionCount +
    ENTRIES.reduce((total, entry) => total + entry.views.length, 0)
  );
}
