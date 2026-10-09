/**
 * Person brand from a handle — the creation logic, free of React and I/O.
 *
 *   1. look up   one social handle / profile URL → the stored profile (existing ingest)
 *   2. discover  bio + bio link (Linktree, Beacons, any page) → their other accounts + website
 *   3. confirm   the person picks which accounts are theirs
 *   4. create    crm.party (person) → web.brand (kind person) → one web.property per account
 *                (owner_kind person, owner_party_id) — then, optionally, track (cost shown first)
 *
 * Every I/O step is injected (`PersonBrandDeps`), so the order and the
 * failure handling are tested without a network. The UI is
 * `components/brands/PersonBrandCreator.tsx`; real deps are `person-brand-io.ts`.
 */

import type { CreateBrandInput, CreatePropertyInput, MarketingBrand } from "../types";
import type { BrandKind } from "./brand-kind";
import type { SocialPlatform, SocialProfileRow } from "../social/types";
import { SOCIAL_PLATFORMS } from "../social/types";
import {
  extractPresenceLinks,
  isLinkInBioUrl,
  likelyWebsite,
  parseHttpUrl,
  type DiscoveredAccount,
} from "./link-in-bio";

export interface SeedProfile {
  profileId: string;
  platform: SocialPlatform;
  /** The platform's own id for the account — the CRM's strongest match key. */
  platformUserId: string | null;
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  avatarFileId: string | null;
  externalUrl: string | null;
  profileUrl: string;
  followers: number | null;
  isBusiness: boolean | null;
}

function asPlatform(value: string): SocialPlatform | null {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(value) ? (value as SocialPlatform) : null;
}

/** The stored profile row → what the flow shows and prefills. */
export function seedFromProfileRow(row: SocialProfileRow): SeedProfile {
  const platform = asPlatform(row.platform);
  if (!platform) throw new Error(`That profile is on an unsupported platform (${row.platform}).`);
  const handle = (row.handle ?? "").replace(/^@/, "");
  return {
    profileId: row.id,
    platform,
    platformUserId: row.platform_user_id ?? null,
    handle,
    displayName: (row.display_name ?? "").trim() || handle,
    bio: (row.bio ?? "").trim(),
    avatarUrl: row.avatar_url ?? null,
    avatarFileId: row.avatar_file_id ?? null,
    externalUrl: row.external_url?.trim() || null,
    profileUrl: row.profile_url?.trim() || profileUrlFor(platform, handle),
    followers: row.follower_count ?? null,
    isBusiness: row.is_business ?? null,
  };
}

export function profileUrlFor(platform: SocialPlatform, handle: string): string {
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${handle}`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    case "youtube":
      return `https://www.youtube.com/@${handle}`;
    case "x":
      return `https://x.com/${handle}`;
    case "threads":
      return `https://www.threads.com/@${handle}`;
    case "facebook":
      return `https://www.facebook.com/${handle}`;
    case "linkedin":
      return `https://www.linkedin.com/in/${handle}`;
    case "pinterest":
      return `https://www.pinterest.com/${handle}`;
    case "reddit":
      return `https://www.reddit.com/user/${handle}`;
    case "snapchat":
      return `https://www.snapchat.com/add/${handle}`;
  }
}

export interface Discovery {
  /** Accounts found in the bio and on the bio link, the seed excluded. */
  accounts: DiscoveredAccount[];
  /** Other outbound links (podcast, shop, site), for the website choice. */
  links: string[];
  /** Best website guess (the bio link when it is a plain site, or a host carrying their name). */
  website: string | null;
  /** The link-in-bio page that was read, if any. */
  hub: string | null;
  /** Why the hub could not be read — shown, never swallowed; the accounts from the bio still stand. */
  hubError: string | null;
}

export interface DiscoverDeps {
  /** Read one page through the scraper (save_as_source=false); returns the raw stream events. */
  scrape: (url: string) => Promise<unknown>;
}

/** Bio + bio link → their other accounts and a website guess. Never throws for a hub failure. */
export async function discoverPresence(seed: SeedProfile, deps: DiscoverDeps): Promise<Discovery> {
  const ignore = [{ platform: seed.platform, handle: seed.handle }];
  const fromBio = extractPresenceLinks([seed.bio, seed.externalUrl ?? ""], { ignore });
  const hubCandidates = [seed.externalUrl, ...fromBio.links].filter(
    (u): u is string => Boolean(u) && isLinkInBioUrl(u),
  );
  // The bio link itself is a hub only when it is on a link-in-bio host; a bio
  // address mentioned in text is checked too (a "links: beacons.ai/…" line).
  const bioUrls = extractHubsFromText(seed.bio);
  const hub = hubCandidates[0] ?? bioUrls[0] ?? null;

  let accounts = fromBio.accounts;
  let links = fromBio.links.filter((u) => !isLinkInBioUrl(u));
  let hubError: string | null = null;
  if (hub) {
    try {
      const page = extractPresenceLinks(await deps.scrape(hub), { ignore });
      accounts = mergeAccounts(accounts, page.accounts);
      links = mergeLinks(links, page.links);
    } catch (error) {
      hubError = error instanceof Error && error.message ? error.message : "The bio link could not be read.";
    }
  }

  const plainBioSite =
    seed.externalUrl && !isLinkInBioUrl(seed.externalUrl) && !extractPresenceLinks(seed.externalUrl).accounts.length
      ? originOf(seed.externalUrl)
      : null;
  const website = plainBioSite ?? likelyWebsite(links, { handle: seed.handle, name: seed.displayName });
  return { accounts, links, website, hub, hubError };
}

