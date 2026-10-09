/**
 * Brand kind — the ONE switch between a company brand and a person brand
 * (a creator, coach, consultant or founder who IS the brand).
 *
 * `web.brand.kind` (company | person, default company) plus, for a person,
 * `person_party_id` (the crm.party they are) and `person_user_id` (set only by
 * that signed-in person: "this is me"). Contract: common-docs
 * systems/marketing/social/SCHEMA.md amendment A3.
 *
 * Every surface that words or orders something differently for a person reads
 * this file. A per-page `kind === "person" ? … : …` with its own copy is a fork;
 * add the word here instead.
 */

export type BrandKind = "company" | "person";

export const BRAND_KINDS: readonly BrandKind[] = ["company", "person"];

/** Any stored value → a kind; anything unknown reads as a company (the column default). */
export function brandKindOf(
  value: { kind?: string | null } | string | null | undefined,
): BrandKind {
  const raw = typeof value === "string" ? value : value?.kind;
  return raw === "person" ? "person" : "company";
}

export function isPersonBrand(value: { kind?: string | null } | string | null | undefined): boolean {
  return brandKindOf(value) === "person";
}

/** Whether the signed-in user is the person a person brand is. */
export function isBrandSelf(
  brand: { kind?: string | null; person_user_id?: string | null } | null | undefined,
  userId: string | null | undefined,
): boolean {
  return Boolean(brand && userId && isPersonBrand(brand) && brand.person_user_id === userId);
}

/** The Identity rooms (`/marketing/[brand]/identity`). */
export type BrandRoom =
  | "media"
  | "strategy"
  | "knowledge"
  | "offerings"
  | "guidelines"
  | "messaging"
  | "claims"
  | "voice"
  | "research"
  | "competitors"
  | "audience";

export interface BrandKindCopy {
  /** "Company" / "Person" — the choice on Add brand. */
  label: string;
  /** One line under the choice. */
  hint: string;
  /** The Add brand dialog description for this kind. */
  createDescription: string;
  /** Possessive for copy: "its" / "their". */
  possessive: string;
  /** Placeholder for the brand's one-line "what it does" field. */
  aboutPlaceholder: string;
  /** Voice page header line. */
  voiceLine: string;
  /** The rivals screen: its title, its add action, its name field, and its empty state. */
  rivals: {
    title: string;
    /** One rival, capitalised: the table column and row label ("Competitor" / "Peer"). */
    one: string;
    /** Lower-case singular / plural, for sentences. */
    oneLower: string;
    manyLower: string;
    add: string;
    namePlaceholder: string;
    emptyTitle: string;
    emptyLine: (brandName: string) => string;
  };
  /** The Offerings page line under its title. */
  offeringsLine: (brandName: string) => string;
  /** The brand Overview's section titles and empty lines. */
  overview: {
    /** The confirmed-facts card: "Business facts" / "About". */
    factsTitle: string;
    factsAdd: string;
    factsEmpty: string;
    /** The topical map card: "Topical map" / "Content map". */
    mapTitle: string;
    websitesEmpty: string;
  };
  /** The strategy page's noun: "brand strategy" / "strategy". */
  strategy: { noun: string };
  /** The audience page: what one entry is called. */
  audience: {
    /** Lower-case singular / plural: "persona" / "audience profile". */
    noun: string;
    plural: string;
    namePlaceholder: string;
    /** Which stored demographics keys the editor shows, in order (labels in persona-model). */
    fields: readonly string[];
  };
  rooms: Record<BrandRoom, { name: string; description: string }>;
}

