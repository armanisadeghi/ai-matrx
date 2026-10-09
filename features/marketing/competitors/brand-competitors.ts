/**
 * The brand-level competitor list: website competitors (`seo.competitor`, through the brand's
 * sites) and social competitors (`social.tracked_account` role=competitor) in ONE list.
 *
 * A competitor that is both a domain and handles appears once: the platform association
 * `social_tracked_account → seo_competitor` ties its accounts to its domain. Accounts with no
 * link are grouped by the organization's label for them (set by "Add competitor" to the
 * competitor's name), else they stand alone.
 *
 * Reads go direct to Supabase under RLS. Creating a tracked account is NOT a client write: the
 * shared `social.social_profile` row it must point at is platform-written, so the intake
 * service creates both (see `trackSocialAccount`).
 */

import { supabase } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { callApi, type ApiCallConfig } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { Database } from "@/types/database.types";
import { extractSocialLinks, type FoundSocialLink } from "./social-links";
import { trackAccount, socialErrorMessage } from "../social/server";
import { SocialStreamError } from "../social/stream";
import type { SocialPlatform } from "../social/types";
import { BackendApiError } from "@/lib/api/errors";
import { formatSocialHandle } from "../lib/social-handle";
import { findSavedAccount, resolveTrackOutcome, type SavedAccountRow } from "./track-outcome";

const OUTLIER_WINDOW_DAYS = 30;

export interface CompetitorAccount {
  trackedAccountId: string;
  profileId: string;
  platform: string;
  handle: string;
  displayName: string | null;
  profileUrl: string | null;
  followers: number | null;
  status: string;
  trackingStatus: string;
  lastRefreshedAt: string | null;
  /** Posts stored for this profile (any age). */
  postsTracked: number;
  /** Best outlier multiple among posts from the last 30 days. */
  topOutlier: { score: number; postUrl: string | null; views: number | null } | null;
}

export interface BrandCompetitor {
  /** Stable key: the seo.competitor id when there is one, else the label group. */
  key: string;
  name: string;
  domain: string | null;
  seoCompetitorId: string | null;
  siteId: string | null;
  websiteTracking: string | null;
  accounts: CompetitorAccount[];
  /** Present only on a row that is still being added: one entry per social handle. */
  progress?: { platform: string; state: "tracking" | "ok" | "failed"; message: string | null }[];
}

type SeoCompetitorRow = Pick<
  Database["seo"]["Tables"]["competitor"]["Row"],
  "id" | "site_id" | "normalized_domain" | "display_domain" | "display_name" | "tracking_status"
