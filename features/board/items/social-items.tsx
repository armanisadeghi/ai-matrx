"use client";

/**
 * Social tiles on a Board (SI-07c): social post, social profile, outlier feed, ad, swipe collection.
 *
 * Each tile body is the ONE canonical component of its kind (`components/mardown-display/blocks/
 * social-kinds/`) fed the kind value built from the stored rows (`marketing/social/kind-models.ts`);
 * the tile adds only its actions. Each registers its own agent surface (`matrx-user/social-*`) with the
 * FULL values — caption, transcript, metrics, outlier score — so a chat tile joined by a line reads the
 * whole post (lines are context). Actions are the same operations the buttons run: get transcript,
 * breakdown (the server's honest 409 while the agent is unbuilt), save to swipe file, open detail.
 *
 * Pasting a social link (TikTok, Instagram, YouTube, LinkedIn, X, Facebook) places a tile with no id
 * yet and `meta.url`; the tile ingests it (metadata only, no media or transcript purchase) and then
 * keeps the stored post's id. A repeated mount shares one in-flight ingest per address.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bookmark, CircleAlert, FileText, Images, Link2, LockKeyhole, Megaphone, PanelRightOpen, RefreshCw, Sparkle, TrendingUp, UserRound, Users, Wand2 } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { ReadGate, readOf } from "@ai-matrx/design-system";
import { Checkbox } from "@/components/ui/checkbox";
import { accountTileSeeds } from "@/features/marketing/social/board-accounts";
import {
  useSurfaceClientTools,
  useSurfaceRuntimeRegistration,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/loaders/Spinner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { PostTranscriptBlock } from "@/components/mardown-display/blocks/social-kinds/social-kind-blocks";
import { useOpenSocialPost } from "@/features/overlays/openers/socialPostWindow";
import { useMarketingBrandOptional } from "@/features/marketing/lib/brand-context";
import {
  useInvalidateSocial,
  usePostDetail,
  usePostTranscript,
  useAccountRows,
  useProfile,
  useProfilePosts,
  useProfileSnapshots,
  useSwipeCollections,
  useSwipeItems,
  useTrackedForProfile,
} from "@/features/marketing/social/hooks";
import {
  adCreativeKind,
  outlierRowKindFromCard,
  postCardModelFromOutlierRow,
  postTranscriptKind,
  socialPostKind,
  socialProfileKind,
  swipeCollectionKind,
  type OutlierRowKind,
} from "@/features/marketing/social/kind-models";
import { toAdCardModel } from "@/features/marketing/social/ads";
import { PostMedia } from "@/features/marketing/social/components/PostMedia";
import { PlatformMark } from "@/features/marketing/social/components/PlatformMark";
import { SocialImage } from "@/features/marketing/social/components/SocialImage";
import { formatCompact } from "@/features/marketing/social/outlier";
import { postAddress, toPostCardModel } from "@/features/marketing/social/mappers";
import {
  addToCollection,
  analyzePost,
  createCollection,
  fetchPlaybackUrl,
  getTranscript,
  ingestPost,
  ingestProfile,
  listPostMedia,
  postThumbnailDoor,
  profileAvatarDoor,
  socialErrorCode,
  socialErrorMessage,
  trackAccount,
} from "@/features/marketing/social/server";
import { classifySocialLink, type SocialLink } from "@/features/marketing/social/link";
import { describeSocialFailure, type SocialFailure } from "@/features/marketing/social/failure";
import { GatedCaptureAction } from "./social-gated-seam";
import { usePostActions } from "@/features/marketing/social/components/usePostActions";
import {
  SOCIAL_PLATFORM_LABELS,
  TRACKABLE_PLATFORMS,
  isSocialPlatform,
  isTrackedRole,
  type PostCardModel,
} from "@/features/marketing/social/types";
import {
  OUTLIER_FEED_LIMIT,
  readAd,
  readBrandOutliers,
  readBrandTopPosts,
  readRecentAds,
  readSwipeCollection,
} from "@/features/marketing/social/tile-data";
import {
  SOCIAL_AD_SURFACE_NAME,
  SOCIAL_OUTLIER_FEED_SURFACE_NAME,
  SOCIAL_POST_CLIENT_TOOLS,
  SOCIAL_POST_SURFACE_NAME,
  SOCIAL_PROFILE_CLIENT_TOOLS,
  SOCIAL_PROFILE_SURFACE_NAME,
  SOCIAL_SWIPE_SURFACE_NAME,
  createSocialAdScope,
  createSocialOutlierFeedScope,
  createSocialPostScope,
  createSocialProfileScope,
  createSocialSwipeScope,
} from "@/features/surfaces/manifests/social-tiles.manifest";
import { toast } from "@/lib/toast";
import type { NodeSource } from "../board/document";
import { useBoardOrganizationId } from "./board-organization";
import { RecordList } from "./feature-items";
import {
  adScopeValues,
  outlierFeedScopeValues,
  postScopeValues,
  profileScopeValues,
  swipeScopeValues,
} from "./social-tile-values";
import {
  AdTileView,
  OutlierFeedView,
  PostTileView,
  ProfileTileView,
  SwipeTileView,
} from "./social-tile-views";
import type { BoardItemType, ItemBodyProps, PickerProps } from "./types";

export const SOCIAL_POST_KEY = "social-post";
export const SOCIAL_PROFILE_KEY = "social-profile";
export const SOCIAL_OUTLIER_FEED_KEY = "social-outlier-feed";
export const SOCIAL_AD_KEY = "social-ad";
export const SOCIAL_SWIPE_KEY = "social-swipe-collection";

type Meta = Record<string, string>;

function entity(key: string, id: string | null, meta?: Meta): NodeSource {
  return { kind: "entity", entity: key, id, ...(meta ? { meta } : {}) };
}
const metaOf = (source: NodeSource): Meta => (source.kind === "entity" ? (source.meta ?? {}) : {});
const idOf = (source: NodeSource, key: string): string | null =>
  source.kind === "entity" && source.entity === key ? source.id : null;

const FRAME = "h-full min-h-0 overflow-y-auto bg-textured p-3";

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">{children}</div>;
}

function Busy({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center" aria-busy="true" aria-label={label}>
      <Spinner size="sm" className="text-muted-foreground" />
    </div>
  );
}

function NeedsOrganization() {
  return <Centered>This board has no organization yet, so a social tile cannot read or spend for it.</Centered>;
}

// ─── Ingest on first open ────────────────────────────────────────────────────

const inflight = new Map<string, Promise<unknown>>();

/** One ingest per address and organization at a time, however many times a tile mounts. */
function shared<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const started = run();
  inflight.set(key, started);
  const clear = () => setTimeout(() => inflight.delete(key), 30_000);
  started.then(clear, () => inflight.delete(key));
  return started;
}

