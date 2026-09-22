/**
 * YouTube Plane A/C — the pure logic. No React, no network, no clock of its
 * own: every function that needs "now" is handed one, so the freshness phrase,
 * the window totals and the delta are provable by a test that writes rows by
 * hand (same shape as `features/google-workspace/calendar/record.ts`).
 *
 * 🚨 THE DELTA IS NOT JUDGED HERE. A 30-day change on this panel goes through
 * `judgeGscWindowDelta` (`features/marketing/analytics/gsc-delta.ts`), which is
 * the platform's ONE comparison judge over `judgeAnalyticsComparison`: both
 * windows' coverage judged against `COMPARISON_COVERAGE_MIN_SHARE` /
 * `COMPARISON_COVERAGE_TOLERANCE_DAYS`, four named verdicts, and a refusal
 * label that ALWAYS prints. The module is named for Search Console only because
 * that is where it was extracted; its inputs are two totals and two collected-
 * day counts, which is what a channel's views are too. A fifth `trendPercent`
 * in this feature is exactly the defect `gsc-delta.test.ts`'s census exists to
 * fail (five live sites were painted as a ~70% collapse by a private copy of
 * this rule, 2026-09-17).
 */

import {
  formatDurationSeconds,
  formatRelativeTime,
  parseTimestamp,
} from "@ai-matrx/kit/format";
import type { DetailField, DetailRow, DetailSourceHealth } from "@/lib/detail/types";

import type {
  ChannelAnalyticsDayRow,
  ChannelWindowTotals,
  YouTubeVideoRow,
  YouTubeVideoStats,
  YouTubeVideoSyncStatus,
} from "./types";

/**
 * The item-presentation type AND the `platform.entity_types` token — one word.
 * `youtube_video` was already taken by `research.youtube_video` (3,065 rows),
 * so aidream migration 0767 registered this table as `web_youtube_video`,
 * following `web`'s own live convention (`web_site`, `web_brand`, `web_page`).
 */
export const YOUTUBE_VIDEO_TYPE = "web_youtube_video";

/**
 * The connector product whose grant refreshes these records. `youtube` is the
 * channel preview (`rollout_phase` "approved"); `youtube_analytics` is the
 * daily numbers and is a DIFFERENT capability behind a different gate — the
 * panel says so rather than showing an empty chart.
 */
export const YOUTUBE_PRODUCT_KEY = "youtube";
export const YOUTUBE_ANALYTICS_CAPABILITY_KEY = "youtube_analytics";

/** The schema-qualified table, as aidream's generic Plane C doors address it. */
export const YOUTUBE_VIDEO_TABLE = "web.youtube_video";

/** The `__kind` marker the server writes onto `stats` (0767 CHECK). */
export const YOUTUBE_VIDEO_STATS_KIND = "youtube_video_stats";

/** The comparison window this panel prints, in days. PLAN §4.11: "30-day deltas". */
export const CHANNEL_WINDOW_DAYS = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * 🚨 `__kind` IS PART OF THE DATA — READ AND IGNORED, NEVER STRIPPED, NEVER
 * REQUIRED. The server writes `{"__kind":"youtube_video_stats","views":n,…}`
 * (`aidream/services/google_sync/kinds.py`), and the table's own CHECK refuses a
 * `stats` document without the marker. This reads the envelope and ALSO accepts
 * a bare object, because a consumer that chokes on a shape gets fixed to
 * accept-and-ignore rather than fed stripped data
 * (`KINDS_EVERYWHERE_PLAN.md` §4.2a). Nothing here writes a payload back out, so
 * the marker is never dropped on a round trip.
 */
export function videoStatsOf(column: unknown): YouTubeVideoStats {
  const row = isRecord(column) ? column : {};
  return {
    views: finite(row.views),
    likes: finite(row.likes),
    comments: finite(row.comments),
    capturedAt: text(row.captured_at) ?? text(row.capturedAt),
  };
}

export function isYouTubeVideoSyncStatus(
  value: unknown,
): value is YouTubeVideoSyncStatus {
  return value === "available" || value === "unavailable";
}

/** The status word, or `unknown` when the column says something we do not know. */
export function syncStatusOf(
  row: YouTubeVideoRow,
): YouTubeVideoSyncStatus | "unknown" {
  return isYouTubeVideoSyncStatus(row.sync_status) ? row.sync_status : "unknown";
}

/** `PT4M13S` as `4:13`; `null` when YouTube gave no duration. */
export function durationText(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return "Length not recorded";
  }
  return formatDurationSeconds(seconds, { style: "clock" });
}

/** A duration in seconds as words, for the headline figure. */
export function durationWords(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  // Whole seconds in, so an average that arrives fractional does not render a
  // decimal nobody asked for.
  return formatDurationSeconds(Math.round(seconds), { style: "compact" });
}

