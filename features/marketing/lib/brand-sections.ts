import type { ShellIconName } from "@/features/shell/shellIconMap";

/**
 * The CLIENT WORKSPACE's sections — everything under `/marketing/[brandId]`.
 *
 * The user is an agency; the brand is one of their clients. Every section here
 * is about ONE client, grouped the way the design was ratified (2026-08-28):
 * Identity (what the brand IS), Properties (what it OWNS), Marketing (the
 * work), Insight (what's true around it), plus Inbox and Settings.
 *
 * Coming-soon sections are REAL reserved routes rendering
 * `<MarketingComingSoon>` and stay VISIBLE in the brand sidebar with their tag
 * (Arman's ruling for the client workspace — a promised section is part of the
 * map, never hidden). Each carries a `marketing.*` row in
 * `lib/coming-soon/registry.ts`.
 *
 * Consumed by the brand sidebar, the brand dashboard, route metadata, and the
 * filesystem drift test — one declaration, every surface.
 */

export const MARKETING_BRAND_SECTION_GROUPS = [
  "Start",
  "Identity",
  "Properties",
  "Marketing",
  "Insight",
  "Manage",
] as const;

export type MarketingBrandSectionGroup =
  (typeof MARKETING_BRAND_SECTION_GROUPS)[number];

export interface MarketingBrandSection {
  /** First path segment under `/marketing/[brandId]` ("" = the dashboard). */
  slug: string;
  name: string;
  titlePrefix: string;
  description: string;
  letter: string;
  iconName: ShellIconName;
  group: MarketingBrandSectionGroup;
  exact?: boolean;
  status?: "coming-soon";
  comingSoonId?: string;
  /**
   * Sidebar rows that live under this section's segment but deserve their own
   * row (e.g. Competitors under intelligence/). `slug` stays the segment that
   * owns the filesystem directory; `href` completes the address.
   */
  subPath?: string;
}

