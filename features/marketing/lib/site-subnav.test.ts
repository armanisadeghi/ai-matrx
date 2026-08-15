import { MARKETING_SITE_SECTIONS } from "./route-sections";
import { MARKETING_SITE_SUBVIEWS } from "./site-subviews";
import { marketingSubViewIcon } from "./site-subview-icons";
import {
  buildMarketingSubNav,
  resolveMarketingSubView,
} from "./useMarketingSubView";

const SITE = "/marketing/brands/brand-1/sites/site-1";

const navFor = (pathname: string, view: string | null = null) =>
  buildMarketingSubNav(SITE, pathname, view);

describe("what the site header renders", () => {
  /**
   * THE POINT OF THE WHOLE REWORK. The header used to be handed all 26
   * sections, which no width fits — RouteModeNav degraded them to bare icons,
   * or on a narrow window to one 26-row dropdown. It now shows one level down.
   */
  it("never shows more than seven items on any site page", () => {
    for (const section of MARKETING_SITE_SECTIONS) {
      const pathname = section.slug ? `${SITE}/${section.slug}` : SITE;
      expect(navFor(pathname).modes.length).toBeLessThanOrEqual(7);
    }
  });

  it("shows the active section's sub-views, not the sections", () => {
    const backlinks = navFor(`${SITE}/backlinks`);
    expect(backlinks.section).toBe("backlinks");
    expect(backlinks.modes.map((mode) => mode.name)).toEqual([
      "Overview",
      "Backlinks",
      "Referring domains",
      "Anchors",
      "Top pages",
      "Competitors",
      "Insights",
    ]);
  });

  it("shows nothing for a section that has no sub-views", () => {
    // Single-surface sections correctly leave the header centre empty.
    // correct — the page's own title says where you are.
    expect(navFor(`${SITE}/audit`).modes).toEqual([]);
    expect(navFor(SITE).modes).toEqual([]);
  });

  it("gives every rendered item an icon", () => {
    // RouteModeNav only reaches its compact icon variant when EVERY item has
    // one; a single missing icon drops the whole set to a dropdown.
    for (const section of MARKETING_SITE_SECTIONS) {
      const pathname = section.slug ? `${SITE}/${section.slug}` : SITE;
      for (const mode of navFor(pathname).modes) {
        expect(mode.icon).toBeDefined();
      }
    }
  });

  it("points the default view at the bare section URL", () => {
    const media = navFor(`${SITE}/media`);
    expect(media.modes[0]?.href).toBe(`${SITE}/media`);
    expect(media.modes[2]?.href).toBe(`${SITE}/media?view=library`);
    expect(media.activeHref).toBe(`${SITE}/media`);
  });

  it("marks the active item from the query string", () => {
    // Sub-views differ only by query string, so the header cannot resolve this
    // from the pathname — this is what `activeModeHref` exists for.
    expect(navFor(`${SITE}/media`, "library").activeHref).toBe(
      `${SITE}/media?view=library`,
    );
    expect(navFor(`${SITE}/settings`, "access-public").activeHref).toBe(
      `${SITE}/settings?view=access-public`,
    );
  });

  it("keeps a nested route on its parent section", () => {
    // A page workspace still belongs to Pages; the header must not go blank.
    expect(navFor(`${SITE}/pages/page-1/snapshots`).section).toBe("pages");
  });

  it("renders and activates AI Visibility's path-style sub-routes", () => {
    const overview = navFor(`${SITE}/ai-visibility`);
    expect(overview.modes.map((mode) => mode.name)).toEqual([
      "Overview",
      "Claims",
      "Sources",
      "Decision signals",
      "History",
    ]);
    expect(overview.activeHref).toBe(`${SITE}/ai-visibility`);
    expect(navFor(`${SITE}/ai-visibility/signals`).activeHref).toBe(
      `${SITE}/ai-visibility/signals`,
    );
  });

  it("has migrated every declared section", () => {
    const unmigrated = MARKETING_SITE_SUBVIEWS.filter((entry) => {
      const pathname = entry.section ? `${SITE}/${entry.section}` : SITE;
      return navFor(pathname).modes.length === 0;
    }).map((entry) => entry.section);
    expect(unmigrated).toEqual([]);
  });
});

describe("resolveMarketingSubView", () => {
  it("falls back to the section's default", () => {
    expect(resolveMarketingSubView("media", null)).toBe("crawled");
    expect(resolveMarketingSubView("media", "nonsense")).toBe("crawled");
    expect(resolveMarketingSubView("settings", null)).toBe("site");
  });

  it("accepts a declared view", () => {
    expect(resolveMarketingSubView("settings", "access-organizations")).toBe(
      "access-organizations",
    );
  });

  it("refuses another section's view id", () => {
    // `?view=anchors` on Settings is not Settings's business.
    expect(resolveMarketingSubView("settings", "anchors")).toBe("site");
  });
});

describe("sub-view icons", () => {
  it("covers every declared sub-view", () => {
    for (const entry of MARKETING_SITE_SUBVIEWS) {
      for (const view of entry.views) {
        expect(marketingSubViewIcon(entry.section, view.id)).toBeDefined();
      }
    }
  });
});