function extractHubsFromText(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z.]{2,}\/[^\s]+)/gi)) {
    const candidate = m[0].startsWith("http") ? m[0] : `https://${m[0]}`;
    if (isLinkInBioUrl(candidate)) out.push(candidate.replace(/[.,;:!?]+$/, ""));
  }
  return out;
}

function originOf(url: string): string | null {
  const parsed = parseHttpUrl(url);
  return parsed ? `https://${parsed.hostname.toLowerCase().replace(/^www\./, "")}` : null;
}

function mergeAccounts(a: DiscoveredAccount[], b: DiscoveredAccount[]): DiscoveredAccount[] {
  const seen = new Set(a.map((x) => `${x.platform}:${x.handle.toLowerCase()}`));
  return [...a, ...b.filter((x) => !seen.has(`${x.platform}:${x.handle.toLowerCase()}`))];
}

function mergeLinks(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

export interface PersonBrandPlanInput {
  /** person (default): a creator who IS the brand; company: a business started from its handle. */
  kind?: BrandKind;
  organizationId: string;
  name: string;
  seed: SeedProfile;
  /** The accounts the person confirmed are theirs (the seed is always included). */
  chosen: DiscoveredAccount[];
  website: string | null;
  /** The signed-in user, only when they said "this is me". */
  selfUserId: string | null;
}

export interface PersonBrandPlan {
  partyName: string;
  brand: Omit<CreateBrandInput, "personPartyId">;
  properties: Array<Omit<CreatePropertyInput, "brandId" | "ownerPartyId">>;
}

/** The writes a confirmed person brand makes, in order. Pure. */
export function planPersonBrand(input: PersonBrandPlanInput): PersonBrandPlan {
  const name = input.name.trim() || input.seed.displayName || input.seed.handle;
  if (!name) throw new Error("A name is required.");
  const all: DiscoveredAccount[] = [
    { platform: input.seed.platform, handle: input.seed.handle, url: input.seed.profileUrl },
    ...input.chosen.filter(
      (a) => !(a.platform === input.seed.platform && a.handle.toLowerCase() === input.seed.handle.toLowerCase()),
    ),
  ];
  const website = input.website ? originOrUrl(input.website) : null;
  const kind: BrandKind = input.kind ?? "person";
  return {
    partyName: name,
    brand: {
      organizationId: input.organizationId,
      name,
      kind,
      personUserId: kind === "person" ? input.selfUserId : null,
      industry: null,
      description: input.seed.bio || null,
      websiteUrl: website,
      logoUrl: null,
      faviconUrl: null,
      ogImageUrl: null,
      notes: null,
      status: "active",
    },
    properties: all.map((a) => ({
      organizationId: input.organizationId,
      kind: a.platform,
      url: a.url,
      handle: a.handle,
      displayName: a.platform === input.seed.platform && a.handle === input.seed.handle ? input.seed.displayName : null,
      status: "active",
      ownerKind: kind,
    })),
  };
}

function originOrUrl(raw: string): string {
  const parsed = parseHttpUrl(raw);
  return parsed ? parsed.href.replace(/\/$/, "") : raw.trim();
}

export interface PersonBrandDeps {
  /** Find-or-create the person (crm governed resolver). */
  resolvePerson: (args: {
    organizationId: string;
    displayName: string;
    seed: SeedProfile;
    accounts: DiscoveredAccount[];
  }) => Promise<string>;
  createBrand: (input: CreateBrandInput) => Promise<MarketingBrand>;
  createProperty: (input: CreatePropertyInput) => Promise<{ id: string }>;
}

export interface CreatedPersonBrand {
  brand: MarketingBrand;
  /** The person's crm.party; null for a company brand. */
  partyId: string | null;
  /** One per planned account: the property id, or why it failed (the brand still stands). */
  properties: Array<{ platform: string; handle: string; url: string | null; propertyId: string | null; error: string | null }>;
}

/** Run a plan: person, brand, then each account. A failed account never undoes the brand. */
export async function createPersonBrand(
  plan: PersonBrandPlan,
  seed: SeedProfile,
  deps: PersonBrandDeps,
): Promise<CreatedPersonBrand> {
  const accounts = plan.properties.map((p) => ({
    platform: p.kind as SocialPlatform,
    handle: p.handle ?? "",
    url: p.url ?? "",
  }));
  const partyId =
    plan.brand.kind === "person"
      ? await deps.resolvePerson({
          organizationId: plan.brand.organizationId,
          displayName: plan.partyName,
          seed,
          accounts,
        })
      : null;
  const brand = await deps.createBrand({ ...plan.brand, personPartyId: partyId });
  const properties: CreatedPersonBrand["properties"] = [];
  for (const p of plan.properties) {
    try {
      const row = await deps.createProperty({ ...p, brandId: brand.id, ownerPartyId: partyId });
      properties.push({ platform: p.kind, handle: p.handle ?? "", url: p.url, propertyId: row.id, error: null });
    } catch (error) {
      properties.push({
        platform: p.kind,
        handle: p.handle ?? "",
        url: p.url,
        propertyId: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { brand, partyId, properties };
}

/** What Add brand does with the first field: a social profile (person/handle path) or a website. */
export function classifyStartInput(text: string): "social" | "website" | "handle" | "empty" {
  const value = text.trim();
  if (!value) return "empty";
  if (/^@?[A-Za-z0-9._-]{2,40}$/.test(value) && !value.includes(".") ) return "handle";
  if (/^@[A-Za-z0-9._-]{2,40}$/.test(value)) return "handle";
  const accounts = extractPresenceLinks(/^https?:\/\//i.test(value) ? value : `https://${value}`).accounts;
  if (accounts.length) return "social";
  return parseHttpUrl(value) ? "website" : "handle";
}
