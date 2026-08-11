import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";

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
    exact: true,
  },
  {
    slug: "capabilities",
    name: "Capabilities",
    titlePrefix: "SEO Capabilities",
    description:
      "See what this site can measure, where each result lives, and which system produces it.",
    letter: "Cp",
  },
  {
    slug: "performance",
    name: "Performance",
    titlePrefix: "Site Performance",
    description:
      "See PageSpeed coverage, site-wide score health, trends, and the slowest pages with real search traffic.",
    letter: "Pf",
  },
  {
    slug: "discovery",
    name: "Discovery",
    titlePrefix: "Discovery",
    description: "Review discovered brand assets and business facts.",
    letter: "Di",
  },
  {
    slug: "sitemaps",
    name: "Sitemaps",
    titlePrefix: "Sitemaps",
    description: "Inspect sitemap documents and page membership.",
    letter: "Sm",
  },
  {
    slug: "coverage",
    name: "Coverage",
    titlePrefix: "Coverage",
    description: "Compare sitemap, crawl, and search coverage for this site.",
    letter: "Cv",
  },
  {
    slug: "audit",
    name: "Audit",
    titlePrefix: "Site Audit",
    description:
      "Review deterministic site-wide indexability, search metadata, social, heading, and URL-quality checks.",
    letter: "Au",
  },
  {
    slug: "pages",
    name: "Pages",
    titlePrefix: "Pages",
    description: "Manage canonical pages and their observed content.",
    letter: "Pg",
  },
  {
    slug: "structure",
    name: "Structure",
    titlePrefix: "Structure",
    description:
      "Explore the site's routing tree with page totals at every level.",
    letter: "Tr",
  },
  {
    slug: "media",
    name: "Media",
    titlePrefix: "Site Media",
    description:
      "Inspect crawled media, the brand library, research, generation, and site media standards.",
    letter: "Me",
  },
  {
    slug: "crawls",
    name: "Crawls",
    titlePrefix: "Crawls",
    description: "Inspect and run website crawl sessions.",
    letter: "Cr",
  },
  {
    slug: "analysis",
    name: "Analysis",
    titlePrefix: "Analysis",
    description: "Review prioritized marketing analysis for this site.",
    letter: "An",
  },
  {
    slug: "findings",
    name: "Findings",
    titlePrefix: "Findings",
    description: "Review durable marketing findings and evidence.",
    letter: "Fi",
  },
  {
    slug: "links",
    name: "Links",
    titlePrefix: "Links",
    description: "Inspect accepted link evidence for this site.",
    letter: "Ln",
  },
  {
    slug: "authority",
    name: "Authority",
    titlePrefix: "Authority Router",
    description:
      "Route backlink and internal authority toward strategically important pages with exact, evidence-grounded link recommendations.",
    letter: "Ar",
  },
  {
    slug: "backlinks",
    name: "Backlinks",
    titlePrefix: "Backlinks",
    description:
      "Inspect persisted backlink authority, referring domains, anchors, linked pages, and competitors.",
    letter: "Bl",
  },
  {
    slug: "changes",
    name: "Changes",
    titlePrefix: "SEO Changes",
    description:
      "Track site interventions, implementation evidence, and measured outcomes.",
    letter: "Ch",
  },
  {
    slug: "reputation",
    name: "Reputation",
    titlePrefix: "Digital PR & Reputation",
    description:
      "Review evidence-backed publication opportunities and reputation handling decisions.",
    letter: "Pr",
  },
  {
    slug: "keywords",
    name: "Keywords",
    titlePrefix: "Keywords",
    description:
      "Inspect persisted organic query performance and keyword-market intelligence.",
    letter: "Kw",
  },
  {
    slug: "intake",
    name: "Intake",
    titlePrefix: "Site Intake",
    description:
      "Review and complete the site information needed by marketing systems.",
    letter: "It",
  },
  {
    slug: "ranks",
    name: "Ranks",
    titlePrefix: "Site Ranks",
    description: "Track keyword positions and movement for this site.",
    letter: "Rn",
  },
  {
    slug: "ai-visibility",
    name: "AI Visibility",
    titlePrefix: "AI Visibility",
    description:
      "See where AI assistants cite this site, which competitors answer instead, and what closes the gap.",
    letter: "Av",
  },
  {
    slug: "integrations",
    name: "Integrations",
    titlePrefix: "Integrations",
    description: "Configure this site's marketing data providers.",
    letter: "In",
  },
  {
    slug: "access",
    name: "Access",
    titlePrefix: "Access",
    description: "Manage site access and sharing.",
    letter: "Ac",
  },
  {
    slug: "settings",
    name: "Settings",
    titlePrefix: "Settings",
    description: "Configure website identity and crawl behavior.",
    letter: "Se",
  },
] as const satisfies readonly MarketingRouteSection[];

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
