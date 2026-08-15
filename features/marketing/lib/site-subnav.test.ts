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
    // 16 of the 26 are single-surface sections. An empty header centre is
    // correct — the page's own title says where you are.
    expect(navFor(`${SITE}/audit`).modes).toEqual([]);
    expect(navFor(`${SITE}/settings`).modes).toEqual([]);
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
    expect(navFor(`${SITE}/access`, "public").activeHref).toBe(
      `${SITE}/access?view=public`,
    );
  });

  it("keeps a nested route on its parent section", () => {
    // A page workspace still belongs to Pages; the header must not go blank.
    expect(navFor(`${SITE}/pages/page-1/snapshots`).section).toBe("pages");
  });

  /**
   * ai-visibility is the one section still carrying `legacyMechanism`: its
   * views are real sub-routes rather than query params, and it duplicates them
   * as in-page tabs. Until that is resolved the header must stay out of its
   * way, or the user sees the same four tabs twice.
   */
  it("stays silent for a section that still draws its own switcher", () => {
    expect(navFor(`${SITE}/ai-visibility`).modes).toEqual([]);
  });

  it("has migrated every section except that one", () => {
    const unmigrated = MARKETING_SITE_SUBVIEWS.filter((entry) => {
      const pathname = entry.section ? `${SITE}/${entry.section}` : SITE;
      return navFor(pathname).modes.length === 0;
    }).map((entry) => entry.section);
    expect(unmigrated).toEqual(["ai-visibility"]);
  });
});

describe("resolveMarketingSubView", () => {
  it("falls back to the section's default", () => {
    expect(resolveMarketingSubView("media", null)).toBe("crawled");
    expect(resolveMarketingSubView("media", "nonsense")).toBe("crawled");
    expect(resolveMarketingSubView("settings", null)).toBe("");
  });

  it("accepts a declared view", () => {
    expect(resolveMarketingSubView("access", "organizations")).toBe(
      "organizations",
    );
  });

  it("refuses another section's view id", () => {
    // `?view=anchors` on Access is not Access's business.
    expect(resolveMarketingSubView("access", "anchors")).toBe("users");
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
