"use client";

/**
 * What a social tile LOOKS like on the Board: dense, image-first, responsive to the tile's own size.
 *
 * Pure views: every number and picture arrives as props from `social-items.tsx` (which owns reads,
 * actions and the agent surfaces). Thumbnails are the stored post's `thumbnailUrl`; a post with no
 * picture gets a designed card that quotes its hook line, never a platform logo as the main image.
 * Layout decisions (columns, rows, split or stacked) are `social-tile-model.ts`, unit-tested. Every
 * picture reserves its box before it loads, so nothing shifts.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BadgeCheck, ChevronDown, ChevronRight, ExternalLink, Play, TrendingUp } from "lucide-react";

import { Badge, Button } from "@ai-matrx/design-system/controls";

import { cn } from "@/lib/utils";
import { isLikelyWinner, runLabel } from "@/features/marketing/social/ads";
import { libraryLabel } from "@/features/marketing/social/components/AdCard";
import { OutlierBadge } from "@/features/marketing/social/components/OutlierBadge";
import { PlatformMark } from "@/features/marketing/social/components/PlatformMark";
import { thumbAspect } from "@/features/marketing/social/components/SocialPostCard";
import { formatDuration, formatGrowth, judgeFollowerGrowth, profileFollowerSeries, relativeAge } from "@/features/marketing/social/mappers";
import { formatCompact, outlierBadgeModel } from "@/features/marketing/social/outlier";
import type {
  AdCardModel,
  PostCardModel,
  ProfileSnapshotRow,
  SocialProfileRow,
  SwipeItem,
  TrackedRole,
} from "@/features/marketing/social/types";
import { TRACKED_ROLE_LABELS } from "@/features/marketing/social/types";

import {
  feedPlan,
  postLayout,
  profilePlan,
  rankPostsForTile,
  sparklinePath,
  swipeCols,
  type BoxSize,
} from "./social-tile-model";

// ─── Size ────────────────────────────────────────────────────────────────────

/** The element's own layout size (the board's zoom never shows up here). Measured before first paint. */
export function useBoxSize(fallback: BoxSize): [React.RefObject<HTMLDivElement | null>, BoxSize] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<BoxSize>(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

/** The multiple, only when there is a real one (a "needs more posts" badge repeated on every thumbnail is noise). */
function MultipleBadge({ post }: { post: PostCardModel }) {
  if (post.outlierScore === null) return null;
  return (
    <span className="inline-flex rounded-md bg-card/90">
      <OutlierBadge model={outlierBadgeModel(post.outlier)} />
    </span>
  );
}

/** A post with no picture: its hook line on a designed card. The platform mark is a corner detail only. */
function NoPicture({ post }: { post: PostCardModel }) {
  if (!post.hookLine) {
    return (
      <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted via-muted to-accent">
        <PlatformMark platform={post.platform} size={28} />
      </span>
    );
  }
  return (
    <span className="@container absolute inset-0 bg-gradient-to-br from-muted via-muted to-accent px-2 pb-7 pt-7">
      <span className="line-clamp-5 text-[11px] font-medium leading-snug text-foreground/80 @[180px]:line-clamp-8 @[180px]:text-base @[180px]:font-semibold">
        {post.hookLine}
      </span>
    </span>
  );
}

function Picture({ url, post }: { url: string | null; post: PostCardModel }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <NoPicture post={post} />;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

/** One post as a picture: multiple badge top-left, views bottom-left, length bottom-right. */
export function PostThumb({
  post,
  onOpen,
  ratio = "aspect-[3/4]",
  className,
}: {
  post: PostCardModel;
  onOpen?: (post: PostCardModel) => void;
  ratio?: string;
  className?: string;
}) {
  const duration = formatDuration(post.durationSeconds);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(post)}
      disabled={!onOpen}
      aria-label={`Open post ${post.hookLine || post.handle || ""}`.trim()}
      title={post.hookLine || undefined}
      className={cn("group relative block w-full min-w-0 overflow-hidden rounded-md border border-border bg-muted", ratio, className)}
    >
      <Picture url={post.thumbnailUrl} post={post} />
      <span className="absolute left-1 top-1">
        <MultipleBadge post={post} />
      </span>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-[11px] font-medium tabular-nums text-white">
        <span className="inline-flex items-center gap-0.5">
          <Play className="h-3 w-3 fill-current" />
          {formatCompact(post.views)}
        </span>
        {duration ? <span className="text-white/85">{duration}</span> : null}
      </span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse rounded-md bg-muted", className)} />;
}

const FRAME = "h-full min-h-0 overflow-y-auto bg-textured p-3";

// ─── Profile ─────────────────────────────────────────────────────────────────

function FollowerSparkline({ snapshots }: { snapshots: readonly ProfileSnapshotRow[] }) {
  const series = profileFollowerSeries(snapshots);
  const W = 320;
  const H = 56;
  const path = sparklinePath(series, W, H);
  if (!path || series.length < 2) return null;
  const first = series[0]!;
  const last = series[series.length - 1]!;
  const growth = judgeFollowerGrowth(snapshots);
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
        <span>Followers</span>
        <span className="tabular-nums text-foreground">
          {growth.fraction === null ? `${formatCompact(first.value)} to ${formatCompact(last.value)}` : `${formatGrowth(growth.fraction)} · ${growth.note}`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-14 w-full" preserveAspectRatio="none" role="img" aria-label="Follower count over time">
        <path d={path} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export interface ProfileTileViewProps {
  profile: SocialProfileRow;
  /** null while the posts read is in flight. */
  posts: PostCardModel[] | null;
  snapshots: readonly ProfileSnapshotRow[];
  /** undefined while reading; null = not tracked. */
  trackedRole: TrackedRole | null | undefined;
  canTrack: boolean;
  tracking: boolean;
  onTrack: () => void;
  onOpenAccount: (() => void) | null;
  onOpenPost: (post: PostCardModel) => void;
}

export function ProfileTileView(props: ProfileTileViewProps) {
  const { profile, posts, snapshots } = props;
  const [ref, size] = useBoxSize({ w: 620, h: 700 });
  const [avatarFailed, setAvatarFailed] = useState(false);
  const ranked = rankPostsForTile(posts ?? []);
  const plan = profilePlan(size, ranked.length, profileFollowerSeries(snapshots).length);
  const shown = ranked.slice(0, plan.cells);
  const name = profile.display_name?.trim() || `@${profile.handle}`;
  const compactHeader = size.h < 400;
  const trackedLabel = props.trackedRole ? `Tracking · ${TRACKED_ROLE_LABELS[props.trackedRole]}` : null;

  return (
    <div ref={ref} className={cn(FRAME, "flex flex-col gap-2.5")}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
          {profile.avatar_url && !avatarFailed ? (
            <img
              src={profile.avatar_url}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <PlatformMark platform={profile.platform} size={20} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1 text-sm font-semibold text-foreground">
            <span className="truncate">{name}</span>
            {profile.is_verified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
          </p>
          <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <PlatformMark platform={profile.platform} size={14} />
            <span className="truncate">
              @{profile.handle}
              {compactHeader && profile.follower_count !== null ? ` · ${formatCompact(profile.follower_count)} followers` : ""}
            </span>
          </p>
        </div>
        {trackedLabel ? (
          <Badge tone="success">{trackedLabel}</Badge>
        ) : props.canTrack && props.trackedRole === null ? (
          <Button variant="outline" onClick={props.onTrack} disabled={props.tracking}>
            {props.tracking ? "Tracking" : "Track"}
          </Button>
        ) : null}
      </div>

      {plan.stats ? (
        <div className="grid grid-cols-4 gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
          <Stat label="Followers" value={formatCompact(profile.follower_count)} />
          <Stat label="Following" value={formatCompact(profile.following_count)} />
          <Stat label="Posts" value={formatCompact(profile.post_count)} />
          <Stat label="Likes" value={formatCompact(profile.total_likes)} />
        </div>
      ) : null}
      {size.h >= 520 && profile.bio?.trim() ? (
        <p className="line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{profile.bio.trim()}</p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs font-medium text-foreground">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          Top posts
          {posts ? <span className="font-normal tabular-nums text-muted-foreground">· {ranked.length}</span> : null}
        </p>
        {props.onOpenAccount ? (
          <Button variant="quiet" icon={<ExternalLink />} onClick={props.onOpenAccount}>
            Open account
          </Button>
        ) : null}
      </div>

      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${plan.cols}, minmax(0, 1fr))` }}>
        {posts === null
          ? Array.from({ length: plan.cols * plan.rows }, (_, i) => <Skeleton key={i} className="aspect-[3/4]" />)
          : shown.map((p) => <PostThumb key={p.postId} post={p} onOpen={props.onOpenPost} />)}
      </div>
      {posts !== null && ranked.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          No posts stored for this account yet.
        </p>
      ) : null}

      {plan.spark ? <FollowerSparkline snapshots={snapshots} /> : null}
    </div>
  );
}

// ─── Post ────────────────────────────────────────────────────────────────────

export interface PostTileViewProps {
  post: PostCardModel;
  caption: string | null;
  hashtags: readonly string[];
  engagementRate: number | null;
  player: ReactNode;
  /** Player placement: the poster's shape decides its box. */
  platform: string;
  format: string;
  /** The transcript body, null when none; `transcriptNode` is the canonical transcript block. */
  transcriptNode: ReactNode | null;
  hasTranscript: boolean;
  actions: ReactNode;
}

export function PostTileView(props: PostTileViewProps) {
  const { post } = props;
  const [ref, size] = useBoxSize({ w: 620, h: 560 });
  const [showTranscript, setShowTranscript] = useState(false);
  const layout = postLayout(size);
  const rate = props.engagementRate;
  const vertical = thumbAspect(props.platform, props.format) === "aspect-[9/16]";

  // Stack: the poster is a fixed share of the tile height; split: it is a column as tall as the tile allows.
  const posterBox =
    layout === "split"
      ? { width: vertical ? Math.min(220, Math.max(140, (size.h - 24) * 0.5625)) : Math.min(300, size.w * 0.42), aspectRatio: vertical ? "9 / 16" : "16 / 9" }
      : { width: "100%", height: Math.round(Math.min(Math.max(size.h * 0.42, 150), 340)) };

  const content = (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <PlatformMark platform={post.platform} size={16} />
          <span className="truncate">
            {post.handle ? `@${post.handle}` : post.platform}
            {post.postedAt ? ` · ${relativeAge(post.postedAt)}` : ""}
          </span>
        </div>
        {post.outlierScore !== null ? <OutlierBadge model={outlierBadgeModel(post.outlier)} /> : null}
      </div>
      <p className="line-clamp-3 text-sm font-semibold leading-snug text-foreground">{post.hookLine || "No caption"}</p>
      {props.caption && props.caption !== post.hookLine ? <p className="line-clamp-3 text-xs text-muted-foreground">{props.caption}</p> : null}
      <div className="grid grid-cols-4 gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
        <Stat label="Views" value={formatCompact(post.views)} />
        <Stat label="Likes" value={formatCompact(post.likes)} />
        <Stat label="Comments" value={formatCompact(post.comments)} />
        <Stat label="Eng. rate" value={rate === null ? "—" : `${(rate * (rate <= 1 ? 100 : 1)).toFixed(1)}%`} />
      </div>
      {props.hashtags.length > 0 ? (
        <p className="line-clamp-1 text-[11px] text-muted-foreground">
          {props.hashtags.slice(0, 8).map((h) => `#${h.replace(/^#/, "")}`).join(" ")}
        </p>
      ) : null}
      {props.transcriptNode ? (
        <div>
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            aria-expanded={showTranscript}
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground"
          >
            {showTranscript ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Transcript{props.hasTranscript ? "" : " (none yet)"}
          </button>
          {showTranscript ? props.transcriptNode : null}
        </div>
      ) : null}
      {props.actions}
    </div>
  );

  return (
    <div ref={ref} className={cn(FRAME, layout === "split" ? "flex gap-3" : "flex flex-col gap-2.5")}>
      <div className={cn(layout === "split" ? "shrink-0 self-start" : "")} style={layout === "split" ? { width: posterBox.width } : undefined}>
        <div style={layout === "split" ? { aspectRatio: String(posterBox.aspectRatio) } : { height: posterBox.height }} className="relative w-full">
          {props.player}
        </div>
      </div>
      {content}
    </div>
  );
}

// ─── Outlier feed ────────────────────────────────────────────────────────────

function FeedCard({ post, onOpen }: { post: PostCardModel; onOpen: (p: PostCardModel) => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <PostThumb post={post} onOpen={onOpen} />
      <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground" title={post.hookLine}>
        {post.hookLine || "No caption"}
      </p>
      <p className="truncate text-[11px] text-muted-foreground">
        {post.handle ? `@${post.handle} · ` : ""}
        {relativeAge(post.postedAt)}
      </p>
    </div>
  );
}

function FeedRow({ post, onOpen }: { post: PostCardModel; onOpen: (p: PostCardModel) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card p-1.5">
      <div className="w-14 shrink-0">
        <PostThumb post={post} onOpen={onOpen} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-1.5">
          {post.outlierScore !== null ? <OutlierBadge model={outlierBadgeModel(post.outlier)} /> : null}
          <span className="truncate text-[11px] text-muted-foreground">
            {post.handle ? `@${post.handle} · ` : ""}
            {relativeAge(post.postedAt)}
          </span>
        </div>
        <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground" title={post.hookLine}>
          {post.hookLine || "No caption"}
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground">{formatCompact(post.views)} views</p>
      </div>
    </div>
  );
}

export function OutlierFeedView({
  posts,
  ranking,
  onOpenPost,
}: {
  posts: PostCardModel[];
  ranking: "multiple" | "views";
  onOpenPost: (p: PostCardModel) => void;
}) {
  const [ref, size] = useBoxSize({ w: 560, h: 640 });
  const plan = feedPlan(size);
  return (
    <div ref={ref} className={cn(FRAME, "flex flex-col gap-2")}>
      <p className="flex items-center gap-1 text-xs font-medium text-foreground">
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
        Top {posts.length} by {ranking}
        {ranking === "multiple" ? <span className="font-normal text-muted-foreground">· vs each account's median</span> : null}
      </p>
      {plan.layout === "list" ? (
        <div className="flex flex-col gap-1.5">
          {posts.map((p) => (
            <FeedRow key={p.postId} post={p} onOpen={onOpenPost} />
          ))}
        </div>
      ) : (
        <div className="grid gap-x-1.5 gap-y-2.5" style={{ gridTemplateColumns: `repeat(${plan.cols}, minmax(0, 1fr))` }}>
          {posts.map((p) => (
            <FeedCard key={p.postId} post={p} onOpen={onOpenPost} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Ad ──────────────────────────────────────────────────────────────────────

function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function AdTileView({ ad }: { ad: AdCardModel }) {
  const [ref, size] = useBoxSize({ w: 520, h: 420 });
  const [failed, setFailed] = useState(false);
  const split = size.w >= 480;
  const run = runLabel(ad);
  const winner = isLikelyWinner(ad);
  const portrait = ad.format === "video" || ad.format === "image" || ad.format === "carousel";
  const showImage = Boolean(ad.thumbnailUrl) && !failed;
  const copy = ad.body.trim();
  const picture = (
    <div
      className={cn("relative min-w-0 overflow-hidden rounded-lg border border-border bg-muted", split ? "w-[44%] shrink-0 self-start" : "w-full")}
      style={{ aspectRatio: split ? (portrait ? "4 / 5" : "16 / 10") : "16 / 9" }}
    >
      {showImage ? (
        <img
          src={ad.thumbnailUrl ?? undefined}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex flex-col justify-between bg-gradient-to-br from-muted via-muted to-accent px-3 pb-3 pt-9">
          <span className="line-clamp-6 text-sm font-medium leading-snug text-foreground/80">{ad.headline || ad.advertiser}</span>
          <span className="self-end text-[11px] text-muted-foreground">{libraryLabel(ad.library)}</span>
        </span>
      )}
      <span className="absolute left-1.5 top-1.5 flex gap-1">
        <Badge tone={ad.status === "active" ? "success" : "neutral"}>{ad.status === "active" ? "Active" : ad.status === "inactive" ? "Ended" : "Unknown"}</Badge>
        {winner ? <Badge tone="primary">Likely winner</Badge> : null}
      </span>
      {run ? (
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/65 px-1 text-[11px] tabular-nums text-white">{run}</span>
      ) : null}
    </div>
  );
  return (
    <div ref={ref} className={cn(FRAME, split ? "flex gap-3" : "flex flex-col gap-2.5")}>
      {picture}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate font-medium text-foreground">{ad.advertiser}</span>
          <span className="shrink-0">· {libraryLabel(ad.library)}</span>
        </p>
        {ad.headline ? <p className="line-clamp-3 text-sm font-semibold leading-snug text-foreground">{ad.headline}</p> : null}
        {copy ? <p className="line-clamp-5 whitespace-pre-line text-xs text-muted-foreground">{copy}</p> : null}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {ad.cta ? <Badge tone="neutral">{ad.cta}</Badge> : null}
          {ad.landingUrl ? (
            <a
              href={ad.landingUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-w-0 max-w-full items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{hostOf(ad.landingUrl)}</span>
            </a>
          ) : null}
          {ad.libraryUrl ? (
            <a
              href={ad.libraryUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              Open in library
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Swipe collection ────────────────────────────────────────────────────────

function SwipeThumb({ item, onOpenPost }: { item: SwipeItem; onOpenPost: (p: PostCardModel) => void }) {
  if (item.post) return <PostThumb post={item.post} onOpen={onOpenPost} />;
  const ad = item.ad;
  return (
    <a
      href={ad?.libraryUrl ?? ad?.landingUrl ?? undefined}
      target="_blank"
      rel="noreferrer noopener"
      title={ad?.headline || ad?.advertiser}
      className="relative block aspect-[3/4] min-w-0 overflow-hidden rounded-md border border-border bg-muted"
    >
      {ad?.thumbnailUrl ? (
        <img src={ad.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex flex-col justify-between bg-gradient-to-br from-muted via-muted to-accent p-2">
          <span className="line-clamp-5 text-[11px] font-medium leading-snug text-foreground/80">{ad?.headline || ad?.advertiser || "Ad"}</span>
        </span>
      )}
      <span className="absolute left-1 top-1 rounded bg-card/90 px-1 text-[11px] text-foreground">Ad</span>
    </a>
  );
}

export function SwipeTileView({
  name,
  description,
  items,
  loading,
  onOpenPost,
}: {
  name: string;
  description: string | null;
  /** null while the saved items are being read. */
  items: SwipeItem[] | null;
  loading: boolean;
  onOpenPost: (p: PostCardModel) => void;
}) {
  const [ref, size] = useBoxSize({ w: 480, h: 280 });
  const all = items ?? [];
  // Few saved items get bigger thumbnails rather than a row of small ones with empty space after them.
  const cols = Math.min(swipeCols(size), Math.max(all.length, 3));
  const rows = size.h >= 420 ? 3 : size.h >= 260 ? 2 : 1;
  const cells = cols * rows;
  const overflow = all.length > cells;
  const shown = overflow ? all.slice(0, cells - 1) : all;
  return (
    <div ref={ref} className={cn(FRAME, "flex flex-col gap-2")}>
      <div className="min-w-0">
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">{name}</span>
          {items ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{all.length} saved</span> : null}
        </p>
        {description?.trim() && size.h >= 220 ? <p className="line-clamp-2 text-xs text-muted-foreground">{description.trim()}</p> : null}
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {loading || items === null
          ? Array.from({ length: cols * Math.min(rows, 2) }, (_, i) => <Skeleton key={i} className="aspect-[3/4]" />)
          : shown.map((it) => <SwipeThumb key={it.key} item={it} onOpenPost={onOpenPost} />)}
        {items && overflow ? (
          <span className="flex aspect-[3/4] min-w-0 flex-col items-center justify-center rounded-md border border-dashed border-border bg-card text-xs text-muted-foreground">
            <span className="text-base font-semibold tabular-nums text-foreground">+{all.length - shown.length}</span>
            more
          </span>
        ) : null}
      </div>
      {items && all.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Nothing saved here yet.</p>
      ) : null}
    </div>
  );
}