>;

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function listBrandCompetitors(
  brandId: string,
  siteIds: string[],
  signal?: AbortSignal,
): Promise<BrandCompetitor[]> {
  const sig = signal ?? new AbortController().signal;
  // 1. Website competitors through the brand's sites.
  let seoRows: SeoCompetitorRow[] = [];
  if (siteIds.length > 0) {
    const { data, error } = await supabase
      .schema("seo")
      .from("competitor")
      .select("id,site_id,normalized_domain,display_domain,display_name,tracking_status")
      .in("site_id", siteIds)
      .abortSignal(sig);
    if (error) throw error;
    seoRows = (data ?? []) as SeoCompetitorRow[];
  }

  // 2. Social competitors with their shared profile.
  const { data: tracked, error: trackedError } = await supabase
    .schema("social")
    .from("tracked_account")
    .select(
      "id,label,status,profile_id,profile:profile_id(id,platform,handle,display_name,profile_url,follower_count,status,last_refreshed_at)",
    )
    .eq("brand_id", brandId)
    .eq("role", "competitor")
    .is("deleted_at", null)
    .abortSignal(sig);
  if (trackedError) throw trackedError;
  const accountsRaw = tracked ?? [];

  const trackedIds = accountsRaw.map((t) => t.id);
  const profileIds = [...new Set(accountsRaw.map((t) => t.profile_id))];

  // 3. Links tracked account → seo competitor.
  const linkByAccount = new Map<string, string>();
  if (trackedIds.length > 0) {
    const { data: links, error: linkError } = await supabase
      .schema("platform")
      .from("associations")
      .select("source_id,target_id")
      .eq("source_type", "social_tracked_account")
      .eq("target_type", "seo_competitor")
      .in("source_id", trackedIds)
      .is("deleted_at", null)
      .abortSignal(sig);
    if (linkError) throw linkError;
    for (const l of links ?? []) linkByAccount.set(l.source_id, l.target_id);
  }

  // 4. Posts tracked + best 30-day outlier per profile.
  const postsByProfile = new Map<string, number>();
  const outlierByProfile = new Map<string, CompetitorAccount["topOutlier"]>();
  if (profileIds.length > 0) {
    const since = new Date(Date.now() - OUTLIER_WINDOW_DAYS * 86_400_000).toISOString();
    await Promise.all(
      profileIds.map(async (profileId) => {
        const { count, error } = await supabase
          .schema("social")
          .from("post")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId)
          .is("deleted_at", null);
        if (error) throw error;
        postsByProfile.set(profileId, count ?? 0);
      }),
    );
    const { data: recent, error: recentError } = await supabase
      .schema("social")
      .from("post")
      .select("profile_id,url,stat:post_stat(outlier_score,views)")
      .in("profile_id", profileIds)
      .gte("posted_at", since)
      .is("deleted_at", null)
      .limit(2000)
      .abortSignal(sig);
    if (recentError) throw recentError;
    for (const post of recent ?? []) {
      const stat = one(post.stat as { outlier_score: number | null; views: number | null } | { outlier_score: number | null; views: number | null }[] | null);
      if (!post.profile_id || stat?.outlier_score == null) continue;
      const best = outlierByProfile.get(post.profile_id);
      if (!best || stat.outlier_score > best.score) {
        outlierByProfile.set(post.profile_id, {
          score: Number(stat.outlier_score),
          postUrl: post.url ?? null,
          views: stat.views ?? null,
        });
      }
    }
  }

  // 5. Merge. Website competitors first; their linked accounts attach to them.
  const byKey = new Map<string, BrandCompetitor>();
  const bySeoId = new Map<string, BrandCompetitor>();
  const byDomain = new Map<string, BrandCompetitor>();
  for (const row of seoRows) {
    const existing = byDomain.get(row.normalized_domain);
    if (existing) {
      // Same domain through two of the brand's sites: one competitor.
      bySeoId.set(row.id, existing);
      continue;
    }
    const entry: BrandCompetitor = {
      key: `seo:${row.id}`,
      name: row.display_name?.trim() || row.display_domain,
      domain: row.display_domain,
      seoCompetitorId: row.id,
      siteId: row.site_id,
      websiteTracking: row.tracking_status,
      accounts: [],
    };
    byKey.set(entry.key, entry);
    bySeoId.set(row.id, entry);
    byDomain.set(row.normalized_domain, entry);
  }

  for (const t of accountsRaw) {
    const profile = one(t.profile as {
      id: string; platform: string; handle: string; display_name: string | null;
      profile_url: string | null; follower_count: number | null; status: string;
      last_refreshed_at: string | null;
    } | null);
    if (!profile) continue;
    const account: CompetitorAccount = {
      trackedAccountId: t.id,
      profileId: t.profile_id,
      platform: profile.platform,
      handle: profile.handle,
      displayName: profile.display_name,
      profileUrl: profile.profile_url,
      followers: profile.follower_count,
      status: profile.status,
      trackingStatus: t.status,
      lastRefreshedAt: profile.last_refreshed_at,
      postsTracked: postsByProfile.get(t.profile_id) ?? 0,
      topOutlier: outlierByProfile.get(t.profile_id) ?? null,
    };
    const linkedSeo = linkByAccount.get(t.id);
    let target = linkedSeo ? bySeoId.get(linkedSeo) : undefined;
    if (!target) {
      const name = t.label?.trim() || profile.display_name?.trim() || formatSocialHandle({ platform: profile.platform, handle: profile.handle, url: profile.profile_url });
      const key = `label:${name.toLowerCase()}`;
      target = byKey.get(key);
      if (!target) {
        // A label that names a website competitor attaches to it (same company, one row).
        const sameName = [...byDomain.values()].find((c) => c.name.toLowerCase() === name.toLowerCase());
        target = sameName ?? {
          key,
          name,
          domain: null,
          seoCompetitorId: null,
          siteId: null,
          websiteTracking: null,
          accounts: [],
        };
        if (!sameName) byKey.set(key, target);
      }
    }
    target.accounts.push(account);
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ── Add competitor ───────────────────────────────────────────────────────────

/**
 * The social intake contract this UI calls (aidream, lane SI-04/SI-08). Documented in
 * `features/marketing/competitors/FEATURE.md`. It is an NDJSON stream door; see `trackSocialAccount`.
 */

export interface TrackSocialRequest {
  platform: string;
  /** What the person typed or Find-their-socials found: a handle or a profile link. */
  handle_or_url: string;
  role: "competitor";
  brand_id: string;
  label: string;
}

export interface TrackSocialResult {
  platform: string;
  handleOrUrl: string;
  ok: boolean;
  unavailable: boolean;
  trackedAccountId: string | null;
  message: string | null;
}

/** Saved competitor accounts of a brand, straight from the database (the truth after a drop). */
async function listSavedCompetitorAccounts(brandId: string): Promise<SavedAccountRow[]> {
  const { data, error } = await supabase
    .schema("social")
    .from("tracked_account")
    .select("id,profile:profile_id(platform,handle)")
    .eq("brand_id", brandId)
    .eq("role", "competitor")
    .is("deleted_at", null);
  if (error) throw error;
  const rows: SavedAccountRow[] = [];
  for (const t of data ?? []) {
    const p = one(t.profile as { platform: string; handle: string } | { platform: string; handle: string }[] | null);
    if (p) rows.push({ trackedAccountId: t.id, platform: p.platform, handle: p.handle });
  }
  return rows;
}

/**
 * Track one handle through the stream-aware social door. A server refusal is reported as the
 * server's sentence; a dropped stream is NOT a verdict: the saved state is re-read and the
 * truth reported ("not reachable" only when nothing was saved either).
 */
export async function trackSocialAccount(req: TrackSocialRequest, organizationId: string): Promise<TrackSocialResult> {
  const base = { platform: req.platform, handleOrUrl: req.handle_or_url };
  const outcome = await resolveTrackOutcome({
    call: async () => {
      const answer = await trackAccount(
        {
          handleOrUrl: req.handle_or_url,
          platform: req.platform as SocialPlatform,
          role: req.role,
          brandId: req.brand_id,
          label: req.label,
        },
        { organizationId },
      );
      return { trackedAccountId: answer.tracked_account_id ?? null };
    },
    isRefusal: (e) => e instanceof SocialStreamError || (e instanceof BackendApiError && e.status !== null),
    refusalMessage: (e) => socialErrorMessage(e, "rejected"),
    verify: async () =>
      findSavedAccount(await listSavedCompetitorAccounts(req.brand_id), req.platform, req.handle_or_url)?.trackedAccountId ??
      null,
    transportMessage: (e) => (e instanceof Error ? e.message : null),
  });
  return { ...base, ...outcome };
}

/** Link a tracked account to a website competitor (platform association). */
export async function linkAccountToWebsiteCompetitor(
  trackedAccountId: string,
  seoCompetitorId: string,
  organizationId: string,
): Promise<void> {
  const { data: auth } = await getClaimsUser(supabase);
  const { error } = await supabase
    .schema("platform")
    .from("associations")
    .insert({
      source_type: "social_tracked_account",
      source_id: trackedAccountId,
      target_type: "seo_competitor",
      target_id: seoCompetitorId,
      organization_id: organizationId,
      created_by: auth?.user?.id ?? null,
    });
  if (error) throw error;
}

/** Create (or reuse) the website competitor for a domain on the brand's first site. */
export async function ensureWebsiteCompetitor(args: {
  siteId: string;
  organizationId: string;
  domain: string;
  name: string;
}): Promise<string> {
  const { data: auth, error: authError } = await getClaimsUser(supabase);
  if (authError || !auth.user) throw new Error("Your identity could not be verified, so nothing was added.");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("seo")
    .from("competitor")
    .upsert(
      {
        site_id: args.siteId,
        organization_id: args.organizationId,
        created_by: auth.user.id,
        normalized_domain: args.domain,
        display_domain: args.domain,
        display_name: args.name,
        discovery_source: "manual",
        tracking_status: "candidate",
        classification_status: "unclassified",
        provider_evidence: {},
        latest_autopsy: {},
        human_ruling: {},
        resolved_assessment: {},
        custom_labels: [],
        metadata: {},
        first_observed_at: now,
        last_observed_at: now,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "site_id,normalized_domain" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export function normalizeDomain(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/** "Find their socials": scrape the competitor's home page links with the existing scraper. */
/** The site blocks reading (or is down): a plain sentence, no vendor reason. The person adds the handles by hand. */
export class WebsiteUnreadableError extends Error {
  constructor() {
    super("Couldn't read that website");
    this.name = "WebsiteUnreadableError";
  }
}

export async function findSocialsOnWebsite(
  domain: string,
  dispatch: AppDispatch,
): Promise<FoundSocialLink[]> {
  // Every scraper endpoint streams NDJSON, so the events are collected and read together.
  const events: unknown[] = [];
  const result = await dispatch(
    callApi({
      path: "/scraper/quick-scrape",
      method: "POST",
      stream: true,
      body: {
        urls: [`https://${domain}`],
        get_links: true,
        get_text_data: false,
        get_organized_data: false,
        get_structured_data: true,
        use_cache: true,
        // A discovery read, not the person's own research: never land the page as one of
        // their knowledge Sources.
        save_as_source: false,
      } as NonNullable<ApiCallConfig<"/scraper/quick-scrape", "POST">["body"]> & {
        save_as_source: false;
      },
      onStreamEvent: (event) => events.push(event),
    }),
  );
  if (result.error) {
    throw new Error(result.error.message ?? "The website could not be read.");
  }
  const links = extractSocialLinks(events);
  if (links.length === 0) {
    // Say WHY nothing came back when the page itself could not be read.
    for (const event of events) {
      const data = (event as { data?: { results?: { success?: boolean; failure_reason?: string }[] } }).data;
      const failed = data?.results?.find((r) => r.success === false);
      if (failed) {
        throw new WebsiteUnreadableError();
      }
    }
  }
  return links;
}
