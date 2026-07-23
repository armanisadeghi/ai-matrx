import type { Metadata } from "next";
import { createRouteMetadata } from "@/utils/route-metadata";
import {
  getCrawlReport,
  isCrawlReportKey,
} from "@/features/marketing/lib/crawl-reports";

interface MarketingRouteIdentity {
  titlePrefix?: string;
  description: string;
  letter: string;
}

const MARKETING_ROOT: MarketingRouteIdentity = {
  description:
    "Manage brands, websites, canonical pages, crawl sessions, and marketing analysis.",
  letter: "Mk",
};

const STATIC_ROUTES: Readonly<Record<string, MarketingRouteIdentity>> = {
  "/marketing": MARKETING_ROOT,
  "/marketing/admin": {
    titlePrefix: "Admin",
    description: "Browse the Marketing feature resource map.",
    letter: "Ad",
  },
  "/marketing/batches": {
    titlePrefix: "Batches",
    description: "Monitor cross-site marketing analysis and vision batches.",
    letter: "Bt",
  },
  "/marketing/brands": {
    titlePrefix: "Brands",
    description:
      "Manage brand identity, properties, assets, and business facts.",
    letter: "Br",
  },
  "/marketing/connections": {
    titlePrefix: "Connections",
    description: "Connect reusable marketing data providers and accounts.",
    letter: "Cn",
  },
  "/marketing/connections/google": {
    titlePrefix: "Google",
    description: "Connect Google Search Console and Analytics data sources.",
    letter: "Gg",
  },
  "/marketing/cost": {
    titlePrefix: "Cost",
    description: "Review marketing cost across sites and organizations.",
    letter: "Co",
  },
  "/marketing/sites": {
    titlePrefix: "Sites",
    description:
      "Manage websites, connection health, and marketing operations.",
    letter: "St",
  },
  "/marketing/sites/new": {
    titlePrefix: "New Site",
    description: "Add a website to the Marketing workspace.",
    letter: "Ns",
  },
};

const SITE_ROUTES: Readonly<Record<string, MarketingRouteIdentity>> = {
  access: {
    titlePrefix: "Access",
    description: "Manage site access and sharing.",
    letter: "Ac",
  },
  analysis: {
    titlePrefix: "Analysis",
    description: "Review prioritized marketing analysis for this site.",
    letter: "An",
  },
  cost: {
    titlePrefix: "Site Cost",
    description: "Review cost attribution for this site.",
    letter: "Sc",
  },
  audit: {
    titlePrefix: "Site Audit",
    description:
      "Deterministic site-wide audit rollup: indexability, SERP metadata, social cards, headings, and URL quality.",
    letter: "Au",
  },
  backlinks: {
    titlePrefix: "Backlinks",
    description:
      "Inspect persisted backlink authority, referring domains, anchors, linked pages, and competitors.",
    letter: "Bl",
  },
  coverage: {
    titlePrefix: "Coverage",
    description: "Compare sitemap, crawl, and search coverage for this site.",
    letter: "Cv",
  },
  crawls: {
    titlePrefix: "Crawls",
    description: "Inspect and run website crawl sessions.",
    letter: "Cr",
  },
  discovery: {
    titlePrefix: "Discovery",
    description: "Review discovered brand assets and business facts.",
    letter: "Di",
  },
  findings: {
    titlePrefix: "Findings",
    description: "Review durable marketing findings and evidence.",
    letter: "Fi",
  },
  integrations: {
    titlePrefix: "Integrations",
    description: "Configure this site's marketing data providers.",
    letter: "In",
  },
  links: {
    titlePrefix: "Links",
    description: "Inspect accepted link evidence for this site.",
    letter: "Ln",
  },
  pages: {
    titlePrefix: "Pages",
    description: "Manage canonical pages and their observed content.",
    letter: "Pg",
  },
  settings: {
    titlePrefix: "Settings",
    description: "Configure website identity and crawl behavior.",
    letter: "Se",
  },
  sitemaps: {
    titlePrefix: "Sitemaps",
    description: "Inspect sitemap documents and page membership.",
    letter: "Sm",
  },
};

