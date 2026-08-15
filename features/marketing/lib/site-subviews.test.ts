import { MARKETING_SITE_SECTIONS } from "./route-sections";
import {
  MARKETING_SITE_SUBVIEWS,
  countMarketingSiteDestinations,
  defaultMarketingSubView,
  isMarketingSubView,
  listMarketingSubViews,
  listUnlinkableMarketingSections,
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
    for (const entry of MARKETING_SITE_SUBVIEWS) {
      expect(entry.views.length).toBeLessThanOrEqual(7);
    }
  });

  it("resolves the default view and omits its param from the href", () => {
    const mediaHref = `${SITE_PATH}/media`;
    expect(defaultMarketingSubView("media")?.id).toBe("crawled");
    expect(marketingSubViewHref(mediaHref, "media", "crawled")).toBe(mediaHref);
    expect(marketingSubViewHref(mediaHref, "media", "library")).toBe(
      `${mediaHref}?view=library`,
    );
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
    expect(listMarketingSubViews("settings")).toEqual([]);
    expect(defaultMarketingSubView("settings")).toBeUndefined();
    expect(marketingSubViewHref(`${SITE_PATH}/settings`, "settings", "x")).toBe(
      `${SITE_PATH}/settings`,
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
    expect(MARKETING_SITE_SECTIONS.length).toBe(26);
    expect(
      MARKETING_SITE_SUBVIEWS.reduce(
        (total, entry) => total + entry.views.length,
        0,
      ),
    ).toBe(40);
    expect(countMarketingSiteDestinations(MARKETING_SITE_SECTIONS.length)).toBe(
      66,
    );
  });

  /**
   * The migration ledger, enforced. Each section listed here still keeps its
   * active sub-view in component state, so the view cannot be linked, shared,
   * restored on reload, or opened by an agent — a dead end under THE DOOR LAW.
   *
   * Migrating one means: consume the registry, move the view into `?view=`,
   * drop `legacyMechanism` + `legacyNotLinkable` from its entry, and remove it
   * from this list. The list only ever shrinks.
   */
  it("has closed every URL-less sub-view", () => {
    // Every section now reads its view from the URL, so each one can be linked,
    // shared, restored on reload, and opened by an agent. This list only ever
    // shrinks — a new entry means a section regressed to component state.
    expect(listUnlinkableMarketingSections()).toEqual([]);
  });

});
