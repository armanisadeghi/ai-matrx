"use client";

/**
 * Social Intelligence — query hooks (TanStack Query, the marketing feature's
 * convention). Keys are namespaced `["marketing","social",...]` so a mutation
 * invalidates exactly the lists it changed.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  readAccountRows,
  readBrandSocialAccounts,
  readBrandSocialCounts,
  readAdvertiserAds,
  readAllSwipeCollections,
  readSwipeItems,
  readTrackedAdvertisers,
  readAgencySocial,
  readBrandSocialData,
  readKpiGoals,
  readWatchlistHits,
  readWatchlists,
  readPostAnalysis,
  readPostDetail,
  readPostMetricSnapshots,
  readPostTranscript,
  readProfile,
  readProfilePosts,
  readProfileSnapshots,
  readSwipeCollections,
  readTrackedForProfile,
} from "./service";

export const socialKeys = {
  all: ["marketing", "social"] as const,
  accounts: (orgId: string, brandId: string) =>
    ["marketing", "social", "accounts", orgId, brandId] as const,
  brandAccounts: (brandId: string) => ["marketing", "social", "brand-accounts", brandId] as const,
  brandCounts: (key: string) => ["marketing", "social", "brand-counts", key] as const,
  profile: (profileId: string) => ["marketing", "social", "profile", profileId] as const,
  tracked: (orgId: string, profileId: string) =>
    ["marketing", "social", "tracked", orgId, profileId] as const,
  profilePosts: (profileId: string) => ["marketing", "social", "posts", profileId] as const,
  profileSnapshots: (profileId: string) =>
    ["marketing", "social", "profile-snapshots", profileId] as const,
  post: (postId: string) => ["marketing", "social", "post", postId] as const,
  postMetrics: (postId: string) => ["marketing", "social", "post-metrics", postId] as const,
  transcript: (postId: string) => ["marketing", "social", "transcript", postId] as const,
  analysis: (orgId: string, postId: string) =>
    ["marketing", "social", "analysis", orgId, postId] as const,
  brandData: (orgId: string, brandId: string) =>
    ["marketing", "social", "brand-data", orgId, brandId] as const,
  watchlists: (brandId: string) => ["marketing", "social", "watchlists", brandId] as const,
  hits: (ids: readonly string[]) => ["marketing", "social", "hits", ...ids] as const,
  goals: (orgId: string, brandId: string) => ["marketing", "social", "goals", orgId, brandId] as const,
  agency: () => ["marketing", "social", "agency"] as const,
  swipeCollections: ["marketing", "social", "swipe-collections"] as const,
  swipeItems: (ids: string) => ["marketing", "social", "swipe-items", ids] as const,
  advertisers: ["marketing", "social", "advertisers"] as const,
  advertiserAds: (key: string) => ["marketing", "social", "advertiser-ads", key] as const,
  collections: (orgId: string) => ["marketing", "social", "collections", orgId] as const,
};

export function useAccountRows(organizationId: string, brandId: string) {
  return useQuery({
    queryKey: socialKeys.accounts(organizationId, brandId),
    queryFn: ({ signal }) => readAccountRows({ organizationId, brandId, signal }),
    enabled: Boolean(organizationId && brandId),
    staleTime: 30_000,
  });
}

/** The brand's ONE social-account list; the Overview card reads this, the Accounts table adds competitors. */
export function useBrandSocialAccounts(brandId: string) {
  return useQuery({
    queryKey: socialKeys.brandAccounts(brandId),
    queryFn: ({ signal }) => readBrandSocialAccounts(brandId, signal),
    enabled: Boolean(brandId),
    staleTime: 30_000,
  });
}

export function useBrandSocialCounts(brandIds: readonly string[]) {
  return useQuery({
    queryKey: socialKeys.brandCounts(brandIds.join(",")),
    queryFn: ({ signal }) => readBrandSocialCounts(brandIds, signal),
    enabled: brandIds.length > 0,
    staleTime: 30_000,
  });
}

export function useProfile(profileId: string) {
  return useQuery({
    queryKey: socialKeys.profile(profileId),
    queryFn: () => readProfile(profileId),
    staleTime: 30_000,
  });
}

export function useTrackedForProfile(organizationId: string, profileId: string) {
  return useQuery({
    queryKey: socialKeys.tracked(organizationId, profileId),
    queryFn: () => readTrackedForProfile({ organizationId, profileId }),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });
}

