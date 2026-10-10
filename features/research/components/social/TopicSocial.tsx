"use client";

// /research/topics/[topicId]/social — what the social capture lane found for a typed subject:
// each handle's profile, its posts with outlier multiples, the measured speaking style, and the
// door into a brand's Socials to keep tracking the creator. Reads what the pipeline recorded
// (rs_source.metadata.social, rs_topic.metadata.social_capture / subject_voice); nothing here runs
// the lane. Posts render with the marketing feature's own card and badge — imported, not forked.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BadgeCheck, LayoutGrid, Mic, UserRound } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger, ReadFailure, Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { BrandPicker } from "@/features/marketing/components/brands/BrandPicker";
import { PlatformMark, platformLabel } from "@/features/marketing/social/components/PlatformMark";
import { SocialPostCard } from "@/features/marketing/social/components/SocialPostCard";
import { formatCompact } from "@/features/marketing/social/outlier";
import { findCachedAccount } from "@/features/marketing/social/account-lookup";
import { isSocialPlatform } from "@/features/marketing/social/types";
import { useRefusedRead } from "@/features/marketing/social/gated/RefusedReadOffer";
import { GUIDED_CAPTURE_PLATFORMS } from "@/features/marketing/social/gated/guidedJob";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { isJsonObject } from "@/types/json";
import { useTopicContext } from "../../context/ResearchContext";
import { PageSurfaceMenu } from "@/features/context-menu-v3/PageSurfaceMenu";
import { useSurfaceScopeContribution } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { createResearchScope } from "@/features/surfaces/manifests/research.manifest";
import { getSources } from "../../service";
import type { ResearchSource } from "../../types";
import {
  socialCaptureOf,
  socialFactsOf,
  socialPostCardModel,
  subjectVoiceOf,
  type SocialSourceFacts,
} from "../../utils/socialSource";

const SOCIAL_SOURCE_LIMIT = 1000;

