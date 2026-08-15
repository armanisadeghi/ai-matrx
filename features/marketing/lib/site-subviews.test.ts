import { MARKETING_SITE_SECTIONS } from "./route-sections";
import {
  MARKETING_SITE_SUBVIEWS,
  countMarketingSiteDestinations,
  defaultMarketingSubView,
  isMarketingSubView,
  listMarketingSubViews,
  marketingSubViewHref,
} from "./site-subviews";

const SITE_PATH = "/marketing/brands/brand-1/sites/site-1";

describe("marketing site sub-view registry", () => {
  it("declares sub-views only for sections that exist", () => {
    const slugs = new Set<string>(
      MARKETING_SITE_SECTIONS.map((section) => section.slug),
    );
    for (const entry of MARKETING_SITE_SUBVIEWS) {
      expect(slugs.has(entry.section)).toBe(true);
    }
  });

  it("declares each section at most once", () => {
    const sections = MARKETING_SITE_SUBVIEWS.map((entry) => entry.section);
    expect(new Set(sections).size).toBe(sections.length);
  });

  it.each(MARKETING_SITE_SUBVIEWS)(
    "gives $section unique view ids and labels",
    (entry) => {
      const ids = entry.views.map((view) => view.id);
      const labels = entry.views.map((view) => view.label);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(labels).size).toBe(labels.length);
      // A section with one sub-view has no sub-navigation to render — it is
      // either a plain section or an incomplete declaration.
      expect(entry.views.length).toBeGreaterThan(1);
    },
  );

  it("keeps every section's sub-navigation inside the header's good range", () => {
    // RouteModeNav renders icon+label only while the items fit. The whole
    // point of moving the 26 sections into the sidebar is that what remains in
    // the header is a set this size. A section that grows past this is a
    // signal to split it, not to let the header degrade again.
    //
    // The ceiling moved 7 → 8 on 2026-08-15 for backlinks only, when Prospects
    // (the site-wide competitor link gap) joined it. Every backlinks sub-view
    // has an icon, so RouteModeNav's measured `icons` variant carries the
    // eighth item rather than collapsing to a dropdown. This is the ceiling,
    // not a new default: a ninth splits the section.
    for (const entry of MARKETING_SITE_SUBVIEWS) {
      expect(entry.views.length).toBeLessThanOrEqual(8);
    }
  });

  it("resolves the default view and omits its param from the href", () => {
    const mediaHref = `${SITE_PATH}/media`;
    expect(defaultMarketingSubView("media")?.id).toBe("crawled");
    expect(marketingSubViewHref(mediaHref, "media", "crawled")).toBe(mediaHref);
    expect(marketingSubViewHref(mediaHref, "media", "standards")).toBe(
      `${mediaHref}?view=standards`,
    );
    // The four moved views are no longer the website's to name — an old
    // `?view=library` URL is handled by the media route's redirect, not here.
    expect(isMarketingSubView("media", "library")).toBe(false);
    expect(isMarketingSubView("media", "generate")).toBe(false);
  });

  it("builds AI Visibility's real sub-routes from its path-style registry", () => {
    const sectionHref = `${SITE_PATH}/ai-visibility`;
    expect(defaultMarketingSubView("ai-visibility")?.id).toBe("overview");
    expect(marketingSubViewHref(sectionHref, "ai-visibility", "overview")).toBe(
      sectionHref,
    );
    expect(marketingSubViewHref(sectionHref, "ai-visibility", "claims")).toBe(
      `${sectionHref}/claims`,
    );
  });

  it("returns an empty list for a section with no sub-views", () => {
    expect(listMarketingSubViews("audit")).toEqual([]);
    expect(defaultMarketingSubView("audit")).toBeUndefined();
    expect(marketingSubViewHref(`${SITE_PATH}/audit`, "audit", "x")).toBe(
      `${SITE_PATH}/audit`,
    );
  });

  it("recognizes only declared views", () => {
    expect(isMarketingSubView("keywords", "classification")).toBe(true);
    expect(isMarketingSubView("keywords", "performance")).toBe(true);
    expect(isMarketingSubView("keywords", "nope")).toBe(false);
    expect(isMarketingSubView("settings", "performance")).toBe(false);
  });

  /**
   * THE NO-LOST-SURFACE GUARD.
   *
   * Every destination inside a website is counted here. Deleting a section or
   * a sub-view without deliberately updating this number fails the suite — which
   * is the entire point: the navigation rebuild moves a lot of surfaces between
   * levels, and a surface that quietly stops being reachable would otherwise
   * look exactly like a surface that was intentionally retired.
   *
   * Changing these numbers is allowed. Changing them WITHOUT saying which
   * surface moved, in the same commit, is not.
   */
  it("accounts for every destination a website has", () => {
    // Discovery moved to the brand cockpit; Capabilities moved to Marketing.
    // Access, Integrations, and Intake folded into Settings without losing a
    // destination: Settings now owns six declared views instead of Access's 3.
    //
    // 2026-08-15 — Media split by level (Arman's ruling). FOUR sub-views left
    // the website for the brand asset desk at
    // `/marketing/brands/[brandId]/assets` (`marketingRoutes.brandAssets`):
    //   media:library   → brand assets ?view=library  (reads web.brand_asset)
    //   media:research  → brand assets ?view=research (reads rs_media by org)
    //   media:sources   → brand assets ?view=sources  (brand portal links)
    //   media:generate  → brand assets ?view=generate (mints web.brand_asset)
    // None went dark: the old `?view=` URLs server-redirect, and the site's
    // Media section carries a door to the library. 43 - 4 = 39, 64 - 4 = 60.
    //
    // 2026-08-15 — `backlinks:prospects` added (the site-wide competitor link
    // gap, the top of the outreach funnel). 39 + 1 = 40, 60 + 1 = 61.
    expect(MARKETING_SITE_SECTIONS.length).toBe(21);
    expect(
      MARKETING_SITE_SUBVIEWS.reduce(
        (total, entry) => total + entry.views.length,
        0,
      ),
    ).toBe(40);
    expect(countMarketingSiteDestinations(MARKETING_SITE_SECTIONS.length)).toBe(
      61,
    );
  });
});