function normalizePathname(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || "/marketing";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/**
 * Resolves a stable title, description, and unique badge for every Marketing
 * route without coupling metadata to client-side workspace data fetching.
 */
export function getMarketingRouteMetadata(pathname: string): Metadata {
  const normalizedPath = normalizePathname(pathname);
  const staticIdentity = STATIC_ROUTES[normalizedPath];
  if (staticIdentity) {
    return createMarketingMetadata(normalizedPath, staticIdentity);
  }

  const segments = normalizedPath.split("/").filter(Boolean);

  // Legacy site URLs are client redirects, so they need metadata at the parent
  // Marketing layout where client pages cannot export it themselves.
  if (segments[1] === "sites" && segments[2]) {
    return createMarketingMetadata(normalizedPath, {
      titlePrefix: "Opening Site",
      description: "Opening the canonical brand-first site workspace.",
      letter: "Ls",
    });
  }

  if (segments[1] === "batches" && segments[2]) {
    return createMarketingMetadata(normalizedPath, {
      titlePrefix: "Batch Detail",
      description: "Inspect a marketing batch and its execution items.",
      letter: "Ba",
    });
  }

  if (segments[1] !== "brands" || !segments[2]) {
    return createMarketingMetadata(normalizedPath, MARKETING_ROOT);
  }

  if (segments.length === 3) {
    return createMarketingMetadata(normalizedPath, {
      titlePrefix: "Brand",
      description: "Manage a brand's identity, properties, assets, and facts.",
      letter: "Bd",
    });
  }

  const isSiteRoute = segments[3] === "sites" && Boolean(segments[4]);
  if (!isSiteRoute) {
    return createMarketingMetadata(normalizedPath, MARKETING_ROOT);
  }

  const siteSection = segments[5];
  if (!siteSection) {
    return createMarketingMetadata(normalizedPath, {
      titlePrefix: "Site Overview",
      description: "Review website identity, health, and recent activity.",
      letter: "So",
    });
  }

  if (siteSection === "crawls") {
    return createMarketingMetadata(
      normalizedPath,
      getCrawlIdentity(segments.slice(6)),
    );
  }

  if (siteSection === "pages") {
    return createMarketingMetadata(
      normalizedPath,
      getPageIdentity(segments.slice(6)),
    );
  }

  if (siteSection === "findings" && segments[6]) {
    return createMarketingMetadata(normalizedPath, {
      titlePrefix: "Finding Detail",
      description: "Inspect a marketing finding and its evidence history.",
      letter: "Fd",
    });
  }

  if (siteSection === "sitemaps" && segments[6]) {
    return createMarketingMetadata(normalizedPath, {
      titlePrefix: "Sitemap Detail",
      description: "Inspect a sitemap and its canonical page membership.",
      letter: "Sd",
    });
  }

  return createMarketingMetadata(
    normalizedPath,
    SITE_ROUTES[siteSection] ?? MARKETING_ROOT,
  );
}

function getCrawlIdentity(rest: readonly string[]): MarketingRouteIdentity {
  if (rest.length === 0) return SITE_ROUTES.crawls;
  if (rest[0] === "new") {
    return {
      titlePrefix: "New Crawl",
      description: "Configure and start a website crawl.",
      letter: "Nc",
    };
  }
  const detail = rest[1];
  if (!detail) {
    return {
      titlePrefix: "Crawl Detail",
      description: "Inspect a crawl session and its durable results.",
      letter: "Cd",
    };
  }
  if (detail === "reports") {
    const reportKey = rest[2];
    if (reportKey && isCrawlReportKey(reportKey)) {
      const report = getCrawlReport(reportKey);
      return {
        titlePrefix: report.label,
        description: report.description,
        letter: report.badge,
      };
    }
    return {
      titlePrefix: "Crawl Reports",
      description:
        "Browse dedicated technical SEO reports for this crawl session.",
      letter: "Rp",
    };
  }
  const identities: Readonly<Record<string, MarketingRouteIdentity>> = {
    links: {
      titlePrefix: "Crawl Links",
      description: "Inspect link evidence captured during this crawl.",
      letter: "Cl",
    },
    logs: {
      titlePrefix: "Crawl Logs",
      description: "Inspect the durable event history for this crawl.",
      letter: "Cg",
    },
    snapshots: {
      titlePrefix: "Crawl Captures",
      description: "Inspect page captures produced by this crawl.",
      letter: "Cs",
    },
    urls: {
      titlePrefix: "Crawl URLs",
      description: "Inspect URLs encountered during this crawl.",
      letter: "Cu",
    },
  };
  return identities[detail] ?? SITE_ROUTES.crawls;
}

function getPageIdentity(rest: readonly string[]): MarketingRouteIdentity {
  if (rest.length === 0) return SITE_ROUTES.pages;
  if (rest[1] !== "snapshots") {
    return {
      titlePrefix: "Page Detail",
      description:
        "Review page intent, observed metadata, content, and captures.",
      letter: "Pd",
    };
  }
  if (!rest[2]) {
    return {
      titlePrefix: "Page History",
      description: "Review the immutable snapshot history for this page.",
      letter: "Ph",
    };
  }
  return {
    titlePrefix: "Snapshot Detail",
    description: "Inspect one immutable page snapshot and its artifacts.",
    letter: "Sn",
  };
}

function createMarketingMetadata(
  pathname: string,
  identity: MarketingRouteIdentity,
): Metadata {
  return createRouteMetadata(pathname, {
    title: "Marketing",
    titlePrefix: identity.titlePrefix,
    description: identity.description,
    letter: identity.letter,
  });
}
