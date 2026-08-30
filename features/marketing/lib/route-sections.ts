import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";

/**
 * Section registries for the agency-model marketing tree (2026-08-28).
 *
 * A site's screens split across TWO branches with different jobs:
 *
 *   • WEBSITE INVENTORY — `/marketing/[brand]/websites/[site]/…`
 *     What the site IS: pages, structure, sitemaps, media, crawls, settings.
 *
 *   • SEO PRACTICE — `/marketing/[brand]/seo/[site]/…`
 *     How the outside world finds it, and the work of improving that:
 *     keywords, rankings, search console, technical health, links & authority,
 *     AI visibility, and the programs that run it.
 *
 * This is Arman's two-lanes ruling carried into the URL itself ("you sort of
 * have SEO on one side, and then you have, like, the actual website on the
 * other") — the old single 22-section list buried SEO inside the website and
 * nobody could find anything. Sidebar, headers, metadata, and the filesystem
 * drift tests all consume these declarations; adding a screen means adding it
 * HERE, never to one menu by hand.
 */

export const MARKETING_WEBSITE_SECTION_GROUPS = [
  "Start",
  "The Website",
  "Configuration",
] as const;

export const MARKETING_SEO_SECTION_GROUPS = [
  "Keywords & Search",
  "Technical",
  "Links & Authority",
  "Visibility",
  "Programs",
  "Setup",
] as const;

export type MarketingWebsiteSectionGroup =
  (typeof MARKETING_WEBSITE_SECTION_GROUPS)[number];
export type MarketingSeoSectionGroup =
  (typeof MARKETING_SEO_SECTION_GROUPS)[number];

export interface MarketingRouteSection {
  /** Empty string denotes the route family's root view. */
  slug: string;
  name: string;
  titlePrefix: string;
  description: string;
  /** Unique favicon badge within the Marketing route family. */
  letter: string;
  /** Root/overview views are exact so missing registrations cannot masquerade as them. */
  exact?: boolean;
}

export interface MarketingWebsiteRouteSection extends MarketingRouteSection {
  group: MarketingWebsiteSectionGroup;
}

export interface MarketingSeoRouteSection extends MarketingRouteSection {
  group: MarketingSeoSectionGroup;
}

/** Every visible mode under `/marketing/[brandId]/websites/[siteId]`. */
export const MARKETING_WEBSITE_SECTIONS = [
  {
    slug: "",
    name: "Overview",
    titlePrefix: "Site Overview",
    description: "Review website identity, health, and recent activity.",
    letter: "So",
    group: "Start",
    exact: true,
  },
  {
    slug: "pages",
    name: "Pages",
    titlePrefix: "Pages",
    description: "Manage canonical pages and their observed content.",
    letter: "Pg",
    group: "The Website",
  },
  {
    slug: "structure",
    name: "Structure",
    titlePrefix: "Structure",
    description:
      "Explore the site's routing tree with page totals at every level.",
    letter: "Tr",
    group: "The Website",
  },
  {
    slug: "sitemaps",
    name: "Sitemaps",
    titlePrefix: "Sitemaps",
    description: "Inspect sitemap documents and page membership.",
    letter: "Sm",
    group: "The Website",
  },
  {
    slug: "media",
    name: "Media",
    titlePrefix: "Site Media",
    description:
      "Inspect the images and videos this website serves, and the media standards it holds them to.",
    letter: "Me",
    group: "The Website",
  },
  {
    slug: "crawls",
    name: "Crawls",
    titlePrefix: "Crawls",
    description: "Inspect and run website crawl sessions.",
    letter: "Cr",
    group: "The Website",
  },
  {
    slug: "settings",
    name: "Settings",
    titlePrefix: "Settings",
    description:
      "Configure website identity, crawl behavior, providers, sharing, and intake.",
    letter: "Se",
    group: "Configuration",
  },
] as const satisfies readonly MarketingWebsiteRouteSection[];

/**
 * Every visible mode under `/marketing/[brandId]/seo/[siteId]`.
 * The branch root redirects to `keywords` — the "start here" screen.
 */
