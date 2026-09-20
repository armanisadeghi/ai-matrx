/**
 * YouTube Planes A + C — the doors. Three of them, each the ONE path for what
 * it does:
 *
 *  1. READ the videos and the daily analytics — React → Supabase DIRECTLY
 *     (`web.youtube_video`, `web.channel_analytics_daily`), never through the
 *     Python server, which is not a DB gateway. Both tables are live and
 *     RLS-certified (aidream migration 0767): the video is
 *     `visibility personal` / `default_list_scope mine`, the analytics day is a
 *     `ledger` with `default_list_scope organization`. THE VIEW LAW: each list
 *     declares its own scope below; RLS is the ceiling above that, never the
 *     view.
 *  2. REFRESH from YouTube — the ONE compute call,
 *     `POST /google-sync/youtube/refresh`, through `postGoogleBackend` (the
 *     Supabase session's bearer token plus the fail-closed organization
 *     header). It is the only writer of either table anywhere
 *     (`aidream/services/google_sync/service.py::refresh_youtube`) and there is
 *     no schedule behind it — a human press is the only trigger.
 *  3. The `covers` edge to a topical-map topic — `associationWrites.ts`, which
 *     goes through the ONE association chokepoint.
 *
 * 🚨 `readAllRows` ON BOTH LISTS. The panel COUNTS the days it has, compares
 * two windows and says "nothing synced yet"; a bare `.select()` caps silently
 * at 1000 rows, and 90 days × several videos would lose its tail without a word
 * — with the coverage judge then refusing (or, worse, accepting) on a day count
 * that is not the truth.
 */

"use client";

import { readAllRows } from "@ai-matrx/data/db";

import { supabase } from "@/utils/supabase/client";
import { postGoogleBackend } from "@/features/marketing/google/service";
import { requireOrganizationContext } from "@/lib/api/organization-context";

import type { ChannelAnalyticsDayRow, YouTubeVideoRow } from "./types";

/** Every column: the Detail renders the row and the panel shares the read. */
const VIDEO_COLUMNS = "*";
const ANALYTICS_COLUMNS = "*";

/**
 * The bare router prefix — `aidream/api/app.py` mounts `google_sync.router` at
 * `/google-sync`. (`ApiPrefixCompatMiddleware` also accepts `/api/…`; the bare
 * spelling is the one aidream's own rule names.)
 */
const REFRESH_PATH = "/google-sync/youtube/refresh";

/** The provider's own ceiling: one analytics refresh covers at most 90 days
 *  (`YouTubeRefreshRequest.validate_window`), so nothing here asks for more. */
export const MAX_REFRESH_WINDOW_DAYS = 90;

/**
 * This brand's channel videos, newest first.
 *
 * Scope: `mine`. `web.youtube_video` was certified `visibility personal` /
 * `default_list_scope mine` (0767), and the refresh writes the rows under the
 * person who pressed it (`acting_as_user`), so the declared scope is the one
 * the table was built with. A shared-channel story is a later, deliberate
 * widening — never an accident of an undeclared list.
 */
