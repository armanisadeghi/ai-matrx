"use client";

/**
 * Post detail (UI-SPEC §4). ONE body, three hosts: the floating panel
 * (`SocialPostWindow`), the canvas tab (`social-post`) and the full page
 * (`PostDetailPage`). Nothing here knows which one it is in except `host`,
 * which only decides whether the canvas/panel switch is offered.
 *
 *   media   the player at its true aspect ratio (PostMedia), save/original/refresh under it
 *   info    creator row, stat strip (views .. multiple), then tabs
 *           Overview · Transcript · Metrics · Breakdown
 *
 * Portrait posts sit media-left / info-right once the host is wide enough;
 * landscape posts and narrow hosts stack. The layout answers to the HOST's
 * width (container query), never the viewport's, so a 600px panel and a
 * canvas tab get the same care as the full page.
 *
 * AI is user-triggered only: transcript and breakdown run from a button.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, ExternalLink, PanelRightClose, RefreshCw } from "lucide-react";

import { Button, RegionSkeleton, SegmentedControl, Tabs } from "@ai-matrx/design-system/controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { KpiTile } from "@/components/official/kpi/KpiTile";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";
import { cn } from "@/lib/utils";
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
import { formatTimestamp, languageName, parseTranscript, plainTranscript, wordCountOf } from "../transcript";
import { OUTLIER_MIN_POSTS, formatCompact } from "../outlier";
import { confirmPostSpend } from "../postSpend";
import {
  addToCollection,
  analyzePost,
  createCollection,
  getTranscript,
  ingestPost,
  socialErrorCode,
  socialErrorMessage,
} from "../server";
import type { PostAnalysisRow } from "../types";
import { MetricChart, seriesToCsv } from "./MetricChart";
import { OutlierBadge } from "./OutlierBadge";
import { PlatformMark } from "./PlatformMark";
import { PostMedia, guessAspect } from "./PostMedia";

export { guessAspect };

export type DetailTab = "overview" | "transcript" | "metrics" | "breakdown";
const DETAIL_TABS = [
  { value: "overview", label: "Overview" },
  { value: "transcript", label: "Transcript" },
  { value: "metrics", label: "Metrics" },
  { value: "breakdown", label: "Breakdown" },
] as const;

export type PostHost = "window" | "canvas" | "page";

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function LabelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 border-b border-border py-1.5 text-xs">
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
    if (!(await confirmPostSpend("transcript"))) return;
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
      <div className="flex flex-col items-start gap-2 py-1">
        <p className="text-xs text-muted-foreground">No transcript yet.</p>
        <Button variant="outline" onClick={() => void fetchIt()} disabled={busy}>
          {busy ? "Transcribing…" : "Get transcript"}
        </Button>
      </div>
    );
  }
  return <TranscriptBody text={row.text} language={row.language} wordCount={row.word_count} />;
}

function TranscriptBody({ text, language, wordCount }: { text: string; language: string; wordCount: number | null }) {
  const [showTimes, setShowTimes] = useState(false);
  const paragraphs = useMemo(() => parseTranscript(text), [text]);
  const hasTimes = paragraphs.some((p) => p.start !== null);
  const words = wordCount && wordCount > 0 ? wordCount : wordCountOf(paragraphs);
  const meta = [languageName(language), words > 0 ? `${words.toLocaleString()} words` : null].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-7 items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{meta}</span>
        <span className="flex items-center gap-1">
          {hasTimes ? (
            <Button variant="quiet" aria-pressed={showTimes} onClick={() => setShowTimes((v) => !v)}>
              {showTimes ? "Hide times" : "Show times"}
            </Button>
          ) : null}
          <Button
            variant="quiet"
            onClick={() => void navigator.clipboard.writeText(plainTranscript(paragraphs)).then(() => toast.success("Copied"))}
          >
            Copy
          </Button>
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {paragraphs.map((p, i) => (
          <div key={`${p.start ?? "p"}-${i}`} className="flex gap-3">
            {showTimes && hasTimes ? (
              <span className="w-10 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                {p.start === null ? "" : formatTimestamp(p.start)}
              </span>
            ) : null}
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">{p.text}</p>
          </div>
        ))}
      </div>
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
      <LabelRow label="On-screen">{analysis.on_screen_text ?? "—"}</LabelRow>
      <LabelRow label="Format">{analysis.format_tags.join(", ") || "—"}</LabelRow>
      <LabelRow label="Style">{analysis.style_tags.join(", ") || "—"}</LabelRow>
      <LabelRow label="Audio">{audio?.type ? `${audio.type}${audio.notes ? ` · ${audio.notes}` : ""}` : "—"}</LabelRow>
      <LabelRow label="CTA">{analysis.cta ?? "—"}</LabelRow>
      <LabelRow label="Summary">{analysis.summary ?? "—"}</LabelRow>
      <p className="pt-2 text-[11px] text-muted-foreground">{`Analyzed ${relativeAge(analysis.created_at)}`}</p>
    </div>
  );
}

function BreakdownTab({ postId, organizationId }: { postId: string; organizationId: string }) {
  const analysis = usePostAnalysis(organizationId, postId);
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "unavailable" | "failed">("idle");
  const [failure, setFailure] = useState<unknown>(null);

  async function run() {
    setBusy(true);
    setState("idle");
    try {
      await analyzePost(postId, { organizationId });
      await client.invalidateQueries({ queryKey: socialKeys.analysis(organizationId, postId) });
    } catch (err) {
      setFailure(err);
      setState(socialErrorCode(err) === "social_agent_not_built" ? "unavailable" : "failed");
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
    <div className="flex flex-col items-start gap-2 py-1">
      {state === "unavailable" ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Breakdown isn't available yet
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Hook, format, audio and call to action.</p>
          <Button variant="outline" onClick={() => void run()} disabled={busy}>
            {busy ? "Analyzing…" : "Run breakdown"}
          </Button>
        </>
      )}
      {state === "failed" ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          Breakdown failed
          <ErrorAlchemyMenu error={failure} operation="social post breakdown" />
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat strip
// ---------------------------------------------------------------------------

function Stat({ label, value, sub, title }: { label: string; value: React.ReactNode; sub?: string; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-md border border-border bg-card px-2 py-1" title={title}>
      <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-semibold tabular-nums text-foreground">{value}</span>
      {sub ? <span className="truncate text-[10px] text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export function PostDetailBody({
  postId,
  organizationId,
  brandSeg,
  initialTab = "overview",
  host = "page",
  onSwitchHost,
  onTitle,
}: {
  postId: string;
  organizationId: string;
  brandSeg: string;
  initialTab?: DetailTab;
  host?: PostHost;
  /** Canvas host: hand the post to the floating panel. */
  onSwitchHost?: () => void;
  /** Reports a short title for the host's title bar once the post is read. */
  onTitle?: (title: string) => void;
}) {
  const detail = usePostDetail(postId);
  const collections = useSwipeCollections(organizationId);
  const client = useQueryClient();
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);

  const loaded = detail.data;
  const titleText = loaded ? (loaded.post.title ?? loaded.post.caption ?? "").trim().replace(/\s+/g, " ").slice(0, 60) : "";
  useEffect(() => {
    if (onTitle && loaded) onTitle(titleText || "Post");
  }, [onTitle, loaded, titleText]);

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
    if (!(await confirmPostSpend("refresh_metrics"))) return;
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

  if (detail.isLoading) {
    return (
      <div className="p-3">
        <RegionSkeleton shape="cards" count={2} />
      </div>
    );
  }
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
  const outlier = outlierInputFrom(stat, post.posted_at, undefined, undefined, post.platform);
  const duration = formatDuration(post.duration_seconds === null ? null : Number(post.duration_seconds));
  const caption = post.caption ?? post.title ?? "";
  const currentRatio = ratio ?? guessAspect(post.format, post.platform);
  const portrait = currentRatio < 1;
  const hashtags = post.hashtags ?? [];

  const actions = (
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
          Original
        </a>
      </Button>
      <Button
        variant="quiet"
        icon={<RefreshCw />}
        disabled={busy}
        onClick={() => void refreshMetrics(post.url)}
        title={`Refresh numbers · updated ${relativeAge(post.last_refreshed_at)}`}
        aria-label="Refresh numbers"
      />
      {host === "canvas" && onSwitchHost ? (
        <Button variant="quiet" icon={<PanelRightClose />} onClick={onSwitchHost} title="Open as a floating panel">
          Panel
        </Button>
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(
        "@container min-h-0 w-full",
        host === "page" ? "" : "h-full overflow-y-auto @[34rem]:overflow-hidden",
      )}
    >
      <div
        className={cn(
          "grid gap-3 p-3",
          host !== "page" && "@[34rem]:h-full",
          portrait ? "@[34rem]:grid-cols-[14.5rem_minmax(0,1fr)]" : "@[44rem]:grid-cols-[22rem_minmax(0,1fr)]",
        )}
      >
        <div className="flex min-w-0 flex-col gap-2 @[34rem]:min-h-0">
          <div className={cn("w-full", portrait ? "mx-auto max-w-[14.5rem]" : "mx-auto max-w-[26rem] @[44rem]:max-w-none")}>
            <PostMedia
              key={postId}
              postId={postId}
              organizationId={organizationId}
              thumbnailUrl={post.thumbnail_url}
              thumbnailFileId={post.thumbnail_file_id}
              postUrl={post.url}
              platform={post.platform}
              platformPostId={post.platform_post_id}
              format={post.format}
              durationSeconds={post.duration_seconds === null ? null : Number(post.duration_seconds)}
              onRatio={setRatio}
            />
          </div>
          {actions}
        </div>

        <div className={cn("@container/info flex min-w-0 flex-col gap-2.5", host !== "page" && "@[34rem]:min-h-0 @[34rem]:overflow-y-auto")}>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {profile ? (
              <Link
                className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground underline-offset-2 hover:underline"
                href={`/marketing/${brandSeg}/socials/${profile.platform}/${profile.id}`}
              >
                <PlatformMark platform={profile.platform} size={16} />
                <span className="truncate">{formatSocialHandle({ platform: profile.platform, handle: profile.handle, url: profile.profile_url })}</span>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <PlatformMark platform={post.platform} size={16} />
                Unknown creator
              </span>
            )}
            <span className="text-muted-foreground" title={post.posted_at ? new Date(post.posted_at).toLocaleString() : undefined}>
              {[post.posted_at ? relativeAge(post.posted_at) : null, post.format, duration].filter(Boolean).join(" · ")}
            </span>
            <span
              className="ml-auto inline-flex items-center gap-1.5"
              title={
                outlier.score === null
                  ? `A multiple compares this post with at least ${OUTLIER_MIN_POSTS} other posts of the creator`
                  : undefined
              }
            >
              {outlier.score === null ? (
                <span className="text-muted-foreground">{`Needs ${OUTLIER_MIN_POSTS + 1}+ posts for a multiple`}</span>
              ) : (
                <>
                  <OutlierBadge input={outlier} verbose />
                </>
              )}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 @[34rem]/info:grid-cols-5">
            {stat?.views != null ? <Stat label="Views" value={formatCompact(stat.views)} /> : null}
            {stat?.likes != null ? <Stat label="Likes" value={formatCompact(stat.likes)} /> : null}
            {stat?.comments != null ? <Stat label="Comments" value={formatCompact(stat.comments)} /> : null}
            {stat?.shares != null ? <Stat label="Shares" value={formatCompact(stat.shares)} /> : null}
            {stat?.saves != null ? <Stat label="Saves" value={formatCompact(stat.saves)} /> : null}
          </div>

          <Tabs aria-label="Post sections" value={tab} onValueChange={setTab} data={DETAIL_TABS} />

          {tab === "overview" ? (
            <div className="flex flex-col gap-2">
              {caption ? (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className={cn("text-left text-sm leading-snug text-foreground", !expanded && "line-clamp-5")}
                  aria-expanded={expanded}
                >
                  {caption}
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">No caption.</p>
              )}
              {hashtags.length ? (
                <div className="flex flex-wrap gap-1">
                  {hashtags.slice(0, expanded ? hashtags.length : 12).map((h) => (
                    <span key={h} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {`#${h}`}
                    </span>
                  ))}
                  {!expanded && hashtags.length > 12 ? (
                    <button type="button" onClick={() => setExpanded(true)} className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
                      {`+${hashtags.length - 12}`}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                {`${post.posted_at ? `Posted ${new Date(post.posted_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} · ` : ""}Updated ${relativeAge(post.last_refreshed_at)}`}
              </p>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page host
// ---------------------------------------------------------------------------

/** `/socials/post/[postId]`. */
export function PostDetailPage({ postId }: { postId: string }) {
  const brand = useMarketingBrand();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-1">
      <div>
        <Button variant="quiet" icon={<ArrowLeft />} onClick={() => router.back()}>
          Back
        </Button>
      </div>
      <PostDetailBody postId={postId} organizationId={brand.organizationId} brandSeg={brand.seg} host="page" />
    </div>
  );
}
