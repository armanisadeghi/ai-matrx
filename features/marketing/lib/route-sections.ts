import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";

/**
 * The seven parent categories a website's sections fall into, in sidebar order.
 *
 * A website had 26 first-level sections and no parent/child relationship at
 * all, which is why the header could never render more than icons. These groups
 * are what the marketing sidebar renders; no group holds more than five.
 *
 * Names avoid colliding with any section name (a "Changes" group holding a
 * "Changes" section reads as a bug) and avoid jargon — the person inside this
 * UI is a world-class expert at their own field and a novice at SEO.
 */
export const MARKETING_SITE_SECTION_GROUPS = [
  "Command",
  "Content",
  "Collection",
  "Health & Fixes",
  "Search",
  "Links & Reputation",
  "Configuration",
] as const;

export type MarketingSectionGroup =
  (typeof MARKETING_SITE_SECTION_GROUPS)[number];

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

/**
 * A SITE section. Grouping is site-only: a crawl's six modes already fit the
 * header as icon+label, so they stay a flat list and keep the base shape.
 */
export interface MarketingSiteRouteSection extends MarketingRouteSection {
  /** Parent category in the sidebar. Every site section has one. */
  group: MarketingSectionGroup;
  /**
   * The section's data is not actually site-scoped and it is scheduled to move
   * (see docs/handoffs/marketing-navigation-hierarchy.md). Recorded here so the
   * move cannot be forgotten and so nothing builds new site-level work on it.
   */
  pendingMoveTo?: "brand" | "marketing";
}

export interface MarketingRouteMode extends MarketingRouteSection {
  href: string;
}

/**
 * Every visible mode under `/marketing/brands/[brandId]/sites/[siteId]`.
 * The site header, sibling-site switching, metadata, and filesystem drift test
 * all consume this one declaration.
 */
