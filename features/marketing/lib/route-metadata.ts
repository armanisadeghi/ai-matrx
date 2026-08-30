import type { Metadata } from "next";
import { createRouteMetadata } from "@/utils/route-metadata";
import {
  getCrawlReport,
  isCrawlReportKey,
} from "@/features/marketing/lib/crawl-reports";
import { MARKETING_RESERVED_SEGMENTS } from "@/features/marketing/lib/keys";
import { MARKETING_BRAND_SECTIONS } from "@/features/marketing/lib/brand-sections";
import {
  getMarketingCrawlSection,
  getMarketingSeoSection,
  getMarketingWebsiteSection,
} from "@/features/marketing/lib/route-sections";

/**
 * Title/description/favicon-badge identity for every Marketing route in the
 * agency-model tree. Static agency-plane routes are declared; everything under
 * `/marketing/[brandSeg]/…` derives from the SAME section registries the
 * sidebar renders, so a screen can never carry a different name in the tab
 * than in the menu.
 */

interface MarketingRouteIdentity {
  titlePrefix?: string;
  description: string;
  letter: string;
}

const MARKETING_ROOT: MarketingRouteIdentity = {
  description:
    "Every client brand you manage, cross-client roll-ups, operations, and SEO tools.",
  letter: "Mk",
};

const OPENING: MarketingRouteIdentity = {
  titlePrefix: "Opening",
  description: "Opening the canonical marketing workspace for this address.",
  letter: "Op",
};

const STATIC_ROUTES: Readonly<Record<string, MarketingRouteIdentity>> = {
  "/marketing": MARKETING_ROOT,
  "/marketing/admin": {
    titlePrefix: "Admin",
    description: "Browse the Marketing feature resource map.",
    letter: "Ad",
  },
  "/marketing/brands": {
    titlePrefix: "Clients",
    description: "Every client brand you manage — open one for its workspace.",
    letter: "Br",
  },
  "/marketing/brands/new-website": {
    titlePrefix: "New Website",
    description: "Add a website to a client brand.",
    letter: "Ns",
  },
  "/marketing/reports": {
    titlePrefix: "Reports",
    description:
      "Scheduled, branded, client-ready reports assembled from live marketing data.",
    letter: "Rp",
  },
  "/marketing/reports/cost": {
    titlePrefix: "Cost",
    description:
      "Provider spend this month and last, against the org's monthly ceilings.",
    letter: "Co",
  },
  "/marketing/reports/ranks": {
    titlePrefix: "Rank Roll-up",
    description:
      "Every tracked keyword across every brand and site — position, movement, freshness.",
    letter: "Rk",
  },
  "/marketing/operations": {
    titlePrefix: "Operations",
    description:
      "Provider connections, automation engines, approvals, and data quality.",
    letter: "Os",
  },
  "/marketing/operations/connections": {
    titlePrefix: "Connections",
    description: "Connect reusable marketing data providers and accounts.",
    letter: "Cn",
  },
  "/marketing/operations/connections/google": {
    titlePrefix: "Google",
    description: "Connect GSC and Analytics data sources.",
    letter: "Gg",
  },
  "/marketing/operations/connections/google/read-only": {
    titlePrefix: "Read-only Sweep",
    description: "Review Search Console data across connected properties.",
    letter: "Ro",
  },
  "/marketing/operations/connections/bing": {
    titlePrefix: "Bing",
    description: "Connect Bing Webmaster Tools.",
    letter: "Bi",
  },
  "/marketing/operations/automations": {
    titlePrefix: "Automations",
    description:
      "Drive the coverage engines by hand and author the schedule for the brands your organization controls.",
    letter: "At",
  },
  "/marketing/operations/approvals": {
    titlePrefix: "Approvals",
    description:
      "Every pending AI proposal across your clients, in one review queue.",
    letter: "Ap",
  },
  "/marketing/operations/data-quality": {
    titlePrefix: "Data Quality",
    description: "Controls for the keyword classifier and topic assigner.",
    letter: "Dq",
  },
  "/marketing/tools": {
    titlePrefix: "SEO Tools",
    description: "Analyzers that run against any public URL.",
    letter: "Tl",
  },
  "/marketing/tools/youtube": {
    titlePrefix: "YouTube Research",
    description:
      "Find public videos and compare creator authority, engagement, and research value.",
    letter: "Yt",
  },
};

