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
}

export interface MarketingNavPillar {
  key: string;
  label: string;
  /** One line on what this pillar of marketing is for. */
  description: string;
  iconName: string;
  entries: readonly MarketingNavEntry[];
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
    ],
  },
  {
    key: "planning",
    label: "Content Planning",
    description:
      "What you intend to publish — pillars, clusters, briefs, and the keywords behind each URL.",
    iconName: "ListTree",
    entries: [
      {
        label: "Content Plan",
        href: marketingRoutes.contentPlan(),
        description:
          "Plan every URL a site should have — pillars, clusters, briefs, owners.",
        iconName: "ListTree",
      },
    ],
  },
  {
    key: "search",
    label: "Discovery, Search & Keywords",
    description:
      "Find expert source material, understand how the market searches, and track where you rank.",
    iconName: "Search",
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
        iconName: "Youtube",
      },
    ],
  },
  {
    key: "tools",
    label: "SEO Tools",
    description:
      "Focused analyzers that work on any URL — no site setup required.",
    iconName: "Wrench",
    entries: [
      {
        label: "All SEO Tools",
        href: marketingRoutes.tools(),
        description: "The full analyzer suite in one index.",
        iconName: "Wrench",
      },
      ...MARKETING_PUBLIC_TOOLS.slice(0, 3),
    ],
  },
  {
    key: "operations",
    label: "Data & Operations",
    description:
      "The plumbing — provider connections, batch runs, and what it all costs.",
    iconName: "Plug",
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
        label: "Cost",
        href: marketingRoutes.cost(),
        description: "Review marketing cost across sites and organizations.",
        iconName: "CircleDollarSign",
      },
    ],
  },
];
