import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";
import { getMarketingRouteMetadata } from "./route-metadata";
import {
  MARKETING_CRAWL_SECTIONS,
  MARKETING_SEO_SECTIONS,
  MARKETING_WEBSITE_SECTIONS,
  listMarketingCrawlModes,
  listMarketingSeoModeGroups,
  listMarketingSeoModes,
  listMarketingWebsiteModeGroups,
  listMarketingWebsiteModes,
} from "./route-sections";
import { listMarketingBrandSegments } from "./brand-sections";

const WEBSITE_PATH = "/marketing/brand-1/websites/site-1";
const SEO_PATH = "/marketing/brand-1/seo/site-1";

function childRouteDirectories(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    // Dynamic children ([crawlId], the [...rest] cross-branch mappers) are
    // detail/plumbing routes, not sections.
    .filter((entry) => !entry.name.startsWith("["))
    .filter((entry) => existsSync(join(directory, entry.name, "page.tsx")))
    .map((entry) => entry.name)
    .sort();
}

function faviconDataUri(pathname: string): string {
  const icons = getMarketingRouteMetadata(pathname).icons;
  if (
    !icons ||
    typeof icons === "string" ||
    icons instanceof URL ||
    Array.isArray(icons)
  ) {
    return "";
  }
  const icon = icons.icon;
  if (!Array.isArray(icon)) return "";
  const first = icon[0];
  if (typeof first === "string") return first;
  if (first instanceof URL) return first.toString();
  return first ? String(first.url) : "";
}

describe("marketing route section registries (agency-model tree)", () => {
  it("registers every website-inventory route that exists on disk", () => {
    const routeDirectory = resolve(
      process.cwd(),
      "app/(core)/marketing/[brandId]/websites/[siteId]",
    );
    const registered = MARKETING_WEBSITE_SECTIONS.filter(
      (section) => section.slug,
    )
      .map((section) => section.slug)
      .sort();
    expect(registered).toEqual(childRouteDirectories(routeDirectory));
  });

  it("registers every seo-practice route that exists on disk", () => {
    const routeDirectory = resolve(
      process.cwd(),
      "app/(core)/marketing/[brandId]/seo/[siteId]",
    );
    const registered = MARKETING_SEO_SECTIONS.map((section) => section.slug)
      .sort();
    expect(registered).toEqual(childRouteDirectories(routeDirectory));
  });

  it("registers every brand-workspace segment that exists on disk", () => {
    const routeDirectory = resolve(process.cwd(), "app/(core)/marketing/[brandId]");
    const onDisk = readdirSync(routeDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(listMarketingBrandSegments()).toEqual(onDisk);
  });

  it("registers every crawl route that exists on disk", () => {
    const routeDirectory = resolve(
      process.cwd(),
      "app/(core)/marketing/[brandId]/websites/[siteId]/crawls/[crawlId]",
    );
    const registered = MARKETING_CRAWL_SECTIONS.filter((section) => section.slug)
      .map((section) => section.slug)
      .sort();
    expect(registered).toEqual(childRouteDirectories(routeDirectory));
  });

  it("groups every section exactly once, order preserved", () => {
    const websiteGrouped = listMarketingWebsiteModeGroups(WEBSITE_PATH).flatMap(
      (group) => group.modes.map((mode) => mode.slug),
    );
    expect(new Set(websiteGrouped).size).toBe(websiteGrouped.length);
    expect(websiteGrouped.length).toBe(MARKETING_WEBSITE_SECTIONS.length);

    const seoGrouped = listMarketingSeoModeGroups(SEO_PATH).flatMap((group) =>
      group.modes.map((mode) => mode.slug),
    );
    expect(new Set(seoGrouped).size).toBe(seoGrouped.length);
    expect(seoGrouped.length).toBe(MARKETING_SEO_SECTIONS.length);
  });

  it("resolves nested routes to their parent section", () => {
    const websiteModes = listMarketingWebsiteModes(WEBSITE_PATH);
    expect(
      resolveActiveRouteMode(websiteModes, `${WEBSITE_PATH}/pages/abc/snapshots`)
        ?.slug,
    ).toBe("pages");
    expect(resolveActiveRouteMode(websiteModes, WEBSITE_PATH)?.slug).toBe("");

    const seoModes = listMarketingSeoModes(SEO_PATH);
    expect(
      resolveActiveRouteMode(seoModes, `${SEO_PATH}/keywords/value/rules`)?.slug,
    ).toBe("keywords");
    expect(
      resolveActiveRouteMode(seoModes, `${SEO_PATH}/findings/f-1`)?.slug,
    ).toBe("findings");
  });

  it("crawl modes build hrefs from the crawl path", () => {
    const crawlPath = `${WEBSITE_PATH}/crawls/crawl-1`;
    const modes = listMarketingCrawlModes(crawlPath);
    expect(modes[0]?.href).toBe(crawlPath);
    expect(modes.find((mode) => mode.slug === "urls")?.href).toBe(
      `${crawlPath}/urls`,
    );
  });

  it("gives every section a distinct favicon badge within its family", () => {
    const websiteIcons = MARKETING_WEBSITE_SECTIONS.map((section) =>
      faviconDataUri(
        section.slug ? `${WEBSITE_PATH}/${section.slug}` : WEBSITE_PATH,
      ),
    );
    expect(new Set(websiteIcons).size).toBe(websiteIcons.length);

    const seoIcons = MARKETING_SEO_SECTIONS.map((section) =>
      faviconDataUri(`${SEO_PATH}/${section.slug}`),
    );
    expect(new Set(seoIcons).size).toBe(seoIcons.length);
  });
});
