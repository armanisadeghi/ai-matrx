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

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bookmark, ExternalLink, FileText, Images, Megaphone, PanelRightOpen, Sparkle, TrendingUp, UserRound, Wand2 } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { readOf } from "@ai-matrx/design-system";
import {
  useSurfaceClientTools,
  useSurfaceRuntimeRegistration,
} from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { useQuery } from "@tanstack/react-query";

import { Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/loaders/Spinner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  AdCreativeBlock,
  OutlierRowBlock,
  SocialPostBlock,
  SocialProfileBlock,
  SwipeCollectionBlock,
} from "@/components/mardown-display/blocks/social-kinds/social-kind-blocks";
import { PostDetailBody } from "@/features/marketing/social/components/PostDetail";
import { useMarketingBrandOptional } from "@/features/marketing/lib/brand-context";
import {
  useInvalidateSocial,
  usePostDetail,
  usePostTranscript,
  useProfile,
  useProfilePosts,
  useSwipeCollections,
} from "@/features/marketing/social/hooks";
import {
  adCreativeKind,
  outlierRowKindFromCard,
  postTranscriptKind,
  socialPostKind,
  socialProfileKind,
  swipeCollectionKind,
  type OutlierRowKind,
} from "@/features/marketing/social/kind-models";
import {
  addToCollection,
  analyzePost,
  createCollection,
  getTranscript,
  ingestPost,
  ingestProfile,
  socialErrorCode,
  socialErrorMessage,
} from "@/features/marketing/social/server";
import { classifySocialLink, type SocialLink } from "@/features/marketing/social/link";
import { SOCIAL_PLATFORM_LABELS, isSocialPlatform } from "@/features/marketing/social/types";
import {
  OUTLIER_FEED_LIMIT,
  readAd,
  readBrandOutliers,
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

function IngestState({ what, progress, error, onRetry }: { what: string; progress: string | null; error: string | null; onRetry: () => void }) {
  if (error) {
    return (
      <Centered>
        <p className="text-foreground">{error}</p>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </Centered>
    );
  }
  return (
    <Centered>
      <Spinner size="sm" className="text-muted-foreground" />
      <p>{progress ?? `Reading ${what}`}</p>
    </Centered>
  );
}

function IngestPostTile({ url, organizationId, onDone }: { url: string; organizationId: string; onDone: (postId: string) => void }) {
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      (e: unknown) => live && setError(socialErrorMessage(e, "Could not read that post.")),
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
  const [error, setError] = useState<string | null>(null);
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
      (e: unknown) => live && setError(socialErrorMessage(e, "Could not read that account.")),
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
      onRetry={() => {
        setError(null);
        setAttempt((n) => n + 1);
      }}
    />
  );
}

// ─── Social post ─────────────────────────────────────────────────────────────

