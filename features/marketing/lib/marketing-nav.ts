/**
 * The Marketing hub's structure, declared ONCE.
 *
 * Marketing is a multi-pillar feature: brands/websites are only one of them.
 * Content planning, keyword & search intelligence, the public tool suite, and
 * operations are peers — not sub-features of "sites". Anything that renders a
 * map of Marketing (the `/marketing` hub, `/marketing/tools`, the shell nav)
 * reads this file so a new surface can never be added to one menu and missed
 * by the others.
 *
 * Consumed by:
 *   • app/(core)/marketing/page.tsx        — the hub landing
 *   • app/(core)/marketing/tools/page.tsx  — the public-tool index
 *   • features/shell/constants/nav-data.ts — the sidebar / profile menu
 */

import { marketingRoutes } from "@/features/marketing/lib/routes";

export interface MarketingNavEntry {
  label: string;
  href: string;
  description: string;
  /** Lucide icon name — resolved by the consuming surface. */
  iconName: string;
  /** Opens a public (unauthenticated) utility outside the app shell. */
  external?: boolean;
  /**
   * `"coming-soon"` entries are REAL reserved routes rendering
   * `<MarketingComingSoon>`, not dead links. Each one MUST have a matching
   * `marketing.*` row in `lib/coming-soon/registry.ts` (`comingSoonId`) —
   * see that FEATURE.md: a promise we show a user is tracked like a defect.
   * Omitted means live.
   */
  status?: "coming-soon";
  /** Registry id in `lib/coming-soon/registry.ts`. Required when coming-soon. */
  comingSoonId?: string;
  /** Hidden from the shell sidebar (still on the hub). Keeps the menu sane. */
  navHidden?: boolean;
}

export interface MarketingNavPillar {
  key: string;
  label: string;
  /** One line on what this pillar of marketing is for. */
  description: string;
  iconName: string;
  entries: readonly MarketingNavEntry[];
  /**
   * Marketing-page copy: the 4 short bullets shown for this pillar on the
   * public landing. Lives HERE, not in the landing file, so the landing can
   * never claim a capability the pillar does not have. Landing status is
   * DERIVED from `entries` — a pillar whose entries are all reserved renders
   * "Coming soon" automatically and cannot be talked up by hand.
   */
  landingItems?: readonly string[];
  /** Rare override when "Live"/"Coming soon" is the wrong word (e.g. BYO keys). */
  landingStatus?: "Bring your own";
  /** Where the landing card links. Defaults to the pillar's first entry. */
  landingHref?: string;
}

/** Every entry across every pillar, flattened. */
export function listMarketingEntries(): readonly MarketingNavEntry[] {
  return MARKETING_PILLARS.flatMap((pillar) => pillar.entries);
}

/** The reserved-but-unbuilt surfaces. Drives the roadmap section + audits. */
export function listMarketingComingSoon(): readonly MarketingNavEntry[] {
  return listMarketingEntries().filter((e) => e.status === "coming-soon");
}

/** True when at least one surface in the pillar is actually built. */
export function pillarHasLiveEntry(pillar: MarketingNavPillar): boolean {
  return pillar.entries.some((e) => e.status !== "coming-soon");
}

/**
 * The public landing's sub-area cards, derived from the same pillars the hub
 * and the sidebar render. Pillars without `landingItems` are omitted — the
 * landing is curated, but it can only ever be a SUBSET of what really exists.
 */
export function listMarketingLandingAreas(): {
  title: string;
  status: "Live" | "Coming soon" | "Bring your own";
  href: string;
  items: string[];
}[] {
  return MARKETING_PILLARS.filter((p) => p.landingItems?.length).map(
    (pillar) => {
      // A card labelled "Live" must land somewhere that actually works, so the
      // default href prefers a built surface over a reserved one.
      const target =
        pillar.entries.find((e) => e.status !== "coming-soon") ??
        pillar.entries[0];
      return {
        title: pillar.label,
        status:
          pillar.landingStatus ??
          (pillarHasLiveEntry(pillar)
            ? ("Live" as const)
            : ("Coming soon" as const)),
        href: pillar.landingHref ?? target?.href ?? "/marketing",
        items: [...(pillar.landingItems ?? [])],
      };
    },
  );
}

/**
 * The PUBLIC SEO utilities. They deliberately live on `/seo/*` in the
 * `(public)` route group — they are anonymous lead-gen tools and must stay
 * reachable without a session. They are surfaced in-app here so an authed user
 * never has to leave the product to find them.
 */