/** The published day as a person reads it, or the honest absence. */
export function publishedText(value: string | null): string {
  if (!value) return "YouTube did not say when this was published";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "YouTube did not say when this was published";
  }
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Totals over one window of `web.channel_analytics_daily` rows.
 *
 * 🚨 AVERAGE VIEW DURATION IS NOT AN AVERAGE OF AVERAGES. Each row's
 * `avg_view_duration_seconds` is that day's mean, and a plain mean of thirty
 * such numbers weights a day with four views exactly as heavily as a day with
 * forty thousand. YouTube Studio's own definition is watch time ÷ views, so
 * that is what this computes from the two totals it already has. A window with
 * views but no watch time answers 0 and the panel says the numbers are
 * incomplete rather than printing a duration nobody measured.
 */
export function channelWindowTotals(
  days: readonly ChannelAnalyticsDayRow[],
): ChannelWindowTotals {
  let views = 0;
  let watchTimeMinutes = 0;
  let subscribersGained = 0;
  const dates = new Set<string>();
  for (const day of days) {
    views += Number(day.views) || 0;
    watchTimeMinutes += Number(day.watch_time_minutes) || 0;
    subscribersGained += Number(day.subscribers_gained) || 0;
    if (day.date) dates.add(day.date);
  }
  return {
    views,
    watchTimeMinutes,
    subscribersGained,
    avgViewDurationSeconds: views > 0 ? (watchTimeMinutes * 60) / views : 0,
    daysWithData: dates.size,
  };
}

/**
 * Split stored days into the current window and the one before it, both
 * anchored on `now` — the caller's clock, never this module's.
 *
 * The bounds are INCLUSIVE of `windowDays` days ending yesterday-or-today:
 * YouTube Analytics finalises a day some hours after it ends, so the newest
 * stored day is normally the day before today and is inside the current window.
 */
export function splitChannelWindows(
  days: readonly ChannelAnalyticsDayRow[],
  now: Date,
  windowDays: number = CHANNEL_WINDOW_DAYS,
): { current: ChannelAnalyticsDayRow[]; previous: ChannelAnalyticsDayRow[] } {
  const dayMs = 86_400_000;
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const currentStart = end - (windowDays - 1) * dayMs;
  const previousStart = currentStart - windowDays * dayMs;
  const current: ChannelAnalyticsDayRow[] = [];
  const previous: ChannelAnalyticsDayRow[] = [];
  for (const day of days) {
    const stamp = Date.parse(`${day.date}T00:00:00Z`);
    if (Number.isNaN(stamp)) continue;
    if (stamp >= currentStart && stamp <= end) current.push(day);
    else if (stamp >= previousStart && stamp < currentStart) previous.push(day);
  }
  return { current, previous };
}

// ─── The Detail primitive's registration data ───────────────────────────────

/**
 * 🚨 THE HEALTH STRIP READS THE ROW, AND THE ROW MUST NAME ITS PRODUCT.
 * `features/item-presentation/sourceHealth.ts` finds the connection through
 * `channel_resource_id` — a `users.integration_connection_resources` id, which
 * that producer already resolves one hop to its connection (lane F-81, which
 * added this very column to `ACCOUNT_COLUMNS` naming U-M3 as the day it would
 * matter). What the row does NOT carry is the provider and the connector
 * product, because `web.youtube_video` is Google's by construction and no
 * synced table has a product column — both are projected here, exactly as the
 * Google Doc and calendar-event registrations project theirs
 * (`PROJECTED_ROLE_COLUMNS` in `syncedColumns.ts` is where that is declared).
 */
export function youtubeVideoDetailRow(row: YouTubeVideoRow): DetailRow {
  return {
    ...row,
    provider: "google",
    provider_product: YOUTUBE_PRODUCT_KEY,
  };
}

/** The row back out of a `DetailRow`, or null when it is not one of ours. */
export function asYouTubeVideoRow(row: DetailRow | null): YouTubeVideoRow | null {
  if (!row || typeof row.id !== "string" || typeof row.external_id !== "string") {
    return null;
  }
  return row as unknown as YouTubeVideoRow;
}

/**
 * 🚨 THE STRIP TELLS THE TRUTH ABOUT **THIS VIDEO**, NOT ONLY ABOUT THE
 * ACCOUNT — the same law the Doc and calendar-event registrations carry, kept
 * pure here so it is testable without mounting anything: a perfectly healthy
 * YouTube grant can still be refusing this one video (deleted on YouTube, made
 * private, region-blocked), and 0767's CHECK guarantees an `unavailable` row
 * states its reason.
 */