/** The one set of post actions: the buttons and the agent's client tools run THESE. */
function usePostActions(args: { postId: string; organizationId: string; hasTranscript: boolean; openDetail: () => void }) {
  const { postId, organizationId } = args;
  const invalidate = useInvalidateSocial();
  const [busy, setBusy] = useState<string | null>(null);
  const [breakdownNote, setBreakdownNote] = useState<string | null>(null);

  async function transcript(): Promise<string> {
    if (args.hasTranscript) return "This post already has a transcript.";
    const ok = await confirm({
      title: "Get the transcript?",
      description: "Buys the transcript once, or transcribes the stored video. Costs about 1 credit.",
      confirmLabel: "Get transcript",
    });
    if (!ok) return "The person declined; nothing was spent.";
    setBusy("transcript");
    try {
      const outcome = await getTranscript(postId, { organizationId });
      await invalidate();
      return outcome.status === "available"
        ? `Transcript stored (${outcome.word_count ?? "?"} words).`
        : `No transcript could be made. ${outcome.notes.join(" ")}`.trim();
    } catch (e) {
      throw new Error(socialErrorMessage(e, "Could not get the transcript."));
    } finally {
      setBusy(null);
    }
  }

  async function breakdown(): Promise<string> {
    setBusy("breakdown");
    try {
      const result = await analyzePost(postId, { organizationId });
      setBreakdownNote(null);
      await invalidate();
      return result.summary ?? `Breakdown ${result.status}.`;
    } catch (e) {
      if (socialErrorCode(e) === "social_agent_not_built") {
        const note = "The breakdown agent is not built yet.";
        setBreakdownNote(note);
        return note;
      }
      throw new Error(socialErrorMessage(e, "Could not run the breakdown."));
    } finally {
      setBusy(null);
    }
  }

  async function saveToSwipe(): Promise<string> {
    setBusy("save");
    try {
      const existing = await import("@/features/marketing/social/service").then((m) => m.readSwipeCollections({ organizationId }));
      const id = existing[0]?.id ?? (await createCollection({ name: "Saved" }, { organizationId })).collection_id;
      await addToCollection(id, { itemType: "social_post", itemId: postId }, { organizationId });
      await invalidate();
      return "Saved to the swipe file.";
    } catch (e) {
      throw new Error(socialErrorMessage(e, "Could not save to the swipe file."));
    } finally {
      setBusy(null);
    }
  }

  return { busy, breakdownNote, transcript, breakdown, saveToSwipe, openDetail: args.openDetail };
}

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

function PostRecordBody({ id, source, title, onSource, organizationId }: ItemBodyProps & { id: string; organizationId: string }) {
  const brand = useMarketingBrandOptional();
  const detail = usePostDetail(id);
  const transcript = usePostTranscript(id);
  const [open, setOpen] = useState(false);
  const post = detail.data?.post ?? null;
  const handle = detail.data?.profile?.handle ?? null;
  const kind = post
    ? socialPostKind({
        post,
        stat: detail.data?.stat ?? null,
        handle,
        transcript: postTranscriptKind(id, transcript.data ?? null),
      })
    : null;
  const hasTranscript = Boolean(transcript.data?.text);
  const actions = usePostActions({ postId: id, organizationId, hasTranscript, openDetail: () => setOpen(true) });
  const wanted = post ? (handle ? `@${handle}` : `${SOCIAL_PLATFORM_LABELS[isSocialPlatform(post.platform) ? post.platform : "tiktok"]} post`) : null;
  useEffect(() => {
    if (wanted && wanted !== title) onSource(source, wanted);
  }, [wanted, title, source, onSource]);

  const values = createSocialPostScope(
    kind
      ? postScopeValues(kind)
      : detail.isError
        ? { post_loaded: false, load_error: detail.error instanceof Error ? detail.error.message : "Could not read the post." }
        : ({ post_loaded: false, not_loaded_yet: true } as never),
  );

  if (detail.isLoading) return <Busy label="Opening the post" />;
  if (!kind) {
    return (
      <Centered>
        <p className="text-foreground">{detail.isError ? "Could not read this post." : "This post is not stored yet."}</p>
        <Button variant="outline" onClick={() => void detail.refetch()}>
          Try again
        </Button>
      </Centered>
    );
  }
  return (
    <div className={FRAME}>
      <PostSurface values={values} actions={actions} />
      <SocialPostBlock serverData={kind} className="my-0" />
      <PostActionBar actions={actions} hasTranscript={hasTranscript} />
      <Drawer open={open} onOpenChange={setOpen} direction="right">
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="truncate text-sm">{wanted ?? "Post"}</DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="px-3 pb-4">
            {open ? <PostDetailBody postId={id} organizationId={organizationId} brandSeg={brand?.seg ?? ""} /> : null}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
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

/** The link box a picker and an empty tile (a template's) share. */
function LinkForm({ kind, onLink, onCancel }: { kind: "post" | "profile"; onLink: (link: SocialLink) => void; onCancel?: () => void }) {
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <form
      className="flex flex-col gap-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const link = classifySocialLink(value);
        if (!link || link.kind !== kind) return setBad(true);
        onLink(link);
      }}
    >
      <label className="text-sm font-medium text-foreground" htmlFor={`social-link-${kind}`}>
        {kind === "post" ? "Post link" : "Account link"}
      </label>
      <input
        id={`social-link-${kind}`}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setBad(false);
        }}
        placeholder={kind === "post" ? "tiktok.com/@name/video/..." : "tiktok.com/@name"}
        className="h-8 rounded-md border border-border bg-background px-2 text-base text-foreground"
      />
      {bad ? <p className="text-xs text-destructive">That is not a {kind === "post" ? "post" : "account"} link.</p> : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" disabled={!value.trim()}>
          {onCancel ? "Add to board" : "Read it"}
        </Button>
      </div>
    </form>
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

function ProfileRecordBody({ id, source, title, onSource }: ItemBodyProps & { id: string }) {
  const brand = useMarketingBrandOptional();
  const profile = useProfile(id);
  const posts = useProfilePosts(id, profile.data?.handle ?? null);
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
    <div className={FRAME}>
      <ProfileSurface values={values} openAccount={openAccount} />
      <SocialProfileBlock serverData={socialProfileKind(row)} className="my-0" />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">Top outliers</p>
        {accountHref ? (
          <Button variant="quiet" icon={<ExternalLink />} onClick={() => openAccount()}>
            Open account page
          </Button>
        ) : null}
      </div>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {posts.isLoading ? (
          <Busy label="Reading posts" />
        ) : outliers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No outlier posts yet.</p>
        ) : (
          outliers.map((o) => <OutlierRowBlock key={o.post_id} serverData={o} />)
        )}
      </div>
    </div>
  );
}

