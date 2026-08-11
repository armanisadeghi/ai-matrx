import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";
import { generateSVGFavicon, svgToDataURI } from "@/utils/favicon-utils";
import { getMarketingRouteMetadata } from "./route-metadata";
import {
  MARKETING_CRAWL_SECTIONS,
  MARKETING_SITE_SECTIONS,
  listMarketingCrawlModes,
  listMarketingSiteModes,
  marketingSiteSectionSuffix,
} from "./route-sections";

const SITE_PATH = "/marketing/brands/brand-1/sites/site-1";

function childRouteDirectories(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
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

describe("marketing route section registries", () => {
  it("registers every site-level route that exists on disk", () => {
    const routeDirectory = resolve(
      process.cwd(),
      "app/(core)/marketing/brands/[brandId]/sites/[siteId]",
    );
    const registered = MARKETING_SITE_SECTIONS.filter((section) => section.slug)
      .map((section) => section.slug)
      .sort();

    expect(registered).toEqual(childRouteDirectories(routeDirectory));
  });

  it("registers every crawl-detail route that exists on disk", () => {
    const routeDirectory = resolve(
      process.cwd(),
      "app/(core)/marketing/brands/[brandId]/sites/[siteId]/crawls/[crawlId]",
    );
    const registered = MARKETING_CRAWL_SECTIONS.filter(
      (section) => section.slug,
    )
      .map((section) => section.slug)
      .sort();

    expect(registered).toEqual(childRouteDirectories(routeDirectory));
  });

  it("gives every site mode a unique route, label, and metadata badge", () => {
    const modes = listMarketingSiteModes(SITE_PATH);
    expect(new Set(modes.map((mode) => mode.href)).size).toBe(modes.length);
    expect(new Set(modes.map((mode) => mode.name)).size).toBe(modes.length);
    expect(new Set(modes.map((mode) => mode.letter)).size).toBe(modes.length);
  });

  it.each(MARKETING_SITE_SECTIONS)(
    "gives the $name route its own UI and browser identity",
    (section) => {
      const pathname = section.slug
        ? `${SITE_PATH}/${section.slug}`
        : SITE_PATH;
      expect(getMarketingRouteMetadata(pathname).title).toBe(
        `${section.titlePrefix} | Marketing | AI Matrx Agentic Harness`,
      );
      expect(faviconDataUri(pathname)).toBe(
        svgToDataURI(
          generateSVGFavicon({ color: "#15803d", letter: section.letter }),
        ),
      );
    },
  );

  it("identifies capabilities instead of falling back to Overview", () => {
    const capabilitiesPath = `${SITE_PATH}/capabilities`;
    expect(
      resolveActiveRouteMode(
        listMarketingSiteModes(SITE_PATH),
        capabilitiesPath,
      )?.name,
    ).toBe("Capabilities");
    expect(marketingSiteSectionSuffix(capabilitiesPath, SITE_PATH)).toBe(
      "/capabilities",
    );
  });

  it("keeps nested detail routes connected to their visible parent mode", () => {
    expect(
      resolveActiveRouteMode(
        listMarketingSiteModes(SITE_PATH),
        `${SITE_PATH}/pages/page-1/snapshots`,
      )?.name,
    ).toBe("Pages");

    const crawlPath = `${SITE_PATH}/crawls/crawl-1`;
    expect(
      resolveActiveRouteMode(
        listMarketingCrawlModes(crawlPath),
        `${crawlPath}/reports/headings`,
      )?.name,
    ).toBe("Reports");
  });
});
