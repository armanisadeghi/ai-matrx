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

import type { Json } from "@/types/database.types";
import { readListRpc } from "@/lib/entity-list/readListRpc";
import type { LaneRow } from "@/lib/entity-list/laneRows";
import type {
  AccountPostStat,
} from "./mappers";
import {
  WATCHLIST_SURFACE,
  parseWatchlistDefinition,
  serializeWatchlistDefinition,
  type HitState,
  type OutlierFilter,
} from "./outliers";
import { brandSocialRowToAccountRow, buildAccountRows, type BrandSocialAccountRpcRow } from "./mappers";
import { parseAdvertiserDefinition, toAdCardModel } from "./ads";
import { buildSwipeItems, toSwipeEdge, type RawEdge } from "./swipe";
import type {
  AccountRow,
  AdCardModel,
  AdLibrary,
  AdvertiserDefinition,
  BrandPost,
  KpiGoalRow,
  WatchlistHitRow,
  PostAnalysisRow,
  PostCardModel,
  PostMetricSnapshotRow,
  PostStatRow,
  PostTranscriptRow,
  ProfileSnapshotRow,
  SocialPostRow,
  SocialProfileRow,
  SocialAdRow,
  SwipeCollectionRow,
  SwipeItem,
  TrackedAccountRow,
  TrackedAdvertiser,
  TrackedRole,
} from "./types";
import { isTrackedRole } from "./types";
import { hookLineOf, num, toPostCardModel } from "./mappers";

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

interface PostWithStatRollup {
  id: string;
  profile_id: string | null;
  posted_at: string | null;
  stat: { views: number | null; outlier_score: number | null }[] | { views: number | null; outlier_score: number | null } | null;
}

/**
 * Per-post views + multiple for a set of profiles (account table roll-ups). Read from the LIVE POSTS
 * (`deleted_at is null`), stat optional: the roll-up's post count is therefore the same number
 * `social.brand_social_accounts`, the competitors directory and the account page count (a post with
 * no stat row yet, or a removed post, used to make one account show 11 here and 12 there).
 */
export async function readAccountPostStats(
  profileIds: readonly string[],
): Promise<AccountPostStat[]> {
  if (profileIds.length === 0) return [];
  const out: AccountPostStat[] = [];
  for (const part of chunk(profileIds, 50)) {
    const rows = await readAllRows<PostWithStatRollup>(
      ({ from, to }) =>
        supabase
          .schema("social")
          .from("post")
          .select("id, profile_id, posted_at, stat:post_stat(views, outlier_score)", { count: "exact" })
          .in("profile_id", part)
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(from, to)
          .returns<PostWithStatRollup[]>(),
      { label: "social.post account roll-up" },
    );
    for (const r of rows) {
      const st = Array.isArray(r.stat) ? (r.stat[0] ?? null) : r.stat;
      out.push({
        post_id: r.id,
        views: st?.views ?? null,
        outlier_score: st?.outlier_score ?? null,
        profile_id: r.profile_id,
        posted_at: r.posted_at,
      });
    }
  }
  return out;
}

/** The brand's ONE social-account list (`social.brand_social_accounts`, RLS applies). */
export async function readBrandSocialAccounts(
  brandId: string,
  signal?: AbortSignal,
): Promise<AccountRow[]> {
  let q = supabase.schema("social").rpc("brand_social_accounts", { p_brand_id: brandId });
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) fail("social.brand_social_accounts", error.message);
  return ((data ?? []) as BrandSocialAccountRpcRow[]).map(brandSocialRowToAccountRow);
}

/** Per-brand account / tracked counts (`social.brand_social_counts`); brands with none are absent. */
export interface BrandSocialCount {
  brand_id: string;
  accounts: number;
  tracked: number;
  company_accounts: number;
  person_accounts: number;
}
export async function readBrandSocialCounts(
  brandIds: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, BrandSocialCount>> {
  if (brandIds.length === 0) return new Map();
  let q = supabase.schema("social").rpc("brand_social_counts", { p_brand_ids: [...brandIds] });
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) fail("social.brand_social_counts", error.message);
  return new Map(
    ((data ?? []) as BrandSocialCount[]).map((r) => [
      r.brand_id,
      {
        brand_id: r.brand_id,
        accounts: Number(r.accounts),
        tracked: Number(r.tracked),
        company_accounts: Number(r.company_accounts),
        person_accounts: Number(r.person_accounts),
      },
    ]),
  );
}