export function youtubeVideoHealthOverride(
  row: YouTubeVideoRow,
  produced: DetailSourceHealth | null,
): DetailSourceHealth {
  const unavailable = syncStatusOf(row) !== "available";
  const videoSentence = unavailable
    ? row.sync_status_reason?.trim() ||
      "YouTube would not give us this video the last time we asked, and did not say why."
    : null;
  if (!produced) {
    return {
      source: "YouTube",
      lastRefreshedAt: row.synced_at,
      grant: unavailable ? "unknown" : "ok",
      grantDetail:
        videoSentence ??
        "This video is kept in step with your YouTube channel; we could not check the connection behind it just now.",
      openAtSourceLabel: "Open on YouTube",
    };
  }
  if (!unavailable) return { ...produced, openAtSourceLabel: "Open on YouTube" };
  return {
    ...produced,
    // `unknown` is the vocabulary's honest word for "the grant is not the
    // problem, this video is" — `revoked` would send the person to reconnect
    // something a reconnect cannot repair.
    grant: produced.grant === "ok" ? "unknown" : produced.grant,
    grantDetail: [videoSentence, produced.grantDetail].filter(Boolean).join(" "),
    openAtSourceLabel: "Open on YouTube",
  };
}

function refreshedPhrase(value: string | null, now: Date): string {
  const parsed = parseTimestamp(value);
  if (!parsed) return "Never refreshed from YouTube";
  return `Refreshed from YouTube ${formatRelativeTime(parsed, {
    style: "long",
    now: now.getTime(),
  })}`;
}

function count(value: number | null, absent: string): string {
  return value === null ? absent : Intl.NumberFormat().format(Math.round(value));
}

/**
 * 🚨 A CURATED FIELD LIST, NEVER A COLUMN DUMP. The generic `fieldsFromRow`
 * would print the `stats` jsonb (marker and all), `version`, `metadata`,
 * `visibility` and both audit columns, and would lose what PLAN §4.11 names:
 * when it went up, how it is doing, how long it is, and where it lives on
 * YouTube.
 */
export function youtubeVideoFields(
  row: YouTubeVideoRow,
  now: Date,
): DetailField[] {
  const stats = videoStatsOf(row.stats);
  const fields: DetailField[] = [
    { key: "published_at", label: "Published", text: publishedText(row.published_at) },
    { key: "duration", label: "Length", text: durationText(row.duration_seconds) },
    { key: "views", label: "Views", text: count(stats.views, "YouTube did not report views") },
    { key: "likes", label: "Likes", text: count(stats.likes, "YouTube did not report likes") },
    {
      key: "comments",
      label: "Comments",
      text: count(stats.comments, "YouTube did not report comments"),
    },
    {
      key: "stats_captured_at",
      label: "Counts as of",
      text: stats.capturedAt
        ? publishedText(stats.capturedAt)
        : "Not recorded — these counts have no capture time",
    },
    {
      key: "external_url",
      label: "On YouTube",
      text: row.external_url ?? "No watch URL is stored for this video",
    },
    { key: "synced_at", label: "Freshness", text: refreshedPhrase(row.synced_at, now) },
  ];
  if (row.channel_resource_id) {
    // 🚨 NO `ref` HERE, AND THAT IS THE DOOR LAW BEING OBEYED, NOT BROKEN. This
    // is a `users.integration_connection_resources` id — the discovered owned
    // channel — and that table is NOT a registered entity: it holds no
    // `platform.entity_types` token, so there is nothing to open. Pointing this
    // at `integration_connection` (the calendar event's and the Doc's token)
    // would be a door onto a DIFFERENT record's id, which is the F-81 defect in
    // a new costume. The connected account itself is named by the health strip
    // above, which resolves this resource one hop to its connection.
    fields.push({
      key: "channel_resource_id",
      label: "Refreshed through",
      text: `The owned YouTube channel this record was refreshed through (${row.channel_resource_id})`,
      mono: false,
    });
  } else {
    fields.push({
      key: "channel_resource_id",
      label: "Refreshed through",
      text: "No YouTube channel has refreshed this yet",
    });
  }
  fields.push({
    key: "external_id",
    label: "YouTube video id",
    text: row.external_id,
    mono: true,
  });
  return fields;
}

/**
 * What this surface CANNOT do, and why — PLAN §4.11 is owned-channel READ-ONLY
 * (`youtube.readonly` + `yt-analytics.readonly`), and the pre-upload check
 * publishes nothing, ever. Law 4: a screen is absent or honest, never a dead or
 * disabled-looking button. These render as sentences, never as controls.
 */
export const YOUTUBE_UNAVAILABLE_ACTIONS: readonly { action: string; why: string }[] = [
  {
    action: "Publish or upload a video",
    why: "Our YouTube permission is read-only. The pre-upload check grades a title, description, tags and thumbnail and hands them to you to paste into YouTube Studio — it never sends anything to YouTube.",
  },
  {
    action: "Change this video's title, description or tags",
    why: "Same read-only permission — everything here is a mirror of YouTube's. Change it in YouTube Studio and refresh.",
  },
  {
    action: "Replace the thumbnail",
    why: "A thumbnail upload is a YouTube write. Upload it in YouTube Studio; the next refresh brings the new one here.",
  },
  {
    action: "Reply to or moderate comments",
    why: "Comments belong to your YouTube account; we can count them, not answer them.",
  },
];