function Section({
  icon: Icon,
  title,
  count,
  action,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  count?: number;
  /** Sits with the section's title, on its right. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex h-9 items-center gap-1.5 border-b border-border px-2.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="type-secondary font-semibold uppercase tracking-wider text-foreground">{title}</h2>
        {count !== undefined && (
          <span className="type-secondary tabular-nums text-muted-foreground">{count}</span>
        )}
        {action ? <span className="ml-auto">{action}</span> : null}
      </header>
      <div className="p-2.5">{children}</div>
    </section>
  );
}

interface Handle {
  platform: string;
  handle: string;
}

function handlesOf(subject: unknown): Handle[] {
  if (!isJsonObject(subject) || !isJsonObject(subject.handles)) return [];
  return Object.entries(subject.handles).flatMap(([platform, handle]) =>
    typeof handle === "string" && handle.trim() ? [{ platform, handle: handle.trim().replace(/^@/, "") }] : [],
  );
}

/** A display name a person can read: a scraper's "…" or an empty string is no name at all. */
function readableName(name: string | null | undefined): string | null {
  const t = name?.trim();
  return t && /[\p{L}\p{N}]/u.test(t) ? t : null;
}

function trackHref(brandId: string, text: string): string {
  return `${marketingRoutes.brandSocials(brandId)}/accounts?track=${encodeURIComponent(text)}`;
}

const TRACK_CLASS = "inline-flex items-center gap-0.5 type-meta font-medium text-primary-ink hover:underline";

/**
 * "Track in Socials": straight to the topic's brand when it has one; otherwise the person picks
 * the brand right here and lands on that brand's Socials Accounts with the Track dialog open
 * and this profile already typed in.
 */
function TrackInSocials({ brandId, url }: { brandId: string | null; url: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (brandId) {
    return (
      <Link href={trackHref(brandId, url)} className={TRACK_CLASS}>
        Track in Socials <ArrowUpRight className="h-3 w-3" />
      </Link>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={TRACK_CLASS}>
          Track in Socials <ArrowUpRight className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — a brand picker needs a steady measure */
        align="start"
        className="w-64 p-3"
      >
        <BrandPicker
          organizationId={null}
          value={null}
          label="Track in which brand?"
          onChange={(id) => {
            if (!id) return;
            setOpen(false);
            router.push(trackHref(id, url));
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * A profile's name opens the in-app account page when the profile is in our store and the topic has a
 * brand to open it under; otherwise it opens the profile on its own platform. Never plain text.
 */
function ProfileName({ brandId, platform, handle, name, externalUrl }: { brandId: string | null; platform: string; handle: string; name: string; externalUrl: string }) {
  const [profileId, setProfileId] = useState<string | null>(null);
  useEffect(() => {
    if (!brandId || !isSocialPlatform(platform)) return;
    let cancelled = false;
    findCachedAccount({ platform, handle })
      .then((found) => {
        if (!cancelled) setProfileId(found?.profileId ?? null);
      })
      .catch(() => {
        if (!cancelled) setProfileId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, platform, handle]);
  const className = "min-w-0 truncate type-title hover:underline";
  if (brandId && profileId) {
    return (
      <Link href={`${marketingRoutes.brandSocials(brandId)}/${platform}/${profileId}`} className={className}>
        {name}
      </Link>
    );
  }
  return (
    <a href={externalUrl} target="_blank" rel="noopener noreferrer" className={className}>
      {name}
    </a>
  );
}

export default function TopicSocial() {
  const { topicId, topic } = useTopicContext();
  const [sources, setSources] = useState<ResearchSource[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSources(await getSources(topicId, { source_type: "social", limit: SOCIAL_SOURCE_LIMIT }));
    } catch (e) {
      setError(e);
    }
  }, [topicId]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(
    () =>
      (sources ?? []).flatMap((source) => {
        const facts = socialFactsOf(source);
        return facts ? [{ source, facts }] : [];
      }),
    [sources],
  );
  const profiles = items.filter((i) => i.facts.kind === "profile");
  const posts = useMemo(
    () =>
      items
        .filter((i) => i.facts.kind === "post")
        .map((i) => socialPostCardModel(i.source, i.facts))
        .sort((a, b) => (b.outlierScore ?? -1) - (a.outlierScore ?? -1)),
    [items],
  );

  const { open: openCapture, node: captureNode } = useRefusedRead(topic?.organization_id ?? "", () => void load());
  const handles = handlesOf(topic?.subject);
  const capture = socialCaptureOf(topic?.metadata);
  const voice = subjectVoiceOf(topic?.metadata);
  const brandId =
    topic && isJsonObject(topic.subject) && typeof topic.subject.brand_id === "string"
      ? topic.subject.brand_id
      : null;
  const profileFor = (h: Handle): { source: ResearchSource; facts: SocialSourceFacts } | undefined =>
    profiles.find((p) => p.facts.platform === h.platform && p.facts.handle.toLowerCase() === h.handle.toLowerCase());

  // The agent surface: the Social tab's profiles and posts join the topic's `matrx-user/research`
  // scope while this tab is open (from the rows already rendered, never a fetch).
  useSurfaceScopeContribution("matrx-user/research", "topic-social", () =>
    createResearchScope({
      social_loaded: sources !== null,
      social_profiles: handles.map((h) => {
        const found = profileFor(h);
        return {
          platform: h.platform,
          handle: h.handle,
          display_name: readableName(found?.facts.displayName) ?? null,
          followers: found?.facts.followers ?? null,
          following: found?.facts.following ?? null,
          verified: found?.facts.verified ?? null,
          captured: Boolean(found),
          url: found?.source.url ?? null,
        };
      }),
      social_posts: posts.slice(0, 60).map((p) => ({
        post_id: p.postId,
        platform: p.platform,
        handle: p.handle,
        hook: p.hookLine,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        multiple: p.outlierScore,
        posted_at: p.postedAt,
        url: p.url,
      })),
    }),
  );

  return (
    <PageSurfaceMenu sourceFeature="research">
    <div className="matrx-touch-targets h-full overflow-y-auto px-3 pb-8 pt-3">
      <div className="mx-auto max-w-5xl space-y-4">
        <Section
          icon={UserRound}
          title="Profiles"
          // read-gate-exempt: handles come from the topic subject record, not a read of their own
          count={handles.length}
          action={
            brandId === null && handles.length > 0 ? (
              <Button asChild variant="outline">
                <Link href={marketingRoutes.brands()}>Choose a brand to track in</Link>
              </Button>
            ) : null
          }
        >
          {error != null && sources === null ? (
            <ReadFailure error={error} what="the captured social profiles" onRetry={() => void load()} className="m-0" />
          ) : sources === null ? (
            <Skeleton className="h-16 w-full rounded" />
          ) : handles.length === 0 ? (
            <p className="py-2 text-center type-secondary text-muted-foreground">This subject has no social handles.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {handles.map((h) => {
                const found = profileFor(h);
                const record = capture?.handles.find((c) => c.platform === h.platform);
                const url = found?.source.url ?? `https://www.${h.platform}.com/${h.platform === "tiktok" ? "@" : ""}${h.handle}`;
                return (
                  <div key={h.platform} className="flex gap-2.5 rounded-md border border-border/60 p-2.5">
                    <PlatformMark platform={h.platform} size={28} />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <ProfileName
                          brandId={brandId}
                          platform={h.platform}
                          handle={h.handle}
                          name={readableName(found?.facts.displayName) ?? `@${h.handle}`}
                          externalUrl={url}
                        />
                        {found?.facts.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Verified" />}
                      </div>
                      <div className="type-meta text-muted-foreground">
                        {platformLabel(h.platform)} · @{h.handle}
                      </div>
                      {found ? (
                        <div className="type-secondary tabular-nums">
                          {found.facts.followers === null ? "—" : formatCompact(found.facts.followers)} followers
                          {found.facts.following !== null && (
                            <span className="text-muted-foreground"> · {formatCompact(found.facts.following)} following</span>
                          )}
                        </div>
                      ) : (
                        <div className="type-secondary text-muted-foreground">
                          {record?.error ?? (record ? `Capture ${record.status}` : "Not captured yet")}
                        </div>
                      )}
                      {found?.facts.bio && (
                        <p className="line-clamp-3 whitespace-pre-line type-meta text-muted-foreground">{found.facts.bio}</p>
                      )}
                      <div className="flex flex-wrap gap-3 pt-1">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 type-meta text-muted-foreground hover:text-foreground"
                        >
                          Open profile <ArrowUpRight className="h-3 w-3" />
                        </a>
                        <TrackInSocials brandId={brandId} url={url} />
                        {!found && topic?.organization_id && GUIDED_CAPTURE_PLATFORMS.has(h.platform) ? (
                          <button
                            type="button"
                            className={TRACK_CLASS}
                            onClick={() =>
                              openCapture({ platform: h.platform, handleOrUrl: url, ...(brandId ? { brandId } : {}) })
                            }
                          >
                            Capture with my browser
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section icon={LayoutGrid} title="Posts" count={posts.length}>
          {sources === null ? (
            <Skeleton className="h-40 w-full rounded" />
          ) : posts.length === 0 ? (
            <p className="py-2 text-center type-secondary text-muted-foreground">No posts captured yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {posts.map((p) => (
                <SocialPostCard
                  key={p.postId}
                  post={p}
                  onOpen={(post) => window.open(post.url, "_blank", "noopener,noreferrer")}
                />
              ))}
            </div>
          )}
        </Section>

        <Section icon={Mic} title="Speaking style">
          {voice === null ? (
            <p className="py-2 text-center type-secondary text-muted-foreground">Not measured yet.</p>
          ) : voice.status === "measured" ? (
            <div className="space-y-2">
              {voice.summary && <p className="type-body">{voice.summary}</p>}
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {voice.traits.map((t) => (
                  <div key={t.label} className="flex gap-2 type-secondary">
                    <dt className="w-36 shrink-0 capitalize text-muted-foreground">{t.label}</dt>
                    <dd className="min-w-0 break-words">{t.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="type-meta tabular-nums text-muted-foreground">
                {/* read-gate-exempt: a missing figure renders a dash */}
                {voice.sampleCount ?? "—"} posts · {voice.wordCount ?? "—"} words
                {voice.confidence !== null && ` · confidence ${Math.round(voice.confidence * 100)}%`}
              </p>
            </div>
          ) : (
            <p className="py-2 text-center type-secondary text-muted-foreground">
              {voice.reason ?? voice.summary ?? `Speaking style: ${voice.status.replace(/_/g, " ")}`}
            </p>
          )}
        </Section>

      </div>
      {captureNode}
    </div>
    </PageSurfaceMenu>
  );
}