/**
 * Everything the Accounts table needs: the brand's social-account read (own / company / person
 * accounts, tracked or not) plus the competitor / inspiration accounts the organization tracks.
 * The own list is never re-merged here: it is the RPC's rows, identical to the Overview card.
 */
export async function readAccountRows(args: {
  organizationId: string;
  brandId: string;
  signal?: AbortSignal;
}): Promise<AccountRow[]> {
  const [brandRows, tracked] = await Promise.all([
    readBrandSocialAccounts(args.brandId, args.signal),
    readTrackedAccounts(args),
  ]);
  const seen = new Set(brandRows.map((r) => r.trackedAccountId).filter(Boolean));
  // Own accounts the organization tracks that the brand's property list does not carry yet: an account
  // attached through a connected-account flow lands org-wide (no brand, no property) until it is added.
  const others = tracked.filter(
    (t) => !seen.has(t.id) && t.role !== "client" && (t.role !== "own" || !t.brand_id || !t.property_id),
  );
  if (others.length === 0) return brandRows;
  const profileIds = [...new Set(others.map((t) => t.profile_id))];
  const since = new Date(Date.now() - 100 * 86_400_000).toISOString();
  const [profiles, snapshots, postStats] = await Promise.all([
    readProfiles(profileIds),
    readProfileSnapshots(profileIds, since),
    readAccountPostStats(profileIds),
  ]);
  const built = buildAccountRows({ tracked: others, profiles, snapshots, postStats });
  const unassigned = new Set(others.filter((t) => t.role === "own").map((t) => t.id));
  const competitors = built.map((r) =>
    r.trackedAccountId && unassigned.has(r.trackedAccountId) ? { ...r, unassigned: true } : r,
  );
  return [...brandRows, ...competitors];
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

// ---------------------------------------------------------------------------
// Brand roll-up (Outliers, KPIs, Analytics panel) — one read, many surfaces
// ---------------------------------------------------------------------------

/** How far back the brand roll-up reads posts and follower snapshots. */
export const BRAND_SOCIAL_LOOKBACK_DAYS = 400;

export interface BrandSocialData {
  accounts: AccountRow[];
  posts: BrandPost[];
  snapshots: ProfileSnapshotRow[];
}

/**
 * Everything the brand's tracked accounts have: account rows (the Accounts
 * table's own builder), posts with their stats and the owning account's role,
 * and the follower snapshots. Reads direct under RLS; no provider spend.
 */
export async function readBrandSocialData(args: {
  organizationId: string;
  brandId: string;
  signal?: AbortSignal;
}): Promise<BrandSocialData> {
  const tracked = await readTrackedAccounts(args);
  const profileIds = [...new Set(tracked.map((t) => t.profile_id))];
  const sinceIso = new Date(Date.now() - BRAND_SOCIAL_LOOKBACK_DAYS * 86_400_000).toISOString();
  const [profiles, snapshots, postRows] = await Promise.all([
    readProfiles(profileIds),
    readProfileSnapshots(profileIds, sinceIso),
    readPostsWithStats(profileIds),
  ]);
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const trackedByProfile = new Map(tracked.map((t) => [t.profile_id, t]));
  const posts: BrandPost[] = [];
  for (const row of postRows) {
    const t = row.profile_id ? trackedByProfile.get(row.profile_id) : undefined;
    if (!t) continue;
    const role: TrackedRole = isTrackedRole(t.role) ? t.role : "inspiration";
    const handle = row.profile_id ? (profileById.get(row.profile_id)?.handle ?? null) : null;
    posts.push({
      ...toPostCardModel({ post: row, stat: firstStat(row.stat), handle }),
      role,
      trackedAccountId: t.id,
    });
  }
  const postStats: AccountPostStat[] = posts.map((p) => ({
    post_id: p.postId,
    profile_id: p.profileId,
    posted_at: p.postedAt,
    views: p.views,
    outlier_score: p.outlierScore,
  }));
  const accounts = buildAccountRows({ tracked, profiles, snapshots, postStats });
  return { accounts, posts, snapshots };
}

/**
 * Every live post of the profiles. NOT date-limited: a creator's baseline (median / engagement) is
 * its latest N posts whatever their age, so a lookback window here made the KPI benchmark disagree
 * with the account page. Windows (7/30/90 days) are applied by the consumers.
 */
async function readPostsWithStats(profileIds: readonly string[], sinceIso?: string): Promise<PostWithStat[]> {
  const out: PostWithStat[] = [];
  for (const part of chunk(profileIds, 50)) {
    const rows = await readAllRows<PostWithStat>(
      ({ from, to }) => {
        let q = supabase
          .schema("social")
          .from("post")
          .select("*, stat:post_stat(*)", { count: "exact" })
          .in("profile_id", part)
          .is("deleted_at", null);
        if (sinceIso) q = q.gte("posted_at", sinceIso);
        return q
          .order("posted_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
          .returns<PostWithStat[]>();
      },
      { label: "social.post brand roll-up" },
    );
    out.push(...rows);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Watchlists (platform.saved_view, surface social.outliers) + hits
// ---------------------------------------------------------------------------

export interface WatchlistRow {
  id: string;
  name: string;
  filter: OutlierFilter;
  version: number;
}

/** The brand's watchlists. Writes go through the saved-view doors (`platform` is not client-writable). */
export async function readWatchlists(args: { brandId: string }): Promise<WatchlistRow[]> {
  const { data: lanes, error: laneError } = await readListRpc<LaneRow>(
    "saved_view_list_lanes",
    { p_surface_key: WATCHLIST_SURFACE, p_org_id: null },
    { order: ["lane", "id"] },
  );
  if (laneError) fail("saved_view_list_lanes", laneError.message);
  const ids = [...new Set((lanes ?? []).map((l) => l.id))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .schema("platform")
    .from("saved_view")
    .select("id, name, definition, version, subject_id")
    .in("id", ids)
    .eq("surface_key", WATCHLIST_SURFACE)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) fail("platform.saved_view watchlists", error.message);
  const out: WatchlistRow[] = [];
  for (const row of data ?? []) {
    const def = parseWatchlistDefinition(row.definition);
    if ((row.subject_id ?? def.brandId) !== args.brandId) continue;
    out.push({ id: row.id, name: row.name, filter: def.filter, version: row.version });
  }
  return out;
}

export async function createWatchlist(args: {
  organizationId: string;
  brandId: string;
  name: string;
  filter: OutlierFilter;
}): Promise<string> {
  const name = args.name.trim();
  if (!name) throw new Error("Name the watchlist");
  const { data, error } = await supabase.rpc("saved_view_save", {
    p_surface_key: WATCHLIST_SURFACE,
    p_organization_id: args.organizationId,
    p_subject_id: args.brandId,
    p_name: name,
    p_definition: serializeWatchlistDefinition(args.brandId, args.filter) as unknown as Json,
    p_visibility: "internal",
    p_touch: true,
  });
  if (error) {
    if (error.code === "23505") throw new Error(`A watchlist called "${name}" already exists`);
    fail("saved_view_save", error.message);
  }
  const row = data as { id?: string } | null;
  if (!row?.id) fail("saved_view_save", "the door returned no watchlist");
  return row.id;
}

export async function archiveWatchlist(id: string): Promise<void> {
  const { error } = await supabase.rpc("saved_view_archive", {
    p_surface_key: WATCHLIST_SURFACE,
    p_id: id,
  });
  if (error) fail("saved_view_archive", error.message);
}

export async function readWatchlistHits(savedViewIds: readonly string[]): Promise<WatchlistHitRow[]> {
  if (savedViewIds.length === 0) return [];
  return readAllRows<WatchlistHitRow>(
    ({ from, to }) =>
      supabase
        .schema("social")
        .from("watchlist_hit")
        .select("*", { count: "exact" })
        .in("saved_view_id", [...savedViewIds])
        .order("post_id", { ascending: true })
        .range(from, to)
        .returns<WatchlistHitRow[]>(),
    { label: "social.watchlist_hit list" },
  );
}

/** Mark posts seen / dismissed / saved: upsert one hit row per (watchlist, post). */
export async function setHitStates(args: {
  organizationId: string;
  savedViewId: string;
  items: ReadonlyArray<{ postId: string; score: number | null }>;
  state: HitState;
}): Promise<void> {
  if (args.items.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supabase
    .schema("social")
    .from("watchlist_hit")
    .upsert(
      args.items.map((i) => ({
        organization_id: args.organizationId,
        saved_view_id: args.savedViewId,
        post_id: i.postId,
        score: i.score,
        state: args.state,
        state_changed_at: now,
      })),
      { onConflict: "saved_view_id,post_id" },
    );
  if (error) fail("social.watchlist_hit write", error.message);
}

// ---------------------------------------------------------------------------
// KPI goals
// ---------------------------------------------------------------------------

export async function readKpiGoals(args: {
  organizationId: string;
  brandId: string;
}): Promise<KpiGoalRow[]> {
  return readAllRows<KpiGoalRow>(
    ({ from, to }) =>
      supabase
        .schema("social")
        .from("kpi_goal")
        .select("*", { count: "exact" })
        .eq("organization_id", args.organizationId)
        .eq("brand_id", args.brandId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<KpiGoalRow[]>(),
    { label: "social.kpi_goal list" },
  );
}

export interface KpiGoalInput {
  organizationId: string;
  brandId: string;
  metric: string;
  metricLabel: string | null;
  targetValue: number;
  baselineValue: number | null;
  period: string;
  startsOn: string;
  endsOn: string | null;
  platform: string | null;
  trackedAccountId: string | null;
}

export async function createKpiGoal(input: KpiGoalInput): Promise<string> {
  const { data, error } = await supabase
    .schema("social")
    .from("kpi_goal")
    .insert({
      organization_id: input.organizationId,
      brand_id: input.brandId,
      metric: input.metric,
      metric_label: input.metricLabel,
      target_value: input.targetValue,
      baseline_value: input.baselineValue,
      period: input.period,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      platform: input.platform,
      tracked_account_id: input.trackedAccountId,
    })
    .select("id")
    .single();
  if (error || !data) fail("social.kpi_goal create", error?.message ?? "The new goal could not be read back.");
  return data.id;
}

/** Edit a goal's target, metric, period and scope (Layer B, RLS). Start date and history stay. */
export async function updateKpiGoal(
  id: string,
  input: Pick<
    KpiGoalInput,
    "metric" | "metricLabel" | "targetValue" | "baselineValue" | "period" | "platform" | "trackedAccountId"
  >,
): Promise<void> {
  const { error } = await supabase
    .schema("social")
    .from("kpi_goal")
    .update({
      metric: input.metric,
      metric_label: input.metricLabel,
      target_value: input.targetValue,
      baseline_value: input.baselineValue,
      period: input.period,
      platform: input.platform,
      tracked_account_id: input.trackedAccountId,
    })
    .eq("id", id);
  if (error) fail("social.kpi_goal edit", error.message);
}

export async function updateKpiGoalStatus(id: string, status: "active" | "paused"): Promise<void> {
  const { error } = await supabase.schema("social").from("kpi_goal").update({ status }).eq("id", id);
  if (error) fail("social.kpi_goal update", error.message);
}

/** Soft delete: the goal leaves the list, the row stays. */
export async function archiveKpiGoal(id: string): Promise<void> {
  const { error } = await supabase
    .schema("social")
    .from("kpi_goal")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail("social.kpi_goal archive", error.message);
}

// ---------------------------------------------------------------------------
// Agency roll-up (/marketing/reports) — lists never filter by active org
// ---------------------------------------------------------------------------

export interface AgencyAccountRow {
  trackedAccountId: string;
  brandId: string | null;
  brandName: string;
  organizationId: string;
  profileId: string;
  platform: string;
  handle: string;
  profileUrl: string | null;
  displayName: string;
  role: TrackedRole;
  followers: number | null;
  lastRefreshedAt: string | null;
}

export interface AgencyOutlierRow {
  postId: string;
  brandId: string | null;
  profileId: string;
  brandName: string;
  platform: string;
  handle: string;
  profileUrl: string | null;
  url: string;
  hookLine: string;
  views: number | null;
  score: number;
  postedAt: string | null;
}

export interface AgencySocial {
  accounts: AgencyAccountRow[];
  outliers: AgencyOutlierRow[];
}

/** Every tracked account the person can read, across brands and organizations. */
export async function readAgencySocial(args: { outlierWindowDays: number; minScore: number }): Promise<AgencySocial> {
  const tracked = await readAllRows<TrackedAccountRow>(
    ({ from, to }) =>
      supabase
        .schema("social")
        .from("tracked_account")
        .select("*", { count: "exact" })
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<TrackedAccountRow[]>(),
    { label: "social.tracked_account agency list" },
  );
  if (tracked.length === 0) return { accounts: [], outliers: [] };
  const profiles = await readProfiles([...new Set(tracked.map((t) => t.profile_id))]);
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const brandIds = [...new Set(tracked.map((t) => t.brand_id).filter((b): b is string => Boolean(b)))];
  const brandName = new Map<string, string>();
  for (const part of chunk(brandIds, 100)) {
    const { data, error } = await supabase.schema("web").from("brand").select("id, name").in("id", part);
    if (error) fail("web.brand names", error.message);
    for (const b of data ?? []) brandName.set(b.id, b.name);
  }
  const labelOf = (t: TrackedAccountRow) =>
    t.brand_id ? (brandName.get(t.brand_id) ?? "Brand") : "Organization-wide";
  const accounts: AgencyAccountRow[] = [];
  for (const t of tracked) {
    const p = profileById.get(t.profile_id);
    if (!p) continue;
    accounts.push({
      trackedAccountId: t.id,
      brandId: t.brand_id,
      brandName: labelOf(t),
      organizationId: t.organization_id,
      profileId: p.id,
      platform: p.platform,
      handle: p.handle,
      profileUrl: p.profile_url,
      displayName: t.label?.trim() || p.display_name?.trim() || p.handle,
      role: isTrackedRole(t.role) ? t.role : "inspiration",
      followers: num(p.follower_count),
      lastRefreshedAt: p.last_refreshed_at,
    });
  }
  const sinceIso = new Date(Date.now() - args.outlierWindowDays * 86_400_000).toISOString();
  const postRows = await readPostsWithStats([...new Set(accounts.map((a) => a.profileId))], sinceIso);
  const accountByProfile = new Map(accounts.map((a) => [a.profileId, a]));
  const outliers: AgencyOutlierRow[] = [];
  for (const row of postRows) {
    const stat = firstStat(row.stat);
    const score = num(stat?.outlier_score);
    const owner = row.profile_id ? accountByProfile.get(row.profile_id) : undefined;
    if (score === null || score < args.minScore || !owner) continue;
    outliers.push({
      postId: row.id,
      brandId: owner.brandId,
      profileId: owner.profileId,
      brandName: owner.brandName,
      platform: row.platform,
      handle: owner.handle,
      profileUrl: owner.profileUrl,
      url: row.url,
      hookLine: hookLineOf(row),
      views: num(stat?.views),
      score,
      postedAt: row.posted_at,
    });
  }
  outliers.sort((a, b) => b.score - a.score);
  return { accounts, outliers };
}

// ---------------------------------------------------------------------------
// Swipe file
// ---------------------------------------------------------------------------

/**
 * Every collection the person can see — live and archived (an archive is
 * `deleted_at`; the screen reveals archived ones on request, never deletes).
 * Not narrowed to the active organization: RLS decides, a list is never an org filter.
 */
export async function readAllSwipeCollections(): Promise<SwipeCollectionRow[]> {
  return readAllRows<SwipeCollectionRow>(
    ({ from, to }) =>
      supabase
        .schema("social")
        .from("swipe_collection")
        .select("*", { count: "exact" })
        .order("sort", { ascending: true })
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<SwipeCollectionRow[]>(),
    { label: "social.swipe_collection list" },
  );
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) fail("social.swipe_collection rename", "A collection needs a name.");
  const { data, error } = await supabase
    .schema("social")
    .from("swipe_collection")
    .update({ name: clean })
    .eq("id", id)
    .select("id");
  if (error) fail("social.swipe_collection rename", error.message);
  if (!data?.length) fail("social.swipe_collection rename", "You cannot rename this collection.");
}

/** Link a collection to a brand (or unlink with null). The collection stays in the organization either way. */
export async function setCollectionBrand(id: string, brandId: string | null): Promise<void> {
  const { data, error } = await supabase
    .schema("social")
    .from("swipe_collection")
    .update({ brand_id: brandId })
    .eq("id", id)
    .select("id");
  if (error) fail("social.swipe_collection brand", error.message);
  if (!data?.length) fail("social.swipe_collection brand", "You cannot change this collection.");
}

/** Archive (soft delete) or restore a collection. Its saved items stay put. */
export async function setCollectionArchived(id: string, archived: boolean): Promise<void> {
  const { data, error } = await supabase
    .schema("social")
    .from("swipe_collection")
    .update({ deleted_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) fail("social.swipe_collection archive", error.message);
  if (!data?.length) fail("social.swipe_collection archive", "You cannot change this collection.");
}

/** Membership edges of the given collections (swipe items before they meet their posts/ads). */
export async function readSwipeEdges(collectionIds: readonly string[]) {
  if (collectionIds.length === 0) return [];
  const out = [];
  for (const part of chunk(collectionIds, 50)) {
    const rows = await readAllRows<RawEdge>(
      ({ from, to }) =>
        supabase
          .schema("platform")
          .from("associations")
          .select("id, source_id, target_type, target_id, metadata, created_at", { count: "exact" })
          .eq("source_type", "social_swipe_collection")
          .in("source_id", part)
          .in("target_type", ["social_post", "social_ad"])
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
          .returns<RawEdge[]>(),
      { label: "platform.associations (swipe membership)" },
    );
    for (const r of rows) {
      const edge = toSwipeEdge(r);
      if (edge) out.push(edge);
    }
  }
  return out;
}

async function readPostCards(ids: readonly string[]): Promise<Map<string, PostCardModel>> {
  const rows: PostWithStat[] = [];
  for (const part of chunk(ids, 100)) {
    const { data, error } = await supabase
      .schema("social")
      .from("post")
      .select("*, stat:post_stat(*)")
      .in("id", part);
    if (error) fail("social.post read", error.message);
    rows.push(...((data ?? []) as unknown as PostWithStat[]));
  }
  const profiles = await readProfiles([...new Set(rows.map((r) => r.profile_id).filter((v): v is string => !!v))]);
  const handles = new Map(profiles.map((p) => [p.id, p.handle]));
  return new Map(
    rows.map((r) => [
      r.id,
      toPostCardModel({ post: r, stat: firstStat(r.stat), handle: r.profile_id ? (handles.get(r.profile_id) ?? null) : null }),
    ]),
  );
}

export async function readAdRows(ids: readonly string[]): Promise<SocialAdRow[]> {
  const out: SocialAdRow[] = [];
  for (const part of chunk(ids, 100)) {
    const { data, error } = await supabase.schema("social").from("ad").select("*").in("id", part);
    if (error) fail("social.ad read", error.message);
    out.push(...((data ?? []) as SocialAdRow[]));
  }
  return out;
}

/** Everything saved in the given collections, as merged items. */
export async function readSwipeItems(collectionIds: readonly string[]): Promise<{ items: SwipeItem[]; missing: number }> {
  const edges = await readSwipeEdges(collectionIds);
  const postIds = [...new Set(edges.filter((e) => e.itemType === "social_post").map((e) => e.itemId))];
  const adIds = [...new Set(edges.filter((e) => e.itemType === "social_ad").map((e) => e.itemId))];
  const [posts, adRows] = await Promise.all([readPostCards(postIds), readAdRows(adIds)]);
  const ads = new Map<string, AdCardModel>(adRows.map((r) => [r.id, toAdCardModel(r)]));
  return buildSwipeItems({ edges, posts, ads });
}

// ---------------------------------------------------------------------------
// Ads + tracked advertisers
// ---------------------------------------------------------------------------

/** Ads of one advertiser the shared cache holds (by library id when known, else by name). */
export async function readAdvertiserAds(args: {
  library: AdLibrary;
  advertiser: string;
  advertiserPlatformId: string | null;
}): Promise<AdCardModel[]> {
  const rows = await readAllRows<SocialAdRow>(
    ({ from, to }) => {
      let q = supabase
        .schema("social")
        .from("ad")
        .select("*", { count: "exact" })
        .eq("library", args.library)
        .is("deleted_at", null);
      q = args.advertiserPlatformId
        ? q.eq("advertiser_platform_id", args.advertiserPlatformId)
        : q.ilike("advertiser_name", args.advertiser.replace(/[%_]/g, (c) => `\\${c}`));
      return q
        .order("started_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<SocialAdRow[]>();
    },
    { label: "social.ad advertiser list" },
  );
  return rows.map(toAdCardModel);
}

export const ADVERTISER_SURFACE = "social.advertisers";

interface SavedViewLite {
  id: string;
  name: string;
  version: number;
  definition: unknown;
  subject_id: string | null;
  organization_id: string | null;
}

function toTracked(row: SavedViewLite): TrackedAdvertiser | null {
  const definition = parseAdvertiserDefinition(row.definition);
  return definition ? { viewId: row.id, name: row.name, version: row.version, definition, brandId: row.subject_id } : null;
}

/**
 * The advertisers this person tracks (`platform.saved_view`, surface `social.advertisers`), in one organization.
 * An advertiser belongs to the brand it was tracked from (`subject_id`); the brand's list holds only those.
 * `scope: "all"` lists every brand's, including ones tracked before they carried a brand.
 */
export async function readTrackedAdvertisers(args: { organizationId: string; brandId: string; scope: "brand" | "all" }): Promise<TrackedAdvertiser[]> {
  const rows = await readAllRows<SavedViewLite>(
    ({ from, to }) =>
      supabase
        .schema("platform")
        .from("saved_view")
        .select("id, name, version, definition, subject_id, organization_id", { count: "exact" })
        .eq("surface_key", ADVERTISER_SURFACE)
        .eq("organization_id", args.organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<SavedViewLite[]>(),
    { label: "platform.saved_view (tracked advertisers)" },
  );
  const all = rows.map(toTracked).filter((t): t is TrackedAdvertiser => t !== null);
  return args.scope === "all" ? all : all.filter((t) => t.brandId === args.brandId);
}

export async function saveTrackedAdvertiser(args: {
  organizationId: string;
  /** The brand this advertiser is tracked for (stored on create; a look on an existing view keeps its own). */
  brandId?: string;
  name: string;
  definition: AdvertiserDefinition;
  /** Present = update that view (a new look); absent = create. */
  viewId?: string;
}): Promise<TrackedAdvertiser> {
  const { data, error } = await supabase.rpc("saved_view_save", {
    p_surface_key: ADVERTISER_SURFACE,
    p_id: args.viewId,
    p_organization_id: args.viewId ? undefined : args.organizationId,
    p_subject_id: args.viewId ? undefined : args.brandId,
    p_name: args.name,
    p_definition: args.definition as never,
    p_visibility: args.viewId ? undefined : "personal",
  });
  if (error) {
    if (error.code === "23505") fail("Track advertiser", `You already track "${args.name}".`);
    fail("Track advertiser", error.message);
  }
  const tracked = toTracked(data as unknown as SavedViewLite);
  if (!tracked) fail("Track advertiser", "The saved advertiser could not be read back.");
  return tracked;
}

export async function archiveTrackedAdvertiser(viewId: string): Promise<void> {
  const { data, error } = await supabase.rpc("saved_view_archive", {
    p_surface_key: ADVERTISER_SURFACE,
    p_id: viewId,
  });
  if (error) fail("Stop tracking", error.message);
  if (data === null) fail("Stop tracking", "That advertiser is no longer tracked.");
}

/** Which of these posts already have a stored transcript (bulk transcribe skips them). */
export async function readTranscribedPostIds(postIds: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const part of chunk(postIds, 100)) {
    const { data, error } = await supabase
      .schema("social")
      .from("post_transcript")
      .select("post_id")
      .in("post_id", part);
    if (error) fail("social.post_transcript read", error.message);
    for (const r of data ?? []) out.add((r as { post_id: string }).post_id);
  }
  return out;
}
