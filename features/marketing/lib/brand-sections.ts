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
  "Social",
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
  /**
   * This sub-routed row also names the section's BARE route and any child path
   * no sibling row claims (Socials → Accounts owns `/socials` and the account
   * and post detail pages), for route metadata.
   */
  bareRoute?: boolean;
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
    // Ruling 2026-10-09: the brand's HOME is Overview (the root row, labelled with
    // the brand's name). This room is the brand's Identity — never a second "home".
    name: "Identity",
    titlePrefix: "Brand Identity",
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
    name: "Accounts",
    titlePrefix: "Social Accounts",
    description:
      "Tracked and own social accounts for this brand — track, compare, and open any account.",
    letter: "Sa",
    iconName: "Users",
    group: "Social",
    subPath: "accounts",
    bareRoute: true,
  },
  {
    slug: "socials",
    name: "Studio",
    titlePrefix: "Social Studio",
    description:
      "The social board — ideas, drafts, and references laid out for this brand.",
    letter: "Sk",
    iconName: "LayoutDashboard",
    group: "Social",
    subPath: "studio",
  },
  {
    slug: "socials",
    name: "Outliers",
    titlePrefix: "Outliers",
    description:
      "Posts that beat their account's normal — what is working right now.",
    letter: "Ot",
    iconName: "TrendingUp",
    group: "Social",
    subPath: "outliers",
  },
  {
    slug: "socials",
    name: "Swipe file",
    titlePrefix: "Swipe File",
    description:
      "Saved posts and ads worth learning from, with notes and tags.",
    letter: "Sf",
    iconName: "BookmarkCheck",
    group: "Social",
    subPath: "swipe",
  },
  {
    slug: "socials",
    // "Ad library" — competitor ad research; never "Ads" beside the Advertising
    // section (the brand's own ad accounts), which read as the same thing.
    name: "Ad library",
    titlePrefix: "Ad Library",
    description:
      "Ads the tracked accounts are running, from the platforms' ad libraries.",
    letter: "Sj",
    iconName: "Megaphone",
    group: "Social",
    subPath: "ads",
  },
  {
    slug: "socials",
    name: "KPIs",
    titlePrefix: "Social KPIs",
    description:
      "Followers, growth, and goals for the brand's own accounts.",
    letter: "Kp",
    iconName: "Target",
    group: "Social",
    subPath: "kpis",
  },
  {
    slug: "seo",
    name: "SEO",
    titlePrefix: "SEO",
    description:
      "The organic-search practice on this brand's sites — keywords, rankings, technical, links, AI visibility.",
    letter: "Sr",
    iconName: "Search",
    group: "Marketing",
  },
  {
    slug: "content",
    name: "Content",
    titlePrefix: "Content",
    description:
      "The topical map: which pages this brand should have and where they live. The content plan produces what it calls for.",
    letter: "Tm",
    iconName: "Network",
    group: "Marketing",
    // ⚠️ `/marketing/<brand>/content` answered with `permanentRedirect` (HTTP
    // 308) into the content plan until the map took that slot on 2026-09-16,
    // and browsers cache a 308 indefinitely. Pointing this row at the
    // `content/map` address means the sidebar never exercises anyone's cached
    // redirect; `/content` itself still renders the same screen.
    subPath: "map",
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
    slug: "pr",
    name: "Outreach",
    titlePrefix: "Outreach",
    description:
      "Link and PR prospecting, sequenced contact, and earned-placement tracking.",
    letter: "Ou",
    iconName: "Send",
    group: "Marketing",
    subPath: "outreach",
  },
  {
    // The PR calendar lives on the reserved Planning calendar route; a PR person
    // looks for it beside the Press Room and Outreach, so it is listed here.
    slug: "planning",
    name: "PR Calendar",
    titlePrefix: "PR Calendar",
    description:
      "The sourced moments worth pitching over the next six months, with pitch windows for every kind of outlet.",
    letter: "Cy",
    iconName: "CalendarDays",
    group: "Marketing",
    subPath: "calendar",
  },
  {
    slug: "ads",
    name: "Advertising",
    titlePrefix: "Advertising",
    description:
      "Ad accounts, campaigns, creative, and budgets across Google, Meta, and LinkedIn.",
    letter: "Az",
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
    letter: "Ru",
    iconName: "ShieldCheck",
    group: "Insight",
    subPath: "reputation",
  },
  {
    slug: "analytics",
    name: "Analytics",
    titlePrefix: "Analytics",
    description:
      "Google Analytics traffic and conversion per website today; the other channels join it as they land.",
    letter: "Ay",
    iconName: "ChartNoAxesColumn",
    group: "Insight",
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
    const path = "subPath" in section && section.subPath
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

/**
 * Route-backed promises that live BELOW a brand section rather than being a
 * section themselves (each is a real reserved route under `/marketing/[brand]`
 * rendering `<MarketingComingSoon>`). Declared here so the coming-soon drift
 * test can prove every marketing registry row is rendered somewhere.
 */
export const MARKETING_BRAND_SUBROUTE_PROMISES: readonly {
  comingSoonId: string;
  subRoute: string;
}[] = [
  // The route renders the PR calendar today; the cross-channel timeline it promises is
  // still unbuilt and is announced on that page (features/marketing/pr/calendar).
  { comingSoonId: "marketing.calendar", subRoute: "planning/calendar" },
  { comingSoonId: "marketing.content-studio", subRoute: "content/studio" },
  // The ad CENTER (campaigns, creative, budgets across providers) is still a
  // promise; the live Google Ads workspace is its first room at `ads`.
  { comingSoonId: "marketing.ads", subRoute: "ads" },
  // Socials: Accounts, Outliers, Swipe file, Ad library, KPIs and the detail pages are live; the umbrella
  // row is still being built.
  { comingSoonId: "marketing.social", subRoute: "socials" },
];

/** The unique filesystem segments under `/marketing/[brandId]` (drift test). */
export function listMarketingBrandSegments(): string[] {
  return [
    ...new Set(
      MARKETING_BRAND_SECTIONS.map((section) => section.slug).filter(Boolean),
    ),
  ].sort();
}