/** What a tile needs to offer the capture ways when its read fails. */
interface CaptureTarget {
  platform?: string;
  handleOrUrl: string;
  target: "profile" | "post";
}

function IngestState({
  what,
  progress,
  error,
  onRetry,
  capture,
  organizationId,
}: {
  what: string;
  progress: string | null;
  error: SocialFailure | null;
  onRetry: () => void;
  capture: CaptureTarget;
  organizationId: string;
}) {
  if (error) {
    const Icon = error.kind === "restricted" ? LockKeyhole : error.kind === "busy" ? RefreshCw : CircleAlert;
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 overflow-y-auto p-4 text-center" role="status">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="flex max-w-xs flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{error.title}</p>
          <p className="text-xs leading-snug text-muted-foreground">{error.reason}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {error.canRetry ? (
            <Button variant="outline" icon={<RefreshCw />} onClick={onRetry}>
              Try again
            </Button>
          ) : null}
          {error.canCapture ? (
            <GatedCaptureAction
              organizationId={organizationId}
              target={{ platform: capture.platform, handleOrUrl: capture.handleOrUrl, target: capture.target }}
            />
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <Centered>
      <Spinner size="sm" className="text-muted-foreground" />
      <p>{progress ?? `Reading ${what}`}</p>
    </Centered>
  );
}

function IngestPostTile({ url, platform, organizationId, onDone }: { url: string; platform?: string; organizationId: string; onDone: (postId: string) => void }) {
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<SocialFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    let live = true;
    shared(`post:${organizationId}:${url}:${attempt}`, () =>
      ingestPost({ url, landMedia: false, transcript: false }, { organizationId, onProgress: (p) => live && setProgress(p.message) }),
    ).then(
      (r) => live && done.current(r.post_id),
      (e: unknown) => live && setError(describeSocialFailure(e, "Could not read that post.")),
    );
    return () => {
      live = false;
    };
  }, [url, organizationId, attempt]);
  return (
    <IngestState
      what="the post"
      progress={progress}
      error={error}
      organizationId={organizationId}
      capture={{ platform, handleOrUrl: url, target: "post" }}
      onRetry={() => {
        setError(null);
        setAttempt((n) => n + 1);
      }}
    />
  );
}

function IngestProfileTile({
  handleOrUrl,
  platform,
  organizationId,
  onDone,
}: {
  handleOrUrl: string;
  platform: string | undefined;
  organizationId: string;
  onDone: (profileId: string, handle: string) => void;
}) {
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<SocialFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    let live = true;
    shared(`profile:${organizationId}:${handleOrUrl}:${attempt}`, () =>
      ingestProfile(
        { handleOrUrl, platform: platform && isSocialPlatform(platform) ? platform : undefined, pages: 1 },
        { organizationId, onProgress: (p) => live && setProgress(p.message) },
      ),
    ).then(
      (r) => live && done.current(r.profile_id, r.handle),
      (e: unknown) => live && setError(describeSocialFailure(e, "Could not read that account.")),
    );
    return () => {
      live = false;
    };
  }, [handleOrUrl, platform, organizationId, attempt]);
  return (
    <IngestState
      what="the account"
      progress={progress}
      error={error}
      organizationId={organizationId}
      capture={{ platform, handleOrUrl, target: "profile" }}
      onRetry={() => {
        setError(null);
        setAttempt((n) => n + 1);
      }}
    />
  );
}

// ─── Social post ─────────────────────────────────────────────────────────────

function PostActionBar({ actions, hasTranscript }: { actions: ReturnType<typeof usePostActions>; hasTranscript: boolean }) {
  const run = (fn: () => Promise<string>) => () =>
    void fn().then(
      (message) => toast.success(message),
      (e: unknown) => toast.error(e instanceof Error ? e.message : "That did not work."),
    );
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {hasTranscript ? null : (
        <Button variant="outline" icon={<FileText />} disabled={actions.busy !== null} onClick={run(actions.transcript)}>
          Get transcript
        </Button>
      )}
      <Button variant="outline" icon={<Wand2 />} disabled={actions.busy !== null} onClick={run(actions.breakdown)}>
        Breakdown
      </Button>
      <Button variant="outline" icon={<Bookmark />} disabled={actions.busy !== null} onClick={run(actions.saveToSwipe)}>
        Save to swipe file
      </Button>
      <Button variant="quiet" icon={<PanelRightOpen />} onClick={actions.openDetail}>
        Open detail
      </Button>
      {actions.breakdownNote ? <span className="text-xs text-muted-foreground">{actions.breakdownNote}</span> : null}
    </div>
  );
}

