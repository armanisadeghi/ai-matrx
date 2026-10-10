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