function SocialProfileBody(props: ItemBodyProps) {
  const organizationId = useBoardOrganizationId();
  const id = idOf(props.source, SOCIAL_PROFILE_KEY);
  const meta = metaOf(props.source);
  if (!organizationId) return <NeedsOrganization />;
  if (id) return <ProfileRecordBody key={id} id={id} {...props} />;
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
  const feed = useQuery({
    queryKey: ["board", "social-outlier-feed", organizationId, brandId],
    queryFn: () => readBrandOutliers({ organizationId: organizationId!, brandId: brandId! }),
    enabled: Boolean(organizationId && brandId),
    refetchInterval: 60_000,
  });
  const rows = feed.data ?? [];
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
    <div className={FRAME}>
      <FeedSurface values={values} />
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No outliers yet. Track accounts to fill the feed.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((o) => (
            <OutlierRowBlock key={o.post_id} serverData={o} />
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">Top {OUTLIER_FEED_LIMIT} by multiple of each account's median.</p>
    </div>
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
    <div className={FRAME}>
      <AdSurface values={values} />
      <AdCreativeBlock serverData={kind} className="my-0" />
    </div>
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
  const collection = useQuery({ queryKey: ["board", "social-swipe", id], queryFn: () => readSwipeCollection(id) });
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
    <div className={FRAME}>
      <SwipeSurface values={values} />
      <SwipeCollectionBlock serverData={kind} className="my-0" />
    </div>
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
    accent: "rose",
    status: none("A stored post has no running state; its numbers refresh from the Socials section."),
    defaultSize: { w: 620, h: 560 },
    matches: ENTITY(SOCIAL_POST_KEY),
    Body: SocialPostBody,
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
    accent: "rose",
    status: none("A stored account has no running state."),
    defaultSize: { w: 620, h: 700 },
    matches: ENTITY(SOCIAL_PROFILE_KEY),
    Body: SocialProfileBody,
    bringIn: { label: "Social profile from a link", Picker: ProfileLinkPicker },
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
    accent: "violet",
    status: none("A collection has no running state."),
    defaultSize: { w: 480, h: 280 },
    matches: ENTITY(SOCIAL_SWIPE_KEY),
    Body: SwipeBody,
    bringIn: { label: "Swipe collection", Picker: SwipePicker },
    record: { place: (id, title) => ({ title: title?.trim() || "Swipe collection", source: entity(SOCIAL_SWIPE_KEY, id) }) },
  },
];