export const MARKETING_SITE_SECTIONS = [
  {
    slug: "",
    name: "Overview",
    titlePrefix: "Site Overview",
    description: "Review website identity, health, and recent activity.",
    letter: "So",
    group: "Command",
    exact: true,
  },
  {
    slug: "growth-loop",
    name: "Growth Loop",
    titlePrefix: "Growth Loop",
    description:
      "Run this site end to end — research, plan, write, publish, crawl, measure, improve — and act on whatever the loop is waiting on.",
    letter: "Gl",
    group: "Command",
  },
  {
    slug: "capabilities",
    name: "Capabilities",
    titlePrefix: "SEO Capabilities",
    description:
      "See what this site can measure, where each result lives, and which system produces it.",
    letter: "Cp",
    group: "Command",
    pendingMoveTo: "marketing",
  },
  {
    slug: "performance",
    name: "Performance",
    titlePrefix: "Site Performance",
    description:
      "See PageSpeed coverage, site-wide score health, trends, and the slowest pages with real search traffic.",
    letter: "Pf",
    group: "Health & Fixes",
  },
  {
    slug: "discovery",
    name: "Discovery",
    titlePrefix: "Discovery",
    description: "Review discovered brand assets and business facts.",
    letter: "Di",
    group: "Collection",
    pendingMoveTo: "brand",
  },
  {
    slug: "sitemaps",
    name: "Sitemaps",
    titlePrefix: "Sitemaps",
    description: "Inspect sitemap documents and page membership.",
    letter: "Sm",
    group: "Content",
  },
  {
    slug: "coverage",
    name: "Coverage",
    titlePrefix: "Coverage",
    description: "Compare sitemap, crawl, and search coverage for this site.",
    letter: "Cv",
    group: "Content",
  },
  {
    slug: "audit",
    name: "Audit",
    titlePrefix: "Site Audit",
    description:
      "Review deterministic site-wide indexability, search metadata, social, heading, and URL-quality checks.",
    letter: "Au",
    group: "Health & Fixes",
  },
  {
    slug: "pages",
    name: "Pages",
    titlePrefix: "Pages",
    description: "Manage canonical pages and their observed content.",
    letter: "Pg",
    group: "Content",
  },
  {
    slug: "structure",
    name: "Structure",
    titlePrefix: "Structure",
    description:
      "Explore the site's routing tree with page totals at every level.",
    letter: "Tr",
    group: "Content",
  },
  {
    slug: "media",
    name: "Media",
    titlePrefix: "Site Media",
    description:
      "Inspect crawled media, the brand library, research, generation, and site media standards.",
    letter: "Me",
    group: "Content",
  },
  {
    slug: "crawls",
    name: "Crawls",
    titlePrefix: "Crawls",
    description: "Inspect and run website crawl sessions.",
    letter: "Cr",
    group: "Collection",
  },
  {
    slug: "analysis",
    name: "Analysis",
    titlePrefix: "Analysis",
    description: "Review prioritized marketing analysis for this site.",
    letter: "An",
    group: "Health & Fixes",
  },
  {
    slug: "findings",
    name: "Findings",
    titlePrefix: "Findings",
    description: "Review durable marketing findings and evidence.",
    letter: "Fi",
    group: "Health & Fixes",
  },
  {
    slug: "links",
    name: "Links",
    titlePrefix: "Links",
    description: "Inspect accepted link evidence for this site.",
    letter: "Ln",
    group: "Links & Reputation",
  },
  {
    slug: "authority",
    name: "Authority",
    titlePrefix: "Authority Router",
    description:
      "Route backlink and internal authority toward strategically important pages with exact, evidence-grounded link recommendations.",
    letter: "Ar",
    group: "Links & Reputation",
  },
  {
    slug: "backlinks",
    name: "Backlinks",
    titlePrefix: "Backlinks",
    description:
      "Inspect persisted backlink authority, referring domains, anchors, linked pages, and competitors.",
    letter: "Bl",
    group: "Links & Reputation",
  },
  {
    slug: "changes",
    name: "Changes",
    titlePrefix: "SEO Changes",
    description:
      "Track site interventions, implementation evidence, and measured outcomes.",
    letter: "Ch",
    group: "Health & Fixes",
  },
  {
    slug: "reputation",
    name: "Reputation",
    titlePrefix: "Digital PR & Reputation",
    description:
      "Review evidence-backed publication opportunities and reputation handling decisions.",
    letter: "Pr",
    group: "Links & Reputation",
  },
  {
    slug: "keywords",
    name: "Keywords",
    titlePrefix: "Keywords",
    description:
      "Inspect persisted organic query performance and keyword-market intelligence.",
    letter: "Kw",
    group: "Search",
  },
  {
    slug: "intake",
    name: "Intake",
    titlePrefix: "Site Intake",
    description:
      "Review and complete the site information needed by marketing systems.",
    letter: "It",
    group: "Configuration",
  },
  {
    slug: "ranks",
    name: "Ranks",
    titlePrefix: "Site Ranks",
    description: "Track keyword positions and movement for this site.",
    letter: "Rn",
    group: "Search",
  },
  {
    slug: "ai-visibility",
    name: "AI Visibility",
    titlePrefix: "AI Visibility",
    description:
      "See where AI assistants cite this site, which competitors answer instead, and what closes the gap.",
    letter: "Av",
    group: "Search",
  },
  {
    slug: "integrations",
    name: "Integrations",
    titlePrefix: "Integrations",
    description: "Configure this site's marketing data providers.",
    letter: "In",
    group: "Configuration",
  },
  {
    slug: "access",
    name: "Access",
    titlePrefix: "Access",
    description: "Manage site access and sharing.",
    letter: "Ac",
    group: "Configuration",
  },
  {
    slug: "settings",
    name: "Settings",
    titlePrefix: "Settings",
    description: "Configure website identity and crawl behavior.",
    letter: "Se",
    group: "Configuration",
  },
] as const satisfies readonly MarketingSiteRouteSection[];

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
    letter: "Rp",
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

export type MarketingSiteMode = (typeof MARKETING_SITE_SECTIONS)[number] & {
  href: string;
  exact?: boolean;
};

export type MarketingCrawlMode = (typeof MARKETING_CRAWL_SECTIONS)[number] & {
  href: string;
  exact?: boolean;
};

function hrefForSection(basePath: string, slug: string): string {
  return slug ? `${basePath}/${slug}` : basePath;
}

export function listMarketingSiteModes(sitePath: string): MarketingSiteMode[] {
  return MARKETING_SITE_SECTIONS.map((section) => ({
    ...section,
    href: hrefForSection(sitePath, section.slug),
  }));
}

export interface MarketingSiteModeGroup {
  label: MarketingSectionGroup;
  modes: MarketingSiteMode[];
}

/**
 * The site's sections as the sidebar renders them: grouped, in declared group
 * order, section order preserved inside each group. Groups with no sections are
 * omitted rather than rendered empty.
 */
export function listMarketingSiteModeGroups(
  sitePath: string,
): MarketingSiteModeGroup[] {
  const modes = listMarketingSiteModes(sitePath);
  return MARKETING_SITE_SECTION_GROUPS.map((label) => ({
    label,
    modes: modes.filter((mode) => mode.group === label),
  })).filter((group) => group.modes.length > 0);
}

export function listMarketingCrawlModes(
  crawlPath: string,
): MarketingCrawlMode[] {
  return MARKETING_CRAWL_SECTIONS.map((section) => ({
    ...section,
    href: hrefForSection(crawlPath, section.slug),
  }));
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

/** Preserve the current registered site mode when switching sibling sites. */
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