export const MARKETING_PUBLIC_TOOLS: readonly MarketingNavEntry[] = [
  {
    label: "Meta Title & Description",
    href: "/seo/metadata",
    description:
      "Live Google SERP preview with a pixel-width meta title/description calculator.",
    iconName: "FileText",
    external: true,
  },
  {
    label: "Page Audit",
    href: "/seo/page-audit",
    description:
      "Run the deterministic on-page audit rules against any public URL.",
    iconName: "ClipboardCheck",
    external: true,
  },
  {
    label: "Social Preview",
    href: "/seo/social-preview",
    description:
      "Preview and analyze Open Graph / social cards as each network renders them.",
    iconName: "Image",
    external: true,
  },
  {
    label: "Structured Data",
    href: "/seo/structured-data",
    description: "Validate schema.org structured data on any page.",
    iconName: "Braces",
    external: true,
  },
  {
    label: "Robots Tester",
    href: "/seo/robots-tester",
    description: "Test robots.txt rules against specific URLs and user agents.",
    iconName: "FileSearch",
    external: true,
  },
];

export const MARKETING_PILLARS: readonly MarketingNavPillar[] = [
  {
    key: "brands",
    label: "Brands & Websites",
    description:
      "The properties you market — brand identity, sites, canonical pages, crawls, and audits.",
    iconName: "Landmark",
    landingItems: [
      "Brand cockpit + assets",
      "Crawls + canonical pages",
      "Audit + coverage",
      "Links + backlinks",
    ],
    entries: [
      {
        label: "Brands",
        href: marketingRoutes.brands(),
        description:
          "Brand identity, properties, assets, and durable business facts.",
        iconName: "Landmark",
      },
      {
        label: "Websites",
        href: marketingRoutes.sites(),
        description:
          "Every site across brands — canonical pages, crawls, findings, and audits.",
        iconName: "Globe",
      },
      {
        label: "Local & Listings",
        href: marketingRoutes.local(),
        description:
          "Google Business Profiles, directory listings, reviews, and map-pack rank.",
        iconName: "MapPin",
        status: "coming-soon",
        comingSoonId: "marketing.local",
      },
    ],
  },
  {
    key: "planning",
    label: "Strategy & Planning",
    description:
      "What you intend to publish and promote — plans, campaigns, calendar, and who it is for.",
    iconName: "ListTree",
    landingItems: [
      "Content plan tree",
      "Briefs + keywords",
      "Campaigns + calendar",
      "Audience + personas",
    ],
    entries: [
      {
        label: "Content Plan",
        href: marketingRoutes.contentPlan(),
        description:
          "Plan every URL a site should have — pillars, clusters, briefs, owners.",
        iconName: "ListTree",
      },
      {
        label: "Campaigns",
        href: marketingRoutes.campaigns(),
        description:
          "The container above channels — goal, budget, timeline, assets, and shared attribution.",
        iconName: "Target",
        status: "coming-soon",
        comingSoonId: "marketing.campaigns",
      },
      {
        label: "Calendar",
        href: marketingRoutes.calendar(),
        description:
          "One publishing timeline across content, social, email, and paid.",
        iconName: "CalendarDays",
        status: "coming-soon",
        comingSoonId: "marketing.calendar",
      },
      {
        label: "Audience & Personas",
        href: marketingRoutes.audience(),
        description:
          "Segments, ICPs, and personas that every brief, campaign, and agent reads from.",
        iconName: "Users",
        status: "coming-soon",
        comingSoonId: "marketing.audience",
      },
    ],
  },
  {
    key: "search",
    label: "Discovery, Search & Visibility",
    description:
      "Find expert source material, understand how the market searches, and track where you appear.",
    iconName: "Search",
    landingItems: [
      "Keyword research",
      "YouTube discovery",
      "Cross-site rank tracking",
      "AI visibility",
    ],
    entries: [
      {
        label: "Keyword Research",
        href: marketingRoutes.keywordResearch(),
        description:
          "Map keyword relationships with AI research and live market volume data.",
        iconName: "Search",
      },
      {
        label: "YouTube Discovery",
        href: marketingRoutes.youtubeDiscovery(),
        description:
          "Find videos and compare creator authority, engagement, and research value.",
        iconName: "Video",
      },
      {
        label: "Rank Tracking",
        href: marketingRoutes.ranks(),
        description:
          "Cross-site, cross-brand rank movement in one place — today ranks live per site.",
        iconName: "TrendingUp",
        status: "coming-soon",
        comingSoonId: "marketing.rank-tracking",
      },
      {
        label: "AI Visibility",
        href: marketingRoutes.aiVisibility(),
        description:
          "Whether AI assistants cite you — prompt-set monitoring, share of answer, source gaps.",
        iconName: "MessageSquareQuote",
        status: "coming-soon",
        comingSoonId: "marketing.ai-visibility",
      },
    ],
  },
  {
    key: "channels",
    label: "Content & Channels",
    description:
      "Where the work actually ships — drafts, social, email, paid, and outreach.",
    iconName: "Megaphone",
    landingItems: [
      "Content studio",
      "Social publishing",
      "Email marketing",
      "Paid ads + outreach",
    ],
    entries: [
      {
        label: "Content Studio",
        href: marketingRoutes.contentStudio(),
        description:
          "Brief to draft to review to published — the production lane between Content Plan and the CMS.",
        iconName: "PenLine",
        status: "coming-soon",
        comingSoonId: "marketing.content-studio",
      },
      {
        label: "Social",
        href: marketingRoutes.social(),
        description:
          "Connected accounts, scheduled posts, and one engagement inbox across networks.",
        iconName: "Share2",
        status: "coming-soon",
        comingSoonId: "marketing.social",
      },
      {
        label: "Email",
        href: marketingRoutes.email(),
        description:
          "Lists, broadcasts, lifecycle automation, and deliverability health.",
        iconName: "Mail",
        status: "coming-soon",
        comingSoonId: "marketing.email",
      },
      {
        label: "Paid Ads",
        href: marketingRoutes.ads(),
        description:
          "Google, Meta, and LinkedIn spend with creative, keyword, and ROAS rollups.",
        iconName: "BadgeDollarSign",
        status: "coming-soon",
        comingSoonId: "marketing.ads",
      },
      {
        label: "Outreach",
        href: marketingRoutes.outreach(),
        description:
          "Link and PR prospecting, sequenced contact, and earned-placement tracking.",
        iconName: "Send",
        status: "coming-soon",
        comingSoonId: "marketing.outreach",
      },
    ],
  },
  {
    key: "intelligence",
    label: "Market Intelligence",
    description:
      "Who else is winning the space, and what is being said about you.",
    iconName: "Radar",
    landingItems: [
      "Competitor tracking",
      "Share of voice",
      "Content + keyword gaps",
      "Brand monitoring",
    ],
    entries: [
      {
        label: "Competitors",
        href: marketingRoutes.competitors(),
        description:
          "Tracked rivals, share of voice, keyword and content gaps, and their movement.",
        iconName: "Swords",
        status: "coming-soon",
        comingSoonId: "marketing.competitors",
      },
      {
        label: "Brand Monitoring",
        href: marketingRoutes.monitoring(),
        description:
          "Mentions, reviews, and sentiment across the web with alerting.",
        iconName: "Radar",
        status: "coming-soon",
        comingSoonId: "marketing.monitoring",
      },
    ],
  },
  {
    key: "measurement",
    label: "Measurement",
    description:
      "What it did and what it cost — traffic, conversion, attribution, and client-ready reporting.",
    iconName: "ChartNoAxesColumn",
    landingItems: [
      "Cost attribution",
      "Cross-channel analytics",
      "Client-ready reports",
      "Batch operations",
    ],
    entries: [
      {
        label: "Analytics",
        href: marketingRoutes.analytics(),
        description:
          "Cross-channel traffic, conversion, and attribution over connected data sources.",
        iconName: "ChartNoAxesColumn",
        status: "coming-soon",
        comingSoonId: "marketing.analytics",
      },
      {
        label: "Reports",
        href: marketingRoutes.reports(),
        description:
          "Scheduled, branded, client-ready reports assembled from live marketing data.",
        iconName: "FileBarChart",
        status: "coming-soon",
        comingSoonId: "marketing.reports",
      },
      {
        label: "Cost",
        href: marketingRoutes.cost(),
        description: "Review marketing cost across sites and organizations.",
        iconName: "CircleDollarSign",
      },
    ],
  },
  {
    key: "tools",
    label: "SEO Tools",
    description:
      "Focused analyzers that work on any URL — no site setup required.",
    iconName: "Wrench",
    landingItems: [
      "Meta title + description",
      "Page audit",
      "Social preview",
      "Structured data + robots",
    ],
    entries: [
      {
        label: "All SEO Tools",
        href: marketingRoutes.tools(),
        description: "The full analyzer suite in one index.",
        iconName: "Wrench",
      },
      ...MARKETING_PUBLIC_TOOLS.slice(0, 3).map((tool) => ({
        ...tool,
        navHidden: true,
      })),
    ],
  },
  {
    key: "operations",
    label: "Data & Operations",
    description:
      "The plumbing — provider connections, batch runs, and automation.",
    iconName: "Plug",
    landingItems: [
      "Google Search Console",
      "GA4 + PageSpeed",
      "Bing Webmaster",
      "DataForSEO",
    ],
    landingStatus: "Bring your own",
    entries: [
      {
        label: "Data Connections",
        href: marketingRoutes.connections(),
        description:
          "Connect Google, Bing, and other providers, then bind them to sites.",
        iconName: "Plug",
      },
      {
        label: "Batch Operations",
        href: marketingRoutes.batches(),
        description: "Monitor cross-site analysis and vision batches.",
        iconName: "Boxes",
      },
      {
        label: "Automations",
        href: marketingRoutes.automations(),
        description:
          "Trigger-based marketing workflows — on crawl finding, on rank drop, on mention.",
        iconName: "Workflow",
        status: "coming-soon",
        comingSoonId: "marketing.automations",
      },
    ],
  },
];
