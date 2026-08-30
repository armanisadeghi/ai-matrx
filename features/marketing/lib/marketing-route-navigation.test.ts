import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listMarketingEntries } from "./marketing-nav";
import { listMarketingBrandSegments } from "./brand-sections";

const MARKETING_APP_ROOT = join(process.cwd(), "app/(core)/marketing");

const INTENTIONALLY_INTERNAL_TOP_LEVEL_ROUTES = new Set([
  // Privileged maintenance destination, reached through administration.
  "/marketing/admin",
]);

/**
 * Pre-restructure addresses kept ONLY as redirect shims (agency-model
 * restructure, 2026-08-28). They exist so old links land; they must never be
 * advertised in nav, and each must actually BE a redirect — a shim that grows
 * a real page again has silently become a second console.
 */
const LEGACY_SHIM_TOP_LEVEL = new Set([
  "ads",
  "ai-visibility",
  "analytics",
  "approvals",
  "audience",
  "automations",
  "backlink-valuation",
  "calendar",
  "capabilities",
  "competitors",
  "connections",
  "content-plan",
  "content-studio",
  "cost",
  "email",
  "initiatives",
  "keyword-intelligence",
  "keyword-research",
  "local",
  "monitoring",
  "outreach",
  "pr",
  "ranks",
  "search-console",
  "sites",
  "social",
]);

function topLevelRouteDirs(): string[] {
  return readdirSync(MARKETING_APP_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) =>
      existsSync(join(MARKETING_APP_ROOT, entry.name, "page.tsx")),
    )
    .map((entry) => entry.name);
}

describe("Marketing top-level navigation inventory", () => {
  it("registers every customer-facing top-level Marketing page", () => {
    const registered = new Set(
      listMarketingEntries().map((entry) => entry.href),
    );
    const missing = topLevelRouteDirs()
      .map((name) => `/marketing/${name}`)
      .filter((route) => !INTENTIONALLY_INTERNAL_TOP_LEVEL_ROUTES.has(route))
      .filter(
        (route) => !LEGACY_SHIM_TOP_LEVEL.has(route.slice("/marketing/".length)),
      )
      // The client workspace's dynamic segment is not a nav destination.
      .filter((route) => !route.includes("["))
      .filter((route) => !registered.has(route));

    expect(missing).toEqual([]);
  });

  it("every listed legacy shim exists and actually redirects", () => {
    for (const name of LEGACY_SHIM_TOP_LEVEL) {
      const pagePath = join(MARKETING_APP_ROOT, name, "page.tsx");
      expect(existsSync(pagePath)).toBe(true);
      const source = readFileSync(pagePath, "utf8");
      expect(
        /permanentRedirect|redirect\(|router\.replace/.test(source),
      ).toBe(true);
    }
  });

  it("does not advertise a Marketing route without a page", () => {
    const missingPages = listMarketingEntries()
      .map((entry) => entry.href)
      .filter((route) => route.startsWith("/marketing/"))
      .filter((route) => !route.includes("?"))
      .filter(
        (route) =>
          !existsSync(
            join(
              MARKETING_APP_ROOT,
              route.slice("/marketing/".length),
              "page.tsx",
            ),
          ),
      );

    expect(missingPages).toEqual([]);
  });

  it("every registered brand-workspace segment exists on disk", () => {
    const brandRoot = join(MARKETING_APP_ROOT, "[brandId]");
    for (const segment of listMarketingBrandSegments()) {
      expect(existsSync(join(brandRoot, segment))).toBe(true);
    }
  });
});