export async function readChannelVideos(args: {
  organizationId: string;
  userId: string;
  channelResourceId?: string | null;
  signal?: AbortSignal;
}): Promise<YouTubeVideoRow[]> {
  const organizationId = requireOrganizationContext(args.organizationId);
  return readAllRows<YouTubeVideoRow>(
    ({ from, to }) => {
      let query = supabase
        .schema("web")
        .from("youtube_video")
        .select(VIDEO_COLUMNS, { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("created_by", args.userId)
        .is("deleted_at", null)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (args.channelResourceId) {
        query = query.eq("channel_resource_id", args.channelResourceId);
      }
      if (args.signal) query = query.abortSignal(args.signal);
      return query.returns<YouTubeVideoRow[]>();
    },
    { label: "web.youtube_video channel list" },
  );
}

/** One video by id — what the Detail primitive's loader reads. */
export async function readYouTubeVideo(
  id: string,
  signal: AbortSignal,
): Promise<YouTubeVideoRow | null> {
  const { data, error } = await supabase
    .schema("web")
    .from("youtube_video")
    .select(VIDEO_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as YouTubeVideoRow | null) ?? null;
}

/**
 * The stored analytics days for one channel, over a bounded span.
 *
 * Scope: `organization` — the table is a `ledger` with
 * `default_list_scope organization` (0767, ruling R2: channel analytics are
 * organization data, not personal). The `lane` argument decides which rows come
 * back: `channel` is the whole-channel day (`video_external_id IS NULL`),
 * `video` is the per-video lane, which the server does not write yet
 * (`refresh_youtube` passes `video_external_id=None` on every day) — the panel
 * says that in words instead of showing an empty table.
 */
export async function readChannelAnalytics(args: {
  organizationId: string;
  channelResourceId: string;
  /** Inclusive ISO dates (`YYYY-MM-DD`). */
  from: string;
  to: string;
  lane: "channel" | "video";
  signal?: AbortSignal;
}): Promise<ChannelAnalyticsDayRow[]> {
  const organizationId = requireOrganizationContext(args.organizationId);
  return readAllRows<ChannelAnalyticsDayRow>(
    ({ from, to }) => {
      let query = supabase
        .schema("web")
        .from("channel_analytics_daily")
        .select(ANALYTICS_COLUMNS, { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("channel_resource_id", args.channelResourceId)
        .gte("date", args.from)
        .lte("date", args.to)
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      query =
        args.lane === "channel"
          ? query.is("video_external_id", null)
          : query.not("video_external_id", "is", null);
      if (args.signal) query = query.abortSignal(args.signal);
      return query.returns<ChannelAnalyticsDayRow[]>();
    },
    { label: "web.channel_analytics_daily window" },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** What one refresh actually did, so the surface can be honest about it. */
export interface YouTubeRefreshResult {
  channelId: string;
  startDate: string;
  endDate: string;
  videos: { id: string; externalId: string; title: string }[];
  analyticsDaysCreated: number;
  analyticsDaysUpdated: number;
}

/**
 * Refresh one owned channel from YouTube. The organization is SENT, never
 * resolved server-side (`YouTubeRefreshRequest` requires it and the router
 * answers 422 `organization_required` without it).
 *
 * PUBLISHES NOTHING. Both grants behind it are read-only
 * (`youtube.readonly`, `yt-analytics.readonly`) and the server's own docstring
 * says so; this call reads the channel's recent uploads and its daily numbers
 * and mirrors them here.
 */
export async function refreshYouTubeChannel(args: {
  organizationId: string;
  connectionId: string;
  channelId: string;
  /** Inclusive ISO dates; at most 90 days apart (the provider's bound). */
  startDate: string;
  endDate: string;
}): Promise<YouTubeRefreshResult> {
  const organizationId = requireOrganizationContext(args.organizationId);
  const response = await postGoogleBackend(
    REFRESH_PATH,
    {
      organization_id: organizationId,
      connection_id: args.connectionId,
      channel_id: args.channelId,
      start_date: args.startDate,
      end_date: args.endDate,
    },
    "Unable to refresh this channel from YouTube.",
    organizationId,
  );
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.videos)) {
    throw new Error(
      "The YouTube refresh answered with something this screen cannot read.",
    );
  }
  return {
    channelId: typeof payload.channel_id === "string" ? payload.channel_id : args.channelId,
    startDate:
      typeof payload.start_date === "string" ? payload.start_date : args.startDate,
    endDate: typeof payload.end_date === "string" ? payload.end_date : args.endDate,
    videos: payload.videos.filter(isRecord).map((video) => ({
      id: typeof video.id === "string" ? video.id : "",
      externalId: typeof video.external_id === "string" ? video.external_id : "",
      title: typeof video.title === "string" ? video.title : "",
    })),
    analyticsDaysCreated: integer(payload.analytics_days_created),
    analyticsDaysUpdated: integer(payload.analytics_days_updated),
  };
}
