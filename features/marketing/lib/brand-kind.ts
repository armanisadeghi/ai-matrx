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
  /** Voice page header line. */
  voiceLine: string;
  rooms: Record<BrandRoom, { name: string; description: string }>;
}

export const BRAND_KIND_COPY: Record<BrandKind, BrandKindCopy> = {
  company: {
    label: "Company",
    hint: "A business, product or organization",
    createDescription: "Start from a website or a social handle.",
    possessive: "its",
    voiceLine: "How this brand actually writes",
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
    voiceLine: "How this person actually writes and speaks",
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
