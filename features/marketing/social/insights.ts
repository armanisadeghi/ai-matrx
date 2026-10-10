/**
 * Private insights from a connected account (`social.account_insight_daily`): the ONE reader and
 * the ONE summarizer. The KPI "Own channel" table and the account page both come through here, so
 * a provider that fills a different set of columns (Pinterest: impressions, engagements, saves,
 * link clicks; TikTok: followers) shows exactly what it sent. A column the provider left NULL is
 * "not available" - it is never summed into, or shown as, zero.
 *
 * Ledger rule (SCHEMA.md): append-only, so the newest `observed_at` per (account, date) wins.
 */

import { readAllRows } from "@ai-matrx/data/db";

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";

export type InsightMetricId =
  | "followers"
  | "follower_delta"
  | "views"
  | "impressions"
  | "reach"
  | "profile_visits"
  | "engagements"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "pin_clicks"
  | "link_clicks"
  | "watch_time_minutes";

export interface InsightMetricDef {
  id: InsightMetricId;
  label: string;
  /** `level`: a standing count, the newest value is the answer. `flow`: per-day activity, the window adds up. */
  kind: "level" | "flow";
}

/** Column order = display order. */
export const INSIGHT_METRICS: readonly InsightMetricDef[] = [
  { id: "followers", label: "Followers", kind: "level" },
  { id: "follower_delta", label: "Follower change", kind: "flow" },
  { id: "views", label: "Views", kind: "flow" },
  { id: "impressions", label: "Impressions", kind: "flow" },
  { id: "reach", label: "Reach", kind: "flow" },
  { id: "profile_visits", label: "Profile visits", kind: "flow" },
  { id: "engagements", label: "Engagements", kind: "flow" },
  { id: "likes", label: "Likes", kind: "flow" },
  { id: "comments", label: "Comments", kind: "flow" },
  { id: "shares", label: "Shares", kind: "flow" },
  { id: "saves", label: "Saves", kind: "flow" },
  { id: "pin_clicks", label: "Pin clicks", kind: "flow" },
  { id: "link_clicks", label: "Link clicks", kind: "flow" },
  { id: "watch_time_minutes", label: "Watch minutes", kind: "flow" },
];

export interface InsightDay {
  trackedAccountId: string;
  /** YYYY-MM-DD */
  date: string;
  provider: string;
  observedAt: string;
  values: Record<InsightMetricId, number | null>;
}