function PostSurface({
  values,
  actions,
}: {
  values: ReturnType<typeof createSocialPostScope>;
  actions: ReturnType<typeof usePostActions>;
}) {
  useSurfaceRuntimeRegistration({ surfaceName: SOCIAL_POST_SURFACE_NAME, getScope: () => values, isEditable: false });
  useSurfaceClientTools(SOCIAL_POST_SURFACE_NAME, {
    [SOCIAL_POST_CLIENT_TOOLS.getTranscript]: () => actions.transcript(),
    [SOCIAL_POST_CLIENT_TOOLS.breakdown]: () => actions.breakdown(),
    [SOCIAL_POST_CLIENT_TOOLS.saveToSwipe]: () => actions.saveToSwipe(),
    [SOCIAL_POST_CLIENT_TOOLS.openDetail]: () => {
      actions.openDetail();
      return "Opened the post detail.";
    },
  });
  return null;
}

/** Opens the floating post panel (the Socials section's own post body) for a post a tile names, then reports itself done. */
function OpenPostPanel({ postId, organizationId, onClose }: { postId: string | null; organizationId: string; onClose: () => void }) {
  const brand = useMarketingBrandOptional();
  const openPanel = useOpenSocialPost();
  useEffect(() => {
    if (!postId) return;
    openPanel({ postId, organizationId, brandSeg: brand?.seg ?? "" });
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);
  return null;
}

function PostRecordBody({ id, source, title, onSource, organizationId }: ItemBodyProps & { id: string; organizationId: string }) {
  const detail = usePostDetail(id);
  const transcript = usePostTranscript(id);
  const brand = useMarketingBrandOptional();
  const openPanel = useOpenSocialPost();
  const post = detail.data?.post ?? null;
  const stat = detail.data?.stat ?? null;
  const handle = detail.data?.profile?.handle ?? null;
  const kind = post
    ? socialPostKind({
        post,
        stat,
        handle,
        transcript: postTranscriptKind(id, transcript.data ?? null),
      })
    : null;
  const hasTranscript = Boolean(transcript.data?.text);
  const actions = usePostActions({ postId: id, organizationId, hasTranscript, openDetail: () => openPanel({ postId: id, organizationId, brandSeg: brand?.seg ?? "" }) });
  const wanted = post ? (handle ? `@${handle}` : `${SOCIAL_PLATFORM_LABELS[isSocialPlatform(post.platform) ? post.platform : "tiktok"]} post`) : null;
  // The tile's address and name come from the stored post and its real author, never from the pasted
  // link (its handle can be wrong while the post id is right): a stale pasted address is corrected here.
  const address = post ? postAddress(post, handle) : null;
  const pastedAddress = metaOf(source).url ?? null;
  useEffect(() => {
    if (!post || !wanted) return;
    const nextSource = address && address !== pastedAddress ? entity(SOCIAL_POST_KEY, id, { url: address, platform: post.platform }) : source;
    if (wanted !== title || nextSource !== source) onSource(nextSource, wanted !== title ? wanted : undefined);
  }, [post, wanted, title, source, onSource, address, pastedAddress, id]);

  const values = createSocialPostScope(
    kind
      ? postScopeValues(kind)
      : detail.isError
        ? { post_loaded: false, load_error: detail.error instanceof Error ? detail.error.message : "Could not read the post." }
        : ({ post_loaded: false, not_loaded_yet: true } as never),
  );

  if (detail.isLoading) return <Busy label="Opening the post" />;
  if (!kind || !post) {
    return (
      <Centered>
        <p className="text-foreground">{detail.isError ? "Could not read this post." : "This post is not stored yet."}</p>
        <Button variant="outline" onClick={() => void detail.refetch()}>
          Try again
        </Button>
      </Centered>
    );
  }
  const card = { ...toPostCardModel({ post, stat, handle }), platformPostId: post.platform_post_id };
  return (
    <>
      <PostSurface values={values} actions={actions} />
      <PostTileView
        post={card}
        caption={post.caption?.trim() || post.title?.trim() || null}
        hashtags={post.hashtags ?? []}
        engagementRate={stat?.engagement_rate ?? null}
        platform={post.platform}
        format={post.format}
        player={
          <PostMedia
            fill
            postId={card.postId}
            organizationId={organizationId}
            thumbnailUrl={card.thumbnailUrl}
            thumbnailFileId={card.thumbnailFileId}
            postUrl={card.url}
            platform={card.platform}
            platformPostId={card.platformPostId}
            format={card.format}
            durationSeconds={card.durationSeconds}
          />
        }
        hasTranscript={hasTranscript}
        transcriptNode={kind.transcript ? <PostTranscriptBlock serverData={kind.transcript} className="my-1" /> : null}
        actions={<PostActionBar actions={actions} hasTranscript={hasTranscript} />}
      />
    </>
  );
}

function SocialPostBody(props: ItemBodyProps) {
  const organizationId = useBoardOrganizationId();
  const id = idOf(props.source, SOCIAL_POST_KEY);
  const meta = metaOf(props.source);
  if (!organizationId) return <NeedsOrganization />;
  if (id) return <PostRecordBody key={id} id={id} organizationId={organizationId} {...props} />;
  if (meta.url) {
    return (
      <IngestPostTile
        url={meta.url}
        platform={meta.platform}
        organizationId={organizationId}
        onDone={(postId) => props.onSource(entity(SOCIAL_POST_KEY, postId, meta), props.title)}
      />
    );
  }
  return (
    <LinkForm
      kind="post"
      onLink={(l) => props.onSource(entity(SOCIAL_POST_KEY, null, { url: l.url, platform: l.platform }), props.title)}
    />
  );
}

function PostLinkPicker({ onPick, onCancel }: PickerProps) {
  return <LinkForm kind="post" onLink={(l) => onPick([linkItem("post", l)])} onCancel={onCancel} />;
}
function ProfileLinkPicker({ onPick, onCancel }: PickerProps) {
  return <LinkForm kind="profile" onLink={(l) => onPick([linkItem("profile", l)])} onCancel={onCancel} />;
}

function linkItem(kind: "post" | "profile", link: SocialLink) {
  return {
    title: kind === "profile" && link.handle ? `@${link.handle}` : "Social post",
    source: entity(kind === "post" ? SOCIAL_POST_KEY : SOCIAL_PROFILE_KEY, null, { url: link.url, platform: link.platform }),
  };
}

/**
 * The link box a picker and an empty tile (a template's) share. In a tile it is compact: one clear label and
 * one row (the field and its button), vertically centred in a tile sized to it; in the Add menu's picker it
 * stacks with Cancel.
 */
function LinkForm({ kind, onLink, onCancel }: { kind: "post" | "profile"; onLink: (link: SocialLink) => void; onCancel?: () => void }) {
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const inTile = !onCancel;
  return (
    <form
      className={cn("flex flex-col gap-2 p-3", inTile && "h-full justify-center")}
      onSubmit={(e) => {
        e.preventDefault();
        const link = classifySocialLink(value);
        if (!link || link.kind !== kind) return setBad(true);
        onLink(link);
      }}
    >
      <label className="text-sm font-medium text-foreground" htmlFor={`social-link-${kind}`}>
        {inTile ? `Paste ${kind === "post" ? "a post" : "an account"} link` : kind === "post" ? "Post link" : "Account link"}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`social-link-${kind}`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setBad(false);
          }}
          placeholder={kind === "post" ? "tiktok.com/@name/video/..." : "tiktok.com/@name"}
          aria-invalid={bad}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-base text-foreground"
        />
        {inTile ? (
          <Button type="submit" variant="primary" disabled={!value.trim()}>
            Read it
          </Button>
        ) : null}
      </div>
      {bad ? <p className="text-xs text-destructive">That is not {kind === "post" ? "a post" : "an account"} link.</p> : null}
      {inTile ? null : (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!value.trim()}>
            Add to board
          </Button>
        </div>
      )}
    </form>
  );
}

