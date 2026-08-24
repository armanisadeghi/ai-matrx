import { MARKETING_SITE_SECTIONS } from "./route-sections";
import {
  MARKETING_SITE_SUBVIEWS,
  MARKETING_SUBNAV_SECTION_DEBT,
  countMarketingSiteDestinations,
  defaultMarketingSubView,
  isMarketingSubView,
  listMarketingSubViews,
  marketingSubNavCeiling,
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
    // The budget, the backlinks debt, and the whole audit trail of how it got
    // to ten now live beside the registry in `site-subviews.ts`. They used to
    // be a literal here AND a different literal in `site-subnav.test.ts`, and
    // the two drifted the moment the ceiling moved.
    for (const entry of MARKETING_SITE_SUBVIEWS) {
      expect(entry.views.length).toBeLessThanOrEqual(
        marketingSubNavCeiling(entry.section),
      );
    }
  });

  it("keeps the backlinks debt from spreading", () => {
    // The debt is backlinks ALONE and it is frozen until Arman's split lands.
    // A second entry here means someone normalised a breach instead of
    // recording it — which is exactly how the tenth slot shipped silently.
    expect(Object.keys(MARKETING_SUBNAV_SECTION_DEBT)).toEqual(["backlinks"]);
    expect(MARKETING_SUBNAV_SECTION_DEBT.backlinks).toBe(10);
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
    //
    // 2026-08-15 — `backlinks:changes` added (Link changes: what happened to
    // the links we already have, from `seo.backlink_change_event`). Nothing
    // moved or went dark. 40 + 1 = 41, 61 + 1 = 62.
    //
    // 2026-08-16 — TWO added, both WP4, neither having moved or darkened
    // anything: `backlinks:coverage` (who wrote about this brand,
    // `seo.coverage_mention` — added a day earlier and never counted here, so
    // this suite was already red) and `ai-visibility:panels` (a saved prompt
    // set asked on a cadence, `seo.ai_visibility_panel`). 41 + 2 = 43,
    // 62 + 2 + the keyword-value section = 65.
    //
    // 2026-08-22 — the KEYWORD VALUE family declared its five sub-views
    // (workbench, dimensions, rules, topics, packs). Nothing moved and nothing
    // went dark: all five routes already existed and were already live, they
    // simply had no declared navigation between them, so the site header could
    // not render them and a user could not find four of the five. The bake-off
    // variants /value/a /b /c /d are redirects to the workbench, not
    // destinations. 43 + 5 = 48, 65 + 5 = 70.
    //
    // 2026-08-24 — the KEYWORD FRONT DOOR (`keywords:start`) joined, and it is
    // FIRST, so the bare `…/keywords` URL renders the map of the keyword family
    // instead of the Performance table. It exists because eight surfaces over
    // two sections had labels only their builder could read (Arman: "I need to
    // know where to go").
    //
    // ⚠️ The counts were ALREADY one behind when this line was touched: the
    // registry held 49 views against an expected 48, so a sub-view had joined
    // in an earlier commit without its count. Corrected to the measured truth
    // here (49 + the front door = 50, and 22 + 50 = 72) rather than left red.
    //
    // 2026-08-24 — the value family gained `discovery` (the Business
    // Discovery Ladder, register KI-040): AI reads the site cold, the human
    // rules each rung. 50 + 1 = 51, 72 + 1 = 73.
    //
    // 2026-08-25 — KI-036: `keywords:classification` ("Teach classes") folded
    // into the Workbench and was deleted; the business-guidelines editor it
    // uniquely owned got its own door, `value:guidelines`. One out, one in —
    // 51 stays 51, 73 stays 73.
    expect(MARKETING_SITE_SECTIONS.length).toBe(22);
    expect(
      MARKETING_SITE_SUBVIEWS.reduce(
        (total, entry) => total + entry.views.length,
        0,
      ),
    ).toBe(51);
    expect(countMarketingSiteDestinations(MARKETING_SITE_SECTIONS.length)).toBe(
      73,
    );
  });
});
