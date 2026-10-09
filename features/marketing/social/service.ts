/**
 * Social Intelligence — the READ door. React -> Supabase directly under RLS
 * (the Python server is not a DB gateway). Layer A tables (profile, post,
 * stat, snapshots, transcript, ad) are readable by every signed-in
 * organization; Layer B (tracked_account, post_analysis, swipe_collection,
 * watchlist_hit) by the owning organization. Writes that need a provider go
 * through `./server.ts`; plain row edits (role/label/notes) live here.
 *
 * `readAllRows` on every unbounded list: a bare `.select()` caps silently at
 * 1000 rows.
 */

"use client";

import { readAllRows } from "@ai-matrx/data/db";

import { supabase } from "@/utils/supabase/client";

import type {
  AccountPostStat,
  OwnPropertyInput,
} from "./mappers";
import { buildAccountRows } from "./mappers";
import type {
  AccountRow,
  PostAnalysisRow,
  PostCardModel,
  PostMetricSnapshotRow,
  PostStatRow,
  PostTranscriptRow,
  ProfileSnapshotRow,
  SocialPostRow,
  SocialProfileRow,
  SwipeCollectionRow,
  TrackedAccountRow,
  TrackedRole,
} from "./types";
import { toPostCardModel } from "./mappers";

const SOCIAL_KINDS = [
  "instagram", "facebook", "x", "tiktok", "youtube", "linkedin",
  "pinterest", "threads", "reddit", "snapchat",
];

