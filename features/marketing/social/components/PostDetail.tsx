"use client";

/**
 * Post detail (UI-SPEC §4). ONE body, two hosts: the right-hand drawer opened
 * from any post card (`PostDrawer`) and the full page (`PostDetailPage`).
 *
 *   left   media — the private-bucket playback door, poster until Play
 *   right  tabs Overview · Transcript · Metrics · Breakdown
 *
 * AI is user-triggered only: transcript and breakdown run from a button that
 * names its cost. While the breakdown agent is not built the server answers
 * 409 `social_agent_not_built`; that is shown as its own short state, not an
 * error toast.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, ExternalLink, Play, RefreshCw } from "lucide-react";

import { Button, RegionSkeleton, SegmentedControl, Tabs } from "@ai-matrx/design-system/controls";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { KpiTile } from "@/components/official/kpi/KpiTile";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { toast } from "@/lib/toast";

import {
  socialKeys,
  usePostAnalysis,
  usePostDetail,
  usePostMetrics,
  usePostTranscript,
  useSwipeCollections,
} from "../hooks";
import {
  POST_METRIC_LABELS,
  availableMetrics,
  formatDuration,
  outlierInputFrom,
  postMetricSeries,
  relativeAge,
  type PostMetricKey,
} from "../mappers";
import { OUTLIER_MIN_POSTS, formatCompact, formatPercentile } from "../outlier";
import {
  addToCollection,
  analyzePost,
  createCollection,
  fetchPlaybackUrl,
  getTranscript,
  ingestPost,
  listPostMedia,
  socialErrorCode,
  socialErrorMessage,
} from "../server";
import type { PostAnalysisRow, PostCardModel, PostMediaRef } from "../types";
import { MetricChart, seriesToCsv } from "./MetricChart";
import { OutlierBadge } from "./OutlierBadge";
import { PlatformMark } from "./PlatformMark";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";

export type DetailTab = "overview" | "transcript" | "metrics" | "breakdown";
const DETAIL_TABS = [
  { value: "overview", label: "Overview" },
  { value: "transcript", label: "Transcript" },
  { value: "metrics", label: "Metrics" },
  { value: "breakdown", label: "Breakdown" },
] as const;

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

/** Aspect ratio (w/h) a post's player starts with, before the poster or the video reports its own. */
export function guessAspect(format: string, platform: string): number {
  if (platform === "youtube") return format === "short" ? 9 / 16 : 16 / 9;
  return ["reel", "short", "story", "video"].includes(format) && platform !== "facebook" && platform !== "linkedin" && platform !== "x"
    ? 9 / 16
    : 16 / 9;
}

/** The player frame: sized by the media's real aspect ratio, capped at 70vh, always the column's width at most. */
function PlayerFrame({ ratio, children }: { ratio: number; children: React.ReactNode }) {
  return (
    <div
      className="relative mx-auto max-w-full overflow-hidden rounded-lg bg-black"
      style={{ aspectRatio: String(ratio), width: `min(100%, calc(70vh * ${ratio}))` }}
    >
      {children}
    </div>
  );
}

