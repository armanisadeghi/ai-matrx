/**
 * Drift guard: every coming-soon surface Marketing declares — agency pillar
 * entries, public tool categories, AND the client-workspace declarations in
 * brand-sections.ts — must have its promise registered in
 * lib/coming-soon/registry.ts, and every marketing-owned registry row must be
 * rendered somewhere in those declarations. `MarketingComingSoon` throws at
 * render for reserved routes, but the public-tool cards never call
 * `announceComingSoon`, so without this test a tools↔registry orphan would be
 * silent.
 */

import {
  MARKETING_PILLARS,
  MARKETING_PUBLIC_TOOL_CATEGORIES,
  MARKETING_PUBLIC_TOOLS,
  listMarketingComingSoon,
} from "./marketing-nav";
import {
  MARKETING_BRAND_SECTIONS,
  MARKETING_BRAND_SUBROUTE_PROMISES,
} from "./brand-sections";
import { COMING_SOON } from "@/lib/coming-soon/registry";

const declaredComingSoonIds = [
  ...[
    ...MARKETING_PILLARS.flatMap((p) => p.entries),
    ...MARKETING_PUBLIC_TOOL_CATEGORIES.flatMap((c) => c.tools),
  ]
    .filter((e) => e.status === "coming-soon")
    .map((e) => e.comingSoonId),
  ...MARKETING_BRAND_SECTIONS.filter(
    (s) => "status" in s && s.status === "coming-soon",
  ).map((s) => ("comingSoonId" in s ? s.comingSoonId : undefined)),
  ...MARKETING_BRAND_SUBROUTE_PROMISES.map((p) => p.comingSoonId),
];

describe("marketing declarations ↔ coming-soon registry", () => {
  it("every coming-soon declaration carries a comingSoonId", () => {
    expect(declaredComingSoonIds.every(Boolean)).toBe(true);
  });

  it("every declared comingSoonId exists in the registry", () => {
    for (const id of declaredComingSoonIds) {
      expect(COMING_SOON[id as string]).toBeDefined();
    }
  });

  /**
   * Not every marketing promise is a reserved ROUTE. Some are in-page actions
   * that will land inside a surface that already exists, so they have a
   * registry row (the user sees them) but no nav entry (there is no URL to
   * reserve). Those are listed here explicitly rather than loosening the
   * check — an unlisted orphan is still a real drift failure.
   */
  const NON_ROUTE_PROMISES = new Set([
    // Lives on the existing site media view, not at a URL of its own.
    "marketing.generate-video",
    // The email/monitoring front doors shipped; what is still promised is the
    // unbuilt REMAINDER inside each live page, printed where it belongs.
    "marketing.email.opt-in-campaigns",
    "marketing.monitoring.alerts",
  ]);

  it("every route-backed marketing registry row is declared somewhere", () => {
    const declared = new Set(declaredComingSoonIds);
    const orphans = Object.values(COMING_SOON)
      .filter((e) => e.owner === "marketing")
      .filter((e) => !declared.has(e.id))
      .filter((e) => !NON_ROUTE_PROMISES.has(e.id));
    expect(orphans.map((e) => e.id)).toEqual([]);
  });

  it("every non-route promise still exists in the registry", () => {
    for (const id of NON_ROUTE_PROMISES) {
      expect(COMING_SOON[id]).toBeDefined();
    }
  });

  it("declared ids are unique", () => {
    expect(new Set(declaredComingSoonIds).size).toBe(
      declaredComingSoonIds.length,
    );
  });

  it("MARKETING_PUBLIC_TOOLS contains only live external analyzers", () => {
    expect(MARKETING_PUBLIC_TOOLS.length).toBeGreaterThan(0);
    for (const tool of MARKETING_PUBLIC_TOOLS) {
      expect(tool.status).toBeUndefined();
      expect(tool.external).toBe(true);
      expect(tool.href.startsWith("/seo/")).toBe(true);
    }
  });

  it("live pillar entries never carry a comingSoonId", () => {
    const bad = listMarketingComingSoon().filter((e) => !e.comingSoonId);
    expect(bad).toEqual([]);
  });
});
