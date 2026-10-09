"use client";

/**
 * Social Intelligence — query hooks (TanStack Query, the marketing feature's
 * convention). Keys are namespaced `["marketing","social",...]` so a mutation
 * invalidates exactly the lists it changed.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  readAccountRows,
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

/** Invalidate everything social (after a track / refresh / ingest). */
export function useInvalidateSocial() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: socialKeys.all });
}
