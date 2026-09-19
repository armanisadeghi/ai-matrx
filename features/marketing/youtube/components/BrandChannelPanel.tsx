"use client";

/**
 * THE BRAND CHANNEL PANEL — the ONE component behind the owned YouTube channel
 * (PLAN §4.11 Plane A). The brand Analytics route mounts it; the
 * `brandChannelWindow` overlay WRAPS it (`variant="bare"`) and carries no
 * channel logic of its own, because a window with a bespoke body is a second
 * renderer that drifts (`features/window-panels/FEATURE.md`).
 *
 * WHAT IT SHOWS, AND WHAT IT REFUSES TO SHOW.
 *   * The recent videos this channel has mirrored here — thumbnail, title, when
 *     it went up, its counts — each one a DOOR onto the `web_youtube_video`
 *     record (registered beside this feature in `../itemType.tsx`).
 *   * The channel's last 30 days against the 30 before, judged by the
 *     platform's ONE comparison judge (`judgeGscWindowDelta` over
 *     `judgeAnalyticsComparison`). A refused comparison ALWAYS prints its label
 *     and its reason with both day counts; it never prints nothing, and it
 *     never prints a percentage over two windows that were not collected alike.
 *   * The channel-vs-video toggle. The per-video analytics lane exists in the
 *     schema (`video_external_id`) and the server writes only the channel-wide
 *     lane today (`refresh_youtube` passes `video_external_id=None` on every
 *     day), so the video side says that in words instead of rendering an empty
 *     table that reads as "no views".
 *   * `youtube_analytics` is behind the `internal_test` rollout gate until its
 *     certification lands, and the panel says so IN the analytics section, with
 *     the server's own sentence. The channel preview (capability `youtube`,
 *     phase `approved`) is NOT gated, so the videos render either way — the two
 *     are different capabilities and conflating them would hide a working half.
 *
 * THE LIST IS ROWS, NOT `MatrxDataTable`, AND THAT IS DELIBERATE. The named
 * exemplar for this door pattern is `BrandAnalyticsWorkspace` (list → window),
 * which renders cards; a thumbnail is the first thing a creator reads and a
 * canonical table owes every column a sort AND a filter, which an image column
 * cannot honestly offer. When this becomes a full videos LIST PAGE it takes
 * `EntityListPage` whole, rather than half a table in a panel.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MonitorPlay, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { extractErrorMessage } from "@/utils/errors";
import {
  InlineQueryError,
  LoadingSurface,
} from "@/features/marketing/components/shared/MarketingUi";
import { DataFreshnessLine } from "@/features/marketing/components/shared/DataFreshnessLine";
import {
  gscDeltaRefusalLabel,
  judgeGscWindowDelta,
} from "@/features/marketing/analytics/gsc-delta";
import {
  listGoogleCapabilities,
  listGoogleConnectionInventory,
} from "@/features/marketing/google/service";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";

import {
  channelBindingDraft,
  readBrandChannelBinding,
  writeBrandChannelBinding,
} from "../binding";
import {
  CHANNEL_WINDOW_DAYS,
  YOUTUBE_ANALYTICS_CAPABILITY_KEY,
  channelWindowTotals,
  durationText,
  durationWords,
  publishedText,
  splitChannelWindows,
  videoStatsOf,
} from "../record";
import {
  MAX_REFRESH_WINDOW_DAYS,
  readChannelAnalytics,
  readChannelVideos,
  refreshYouTubeChannel,
} from "../service";
import type { ChannelAnalyticsLane, YouTubeVideoRow } from "../types";
import { PreUploadCheck } from "./PreUploadCheck";

function integer(value: number): string {
  return Intl.NumberFormat().format(Math.round(value));
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * One delta pill. The refusal LABEL always prints — a suppressed percentage
 * that prints nothing is the omission `gsc-delta.ts` exists to end.
 */
