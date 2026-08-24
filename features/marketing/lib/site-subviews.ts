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
 *   • the site header (renders the ACTIVE section's sub-views). 3-7 is the
 *     range where `RouteModeNav` reaches its icon+label variant; the budget
 *     and the one section over it are `MARKETING_SUBNAV_CEILING` below.
 *     EVERY sub-view needs an icon in `site-subview-icons.ts` — `RouteModeNav`
 *     skips its compact `icons` stage unless all of them have one, so a single
 *     omission drops the whole set to one dropdown.
 *   • the marketing sidebar (counts and reaches them)
 *   • `site-subviews.test.ts` (the completeness guard — a sub-view that exists
 *     in a component and not here, or here and not there, fails the build)
 */

export interface MarketingSubView {
  /** URL identity: a `?view=` value or path segment. */
  id: string;
  label: string;
  /**
   * ONE LINE ANSWERING "WHAT DO I DO HERE?" — rendered by the site header as a
   * tooltip under the label, and as the subtitle in its dropdown / bottom
   * sheet. Ruled 2026-08-24 after Arman: *"there are so many different UIs, and
   * they're not labeled properly… I need to know where to go."*
   *
   * Write it in the user's words, in the ratified vocabulary, and say what the
   * person DOES — never what the surface is made of. A label a person has to
   * already understand ("Workbench", "Rulebook", "Dimensions") is exactly the
   * case this field exists for.
   */
  purpose?: string;
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
  // A saved SET of buyer questions, asked on a cadence (seo.ai_visibility_panel).
  // Overview answers "what did an assistant say when I asked just now";
  // Panels answers "are we showing up over time, and is that getting better".
  // A different question, a different table, and its own recurring spend — so a
  // sub-view, not a filter over the one-off runs.
  { id: "panels", label: "Panels" },
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
    // 🚨 THE KEYWORD FRONT DOOR. `start` is FIRST, so the bare
    // `…/sites/[siteId]/keywords` URL is the map of the whole keyword system —
    // every screen that gives keywords meaning, each as a door with a sentence
    // saying what you do there. It exists because eight surfaces spread over
    // two sections had grown labels only their builder could read (Arman,
    // 2026-08-24: *"it's really hard to know what happens where and what I
    // should be doing… I need to know where to go."*). Anything reachable in
    // this family MUST appear on it — see `KeywordStartHere.tsx`.
    //
    // C14 — the WORKBENCH is where a person gives keywords meaning: find
    // exactly the ones you mean, assign a value with a reason, keep the
    // arrangement as a tab. `classification` is NOT redundant with it and did
    // not fold in C18: it uniquely owns the class MATCHERS (patterns), the
    // brand names, the business guidelines every AI run reads, CSV
    // import/export and the batch AI classifier. So it keeps its route and
    // wears a label that says which of those jobs it does.
    section: "keywords",
    views: [
      {
        id: "start",
        label: "Start here",
        purpose: "Every keyword screen, and what you do on each one.",
      },
      {
        id: "performance",
        label: "Performance",
        purpose: "What people searched, what they clicked, where you rank.",
      },
      {
        id: "workbench",
        label: "Workbench",
        purpose:
          "Say what a keyword IS — set its class or any dimension, with your reason.",
      },
      {
        id: "classification",
        label: "Teach classes",
        purpose:
          "Teach the system to class keywords itself: patterns, brand names, your guidelines, AI.",
      },
    ],
  },
  {
    // THE KEYWORD VALUE FAMILY. Five real routes, one job each, and before
    // 2026-08-22 no navigation between them at all: each was linked ad hoc
    // from whatever happened to be built at the time, which is precisely how
    // Arman ended up unable to find his own features ("in each UI, it says
    // though there's something different. And I just can't seem to figure out
    // what's missing"). They are sub-views, not filters — each changes what
    // the page IS, reads different tables, and writes through different RPCs.
    //
    // `workbench` is first, so it renders at the bare `/value` URL. Its LABEL
    // is "Scores" — 2026-08-24: two sections each carried a tab called
    // "Workbench", which is the single worst piece of the navigation confusion
    // Arman reported. The id stays `workbench` because it is URL state and
    // every share link and saved bookmark means it; only the word a human
    // reads changed. The Keyword Workbench keeps the name "Workbench".
    section: "value",
    views: [
      {
        id: "workbench",
        label: "Scores",
        purpose:
          "What every keyword is worth here, why, and the rulings you made yourself.",
      },
      {
        id: "dimensions",
        label: "Dimensions",
        purpose: "The ways you look at keywords, and the answers each allows.",
      },
      {
        id: "rules",
        label: "Rulebook",
        purpose: "What earns points and how much — matchers, worth and levels.",
      },
      {
        id: "topics",
        label: "Topics",
        purpose: "Group keywords into your services, and set what each is worth.",
      },
      {
        id: "packs",
        label: "Industry packs",
        purpose: "Start from your industry's defaults instead of a blank page.",
      },
      {
        id: "discovery",
        label: "Discovery",
        purpose:
          "AI reads your site cold and proposes your business model, customers, Offerings and their worth — you rule each step.",
      },
    ],
    hrefStyle: "path",
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
 * THE HEADER CEILING — how many sub-views one section may hand the site header.
 *
 * `RouteModeNav` degrades full (icon + label) → icons → one dropdown by MEASURED
 * width, so this is a design budget, not a hard limit: a section that grows past
 * it is a signal to SPLIT the section, never to let the header degrade again.
 * That degradation is the failure the whole 2026-08-14 rework existed to remove.
 *
 * Declared HERE, beside the registry, because it was previously restated as a
 * literal in two separate test files — `site-subviews.test.ts` carried the
 * maintained ceiling and its whole audit trail while `site-subnav.test.ts` still
 * asserted the original 7, so the two drifted for two days and the second one
 * read as a regression in the header rather than as the debt it records.
 *
 * 🚨 `backlinks` is a DEBT MARKER, not a budget. It reached ten (Prospects, then
 * Link changes, then Coverage) and is now two sections' worth of surface wearing
 * one name. The split is Arman's open decision in
 * `common-docs/projects/outreach-system/wp2-backlinks-nav-options.md`
 * (recommendation: split Backlinks / Outreach prospecting, which also rehouses
 * Coverage). Nothing new may join backlinks until that lands, and no other
 * section may pass `MARKETING_SUBNAV_CEILING`.
 */
export const MARKETING_SUBNAV_CEILING = 9;

export const MARKETING_SUBNAV_SECTION_DEBT: Readonly<Record<string, number>> = {
  backlinks: 10,
};

/** The ceiling that applies to one section, debt included. */
export function marketingSubNavCeiling(section: string): number {
  return MARKETING_SUBNAV_SECTION_DEBT[section] ?? MARKETING_SUBNAV_CEILING;
}

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