export const MARKETING_SEO_SECTIONS = [
  {
    slug: "keywords",
    name: "Keywords",
    titlePrefix: "Keywords",
    description:
      "Start here: what people searched, what your keywords mean, and what that traffic is worth.",
    letter: "Kw",
    group: "Keywords & Search",
  },
  {
    slug: "rankings",
    name: "Rankings",
    titlePrefix: "Rank Tracking",
    description: "Track keyword positions and movement for this site.",
    letter: "Rn",
    group: "Keywords & Search",
  },
  {
    slug: "search-console",
    name: "Search Console",
    titlePrefix: "Search Console",
    description:
      "The full Search Console dataset for this site — queries, pages, countries, devices.",
    letter: "Sc",
    group: "Keywords & Search",
  },
  {
    slug: "audit",
    name: "Audit",
    titlePrefix: "Site Audit",
    description:
      "Review deterministic site-wide indexability, search metadata, social, heading, and URL-quality checks.",
    letter: "Au",
    group: "Technical",
  },
  {
    slug: "findings",
    name: "Findings",
    titlePrefix: "Findings",
    description: "Review durable marketing findings and evidence.",
    letter: "Fi",
    group: "Technical",
  },
  {
    slug: "analysis",
    name: "Analysis",
    titlePrefix: "Analysis",
    description: "Review prioritized marketing analysis for this site.",
    letter: "An",
    group: "Technical",
  },
  {
    slug: "coverage",
    name: "Coverage",
    titlePrefix: "Coverage",
    description: "Compare sitemap, crawl, and search coverage for this site.",
    letter: "Cv",
    group: "Technical",
  },
  {
    slug: "performance",
    name: "Performance",
    titlePrefix: "Site Performance",
    description:
      "See PageSpeed coverage, site-wide score health, trends, and the slowest pages with real search traffic.",
    letter: "Ps",
    group: "Technical",
  },
  {
    slug: "changes",
    name: "Changes",
    titlePrefix: "SEO Changes",
    description:
      "Track site interventions, implementation evidence, and measured outcomes.",
    letter: "Ch",
    group: "Technical",
  },
  {
    slug: "backlinks",
    name: "Backlinks",
    titlePrefix: "Backlinks",
    description:
      "Inspect persisted backlink authority, referring domains, anchors, linked pages, and competitors.",
    letter: "Bl",
    group: "Links & Authority",
  },
  {
    slug: "links",
    name: "Link Graph",
    titlePrefix: "Links",
    description: "Inspect accepted link evidence for this site.",
    letter: "Ln",
    group: "Links & Authority",
  },
  {
    slug: "authority",
    name: "Authority",
    titlePrefix: "Authority Router",
    description:
      "Route backlink and internal authority toward strategically important pages with exact, evidence-grounded link recommendations.",
    letter: "Ar",
    group: "Links & Authority",
  },
  {
    slug: "valuation",
    name: "Link Valuation",
    titlePrefix: "Backlink Valuation",
    description:
      "Score a candidate backlink on quality, relevance and placement, and price what it is worth paying.",
    letter: "Lv",
    group: "Links & Authority",
  },
  {
    slug: "ai-visibility",
    name: "AI Visibility",
    titlePrefix: "AI Visibility",
    description:
      "See where AI assistants cite this site, which competitors answer instead, and what closes the gap.",
    letter: "Av",
    group: "Visibility",
  },
  {
    slug: "growth-loop",
    name: "Growth Loop",
    titlePrefix: "Growth Loop",
    description:
      "Run this site end to end — research, plan, write, publish, crawl, measure, improve — and act on whatever the loop is waiting on.",
    letter: "Gl",
    group: "Programs",
  },
  {
    slug: "automations",
    name: "Automations",
    titlePrefix: "Automations",
    description:
      "Run the keyword-coverage engines by hand for this site, and author the schedule that overrides the organization and system defaults.",
    letter: "Am",
    group: "Programs",
  },
  {
    slug: "capabilities",
    name: "Capabilities",
    titlePrefix: "SEO Capabilities",
    description:
      "What's measured and switched on for this site, and each capability's evidence.",
    letter: "Cp",
    group: "Setup",
  },
] as const satisfies readonly MarketingSeoRouteSection[];

/**
 * Compatibility registry for brand-first site shells while their callers move
 * onto the website/SEO split. It is derived from the canonical registries, so
 * it cannot drift into a third source of route truth.
 */
export const MARKETING_SITE_SECTIONS = [
  ...MARKETING_WEBSITE_SECTIONS,
  ...MARKETING_SEO_SECTIONS,
] as const;

export const MARKETING_SITE_LEGACY_REDIRECTS = [
  "access",
  "discovery",
  "integrations",
  "intake",
] as const;

/** Every visible mode under one durable crawl session. */
export const MARKETING_CRAWL_SECTIONS = [
  {
    slug: "",
    name: "Summary",
    titlePrefix: "Crawl Detail",
    description: "Inspect a crawl session and its durable results.",
    letter: "Cd",
    exact: true,
  },
  {
    slug: "urls",
    name: "URLs",
    titlePrefix: "Crawl URLs",
    description: "Inspect URLs encountered during this crawl.",
    letter: "Cu",
  },
  {
    slug: "reports",
    name: "Reports",
    titlePrefix: "Crawl Reports",
    description: "Browse dedicated technical SEO reports for this crawl.",
    letter: "Cw",
  },
  {
    slug: "snapshots",
    name: "Snapshots",
    titlePrefix: "Crawl Captures",
    description: "Inspect page captures produced by this crawl.",
    letter: "Cs",
  },
  {
    slug: "links",
    name: "Links",
    titlePrefix: "Crawl Links",
    description: "Inspect link evidence captured during this crawl.",
    letter: "Cl",
  },
  {
    slug: "logs",
    name: "Logs",
    titlePrefix: "Crawl Logs",
    description: "Inspect the durable event history for this crawl.",
    letter: "Cg",
  },
] as const satisfies readonly MarketingRouteSection[];