// ─── From this brand's accounts ──────────────────────────────────────────────

/**
 * "From this brand's accounts": the brand's own accounts and everything it tracks, as profile tiles. Own accounts
 * that are already stored start checked; an account not read yet starts unchecked and is marked, because opening its tile reads it (it uses part of the plan). Outside a brand there is no
 * list to offer, so the picker says so and takes a pasted link instead (never a dead end).
 */
function BrandAccountsPicker({ onPick, onCancel }: PickerProps) {
  const organizationId = useBoardOrganizationId() ?? "";
  const brand = useMarketingBrandOptional();
  const accounts = useAccountRows(organizationId, brand?.id ?? "");
  const seeds = useMemo(() => accountTileSeeds(accounts.data ?? []), [accounts.data]);
  const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null);
  const checked = chosen ?? new Set(seeds.filter((s) => s.own && s.profileId !== null).map((s) => s.rowId));
  if (!brand) {
    return (
      <div className="flex flex-col gap-2">
        <p className="px-3 pt-3 text-sm text-muted-foreground">Accounts belong to a brand. Open a brand's Studio to pick from them, or paste a link here.</p>
        <LinkForm kind="profile" onLink={(l) => onPick([linkItem("profile", l)])} onCancel={onCancel} />
      </div>
    );
  }
  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  };
  const pickedSeeds = seeds.filter((s) => checked.has(s.rowId));
  const readState = readOf(
    { loading: accounts.isLoading, error: accounts.error instanceof Error ? accounts.error.message : null },
    { what: "this brand's accounts", onRetry: () => void accounts.refetch() },
  );
  return (
    <div className="flex flex-col gap-3">
      <ReadGate
        read={readState}
        isEmpty={seeds.length === 0}
        empty={<div className="px-3 py-6 text-center text-sm text-muted-foreground">No accounts yet. Track one on the Socials page, or paste a link.</div>}
        loading={<div className="px-3 py-6 text-center text-sm text-muted-foreground" aria-busy="true">Reading accounts…</div>}
      >
        <ul className="max-h-[min(420px,60dvh)] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {seeds.map((s) => (
            <li key={s.rowId}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                <Checkbox checked={checked.has(s.rowId)} onCheckedChange={() => toggle(s.rowId)} aria-label={s.title} />
                <span className="min-w-0 flex-1 truncate text-foreground">{s.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {SOCIAL_PLATFORM_LABELS[isSocialPlatform(s.platform) ? s.platform : "tiktok"]}
                  {s.own ? " · Own" : ""}
                  {s.profileId ? "" : " · Not read yet"}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </ReadGate>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={pickedSeeds.length === 0}
          onClick={() =>
            onPick(
              pickedSeeds.map((s) => ({
                title: s.title,
                source: entity(SOCIAL_PROFILE_KEY, s.profileId, s.profileId ? { platform: s.platform } : { url: s.handleOrUrl, platform: s.platform }),
              })),
            )
          }
        >
          {pickedSeeds.length > 1 ? `Add ${pickedSeeds.length} to board` : "Add to board"}
        </Button>
      </div>
    </div>
  );
}

