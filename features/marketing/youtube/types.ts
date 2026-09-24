/**
 * YouTube Plane A/C — the shapes, read straight off the generated database
 * truth. Nothing here is hand-typed from a migration: `web.youtube_video` and
 * `web.channel_analytics_daily` are live, certified tables (aidream migration
 * 0767) and `types/database.types.ts` is what they are.
 */

import type { Database } from "@/types/database.types";

type WebTables = Database["web"]["Tables"];

/** One video on the operator's OWN channel — a mirror, never a research row. */
export type YouTubeVideoRow = WebTables["youtube_video"]["Row"];

/**
 * One day of channel analytics. `video_external_id` NULL is the whole channel
 * that day; a non-NULL value is one video's day. Today the server writes only
 * the NULL lane (`refresh_youtube`), and the toggle says so rather than showing
 * an empty per-video table.
 */
export type ChannelAnalyticsDayRow = WebTables["channel_analytics_daily"]["Row"];

/** `available` mirrors YouTube; `unavailable` carries a reason (0767 CHECK). */
export type YouTubeVideoSyncStatus = "available" | "unavailable";

/** The `stats` jsonb, after the `__kind` envelope is read and ignored. */
export interface YouTubeVideoStats {
  views: number | null;
  likes: number | null;
  comments: number | null;
  capturedAt: string | null;
}

/** Which lane of `channel_analytics_daily` a reader is looking at. */
export type ChannelAnalyticsLane = "channel" | "video";

/** The totals of one window of channel-analytics days. */
export interface ChannelWindowTotals {
  views: number;
  watchTimeMinutes: number;
  subscribersGained: number;
  /** Watch-time weighted, never a mean of means — see `record.ts`. */
  avgViewDurationSeconds: number;
  /** Days in the window that have a stored row. */
  daysWithData: number;
}

/**
 * The brand ↔ channel binding, as the panel needs it.
 *
 * `column_absent` is its own state because `web.brand.integrations` is applied
 * by the chair (`migrations/brand_integrations_youtube_channel.sql`): until
 * then the read fails with PostgREST 42703 and the panel says so with the
 * remedy, rather than rendering as "no channel is bound" — which would be a
 * screen lying about a brand that may well have one.
 */
export type BrandChannelBinding =
  | {
      state: "bound";
      /** `users.integration_connections.id` — which Google account. */
      connectionId: string;
      /** The YouTube channel id (`UC…`). */
      channelId: string;
      brandVersion: number;
      /**
       * The BRAND'S own organization — where its mirrored videos and analytics
       * live. Reads use this, never the person's selected organization.
       */
      organizationId: string;
    }
  | { state: "unbound"; brandVersion: number }
  | { state: "column_absent"; sentence: string };