function normalizePathname(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || "/marketing";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function brandSectionIdentity(
  section: string,
  subPath: string | undefined,
): MarketingRouteIdentity | null {
  const match = MARKETING_BRAND_SECTIONS.find((candidate) => {
    const candidateSub =
      "subPath" in candidate ? candidate.subPath : undefined;
    return candidateSub
      ? candidate.slug === section && candidateSub === subPath
      : candidate.slug === section;
  });
  if (!match) return null;
  return {
    titlePrefix: match.titlePrefix,
    description: match.description,
    letter: match.letter,
  };
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
  const first = segments[1];
  if (!first) return createMarketingMetadata(normalizedPath, MARKETING_ROOT);

  if (segments[1] === "tools" && segments[2] === "youtube" && segments[4]) {
    return createMarketingMetadata(normalizedPath, {
      titlePrefix: "YouTube Video",
      description:
        "Preview a discovered YouTube video and inspect its research signals.",
      letter: "Yv",
    });
  }

  // Legacy shapes still resolve to a redirect page; give them honest identity.
  if (MARKETING_RESERVED_SEGMENTS.has(first)) {
    return createMarketingMetadata(normalizedPath, OPENING);
  }

  // ── The client workspace: /marketing/[brandSeg]/… ──────────────────────
  const section = segments[2];
  if (!section) {
    return createMarketingMetadata(normalizedPath, {
      titlePrefix: "Brand Overview",
      description: "This client at a glance — properties, health, activity.",
      letter: "Bo",
    });
  }

  if (section === "websites") {
    return createMarketingMetadata(
      normalizedPath,
      websiteIdentity(segments.slice(3)),
    );
  }

  if (section === "seo") {
    return createMarketingMetadata(
      normalizedPath,
      seoIdentity(segments.slice(3)),
    );
  }

  if (section === "identity" && segments[3]) {
    const room: Record<string, MarketingRouteIdentity> = {
      media: {
        titlePrefix: "Brand Media",
        description:
          "The brand's owned asset library, research imagery, stock sources, and AI image generation.",
        letter: "Ba",
      },
      knowledge: {
        titlePrefix: "Business Knowledge",
        description:
          "The business model, customers, and facts every practice reads from.",
        letter: "Bk",
      },
      offerings: {
        titlePrefix: "Offerings",
        description: "The products and services this brand sells, as a tree.",
        letter: "Of",
      },
      guidelines: {
        titlePrefix: "Guidelines",
        description: "Brand and business guidelines every practice honors.",
        letter: "Gu",
      },
      audience: {
        titlePrefix: "Audience & Personas",
        description:
          "Segments, ICPs, and personas that every brief, campaign, and agent reads from.",
        letter: "Ae",
      },
    };
    const identity = room[segments[3]];
    if (identity) return createMarketingMetadata(normalizedPath, identity);
  }

  if (section === "locations" && segments[3]) {
    return createMarketingMetadata(normalizedPath, {
      titlePrefix: "Location Listings",
      description:
        "Manage canonical location profiles, directory listings, and NAP consistency.",
      letter: "Ll",
    });
  }

  if (section === "content" && segments[3] === "plan" && segments[4]) {
    return createMarketingMetadata(normalizedPath, {
      titlePrefix: "Content Plan",
      description:
        "Plan every URL this site should have — pillars, clusters, briefs, keywords.",
      letter: "Pn",
    });
  }

  if (section === "planning" && segments[3] === "initiatives" && segments[4]) {
    return createMarketingMetadata(normalizedPath, {
      titlePrefix: "Initiative",
      description:
        "One cross-channel initiative — goal, budget, timeline, and assets.",
      letter: "It",
    });
  }

  if (section === "planning" && segments[3] === "calendar") {
    return createMarketingMetadata(normalizedPath, {
      titlePrefix: "Calendar",
      description:
        "One publishing timeline across content, social, email, and paid.",
      letter: "Cy",
    });
  }

  const brandIdentity = brandSectionIdentity(
    section,
    section === "intelligence" ? segments[3] : undefined,
  );
  if (brandIdentity) {
    return createMarketingMetadata(normalizedPath, brandIdentity);
  }

  return createMarketingMetadata(normalizedPath, MARKETING_ROOT);
}

function websiteIdentity(rest: readonly string[]): MarketingRouteIdentity {
  // rest: [siteSeg, section?, …]
  if (!rest[0] || !rest[1]) {
    return (
      getMarketingWebsiteSection("") ?? {
        titlePrefix: "Websites",
        description: "This brand's sites — pages, structure, crawls, settings.",
        letter: "Ws",
      }
    );
  }
  const section = rest[1];
  if (section === "crawls") return getCrawlIdentity(rest.slice(2));
  if (section === "pages") return getPageIdentity(rest.slice(2));
  if (section === "sitemaps" && rest[2]) {
    return {
      titlePrefix: "Sitemap Detail",
      description: "Inspect a sitemap and its canonical page membership.",
      letter: "Sd",
    };
  }
  return getMarketingWebsiteSection(section) ?? MARKETING_ROOT;
}

function seoIdentity(rest: readonly string[]): MarketingRouteIdentity {
  // rest: [siteSeg, section?, …]
  if (!rest[0] || !rest[1]) {
    return {
      titlePrefix: "SEO",
      description:
        "The organic-search practice on this brand's sites — keywords, rankings, technical, links, AI visibility.",
      letter: "Sr",
    };
  }
  const section = rest[1];
  if (section === "findings" && rest[2]) {
    return {
      titlePrefix: "Finding Detail",
      description: "Inspect a marketing finding and its evidence history.",
      letter: "Fd",
    };
  }
  if (section === "keywords" && rest[2] === "value") {
    return {
      titlePrefix: "Keyword Value",
      description:
        "Decide what your search traffic is worth: dimensions, rules, packs, and the scores they produce.",
      letter: "Vl",
    };
  }
  return getMarketingSeoSection(section) ?? MARKETING_ROOT;
}

function getCrawlIdentity(rest: readonly string[]): MarketingRouteIdentity {
  if (rest.length === 0)
    return getMarketingWebsiteSection("crawls") ?? MARKETING_ROOT;
  if (rest[0] === "new") {
    return {
      titlePrefix: "New Crawl",
      description: "Configure and start a website crawl.",
      letter: "Nc",
    };
  }
  const detail = rest[1];
  if (!detail) return getMarketingCrawlSection("") ?? MARKETING_ROOT;
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
    return getMarketingCrawlSection("reports") ?? MARKETING_ROOT;
  }
  return (
    getMarketingCrawlSection(detail) ??
    getMarketingWebsiteSection("crawls") ??
    MARKETING_ROOT
  );
}

function getPageIdentity(rest: readonly string[]): MarketingRouteIdentity {
  if (rest.length === 0)
    return getMarketingWebsiteSection("pages") ?? MARKETING_ROOT;
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
