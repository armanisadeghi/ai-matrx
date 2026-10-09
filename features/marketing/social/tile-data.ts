"use client";

/**
 * The reads the Board's social tiles need beyond the Socials section's own (`service.ts`): one ad,
 * one swipe collection, the stored ads a picker lists, and a brand's outlier feed. Direct Supabase
 * reads under RLS, `readAllRows` on nothing unbounded (every list here has a hard cap and says so).
 */

import { supabase } from "@/utils/supabase/client";

import { outlierRowKind, type OutlierRowKind } from "./kind-models";
import { readProfiles } from "./service";
import type {
  PostStatRow,
  SocialAdRow,
  SocialPostRow,
  SwipeCollectionRow,
  TrackedAccountRow,
} from "./types";

function fail(label: string, message: string): never {
  throw new Error(`${label}: ${message}`);
}

export async function readAd(adId: string): Promise<SocialAdRow | null> {
  const { data, error } = await supabase.schema("social").from("ad").select("*").eq("id", adId).maybeSingle();
  if (error) fail("social.ad read", error.message);
  return (data as SocialAdRow | null) ?? null;
}

/** The newest stored ads, for the "bring in an ad" picker (capped; the Ads tab searches the libraries). */
export const AD_PICKER_LIMIT = 60;
export async function readRecentAds(): Promise<SocialAdRow[]> {
  const { data, error } = await supabase
    .schema("social")
    .from("ad")
    .select("*")
    .is("deleted_at", null)
    .order("first_seen_at", { ascending: false })
    .limit(AD_PICKER_LIMIT);
  if (error) fail("social.ad list", error.message);
  return (data ?? []) as SocialAdRow[];
}

export async function readSwipeCollection(collectionId: string): Promise<SwipeCollectionRow | null> {
  const { data, error } = await supabase
    .schema("social")
    .from("swipe_collection")
    .select("*")
    .eq("id", collectionId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) fail("social.swipe_collection read", error.message);
  return (data as SwipeCollectionRow | null) ?? null;
}

/** Rows an outlier feed lists at most. */
export const OUTLIER_FEED_LIMIT = 12;

interface StatWithPost extends PostStatRow {
  post: SocialPostRow;
}

/**
 * A brand's outlier feed: the best posts, by multiplier against their own account's median, across the
 * accounts the brand tracks (its own, and the organization-wide ones no brand has claimed yet).
 */
export async function readBrandOutliers(args: {
  organizationId: string;
  brandId: string;
  limit?: number;
}): Promise<OutlierRowKind[]> {
  const tracked = await supabase
    .schema("social")
    .from("tracked_account")
    .select("profile_id, role, brand_id")
    .eq("organization_id", args.organizationId)
    .is("deleted_at", null)
    .or(`brand_id.eq.${args.brandId},brand_id.is.null`);
  if (tracked.error) fail("social.tracked_account list", tracked.error.message);
  const accounts = (tracked.data ?? []) as Pick<TrackedAccountRow, "profile_id" | "role" | "brand_id">[];
  if (accounts.length === 0) return [];
  const roleOf = new Map(accounts.map((a) => [a.profile_id, a.role]));
  const stats = await supabase
    .schema("social")
    .from("post_stat")
    .select("*, post:post!inner(*)")
    .in("post.profile_id", [...roleOf.keys()])
    .is("post.deleted_at", null)
    .not("outlier_score", "is", null)
    .order("outlier_score", { ascending: false })
    .limit(args.limit ?? OUTLIER_FEED_LIMIT);
  if (stats.error) fail("social.post_stat outliers", stats.error.message);
  const rows = (stats.data ?? []) as unknown as StatWithPost[];
  const profiles = await readProfiles([...new Set(rows.map((r) => r.post.profile_id).filter((x): x is string => !!x))]);
  const handleOf = new Map(profiles.map((p) => [p.id, p.handle]));
  return rows.flatMap((r) => {
    const row = outlierRowKind({
      post: r.post,
      stat: r,
      handle: r.post.profile_id ? (handleOf.get(r.post.profile_id) ?? null) : null,
      role: r.post.profile_id ? (roleOf.get(r.post.profile_id) ?? null) : null,
    });
    return row ? [row] : [];
  });
}