function PostMedia({
  postId,
  organizationId,
  thumbnailUrl,
  postUrl,
  platform,
  platformPostId,
  format,
}: {
  postId: string;
  organizationId: string;
  thumbnailUrl: string | null;
  postUrl: string;
  platform: string;
  platformPostId: string;
  format: string;
}) {
  const client = useQueryClient();
  const embed = platform === "youtube";
  const media = useQuery({
    queryKey: ["marketing", "social", "media", postId],
    queryFn: ({ signal }) => listPostMedia(postId, { organizationId, signal }),
    staleTime: 60_000,
    enabled: !embed,
  });
  const [src, setSrc] = useState<{ url: string; mime: string | null } | null>(null);
  const [embedding, setEmbedding] = useState(false);
  const [ratio, setRatio] = useState(() => guessAspect(format, platform));
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const current = src?.url;
    return () => {
      if (current) URL.revokeObjectURL(current);
    };
  }, [src]);

  const primary: PostMediaRef | undefined = embed
    ? undefined
    : (media.data?.find((m) => m.role === "video") ??
      media.data?.find((m) => m.role.startsWith("image")) ??
      media.data?.[0]);
  const isVideo = primary?.mime_type?.startsWith("video") ?? primary?.role === "video";

  async function load() {
    if (!primary) return;
    setLoading(true);
    setError("");
    try {
      setSrc({ url: await fetchPlaybackUrl(primary.door, { organizationId }), mime: primary.mime_type });
    } catch (err) {
      setError(socialErrorMessage(err, "Media unavailable"));
    } finally {
      setLoading(false);
    }
  }

  async function fetchMedia() {
    const ok = await confirm({
      title: "Fetch this post's video?",
      description: "Fetches the post again and stores its video privately so it can play here. Costs about 1 credit.",
      confirmLabel: "Fetch video",
    });
    if (!ok) return;
    setFetching(true);
    try {
      await ingestPost({ url: postUrl, landMedia: true, transcript: false, force: true }, { organizationId });
      await client.invalidateQueries({ queryKey: ["marketing", "social", "media", postId] });
    } catch (err) {
      toast.error(socialErrorMessage(err, "Couldn't fetch the media"));
    } finally {
      setFetching(false);
    }
  }

  if (embedding && embed) {
    return (
      <PlayerFrame ratio={ratio}>
        <iframe
          title="YouTube player"
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(platformPostId)}?autoplay=1&rel=0&playsinline=1`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      </PlayerFrame>
    );
  }
  if (src && isVideo) {
    return (
      <PlayerFrame ratio={ratio}>
        <video
          src={src.url}
          poster={thumbnailUrl ?? undefined}
          controls
          autoPlay
          playsInline
          loop
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
          }}
          className="h-full w-full object-contain"
        />
      </PlayerFrame>
    );
  }
  if (src) {
    return (
      <PlayerFrame ratio={ratio}>
        <img src={src.url} alt="" className="h-full w-full object-contain" />
      </PlayerFrame>
    );
  }
  return (
    <PlayerFrame ratio={ratio}>
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt=""
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            const i = e.currentTarget;
            // A YouTube poster is letterboxed 4:3 inside its own 16:9; trust the platform's own ratio there.
            if (!embed && i.naturalWidth && i.naturalHeight) setRatio(i.naturalWidth / i.naturalHeight);
          }}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30">
        {embed ? (
          <Button variant="primary" icon={<Play />} onClick={() => setEmbedding(true)}>
            Play
          </Button>
        ) : media.isLoading ? null : primary ? (
          <Button variant="primary" icon={<Play />} onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Play"}
          </Button>
        ) : (
          <Button variant="outline" icon={<RefreshCw />} onClick={() => void fetchMedia()} disabled={fetching}>
            {fetching ? "Fetching…" : "Fetch video"}
          </Button>
        )}
        <span className="min-h-4 text-xs text-white">
          {error || (!embed && (media.isError ? "Media unavailable" : !media.isLoading && !primary ? "Video not stored" : ""))}
        </span>
      </div>
    </PlayerFrame>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function LabelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 border-b border-border py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-foreground">{children}</span>
    </div>
  );
}

function TranscriptTab({ postId, organizationId }: { postId: string; organizationId: string }) {
  const transcript = usePostTranscript(postId);
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function fetchIt() {
    const ok = await confirm({
      title: "Get the transcript?",
      description: "Buys the transcript once, or transcribes the stored video. Costs about 1 credit.",
      confirmLabel: "Get transcript",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const outcome = await getTranscript(postId, { organizationId });
      await client.invalidateQueries({ queryKey: socialKeys.transcript(postId) });
      if (outcome.status === "none") toast.message("No speech found in this post");
    } catch (err) {
      toast.error(socialErrorMessage(err, "Couldn't get the transcript"));
    } finally {
      setBusy(false);
    }
  }

  if (transcript.isLoading) return <RegionSkeleton shape="rows" count={4} />;
  const row = transcript.data;
  if (!row) {
    return (
      <div className="flex flex-col items-start gap-2 py-2">
        <p className="text-xs text-muted-foreground">No transcript yet</p>
        <Button variant="outline" onClick={() => void fetchIt()} disabled={busy} title="About 1 credit">
          {busy ? "Working…" : "Get transcript"}
        </Button>
      </div>
    );
  }
  const first = row.text.split(/(?<=[.!?])\s+/)[0] ?? "";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{`${row.language} · ${row.source}${row.word_count ? ` · ${row.word_count} words` : ""}`}</span>
        <Button
          variant="quiet"
          onClick={() => void navigator.clipboard.writeText(row.text).then(() => toast.success("Copied"))}
        >
          Copy
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        <mark className="rounded bg-primary/15 px-0.5 text-foreground">{first}</mark>
        {row.text.slice(first.length)}
      </p>
    </div>
  );
}

function MetricsTab({
  postId,
  postedAt,
  baselineViews,
  velocity,
}: {
  postId: string;
  postedAt: string | null;
  baselineViews: number | null;
  velocity: number | null;
}) {
  const snapshots = usePostMetrics(postId);
  const [metric, setMetric] = useState<PostMetricKey>("views");
  if (snapshots.isLoading) return <RegionSkeleton shape="rows" count={3} />;
  const rows = snapshots.data ?? [];
  const metrics = availableMetrics(rows);
  const active = metrics.includes(metric) ? metric : (metrics[0] ?? "views");
  const points = postMetricSeries(rows, active);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {metrics.length > 1 ? (
          <SegmentedControl
            aria-label="Metric"
            value={active}
            onValueChange={setMetric}
            data={metrics.map((m) => ({ value: m, label: POST_METRIC_LABELS[m] }))}
          />
        ) : (
          <span className="text-xs text-muted-foreground">{POST_METRIC_LABELS[active]}</span>
        )}
        <Button
          variant="quiet"
          disabled={points.length === 0}
          onClick={() => {
            const csv = seriesToCsv(POST_METRIC_LABELS[active], points);
            void navigator.clipboard.writeText(csv).then(() => toast.success("CSV copied"));
          }}
        >
          CSV
        </Button>
      </div>
      <MetricChart
        points={points}
        label={POST_METRIC_LABELS[active]}
        baseline={active === "views" ? baselineViews : null}
        sinceMs={postedAt ? Date.parse(postedAt) : null}
      />
      <KpiTile label="Velocity 24h" value={velocity === null ? null : formatCompact(velocity)} title="Views gained in the first 24 hours after posting." />
    </div>
  );
}

function BreakdownRows({ analysis }: { analysis: PostAnalysisRow }) {
  const audio = analysis.audio as { type?: string; notes?: string } | null;
  return (
    <div>
      <LabelRow label="Hook">{analysis.hook_text ?? "—"}</LabelRow>
      <LabelRow label="Hook type">{analysis.hook_type ?? "—"}</LabelRow>
      <LabelRow label="On-screen text">{analysis.on_screen_text ?? "—"}</LabelRow>
      <LabelRow label="Format">{analysis.format_tags.join(", ") || "—"}</LabelRow>
      <LabelRow label="Style">{analysis.style_tags.join(", ") || "—"}</LabelRow>
      <LabelRow label="Audio">{audio?.type ? `${audio.type}${audio.notes ? ` · ${audio.notes}` : ""}` : "—"}</LabelRow>
      <LabelRow label="CTA">{analysis.cta ?? "—"}</LabelRow>
      <LabelRow label="Summary">{analysis.summary ?? "—"}</LabelRow>
      <p className="pt-2 text-[11px] text-muted-foreground">
        {`${analysis.model ?? "model"} · ${analysis.cost_usd != null ? `$${Number(analysis.cost_usd).toFixed(3)}` : "—"} · ${relativeAge(analysis.created_at)}`}
      </p>
    </div>
  );
}

function BreakdownTab({ postId, organizationId }: { postId: string; organizationId: string }) {
  const analysis = usePostAnalysis(organizationId, postId);
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "not_built" | "failed">("idle");
  const [failure, setFailure] = useState<unknown>(null);

  async function run() {
    setBusy(true);
    setState("idle");
    try {
      await analyzePost(postId, { organizationId });
      await client.invalidateQueries({ queryKey: socialKeys.analysis(organizationId, postId) });
    } catch (err) {
      setFailure(err);
      setState(socialErrorCode(err) === "social_agent_not_built" ? "not_built" : "failed");
      if (socialErrorCode(err) !== "social_agent_not_built") {
        toast.error(socialErrorMessage(err, "Breakdown failed"));
      }
    } finally {
      setBusy(false);
    }
  }

  if (analysis.isLoading) return <RegionSkeleton shape="rows" count={5} />;
  if (analysis.data) return <BreakdownRows analysis={analysis.data} />;
  return (
    <div className="flex flex-col items-start gap-2 py-2">
      <Button variant="outline" onClick={() => void run()} disabled={busy} title="Runs the post breakdown for this organization">
        {busy ? "Running…" : "Run breakdown"}
      </Button>
      {state === "failed" ? (
        <p className="flex min-h-4 items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          Breakdown failed. Retry.
          <ErrorAlchemyMenu error={failure} operation="social post breakdown" />
        </p>
      ) : (
        <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
          {state === "not_built" ? "Breakdown agent not built yet" : ""}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export function PostDetailBody({ postId, organizationId, brandSeg, initialTab = "overview" }: { postId: string; organizationId: string; brandSeg: string; initialTab?: DetailTab }) {
  const detail = usePostDetail(postId);
  const collections = useSwipeCollections(organizationId);
  const client = useQueryClient();
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(collectionId: string | null) {
    setBusy(true);
    try {
      let id = collectionId;
      if (!id) id = (await createCollection({ name: "Saved" }, { organizationId })).collection_id;
      await addToCollection(id, { itemType: "social_post", itemId: postId }, { organizationId });
      await client.invalidateQueries({ queryKey: socialKeys.collections(organizationId) });
      toast.success("Saved to swipe file");
    } catch (err) {
      toast.error(socialErrorMessage(err, "Couldn't save the post"));
    } finally {
      setBusy(false);
    }
  }

  async function refreshMetrics(url: string) {
    const ok = await confirm({
      title: "Refresh this post's numbers?",
      description: "Fetches fresh views and likes. Costs about 1 credit.",
      confirmLabel: "Refresh",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await ingestPost({ url, landMedia: false, transcript: false, force: true }, { organizationId });
      await client.invalidateQueries({ queryKey: socialKeys.all });
    } catch (err) {
      toast.error(socialErrorMessage(err, "Refresh failed"));
    } finally {
      setBusy(false);
    }
  }

  if (detail.isLoading) return <RegionSkeleton shape="cards" count={2} />;
  if (detail.isError || !detail.data) {
    return (
      <div className="flex flex-col items-start gap-2 p-3">
        <p className="flex items-center gap-1 text-sm text-foreground">
          {detail.isError ? "Couldn't load this post" : "Post not found"}
          {detail.isError ? <ErrorAlchemyMenu error={detail.error} operation="load social post" /> : null}
        </p>
        {detail.isError ? (
          <Button variant="outline" onClick={() => void detail.refetch()}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }
  const { post, stat, profile } = detail.data;
  const outlier = outlierInputFrom(stat, post.posted_at);
  const duration = formatDuration(post.duration_seconds === null ? null : Number(post.duration_seconds));
  const caption = post.caption ?? post.title ?? "";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-2">
        <PostMedia
          key={postId}
          postId={postId}
          organizationId={organizationId}
          thumbnailUrl={post.thumbnail_url}
          postUrl={post.url}
          platform={post.platform}
          platformPostId={post.platform_post_id}
          format={post.format}
        />
        <div className="flex flex-wrap items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" icon={<Bookmark />} disabled={busy}>
                Save
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(collections.data ?? []).map((c) => (
                <DropdownMenuItem key={c.id} onSelect={() => void save(c.id)}>
                  {c.name}
                </DropdownMenuItem>
              ))}
              {(collections.data ?? []).length === 0 ? (
                <DropdownMenuItem onSelect={() => void save(null)}>New collection “Saved”</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" icon={<ExternalLink />} asChild>
            <a href={post.url} target="_blank" rel="noreferrer noopener">
              Open original
            </a>
          </Button>
          <Button variant="quiet" icon={<RefreshCw />} disabled={busy} onClick={() => void refreshMetrics(post.url)} title="Refresh metrics · about 1 credit">
            Refresh
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {`Last refreshed ${relativeAge(post.last_refreshed_at)} · via ${post.provider}`}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <Tabs aria-label="Post sections" value={tab} onValueChange={setTab} data={DETAIL_TABS} />
        {tab === "overview" ? (
          <div className="flex flex-col">
            <LabelRow label="Creator">
              {profile ? (
                <Link className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline" href={`/marketing/${brandSeg}/socials/${profile.platform}/${profile.id}`}>
                  <PlatformMark platform={profile.platform} size={16} />{formatSocialHandle({ platform: profile.platform, handle: profile.handle, url: profile.profile_url })}
                </Link>
              ) : (
                "—"
              )}
            </LabelRow>
            <LabelRow label="Multiple">
              {outlier.score === null ? (
                <span className="text-muted-foreground" title={`A multiple compares this post with at least ${OUTLIER_MIN_POSTS} other posts of the creator`}>
                  {`Needs ${OUTLIER_MIN_POSTS + 1}+ posts`}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <OutlierBadge input={outlier} />
                  <span className="tabular-nums text-muted-foreground">
                    {`${formatPercentile(outlier.percentile)} · median ${formatCompact(outlier.baselineViews)}`}
                  </span>
                </span>
              )}
            </LabelRow>
            <LabelRow label="Views">{formatCompact(stat?.views ?? null)}</LabelRow>
            <LabelRow label="Likes">{formatCompact(stat?.likes ?? null)}</LabelRow>
            <LabelRow label="Comments">{formatCompact(stat?.comments ?? null)}</LabelRow>
            <LabelRow label="Posted">{post.posted_at ? new Date(post.posted_at).toLocaleString() : "—"}</LabelRow>
            <LabelRow label="Format">{`${post.format}${duration ? ` · ${duration}` : ""}`}</LabelRow>
            <LabelRow label="Caption">
              <button type="button" onClick={() => setExpanded((v) => !v)} className={`text-left ${expanded ? "" : "line-clamp-3"}`}>
                {caption || "—"}
              </button>
            </LabelRow>
            {post.hashtags.length ? <LabelRow label="Hashtags">{post.hashtags.map((h) => `#${h}`).join(" ")}</LabelRow> : null}
          </div>
        ) : null}
        {tab === "transcript" ? <TranscriptTab postId={postId} organizationId={organizationId} /> : null}
        {tab === "metrics" ? (
          <MetricsTab
            postId={postId}
            postedAt={post.posted_at}
            baselineViews={outlier.baselineViews}
            velocity={stat?.velocity_24h == null ? null : Number(stat.velocity_24h)}
          />
        ) : null}
        {tab === "breakdown" ? <BreakdownTab postId={postId} organizationId={organizationId} /> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hosts
// ---------------------------------------------------------------------------

/** The right-hand drawer a post card opens. */
export function PostDrawer({
  post,
  onClose,
  initialTab,
}: {
  post: PostCardModel | null;
  onClose: () => void;
  initialTab?: DetailTab;
}) {
  const brand = useMarketingBrand();
  return (
    <Drawer open={post !== null} onOpenChange={(open) => (open ? undefined : onClose())} direction="right">
      {/* A fixed width: content-sized (`w-auto`) made the drawer jump between a 16:9 and a 9:16 post. */}
      <DrawerContent className="!w-[min(64rem,92vw)]">
        <DrawerHeader>
          <div className="flex items-center justify-between gap-2">
            <DrawerTitle className="truncate text-sm">{post?.hookLine || "Post"}</DrawerTitle>
            {post ? (
              <Button variant="quiet" asChild>
                <Link href={`/marketing/${brand.seg}/socials/post/${post.postId}`}>Open full page</Link>
              </Button>
            ) : null}
          </div>
        </DrawerHeader>
        <DrawerBody className="px-3 pb-4">
          {post ? <PostDetailBody key={`${post.postId}:${initialTab ?? ""}`} postId={post.postId} organizationId={brand.organizationId} brandSeg={brand.seg} initialTab={initialTab} /> : null}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

/** `/socials/post/[postId]`. */
export function PostDetailPage({ postId }: { postId: string }) {
  const brand = useMarketingBrand();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button variant="quiet" icon={<ArrowLeft />} onClick={() => router.back()}>
          Back
        </Button>
      </div>
      <PostDetailBody postId={postId} organizationId={brand.organizationId} brandSeg={brand.seg} />
    </div>
  );
}