function DeltaPill({
  label,
  current,
  previous,
  currentDays,
  previousDays,
  format,
}: {
  label: string;
  current: number;
  previous: number;
  currentDays: number;
  previousDays: number;
  format: (value: number) => string;
}) {
  const delta = judgeGscWindowDelta({
    current,
    previous,
    currentDaysWithData: currentDays,
    previousDaysWithData: previousDays,
    windowDays: CHANNEL_WINDOW_DAYS,
  });
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold text-foreground">{format(current)}</dd>
      {delta.percent !== null ? (
        <p
          className={cn(
            "text-[11px] leading-4",
            delta.percent >= 0 ? "text-success" : "text-warning",
          )}
        >
          {`${delta.percent >= 0 ? "+" : ""}${delta.percent.toFixed(1)}% vs the ${CHANNEL_WINDOW_DAYS} days before`}
        </p>
      ) : (
        <p className="text-[11px] leading-4 text-muted-foreground">
          {gscDeltaRefusalLabel(delta)}
        </p>
      )}
      {delta.caveat ? (
        <p className="text-[11px] leading-4 text-muted-foreground">{delta.caveat}</p>
      ) : null}
    </div>
  );
}

function VideoRow({ video }: { video: YouTubeVideoRow }) {
  const stats = videoStatsOf(video.stats);
  return (
    <li className="flex min-w-0 items-start gap-2 rounded-md border border-border bg-card p-2">
      {video.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnail_url}
          alt={`Thumbnail for ${video.title}`}
          width={96}
          height={54}
          style={{ width: 96, height: 54 }}
          className="shrink-0 rounded border border-border object-cover"
        />
      ) : (
        <div
          style={{ width: 96, height: 54 }}
          className="flex shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/30 text-[10px] text-muted-foreground"
        >
          No thumbnail
        </div>
      )}
      <div className="min-w-0 flex-1">
        <EntityRef token="web_youtube_video" id={video.id} name={video.title} />
        <p className="text-[11px] leading-4 text-muted-foreground">
          {publishedText(video.published_at)} · {durationText(video.duration_seconds)}
          {video.sync_status !== "available"
            ? ` · ${video.sync_status_reason?.trim() || "YouTube would not give us this video the last time we asked."}`
            : ""}
        </p>
        <p className="text-[11px] leading-4 text-muted-foreground">
          {stats.views === null
            ? "YouTube did not report views for this video"
            : `${integer(stats.views)} views`}
          {stats.likes === null ? "" : ` · ${integer(stats.likes)} likes`}
          {stats.comments === null ? "" : ` · ${integer(stats.comments)} comments`}
        </p>
      </div>
    </li>
  );
}

/**
 * THE BIND DOOR — and it binds HERE, in place, rather than pointing at a screen
 * that cannot do it (`common-docs/policies/no-dead-ends.md`).
 *
 * The choices are not typed in: they are the `youtube_channel` resources the
 * connected accounts DISCOVERED at connect time
 * (`users.integration_connection_resources`, written by
 * `_discover_youtube`), which is the same row the server resolves the refresh
 * against — so a channel that can be picked here is a channel the refresh can
 * accept, and one that cannot be picked is honestly absent rather than a
 * refusal met three clicks later. With no discovered channel at all, the door
 * is the connect window, opened IN PLACE.
 */
