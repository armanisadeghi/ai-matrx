/**
 * The SECOND level of a website: every sub-view inside a site section.
 *
 * `route-sections.ts` declares the 26 sections (level 1 — real routes). This
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
  /** `?view=` value. The default view omits the param entirely. */
  id: string;
  label: string;
}

/**
 * How a section's sub-views are wired TODAY, while the migration onto `?view=`
 * runs. Delete the field from an entry the moment that section is migrated —
 * when every entry has lost it, delete the field from this interface too.
 */
export type LegacySubViewMechanism =
  | "view-param"
  | "tab-param"
  | "radix-tabs"
  | "local-state"
  | "sub-route";

export interface MarketingSectionSubViews {
  /** A `slug` from `MARKETING_SITE_SECTIONS`. */
  section: string;
  /** In display order. The FIRST entry is the default (no `?view=` param). */
  views: readonly MarketingSubView[];
  legacyMechanism?: LegacySubViewMechanism;
  /**
   * The view is not in the URL today, so it cannot be linked, shared, restored
   * on reload, or reached by an agent — a dead end under THE DOOR LAW. Closing
   * this is part of migrating the section, not a follow-up.
   */
  legacyNotLinkable?: true;
}

export const MARKETING_SITE_SUBVIEWS = [
  {
    section: "structure",
    views: [
      { id: "tree", label: "Tree" },
      { id: "columns", label: "Columns" },
    ],
  },
  {
    section: "media",
    views: [
      { id: "crawled", label: "Crawled" },
      { id: "videos", label: "Videos" },
      { id: "library", label: "Library" },
      { id: "research", label: "Research" },
      { id: "sources", label: "Sources" },
      { id: "generate", label: "Generate" },
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
      { id: "domains", label: "Referring domains" },
      { id: "anchors", label: "Anchors" },
      { id: "pages", label: "Top pages" },
      { id: "competitors", label: "Competitors" },
      { id: "insights", label: "Insights" },
    ],
  },
  {
    // The six tabs BELOW these (Overview, Theories, Implementation, Live
    // results, Assessments, Timeline) belong to ONE selected change set — a
    // third level, and the only one in the site whose parent is a record rather
    // than a section. They deliberately stay in the page. That record is still
    // not linkable (`selectedId` seeds from `?change=` then diverges into local
    // state) — tracked separately, not part of this level.
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
    // The only section that already got this right: real sub-routes at
    // `ai-visibility/[view]`. It ALSO renders the same four as Radix tabs
    // inside the workspace — one of the two must go when this migrates.
    section: "ai-visibility",
    views: [
      { id: "claims", label: "Claims" },
      { id: "sources", label: "Sources" },
      { id: "signals", label: "Decision signals" },
      { id: "history", label: "History" },
    ],
    legacyMechanism: "sub-route",
  },
  {
    section: "access",
    views: [
      { id: "users", label: "Users" },
      { id: "organizations", label: "Organizations" },
      { id: "public", label: "Public" },
    ],
  },
] as const satisfies readonly MarketingSectionSubViews[];

/**
 * The same registry at its declared width. `as const satisfies` narrows each
 * entry to its literal shape, so the optional legacy fields vanish from the
 * union — reading them needs the interface type, not the inferred one.
 */
const ENTRIES: readonly MarketingSectionSubViews[] = MARKETING_SITE_SUBVIEWS;

/** The sub-views of one section, or an empty list when it has none. */
export function listMarketingSubViews(
  section: string,
): readonly MarketingSubView[] {
  return ENTRIES.find((entry) => entry.section === section)?.views ?? [];
}

/**
 * True once a section reads its view from the URL and has dropped its own tab
 * bar — i.e. once the SITE HEADER is allowed to render its sub-views.
 *
 * This is what makes the rollout safe one section at a time: an unmigrated
 * section still draws its own switcher, so the header must stay out of its way
 * or the user sees the same tabs twice. When the last `legacyMechanism` is
 * gone, this function and the field go with it.
 */
export function isMarketingSubNavMigrated(section: string): boolean {
  const entry = ENTRIES.find((item) => item.section === section);
  return !!entry && !entry.legacyMechanism;
}

/** The view rendered when `?view=` is absent. */
export function defaultMarketingSubView(
  section: string,
): MarketingSubView | undefined {
  return listMarketingSubViews(section)[0];
}

export function isMarketingSubView(section: string, value: string): boolean {
  return listMarketingSubViews(section).some((view) => view.id === value);
}

/**
 * The href for a sub-view. The default view omits the param so a section's
 * canonical URL never carries redundant state.
 */
export function marketingSubViewHref(
  sectionHref: string,
  section: string,
  viewId: string,
): string {
  const first = defaultMarketingSubView(section);
  return !first || viewId === first.id
    ? sectionHref
    : `${sectionHref}?view=${viewId}`;
}

/** Every destination inside a site: one per section, plus one per sub-view. */
export function countMarketingSiteDestinations(sectionCount: number): number {
  return (
    sectionCount +
    ENTRIES.reduce((total, entry) => total + entry.views.length, 0)
  );
}

/** Sections whose sub-view still has no URL — the door-law repair list. */
export function listUnlinkableMarketingSections(): readonly string[] {
  return ENTRIES.filter((entry) => entry.legacyNotLinkable).map(
    (entry) => entry.section,
  );
}