export const BRAND_KIND_COPY: Record<BrandKind, BrandKindCopy> = {
  company: {
    label: "Company",
    hint: "A business, product or organization",
    createDescription: "Start from a website or a social handle.",
    possessive: "its",
    aboutPlaceholder: "What this company does",
    voiceLine: "How this brand actually writes",
    rivals: {
      title: "Competitors",
      one: "Competitor",
      oneLower: "competitor",
      manyLower: "competitors",
      add: "Add competitor",
      namePlaceholder: "Company name",
      emptyTitle: "No competitors yet",
      emptyLine: (brandName) =>
        `Add the rivals ${brandName} competes with, by website, social handle, or both.`,
    },
    offeringsLine: (brandName) => `What ${brandName} sells and what it charges.`,
    overview: {
      factsTitle: "Business facts",
      factsAdd: "Add fact",
      factsEmpty:
        "No confirmed facts yet. Add one directly, or review the discovery inbox to confirm phones, emails, addresses, and taglines.",
      mapTitle: "Topical map",
      websitesEmpty: "No website property yet.",
    },
    strategy: { noun: "brand strategy" },
    audience: {
      noun: "persona",
      plural: "personas",
      namePlaceholder: "IT director at a mid-size company",
      fields: ["age_range", "location", "job_titles", "income", "company_size"],
    },
    rooms: {
      media: {
        name: "Media",
        description:
          "Everything this brand owns or can draw on — its library, research captures, stock sources, and generated imagery.",
      },
      strategy: {
        name: "Strategy",
        description:
          "The business facts every website of this brand reads — what it does, who it serves, each service line and where it competes. Written by AI, corrected by you, inherited by every agent.",
      },
      knowledge: {
        name: "Knowledge",
        description:
          "What the business actually is: AI reads the website cold and proposes the model, the customers, and the money map — you rule every rung.",
      },
      offerings: {
        name: "Offerings",
        description:
          "The tree of what this client sells, and what each offering is worth — the spine every keyword and page is valued against.",
      },
      guidelines: {
        name: "Guidelines",
        description:
          "How this brand must be written about and what it must never claim — the rules every agent inherits.",
      },
      messaging: {
        name: "Messaging",
        description: "Mission, vision, story, pitches, messaging and content pillars, hashtags.",
      },
      claims: {
        name: "Claims",
        description: "Approved and forbidden claims, and the disclaimers that go with them.",
      },
      voice: {
        name: "Voice",
        description:
          "How this brand actually writes, measured from its real writing. Every pitch, reply, subject line and statement in its name is checked against it.",
      },
      research: { name: "Research", description: "Website, socials, top posts and speaking style." },
      competitors: {
        name: "Competitors",
        description: "Rivals by website and social account, and how they compare.",
      },
      audience: { name: "Audience", description: "Named personas — goals, pain points, objections, channels." },
    },
  },
  person: {
    label: "Person",
    hint: "A creator, coach or founder who is the brand",
    createDescription: "Start from one of their social handles.",
    possessive: "their",
    aboutPlaceholder: "What they do",
    voiceLine: "How this person actually writes and speaks",
    rivals: {
      title: "Peers",
      one: "Peer",
      oneLower: "peer",
      manyLower: "peers",
      add: "Add peer",
      namePlaceholder: "Name",
      emptyTitle: "No peers yet",
      emptyLine: (brandName) =>
        `Add the peers ${brandName} is measured against, by website or social handle.`,
    },
    offeringsLine: (brandName) => `What ${brandName} offers: programs and services.`,
    overview: {
      factsTitle: "About",
      factsAdd: "Add detail",
      factsEmpty: "Nothing confirmed yet. Add a detail, or confirm what discovery found.",
      mapTitle: "Content map",
      websitesEmpty: "No website yet.",
    },
    strategy: { noun: "strategy" },
    audience: {
      noun: "audience profile",
      plural: "audience profiles",
      namePlaceholder: "Busy lifter who trains three days a week",
      fields: ["age_range", "location", "life_stage", "interests", "platforms"],
    },
    rooms: {
      media: { name: "Media", description: "Their photos, videos, captures and generated imagery." },
      strategy: { name: "Strategy", description: "What they do, who they serve, where they compete." },
      knowledge: { name: "Knowledge", description: "Read from their bios, top posts and transcripts." },
      offerings: { name: "Offerings", description: "Programs, coaching, courses, products, sponsorships." },
      guidelines: { name: "Guidelines", description: "How to write as them, and what they never claim." },
      messaging: { name: "Messaging", description: "Story, pitches, content pillars, hashtags." },
      claims: { name: "Claims", description: "Approved and forbidden claims, with disclaimers." },
      voice: { name: "Voice", description: "Their own voice, measured from their posts and talks." },
      research: { name: "Research", description: "Their accounts, top posts and speaking style." },
      competitors: { name: "Peers", description: "Peer creators by account, and how they compare." },
      audience: { name: "Audience", description: "Their followers, as named audience segments." },
    },
  },
};

export function brandKindCopy(value: { kind?: string | null } | string | null | undefined): BrandKindCopy {
  return BRAND_KIND_COPY[brandKindOf(value)];
}

/**
 * The brand sidebar's arrangement for a kind. A person brand has no storefront:
 * Locations is hidden, and Websites + SEO move under "More" until the person
 * has a website (then they stand in their usual place). Company: unchanged.
 */
export function arrangeBrandNav<M extends { slug: string; group: string }>(
  groups: readonly { label: string; modes: M[] }[],
  kind: BrandKind,
  hasWebsite: boolean,
): { label: string; modes: M[] }[] {
  if (kind !== "person") return groups.map((g) => ({ label: g.label, modes: g.modes }));
  const secondary = new Set(["websites", "seo"]);
  const next = groups
    .map((g) => ({
      label: g.label,
      modes: g.modes.filter(
        (m) => m.slug !== "locations" && (hasWebsite || !secondary.has(m.slug)),
      ),
    }))
    .filter((g) => g.modes.length > 0);
  if (hasWebsite) return next;
  const more = groups.flatMap((g) => g.modes.filter((m) => secondary.has(m.slug)));
  return more.length ? [...next, { label: "More", modes: more }] : next;
}

/** A sidebar row's label for a kind: the Competitors row reads Peers on a person brand. */
export function brandNavLabel(
  kind: BrandKind,
  mode: { slug: string; name: string; subPath?: string },
): string {
  if (mode.slug === "intelligence" && mode.subPath === "competitors") {
    return BRAND_KIND_COPY[kind].rooms.competitors.name;
  }
  return mode.name;
}