// ─── Social profile ──────────────────────────────────────────────────────────

const TOP_OUTLIERS_SHOWN = 8;

function ProfileSurface({
  values,
  openAccount,
}: {
  values: ReturnType<typeof createSocialProfileScope>;
  openAccount: () => string;
}) {
  useSurfaceRuntimeRegistration({ surfaceName: SOCIAL_PROFILE_SURFACE_NAME, getScope: () => values, isEditable: false });
  useSurfaceClientTools(SOCIAL_PROFILE_SURFACE_NAME, { [SOCIAL_PROFILE_CLIENT_TOOLS.openAccount]: () => openAccount() });
  return null;
}

function ProfileRecordBody({
  id,
  source,
  title,
  onSource,
  organizationId,
}: ItemBodyProps & { id: string; organizationId: string }) {
  const brand = useMarketingBrandOptional();
  const profile = useProfile(id);
  const posts = useProfilePosts(id, profile.data?.handle ?? null);
  const snapshots = useProfileSnapshots(id);
  const tracked = useTrackedForProfile(organizationId, id);
  const invalidate = useInvalidateSocial();
  const [tracking, setTracking] = useState(false);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const row = profile.data ?? null;
  const outliers: OutlierRowKind[] = (posts.data ?? [])
    .filter((c) => c.outlierScore !== null)
    .sort((a, b) => (b.outlierScore ?? 0) - (a.outlierScore ?? 0))
    .slice(0, TOP_OUTLIERS_SHOWN)
    .flatMap((c) => {
      const r = outlierRowKindFromCard(c);
      return r ? [r] : [];
    });
  const wanted = row ? `@${row.handle}` : null;
  useEffect(() => {
    if (wanted && wanted !== title) onSource(source, wanted);
  }, [wanted, title, source, onSource]);

  const accountHref = row
    ? brand
      ? `/marketing/${brand.seg}/socials/${row.platform}/${row.id}`
      : (row.profile_url ?? null)
    : null;
  const openAccount = () => {
    if (!accountHref) return "This account has no page to open.";
    window.open(accountHref, "_blank", "noopener,noreferrer");
    return "Opened the account page.";
  };
  async function track() {
    if (!row) return;
    const ok = await confirm({
      title: `Track @${row.handle}?`,
      description: "Fetches the account and keeps its posts fresh. Uses part of your plan.",
      confirmLabel: "Track",
    });
    if (!ok) return;
    setTracking(true);
    try {
      await trackAccount(
        { profileId: row.id, role: "competitor", brandId: brand?.id, pages: 1 },
        { organizationId },
      );
      await invalidate();
      toast.success(`Now tracking @${row.handle}.`);
    } catch (e) {
      toast.error(socialErrorMessage(e, "Could not track that account."));
    } finally {
      setTracking(false);
    }
  }
  const values = createSocialProfileScope(
    row
      ? profileScopeValues(socialProfileKind(row), outliers)
      : profile.isError
        ? { profile_loaded: false, load_error: profile.error instanceof Error ? profile.error.message : "Could not read the account." }
        : ({ profile_loaded: false, not_loaded_yet: true } as never),
  );
  if (profile.isLoading) return <Busy label="Opening the account" />;
  if (!row) {
    return (
      <Centered>
        <p className="text-foreground">Could not read this account.</p>
        <Button variant="outline" onClick={() => void profile.refetch()}>
          Try again
        </Button>
      </Centered>
    );
  }
  return (
    <>
      <ProfileSurface values={values} openAccount={openAccount} />
      <ProfileTileView
        profile={row}
        posts={posts.data ?? null}
        snapshots={snapshots.data ?? []}
        trackedRole={tracked.isLoading ? undefined : tracked.data ? (isTrackedRole(tracked.data.role) ? tracked.data.role : null) : null}
        canTrack={TRACKABLE_PLATFORMS.has(row.platform)}
        tracking={tracking}
        onTrack={() => void track()}
        onOpenAccount={accountHref ? () => void openAccount() : null}
        onOpenPost={(p) => setOpenPostId(p.postId)}
      />
      <OpenPostPanel postId={openPostId} organizationId={organizationId} onClose={() => setOpenPostId(null)} />
    </>
  );
}

function SocialProfileBody(props: ItemBodyProps) {
  const organizationId = useBoardOrganizationId();
  const id = idOf(props.source, SOCIAL_PROFILE_KEY);
  const meta = metaOf(props.source);
  if (!organizationId) return <NeedsOrganization />;
  if (id) return <ProfileRecordBody key={id} id={id} organizationId={organizationId} {...props} />;
  const handleOrUrl = meta.url ?? meta.handle;
  if (handleOrUrl) {
    return (
      <IngestProfileTile
        handleOrUrl={handleOrUrl}
        platform={meta.platform}
        organizationId={organizationId}
        onDone={(profileId, handle) => props.onSource(entity(SOCIAL_PROFILE_KEY, profileId, meta), `@${handle}`)}
      />
    );
  }
  return (
    <LinkForm
      kind="profile"
      onLink={(l) =>
        props.onSource(entity(SOCIAL_PROFILE_KEY, null, { url: l.url, platform: l.platform }), l.handle ? `@${l.handle}` : props.title)
      }
    />
  );
}

