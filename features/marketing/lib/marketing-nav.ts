/**
 * The Marketing hub's AGENCY-PLANE structure, declared ONCE.
 *
 * The user is an agency; a brand is one of their clients (2026-08-28
 * agency-model restructure — docs/handoffs/marketing-agency-restructure.md).
 * These pillars are ONLY what concerns no single client: the roster,
 * cross-client roll-ups, operations, and generic tools. Everything else lives
 * in the client workspace (`/marketing/[brandId]/…`, declared in
 * `lib/brand-sections.ts`). Anything that renders a map of Marketing (the
 * `/marketing` hub, `/marketing/tools`, the shell nav) reads this file so a
 * new surface can never be added to one menu and missed by the others.
 *
 * Consumed by:
 *   • app/(core)/marketing/page.tsx        — the hub landing
 *   • app/(core)/marketing/tools/page.tsx  — the public-tool index
 *   • features/shell/constants/nav-data.ts — the sidebar / profile menu
 */

import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  BING_PROVIDER,
  GOOGLE_SEARCH_CONSOLE_PROVIDER,
} from "@/features/marketing/lib/provider-names";
import type { ShellIconName } from "@/features/shell/shellIconMap";

export interface MarketingNavEntry {
  label: string;
  href: string;
  description: string;
  /** Lucide icon name — resolved by the consuming surface. */
  iconName: ShellIconName;
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
  iconName: ShellIconName;
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

export interface MarketingPublicToolCategory {
  key: string;
  label: string;
  /** One line under the category heading on the public index. */
  subtitle: string;
  tools: readonly MarketingNavEntry[];
}

/**
 * The PUBLIC SEO tool suite, declared ONCE — live analyzers AND the planned
 * ones we advertise. The live tools deliberately live on `/seo/*` in the
 * `(public)` route group (anonymous lead-gen; must render without a session).
 *
 * Consumed by:
 *   • app/(public)/seo/page.tsx           — the public categorized index
 *   • app/(core)/marketing/tools/page.tsx — the in-app index (live tools)
 *   • the SEO Tools pillar below          — hub + sidebar (live tools)
 *
 * Planned tools carry `status: "coming-soon"` + a `marketing.tools.*` row in
 * `lib/coming-soon/registry.ts` (a shown promise is tracked like a defect).
 * Their hrefs are the permanent future URLs but the routes do NOT exist yet —
 * render them as non-links until each ships.
 */
export const MARKETING_PUBLIC_TOOL_CATEGORIES: readonly MarketingPublicToolCategory[] =
  [
    {
      key: "on-page",
      label: "On-Page Analysis",
      subtitle: "Inspect and score every element Google reads on your pages",
      tools: [
        {
          label: "Meta Title & Description",
          href: "/seo/metadata",
          description:
            "Live Google SERP preview with a pixel-width meta title/description calculator.",
          iconName: "FileText",
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
          label: "Page Audit",
          href: "/seo/page-audit",
          description:
            "Run the deterministic on-page audit rules against any public URL.",
          iconName: "ClipboardCheck",
          external: true,
        },
        {
          label: "Heading Structure Analyzer",
          href: "/seo/heading-structure",
          description:
            "Visualize the H1–H6 hierarchy of any page and flag structural issues that hurt crawlability.",
          iconName: "Layers",
          external: true,
          status: "coming-soon",
          comingSoonId: "marketing.tools.heading-structure",
        },
        {
          label: "Structured Data",
          href: "/seo/structured-data",
          description: "Validate schema.org structured data on any page.",
          iconName: "Braces",
          external: true,
        },
      ],
    },
    {
      key: "content",
      label: "AI Content Intelligence",
      subtitle: "Let an LLM analyze, score, and improve your content",
      tools: [
        {
          label: "AI Visibility Report",
          href: "/seo/ai-visibility",
          description:
            "Compare how ChatGPT, Claude, Gemini, and Perplexity recommend any brand and share the report.",
          iconName: "MessageSquareQuote",
          external: true,
        },
        {
          label: "Content Quality Scorer",
          href: "/seo/content-score",
          description:
            "AI reads your page and scores readability, depth, E-E-A-T signals, and topical coverage against the top 10 SERP results.",
          iconName: "Brain",
          external: true,
          status: "coming-soon",
          comingSoonId: "marketing.tools.content-score",
        },
        {
          label: "Content Brief Generator",
          href: "/seo/content-brief",
          description:
            "Provide a keyword, and the AI builds a complete content brief — target audience, outline, FAQs, and internal link suggestions.",
          iconName: "PenTool",
          external: true,
          status: "coming-soon",
          comingSoonId: "marketing.tools.content-brief",
        },
        {
          label: "AI Meta Tag Writer",
          href: "/seo/meta-writer",
          description:
            "Paste your page content or URL, and the AI drafts optimized title and description variants ranked by predicted CTR.",
          iconName: "PenLine",
          external: true,
          status: "coming-soon",
          comingSoonId: "marketing.tools.meta-writer",
        },
        {
          label: "Readability Analyzer",
          href: "/seo/readability",
          description:
            "Score content across Flesch-Kincaid, Gunning Fog, and SMOG indexes, with sentence-level suggestions from an LLM.",
          iconName: "Eye",
          external: true,
          status: "coming-soon",
          comingSoonId: "marketing.tools.readability",
        },
      ],
    },
    {
      key: "keywords",
      label: "Keyword Research",
      subtitle: "Find, cluster, and prioritize the terms that drive traffic",
      tools: [
        {
          label: "AI Keyword Clusterer",
          href: "/seo/keyword-clustering",
          description:
            "Paste a list of keywords and the AI groups them by semantic intent, making it easy to plan pages and content hubs.",
          iconName: "Layers",
          external: true,
          status: "coming-soon",
          comingSoonId: "marketing.tools.keyword-clustering",
        },
        {
          label: "SERP Intent Analyzer",
          href: "/seo/serp-analysis",
          description:
            "Scrape the top 10 results for any keyword and use an LLM to identify the dominant search intent and content format.",
          iconName: "Search",
          external: true,
          status: "coming-soon",
          comingSoonId: "marketing.tools.serp-analysis",
        },
        {
          label: "Keyword Research & Relationships",
          href: "/marketing/keyword-research",
          description:
            "AI maps a keyword's parents, children, variants and related terms, then pulls live search volume, CPC and demand trends.",
          iconName: "TrendingUp",
        },
        {
          label: "Title Tag Optimizer",
          href: "/seo/title-optimizer",
          description:
            "A/B-test headline variants with predicted CTR scoring. LLM rewrites your titles for clarity, keyword placement, and length.",
          iconName: "BarChart3",
          external: true,
          status: "coming-soon",
          comingSoonId: "marketing.tools.title-optimizer",
        },
      ],
    },
    {
      key: "technical",
      label: "Technical SEO",
      subtitle: "Diagnose infrastructure issues that block rankings",
      tools: [
        {
          label: "Redirect Chain Tracer",
          href: "/seo/redirect-tracer",
          description:
            "Follow every redirect hop from a URL and surface chain loops, unnecessary hops, and mixed-protocol issues.",
          iconName: "Link2",
          external: true,
          status: "coming-soon",
          comingSoonId: "marketing.tools.redirect-tracer",
        },
        {
          label: "Robots Tester",
          href: "/seo/robots-tester",
          description:
            "Test robots.txt rules against specific URLs and user agents.",
          iconName: "FileSearch",
          external: true,
        },
        {
          label: "Core Web Vitals Analyzer",
          href: "/seo/page-speed",
          description:
            "Measure LCP, CLS, and INP with an AI summary of the biggest opportunities to improve your CWV scores.",
          iconName: "Zap",
          external: true,
          status: "coming-soon",
          comingSoonId: "marketing.tools.page-speed",
        },
        {
          label: "Hreflang Validator",
          href: "/seo/hreflang",
          description:
            "Scrape a URL and validate all hreflang tags — check for missing reciprocals, incorrect locale codes, and self-referencing issues.",
          iconName: "Globe",
          external: true,
          status: "coming-soon",
          comingSoonId: "marketing.tools.hreflang",
        },
      ],
    },
  ];

/**
 * The LIVE public analyzers on `/seo/*`, flattened — surfaced in-app so an
 * authed user never has to leave the product to find them. Derived from the
 * categorized declaration above; never a second hand-maintained list.
 */
export const MARKETING_PUBLIC_TOOLS: readonly MarketingNavEntry[] =
  MARKETING_PUBLIC_TOOL_CATEGORIES.flatMap((c) => c.tools).filter(
    (t) => t.status !== "coming-soon" && t.external,
  );

export const MARKETING_PILLARS: readonly MarketingNavPillar[] = [
  {
    key: "clients",
    label: "Clients & Brands",
    description:
      "Every client you manage. Open a brand for its whole workspace — identity, websites, socials, locations, SEO, content, email, PR, ads, intelligence, and planning.",
    iconName: "Landmark",
    landingItems: [
      "One workspace per client brand",
      "Identity: assets, guides, offerings",
      "Websites, socials, and locations",
      "SEO, content, email, PR, and ads",
    ],
    landingHref: "/marketing/brands",
    entries: [
      {
        label: "Brands",
        href: marketingRoutes.brands(),
        description:
          "The client roster. Everything about one client lives inside its brand.",
        iconName: "Landmark",
      },
    ],
  },
  {
    key: "reports",
    label: "Reports & Roll-ups",
    description:
      "Cross-client measurement — the numbers that span every brand you manage.",
    iconName: "FileBarChart",
    landingItems: [
      "Client-ready reports",
      "Cross-client rank roll-up",
      "Provider cost against ceilings",
      "Cross-channel analytics",
    ],
    entries: [
      {
        label: "Reports",
        href: marketingRoutes.reports(),
        description:
          "Scheduled, branded, client-ready reports assembled from live marketing data.",
        iconName: "FileBarChart",
      },
      {
        label: "Rank Roll-up",
        href: marketingRoutes.ranksRollup(),
        description:
          "Every tracked keyword across every brand and site — position, movement, freshness.",
        iconName: "TrendingUp",
      },
      {
        label: "Search Console",
        href: marketingRoutes.searchConsoleRollup(),
        description:
          "The full Search Console dataset across every client — pick a property and drill in.",
        iconName: "SearchCheck",
      },
      {
        label: "Cost",
        href: marketingRoutes.cost(),
        description:
          "Provider spend this month and last, against the org's monthly ceilings.",
        iconName: "CircleDollarSign",
      },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    description:
      "The agency's machinery — provider connections, automation engines, approvals, and data quality.",
    iconName: "Plug",
    landingItems: [
      GOOGLE_SEARCH_CONSOLE_PROVIDER.label,
      "GA4 + PageSpeed",
      BING_PROVIDER.label,
      "Automation run consoles",
    ],
    landingStatus: "Bring your own",
    entries: [
      {
        label: "Connections",
        href: marketingRoutes.connections(),
        description:
          "Connect Google, Bing, and other providers, then bind them to sites.",
        iconName: "Plug",
      },
      {
        label: "Automations",
        href: marketingRoutes.automations(),
        description:
          "Drive the coverage engines by hand and author the schedule for the brands your organization controls.",
        iconName: "Workflow",
      },
      {
        label: "Approvals",
        href: marketingRoutes.approvals(),
        description:
          "Every pending AI proposal across your clients, in one review queue.",
        iconName: "BadgeCheck",
      },
      {
        label: "SEO Capabilities",
        href: marketingRoutes.capabilitiesCatalog(),
        description:
          "The shared measurement catalogue — what's on for each website, with evidence.",
        iconName: "ClipboardCheck",
      },
      {
        label: "Data Quality",
        href: marketingRoutes.dataQuality(),
        description:
          "Controls for the keyword classifier and topic assigner.",
        iconName: "Wrench",
      },
    ],
  },
  {
    key: "tools",
    label: "SEO Tools & Research",
    description:
      "Focused analyzers and research that work on any URL — no client setup required.",
    iconName: "Wrench",
    landingItems: [
      "Meta title + description",
      "Page audit",
      "Social preview",
      "YouTube research",
    ],
    entries: [
      {
        label: "All SEO Tools",
        href: marketingRoutes.tools(),
        description: "The full analyzer suite in one index.",
        iconName: "Wrench",
      },
      {
        label: "YouTube Research",
        href: marketingRoutes.youtubeDiscovery(),
        description:
          "Find videos and compare creator authority, engagement, and research value.",
        iconName: "Video",
      },
      ...MARKETING_PUBLIC_TOOLS.slice(0, 3).map((tool) => ({
        ...tool,
        navHidden: true,
      })),
    ],
  },
];
