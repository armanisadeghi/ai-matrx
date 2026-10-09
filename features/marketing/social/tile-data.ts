"use client";

/**
 * The reads the Board's social tiles need beyond the Socials section's own (`service.ts`): one ad,
 * one swipe collection, the stored ads a picker lists, and a brand's outlier feed. Reads under RLS
 * through `@ai-matrx/data` doors (`lib/db/generated/social.ts`); every list here is complete or has a
 * hard cap and says so. The outlier feed's joined read (`post_stat` + `post!inner`) has no door shape
 * yet and stays a direct read until it does.
 */

import { listAll, page, read } from "@ai-matrx/data/db";

import { browserDb } from "@/lib/db/browser-db";
import { ad, swipeCollection, trackedAccount } from "@/lib/db/generated/social";
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
  // An ad a tile already holds opens even after it left the library (the old read had no deleted filter).
  const row = await read(browserDb, ad, adId, { includeDeleted: true }).catch((e: unknown) => fail("social.ad read", errorText(e)));
  return (row as SocialAdRow | null) ?? null;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The newest stored ads, for the "bring in an ad" picker (capped; the Ads tab searches the libraries). */
export const AD_PICKER_LIMIT = 60;
export async function readRecentAds(): Promise<SocialAdRow[]> {
  const { rows } = await page(browserDb, ad, { from: 0, to: AD_PICKER_LIMIT - 1, orderBy: "first_seen_at", ascending: false }).catch(
    (e: unknown) => fail("social.ad list", errorText(e)),
  );
  return rows as unknown as SocialAdRow[];
}

export async function readSwipeCollection(collectionId: string): Promise<SwipeCollectionRow | null> {
  const row = await read(browserDb, swipeCollection, collectionId).catch((e: unknown) => fail("social.swipe_collection read", errorText(e)));
  return (row as SwipeCollectionRow | null) ?? null;
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
  const accounts = (await listAll(
    browserDb,
    trackedAccount,
    (q) => q.eq("organization_id", args.organizationId).or(`brand_id.eq.${args.brandId},brand_id.is.null`),
    { columns: ["profile_id", "role", "brand_id"] },
  ).catch((e: unknown) => fail("social.tracked_account list", errorText(e)))) as Pick<TrackedAccountRow, "profile_id" | "role" | "brand_id">[];
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