// ─── Outlier feed ────────────────────────────────────────────────────────────

function FeedSurface({ values }: { values: ReturnType<typeof createSocialOutlierFeedScope> }) {
  useSurfaceRuntimeRegistration({ surfaceName: SOCIAL_OUTLIER_FEED_SURFACE_NAME, getScope: () => values, isEditable: false });
  return null;
}

function OutlierFeedBody({ source }: ItemBodyProps) {
  const organizationId = useBoardOrganizationId();
  const brand = useMarketingBrandOptional();
  const brandId = metaOf(source).brandId ?? brand?.id ?? null;
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const feed = useQuery({
    queryKey: ["board", "social-outlier-feed", organizationId, brandId],
    queryFn: () => readBrandOutliers({ organizationId: organizationId!, brandId: brandId! }),
    enabled: Boolean(organizationId && brandId),
    refetchInterval: 60_000,
  });
  const rows = feed.data ?? [];
  // No account has a multiple yet (it needs 10+ posts): show the stored posts by views instead of nothing.
  const top = useQuery({
    queryKey: ["board", "social-top-posts", organizationId, brandId],
    queryFn: () => readBrandTopPosts({ organizationId: organizationId!, brandId: brandId! }),
    enabled: Boolean(organizationId && brandId && feed.data && feed.data.length === 0),
  });
  const values = createSocialOutlierFeedScope(
    feed.data
      ? outlierFeedScopeValues(rows)
      : feed.isError
        ? { feed_loaded: false, load_error: feed.error instanceof Error ? feed.error.message : "Could not read the feed." }
        : ({ feed_loaded: false, not_loaded_yet: true } as never),
  );
  if (!organizationId) return <NeedsOrganization />;
  if (!brandId) return <Centered>An outlier feed follows a brand's tracked accounts. Open this board from a brand's Studio.</Centered>;
  if (feed.isLoading) return <Busy label="Reading the feed" />;
  if (feed.isError) {
    return (
      <Centered>
        <p className="text-foreground">Could not read the feed.</p>
        <Button variant="outline" onClick={() => void feed.refetch()}>
          Try again
        </Button>
      </Centered>
    );
  }
  return (
    <>
      <FeedSurface values={values} />
      {rows.length > 0 ? (
        <OutlierFeedView ranking="multiple" posts={rows.map((r) => postCardModelFromOutlierRow(r))} onOpenPost={(p) => setOpenPostId(p.postId)} />
      ) : top.isLoading ? (
        <Busy label="Reading posts" />
      ) : top.data && top.data.length > 0 ? (
        <OutlierFeedView ranking="views" posts={top.data} onOpenPost={(p) => setOpenPostId(p.postId)} />
      ) : (
        <Centered>
          <p className="text-foreground">No posts yet.</p>
          <p>Track accounts to fill the feed.</p>
        </Centered>
      )}
      <OpenPostPanel postId={openPostId} organizationId={organizationId} onClose={() => setOpenPostId(null)} />
    </>
  );
}

// ─── Ad ──────────────────────────────────────────────────────────────────────

function AdSurface({ values }: { values: ReturnType<typeof createSocialAdScope> }) {
  useSurfaceRuntimeRegistration({ surfaceName: SOCIAL_AD_SURFACE_NAME, getScope: () => values, isEditable: false });
  return null;
}

function AdRecordBody({ id }: ItemBodyProps & { id: string }) {
  const ad = useQuery({ queryKey: ["board", "social-ad", id], queryFn: () => readAd(id) });
  const kind = ad.data ? adCreativeKind(ad.data) : null;
  const values = createSocialAdScope(
    kind
      ? adScopeValues(kind)
      : ad.isError
        ? { ad_loaded: false, load_error: ad.error instanceof Error ? ad.error.message : "Could not read the ad." }
        : ({ ad_loaded: false, not_loaded_yet: true } as never),
  );
  if (ad.isLoading) return <Busy label="Opening the ad" />;
  if (!kind) return <Centered>{ad.isError ? "Could not read this ad." : "This ad is no longer stored."}</Centered>;
  return (
    <>
      <AdSurface values={values} />
      {ad.data ? <AdTileView ad={toAdCardModel(ad.data)} /> : null}
    </>
  );
}

function SocialAdBody(props: ItemBodyProps) {
  const id = idOf(props.source, SOCIAL_AD_KEY);
  return id ? <AdRecordBody key={id} id={id} {...props} /> : <Centered>Bring in an ad from the library.</Centered>;
}