function fail(label: string, message: string): never {
  throw new Error(`${label}: ${message}`);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/**
 * Tracked accounts this brand shows: the organization's rows that belong to
 * the brand, or to no brand yet (an organization-wide account is every
 * brand's to see until it is assigned). Soft-deleted rows never list.
 */
export async function readTrackedAccounts(args: {
  organizationId: string;
  brandId: string;
  signal?: AbortSignal;
}): Promise<TrackedAccountRow[]> {
  return readAllRows<TrackedAccountRow>(
    ({ from, to }) => {
      let q = supabase
        .schema("social")
        .from("tracked_account")
        .select("*", { count: "exact" })
        .eq("organization_id", args.organizationId)
        .or(`brand_id.eq.${args.brandId},brand_id.is.null`)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (args.signal) q = q.abortSignal(args.signal);
      return q.returns<TrackedAccountRow[]>();
    },
    { label: "social.tracked_account list" },
  );
}

/** The brand's own social properties (`web.property`). */
export async function readOwnProperties(args: {
  organizationId: string;
  brandId: string;
  signal?: AbortSignal;
}): Promise<OwnPropertyInput[]> {
  let q = supabase
    .schema("web")
    .from("property")
    .select("id, kind, handle, url, display_name")
    .eq("organization_id", args.organizationId)
    .eq("brand_id", args.brandId)
    .in("kind", SOCIAL_KINDS)
    .is("deleted_at", null);
  if (args.signal) q = q.abortSignal(args.signal);
  const { data, error } = await q;
  if (error) fail("web.property social list", error.message);
  return (data ?? []) as OwnPropertyInput[];
}

export async function readProfiles(ids: readonly string[]): Promise<SocialProfileRow[]> {
  if (ids.length === 0) return [];
  const out: SocialProfileRow[] = [];
  for (const part of chunk(ids, 100)) {
    const { data, error } = await supabase
      .schema("social")
      .from("social_profile")
      .select("*")
      .in("id", part)
      .is("deleted_at", null);
    if (error) fail("social.social_profile read", error.message);
    out.push(...((data ?? []) as SocialProfileRow[]));
  }
  return out;
}

export async function readProfileSnapshots(
  ids: readonly string[],
  sinceIso?: string,
): Promise<ProfileSnapshotRow[]> {
  if (ids.length === 0) return [];
  const out: ProfileSnapshotRow[] = [];
  for (const part of chunk(ids, 100)) {
    const rows = await readAllRows<ProfileSnapshotRow>(
      ({ from, to }) => {
        let q = supabase
          .schema("social")
          .from("profile_snapshot")
          .select("*", { count: "exact" })
          .in("profile_id", part)
          .order("observed_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
        if (sinceIso) q = q.gte("observed_at", sinceIso);
        return q.returns<ProfileSnapshotRow[]>();
      },
      { label: "social.profile_snapshot series" },
    );
    out.push(...rows);
  }
  return out;
}

interface StatWithPost {
  post_id: string;
  views: number | null;
  outlier_score: number | null;
  post: { profile_id: string | null; posted_at: string | null } | null;
}

/** Per-post views + multiple for a set of profiles (account table roll-ups). */
export async function readAccountPostStats(
  profileIds: readonly string[],
): Promise<AccountPostStat[]> {
  if (profileIds.length === 0) return [];
  const out: AccountPostStat[] = [];
  for (const part of chunk(profileIds, 50)) {
    const rows = await readAllRows<StatWithPost>(
      ({ from, to }) =>
        supabase
          .schema("social")
          .from("post_stat")
          .select("post_id, views, outlier_score, post:post!inner(profile_id, posted_at)", {
            count: "exact",
          })
          .in("post.profile_id", part)
          .order("post_id", { ascending: true })
          .range(from, to)
          .returns<StatWithPost[]>(),
      { label: "social.post_stat account roll-up" },
    );
    for (const r of rows) {
      out.push({
        post_id: r.post_id,
        views: r.views,
        outlier_score: r.outlier_score,
        profile_id: r.post?.profile_id ?? null,
        posted_at: r.post?.posted_at ?? null,
      });
    }
  }
  return out;
}

/** Everything the Accounts table needs, assembled into rows. */
export async function readAccountRows(args: {
  organizationId: string;
  brandId: string;
  signal?: AbortSignal;
}): Promise<AccountRow[]> {
  const [tracked, properties] = await Promise.all([
    readTrackedAccounts(args),
    readOwnProperties(args),
  ]);
  const profileIds = [...new Set(tracked.map((t) => t.profile_id))];
  const since = new Date(Date.now() - 100 * 86_400_000).toISOString();
  const [profiles, snapshots, postStats] = await Promise.all([
    readProfiles(profileIds),
    readProfileSnapshots(profileIds, since),
    readAccountPostStats(profileIds),
  ]);
  return buildAccountRows({ tracked, profiles, snapshots, postStats, properties });
}

/** Edit a tracked account's role / label / notes / status (Layer B, RLS). */
export async function updateTrackedAccount(
  id: string,
  patch: Partial<Pick<TrackedAccountRow, "role" | "label" | "notes" | "status">>,
): Promise<void> {
  const { error } = await supabase
    .schema("social")
    .from("tracked_account")
    .update(patch)
    .eq("id", id);
  if (error) fail("social.tracked_account update", error.message);
}

export async function setTrackedRole(id: string, role: TrackedRole): Promise<void> {
  await updateTrackedAccount(id, { role });
}

// ---------------------------------------------------------------------------
// Account detail
// ---------------------------------------------------------------------------

export async function readProfile(profileId: string): Promise<SocialProfileRow | null> {
  const { data, error } = await supabase
    .schema("social")
    .from("social_profile")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();
  if (error) fail("social.social_profile read", error.message);
  return (data as SocialProfileRow | null) ?? null;
}

export async function readTrackedForProfile(args: {
  organizationId: string;
  profileId: string;
}): Promise<TrackedAccountRow | null> {
  const { data, error } = await supabase
    .schema("social")
    .from("tracked_account")
    .select("*")
    .eq("organization_id", args.organizationId)
    .eq("profile_id", args.profileId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) fail("social.tracked_account read", error.message);
  return (data as TrackedAccountRow | null) ?? null;
}

interface PostWithStat extends SocialPostRow {
  stat: PostStatRow[] | PostStatRow | null;
}

function firstStat(s: PostWithStat["stat"]): PostStatRow | null {
  if (!s) return null;
  return Array.isArray(s) ? (s[0] ?? null) : s;
}

/** Every post of one profile, with its stat, as card models. */
export async function readProfilePosts(args: {
  profileId: string;
  handle: string | null;
  signal?: AbortSignal;
}): Promise<PostCardModel[]> {
  const rows = await readAllRows<PostWithStat>(
    ({ from, to }) => {
      let q = supabase
        .schema("social")
        .from("post")
        .select("*, stat:post_stat(*)", { count: "exact" })
        .eq("profile_id", args.profileId)
        .is("deleted_at", null)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (args.signal) q = q.abortSignal(args.signal);
      return q.returns<PostWithStat[]>();
    },
    { label: "social.post list" },
  );
  return rows.map((r) =>
    toPostCardModel({ post: r, stat: firstStat(r.stat), handle: args.handle }),
  );
}

// ---------------------------------------------------------------------------
// Post detail
// ---------------------------------------------------------------------------

export interface PostDetailRead {
  post: SocialPostRow;
  stat: PostStatRow | null;
  profile: SocialProfileRow | null;
}

export async function readPostDetail(postId: string): Promise<PostDetailRead | null> {
  const { data, error } = await supabase
    .schema("social")
    .from("post")
    .select("*, stat:post_stat(*)")
    .eq("id", postId)
    .maybeSingle();
  if (error) fail("social.post read", error.message);
  if (!data) return null;
  const row = data as unknown as PostWithStat;
  const profile = row.profile_id ? await readProfile(row.profile_id) : null;
  return { post: row, stat: firstStat(row.stat), profile };
}

export async function readPostMetricSnapshots(postId: string): Promise<PostMetricSnapshotRow[]> {
  return readAllRows<PostMetricSnapshotRow>(
    ({ from, to }) =>
      supabase
        .schema("social")
        .from("post_metric_snapshot")
        .select("*", { count: "exact" })
        .eq("post_id", postId)
        .order("observed_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<PostMetricSnapshotRow[]>(),
    { label: "social.post_metric_snapshot series" },
  );
}

export async function readPostTranscript(postId: string): Promise<PostTranscriptRow | null> {
  const { data, error } = await supabase
    .schema("social")
    .from("post_transcript")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("social.post_transcript read", error.message);
  return (data as PostTranscriptRow | null) ?? null;
}

export async function readPostAnalysis(
  postId: string,
  organizationId: string,
): Promise<PostAnalysisRow | null> {
  const { data, error } = await supabase
    .schema("social")
    .from("post_analysis")
    .select("*")
    .eq("post_id", postId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("social.post_analysis read", error.message);
  return (data as PostAnalysisRow | null) ?? null;
}

export async function readSwipeCollections(args: {
  organizationId: string;
  brandId?: string;
}): Promise<SwipeCollectionRow[]> {
  const { data, error } = await supabase
    .schema("social")
    .from("swipe_collection")
    .select("*")
    .eq("organization_id", args.organizationId)
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) fail("social.swipe_collection list", error.message);
  return (data ?? []) as SwipeCollectionRow[];
}