export const MARKETING_BRAND_SECTIONS = [
  {
    slug: "",
    name: "Overview",
    titlePrefix: "Brand Overview",
    description: "This client at a glance — properties, health, activity.",
    letter: "Bo",
    iconName: "Landmark",
    group: "Start",
    exact: true,
  },
  {
    slug: "identity",
    name: "Brand Home",
    titlePrefix: "Brand Home",
    description:
      "Who this brand is: media and assets today; guides, kit, offerings, and audience as they come home.",
    letter: "Id",
    iconName: "BadgeCheck",
    group: "Identity",
  },
  {
    slug: "websites",
    name: "Websites",
    titlePrefix: "Websites",
    description: "This brand's sites — pages, structure, crawls, settings.",
    letter: "Ws",
    iconName: "Globe",
    group: "Properties",
  },
  {
    slug: "locations",
    name: "Locations",
    titlePrefix: "Locations & Listings",
    description:
      "Business locations, Google Business Profiles, directory listings, and reviews.",
    letter: "Lc",
    iconName: "MapPin",
    group: "Properties",
  },
  {
    slug: "socials",
    name: "Socials",
    titlePrefix: "Social Accounts",
    description:
      "Connected social accounts — publishing, inbox, listening, and performance per account.",
    letter: "Sa",
    iconName: "Share2",
    group: "Properties",
    status: "coming-soon",
    comingSoonId: "marketing.social",
  },
  {
    slug: "seo",
    name: "SEO",
    titlePrefix: "SEO",
    description:
      "The organic-search practice on this brand's sites — keywords, rankings, technical, links, AI visibility.",
    letter: "Se",
    iconName: "Search",
    group: "Marketing",
  },
  {
    slug: "content",
    name: "Content",
    titlePrefix: "Content",
    description:
      "Plan every URL a site should have; produce what the plan calls for.",
    letter: "Cn",
    iconName: "ListTree",
    group: "Marketing",
  },
  {
    slug: "email",
    name: "Email",
    titlePrefix: "Email",
    description:
      "The mailbox you send from, the templates you send, and the sequences that send them.",
    letter: "Em",
    iconName: "Mail",
    group: "Marketing",
  },
  {
    slug: "pr",
    name: "Press & PR",
    titlePrefix: "Press Room",
    description:
      "What is genuinely newsworthy about this client, the proof, and the journalists to pitch.",
    letter: "Pr",
    iconName: "Newspaper",
    group: "Marketing",
  },
  {
    slug: "ads",
    name: "Advertising",
    titlePrefix: "Advertising",
    description:
      "Ad accounts, campaigns, creative, and budgets across Google, Meta, and LinkedIn.",
    letter: "Ad",
    iconName: "BadgeDollarSign",
    group: "Marketing",
  },
  {
    slug: "intelligence",
    name: "Competitors",
    titlePrefix: "Competitors",
    description:
      "Tracked rivals, share of voice, keyword and content gaps, and their movement.",
    letter: "Cm",
    iconName: "Swords",
    group: "Insight",
    subPath: "competitors",
  },
  {
    slug: "intelligence",
    name: "Monitoring",
    titlePrefix: "Monitoring",
    description:
      "Who wrote about this client, what happened to its links, and whether the answer engines cite it.",
    letter: "Mo",
    iconName: "Radar",
    group: "Insight",
    subPath: "monitoring",
  },
  {
    slug: "intelligence",
    name: "Reputation",
    titlePrefix: "Reputation",
    description:
      "Evidence-backed publication opportunities and reputation handling decisions.",
    letter: "Rp",
    iconName: "ShieldCheck",
    group: "Insight",
    subPath: "reputation",
  },
  {
    slug: "analytics",
    name: "Analytics",
    titlePrefix: "Analytics",
    description:
      "Cross-channel traffic, conversion, and attribution for this client.",
    letter: "An",
    iconName: "ChartNoAxesColumn",
    group: "Insight",
    status: "coming-soon",
    comingSoonId: "marketing.analytics",
  },
  {
    slug: "planning",
    name: "Planning",
    titlePrefix: "Planning",
    description:
      "Initiatives — the container above channels — and the marketing calendar.",
    letter: "Pl",
    iconName: "Target",
    group: "Insight",
  },
  {
    slug: "inbox",
    name: "Inbox",
    titlePrefix: "Discovery Inbox",
    description:
      "Review machine-found assets, properties, and facts before they join the brand.",
    letter: "In",
    iconName: "Inbox",
    group: "Manage",
  },
  {
    slug: "settings",
    name: "Settings",
    titlePrefix: "Brand Settings",
    description:
      "Keyword-value defaults, autonomy modes, and brand-level configuration.",
    letter: "St",
    iconName: "Settings",
    group: "Manage",
  },
] as const satisfies readonly MarketingBrandSection[];

export interface MarketingBrandMode extends MarketingBrandSection {
  href: string;
}

export function listMarketingBrandModes(
  brandPath: string,
): MarketingBrandMode[] {
  return MARKETING_BRAND_SECTIONS.map((section) => {
    const path = section.subPath
      ? `${section.slug}/${section.subPath}`
      : section.slug;
    return {
      ...section,
      href: path ? `${brandPath}/${path}` : brandPath,
    };
  });
}

export interface MarketingBrandModeGroup {
  label: MarketingBrandSectionGroup;
  modes: MarketingBrandMode[];
}

export function listMarketingBrandModeGroups(
  brandPath: string,
): MarketingBrandModeGroup[] {
  const modes = listMarketingBrandModes(brandPath);
  return MARKETING_BRAND_SECTION_GROUPS.map((label) => ({
    label,
    modes: modes.filter((mode) => mode.group === label),
  })).filter((group) => group.modes.length > 0);
}

/** The unique filesystem segments under `/marketing/[brandId]` (drift test). */
export function listMarketingBrandSegments(): string[] {
  return [
    ...new Set(
      MARKETING_BRAND_SECTIONS.map((section) => section.slug).filter(Boolean),
    ),
  ].sort();
}
