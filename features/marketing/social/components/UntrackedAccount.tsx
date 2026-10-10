"use client";

/**
 * The page for a social account no one has tracked yet — `/socials/<platform>/<propertyId>`.
 * It names the account, says it is not tracked, shows what the shared cache already knows about it
 * (avatar, bio, followers, recent posts), and offers Track with its cost in points; once tracked it
 * moves to the account's real page. A property id that is not one of this brand's accounts is "not found".
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Loader2, Plus } from "lucide-react";

import { Badge, Button, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { formatSocialHandle } from "@/features/marketing/lib/social-handle";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { accountLabels } from "../mappers";
import { findCachedAccount } from "../account-lookup";
import { readProfile, readProfilePosts } from "../service";
import { formatCompact } from "../outlier";
import { profileAvatarDoor } from "../server";
import { useCanEditSocial } from "../useCanEditSocial";
import { useOpenPost } from "../useOpenPost";
import { isSocialPlatform } from "../types";
import { SocialImage } from "./SocialImage";
import { SocialPostCard } from "./SocialPostCard";
import { useBrandSocialAccounts } from "../hooks";
import { accountHref } from "../account-href";
import { PlatformMark, platformLabel } from "./PlatformMark";
import { trackableOwn, useTrackOwn } from "./useTrackOwn";

export function UntrackedAccount({ platform, propertyId }: { platform: string; propertyId: string }) {
  const brand = useMarketingBrand();
  const router = useRouter();
  const canEdit = useCanEditSocial();
  const accounts = useBrandSocialAccounts(brand.id);
  const { busyRow, progress, trackOwn, pointsText } = useTrackOwn(brand.organizationId, brand.id);
  const row = (accounts.data ?? []).find((r) => r.propertyId === propertyId) ?? null;
  const profileHref = row ? accountHref(brand.seg, row) : null;

  const openPost = useOpenPost();
  // What the shared cache already knows about this account (free reads; nothing is fetched or spent).
  const cached = useQuery({
    queryKey: ["marketing", "social", "untracked-preview", row?.platform, row?.handle],
    enabled: Boolean(row && isSocialPlatform(row.platform) && row.handle),
    queryFn: async () => {
      if (!row || !isSocialPlatform(row.platform)) return null;
      const found = await findCachedAccount({ platform: row.platform, handle: row.handle });
      if (!found) return null;
      const [profile, posts] = await Promise.all([
        readProfile(found.profileId),
        readProfilePosts({ profileId: found.profileId, handle: row.handle }),
      ]);
      return { found, bio: profile?.bio?.trim() || null, posts: posts.slice(0, 6) };
    },
    staleTime: 60_000,
  });

  // Tracked from here (or elsewhere): the account has a profile now, so open it.
  useEffect(() => {
    if (profileHref) router.replace(profileHref);
  }, [profileHref, router]);

  if (accounts.isLoading || profileHref) return <RegionSkeleton shape="cards" count={1} />;
  if (accounts.isError || !row) {
    return (
      <div className="flex flex-col items-start gap-2 p-3">
        <p className="text-sm text-foreground">{accounts.isError ? "Couldn't load this account" : "Account not found"}</p>
        <Button variant="outline" asChild>
          <Link href={marketingRoutes.brandSocials(brand.seg)}>Back to Socials</Link>
        </Button>
      </div>
    );
  }

  const labels = accountLabels(row.displayName, row.handle, row.platform);
  const handle = formatSocialHandle({ platform: row.platform, handle: row.handle, url: row.profileUrl });
  const busy = busyRow === row.rowId;
  const preview = cached.data;
  return (
    <div className="flex flex-col gap-3 p-3" data-testid="untracked-account">
    <div className="flex min-h-9 flex-wrap items-center gap-2">
      <Button variant="quiet" className="matrx-tap-area" icon={<ArrowLeft />} aria-label="Back" onClick={() => router.back()} />
      <PlatformMark platform={row.platform} size={28} />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold text-foreground">{labels.primary}</span>
        <span className="truncate text-xs text-muted-foreground">
          {progress ?? [platformLabel(platform), labels.secondary ? handle : null].filter(Boolean).join(" · ")}
        </span>
      </div>
      <Badge tone="warning">Not tracked</Badge>
      <span className="ml-auto flex items-center gap-1">
        {!canEdit ? null : trackableOwn(row) ? (
          <Button
            variant="outline"
            icon={busy ? <Loader2 className="animate-spin" /> : <Plus />}
            disabled={busyRow !== null}
            meta={pointsText("track", 1) ?? undefined}
            onClick={() => void trackOwn(row)}
          >
            {busy ? "Tracking…" : "Track"}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {row.trackable === false ? `${platformLabel(row.platform)} tracking is coming` : "Needs a handle"}
          </span>
        )}
        {row.externalUrl ? (
          <Button variant="quiet" asChild icon={<ExternalLink />}>
            <a href={row.externalUrl} target="_blank" rel="noreferrer">
              Open on {platformLabel(row.platform)}
            </a>
          </Button>
        ) : null}
      </span>
    </div>
    {canEdit ? <p className="text-sm text-muted-foreground">Tracking adds post history, growth and outliers.</p> : null}
    {cached.isLoading ? <RegionSkeleton shape="cards" count={1} aria-label="Checking what we know about this account" /> : null}
    {preview ? (
      <section aria-label="Public profile" className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
            <SocialImage
              door={preview.found.hasStoredAvatar ? profileAvatarDoor(preview.found.profileId) : null}
              url={preview.found.avatarUrl}
              alt={preview.found.displayName}
              fallback={null}
            />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-foreground">
              {preview.found.followers != null ? `${formatCompact(preview.found.followers)} followers` : "Followers unknown"}
            </span>
            {preview.bio ? <p className="line-clamp-3 text-sm text-muted-foreground">{preview.bio}</p> : null}
          </div>
        </div>
        {preview.posts.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {preview.posts.map((post) => (
              <SocialPostCard key={post.postId} post={post} onOpen={openPost} />
            ))}
          </div>
        ) : null}
      </section>
    ) : null}
    </div>
  );
}