function AdPicker({ onPick, onCancel }: PickerProps) {
  const ads = useQuery({ queryKey: ["board", "social-ad-picker"], queryFn: readRecentAds });
  return (
    <div className="max-h-[min(560px,70dvh)] overflow-y-auto">
      <RecordList
        rows={ads.data ?? []}
        read={readOf({ loading: ads.isLoading, error: ads.error instanceof Error ? ads.error.message : null }, { what: "stored ads", onRetry: () => void ads.refetch() })}
        rowKey={(a) => a.id}
        rowText={(a) => `${a.advertiser_name} ${a.headline ?? ""}`}
        onChoose={(a) => onPick([{ title: a.advertiser_name, source: entity(SOCIAL_AD_KEY, a.id) }])}
        onCancel={onCancel}
        emptyState={<>No ads stored yet. Search the libraries on the Ads tab.</>}
        renderRow={(a) => (
          <>
            <span className="min-w-0 flex-1 truncate">{a.headline ?? a.advertiser_name}</span>
            <span className="shrink-0 truncate type-secondary text-muted-foreground">{a.advertiser_name}</span>
          </>
        )}
      />
    </div>
  );
}

// ─── Swipe collection ────────────────────────────────────────────────────────

function SwipeSurface({ values }: { values: ReturnType<typeof createSocialSwipeScope> }) {
  useSurfaceRuntimeRegistration({ surfaceName: SOCIAL_SWIPE_SURFACE_NAME, getScope: () => values, isEditable: false });
  return null;
}

function SwipeRecordBody({ id }: ItemBodyProps & { id: string }) {
  const organizationId = useBoardOrganizationId();
  const collection = useQuery({ queryKey: ["board", "social-swipe", id], queryFn: () => readSwipeCollection(id) });
  const items = useSwipeItems([id], true);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const kind = collection.data ? swipeCollectionKind(collection.data) : null;
  const values = createSocialSwipeScope(
    kind
      ? swipeScopeValues(kind)
      : collection.isError
        ? { collection_loaded: false, load_error: collection.error instanceof Error ? collection.error.message : "Could not read the collection." }
        : ({ collection_loaded: false, not_loaded_yet: true } as never),
  );
  if (collection.isLoading) return <Busy label="Opening the collection" />;
  if (!kind) return <Centered>{collection.isError ? "Could not read this collection." : "This collection no longer exists."}</Centered>;
  return (
    <>
      <SwipeSurface values={values} />
      <SwipeTileView
        name={kind.name ?? "Collection"}
        description={kind.description ?? null}
        items={items.data?.items ?? null}
        loading={items.isLoading}
        onOpenPost={(p) => setOpenPostId(p.postId)}
      />
      {organizationId ? <OpenPostPanel postId={openPostId} organizationId={organizationId} onClose={() => setOpenPostId(null)} /> : null}
    </>
  );
}

function SwipeBody(props: ItemBodyProps) {
  const id = idOf(props.source, SOCIAL_SWIPE_KEY);
  return id ? <SwipeRecordBody key={id} id={id} {...props} /> : <Centered>Bring in a swipe collection.</Centered>;
}

function SwipePicker({ onPick, onCancel }: PickerProps) {
  const organizationId = useBoardOrganizationId() ?? "";
  const collections = useSwipeCollections(organizationId);
  return (
    <div className="max-h-[min(560px,70dvh)] overflow-y-auto">
      <RecordList
        rows={collections.data ?? []}
        read={readOf(
          { loading: collections.isLoading, error: collections.error instanceof Error ? collections.error.message : null },
          { what: "your swipe collections", onRetry: () => void collections.refetch() },
        )}
        rowKey={(c) => c.id}
        rowText={(c) => c.name}
        onChoose={(c) => onPick([{ title: c.name, source: entity(SOCIAL_SWIPE_KEY, c.id) }])}
        onCancel={onCancel}
        emptyState={<>No collections yet. Save a post to make one.</>}
        renderRow={(c) => <span className="min-w-0 flex-1 truncate">{c.name}</span>}
      />
    </div>
  );
}

// ─── The catalog entries ─────────────────────────────────────────────────────

const none = (why: string) => ({ none: why });
const ENTITY = (key: string) => (s: NodeSource) => s.kind === "entity" && s.entity === key;

// ─── Far-zoom faces ──────────────────────────────────────────────────────────

/** A post's card at far zoom: its picture (or its hook line on a designed card) and its numbers. Same cache the body reads. */
function PostFace({ source }: { source: NodeSource }) {
  const detail = usePostDetail(idOf(source, SOCIAL_POST_KEY));
  const post = detail.data?.post;
  if (!post) {
    // A link that has not become a stored post (still reading, or the platform would not give it up): the face shows the link, never a blank grey card.
    const meta = metaOf(source);
    if (!meta.url) return null;
    const platform = meta.platform && isSocialPlatform(meta.platform) ? meta.platform : null;
    const shown = meta.url.replace(/^https?:\/\/(www\.)?/, "");
    return (
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-[5%] bg-gradient-to-br from-muted via-muted to-accent p-[6%] text-center">
        {platform ? <PlatformMark platform={platform} size={28} /> : null}
        <span className="line-clamp-3 break-all text-[min(12px,7cqmin)] font-medium leading-tight text-foreground/70">{shown}</span>
      </span>
    );
  }
  const card = toPostCardModel({ post, stat: detail.data?.stat ?? null, handle: detail.data?.profile?.handle ?? null });
  return (
    <>
      <SocialImage
        door={card.thumbnailFileId ? postThumbnailDoor(card.postId) : null}
        url={card.thumbnailUrl}
        fallback={
          <span className="absolute inset-0 flex items-start bg-gradient-to-br from-muted via-muted to-accent p-[4%] text-[min(14px,9cqmin)] font-semibold leading-tight text-foreground/80">
            <span className="line-clamp-6">{card.hookLine || "No caption"}</span>
          </span>
        }
      />
      {card.hookLine ? (
        <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/75 to-transparent px-[4%] pb-[3%] pt-[8%] text-[min(12px,7cqmin)] font-medium leading-tight text-white">
          {card.hookLine}
        </span>
      ) : null}
    </>
  );
}