interface InsightDbRow {
  tracked_account_id: string;
  date: string;
  provider: string;
  observed_at: string;
  followers: number | null;
  follower_delta: number | null;
  views: number | null;
  impressions: number | null;
  reach: number | null;
  profile_visits: number | null;
  engagements: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  watch_time_minutes: number | null;
  link_clicks: number | null;
  extras: Json;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function extraNumber(extras: Json, key: string): number | null {
  if (!extras || typeof extras !== "object" || Array.isArray(extras)) return null;
  return numberOrNull((extras as Record<string, unknown>)[key]);
}

/** Pure: raw ledger rows -> one current day per (account, date). */
export function currentInsightDays(rows: readonly InsightDbRow[]): InsightDay[] {
  const newest = new Map<string, InsightDbRow>();
  for (const r of rows) {
    const key = `${r.tracked_account_id}|${r.date}`;
    const prior = newest.get(key);
    if (!prior || prior.observed_at < r.observed_at) newest.set(key, r);
  }
  return [...newest.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((r) => ({
      trackedAccountId: r.tracked_account_id,
      date: r.date,
      provider: r.provider,
      observedAt: r.observed_at,
      values: {
        followers: numberOrNull(r.followers),
        follower_delta: numberOrNull(r.follower_delta),
        views: numberOrNull(r.views),
        impressions: numberOrNull(r.impressions),
        reach: numberOrNull(r.reach),
        profile_visits: numberOrNull(r.profile_visits),
        engagements: numberOrNull(r.engagements),
        likes: numberOrNull(r.likes),
        comments: numberOrNull(r.comments),
        shares: numberOrNull(r.shares),
        saves: numberOrNull(r.saves),
        pin_clicks: extraNumber(r.extras, "pin_clicks"),
        link_clicks: numberOrNull(r.link_clicks),
        watch_time_minutes: numberOrNull(r.watch_time_minutes),
      },
    }));
}

export interface InsightSummary {
  trackedAccountId: string;
  /** Days with at least one figure inside the window. */
  days: number;
  provider: string | null;
  /** Newest figure date, YYYY-MM-DD. */
  latestDate: string | null;
  /** null = the provider never sent this figure in the window ("not available"). */
  values: Record<InsightMetricId, number | null>;
}

/** Pure: one account's days -> its summary over the trailing `windowDays` ending at the newest day. */
export function summarizeInsights(
  trackedAccountId: string,
  days: readonly InsightDay[],
  windowDays = 30,
): InsightSummary {
  const mine = days.filter((d) => d.trackedAccountId === trackedAccountId);
  const empty = Object.fromEntries(INSIGHT_METRICS.map((m) => [m.id, null])) as Record<InsightMetricId, number | null>;
  if (mine.length === 0) return { trackedAccountId, days: 0, provider: null, latestDate: null, values: empty };
  const latestDate = mine[mine.length - 1].date;
  const cutoff = new Date(`${latestDate}T00:00:00Z`).getTime() - (windowDays - 1) * 86_400_000;
  const inWindow = mine.filter((d) => new Date(`${d.date}T00:00:00Z`).getTime() >= cutoff);
  const values = { ...empty };
  for (const m of INSIGHT_METRICS) {
    const present = inWindow.filter((d) => d.values[m.id] !== null);
    if (present.length === 0) continue;
    values[m.id] =
      m.kind === "level"
        ? (present[present.length - 1].values[m.id] as number)
        : present.reduce((sum, d) => sum + (d.values[m.id] as number), 0);
  }
  return {
    trackedAccountId,
    days: inWindow.length,
    provider: inWindow[inWindow.length - 1]?.provider ?? null,
    latestDate,
    values,
  };
}

/** The metrics this summary actually has - what the provider sent, in display order. */
export function availableInsightMetrics(summary: InsightSummary): InsightMetricDef[] {
  return INSIGHT_METRICS.filter((m) => summary.values[m.id] !== null);
}

/** Text for one figure: a number, or "Not available" - never "0" for a missing one. */
export function insightText(value: number | null, format: (n: number) => string): string {
  return value === null ? "Not available" : format(value);
}

/** The reader. RLS scopes the rows to the caller's organizations. */
export async function readOwnInsightDays(
  trackedAccountIds: readonly string[],
  sinceDate?: string,
): Promise<InsightDay[]> {
  if (trackedAccountIds.length === 0) return [];
  const rows = await readAllRows<InsightDbRow>(
    ({ from, to }) => {
      let q = supabase
        .schema("social")
        .from("account_insight_daily")
        .select(
          "tracked_account_id,date,provider,observed_at,followers,follower_delta,views,impressions,reach,profile_visits,engagements,likes,comments,shares,saves,watch_time_minutes,link_clicks,extras",
          { count: "exact" },
        )
        .in("tracked_account_id", [...trackedAccountIds])
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (sinceDate) q = q.gte("date", sinceDate);
      return q.returns<InsightDbRow[]>();
    },
    { label: "social.account_insight_daily" },
  );
  return currentInsightDays(rows);
}

// ---------------------------------------------------------------------------
// Per-post private figures (`social.own_post_metric`) - the same rules, one row per post
// ---------------------------------------------------------------------------

export type PostMetricId =
  | "impressions"
  | "reach"
  | "saves"
  | "pin_clicks"
  | "link_clicks"
  | "engagements"
  | "video_views";

/** Column order = preference order: the first one a provider sent is the default "top by". */
export const POST_METRICS: readonly { id: PostMetricId; label: string }[] = [
  { id: "impressions", label: "Impressions" },
  { id: "reach", label: "Reach" },
  { id: "video_views", label: "Video views" },
  { id: "engagements", label: "Engagements" },
  { id: "saves", label: "Saves" },
  { id: "pin_clicks", label: "Pin clicks" },
  { id: "link_clicks", label: "Link clicks" },
];

interface OwnPostMetricDbRow {
  tracked_account_id: string;
  provider: string;
  provider_post_id: string;
  post_id: string | null;
  observed_on: string;
  observed_at: string;
  impressions: number | null;
  reach: number | null;
  saves: number | null;
  link_clicks: number | null;
  engagements: number | null;
  video_views: number | null;
  extras: Json;
}

export interface OwnPostFigure {
  trackedAccountId: string;
  provider: string;
  providerPostId: string;
  /** The cached public post, when the post exists in the shared cache. */
  postId: string | null;
  observedOn: string;
  values: Record<PostMetricId, number | null>;
}

/** Pure: raw rows -> the current figure per (account, provider post): newest day, then newest observation. */
export function currentOwnPostFigures(rows: readonly OwnPostMetricDbRow[]): OwnPostFigure[] {
  const newest = new Map<string, OwnPostMetricDbRow>();
  for (const r of rows) {
    const key = `${r.tracked_account_id}|${r.provider_post_id}`;
    const prior = newest.get(key);
    if (!prior || `${prior.observed_on}|${prior.observed_at}` < `${r.observed_on}|${r.observed_at}`) newest.set(key, r);
  }
  return [...newest.values()].map((r) => ({
    trackedAccountId: r.tracked_account_id,
    provider: r.provider,
    providerPostId: r.provider_post_id,
    postId: r.post_id,
    observedOn: r.observed_on,
    values: {
      impressions: numberOrNull(r.impressions),
      reach: numberOrNull(r.reach),
      saves: numberOrNull(r.saves),
      pin_clicks: extraNumber(r.extras, "pin_clicks"),
      link_clicks: numberOrNull(r.link_clicks),
      engagements: numberOrNull(r.engagements),
      video_views: numberOrNull(r.video_views),
    },
  }));
}

/** The metrics at least one post has a figure for, in display order. */
export function availablePostMetrics(figures: readonly OwnPostFigure[]) {
  return POST_METRICS.filter((m) => figures.some((f) => f.values[m.id] !== null));
}

/** Pure: the posts with the highest figure for `metric`. A post without that figure is not ranked (never as 0). */
export function topOwnPosts(figures: readonly OwnPostFigure[], metric: PostMetricId, limit = 5): OwnPostFigure[] {
  return figures
    .filter((f) => f.values[metric] !== null)
    .sort((a, b) => (b.values[metric] as number) - (a.values[metric] as number) || (a.providerPostId < b.providerPostId ? -1 : 1))
    .slice(0, limit);
}

export interface OwnPostLabel {
  title: string | null;
  url: string | null;
}

/** The reader for one account's per-post figures plus the names of the posts that are in the shared cache. */
export async function readOwnPostFigures(
  trackedAccountIds: readonly string[],
): Promise<{ figures: OwnPostFigure[]; labels: Map<string, OwnPostLabel> }> {
  if (trackedAccountIds.length === 0) return { figures: [], labels: new Map() };
  const rows = await readAllRows<OwnPostMetricDbRow>(
    ({ from, to }) =>
      // `own_post_metric` is newer than the generated database types.
      (supabase.schema("social") as unknown as { from: (t: string) => any })
        .from("own_post_metric")
        .select(
          "tracked_account_id,provider,provider_post_id,post_id,observed_on,observed_at,impressions,reach,saves,link_clicks,engagements,video_views,extras",
          { count: "exact" },
        )
        .in("tracked_account_id", [...trackedAccountIds])
        .order("observed_on", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    { label: "social.own_post_metric" },
  );
  const figures = currentOwnPostFigures(rows);
  const postIds = [...new Set(figures.map((f) => f.postId).filter((x): x is string => !!x))];
  const labels = new Map<string, OwnPostLabel>();
  if (postIds.length > 0) {
    const { data } = await supabase.schema("social").from("post").select("id,title,caption,url").in("id", postIds);
    for (const p of data ?? []) labels.set(p.id, { title: p.title ?? p.caption ?? null, url: p.url ?? null });
  }
  return { figures, labels };
}