export type MarketingWebsiteMode =
  (typeof MARKETING_WEBSITE_SECTIONS)[number] & { href: string };
export type MarketingSeoMode = (typeof MARKETING_SEO_SECTIONS)[number] & {
  href: string;
};
export type MarketingCrawlMode = (typeof MARKETING_CRAWL_SECTIONS)[number] & {
  href: string;
  exact?: boolean;
};

function hrefForSection(basePath: string, slug: string): string {
  return slug ? `${basePath}/${slug}` : basePath;
}

export function listMarketingWebsiteModes(
  websitePath: string,
): MarketingWebsiteMode[] {
  return MARKETING_WEBSITE_SECTIONS.map((section) => ({
    ...section,
    href: hrefForSection(websitePath, section.slug),
  }));
}

export function listMarketingSeoModes(seoPath: string): MarketingSeoMode[] {
  return MARKETING_SEO_SECTIONS.map((section) => ({
    ...section,
    href: hrefForSection(seoPath, section.slug),
  }));
}

export type MarketingSiteMode = (typeof MARKETING_SITE_SECTIONS)[number] & {
  href: string;
};

export function listMarketingSiteModes(sitePath: string): MarketingSiteMode[] {
  return MARKETING_SITE_SECTIONS.map((section) => ({
    ...section,
    href: hrefForSection(sitePath, section.slug),
  }));
}

export interface MarketingModeGroup<TMode> {
  label: string;
  modes: TMode[];
}

export function listMarketingWebsiteModeGroups(
  websitePath: string,
): MarketingModeGroup<MarketingWebsiteMode>[] {
  const modes = listMarketingWebsiteModes(websitePath);
  return MARKETING_WEBSITE_SECTION_GROUPS.map((label) => ({
    label,
    modes: modes.filter((mode) => mode.group === label),
  })).filter((group) => group.modes.length > 0);
}

export function listMarketingSeoModeGroups(
  seoPath: string,
): MarketingModeGroup<MarketingSeoMode>[] {
  const modes = listMarketingSeoModes(seoPath);
  return MARKETING_SEO_SECTION_GROUPS.map((label) => ({
    label,
    modes: modes.filter((mode) => mode.group === label),
  })).filter((group) => group.modes.length > 0);
}

export function listMarketingSiteModeGroups(
  sitePath: string,
): MarketingModeGroup<MarketingSiteMode>[] {
  return [
    ...listMarketingWebsiteModeGroups(sitePath),
    ...listMarketingSeoModeGroups(sitePath),
  ];
}

export function listMarketingCrawlModes(
  crawlPath: string,
): MarketingCrawlMode[] {
  return MARKETING_CRAWL_SECTIONS.map((section) => ({
    ...section,
    href: hrefForSection(crawlPath, section.slug),
  }));
}

export function getMarketingWebsiteSection(
  slug: string,
): MarketingRouteSection | undefined {
  return MARKETING_WEBSITE_SECTIONS.find((section) => section.slug === slug);
}

export function getMarketingSeoSection(
  slug: string,
): MarketingRouteSection | undefined {
  return MARKETING_SEO_SECTIONS.find((section) => section.slug === slug);
}

export function getMarketingSiteSection(
  slug: string,
): MarketingRouteSection | undefined {
  return MARKETING_SITE_SECTIONS.find((section) => section.slug === slug);
}

export function getMarketingCrawlSection(
  slug: string,
): MarketingRouteSection | undefined {
  return MARKETING_CRAWL_SECTIONS.find((section) => section.slug === slug);
}

/** Preserve the current registered mode when switching sibling sites. */
export function marketingWebsiteSectionSuffix(
  pathname: string,
  websitePath: string,
): string {
  const active = resolveActiveRouteMode(
    listMarketingWebsiteModes(websitePath),
    pathname,
  );
  return active?.slug ? `/${active.slug}` : "";
}

export function marketingSiteSectionSuffix(
  pathname: string,
  sitePath: string,
): string {
  const active = resolveActiveRouteMode(
    listMarketingSiteModes(sitePath),
    pathname,
  );
  return active?.slug ? `/${active.slug}` : "";
}

export function marketingSeoSectionSuffix(
  pathname: string,
  seoPath: string,
): string {
  const active = resolveActiveRouteMode(
    listMarketingSeoModes(seoPath),
    pathname,
  );
  return active?.slug ? `/${active.slug}` : "";
}
