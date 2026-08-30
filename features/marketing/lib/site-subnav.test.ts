import { MARKETING_SITE_SECTIONS } from "./route-sections";
import {
  MARKETING_SITE_SUBVIEWS,
  marketingSubNavCeiling,
} from "./site-subviews";
import { marketingSubViewIcon } from "./site-subview-icons";
import {
  buildMarketingSubNav,
  resolveMarketingSubView,
} from "./useMarketingSubView";

// Branch-aware bases (agency-model tree): inventory vs practice.
const W = "/marketing/brand-1/websites/site-1";
const S = "/marketing/brand-1/seo/site-1";
const SEO_SLUGS = new Set([
  "keywords","rankings","search-console","audit","findings","analysis",
  "coverage","performance","changes","backlinks","links","authority",
  "valuation","ai-visibility","growth-loop","automations","capabilities",
]);
const baseFor = (slug: string) => (SEO_SLUGS.has(slug) ? S : W);
const SITE = W;

const navFor = (pathname: string, view: string | null = null) =>
  buildMarketingSubNav(SITE, pathname, view);
const seoNavFor = (pathname: string, view: string | null = null) =>
  buildMarketingSubNav(S, pathname, view);

describe("what the site header renders", () => {
  /**
   * THE POINT OF THE WHOLE REWORK. The header used to be handed all 26
   * sections, which no width fits — RouteModeNav degraded them to bare icons,
   * or on a narrow window to one 26-row dropdown. It now shows one level down.
   *
   * This asserted a bare `<= 7` until 2026-08-20, restating a number that
   * `site-subviews.test.ts` had already moved to 9 (+ the backlinks debt) with
   * its reasoning. Two literals for one budget is why the drift shipped, so
   * both now read `marketingSubNavCeiling` — the ONE declaration, in
   * `site-subviews.ts`, next to what it constrains.
   */
  it("never shows more items than the header's ceiling allows", () => {
    for (const section of MARKETING_SITE_SECTIONS) {
      const base = baseFor(section.slug);
      const pathname = section.slug ? `${base}/${section.slug}` : base;
      expect(buildMarketingSubNav(base, pathname, null).modes.length).toBeLessThanOrEqual(
        marketingSubNavCeiling(section.slug ?? ""),
      );
    }
  });

  it("shows the active section's sub-views, not the sections", () => {
    const backlinks = seoNavFor(`${S}/backlinks`);
    expect(backlinks.section).toBe("backlinks");
    expect(backlinks.modes.map((mode) => mode.name)).toEqual([
      "Overview",
      "Backlinks",
      "Link changes",
      "Coverage",
      "Referring domains",
      "Anchors",
      "Top pages",
      "Competitors",
      "Prospects",
      "Insights",
    ]);
  });

  it("shows nothing for a section that has no sub-views", () => {
    // Single-surface sections correctly leave the header centre empty.
    // correct — the page's own title says where you are.
    expect(seoNavFor(`${S}/audit`).modes).toEqual([]);
    expect(navFor(SITE).modes).toEqual([]);
  });

  it("gives every rendered item an icon", () => {
    // RouteModeNav only reaches its compact icon variant when EVERY item has
    // one; a single missing icon drops the whole set to a dropdown.
    for (const section of MARKETING_SITE_SECTIONS) {
      const base = baseFor(section.slug);
      const pathname = section.slug ? `${base}/${section.slug}` : base;
      for (const mode of buildMarketingSubNav(base, pathname, null).modes) {
        expect(mode.icon).toBeDefined();
      }
    }
  });

  it("points the default view at the bare section URL", () => {
    const media = navFor(`${SITE}/media`);
    expect(media.modes[0]?.href).toBe(`${SITE}/media`);
    expect(media.modes[2]?.href).toBe(`${SITE}/media?view=standards`);
    expect(media.activeHref).toBe(`${SITE}/media`);
  });

  it("marks the active item from the query string", () => {
    // Sub-views differ only by query string, so the header cannot resolve this
    // from the pathname — this is what `activeModeHref` exists for.
    expect(navFor(`${SITE}/media`, "standards").activeHref).toBe(
      `${SITE}/media?view=standards`,
    );
    // `library` left for the brand asset desk on 2026-08-15 — an unknown view
    // resolves to the section default, and the route itself redirects it.
    expect(navFor(`${SITE}/media`, "library").activeHref).toBe(`${SITE}/media`);
    expect(navFor(`${SITE}/settings`, "access-public").activeHref).toBe(
      `${SITE}/settings?view=access-public`,
    );
  });

  it("keeps a nested route on its parent section", () => {
    // A page workspace still belongs to Pages; the header must not go blank.
    expect(navFor(`${SITE}/pages/page-1/snapshots`).section).toBe("pages");
  });

  it("renders and activates AI Visibility's path-style sub-routes", () => {
    const overview = seoNavFor(`${S}/ai-visibility`);
    expect(overview.modes.map((mode) => mode.name)).toEqual([
      "Overview",
      "Claims",
      "Sources",
      "Decision signals",
      "History",
      "Panels",
    ]);
    expect(overview.activeHref).toBe(`${S}/ai-visibility`);
    expect(seoNavFor(`${S}/ai-visibility/signals`).activeHref).toBe(
      `${S}/ai-visibility/signals`,
    );
  });

  it("has migrated every declared section", () => {
    // `value` (a room inside seo keywords) and `reputation` (moved to the
    // brand's Intelligence group) keep sub-view registries but no longer have
    // a section row on either branch — their screens read the registry
    // directly via useMarketingSubView.
    const OFF_BRANCH = new Set(["value", "reputation"]);
    const unmigrated = MARKETING_SITE_SUBVIEWS.filter((entry) => {
      if (OFF_BRANCH.has(entry.section)) return false;
      const base = baseFor(entry.section);
      const pathname = entry.section ? `${base}/${entry.section}` : base;
      return buildMarketingSubNav(base, pathname, null).modes.length === 0;
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