/** An account's card at far zoom: its avatar large, with its follower count. */
function ProfileFace({ source }: { source: NodeSource }) {
  const id = idOf(source, SOCIAL_PROFILE_KEY);
  const row = useProfile(id ?? "").data;
  if (!row) return null;
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-[4%]">
      <span className="relative aspect-square h-[62%] max-h-full overflow-hidden rounded-full bg-muted">
        <SocialImage
          door={row.avatar_file_id ? profileAvatarDoor(row.id) : null}
          url={row.avatar_url}
          fallback={<span className="absolute inset-0 flex items-center justify-center"><PlatformMark platform={isSocialPlatform(row.platform) ? row.platform : "tiktok"} size={28} /></span>}
        />
      </span>
      {row.follower_count !== null ? (
        <span className="text-[min(14px,9cqmin)] font-semibold tabular-nums text-foreground">{formatCompact(row.follower_count)} followers</span>
      ) : null}
    </span>
  );
}

export const SOCIAL_ITEMS: readonly BoardItemType[] = [
  {
    key: SOCIAL_POST_KEY,
    // The surface is registered by the body itself (it holds the stored post), like the other record tiles.
    surface: { name: SOCIAL_POST_SURFACE_NAME },
    comments: null,
    label: "Social post",
    kindLabel: "social post",
    icon: Sparkle,
    group: "media",
    section: "social",
    accent: "rose",
    status: none("A stored post has no running state; its numbers refresh from the Socials section."),
    defaultSize: { w: 620, h: 560 },
    growOnFill: true,
    matches: ENTITY(SOCIAL_POST_KEY),
    Body: SocialPostBody,
    Face: PostFace,
    bringIn: { label: "Social post from a link", Picker: PostLinkPicker },
    record: { place: (id, title) => ({ title: title?.trim() || "Social post", source: entity(SOCIAL_POST_KEY, id) }) },
    href: (s) => metaOf(s).url ?? null,
  },
  {
    key: SOCIAL_PROFILE_KEY,
    surface: { name: SOCIAL_PROFILE_SURFACE_NAME },
    comments: null,
    label: "Social profile",
    kindLabel: "social profile",
    icon: UserRound,
    group: "media",
    section: "social",
    accent: "rose",
    status: none("A stored account has no running state."),
    defaultSize: { w: 620, h: 700 },
    growOnFill: true,
    matches: ENTITY(SOCIAL_PROFILE_KEY),
    Body: SocialProfileBody,
    Face: ProfileFace,
    // The brand's accounts first (what a person has already tracked), a pasted link second.
    startNew: [
      { label: "From this brand's accounts", icon: Users, Picker: BrandAccountsPicker },
      { label: "Social profile from a link", icon: Link2, Picker: ProfileLinkPicker },
    ],
    record: { place: (id, title) => ({ title: title?.trim() || "Social profile", source: entity(SOCIAL_PROFILE_KEY, id) }) },
    href: (s) => metaOf(s).url ?? null,
  },
  {
    key: SOCIAL_OUTLIER_FEED_KEY,
    surface: { name: SOCIAL_OUTLIER_FEED_SURFACE_NAME },
    comments: null,
    label: "Outlier feed",
    kindLabel: "outlier feed",
    icon: TrendingUp,
    group: "media",
    section: "social",
    accent: "orange",
    status: none("The feed re-reads every minute; it has no state of its own."),
    defaultSize: { w: 560, h: 640 },
    matches: ENTITY(SOCIAL_OUTLIER_FEED_KEY),
    Body: OutlierFeedBody,
    startNew: { label: "Outlier feed", icon: TrendingUp, create: () => ({ title: "Outlier feed", source: entity(SOCIAL_OUTLIER_FEED_KEY, null) }) },
  },
  {
    key: SOCIAL_AD_KEY,
    surface: { name: SOCIAL_AD_SURFACE_NAME },
    comments: null,
    label: "Ad",
    kindLabel: "ad",
    icon: Megaphone,
    group: "media",
    section: "social",
    accent: "amber",
    status: none("A stored ad has no running state."),
    defaultSize: { w: 520, h: 420 },
    matches: ENTITY(SOCIAL_AD_KEY),
    Body: SocialAdBody,
    bringIn: { label: "Ad from the library", Picker: AdPicker },
    record: { place: (id, title) => ({ title: title?.trim() || "Ad", source: entity(SOCIAL_AD_KEY, id) }) },
  },
  {
    key: SOCIAL_SWIPE_KEY,
    surface: { name: SOCIAL_SWIPE_SURFACE_NAME },
    comments: null,
    label: "Swipe collection",
    kindLabel: "swipe collection",
    icon: Images,
    group: "media",
    section: "social",
    accent: "violet",
    status: none("A collection has no running state."),
    defaultSize: { w: 480, h: 280 },
    matches: ENTITY(SOCIAL_SWIPE_KEY),
    Body: SwipeBody,
    bringIn: { label: "Swipe collection", Picker: SwipePicker },
    record: { place: (id, title) => ({ title: title?.trim() || "Swipe collection", source: entity(SOCIAL_SWIPE_KEY, id) }) },
  },
];
