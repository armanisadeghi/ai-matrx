/**
 * Person brand from a handle — the real I/O behind `person-brand-flow.ts`.
 * Every call is an existing door: social ingest (cost in points), the scraper
 * (`save_as_source: false` — a discovery read is never one of their Sources),
 * the CRM's governed party resolver, and the marketing brand/property writes.
 */

import { callApi, type ApiCallConfig } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import { resolveParty } from "@/features/crm/service";
import { createBrand, createProperty, createSite } from "../data/service";
import { ingestProfile } from "../social/server";
import { readProfile } from "../social/service";
import type { SocialPlatform, SocialProgress } from "../social/types";
import type { PersonBrandDeps, SeedProfile } from "./person-brand-flow";
import { seedFromProfileRow } from "./person-brand-flow";

/** One handle or profile URL → the stored profile (one profile page; it costs points). */
export async function lookUpSeedProfile(args: {
  handleOrUrl: string;
  platform?: SocialPlatform;
  organizationId: string;
  signal?: AbortSignal;
  onProgress?: (progress: SocialProgress) => void;
}): Promise<SeedProfile> {
  const result = await ingestProfile(
    { handleOrUrl: args.handleOrUrl.trim(), platform: args.platform, pages: 1 },
    { organizationId: args.organizationId, signal: args.signal, onProgress: args.onProgress },
  );
  const row = await readProfile(result.profile_id);
  if (!row) throw new Error("The profile was fetched but could not be read back. Try again.");
  return seedFromProfileRow(row);
}

/** Read a link-in-bio page through the scraper; answers every stream event. */
export async function scrapeLinkInBio(url: string, dispatch: AppDispatch): Promise<unknown[]> {
  const events: unknown[] = [];
  const result = await dispatch(
    callApi({
      path: "/scraper/quick-scrape",
      method: "POST",
      stream: true,
      body: {
        urls: [url],
        get_links: true,
        get_text_data: false,
        get_organized_data: false,
        get_structured_data: true,
        use_cache: true,
        // A discovery read, never one of the person's knowledge Sources.
        save_as_source: false,
      } as NonNullable<ApiCallConfig<"/scraper/quick-scrape", "POST">["body"]> & { save_as_source: false },
      onStreamEvent: (event) => events.push(event),
    }),
  );
  if (result.error) throw new Error(result.error.message ?? "The bio link could not be read.");
  for (const event of events) {
    const data = (event as { data?: { results?: { success?: boolean; failure_reason?: string }[] } }).data;
    const failed = data?.results?.find((r) => r.success === false);
    if (failed) throw new Error(`The bio link could not be read (${failed.failure_reason ?? "blocked or unreachable"}).`);
  }
  return events;
}

export const personBrandDeps: PersonBrandDeps = {
  resolvePerson: async ({ organizationId, displayName, seed }) => {
    const party = await resolveParty({
      kind: "person",
      displayName,
      orgId: organizationId,
      source: "social",
      sourceDetail: `Person brand from @${seed.handle} (${seed.platform})`,
      headline: seed.bio ? seed.bio.slice(0, 200) : undefined,
      // The seed carries the platform's own id — the same key tracking uses, so
      // tracking later lands on this person instead of a second one.
      externalIds: seed.platformUserId
        ? [{ platform: seed.platform, value: seed.platformUserId, handle: seed.handle, profileUrl: seed.profileUrl }]
        : [],
      attributes: { person_brand: true },
    });
    return party.partyId;
  },
  createBrand,
  createProperty,
  createSite,
};

