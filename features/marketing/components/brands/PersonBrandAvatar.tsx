"use client";

/**
 * A person brand's face on Overview: the picture of their most-followed own
 * account and the follower total across their accounts.
 *
 * Reads the brand's ONE account list (`social.brand_social_accounts`, the same
 * cache the Social profiles card uses). An account that is listed but not
 * tracked yet carries no profile there, so its stored profile (fetched when the
 * brand was created from the handle) is found by platform + handle. Falls back
 * to whatever the caller draws (the brand's logo mark) when no picture exists.
 */

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCount } from "@ai-matrx/kit/format";
import { supabase } from "@/utils/supabase/client";
import { useBrandSocialAccounts } from "@/features/marketing/social/hooks";
import { profileAvatarDoor } from "@/features/marketing/social/server";
import { SocialImage } from "@/features/marketing/social/components/SocialImage";
import type { AccountRow } from "@/features/marketing/social/types";

export interface PersonFace {
  profileId: string;
  displayName: string;
  avatarFileId: string | null;
  avatarUrl: string | null;
  followers: number | null;
  platform: string;
  handle: string;
}

/** The brand's own accounts as faces: one per account, the stored profile when the list has none. Pure. */
export function personFaces(rows: readonly AccountRow[], profiles: readonly PersonFace[]): PersonFace[] {
  const byKey = new Map(profiles.map((p) => [`${p.platform}:${p.handle.toLowerCase()}`, p]));
  const faces: PersonFace[] = [];
  for (const r of rows) {
    if (r.role !== "own") continue;
    if (r.profileId) {
      faces.push({
        profileId: r.profileId,
        displayName: r.displayName,
        avatarFileId: r.avatarFileId ?? null,
        avatarUrl: r.avatarHint ?? r.avatarUrl,
        followers: r.followers,
        platform: r.platform,
        handle: r.handle,
      });
      continue;
    }
    const stored = byKey.get(`${r.platform}:${r.handle.replace(/^@/, "").toLowerCase()}`);
    if (stored) faces.push(stored);
  }
  return faces;
}

/** The face that stands for the person: most followed, with a picture. Pure. */
export function personFace(faces: readonly PersonFace[]): PersonFace | null {
  const pictured = faces.filter((f) => f.avatarFileId || f.avatarUrl);
  return [...pictured].sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1))[0] ?? null;
}

/** Followers across their accounts; null when none is known. Pure. */
export function personFollowerTotal(faces: readonly PersonFace[]): number | null {
  const known = faces.filter((f) => f.followers != null);
  return known.length ? known.reduce((sum, f) => sum + (f.followers ?? 0), 0) : null;
}

function usePersonFaces(brandId: string): PersonFace[] {
  const accounts = useBrandSocialAccounts(brandId);
  const missing = (accounts.data ?? []).filter((r) => r.role === "own" && !r.profileId && r.handle);
  const key = missing.map((r) => `${r.platform}:${r.handle}`).sort().join(",");
  const stored = useQuery({
    queryKey: ["marketing", "person-brand", "faces", brandId, key],
    enabled: missing.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const filter = missing
        .map((r) => `and(platform.eq.${r.platform},handle.eq.${r.handle.replace(/^@/, "").replace(/[,()]/g, "")})`)
        .join(",");
      const { data, error } = await supabase
        .schema("social")
        .from("social_profile")
        .select("id, platform, handle, display_name, avatar_file_id, avatar_url, follower_count")
        .is("deleted_at", null)
        .or(filter)
        .limit(50)
        .abortSignal(signal);
      if (error) throw new Error(`Their profiles could not be read: ${error.message}`);
      return (data ?? []).map(
        (p): PersonFace => ({
          profileId: p.id,
          displayName: p.display_name ?? p.handle ?? "",
          avatarFileId: p.avatar_file_id,
          avatarUrl: p.avatar_url,
          followers: p.follower_count,
          platform: p.platform,
          handle: p.handle ?? "",
        }),
      );
    },
  });
  return personFaces(accounts.data ?? [], stored.data ?? []);
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
  const face = personFace(usePersonFaces(brandId));
  if (!face) return <>{fallback}</>;
  return (
    // The box is fixed so the hero never shifts when the picture arrives.
    <span
      className="relative block shrink-0 overflow-hidden rounded-full border border-border"
      style={{ width: size, height: size }}
    >
      <SocialImage
        door={face.avatarFileId ? profileAvatarDoor(face.profileId) : null}
        url={face.avatarUrl}
        alt={face.displayName}
        className="h-full w-full object-cover"
        fallback={fallback}
      />
    </span>
  );
}

export function PersonFollowerTotal({ brandId }: { brandId: string }) {
  const total = personFollowerTotal(usePersonFaces(brandId));
  if (total == null) return null;
  return <span className="text-xs text-muted-foreground">{formatCount(total)} followers</span>;
}