function ChannelBindControl({
  brandId,
  brandVersion,
  onBound,
}: {
  brandId: string;
  brandVersion: number;
  onBound: () => void;
}) {
  const openConnect = useOpenGoogleConnectWindow();
  const [saving, setSaving] = useState<string | null>(null);
  const inventory = useQuery({
    queryKey: ["marketing", "google", "inventory", "youtube"] as const,
    queryFn: ({ signal }) => listGoogleConnectionInventory(signal),
  });
  const channels = (inventory.data?.resources ?? []).filter(
    (resource) => resource.resource_type === "youtube_channel",
  );

  async function bind(resource: {
    id: string;
    connection_id: string;
    resource_ref: string;
    display_name: string;
  }): Promise<void> {
    setSaving(resource.id);
    try {
      await writeBrandChannelBinding({
        brandId,
        expectedVersion: brandVersion,
        expected: {
          enabled: false,
          credentialAuthority: "",
          credentialRef: "",
          resourceRef: "",
        },
        next: channelBindingDraft({
          connectionId: resource.connection_id,
          channelId: resource.resource_ref,
        }),
      });
      toast.success(`${resource.display_name} is now this client's channel.`);
      onBound();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border px-2.5 py-2">
      <p className="text-xs leading-5 text-muted-foreground">
        No YouTube channel is bound to this client yet, so there is nothing to
        show and nothing to refresh.
      </p>
      {inventory.isLoading ? (
        <div className="h-6 w-40 animate-pulse rounded bg-muted/40" />
      ) : inventory.isError ? (
        <InlineQueryError
          what="your connected Google accounts"
          error={inventory.error}
          onRetry={() => void inventory.refetch()}
        />
      ) : channels.length === 0 ? (
        <>
          <p className="text-xs leading-5 text-muted-foreground">
            None of your connected Google accounts owns a YouTube channel we can
            see. A channel is discovered at the moment you connect the account
            that owns it.
          </p>
          <div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              onClick={() =>
                openConnect({
                  reason: "to read this client's own YouTube channel",
                })
              }
            >
              Connect the account that owns the channel
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {channels.map((resource) => (
            <Button
              key={resource.id}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={saving !== null}
              onClick={() => void bind(resource)}
            >
              {saving === resource.id ? "Binding…" : `Bind ${resource.display_name}`}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface BrandChannelPanelProps {
  brandId: string;
  /** `bare` when a window frame already provides the chrome. */
  variant?: "card" | "bare";
}

export function BrandChannelPanel({ brandId, variant = "card" }: BrandChannelPanelProps) {
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const userId = useAppSelector(selectUserId);
  // 🚨 "NO ORGANIZATION SELECTED" IS AN ANSWER, NOT AN ERROR TOAST. Every read
  // and the refresh carry an explicit organization (`requireOrganizationContext`),
  // so without one this panel can do nothing — and a person is owed the reason
  // and the way out, not a red box saying a call failed
  // (`pnpm check:organization-context`, the org-refusal-honesty lane).
  const { organizationState } = useOrganizationRequired();
  const [lane, setLane] = useState<ChannelAnalyticsLane>("channel");
  const [refreshing, setRefreshing] = useState(false);

  const binding = useQuery({
    queryKey: ["marketing", "brand", brandId, "youtube-binding"] as const,
    queryFn: ({ signal }) => readBrandChannelBinding(brandId, signal),
  });

  const inventory = useQuery({
    queryKey: ["marketing", "google", "inventory", "youtube"] as const,
    queryFn: ({ signal }) => listGoogleConnectionInventory(signal),
  });

  const capabilities = useQuery({
    queryKey: ["marketing", "google", "capabilities"] as const,
    queryFn: ({ signal }) => listGoogleCapabilities(signal),
  });

  const bound = binding.data?.state === "bound" ? binding.data : null;
  const channelResourceId =
    bound && inventory.data
      ? (inventory.data.resources.find(
          (resource) =>
            resource.resource_type === "youtube_channel" &&
            resource.resource_ref === bound.channelId,
        )?.id ?? null)
      : null;

  const videos = useQuery({
    queryKey: ["marketing", "brand", brandId, "youtube-videos", channelResourceId] as const,
    queryFn: ({ signal }) =>
      readChannelVideos({
        organizationId: organizationId ?? "",
        userId: userId ?? "",
        channelResourceId,
        signal,
      }),
    enabled: Boolean(organizationId && userId && channelResourceId),
  });

  const now = new Date();
  const windowFrom = isoDay(
    new Date(now.getTime() - 2 * CHANNEL_WINDOW_DAYS * 86_400_000),
  );
  const analytics = useQuery({
    queryKey: [
      "marketing",
      "brand",
      brandId,
      "youtube-analytics",
      channelResourceId,
      lane,
    ] as const,
    queryFn: ({ signal }) =>
      readChannelAnalytics({
        organizationId: organizationId ?? "",
        channelResourceId: channelResourceId ?? "",
        from: windowFrom,
        to: isoDay(now),
        lane,
        signal,
      }),
    enabled: Boolean(organizationId && channelResourceId),
  });

  const analyticsCapability =
    capabilities.data?.find((row) => row.key === YOUTUBE_ANALYTICS_CAPABILITY_KEY) ?? null;
  const analyticsGated =
    analyticsCapability !== null &&
    (analyticsCapability.rollout_phase === "internal_test" || !analyticsCapability.eligible);

  const days = analytics.data ?? [];
  const windows = splitChannelWindows(days, now, CHANNEL_WINDOW_DAYS);
  const current = channelWindowTotals(windows.current);
  const previous = channelWindowTotals(windows.previous);
  const newestDay = days.length ? days[days.length - 1].date : null;
  const newestVideoSync =
    (videos.data ?? []).reduce<string | null>(
      (newest, video) =>
        video.synced_at && (!newest || video.synced_at > newest) ? video.synced_at : newest,
      null,
    ) ?? null;

  async function runRefresh(): Promise<void> {
    if (!bound || !organizationId) return;
    const ok = await confirm({
      title: "Refresh this channel from YouTube",
      description:
        `This spends a call on your connected Google account and re-reads the last ${MAX_REFRESH_WINDOW_DAYS} days of ` +
        "channel analytics plus this channel's most recent uploads (up to 50). Every day already stored in that " +
        "window is OVERWRITTEN with what YouTube reports now, and each video's stored title, description, " +
        `thumbnail and counts are replaced with today's. Nothing is published, changed or removed on YouTube — ` +
        "our permission there is read-only.",
      confirmLabel: "Refresh from YouTube",
    });
    if (!ok) return;
    setRefreshing(true);
    try {
      const result = await refreshYouTubeChannel({
        organizationId,
        connectionId: bound.connectionId,
        channelId: bound.channelId,
        startDate: isoDay(
          new Date(now.getTime() - (MAX_REFRESH_WINDOW_DAYS - 1) * 86_400_000),
        ),
        endDate: isoDay(now),
      });
      toast.success(
        `${result.videos.length} videos mirrored · ${result.analyticsDaysCreated} new days, ${result.analyticsDaysUpdated} updated.`,
      );
      await Promise.all([videos.refetch(), analytics.refetch()]);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }

  const organizationMissing =
    organizationState === "required" || organizationState === "unavailable";

  const body = (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <MonitorPlay className="h-4 w-4 text-muted-foreground" aria-hidden />
          YouTube channel
        </h2>
        {bound ? (
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={refreshing}
            onClick={() => void runRefresh()}
          >
            <RefreshCw
              className={cn("h-3 w-3", refreshing && "animate-spin")}
              aria-hidden
            />
            {refreshing ? "Refreshing…" : "Refresh from YouTube"}
          </Button>
        ) : null}
      </div>

      {organizationMissing ? (
        <OrganizationContextNotice
          compact
          state={organizationState}
          what="This client's YouTube channel"
        />
      ) : binding.isLoading ? (
        <LoadingSurface label="Looking for this client's YouTube channel…" />
      ) : binding.isError ? (
        <InlineQueryError
          what="this client's YouTube channel binding"
          error={binding.error}
          onRetry={() => void binding.refetch()}
        />
      ) : binding.data?.state === "column_absent" ? (
        // Law 4: a stand-in announces itself WITH its remedy, and never
        // pretends the answer is "no channel".
        <p className="rounded-md border border-dashed border-warning/50 bg-warning/5 px-2.5 py-2 text-xs leading-5 text-foreground">
          {binding.data.sentence}
        </p>
      ) : binding.data?.state === "unbound" ? (
        <ChannelBindControl
          brandId={brandId}
          brandVersion={binding.data.brandVersion}
          onBound={() => void binding.refetch()}
        />
      ) : bound && !channelResourceId && !inventory.isLoading ? (
        <p className="rounded-md border border-dashed border-warning/50 bg-warning/5 px-2.5 py-2 text-xs leading-5 text-foreground">
          {`This client is bound to channel ${bound.channelId}, but no connected Google account here has discovered that channel as one it owns. Reconnect YouTube on that account so the channel is discovered again, then refresh.`}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Analytics for:</span>
            {(["channel", "video"] as const).map((option) => (
              <Button
                key={option}
                size="sm"
                variant={lane === option ? "default" : "outline"}
                className="h-6 px-2 text-[11px]"
                onClick={() => setLane(option)}
              >
                {option === "channel" ? "The whole channel" : "Per video"}
              </Button>
            ))}
          </div>

          {analyticsGated ? (
            // The SERVER's own words, never a sentence this screen invented —
            // and only over the ANALYTICS section: the channel preview is a
            // different capability and is not gated.
            <p className="rounded-md border border-dashed border-warning/50 bg-warning/5 px-2.5 py-2 text-xs leading-5 text-foreground">
              {analyticsCapability?.admission_error?.trim() ||
                analyticsCapability?.limitation?.trim() ||
                "YouTube Analytics is still in internal testing here, so these numbers are only available to a reviewer."}{" "}
              {analyticsCapability?.remedy?.trim() ?? ""} The videos below do not
              depend on it and are shown either way.
            </p>
          ) : null}

          {lane === "video" ? (
            <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-xs leading-5 text-muted-foreground">
              Per-video days are not collected yet. The refresh writes one row
              per day for the whole channel; the per-video lane exists in the
              table and nothing has ever written to it, so there is no per-video
              history to show — not zero views.
            </p>
          ) : analytics.isLoading ? (
            <div className="h-12 animate-pulse rounded-md border border-border bg-muted/40" />
          ) : analytics.isError ? (
            <InlineQueryError
              what="this channel's daily analytics"
              error={analytics.error}
              onRetry={() => void analytics.refetch()}
            />
          ) : days.length === 0 ? (
            <p className="text-xs leading-5 text-muted-foreground">
              Nothing has been synced for this channel yet. A refresh is the only
              thing that fills these numbers — there is no schedule behind them.
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <DeltaPill
                  label={`Views · last ${CHANNEL_WINDOW_DAYS} days`}
                  current={current.views}
                  previous={previous.views}
                  currentDays={current.daysWithData}
                  previousDays={previous.daysWithData}
                  format={integer}
                />
                <DeltaPill
                  label="Watch time (minutes)"
                  current={current.watchTimeMinutes}
                  previous={previous.watchTimeMinutes}
                  currentDays={current.daysWithData}
                  previousDays={previous.daysWithData}
                  format={integer}
                />
                <DeltaPill
                  label="Subscribers gained"
                  current={current.subscribersGained}
                  previous={previous.subscribersGained}
                  currentDays={current.daysWithData}
                  previousDays={previous.daysWithData}
                  format={integer}
                />
                <div className="min-w-0">
                  <dt className="text-[11px] text-muted-foreground">
                    Average view duration
                  </dt>
                  <dd className="text-sm font-semibold text-foreground">
                    {durationWords(current.avgViewDurationSeconds)}
                  </dd>
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    Watch time ÷ views over the window — never an average of each
                    day&apos;s average, which would weight a four-view day like a
                    busy one.
                  </p>
                </div>
              </dl>
              <DataFreshnessLine
                provider="analytics"
                dataThrough={newestDay}
                pulledAt={newestVideoSync}
              />
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">Recent videos</h3>
            {videos.isLoading ? (
              <div className="h-16 animate-pulse rounded-md border border-border bg-muted/40" />
            ) : videos.isError ? (
              <InlineQueryError
                what="this channel's videos"
                error={videos.error}
                onRetry={() => void videos.refetch()}
              />
            ) : (videos.data ?? []).length === 0 ? (
              <p className="text-xs leading-5 text-muted-foreground">
                No videos have been mirrored from this channel yet. Refresh to
                bring in its most recent uploads.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {(videos.data ?? []).map((video) => (
                  <VideoRow key={video.id} video={video} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <PreUploadCheck className="border-t border-border pt-3" />
    </div>
  );

  if (variant === "bare") return body;
  return (
    <div className="rounded-lg border border-border bg-card p-3">{body}</div>
  );
}