export function useProfilePosts(profileId: string, handle: string | null) {
  return useQuery({
    queryKey: socialKeys.profilePosts(profileId),
    queryFn: ({ signal }) => readProfilePosts({ profileId, handle, signal }),
    staleTime: 30_000,
  });
}

export function useProfileSnapshots(profileId: string) {
  return useQuery({
    queryKey: socialKeys.profileSnapshots(profileId),
    queryFn: () => readProfileSnapshots([profileId]),
    staleTime: 30_000,
  });
}

export function usePostDetail(postId: string | null) {
  return useQuery({
    queryKey: socialKeys.post(postId ?? ""),
    queryFn: () => readPostDetail(postId!),
    enabled: Boolean(postId),
    staleTime: 30_000,
  });
}

export function usePostMetrics(postId: string | null) {
  return useQuery({
    queryKey: socialKeys.postMetrics(postId ?? ""),
    queryFn: () => readPostMetricSnapshots(postId!),
    enabled: Boolean(postId),
    staleTime: 30_000,
  });
}

export function usePostTranscript(postId: string | null) {
  return useQuery({
    queryKey: socialKeys.transcript(postId ?? ""),
    queryFn: () => readPostTranscript(postId!),
    enabled: Boolean(postId),
    staleTime: 30_000,
  });
}

export function usePostAnalysis(organizationId: string, postId: string | null) {
  return useQuery({
    queryKey: socialKeys.analysis(organizationId, postId ?? ""),
    queryFn: () => readPostAnalysis(postId!, organizationId),
    enabled: Boolean(postId && organizationId),
    staleTime: 30_000,
  });
}

export function useSwipeCollections(organizationId: string) {
  return useQuery({
    queryKey: socialKeys.collections(organizationId),
    queryFn: () => readSwipeCollections({ organizationId }),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
  });
}

export function useBrandSocialData(organizationId: string, brandId: string) {
  return useQuery({
    queryKey: socialKeys.brandData(organizationId, brandId),
    queryFn: ({ signal }) => readBrandSocialData({ organizationId, brandId, signal }),
    enabled: Boolean(organizationId && brandId),
    staleTime: 30_000,
  });
}

export function useWatchlists(brandId: string) {
  return useQuery({
    queryKey: socialKeys.watchlists(brandId),
    queryFn: () => readWatchlists({ brandId }),
    enabled: Boolean(brandId),
    staleTime: 30_000,
  });
}

export function useWatchlistHits(savedViewIds: readonly string[]) {
  return useQuery({
    queryKey: socialKeys.hits(savedViewIds),
    queryFn: () => readWatchlistHits(savedViewIds),
    enabled: savedViewIds.length > 0,
    staleTime: 10_000,
  });
}

export function useKpiGoals(organizationId: string, brandId: string) {
  return useQuery({
    queryKey: socialKeys.goals(organizationId, brandId),
    queryFn: () => readKpiGoals({ organizationId, brandId }),
    enabled: Boolean(organizationId && brandId),
    staleTime: 30_000,
  });
}

export function useAgencySocial() {
  return useQuery({
    queryKey: socialKeys.agency(),
    queryFn: () => readAgencySocial({ outlierWindowDays: 30, minScore: 3 }),
    staleTime: 60_000,
  });
}

/** Every collection the person can see, live and archived. */
export function useAllSwipeCollections() {
  return useQuery({
    queryKey: socialKeys.swipeCollections,
    queryFn: () => readAllSwipeCollections(),
    staleTime: 30_000,
  });
}

/** Saved items of the given collections. */
export function useSwipeItems(collectionIds: readonly string[], enabled: boolean) {
  const key = [...collectionIds].sort().join(",");
  return useQuery({
    queryKey: socialKeys.swipeItems(key),
    queryFn: () => readSwipeItems(collectionIds),
    enabled,
    staleTime: 30_000,
  });
}

export function useTrackedAdvertisers() {
  return useQuery({
    queryKey: socialKeys.advertisers,
    queryFn: () => readTrackedAdvertisers(),
    staleTime: 30_000,
  });
}

export function useAdvertiserAds(args: { library: "meta" | "tiktok" | "google" | "linkedin"; advertiser: string; advertiserPlatformId: string | null } | null) {
  const key = args ? `${args.library}|${args.advertiserPlatformId ?? args.advertiser}` : "";
  return useQuery({
    queryKey: socialKeys.advertiserAds(key),
    queryFn: () => readAdvertiserAds(args!),
    enabled: Boolean(args),
    staleTime: 30_000,
  });
}

/** Invalidate everything social (after a track / refresh / ingest). */
export function useInvalidateSocial() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: socialKeys.all });
}
