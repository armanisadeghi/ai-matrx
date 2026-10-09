"use client";

/**
 * A person brand's face on Overview: the stored avatar of their biggest own
 * account (the same `social.brand_social_accounts` read the Social profiles card
 * uses, so one cache), with the follower total across their accounts.
 * Falls back to whatever the caller draws (the brand's logo mark) until an
 * account with a picture exists.
 */

import type { ReactNode } from "react";
import { formatCount } from "@ai-matrx/kit/format";
import { useBrandSocialAccounts } from "@/features/marketing/social/hooks";
import { profileAvatarDoor } from "@/features/marketing/social/server";
import { SocialImage } from "@/features/marketing/social/components/SocialImage";
import type { AccountRow } from "@/features/marketing/social/types";

/** The account whose picture stands for the person: their own, most followed, with a picture. Pure. */
export function personFaceAccount(rows: readonly AccountRow[]): AccountRow | null {
  const own = rows.filter((r) => r.role === "own" && r.profileId && (r.avatarFileId || r.avatarUrl || r.avatarHint));
  if (own.length === 0) return null;
  return [...own].sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1))[0] ?? null;
}

/** Followers across their own accounts; null when none is known. Pure. */
export function personFollowerTotal(rows: readonly AccountRow[]): number | null {
  const known = rows.filter((r) => r.role === "own" && r.followers != null);
  return known.length ? known.reduce((sum, r) => sum + (r.followers ?? 0), 0) : null;
}

export function PersonBrandAvatar({
  brandId,
  size,
  fallback,
}: {
  brandId: string;
  size: number;
  fallback: ReactNode;
}) {
  const accounts = useBrandSocialAccounts(brandId);
  const face = personFaceAccount(accounts.data ?? []);
  if (!face?.profileId) return <>{fallback}</>;
  return (
    // The box is fixed so the hero never shifts when the picture arrives.
    <span className="block shrink-0 overflow-hidden rounded-full border border-border" style={{ width: size, height: size }}>
      <SocialImage
        door={face.avatarFileId ? profileAvatarDoor(face.profileId) : null}
        url={face.avatarHint ?? face.avatarUrl}
        alt={face.displayName}
        className="h-full w-full object-cover"
        fallback={fallback}
      />
    </span>
  );
}

export function PersonFollowerTotal({ brandId }: { brandId: string }) {
  const accounts = useBrandSocialAccounts(brandId);
  const total = personFollowerTotal(accounts.data ?? []);
  if (total == null) return null;
  return <span className="text-xs text-muted-foreground">{formatCount(total)} followers</span>;
}
