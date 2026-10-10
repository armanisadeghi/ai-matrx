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
  readChannelBindingsElsewhere,
  writeBrandChannelBinding,
} from "../binding";
import {
  candidateIdentity,
  channelBindCandidates,
  orderBindRows,
  type ChannelBindCandidate,
} from "../candidates";
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
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold text-foreground">{format(current)}</dd>
      {delta.percent !== null ? (
        <p
          className={cn(
            "text-xs leading-4",
            delta.percent >= 0 ? "text-success" : "text-warning",
          )}
        >
          {`${delta.percent >= 0 ? "+" : ""}${delta.percent.toFixed(1)}% vs the ${CHANNEL_WINDOW_DAYS} days before`}
        </p>
      ) : (
        <p className="text-xs leading-4 text-muted-foreground">
          {gscDeltaRefusalLabel(delta)}
        </p>
      )}
      {delta.caveat ? (
        <p className="text-xs leading-4 text-muted-foreground">{delta.caveat}</p>
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
        <p className="text-xs leading-4 text-muted-foreground">
          {publishedText(video.published_at)} · {durationText(video.duration_seconds)}
          {video.sync_status !== "available"
            ? ` · ${video.sync_status_reason?.trim() || "YouTube would not give us this video the last time we asked."}`
            : ""}
        </p>
        <p className="text-xs leading-4 text-muted-foreground">
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
 *
 * 🚨 EVERY CANDIDATE IS TELLABLE APART, AND THE PRESS STATES ITS CONSEQUENCE
 * (V-27 NEW-6). This door used to render one bare `Bind ${display_name}` button
 * per resource row: on a real seat that was seven buttons, FOUR of them reading
 * exactly "Bind Arman Sadeghi", with nothing saying which Google account each
 * came through or whether two of them were the same channel — and the press
 * wrote the binding the whole panel then reads from, with no confirmation, while
 * the Refresh control two inches away carefully names what it spends. So each
 * row now carries the channel's title, its handle or id and the account it was
 * discovered through (`../candidates.ts`, which also collapses one channel seen
 * through several accounts into one row that says so), and the press names what
 * binding makes the refresh read and write, and on whose account
 * (`common-docs/policies/no-dead-ends.md`).
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
  // Which OTHER brands already hold each channel — so a row says "Bound to …"
  // and an unbound channel is never mistaken for one nobody uses.
  const elsewhere = useQuery({
    queryKey: ["marketing", "youtube", "bindings-elsewhere", brandId] as const,
    queryFn: ({ signal }) => readChannelBindingsElsewhere(brandId, signal),
  });
  const rows = orderBindRows(
    channelBindCandidates(inventory.data),
    elsewhere.data ?? [],
  );

  async function bind(
    candidate: ChannelBindCandidate,
    boundTo: readonly string[],
  ): Promise<void> {
    // 🚨 THE CONSEQUENCE FIRST, NOT A GENERIC "ARE YOU SURE?" — this press is
    // what makes every later refresh read and overwrite under THIS client, on
    // THIS account's quota, and a wrong pick is silent afterwards.
    const ok = await confirm({
      title: `Bind ${candidate.title} to this client`,
      description:
        "Refreshes for this client will read this channel and replace its stored numbers. Nothing is changed on YouTube.",
      confirmLabel: `Bind ${candidate.title}`,
    });
    if (!ok) return;
    setSaving(candidate.resourceId);
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
          connectionId: candidate.connectionId,
          channelId: candidate.channelId,
        }),
      });
      toast.success(`${candidate.title} is now this client's channel.`);
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
        No channel linked
      </p>
      {inventory.isLoading || elsewhere.isLoading ? (
        <div className="h-6 w-40 animate-pulse rounded bg-muted/40" />
      ) : inventory.isError ? (
        <InlineQueryError
          what="your connected Google accounts"
          error={inventory.error}
          onRetry={() => void inventory.refetch()}
        />
      ) : elsewhere.isError ? (
        <InlineQueryError
          what="the other clients' channel bindings"
          error={elsewhere.error}
          onRetry={() => void elsewhere.refetch()}
        />
      ) : rows.length === 0 ? (
        <>
          <p className="text-xs leading-5 text-muted-foreground">
            No connected account has a channel
          </p>
          <div>
            <Button
              variant="outline"
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
        <ul className="flex flex-col gap-1.5">
          {rows.map(({ candidate, boundTo }) => (
            <li
              key={candidate.channelId}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">
                  {candidate.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {candidateIdentity(candidate)}
                </p>
                {boundTo.length > 0 ? (
                  // Held by another client: say so on the row, so the press
                  // is never read as adding this channel to this brand.
                  <p className="text-xs text-foreground">
                    {`Bound to ${boundTo.join(", ")}`}
                  </p>
                ) : null}
              </div>
              <Button
                variant="outline"
                className="shrink-0"
                disabled={saving !== null}
                aria-label={`Bind ${candidate.title} (${candidateIdentity(candidate)})${boundTo.length > 0 ? `, already bound to ${boundTo.join(", ")}` : ""}`}
                onClick={() => void bind(candidate, boundTo)}
              >
                {saving === candidate.resourceId ? "Binding…" : "Bind"}
              </Button>
            </li>
          ))}
        </ul>
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
  const userId = useAppSelector(selectUserId);
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

  // 🚨 THE BRAND'S ORGANIZATION, NEVER THE SELECTED ONE (Arman, 2026-09-23:
  // "The permission is to the person, not the org"). The mirrored videos and
  // analytics live in the brand's own organization; reading them in whichever
  // organization happens to be selected showed an empty channel (or nothing
  // at all with none selected). The REFRESH carries it too (2026-09-26): the
  // mirrored rows it writes belong to the brand, so the selected organization
  // plays no part in this panel and there is no organization mistake to warn about.
  const brandOrganizationId = bound?.organizationId ?? null;

  const videos = useQuery({
    queryKey: [
      "marketing",
      "brand",
      brandId,
      "youtube-videos",
      channelResourceId,
      brandOrganizationId,
    ] as const,
    queryFn: ({ signal }) =>
      readChannelVideos({
        organizationId: brandOrganizationId ?? "",
        userId: userId ?? "",
        channelResourceId,
        signal,
      }),
    enabled: Boolean(brandOrganizationId && userId && channelResourceId),
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
      brandOrganizationId,
    ] as const,
    queryFn: ({ signal }) =>
      readChannelAnalytics({
        organizationId: brandOrganizationId ?? "",
        channelResourceId: channelResourceId ?? "",
        from: windowFrom,
        to: isoDay(now),
        lane,
        signal,
      }),
    enabled: Boolean(brandOrganizationId && channelResourceId),
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
    if (!bound || !brandOrganizationId) return;
    const ok = await confirm({
      title: "Refresh this channel from YouTube",
      description:
        "Re-reads this channel's recent analytics and uploads and replaces the stored numbers. Nothing is changed on YouTube.",
      confirmLabel: "Refresh from YouTube",
    });
    if (!ok) return;
    setRefreshing(true);
    try {
      const result = await refreshYouTubeChannel({
        organizationId: brandOrganizationId,
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

  const body = (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <MonitorPlay className="h-4 w-4 text-muted-foreground" aria-hidden />
          YouTube channel
        </h2>
        {bound && brandOrganizationId ? (
          <Button
            icon={<RefreshCw
              className={cn("h-3 w-3", refreshing && "animate-spin")}
              aria-hidden
            />}
            variant="outline"
            disabled={refreshing}
            onClick={() => void runRefresh()}
          >
            {refreshing ? "Refreshing…" : "Refresh from YouTube"}
          </Button>
        ) : null}
      </div>

      {binding.isLoading ? (
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
          {"Reconnect YouTube to refresh this channel."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Analytics for:</span>
            {(["channel", "video"] as const).map((option) => (
              <Button
                key={option}
                variant={lane === option ? "primary" : "outline"}
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
                "YouTube Analytics isn't available to your account yet."}{" "}
              {analyticsCapability?.remedy?.trim() ?? ""}
              <ErrorAlchemyMenu />
            </p>
          ) : null}

          {lane === "video" ? (
            <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-xs leading-5 text-muted-foreground">
              Per-video analytics are not available yet.
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
              No analytics yet. Refresh to load them.
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
                  <dt className="text-xs text-muted-foreground">
                    Average view duration
                  </dt>
                  <dd className="text-sm font-semibold text-foreground">
                    {durationWords(current.avgViewDurationSeconds)}
                  </dd>
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
                No videos yet. Refresh to load them.
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
